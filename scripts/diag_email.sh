#!/bin/sh
# Email yetkazib berish diagnostikasi (faqat o'qiydi; kalit QIYMATLARI chiqarilmaydi).
# Ishga tushirish: ssh gapirai@173.212.220.188 'sh -s' < scripts/diag_email.sh
cd ~/gapirai.uz || exit 1

echo "=== 1. Email sozlamalari (faqat bor/yo'q) ==="
for k in RESEND_API_KEY RESEND_FROM_EMAIL SMTP_ENABLED SMTP_HOST SMTP_USER SMTP_PASSWORD SMTP_FROM_EMAIL; do
  v=$(docker exec dubber_backend printenv "$k" 2>/dev/null)
  case "$k" in
    RESEND_FROM_EMAIL|SMTP_ENABLED|SMTP_HOST|SMTP_FROM_EMAIL) echo "$k=${v:-<yo'q>}" ;;
    *) if [ -n "$v" ]; then echo "$k=<bor, ${#v} belgi>"; else echo "$k=<yo'q>"; fi ;;
  esac
done

echo "=== 2. Oxirgi xabarnomalar (broadcast_campaigns) ==="
docker exec dubber_postgres psql -U dubber -d dubber_db -P pager=off -c "
SELECT created_at::date AS sana, left(title, 30) AS sarlavha, channel, target_filter, status,
       total_recipients AS jami, email_sent, email_failed, telegram_sent, telegram_failed,
       left(error_message, 80) AS xato
FROM broadcast_campaigns ORDER BY created_at DESC LIMIT 10;"

echo "=== 3. Backend loglarida email xatolari (oxirgi 7 kun) ==="
docker logs --since 168h dubber_backend 2>&1 | grep -iE "resend|smtp|broadcast|email.*(xato|error|fail)" | tail -25

echo "=== 4. Resend: domen holati (kalit bor bo'lsa) ==="
docker exec dubber_backend python -c "
import os, json, urllib.request
k = os.environ.get('RESEND_API_KEY')
if not k:
    print('RESEND_API_KEY yo\'q')
else:
    try:
        r = urllib.request.urlopen(urllib.request.Request('https://api.resend.com/domains', headers={'Authorization': 'Bearer ' + k}), timeout=15)
        for d in json.load(r).get('data', []):
            print(d.get('name'), '->', d.get('status'), '| region:', d.get('region'))
    except Exception as e:
        print('Resend so\'rovi xato:', e)
"
