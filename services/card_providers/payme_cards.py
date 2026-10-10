"""Payme (Paycom) Cards / Subscribe API — JSON-RPC 2.0.
https://developer.help.paycom.uz/metody-subyekta-servisa (Cards API)

Sarlavhalar:
  cards.*    -> X-Auth: {merchant_id}
  receipts.* -> X-Auth: {merchant_id}:{key}

Oqim:
  cards.create {card:{number,expire}, save:true}   -> {card:{token, verify:false}}
  cards.get_verify_code {token}                     -> {sent, phone, wait}
  cards.verify {token, code}                        -> {card:{token, verify:true}}
  receipts.create {amount, account:{payment_id}, description} -> {receipt:{_id}}
  receipts.pay {id, token}                          -> {receipt:{state:4}}  (4 = to'landi)
  cards.remove {token}                              -> {success:true}

`receipts.pay` muvaffaqiyatli bo'lsa Payme merchant webhook'ini
(CheckPerformTransaction -> CreateTransaction -> PerformTransaction) sinxron
chaqiradi — fulfillment o'sha yerda (backend/api/payme_routes.py) bo'ladi.
"""
import logging

import httpx

from backend.config import get_settings
from backend.services.card_providers import CardProviderError, infer_card_type

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(45.0, connect=10.0)
_rpc_id = 0


def _base() -> str:
    s = get_settings()
    return (s.PAYME_CARD_API_URL_SANDBOX if s.PAYME_SANDBOX_MODE else s.PAYME_CARD_API_URL).rstrip("/")


def _call(method: str, params: dict, *, with_key: bool) -> dict:
    global _rpc_id
    _rpc_id += 1
    s = get_settings()
    key = s.PAYME_TEST_KEY if s.PAYME_SANDBOX_MODE else s.PAYME_KEY
    x_auth = f"{s.PAYME_MERCHANT_ID}:{key}" if with_key else s.PAYME_MERCHANT_ID
    try:
        r = httpx.post(
            _base(),
            json={"jsonrpc": "2.0", "id": _rpc_id, "method": method, "params": params},
            headers={"X-Auth": x_auth, "Content-Type": "application/json"},
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
    except httpx.HTTPError as e:
        logger.error("Payme cards API %s tarmoq xatosi: %s", method, e)
        raise CardProviderError("To'lov tizimiga ulanib bo'lmadi. Birozdan so'ng qayta urinib ko'ring.")
    if "error" in data and data["error"]:
        err = data["error"]
        msg = err.get("message")
        if isinstance(msg, dict):
            msg = msg.get("uz") or msg.get("ru") or msg.get("en")
        code = err.get("code")
        logger.warning("Payme cards API %s xato: %s %s", method, code, msg)
        raise CardProviderError(_friendly(code, msg or ""), code=code)
    return data.get("result", {})


def _friendly(code, msg: str) -> str:
    m = {
        -31300: "Karta ma'lumotlari noto'g'ri.",
        -31301: "Kartada mablag' yetarli emas.",
        -31302: "Karta bloklangan yoki muddati o'tgan.",
        -31303: "SMS kod noto'g'ri.",
        -31630: "Bu karta bilan operatsiya taqiqlangan.",
    }
    return m.get(code, msg or "To'lov tizimi xatosi.")


def bind(card_number: str, expire_mmYY: str) -> dict:
    """expire: Payme 'MMYY' kutadi (masalan 03/28 -> '0328')."""
    exp = expire_mmYY.replace("/", "").replace(" ", "")
    res = _call("cards.create", {
        "card": {"number": card_number.replace(" ", ""), "expire": exp},
        "save": True,
    }, with_key=False)
    card = res.get("card", {})
    return {
        "token": card["token"],
        "card_mask": card.get("number"),
        "card_type": infer_card_type(card.get("number") or card_number),
        "phone_hint": None,  # get_verify_code'dan keyin ma'lum bo'ladi
        "verified": bool(card.get("verify")),
    }


def request_code(token: str) -> str | None:
    res = _call("cards.get_verify_code", {"token": token}, with_key=False)
    return res.get("phone")


def verify(token: str, code: str) -> dict:
    res = _call("cards.verify", {"token": token, "code": code.strip()}, with_key=False)
    card = res.get("card", {})
    if not card.get("verify"):
        raise CardProviderError("Karta tasdiqlanmadi. SMS kodni tekshiring.")
    mask = card.get("number")
    return {
        "token": card.get("token", token),
        "card_mask": mask,
        "card_type": infer_card_type(mask),
        "verified": True,
    }


def charge(token: str, amount_uzs: float, payment_id: str, description: str = "GapirAI.uz") -> dict:
    """receipts.create + receipts.pay. account maydoni payme_routes.ACCOUNT_FIELD
    ("payment_id") bilan bir xil bo'lishi SHART — shunda merchant webhook
    to'lovni Payment.id orqali topadi."""
    try:
        created = _call("receipts.create", {
            "amount": int(round(amount_uzs * 100)),
            "account": {"payment_id": payment_id},
            "description": description,
        }, with_key=True)
        receipt_id = created.get("receipt", {}).get("_id")
        if not receipt_id:
            return {"ok": False, "provider_ref": None, "error": "Chek yaratilmadi."}
        paid = _call("receipts.pay", {"id": receipt_id, "token": token}, with_key=True)
        state = paid.get("receipt", {}).get("state")
    except CardProviderError as e:
        return {"ok": False, "provider_ref": None, "error": e.message}
    ok = state == 4
    return {
        "ok": ok,
        "provider_ref": receipt_id,
        "error": None if ok else f"receipt state={state}",
    }


def delete(token: str) -> None:
    try:
        _call("cards.remove", {"token": token}, with_key=False)
    except CardProviderError as e:
        logger.warning("Payme karta o'chirishda xato (e'tiborsiz qoldirildi): %s", e.message)
