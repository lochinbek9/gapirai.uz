# GapirAI — oʻzbekcha dublaj (Chrome kengaytmasi)

YouTube videolari va Coursera kurs darslarini oʻzbekcha ovoz va subtitr bilan tomosha qilish.

Chrome, Edge, Brave va Yandex Brauzer (Chromium) da ishlaydi. Joriy versiya: **0.2.0**.

| Platforma | Qanday ishlaydi |
|---|---|
| **YouTube** | Video serverda yuklab olinadi, nutq matnga aylantiriladi, tarjima va ovoz qilinadi (oddiy dublaj bilan bir xil). |
| **Coursera** | Video **yuklanmaydi**. Sahifadagi inglizcha subtitr tarjima va ovoz qilinadi, shuning uchun tezroq. |
| Udemy | Hali yoʻq. |

---

## 1. Oʻrnatish

1. Chrome'da `chrome://extensions` sahifasini oching.
2. Oʻng yuqoridagi **Developer mode** (Dasturchi rejimi) tugmasini yoqing.
3. Chap yuqoridagi **Load unpacked** tugmasini bosing va shu papkani tanlang:
   ```
   /Users/user/Desktop/gapirai.uz/integrations/chrome-extension
   ```
   Maslahat: Finder oynasida **⌘⇧G** bosib, yoʻlni qoʻying, Enter, keyin **Select**.
4. Kartochkada **"GapirAI — oʻzbekcha dublaj"** va **0.2.0** koʻrinishi kerak.
5. Brauzerda **gapirai.uz** saytiga kiring (pastdagi "Kirish" boʻlimini koʻring).

Ochiq turgan YouTube va Coursera tablari odatda yangilanmasdan ham ishlaydi, chunki kengaytma oʻrnatilganda ularga oʻzi ulanadi. Tugma chiqmasa, sahifani bir marta yangilang (⌘R).

### Kengaytmani yangilash

Kod oʻzgargach (`git pull` yoki yangi versiyadan keyin):

1. `chrome://extensions` → GapirAI kartochkasidagi **↻** tugmasini bosing.
2. Ochiq YouTube va Coursera sahifalarini yangilang (⌘R).

> **O'chirib yubormang.** O'chirsangiz, yuqoridagi "Oʻrnatish" bosqichlarini qaytadan bajarishingiz kerak boʻladi (sozlamalar ham tozalanadi). Yangilash uchun ↻ yetarli.

---

## 2. Kirish

Alohida login yoʻq. Brauzerda **gapirai.uz** ga kirgan boʻlsangiz, kengaytma oʻsha sessiyadan foydalanadi. Daqiqalar saytdagi hisobingizdan yechiladi.

Panelda **"GapirAI hisobiga kiring"** chiqsa:

1. **gapirai.uz’ga kirish** tugmasini bosing va saytga kiring.
2. Kursga qaytib, **Kirdim, qayta tekshirish** tugmasini bosing.

---

## 3. Coursera'da foydalanish

1. Istalgan dars videosini oching: `coursera.org/learn/<kurs>/lecture/...`.
2. Video ustidagi **UZ** tugmasini bosing, panel ochiladi.
3. Ovozni tanlang: **Avtomatik** / **Erkak** / **Ayol**. Avtomatik tanlovda ovoz matnga qarab aniqlanadi.
4. Panelda narx (daqiqa) va balansingiz koʻrinadi. **Ovozlashtirish** tugmasini bosing.
5. Holat **Tarjima → Ovozlashtirish → Tayyor** tartibida oʻzgaradi. 5 daqiqalik dars odatda 1–2 daqiqada tayyor boʻladi. Sahifadan chiqib ketsangiz ham ish serverda davom etadi.
6. Tayyor boʻlgach, oʻzbekcha ovoz avtomatik yoqiladi.

**Tayyor dublaj panelidagi sozlamalar:**

- **Oʻzbekcha ovoz** — yoqish va oʻchirish.
- **Subtitr** — oʻzbekcha subtitr video ustida chiqadi.
- **Asl ovoz** — Coursera'ning inglizcha ovozi qanchalik eshitilishini sozlaydi (0 boʻlsa butunlay oʻchadi).

