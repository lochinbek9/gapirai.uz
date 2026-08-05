"""
TTS Provider Benchmark — barcha provayderlarni taqqoslaydi.

Ishlatish:
    PYTHONPATH=. python -m backend.scripts.benchmark_tts
    PYTHONPATH=. python -m backend.scripts.benchmark_tts --providers elevenlabs,azure,edge
    PYTHONPATH=. python -m backend.scripts.benchmark_tts --text "O'z matnni kiriting"
"""
import argparse
import json
import os
import sys
import time
import tempfile
from dataclasses import dataclass, asdict
from pathlib import Path

# Ensure project root on path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

TEST_TEXT_UZ = (
    "Sun'iy intellekt bizning hayotimizni tubdan o'zgartirmoqda. "
    "Hozirgi kunda mashinalar inson kabi gapira oladi, yoza oladi va fikr yurita oladi. "
    "Bu texnologiya kelajakda yanada rivojlanadi va insoniyatga yangi imkoniyatlar yaratadi."
)

@dataclass
class BenchmarkResult:
    provider: str
    success: bool
    latency_ms: float
    audio_duration_ms: float
    audio_size_bytes: int
    chars: int
    cost_usd: float
    cost_per_char_usd: float
    chars_per_second: float
    error: str = ""


def _get_audio_duration_ms(wav_path: str) -> float:
    """ffprobe bilan audio davomiyligini aniqlash."""
    try:
        import subprocess, json
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "json", wav_path,
            ],
            capture_output=True, text=True, check=True,
        )
        data = json.loads(result.stdout)
        return float(data["format"]["duration"]) * 1000
    except Exception:
        return 0.0


def benchmark_provider(provider_name: str, text: str) -> BenchmarkResult:
    from backend.services.tts.factory import get_provider
    
    try:
        provider = get_provider(provider_name)
    except Exception as e:
        return BenchmarkResult(
            provider=provider_name, success=False,
            latency_ms=0, audio_duration_ms=0,
            audio_size_bytes=0, chars=len(text),
            cost_usd=0, cost_per_char_usd=0, chars_per_second=0,
            error=f"Provider yuklashda xatolik: {e}",
        )

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        output_path = tmp.name

    try:
        t0 = time.perf_counter()
        success = provider.synthesize(text, output_path, voice_name="uz-UZ-SardorNeural")
        latency_ms = (time.perf_counter() - t0) * 1000

        if not success or not os.path.exists(output_path):
            return BenchmarkResult(
                provider=provider_name, success=False,
                latency_ms=latency_ms, audio_duration_ms=0,
                audio_size_bytes=0, chars=len(text),
                cost_usd=0, cost_per_char_usd=0, chars_per_second=0,
                error="synthesize() False qaytardi yoki fayl yaratilmadi",
            )

        audio_size = os.path.getsize(output_path)
        audio_duration_ms = _get_audio_duration_ms(output_path)
        cost_usd = provider.cost_per_1k * len(text) / 1000
        cps = (len(text) / latency_ms * 1000) if latency_ms > 0 else 0

        return BenchmarkResult(
            provider=provider_name,
            success=True,
            latency_ms=round(latency_ms, 1),
            audio_duration_ms=round(audio_duration_ms, 1),
            audio_size_bytes=audio_size,
            chars=len(text),
            cost_usd=round(cost_usd, 6),
            cost_per_char_usd=round(provider.cost_per_1k / 1000, 6),
            chars_per_second=round(cps, 1),
        )
    finally:
        if os.path.exists(output_path):
            try:
                os.remove(output_path)
            except Exception:
                pass


def print_report(results: list[BenchmarkResult]) -> None:
    print("\n" + "=" * 70)
    print("TTS BENCHMARK NATIJASI")
    print("=" * 70)
    print(f"{'Provider':<14} {'✓':<4} {'Latency':>10} {'Audio':>10} {'Narx/1K':>10} {'Char/s':>8}")
    print("-" * 70)
    
    for r in results:
        status = "✅" if r.success else "❌"
        lat = f"{r.latency_ms:.0f}ms" if r.success else "-"
        dur = f"{r.audio_duration_ms/1000:.1f}s" if r.success else "-"
        cost = f"${r.cost_per_char_usd*1000:.4f}" if r.success else "-"
        cps = f"{r.chars_per_second:.0f}" if r.success else "-"
        print(f"{r.provider:<14} {status:<4} {lat:>10} {dur:>10} {cost:>10} {cps:>8}")
        if not r.success:
            print(f"  ⚠ {r.error}")
    
    print("-" * 70)
    
    successful = [r for r in results if r.success]
    if not successful:
        print("Hech bir provider muvaffaqiyatli bo'lmadi!")
        return
    
    fastest = min(successful, key=lambda r: r.latency_ms)
    cheapest = min(successful, key=lambda r: r.cost_per_char_usd)
    
    print(f"\n🏆 Eng tez:    {fastest.provider} ({fastest.latency_ms:.0f}ms)")
    print(f"💰 Eng arzon:  {cheapest.provider} (${cheapest.cost_per_char_usd*1000:.4f}/1K char)")
    
    # Tavsiya
    print("\n📊 TAVSIYA:")
    if any(r.provider == "elevenlabs" and r.success for r in results):
        el = next(r for r in results if r.provider == "elevenlabs")
        az = next((r for r in results if r.provider == "azure" and r.success), None)
        if az:
            cost_ratio = el.cost_per_char_usd / az.cost_per_char_usd if az.cost_per_char_usd > 0 else float("inf")
            lat_ratio = el.latency_ms / az.latency_ms if az.latency_ms > 0 else float("inf")
            print(f"  ElevenLabs: {cost_ratio:.1f}x qimmat, {lat_ratio:.1f}x {'sekin' if lat_ratio > 1 else 'tez'} (Azure bilan taqqoslaganda)")
            if cost_ratio < 20 and el.latency_ms < 5000:
                print("  → ElevenLabs: sifat ustunligi xarajat farqini qoplaydi. ✅ DEFAULT qilib o'rnating.")
            else:
                print("  → Azure: narx/sifat balansi yaxshi. ✅ Saqlab qolish tavsiya etiladi.")
        else:
            print("  → ElevenLabs yagona ishlaydigan premium provider.")
    print("=" * 70 + "\n")


def main():
    parser = argparse.ArgumentParser(description="TTS Benchmark")
    parser.add_argument(
        "--providers", default="elevenlabs,azure,edge",
        help="Vergul bilan ajratilgan provider nomlari (default: elevenlabs,azure,edge)"
    )
    parser.add_argument("--text", default=TEST_TEXT_UZ, help="Sinov matni")
    parser.add_argument("--json", action="store_true", help="JSON formatda chiqarish")
    args = parser.parse_args()

    providers = [p.strip() for p in args.providers.split(",")]
    text = args.text

    print(f"\nSinov matni ({len(text)} belgi):\n  \"{text[:80]}...\"")
    print(f"\nTestlanayotgan provayderlar: {providers}")
    print("Iltimos kuting...\n")

    results = []
    for p in providers:
        print(f"  [{p}] sinov boshlandi...", end=" ", flush=True)
        r = benchmark_provider(p, text)
        results.append(r)
        if r.success:
            print(f"✅ {r.latency_ms:.0f}ms")
        else:
            print(f"❌ {r.error[:60]}")

    if args.json:
        print(json.dumps([asdict(r) for r in results], indent=2, ensure_ascii=False))
    else:
        print_report(results)

    return 0 if any(r.success for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
