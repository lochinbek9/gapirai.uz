# GapirAI — Premiere Pro va After Effects plagini (CEP)

Bitta panel ikkala dasturda ishlaydi. Timeline'dagi klipni (After Effects'da — kompozitsiyadagi qatlamni) GapirAI'ga yuboradi va natijani o'sha joyga qaytarib qo'yadi:

- **Dublaj + subtitr** — o'zbekcha ovoz alohida audio trekka, subtitr caption trekka;
- **Faqat subtitr** — faqat o'zbekcha caption trek.

Natija klipning kesilgan qismiga (in/out) va timeline'dagi o'rniga moslanadi. Fayllar loyiha yonidagi `GapirAI/` papkasiga saqlanadi (loyiha saqlanmagan bo'lsa — `Hujjatlar/GapirAI`).

- **After Effects'da** ovoz qatlam boshiga audio qatlam bo'lib, subtitr esa har bir qatori alohida **matn qatlami** bo'lib tushadi — ularni bemalol bezash va animatsiya qilish mumkin (hammasi bitta Undo qadami).

Premiere Pro 2020 (14.0) va After Effects 2020 (17.0) hamda undan yangi versiyalarda ishlaydi (macOS va Windows).

## O'rnatish

1. gapirai.uz → **Mening videolarim** → **Montaj dasturlari uchun plaginlar** → **Kalit yaratish**. Kalitni nusxalab oling — u faqat bir marta ko'rsatiladi.
2. Arxivni oching va o'rnatuvchini ishga tushiring:
   - **macOS:** `install-mac.command` ustida o'ng tugma → **Open** (birinchi marta macOS ruxsat so'raydi).
   - **Windows:** `install-windows.bat` ni ikki marta bosing.
3. Premiere Pro yoki After Effects'ni qayta ishga tushiring → **Window → Extensions → GapirAI — oʻzbekcha dublaj**.
4. Panelda kalitni joylab **Saqlash** ni bosing.

O'rnatuvchi imzolanmagan panellarga ruxsat beradi (Adobe `PlayerDebugMode`) va panelni foydalanuvchi papkasiga nusxalaydi. Administrator huquqi kerak emas.

## Ishlatish

1. Premiere'da timeline'dagi, After Effects'da kompozitsiyadagi bitta video qatlamni tanlang.
2. **Timeline'dagi tanlangan klipni olish** → natija turi va ovozni tanlang → **GapirAI'ga yuborish**.
3. Panel jarayonni ko'rsatib turadi. Panelni yopsangiz ham ish serverda davom etadi — qayta ochganingizda kuzatish davom etadi.

Daqiqalar saytdagi hisobingizdan yechiladi (saytdagi bilan bir xil narx). Manba fayl butunligicha yuboriladi: 1 GB gacha, MP4/MOV/MKV/WebM.

## Cheklovlar

- Nested sekvensiya, grafika yoki bir nechta klipni birlashtirib yuborish hozircha yo'q — bitta media klip.
- Eski Premiere versiyalari SRT'dan caption trek yarata olmasa, fayl `GapirAI` papkasiga import qilinadi — uni qo'lda torting.

## Kalitni bekor qilish

gapirai.uz → **Mening videolarim** → **Montaj dasturlari uchun plaginlar** → kalit yonidagi **Bekor qilish**. Kalit bilan admin paneliga kirib yoki yangi kalit yaratib bo'lmaydi.

## Dasturchilar uchun

- `jsx/host.jsx` — dastur tomoni (ExtendScript): Premiere'da trekka, After Effects'da qatlamlarga qo'yish (`BridgeTalk.appName` bo'yicha).
- `js/api.js` — Node orqali API: oqim bilan yuklash, natijani diskka yozish.
- `js/srt.js` — SRT'ni manba vaqtidan sekvensiya vaqtiga surish.
- `js/wav.js` — dublaj audiosidan klipning in/out qismini kesish (Premiere'ning in/out API'siga tayanmaslik uchun).
- Testlar: `node --test integrations/premiere-cep/tests/panel.test.mjs`; After Effects rejimi (AE'siz): `tests/ae-harness.mjs` (jsdom kerak).
- Arxivni qayta yig'ish: `integrations/premiere-cep/build-zip.sh`.
- Panelni Chrome'da tekshirish: Premiere ochiq turganda `http://localhost:8098`.