Ovoz video bilan sinxron yuradi. Pauza, oldinga yoki orqaga oʻtkazish va tezlik (1×, 1.5× ...) avtomatik ergashadi. 0,3 soniyadan katta farq boʻlsa, oʻzi toʻgʻrilanadi.

**Narx:** birinchi subtitrdan oxirgisigacha boʻlgan vaqt daqiqa hisobida, oddiy dublaj bilan bir xil. **Shu darsni qayta ochish bepul**: tayyor dublaj qayta hisoblanmaydi. Adminlardan daqiqa yechilmaydi.

**Cheklovlar:**

- Darsda **inglizcha subtitr** boʻlishi kerak. Subtitr boʻlmasa, panelda "Inglizcha subtitr topilmadi" chiqadi.
- Bitta dars eng koʻpi bilan **180 daqiqa** boʻlishi mumkin.
- Dublaj faqat uni yaratgan foydalanuvchiga koʻrinadi, chunki kurs kontenti pullik va umumiy kesh yoʻq.

---

## 4. YouTube'da foydalanish

1. Video oching. Pleyerning chap yuqori burchagida **UZ** tugmasi bor.
2. Siz avval dublaj qilgan video qayta toʻlovsiz ochiladi.
3. Yangi video uchun narx va balans koʻrsatiladi. Tasdiqlagach dublaj boshlanadi.
4. Tayyor boʻlgach, ovoz video bilan sinxron ijro etiladi. YouTube ovozi pasayadi, darajasini oʻzingiz tanlaysiz. Subtitr pleyer ustida chiqadi.
5. Reklama paytida dublaj toʻxtab turadi.

---

## 5. Muammolar va yechimlar

| Belgi | Sabab | Yechim |
|---|---|---|
| **UZ** tugmasi chiqmayapti | Kengaytma eski versiyada yoki sahifa kengaytmadan oldin ochilgan | `chrome://extensions` da versiya **0.2.0** ekanini tekshiring, **↻** bosing va sahifani yangilang (⌘R). |
| "Kengaytma yangilandi — sahifani yangilang" | Kengaytma yangilangan, sahifada esa eski nusxa qolgan | Sahifani yangilang. |
| "GapirAI hisobiga kiring" yoki "Sessiya tugagan" | gapirai.uz dan chiqib ketgansiz | Saytga qayta kiring va **Kirdim, qayta tekshirish** tugmasini bosing. |
| "Inglizcha subtitr topilmadi" | Darsda subtitr yoʻq yoki hali yuklanmagan | Bir necha soniya kuting va **Qayta tekshirish** tugmasini bosing. Coursera pleyerida CC (subtitr) borligini tekshiring. |
| "Daqiqa yetarli emas" | Balans tugagan | **Daqiqa sotib olish →** tugmasini bosing. |
| Holat uzoq vaqt "Tarjima" da turibdi | Serverdagi AI provayderlar (NeuronAI va Gemini) balansi tugagan | Server tomonda hal qilinadi (pastdagi "Dasturchilar uchun" boʻlimiga qarang). |
| "GapirAI serveriga ulanib boʻlmadi" | Internet yoki server ishlamayapti | Internetni tekshiring. `https://api.gapirai.uz/health` ochilishini tekshiring. |
| Ovoz videodan orqada qolyapti | Internet sekin, audio hali yuklanmagan | Bir necha soniya kuting. Sinxron oʻzi toʻgʻrilanadi. |

---

## 6. Dasturchilar uchun

### Fayllar

