-- 2026-10-22: DubbingJob / VideoAnalysis modellariga qo'shilgan Gemini kalit
-- kuzatuv ustunlari (backend/models/database.py: gemini_key_tier,
-- gemini_key_used). Model o'zgargan, lekin migratsiya yozilmagan edi --
-- production bazasida ustunlar qo'lda qo'shilgan, boshqa har qanday bazada
-- (local, CI, yangi server) INSERT "column does not exist" bilan yiqilardi.
-- IF NOT EXISTS: allaqachon qo'shilgan bazada (production) hech narsa qilmaydi.

ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS gemini_key_tier VARCHAR(20);
ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS gemini_key_used VARCHAR(64);

ALTER TABLE video_analyses ADD COLUMN IF NOT EXISTS gemini_key_tier VARCHAR(20);
ALTER TABLE video_analyses ADD COLUMN IF NOT EXISTS gemini_key_used VARCHAR(64);
