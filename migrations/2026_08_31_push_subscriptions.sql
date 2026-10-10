-- 2026-08-31  PWA Web Push obunalari (backend/services/push_service.py).
-- Idempotent, additiv. Bir martalik qo'lda ishga tushiriladi.

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    endpoint    TEXT NOT NULL UNIQUE,
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    user_agent  VARCHAR(300),
    created_at  TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_push_subscriptions_user_id ON push_subscriptions (user_id);
