"""Disk auto-cleanup cron -- eskirgan job papkalarini LOKAL diskdan
o'chiradi (outputs/, uploads/).

Nega kerak:
  - uploads/<job_id>/ odatda pipeline oxirida _cleanup_upload_dir() bilan
    o'chadi, lekin worker to'satdan o'ldirilsa (OOM, deploy SIGKILL) orfan
    papkalar qoladi.
  - outputs/<job_id>/ ni pipeline HECH QACHON o'chirmaydi (foydalanuvchi
    shu yerdan yuklab oladi, /outputs/... sifatida beriladi) -- S3 nusxasi
    o'z lifecycle'i bilan tozalanadi, lekin lokal nusxa cheksiz o'sadi.
    Bu -- productionda disk to'lishining asosiy sababi.

Xavfsizlik: papka mtime'i settings.DISK_CLEANUP_* chegarasidan eski bo'lsagina
o'chiriladi. Chegaralar task_time_limit (8000s ~2.2 soat) dan ancha katta,
shuning uchun hali ishlayotgan job'ning fayllari hech qachon o'chmaydi;
haqiqatan qotib qolgan job'lar backend/scripts/recover_stuck_jobs.py bilan
alohida hal qilinadi. DB'ga umuman murojaat qilmaydi -- DB ishlamay tursa
ham disk tozalanadi.

Ishlatish (soatlik host cron, auto_renew.py bilan bir xil naqsh):
    docker compose exec -T backend python -m backend.scripts.disk_cleanup
"""
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.config import get_settings


def _sweep(root: Path, max_age_seconds: float) -> tuple[int, int]:
    """root ichidagi har bir 1-daraja pastki papkani ko'rib chiqadi;
    mtime'i max_age_seconds dan eski bo'lsa butunlay o'chiradi.
    (removed, kept) qaytaradi. max_age_seconds <= 0 bo'lsa hech nima
    o'chirilmaydi (o'sha papka uchun tozalash o'chirilgan)."""
    if max_age_seconds <= 0 or not root.is_dir():
        return 0, 0
    now = time.time()
    removed = kept = 0
    for child in sorted(root.iterdir()):
        if not child.is_dir():
            continue
        try:
            if now - child.stat().st_mtime > max_age_seconds:
                shutil.rmtree(child, ignore_errors=True)
                removed += 1
            else:
                kept += 1
        except OSError as e:
            print(f"[disk_cleanup] {child} o'chirilmadi: {e}")
    return removed, kept


def main() -> int:
    s = get_settings()
    out_removed, out_kept = _sweep(Path(s.OUTPUT_DIR), s.DISK_CLEANUP_OUTPUT_DAYS * 86400)
    up_removed, up_kept = _sweep(Path(s.UPLOAD_DIR), s.DISK_CLEANUP_UPLOAD_HOURS * 3600)
    print(
        f"[disk_cleanup] outputs: {out_removed} o'chirildi / {out_kept} qoldi "
        f"(>{s.DISK_CLEANUP_OUTPUT_DAYS}kun) | "
        f"uploads: {up_removed} o'chirildi / {up_kept} qoldi "
        f"(>{s.DISK_CLEANUP_UPLOAD_HOURS}soat)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
