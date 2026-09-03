-- 2026-09-03  Avtomatik to'lov (rekurrent) — karta tokeni bilan obunani
-- avtomatik uzaytirish (auto-renew) va daqiqa balansi tugaganda avtomatik
-- to'ldirish (auto top-up). Idempotent, additiv. Bir martalik qo'lda ishga
-- tushiriladi:
--     PYTHONPATH=. psql "$DATABASE_URL" -f backend/migrations/2026_09_03_recurring_payments.sql
--
-- Provayder API'lari (Click card_token, Payme cards) merchant akkauntda
-- ALOHIDA yoqilishi kerak. Yoqilmaguncha kod feature-flag orqali o'chiq
-- turadi (CLICK_CARD_TOKEN_ENABLED / PAYME_CARD_TOKEN_ENABLED = false).

-- Bog'langan kartalar. DIQQAT: bu jadvalda PAN (karta raqami) yoki CVV
-- HECH QACHON saqlanmaydi — faqat provayder bergan qayta ishlatiladigan
-- token va niqoblangan raqam.
CREATE TABLE IF NOT EXISTS payment_cards (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id),
    provider         VARCHAR(20) NOT NULL,          -- 'click' | 'payme'
    token            TEXT NOT NULL,
    card_mask        VARCHAR(30),                   -- '860049******1234'
    card_type        VARCHAR(20),                   -- 'uzcard' | 'humo'
    expire           VARCHAR(5),                    -- 'MM/YY' (faqat ma'lumot uchun)
    phone_hint       VARCHAR(20),                   -- OTP yuborilgan niqoblangan raqam
    is_active        BOOLEAN NOT NULL DEFAULT FALSE,-- SMS tasdiqdan keyin true
    is_default       BOOLEAN NOT NULL DEFAULT FALSE,
    consent_at       TIMESTAMP,                     -- foydalanuvchi avtomatik yechishga rozilik bergan vaqt
    last_charged_at  TIMESTAMP,
    last_error       TEXT,
    created_at       TIMESTAMP DEFAULT now(),
    updated_at       TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_payment_cards_user_id ON payment_cards (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_cards_provider_token ON payment_cards (provider, token);

-- Obuna: avtomatik uzaytirish + avtomatik to'ldirish sozlamalari
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS auto_renew            BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS auto_renew_plan       VARCHAR(20);     -- 'standard' | 'pro' | 'standard_yearly' | 'pro_yearly'
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS renew_failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS renew_last_attempt_at TIMESTAMP;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS grace_until           TIMESTAMP;       -- shu vaqtgacha tarif imtiyozlari saqlanadi (qayta urinishlar davri)
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS auto_topup_enabled    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS auto_topup_pack       INTEGER;         -- afzal ko'rilgan paket (30/60/120/300); NULL = kamchilikni qoplaydigan eng kichigi

-- To'lov: qaysi karta bilan, avtomatikmi, va bajarilganlik belgisi
ALTER TABLE payments ADD COLUMN IF NOT EXISTS card_id      UUID REFERENCES payment_cards(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS is_auto      BOOLEAN NOT NULL DEFAULT FALSE;
-- fulfilled_at: apply_successful_payment() bir marta bajarilishini kafolatlaydi
-- (webhook va to'g'ridan-to'g'ri API javobi poygaga kirsa ham ikki marta
-- kredit berilmasin).
ALTER TABLE payments ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMP;
