-- 2026-08-26 Celery worker-lifecycle audit remediation.
-- One-time manual ALTER TABLE, per this project's established convention
-- (see backend/models/database.py:create_tables() docstring) -- never run
-- via Base.metadata.create_all() at app startup, always applied directly
-- and once. Safe to re-run (IF NOT EXISTS / idempotent).
--
-- lock_timeout guards against the exact incident documented in
-- database.py: a long-queued ALTER TABLE blocking (and being blocked
-- behind) a live Celery transaction can stall the whole site. If the lock
-- can't be acquired quickly, this fails fast instead of queuing.
SET lock_timeout = '3s';

ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS processing_claim_token VARCHAR(64);
ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS processing_lease_expires_at TIMESTAMP;
ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS recovery_attempt_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE video_analyses ADD COLUMN IF NOT EXISTS processing_claim_token VARCHAR(64);
ALTER TABLE video_analyses ADD COLUMN IF NOT EXISTS processing_lease_expires_at TIMESTAMP;
ALTER TABLE video_analyses ADD COLUMN IF NOT EXISTS recovery_attempt_count INTEGER NOT NULL DEFAULT 0;

-- Recovery/claim lookups filter on these columns for every non-terminal
-- job on every backend restart and every task start -- index keeps that
-- cheap as the tables grow.
CREATE INDEX IF NOT EXISTS ix_dubbing_jobs_claim_lease ON dubbing_jobs (processing_lease_expires_at);
CREATE INDEX IF NOT EXISTS ix_video_analyses_claim_lease ON video_analyses (processing_lease_expires_at);
