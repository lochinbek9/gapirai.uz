-- "Ommaviy videolar" (/videos): admin chiqargan tayyor dublyajlar.
-- Additive/idempotent. PG16'da DEFAULT bilan ADD COLUMN faqat metadata -- tez,
-- lekin qisqa ACCESS EXCLUSIVE lock oladi; uzoq ochiq tranzaksiya bo'lsa kutib
-- qolmasligi uchun lock_timeout.
SET lock_timeout = '5s';
ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS published_at TIMESTAMP NULL;
CREATE INDEX IF NOT EXISTS ix_dubbing_jobs_public_published
    ON dubbing_jobs (published_at DESC) WHERE is_public;
