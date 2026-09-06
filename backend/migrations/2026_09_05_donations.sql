-- 2026-09-05  Loyihaga ixtiyoriy donat (qo'llab-quvvatlash). Mavjud Click/
-- Payme to'lov infratuzilmasini qayta ishlatadi -- donat = job/plan/paket
-- bilan bog'lanmagan Payment (is_library_access bilan bir xil naqsh).
-- Idempotent, additiv. Bir martalik qo'lda:
--     docker compose exec -T postgres psql -U dubber -d dubber_db < backend/migrations/2026_09_05_donations.sql

ALTER TABLE payments ADD COLUMN IF NOT EXISTS is_donation   BOOLEAN NOT NULL DEFAULT FALSE;
-- Donat qiluvchi login qilmagan bo'lishi mumkin (user_id NULL) -- shu yerda
-- ixtiyoriy ravishda o'zini tanishtiradi. HECH BIR maydon majburiy emas.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS donor_name    VARCHAR(120);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS donor_email   VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS donor_message VARCHAR(500);

-- Tasdiqlangan donatlar ro'yxati (admin / kelajakdagi "qo'llab-quvvatlovchilar"
-- devori) tez chiqishi uchun.
CREATE INDEX IF NOT EXISTS ix_payments_donation
    ON payments (created_at DESC)
    WHERE is_donation = TRUE AND status = 'Approved';
