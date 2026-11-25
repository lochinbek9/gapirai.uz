"""Adminlar uchun dublyaj sifati: manba 1080p da yuklanadi va past sifatli eski nusxalar qayta ishlatilmaydi."""
from pathlib import Path

from backend.services import gemini_quota_manager as gqm
from backend.services.merger import _get_video_dimensions

ADMIN_HEIGHT = 1080
DEFAULT_HEIGHT = 720


def required_height(db, user_id) -> int:
    """Eski nusxa qayta ishlatilishi uchun eng kam sifat; 0 -- cheklov yo'q (oddiy foydalanuvchi)."""
    from backend.services.plans import is_user_admin

    if not user_id or not is_user_admin(db, user_id):
        return 0
    # worker'da faol vazifa tanlovi, API jarayonida so'rov tanlovi
    choice = gqm.chosen_provider("quality") or (gqm.REQUEST_OVERRIDE.get() or {}).get("quality")
    return int(choice) if choice else ADMIN_HEIGHT


def good_enough(path, min_height: int) -> bool:
    """Sifat qisqa tomon bo'yicha o'lchanadi (vertikal video 1080x1920 ham 1080p)."""
    if not min_height:
        return True
    if not path or not Path(path).is_file():
        return False
    # keng ekranli 1920x800 ham 1080p manba -- uzun tomoni bo'yicha ham qabul qilinadi
    width, height = _get_video_dimensions(str(path))
    if min_height <= DEFAULT_HEIGHT:
        # ataylab past sifat tanlangan -- kattaroq eski nusxa ishlatilmaydi (montaj ham sekin bo'lardi)
        return min_height * 0.9 <= min(width, height) <= min_height * 1.1
    return min(width, height) >= min_height or max(width, height) >= min_height * 16 // 9
