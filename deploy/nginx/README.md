# nginx sozlamalari (host-1)

Bu papka **host-1** (`gapirai-production-new`, `172.31.27.238`) dagi nginx sozlamalarining nusxasi. Ilgari ular
faqat serverning o'zida turardi (server almashsa yoki disk buzilsa yo'qolardi). Endi repo -- manba, server -- uning
qo'llanilgan holati. Boshqa hostlarda (worker-3) nginx yo'q.

Fayllarda **parol/kalit yo'q**: faqat sertifikat *yo'llari* (`/etc/letsencrypt/...`). Sertifikatlarning o'zi repoda
emas, ularni certbot boshqaradi.

## Fayllar

| Repoda | Serverda | Nima qiladi |
|---|---|---|
| `nginx.conf` | `/etc/nginx/nginx.conf` | Ubuntu standarti + `worker_connections 4096` va `worker_rlimit_nofile 16384` (pastga qarang); `conf.d` va `sites-enabled` ni ulaydi |
| `sites-available/gapirai.uz` | `/etc/nginx/sites-available/gapirai.uz` (`sites-enabled/` da symlink) | `gapirai.uz` -> Next.js `:3000`; `api.gapirai.uz` -> backend `:8000` (+ job keshi); HTTP -> HTTPS yo'naltirish |
| `sites-available/admin.gapirai.uz` | xuddi shunday | `admin.gapirai.uz` -> Next.js `:3000` (`/` uchun keshsiz) |
| `conf.d/gapirai-cache.conf` | `/etc/nginx/conf.d/gapirai-cache.conf` | Job keshi zonasi (`proxy_cache_path`) |

Eslatma: `gapirai.uz/api/*` so'rovlari ham backend'ga boradi (Next.js `rewrites`, `frontend/next.config.ts`), lekin
brauzer `https://api.gapirai.uz` dan foydalanadi (`frontend/lib/runtime-config.ts`), shuning uchun kesh faqat shu
blokda.

## Ishlatish

Hammasi **host-1'da**, `git pull origin main` dan keyin.

```bash
cd /home/ubuntu/ai-dubber
./deploy/nginx/check-drift.sh          # repo va server farqini ko'rsatadi (faqat o'qiydi)
sudo ./deploy/nginx/apply.sh           # repodagi holatni serverga qo'llaydi
```

`apply.sh`: zaxira (`/var/backups/nginx-<vaqt>/`) -> nusxalash -> `nginx -t` -> `systemctl reload nginx`.
`nginx -t` o'tmasa eski fayllarni **o'zi tiklaydi** va reload qilmaydi. Reload ulanishlarni uzmaydi.

Qo'lda qaytarish (kerak bo'lsa): zaxira papkasidagi fayllarni `/etc/nginx/` ga qaytarib, `sudo nginx -t &&
sudo systemctl reload nginx`.

**Tartib qoidasi:** sozlamani serverda qo'lda o'zgartirsangiz, o'sha o'zgarishni shu papkaga ham kiriting (yoki
avval shu yerda o'zgartirib `apply.sh` qiling). Aks holda keyingi `apply.sh` serverdagi qo'lda qilingan o'zgarishni
ustidan yozadi. Shubha bo'lsa avval `check-drift.sh`.

## `api.gapirai.uz` job keshi -- qoidalar va sabablari

`GET /api/jobs/<uuid>` uchun, 10 soniya. Maqsad: ommaviy ulashilgan (login qilinmagan) havola minglab marta ochilsa
backend'ga sekundiga bir necha martadan ortiq bormasin.

- **`Authorization` sarlavhasi bor so'rov keshni chetlab o'tadi va hech qachon keshga YOZILMAYDI**
  (`proxy_cache_bypass` + `proxy_no_cache`). Egasining to'liq javobi (transkript, xato matni, baho) begonaga
  berilib qolmasligi uchun -- bu eng muhim qoida, uni olib tashlamang.
- Faqat `200` keshlanadi; `404` yo'q (job hali tugamagan bo'lsa, tugashi bilan ko'rinishi kerak).
- Kesh kalitida `$http_origin` bor: backend `access-control-allow-origin` ga so'rovning `Origin`ini aynan
  qaytaradi, ajratilmasa boshqa saytga mo'ljallangan javob berilib CORS buzilardi.
- `proxy_cache_lock`: bir vaqtda kelgan bir xil so'rovlar backend'ga bitta bo'lib boradi. Backend xato bersa
  eski nusxa beriladi (`proxy_cache_use_stale`).
- Javobga `X-Cache-Status` (`MISS`/`HIT`/`BYPASS`) qo'shiladi -- tekshirish uchun.
- Shu blokda API JSON gzip bilan siqiladi (16.6 KB -> ~5.3 KB). API'ning qolgan yo'llari (login va h.k.) ataylab
  siqilmaydi.

Tekshirish:
```bash
J=<tugagan job id>
curl -sI -H "Origin: https://gapirai.uz" https://api.gapirai.uz/api/jobs/$J | grep -i x-cache   # MISS
curl -sI -H "Origin: https://gapirai.uz" https://api.gapirai.uz/api/jobs/$J | grep -i x-cache   # HIT
curl -sI -H "Authorization: Bearer x" -H "Origin: https://gapirai.uz" https://api.gapirai.uz/api/jobs/$J | grep -i x-cache   # BYPASS
```

## Ulanishlar chegarasi (`nginx.conf`)

`worker_connections 4096` (avval Ubuntu standarti 768). Har proksilanadigan so'rov 2 ta ulanish oladi (mijoz +
backend), ya'ni bitta worker ~2000 ta bir vaqtdagi so'rovni ko'taradi; `worker_processes auto` = vCPU soni (host-1'da
4 ta, 2026-09-20 holatiga), jami ~8000 bir vaqtdagi so'rov. `worker_rlimit_nofile 16384` -- worker'ning ochiq fayl chegarasi: `worker_connections`dan kamida
2 baravar katta bo'lishi kerak (kesh va log fayllari ham fd oladi), aks holda nginx xato logiga `Too many open
files` yozadi. Ularni faqat birga o'zgartiring.

Tekshirish (host-1):
```bash
sudo nginx -T 2>/dev/null | grep -E 'worker_(connections|rlimit_nofile)'
grep 'open files' /proc/$(pgrep -f 'nginx: worker' | head -1)/limits      # 16384
```

## Ochiq masalalar

- Ildizdagi `DEPLOYMENT.md` eskirgan (boshqa domen va Supervisor haqida), hozirgi tizim docker-compose'da. nginx
  haqida shu README to'g'ri.
