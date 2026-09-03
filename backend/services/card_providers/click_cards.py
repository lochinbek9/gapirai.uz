"""Click Card Token API (v2 merchant) — https://docs.click.uz/en/click-api-request/

Auth sarlavhasi: `Auth: {merchant_user_id}:{sha1(timestamp + secret_key)}:{timestamp}`
— bu click_service.generate_digest bilan bir xil algoritm.

Metodlar:
  POST  {base}/card_token/request   {service_id, card_number, expire_date, temporary}
  POST  {base}/card_token/verify    {service_id, card_token, sms_code}
  POST  {base}/card_token/payment   {service_id, card_token, amount, transaction_parameter}
  DELETE {base}/card_token/{service_id}/{card_token}

Javoblarda `error_code == 0` -> muvaffaqiyat, manfiy -> xato (`error_note`).
"""
import logging
import time

import httpx

from backend.config import get_settings
from backend.services.card_providers import CardProviderError, infer_card_type
from backend.services.click_service import generate_digest

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(30.0, connect=10.0)


def _cfg():
    s = get_settings()
    base = s.CLICK_CARD_API_URL.rstrip("/")
    service_id = s.CLICK_CARD_SERVICE_ID or s.CLICK_SERVICE_ID
    return s, base, service_id


def _auth_header(s) -> dict:
    ts = str(int(time.time()))
    digest = generate_digest(int(ts), s.CLICK_SECRET_KEY)
    return {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Auth": f"{s.CLICK_MERCHANT_USER_ID}:{digest}:{ts}",
    }


def _post(path: str, payload: dict) -> dict:
    s, base, _ = _cfg()
    try:
        r = httpx.post(f"{base}{path}", json=payload, headers=_auth_header(s), timeout=_TIMEOUT)
        r.raise_for_status()
        data = r.json()
    except httpx.HTTPError as e:
        logger.error("Click card API %s tarmoq xatosi: %s", path, e)
        raise CardProviderError("To'lov tizimiga ulanib bo'lmadi. Birozdan so'ng qayta urinib ko'ring.")
    ec = data.get("error_code", 0)
    if ec not in (0, None):
        note = data.get("error_note") or "Noma'lum xato"
        logger.warning("Click card API %s xato: %s %s", path, ec, note)
        raise CardProviderError(_friendly(ec, note), code=ec)
    return data


def _friendly(code, note: str) -> str:
    m = {
        -1: "Imzo tekshiruvi muvaffaqiyatsiz.",
        -5: "Karta topilmadi yoki bloklangan.",
        -6: "Bunday tranzaksiya topilmadi.",
        -16: "Kartada mablag' yetarli emas.",
        -31: "Karta muddati o'tgan.",
        -1001: "SMS kod noto'g'ri yoki eskirgan.",
    }
    return m.get(code, f"Xato: {note}")


def bind(card_number: str, expire_mmYY: str) -> dict:
    """expire_mmYY: 'MM/YY' yoki 'MMYY'. Click 'MMYY' kutadi."""
    _, _, service_id = _cfg()
    exp = expire_mmYY.replace("/", "").replace(" ", "")
    data = _post("/card_token/request", {
        "service_id": int(service_id),
        "card_number": card_number.replace(" ", ""),
        "expire_date": exp,
        "temporary": 0,
    })
    return {
        "token": data["card_token"],
        "card_mask": None,  # request bosqichida niqob qaytmaydi, verify'da keladi
        "card_type": infer_card_type(card_number),
        "phone_hint": data.get("phone_number"),
        "verified": False,
    }


def request_code(token: str) -> None:
    """Click card_token/request o'zi SMS yuboradi; qayta yuborish uchun
    request'ni takrorlash kerak (token bilan emas, karta bilan) — shuning
    uchun bu yerda alohida amal yo'q. Interfeys birxilligi uchun mavjud."""
    return None


def verify(token: str, code: str) -> dict:
    _, _, service_id = _cfg()
    data = _post("/card_token/verify", {
        "service_id": int(service_id),
        "card_token": token,
        "sms_code": code.strip(),
    })
    mask = data.get("card_number")
    return {
        "token": token,
        "card_mask": mask,
        "card_type": infer_card_type(mask),
        "verified": True,
    }


def charge(token: str, amount_uzs: float, merchant_trans_id: str) -> dict:
    _, _, service_id = _cfg()
    try:
        data = _post("/card_token/payment", {
            "service_id": int(service_id),
            "card_token": token,
            "amount": float(amount_uzs),
            "transaction_parameter": merchant_trans_id,
        })
    except CardProviderError as e:
        return {"ok": False, "provider_ref": None, "error": e.message}
    status = data.get("payment_status")
    # payment_status: 2 = to'landi (muvaffaqiyat). error_code == 0 allaqachon
    # tekshirilgan; ba'zi hollarda payment_status kelmasligi mumkin -> 0 ok deb hisoblaymiz.
    ok = status in (2, None) or str(status) == "2"
    return {
        "ok": ok,
        "provider_ref": str(data.get("payment_id")) if data.get("payment_id") else None,
        "error": None if ok else (data.get("error_note") or f"payment_status={status}"),
    }


def delete(token: str) -> None:
    s, base, service_id = _cfg()
    try:
        r = httpx.request("DELETE", f"{base}/card_token/{service_id}/{token}",
                          headers=_auth_header(s), timeout=_TIMEOUT)
        r.raise_for_status()
    except httpx.HTTPError as e:
        logger.warning("Click card token o'chirishda xato (e'tiborsiz qoldirildi): %s", e)
