# Chrome Web Store — topshirish uchun materiallar

Hammasi shu papkada:

| Nima | Fayl |
|---|---|
| Kengaytma arxivi (yuklanadi) | `dist/gapirai-youtube-<versiya>.zip` — `store/build.sh` bilan yig'iladi |
| Skrinshotlar (1280×800) | `assets/screenshot-1-playing.png`, `assets/screenshot-2-new.png`, `assets/screenshot-3-account.png` |
| Kichik promo rasm (440×280) | `assets/promo-small-440x280.png` |
| Katta promo rasm (1400×560, ixtiyoriy) | `assets/promo-marquee-1400x560.png` |
| Ikonka (128×128) | arxiv ichida — `icons/icon128.png` |
| Maxfiylik siyosati | https://gapirai.uz/privacy#chrome-extension |

---

## 1. Dasturchi hisobi (bir marta)

1. https://chrome.google.com/webstore/devconsole — gapirai.uz'ga tegishli Google hisobi bilan kiring.
2. Bir martalik **5 $** roʻyxatdan oʻtish toʻlovini toʻlang va elektron pochtani tasdiqlang.
3. **Account** boʻlimida nashriyotchi nomini `GapirAI` qilib qoʻying, aloqa uchun elektron pochta kiriting va tasdiqlang.
4. **Trader / non-trader** soʻralsa: GapirAI daqiqa sotadi, demak **Trader**. Bunda Yevropa foydalanuvchilariga manzil va telefon raqami koʻrsatiladi.

## 2. Yangi element

**Items → New item** → `dist/gapirai-youtube-0.1.2.zip` ni yuklang.

## 3. Store listing

**Til:** asosiy matn oʻzbekcha. Roʻyxatda oʻzbek tili boʻlmasa, standart til sifatida English'ni tanlab, quyidagi inglizcha matnni qoʻying.

**Nomi** (manifestdan olinadi): `GapirAI — YouTube oʻzbekcha`

**Qisqa tavsif** (manifestdan olinadi, 132 belgigacha):
> YouTube videolarini oʻzbekcha ovoz va subtitr bilan tomosha qiling.

**Toʻliq tavsif (oʻzbekcha):**

```
YouTube'dagi istalgan videoni oʻzbek tilida tomosha qiling — GapirAI uni oʻzbekcha ovozlashtiradi va subtitr qoʻshadi.

Qanday ishlaydi
• YouTube'da videoni oching va pleyerning chap yuqori burchagidagi «UZ» tugmasini bosing.
• Narxi (daqiqa) va balansingiz oldindan koʻrinadi. «Dublaj qilish»ni bosing — odatda bir necha daqiqada tayyor boʻladi.
• Tayyor boʻlgach oʻzbekcha ovoz avtomatik yoqiladi va video bilan sinxron ijro etiladi: pauza, oldinga-orqaga oʻtkazish, tezlik (0.5×–2×) — hammasiga ergashadi. Reklama paytida dublaj kutib turadi.
• Oʻzbekcha subtitr pleyer ustida chiqadi.
• Asl ovoz darajasini oʻzingiz tanlaysiz — fon musiqasini saqlab qolish uchun.

Qulayliklar
• Alohida login yoʻq: brauzerda gapirai.uz'ga kirgan boʻlsangiz, kengaytma oʻsha hisobdan foydalanadi.
• Avval dublaj qilgan videolaringiz qayta toʻlovsiz ochiladi.
• Erkak, ayol yoki avtomatik ovoz.

Talablar
• gapirai.uz hisobi. Dublaj saytdagi daqiqalar hisobidan yechiladi; yangi foydalanuvchilarga bepul daqiqalar beriladi.

Maxfiylik
Kengaytma faqat YouTube video sahifalarida ishlaydi, reklama va kuzatuv vositalarisiz. Batafsil: https://gapirai.uz/privacy#chrome-extension
```

**Full description (English):**

