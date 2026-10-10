-- "Subtitr" rejimi (dublyajsiz, faqat transkripsiya+tarjima+VTT/SRT).
-- Additive/idempotent -- mavjud qatorlar uchun default FALSE (oddiy dublyaj).
ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS subtitle_only BOOLEAN NOT NULL DEFAULT FALSE;
