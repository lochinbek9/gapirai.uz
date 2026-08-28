-- 2026-08-28  Restore /learn (Learning Workspace) into integrate/v2 (main).
--
-- One-time manual ALTER, per this project's convention (see
-- backend/models/database.py:create_tables() docstring). Every statement is
-- idempotent (IF NOT EXISTS) and safe to re-run. All changes ADDITIVE: new
-- nullable columns + one FK + one index. No DROP, no type change.
--
-- Backs backend/api/learn_routes.py + backend/services/video_analysis.py +
-- backend/workers/analysis_tasks.py (all restored from integrate/base).

SET lock_timeout = '3s';

-- ─────────────────────────────────────────────────────────────────────────
-- 1. dubbing_jobs.linked_analysis_id -- the VideoAnalysis that /api/learn
--    created alongside this job. NULL for ordinary dubbing jobs.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS linked_analysis_id UUID;
ALTER TABLE dubbing_jobs DROP CONSTRAINT IF EXISTS fk_dubbing_jobs_linked_analysis_id;
ALTER TABLE dubbing_jobs ADD CONSTRAINT fk_dubbing_jobs_linked_analysis_id
    FOREIGN KEY (linked_analysis_id) REFERENCES video_analyses(id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. video_analyses.youtube_video_id -- cross-user analysis cache key
--    (same pattern as dubbing_jobs.youtube_video_id).
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE video_analyses ADD COLUMN IF NOT EXISTS youtube_video_id VARCHAR(20);
CREATE INDEX IF NOT EXISTS ix_video_analyses_youtube_video_id
    ON video_analyses (youtube_video_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. video_analyses.five_minute_summary -- "5 daqiqada" study digest
--    (Learning Workspace: FiveMinuteTab).
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE video_analyses ADD COLUMN IF NOT EXISTS five_minute_summary JSONB;
