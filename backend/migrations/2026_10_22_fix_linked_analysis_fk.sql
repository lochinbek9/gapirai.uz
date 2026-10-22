-- 2026-10-22 Fix linked_analysis_id foreign key constraint to ON DELETE SET NULL
-- Fixes IntegrityError when deleting a video analysis that is referenced by a dubbing job.

ALTER TABLE dubbing_jobs DROP CONSTRAINT IF EXISTS fk_dubbing_jobs_linked_analysis_id;
ALTER TABLE dubbing_jobs DROP CONSTRAINT IF EXISTS dubbing_jobs_linked_analysis_id_fkey;

ALTER TABLE dubbing_jobs ADD CONSTRAINT fk_dubbing_jobs_linked_analysis_id
    FOREIGN KEY (linked_analysis_id) REFERENCES video_analyses(id) ON DELETE SET NULL;
