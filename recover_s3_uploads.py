"""
S3'ga chiqmay qolgan dublyajlarni lokal diskdan qayta yuklaydi.

Ishlatish (worker konteyneri ichida):
    python recover_s3_uploads.py            # faqat ro'yxat (hech narsa yuklamaydi)
    python recover_s3_uploads.py --apply    # haqiqatan yuklaydi
    python recover_s3_uploads.py --apply --days 2

Kalit tuzalgandan KEYIN ishga tushiring.
"""
import sys
import time
from pathlib import Path

from botocore.exceptions import ClientError

from backend.config import get_settings
from backend.services.storage import _get_s3_client


def exists(client, bucket, key) -> bool:
    try:
        client.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError:
        return False


def main() -> None:
    apply = "--apply" in sys.argv
    days = 3
    if "--days" in sys.argv:
        days = int(sys.argv[sys.argv.index("--days") + 1])

    out_dir = Path(get_settings().OUTPUT_DIR)
    client, bucket = _get_s3_client()
    if not client:
        raise SystemExit("S3 klient yaratilmadi (AWS_BUCKET_NAME / kalitlarni tekshiring)")

    # Kalit ishlayotganini oldindan tekshiramiz (bir marta)
    try:
        client.list_objects_v2(Bucket=bucket, Prefix="dubber/", MaxKeys=1)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        raise SystemExit(f"S3 hali ishlamayapti: {code}. Avval kalitni tuzating.")

    cutoff = time.time() - days * 86400
    uploaded = skipped = missing = failed = 0

    for job_dir in sorted(out_dir.iterdir()):
        final = job_dir / "dubbed_final.mp4"
        if not job_dir.is_dir() or not final.exists():
            continue
        if final.stat().st_mtime < cutoff:
            continue

        job_id = job_dir.name
        items = [
            (final, f"dubber/{job_id}/dubbed_final.mp4"),
            (job_dir / "tts_segments" / "dubbed_audio.wav", f"dubber/{job_id}/dubbed_audio.wav"),
        ]
        for path, key in items:
            if not path.exists():
                print(f"[YO'Q]      {path}")
                missing += 1
                continue
            if exists(client, bucket, key):
                print(f"[BOR]       {key}")
                skipped += 1
                continue
            size_mb = path.stat().st_size / 1e6
            if not apply:
                print(f"[YUKLANADI] {key}  ({size_mb:.1f} MB)")
                continue
            try:
                client.upload_file(str(path), bucket, key)
                print(f"[YUKLANDI]  {key}  ({size_mb:.1f} MB)")
                uploaded += 1
            except Exception as e:
                print(f"[XATO]      {key}: {e}")
                failed += 1

    mode = "YUKLASH" if apply else "KO'RIB CHIQISH (--apply yo'q)"
    print(f"\n{mode}: yuklandi={uploaded}, allaqachon bor={skipped}, fayl yo'q={missing}, xato={failed}")


if __name__ == "__main__":
    main()