```
Watch any YouTube video in Uzbek — GapirAI dubs it with an Uzbek voice and adds Uzbek subtitles.

How it works
• Open a YouTube video and click the "UZ" button in the top-left corner of the player.
• You see the cost (in minutes) and your balance up front. Click "Dublaj qilish" — the dub is usually ready in a few minutes.
• When it's ready, the Uzbek voice turns on automatically and stays in sync with the video: pause, seeking, playback speed (0.5×–2×). During ads the dub waits.
• Uzbek subtitles are shown over the player.
• You choose how loud the original audio stays, so background music is kept.

Highlights
• No separate login: if you are signed in to gapirai.uz in this browser, the extension uses that account.
• Videos you have dubbed before open again at no extra cost.
• Male, female or automatic voice.

Requirements
• A gapirai.uz account. Dubbing uses minutes from your GapirAI balance; new users get free minutes.

Privacy
The extension only runs on YouTube video pages and contains no ads or trackers. Details: https://gapirai.uz/privacy#chrome-extension
```

**Kategoriya:** `Accessibility` (muqobil: `Education`)

**Til:** Uzbek (yoki English — yuqoridagi izohga qarang)

**Rasmlar:** ikonka arxivdan olinadi. 3 ta skrinshot va kichik promo rasmni yuklang; katta promo rasm ixtiyoriy.

**Sayt:** https://gapirai.uz  ·  **Yordam:** https://t.me/gapir_uz_muhokama

## 4. Privacy practices

**Single purpose:**
> Lets users watch YouTube videos with an Uzbek dubbed voice track and Uzbek subtitles produced by their GapirAI (gapirai.uz) account.

**Permission justification:**

| Ruxsat | Izoh (inglizcha, shundayicha qoʻying) |
|---|---|
| `cookies` | Reads the gapirai.uz sign-in cookie (auth_token) so requests to api.gapirai.uz are made as the signed-in user. No other cookies are read. |
| `storage` | Stores the user's playback preferences (original-audio level, subtitles on/off, preferred voice) locally. |
| `scripting` | On install/update, injects the extension's own content script into YouTube tabs that are already open, so the user does not have to reload them. |
| Host `https://www.youtube.com/*` | Shows the "UZ" button and panel on YouTube video pages and plays the Uzbek audio and subtitles in sync with the video. |
| Host `https://gapirai.uz/*` | Needed to read the gapirai.uz sign-in cookie (see `cookies`). |
| Host `https://api.gapirai.uz/*` | GapirAI API: looks up the user's existing dubs, starts a dub, polls its progress, loads the audio and subtitles. |

**Remote code:** `No, I am not using remote code`. Barcha JS arxiv ichida; serverdan faqat JSON, audio va VTT keladi.

**Data usage** — belgilang:
- [x] **Authentication information** — gapirai.uz sign-in token (faqat api.gapirai.uz ga yuboriladi).
- [x] **Web history** — ochilgan YouTube videosining ID'si (faqat foydalanuvchi GapirAI'ga kirgan boʻlsa, tayyor dublajni topish uchun).
- Qolganlari (PII, health, financial, location, personal communications, user activity, website content) — belgilanmaydi.

Uchala tasdiqni ham belgilang:
- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** `https://gapirai.uz/privacy#chrome-extension`

## 5. Distribution

- **Visibility:** avval `Unlisted` — faqat havola orqali ochiladi, oʻzingiz sinab koʻrasiz; keyin `Public`.
- **Regions:** All regions.

## 6. Yuborish

**Submit for review.** Koʻrib chiqish odatda 1–3 ish kuni davom etadi. `cookies` va `scripting` ruxsatlari tufayli biroz uzoqroq choʻzilishi mumkin.

---

### Yangi versiya chiqarish
1. `manifest.json` da `version` ni oshiring.
2. `integrations/chrome-extension/store/build.sh` ni ishga tushiring.
3. Developer Dashboard → element → **Package → Upload new package** → **Submit for review**.
