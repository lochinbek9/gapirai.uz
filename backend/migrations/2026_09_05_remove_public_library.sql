-- 2026-09-05  Ommaviy videolar kutubxonasini ("/library") butunlay olib
-- tashlash. Foydalanuvchilar endi boshqalarning dublyaj qilingan videolarini
-- ko'ra olmaydi.
--
-- DIQQAT: bu DEDUP KESHINI O'CHIRMAYDI. job_creation.py'dagi kesh (bir xil
-- YouTube video qayta so'ralganda tayyor natijani qayta ishlatish)
-- DubbingJob.youtube_video_id / source_job_id / storage_id orqali ishlaydi
-- va butunlay o'zgarishsiz qoladi -- dublyaj qilingan videolar avvalgidek
-- keshda saqlanib turaveradi.
--
-- Bir martalik qo'lda:
--     docker compose exec -T postgres psql -U dubber -d dubber_db < backend/migrations/2026_09_05_remove_public_library.sql
--
-- Ixtiyoriy -- drop'dan oldin kim kutubxona kirish sotib olganini ko'rish:
--     SELECT id, email, phone, library_access_purchased_at
--       FROM users WHERE library_access_purchased_at IS NOT NULL;

ALTER TABLE payments DROP COLUMN IF EXISTS is_library_access;
ALTER TABLE users    DROP COLUMN IF EXISTS library_access_purchased_at;
