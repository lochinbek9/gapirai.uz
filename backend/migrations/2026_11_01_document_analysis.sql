-- 2026-11-01: hujjat tahlili + uzun material konspekti (backend/models/database.py
-- VideoAnalysis: material_digests, source_type, document_name, document_pages).
-- Kodni deploy qilishdan OLDIN ishga tushiring (deploy-setup: migratsiya pull'dan oldin).
-- IF NOT EXISTS: qayta ishga tushirish xavfsiz. lock_timeout: worker ochiq
-- tranzaksiyasi bo'lsa kutib qolmasdan xato beradi -- keyinroq qayta urinib ko'ring.

SET lock_timeout = '5s';
ALTER TABLE video_analyses ADD COLUMN IF NOT EXISTS material_digests JSONB;
ALTER TABLE video_analyses ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'video';
ALTER TABLE video_analyses ADD COLUMN IF NOT EXISTS document_name VARCHAR(255);
ALTER TABLE video_analyses ADD COLUMN IF NOT EXISTS document_pages INTEGER;
