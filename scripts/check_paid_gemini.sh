#!/bin/sh
# Pullik Gemini kalitlarining holati (faqat o'qiydi; kalit QIYMATLARI chiqarilmaydi, faqat oxirgi 4 belgi).
# Gemini API balansni to'g'ridan-to'g'ri bermaydi -- har kalitga 1 ta juda kichik so'rov yuborib,
# javob kodidan holatni aniqlaymiz (200 = ishlayapti, 429 = limit, 402/403 billing = pul tugagan).
# Ishga tushirish: ssh gapirai@173.212.220.188 'sh -s' < scripts/check_paid_gemini.sh
cd ~/gapirai.uz || exit 1

echo "=== 1. Pullik kalitlarga test so'rov ==="
docker exec -i dubber_backend python - <<'PY'
import json, urllib.request, urllib.error
from backend.config import get_settings
from backend.services.gemini_quota_manager import get_paid_gemini_api_keys

model = get_settings().GEMINI_MODEL
keys = get_paid_gemini_api_keys()
print(f"Model: {model} | pullik kalitlar: {len(keys)}")
body = json.dumps({"contents": [{"parts": [{"text": "ping"}]}],
                   "generationConfig": {"maxOutputTokens": 1}}).encode()
for i, k in enumerate(keys, 1):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json", "x-goog-api-key": k})
    try:
        urllib.request.urlopen(req, timeout=30)
        print(f"  #{i} ...{k[-4:]}: 200 OK -- ishlayapti, balans bor")
    except urllib.error.HTTPError as e:
        try:
            err = json.load(e).get("error", {})
        except Exception:
            err = {}
        msg = (err.get("message") or "").replace(k, "***")[:160]
        low = msg.lower()
        if e.code == 402 or "prepay" in low or "credit" in low or "billing" in low:
            verdict = "BALANS TUGAGAN (billing)"
        elif e.code == 429:
            verdict = "limit (429) -- vaqtincha, balans bor bo'lishi mumkin"
        elif e.code in (400, 403) and ("api key" in low or "permission" in low):
            verdict = "kalit yaroqsiz / bloklangan"
        else:
            verdict = "boshqa xato"
        print(f"  #{i} ...{k[-4:]}: {e.code} {err.get('status', '')} -- {verdict}\n       {msg}")
    except Exception as e:
        print(f"  #{i} ...{k[-4:]}: tarmoq xatosi: {e}")
PY

echo "=== 2. Worker loglari: oxirgi 24 soatda Gemini xatolari ==="
for code in 402 429; do
  n=$(docker logs --since 24h dubber_worker 2>&1 | grep -i gemini | grep -c " $code\|$code ")
  echo "  $code: $n ta qator"
done
