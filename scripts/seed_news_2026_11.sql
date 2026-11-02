-- Birinchi haftalik "GapirAI.uz yangiliklari" xati uchun yangiliklar (2026-11, haqiqiy o'zgarishlar).
-- Ishga tushirish: ssh gapirai@173.212.220.188 'docker exec -i dubber_postgres psql -U dubber -d dubber_db' < scripts/seed_news_2026_11.sql
-- Keyingi yangiliklarni admin panel -> Xabarnomalar -> "Avtomatik email xatlar" dan qo'shing.
INSERT INTO site_news (title, body, link_url, link_text, created_at)
SELECT * FROM (VALUES
  ('Hujjat tahlili', 'Endi PDF, Word, PowerPoint va elektron kitoblarni yuklab, qisqa xulosa, asosiy fikrlar, konspekt va test oling. Skanerlangan PDF ham o''qiladi.', 'https://gapirai.uz/', 'Sinab ko''rish', now()),
  ('To''lov endi 4 usulda', 'Tarif yoki daqiqa paketini Click, Payme, Uzum yoki Paynet orqali to''lashingiz mumkin — qaysi biri qulay bo''lsa.', 'https://gapirai.uz/pricing', 'Tariflar', now()),
  ('Videoni do''stlaringiz bilan ulashing', 'Tayyor dublaj sahifasida "Ulashish" tugmasi paydo bo''ldi: havolani Telegram yoki WhatsApp''ga yuboring.', NULL, NULL, now())
) AS v(title, body, link_url, link_text, created_at)
WHERE NOT EXISTS (SELECT 1 FROM site_news WHERE title = v.title);
