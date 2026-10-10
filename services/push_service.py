"""PWA Web Push — job tugaganda "Dublyajingiz tayyor" bildirishnomasi.

VAPID kalitlari (settings.VAPID_*) bo'sh bo'lsa hamma narsa jimgina o'chiq —
frontend push tugmasini ko'rsatmaydi (GET /api/push/vapid-public-key bo'sh
qaytaradi), backend notify_user() darhol qaytadi.

Server'da VAPID kalitlarini generatsiya qilish (bir marta):

    python3 - <<'EOF'
    from py_vapid import Vapid01
    from cryptography.hazmat.primitives import serialization
    import base64
    v = Vapid01(); v.generate_keys()
    priv = v.private_key.private_numbers().private_value.to_bytes(32, "big")
    pub = v.public_key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
    print("VAPID_PRIVATE_KEY=" + b64(priv))
    print("VAPID_PUBLIC_KEY="  + b64(pub))
    EOF

Ikkala qatorni server .env'ga qo'ying va konteynerlarni qayta yarating.
"""
import json
import logging

from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def push_enabled() -> bool:
    return bool(settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY)


def _vapid_claims() -> dict:
    return {"sub": settings.VAPID_SUBJECT or "mailto:contact@gapirai.uz"}


def send_to_subscription(sub, payload: dict) -> bool:
    """Bitta obunaga push yuboradi. True = yuborildi; False = obuna o'lgan
    (404/410) yoki xato -- chaqiruvchi False bo'lsa qatorni o'chiradi."""
    from pywebpush import webpush, WebPushException

    try:
        webpush(
            subscription_info={
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            },
            data=json.dumps(payload),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims=_vapid_claims(),
            timeout=10,
        )
        return True
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        if status in (404, 410):
            logger.info(f"Push obunasi o'lgan ({status}) -- o'chiriladi: {sub.endpoint[:60]}")
            return False
        logger.warning(f"Push yuborilmadi ({status}): {exc}")
        return True  # vaqtinchalik xato -- obunani saqlab qolamiz
    except Exception as exc:
        logger.warning(f"Push xatosi: {exc}")
        return True


def notify_user(db, user_id, title: str, body: str, url: str = "/dashboard") -> int:
    """Foydalanuvchining barcha qurilmalariga push yuboradi. O'lik obunalarni
    tozalaydi. Qaytadi: yuborilgan qurilmalar soni. Har qanday xato yutiladi
    -- bildirishnoma ikkinchi darajali, job oqimiga ta'sir qilmasligi kerak."""
    if not push_enabled() or not user_id:
        return 0
    try:
        from backend.models.database import PushSubscription

        subs = db.query(PushSubscription).filter(PushSubscription.user_id == user_id).all()
        if not subs:
            return 0
        payload = {"title": title, "body": body, "url": url, "tag": "gapirai-job"}
        sent = 0
        for sub in subs:
            if send_to_subscription(sub, payload):
                sent += 1
            else:
                db.delete(sub)
        db.commit()
        return sent
    except Exception as exc:
        logger.warning(f"notify_user xatosi (o'tkazib yuborildi): {exc}")
        try:
            db.rollback()
        except Exception:
            pass
        return 0
