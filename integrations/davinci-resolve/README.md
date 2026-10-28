# GapirAI — DaVinci Resolve uchun oʻzbekcha dublaj va subtitr

Timeline'dagi klipni GapirAI'ga yuboradi va natijani oʻsha joyga qaytaradi:

- **Dublaj + subtitr** — oʻzbekcha ovoz boʻsh audio trekka, subtitr subtitr trekiga;
- **Faqat subtitr** — faqat oʻzbekcha subtitr.

Natija klipning kesilgan qismiga (in/out) va timeline'dagi oʻrniga moslanadi. Fayllar `Hujjatlar/GapirAI` papkasida saqlanadi.

DaVinci Resolve **18.5 va undan yangi**, **bepul va Studio** versiyalarda ishlaydi (macOS va Windows 10/11). Hech narsa oʻrnatish shart emas: skript Resolve ichidagi Lua va tizimdagi `curl` bilan ishlaydi.

## Oʻrnatish

1. gapirai.uz → **Mening videolarim** → **Montaj dasturlari uchun plaginlar** → **Kalit yaratish**. Kalitni nusxalab oling — u faqat bir marta koʻrsatiladi (Premiere plagini bilan bir xil kalit).
2. Arxivni oching:
   - **macOS:** `install-mac.command` ustida oʻng tugma → **Open**.
   - **Windows:** `install-windows.bat` ni ikki marta bosing.
3. DaVinci Resolve'ni qayta ishga tushiring → **Workspace → Scripts → GapirAI**.
4. Oynada kalitni joylab **Saqlash** ni bosing.

## Ishlatish

1. Edit sahifasida playhead'ni kerakli video klip ustiga qoʻying.
2. **Klipni olish** → natija turi va ovozni tanlang → **GapirAI'ga yuborish**.
3. Oyna jarayonni koʻrsatib turadi; Resolve qotmaydi. Oynani yopsangiz ham ish serverda davom etadi — qayta ochganingizda kuzatish davom etadi.
4. Tayyor boʻlgach oʻzbekcha ovoz boʻsh audio trekka (yoʻq boʻlsa yangisi qoʻshiladi), subtitr subtitr trekiga klip boshidan qoʻyiladi. Subtitr avtomatik qoʻyilmasa, oyna **File → Import → Subtitle…** orqali qaysi faylni import qilishni aytadi — uning vaqtlari timeline'ga allaqachon moslangan.

Daqiqalar saytdagi hisobingizdan yechiladi. Manba fayl butunligicha yuboriladi: 1 GB gacha, MP4/MOV/MKV/WebM.

## Cheklovlar

- Bitta media klip (compound clip, generator, matn yoʻq).
- Tezligi oʻzgartirilgan klipda ovoz asl tezlikda qoʻyiladi.

## Dasturchilar uchun

- `GapirAI.lua` — bitta fayl: UI (Fusion UIManager), Resolve API, `curl` orqali tarmoq (uzoq amallar fonda), SRT surish va WAV kesish.
- Testlar Resolve'siz: `python3 -m venv /tmp/v && /tmp/v/bin/pip install lupa && /tmp/v/bin/python integrations/davinci-resolve/tests/run_tests.py`
- Arxivni qayta yigʻish: `integrations/davinci-resolve/build-zip.sh`.
