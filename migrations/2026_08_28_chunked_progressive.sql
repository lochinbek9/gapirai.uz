-- 2026-08-28  Denis-kaa/ai-dubbet feature/chunked-pipeline-gpu -> ai-dubber (Variant 2).
--
-- One-time manual ALTER, per this project's convention (see
-- backend/models/database.py:create_tables() docstring and
-- 2026_08_26_worker_lifecycle_claim.sql). Every statement is idempotent
-- (IF NOT EXISTS) and safe to re-run. All changes ADDITIVE: new nullable /
-- defaulted columns and new enum values. No DROP, no type change.
--
-- Companion migration (order-independent):
--   2026_08_26_worker_lifecycle_claim.sql  (processing_claim_token /
--   processing_lease_expires_at / recovery_attempt_count on dubbing_jobs +
--   video_analyses, + the two claim/lease indexes)

-- ─────────────────────────────────────────────────────────────────────────
-- 1. JobStatus enum -- progressive-playback states. ALTER TYPE ... ADD VALUE
--    cannot run inside a transaction and the label cannot be used in the
--    same transaction, so these run first, each autocommitted. IF NOT EXISTS
--    requires PostgreSQL >= 12.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TYPE jobstatus ADD VALUE IF NOT EXISTS 'SPLITTING';
ALTER TYPE jobstatus ADD VALUE IF NOT EXISTS 'PROCESSING_CHUNKS';
ALTER TYPE jobstatus ADD VALUE IF NOT EXISTS 'PARTIALLY_READY';
ALTER TYPE jobstatus ADD VALUE IF NOT EXISTS 'PUBLISHING';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Column additions on dubbing_jobs.
--    lock_timeout guards against a queued ALTER blocking (and being blocked
--    behind) a live Celery transaction -- fail fast instead of queuing.
-- ─────────────────────────────────────────────────────────────────────────
SET lock_timeout = '3s';

-- Per-job audio output selection ("dubbed_only" | "ducked_mix"). NULL rows
-- fall back to config.AUDIO_MIX_MODE. Recognised-value CHECK constraint.
ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS audio_mix_mode VARCHAR(20);
ALTER TABLE dubbing_jobs DROP CONSTRAINT IF EXISTS ck_dubbing_jobs_audio_mix_mode;
ALTER TABLE dubbing_jobs ADD CONSTRAINT ck_dubbing_jobs_audio_mix_mode
    CHECK (audio_mix_mode IS NULL OR audio_mix_mode IN ('dubbed_only', 'ducked_mix'));

-- Progressive playback / HLS (chunked pipeline). Inert until
-- ENABLE_CHUNKED_PIPELINE=true; chunks_ready/total default 0.
ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS hls_playlist_url  VARCHAR(500);
ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS chunks_ready      INTEGER DEFAULT 0;
ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS chunks_total      INTEGER DEFAULT 0;
ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS first_playable_at TIMESTAMP;
