# GapirAI — Premiere Pro plagini (CEP)

Timeline'dagi klipni GapirAI'ga yuboradi va natijani o'sha joyga qaytarib qo'yadi:

- **Dublaj + subtitr** — o'zbekcha ovoz alohida audio trekka, subtitr caption trekka;
- **Faqat subtitr** — faqat o'zbekcha caption trek.

Natija klipning kesilgan qismiga (in/out) va timeline'dagi o'rniga moslanadi. Fayllar loyiha yonidagi `GapirAI/` papkasiga saqlanadi (loyiha saqlanmagan bo'lsa — `Hujjatlar/GapirAI`).

Premiere Pro 2020 (14.0) va undan yangi versiyalarda ishlaydi (macOS va Windows).

## O'rnatish

1. gapirai.uz → **Mening videolarim** → **Premiere Pro plagini** → **Kalit yaratish**. Kalitni nusxalab oling — u faqat bir marta ko'rsatiladi.
2. Arxivni oching va o'rnatuvchini ishga tushiring:
   - **macOS:** `install-mac.command` ustida o'ng tugma → **Open** (birinchi marta macOS ruxsat so'raydi).
   - **Windows:** `install-windows.bat` ni ikki marta bosing.
3. Premiere Pro'ni qayta ishga tushiring → **Window → Extensions → GapirAI — oʻzbekcha dublaj**.
4. Panelda kalitni joylab **Saqlash** ni bosing.

O'rnatuvchi imzolanmagan panellarga ruxsat beradi (Adobe `PlayerDebugMode`) va panelni foydalanuvchi papkasiga nusxalaydi. Administrator huquqi kerak emas.

## Ishlatish

1. Timeline'da bitta video klipni tanlang.
2. **Timeline'dagi tanlangan klipni olish** → natija turi va ovozni tanlang → **GapirAI'ga yuborish**.
3. Panel jarayonni ko'rsatib turadi. Panelni yopsangiz ham ish serverda davom etadi — qayta ochganingizda kuzatish davom etadi.

Daqiqalar saytdagi hisobingizdan yechiladi (saytdagi bilan bir xil narx). Manba fayl butunligicha yuboriladi: 1 GB gacha, MP4/MOV/MKV/WebM.

## Cheklovlar

- Nested sekvensiya, grafika yoki bir nechta klipni birlashtirib yuborish hozircha yo'q — bitta media klip.
- Eski Premiere versiyalari SRT'dan caption trek yarata olmasa, fayl `GapirAI` papkasiga import qilinadi — uni qo'lda torting.

## Kalitni bekor qilish

gapirai.uz → **Mening videolarim** → **Premiere Pro plagini** → kalit yonidagi **Bekor qilish**. Kalit bilan admin paneliga kirib yoki yangi kalit yaratib bo'lmaydi.

## Dasturchilar uchun

- `jsx/host.jsx` — Premiere tomoni (ExtendScript): tanlovni o'qish, import, trekka qo'yish.
- `js/api.js` — Node orqali API: oqim bilan yuklash, natijani diskka yozish.
- `js/srt.js` — SRT'ni manba vaqtidan sekvensiya vaqtiga surish.
- Panelni Chrome'da tekshirish: Premiere ochiq turganda `http://localhost:8098`.
