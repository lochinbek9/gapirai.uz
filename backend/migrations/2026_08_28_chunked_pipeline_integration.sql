-- 2026-08-28  ai-dubbet (Denis-kaa) chunked-pipeline integration.
--
-- One-time manual ALTER, per this project's convention (see
-- backend/models/database.py:create_tables() docstring and
-- 2026_08_26_worker_lifecycle_claim.sql) -- never run via
-- Base.metadata.create_all() at startup, always applied directly and once.
-- Every statement is idempotent (IF NOT EXISTS) and safe to re-run.
--
-- All changes are ADDITIVE: new nullable / defaulted columns, new enum
-- values, one index. No DROP, no column-type change, no data migration.
-- Existing rows: NULL / 0 defaults, semantically "not applicable".
--
-- Companion migrations that must also be applied (order-independent):
--   2026_08_26_worker_lifecycle_claim.sql   (claim/lease columns + indexes)
--   2026_08_26_add_audio_mix_mode.sql       (dubbing_jobs.audio_mix_mode + CHECK)

-- ─────────────────────────────────────────────────────────────────────────
-- 1. JobStatus enum -- progressive-playback states (Denis chunked pipeline).
--    ALTER TYPE ... ADD VALUE cannot run inside a transaction block and the
--    added label cannot be used in the same transaction, so these run first,
--    each autocommitted on its own. IF NOT EXISTS requires PostgreSQL >= 12.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TYPE jobstatus ADD VALUE IF NOT EXISTS 'SPLITTING';
ALTER TYPE jobstatus ADD VALUE IF NOT EXISTS 'PROCESSING_CHUNKS';
ALTER TYPE jobstatus ADD VALUE IF NOT EXISTS 'PARTIALLY_READY';
ALTER TYPE jobstatus ADD VALUE IF NOT EXISTS 'PUBLISHING';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Column additions. lock_timeout guards against a queued ALTER blocking
--    (and being blocked behind) a live Celery transaction -- see the
--    incident documented in database.py. Fail fast instead of queuing.
-- ─────────────────────────────────────────────────────────────────────────
SET lock_timeout = '3s';

-- 2a. Learning Workspace / analysis cache (our WIP reliability line).
ALTER TABLE dubbing_jobs   ADD COLUMN IF NOT EXISTS linked_analysis_id UUID REFERENCES video_analyses(id);
ALTER TABLE video_analyses ADD COLUMN IF NOT EXISTS youtube_video_id VARCHAR(20);
ALTER TABLE video_analyses ADD COLUMN IF NOT EXISTS five_minute_summary JSONB;
CREATE INDEX IF NOT EXISTS ix_video_analyses_youtube_video_id ON video_analyses (youtube_video_id);

-- 2b. Progressive playback / HLS (Denis chunked pipeline). Inert until
--     ENABLE_CHUNKED_PIPELINE=true; chunks_ready/total default 0.
ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS hls_playlist_url  VARCHAR(500);
ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS chunks_ready      INTEGER DEFAULT 0;
ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS chunks_total      INTEGER DEFAULT 0;
ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS first_playable_at TIMESTAMP;
