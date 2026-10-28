# GapirAI — YouTube oʻzbekcha (Chrome kengaytmasi)

YouTube'da istalgan videoni oʻzbekcha ovoz va subtitr bilan tomosha qilish:

- pleyerning chap yuqori burchagida **UZ** tugmasi;
- siz avval dublaj qilgan videolar qayta toʻlovsiz ochiladi;
- yangi video uchun narxi (daqiqa) va balansingiz koʻrsatiladi, tasdiqlagach dublaj boshlanadi;
- tayyor boʻlgach oʻzbekcha ovoz video bilan sinxron ijro etiladi (YouTube ovozi pasayadi, darajasini oʻzingiz tanlaysiz), subtitr pleyer ustida chiqadi;
- pauza, oʻtkazib yuborish, tezlik (0.5×–2×) va reklama paytida dublaj videoga ergashadi.

Chrome, Edge, Brave, Yandex Brauzer (Chromium) da ishlaydi.

## Kirish

Alohida login yoʻq: brauzerda **gapirai.uz** ga kirgan boʻlsangiz, kengaytma oʻsha sessiyadan foydalanadi. Daqiqalar saytdagi hisobingizdan yechiladi.

## Oʻrnatish (sinov uchun)

1. Chrome'da `chrome://extensions` ni oching.
2. Oʻng yuqoridagi **Developer mode** ni yoqing.
3. **Load unpacked** → shu papkani (`integrations/chrome-extension`) tanlang.
4. gapirai.uz ga kiring, soʻng istalgan YouTube videosini oching.

## Dasturchilar uchun

- `src/background.js` — API soʻrovlari (CORS'siz, `host_permissions`), sayt cookie'sidan token.
- `src/content.js` — YouTube sahifasi: tugma/panel (Shadow DOM), audio sinxroni, subtitr.
- `src/popup.*` — holat va **Dasturchi sozlamalari → Server** (gapirai.uz yoki lokal `localhost:3000` / `localhost:8000`).
- Backend: `GET /api/jobs/by-video/{youtube_id}` — foydalanuvchining shu video boʻyicha tayyor yoki jarayondagi dublaji.
- Lokal serverda sinashda Chrome `youtube.com` → `localhost` soʻrovlariga ruxsat soʻraydi (Local Network Access) — ruxsat bering.
