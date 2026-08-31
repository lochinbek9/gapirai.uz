-- 2026-08-31  Minute-based subscription quota + purchasable minute packs.
--
-- One-time manual ALTER, per this project's convention (see
-- backend/models/database.py:create_tables() docstring). Every statement is
-- idempotent (IF NOT EXISTS). All changes ADDITIVE. Safe to re-run.
--
-- Model change: subscriptions are no longer "N videos / period, unlimited
-- duration". Each plan grants a monthly MINUTE budget (Free 25 / Standard
-- 300 / Pro 400). Minutes are metered by real video duration. When the
-- monthly budget runs out, the user buys a minute pack (+30/+60/+120/+300)
-- -- purchased minutes never expire and roll over. See backend/services/plans.py.

SET lock_timeout = '3s';

-- subscriptions: monthly usage (resets every billing cycle) + purchased
-- balance (never resets, rolls over).
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS monthly_minutes_used DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS purchased_minutes    DOUBLE PRECISION NOT NULL DEFAULT 0;

-- payments: a minute-pack purchase sets minutes_purchased (the pack size in
-- minutes) instead of job_id / plan / is_library_access.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS minutes_purchased INTEGER;

-- Existing paid subscribers: start their first minute cycle fresh.
UPDATE subscriptions SET monthly_minutes_used = 0 WHERE monthly_minutes_used IS NULL;