- `manifest.json` — MV3, ruxsatlar: `youtube.com`, `coursera.org`, `gapirai.uz`, `api.gapirai.uz`.
- `src/background.js` — barcha API soʻrovlari shu yerdan ketadi (CORS'siz, `host_permissions`). Token sayt cookie'sidan (`auth_token`) olinadi. Oʻrnatish yoki yangilanishda ochiq YouTube va Coursera tablariga skriptlarni joylaydi (`INJECT` roʻyxati); eski nusxa oʻzini toʻxtatadi.
- `src/content.js` — YouTube: tugma va panel (Shadow DOM), audio sinxroni, subtitr.
- `src/coursera.js` — Coursera, quyida batafsil.
- `src/popup.*` — holat va **Dasturchi sozlamalari → Server** (gapirai.uz yoki lokal `localhost:3000` / `localhost:8000`).
- `store/` — Chrome Web Store uchun tavsif, rasmlar va `build.sh`.

### Coursera oqimi

1. **Subtitrni oʻqish.** `coursera.js` dars sahifasini aniqlaydi: `/learn/<kurs>/lecture/<id>`, SPA. Keyin `<track kind=captions srclang=en>` dan inglizcha VTT ni oʻqiydi. Bu ishlamasa, `video.textTracks` ishlatiladi.
2. **Soʻrov yuborish.** Cue'lar `POST /api/caption-dubs` ga yuboriladi: `platform=coursera`, `page_key`, `title`, `voice_gender`, `cues`.
3. **Serverda tayyorlash.**
   - Coursera ekran qatorlari toʻliq gaplarga birlashtiriladi (`merge_into_sentences`: `.?!`, 1 s dan uzun pauza yoki 14 s).
   - Daqiqa yechiladi va Celery vazifasi navbatga qoʻyiladi (`backend/workers/caption_dub_tasks.py`).
   - Vazifa tarjima qiladi, ovoz jinsini aniqlaydi va TTS qiladi (provayder tarifga qarab tanlanadi; balans tugasa butun ovoz Edge'da). Natija bitta WAV fayl.
   - Xato boʻlsa, daqiqa qaytariladi.
4. **Natijani olish.** Kengaytma `GET /api/caption-dubs/{id}` ni soʻrab turadi. Tayyor boʻlgach `audio_url` (WAV) va `cues_uz` (oʻzbekcha subtitr) keladi.

**Backend endpointlari** (`backend/api/caption_dub_routes.py`):

| Endpoint | Vazifasi |
|---|---|
| `POST /api/caption-dubs` | Yangi dublaj yaratadi. Bir xil subtitr va ovoz uchun mavjud dublajni bepul qaytaradi. Limit: 10 ta / 10 daqiqa. |
| `GET /api/caption-dubs/by-page?platform=&page_key=` | Shu dars boʻyicha foydalanuvchining oxirgi dublaji. |
| `GET /api/caption-dubs/{id}` | Holat. Faqat egasiga koʻrinadi. |
| `GET /api/caption-dubs/{id}/audio` | WAV fayl. UUID kalit vazifasini bajaradi, chunki audio teg sarlavha yubora olmaydi. |

Jadval: `caption_dubs`. Audio fayllar: `outputs/caption_dubs/<id>/dub.wav`.

### Server holatini tekshirish

```bash
docker logs --since 30m dubber_worker 2>&1 | grep -E "CAPTION|caption_dub"
```

`[CAPTION <id>] tayyor: N segment, <provayder>, <s> s` qatori ish tugaganini bildiradi.

Tarjima zanjiri:

1. NeuronAI — `NEURONAI_TRANSLATE_ENABLED=true` boʻlsa birinchi.
2. `TRANSLATE_PROVIDER` — `gemini` yoki `groq`.
3. Zaxiralar.

NeuronAI balansi tugasa (402), tarjima keyingi provayderga oʻtadi. 2026-11-21 dan beri tarjima vaqtincha `TRANSLATE_PROVIDER=groq`. NeuronAI toʻldirilgach `gemini` ga qaytariladi.

### Lokal sinov

Popup → **Dasturchi sozlamalari → Server → Lokal**. Chrome `coursera.org` yoki `youtube.com` dan `localhost` ga soʻrov yuborish uchun ruxsat soʻraydi (Local Network Access): ruxsat bering.

Backend testlari:

```bash
PYTHONPATH=. .venv/bin/python -m pytest -q backend/tests/test_caption_dubs.py
```
