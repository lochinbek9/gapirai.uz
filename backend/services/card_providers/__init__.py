"""Karta tokeni (rekurrent to'lov) provayder mijozlari — Click va Payme.

Har bir modul faqat RAW API chaqiruvlarini bajaradi va normallashtirilgan
dict qaytaradi; DB va biznes-mantiq backend/services/recurring.py'da.

Normallashtirilgan natijalar:
  bind()   -> {"token": str, "card_mask": str|None, "card_type": str|None,
               "phone_hint": str|None, "verified": bool}
  verify() -> {"token": str, "card_mask": str|None, "verified": True}
  charge() -> {"ok": bool, "provider_ref": str|None, "error": str|None}

Xatolar CardProviderError bilan ko'tariladi (foydalanuvchiga ko'rsatiladigan
xabar .message'da)."""


class CardProviderError(Exception):
    def __init__(self, message: str, *, code: str | int | None = None):
        super().__init__(message)
        self.message = message
        self.code = code


def infer_card_type(number: str | None) -> str | None:
    """Niqoblangan yoki to'liq raqamning boshlang'ich raqamlaridan karta
    turini aniqlaydi. 8600 -> UzCard, 9860 -> Humo."""
    if not number:
        return None
    digits = "".join(ch for ch in number if ch.isdigit() or ch == "*")
    if digits.startswith("8600"):
        return "uzcard"
    if digits.startswith("9860"):
        return "humo"
    return None
