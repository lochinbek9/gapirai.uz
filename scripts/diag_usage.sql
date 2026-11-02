-- Foydalanuvchilar saytni haqiqatan ishlatyaptimi / qayerda qoqilyapti?
-- Faqat O'QIYDI (READ ONLY tranzaksiya). Oxirgi 7 kun, Toshkent vaqti, ichki/test hisoblarsiz.
-- Ishga tushirish (prod):  ssh gapirai@173.212.220.188 'docker exec -i dubber_postgres psql -U dubber -d dubber_db -P pager=off' < scripts/diag_usage.sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';

\echo '=== 1. Kunlar kesimida: kirganlar -> nima qilganlar (Toshkent sanasi) ==='
WITH days AS (SELECT generate_series((now() + interval '5 hours')::date - 6, (now() + interval '5 hours')::date, '1 day')::date AS d),
v AS (SELECT DISTINCT dv.user_id, (COALESCE(dv.last_seen_at, dv.visit_date) + interval '5 hours')::date AS d
      FROM user_daily_visits dv JOIN (SELECT id FROM users WHERE is_internal IS NOT TRUE) u ON u.id = dv.user_id),
j AS (SELECT user_id, (created_at + interval '5 hours')::date AS d, status::text AS st FROM dubbing_jobs WHERE user_id IN (SELECT id FROM users WHERE is_internal IS NOT TRUE)),
a AS (SELECT user_id, (created_at + interval '5 hours')::date AS d FROM video_analyses WHERE user_id IN (SELECT id FROM users WHERE is_internal IS NOT TRUE))
SELECT days.d AS sana,
  (SELECT count(*) FROM v WHERE v.d = days.d) AS kirgan,
  (SELECT count(*) FROM users u WHERE u.is_internal IS NOT TRUE AND (u.created_at + interval '5 hours')::date = days.d) AS yangi_royxat,
  (SELECT count(DISTINCT user_id) FROM j WHERE j.d = days.d) AS dublaj_yuborgan,
  (SELECT count(DISTINCT user_id) FROM a WHERE a.d = days.d) AS tahlil_qilgan,
  (SELECT count(*) FROM v WHERE v.d = days.d AND v.user_id NOT IN (SELECT user_id FROM j WHERE j.d = days.d) AND v.user_id NOT IN (SELECT user_id FROM a WHERE a.d = days.d)) AS hech_narsa_qilmagan,
  (SELECT count(*) FROM j WHERE j.d = days.d) AS jami_dublaj,
  (SELECT count(*) FROM j WHERE j.d = days.d AND st = 'COMPLETED') AS tayyor,
  (SELECT count(*) FROM j WHERE j.d = days.d AND st = 'FAILED') AS xato,
  (SELECT count(*) FROM j WHERE j.d = days.d AND st = 'AWAITING_PAYMENT') AS tolov_kutmoqda
FROM days ORDER BY days.d;

\echo '=== 2. Dublaj xatolari (7 kun): qaysi xato, nechta, nechta odamda ==='
SELECT COALESCE(error_code, '-') AS kod, count(*) AS soni, count(DISTINCT user_id) AS odam,
       left(max(error_message), 90) AS namuna
FROM dubbing_jobs
WHERE status::text = 'FAILED' AND created_at > now() - interval '7 days' AND user_id IN (SELECT id FROM users WHERE is_internal IS NOT TRUE)
GROUP BY 1 ORDER BY 2 DESC LIMIT 15;

\echo '=== 3. Hozir qotib qolgan / uzoq kutayotgan dublajlar (30 daqiqadan beri yangilanmagan) ==='
SELECT status::text, count(*), min(updated_at) AS eng_eski
FROM dubbing_jobs
WHERE status::text NOT IN ('COMPLETED','FAILED','AWAITING_PAYMENT') AND updated_at < now() - interval '30 minutes'
GROUP BY 1;

\echo '=== 4. Tayyor bo''lish vaqti (7 kun, tayyor dublajlar): mediana / 90% ==='
SELECT count(*) AS tayyor,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM completed_at - created_at)) / 60) AS mediana_daq,
  round(percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM completed_at - created_at)) / 60) AS p90_daq,
  round(avg(video_duration) / 60) AS ortacha_video_daq
FROM dubbing_jobs
WHERE status::text = 'COMPLETED' AND completed_at IS NOT NULL AND created_at > now() - interval '7 days'
  AND source_job_id IS NULL AND user_id IN (SELECT id FROM users WHERE is_internal IS NOT TRUE);

\echo '=== 5. Tahlil (7 kun): holat va xatolar ==='
SELECT status::text, COALESCE(error_code, '-') AS kod, count(*) FROM video_analyses
WHERE created_at > now() - interval '7 days' AND user_id IN (SELECT id FROM users WHERE is_internal IS NOT TRUE)
GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 12;

\echo '=== 6. To''lovlar (7 kun): tizim va holat ==='
SELECT provider::text, status::text, count(*) AS soni, sum(amount)::bigint AS summa
FROM payments WHERE created_at > now() - interval '7 days' AND is_donation IS NOT TRUE
GROUP BY 1, 2 ORDER BY 1, 2;

\echo '=== 7. Ro''yxatdan o''tib, umuman hech narsa qilmaganlar (oxirgi 30 kun ro''yxatdan o''tganlar) ==='
SELECT count(*) AS royxatdan_otgan,
  count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM dubbing_jobs j WHERE j.user_id = u.id)
                     AND NOT EXISTS (SELECT 1 FROM video_analyses a WHERE a.user_id = u.id)) AS hech_narsa_qilmagan,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM dubbing_jobs j WHERE j.user_id = u.id AND j.status::text = 'COMPLETED')) AS kamida_1_tayyor_dublaj
FROM users u WHERE u.is_internal IS NOT TRUE AND u.created_at > now() - interval '30 days';

\echo '=== 8. Qaytib kirgan, lekin 7 kunda bitta ham dublaj/tahlil tayyor bo''lmaganlar (eng faol 15) ==='
SELECT left(u2.email, 3) || '***' AS email, count(DISTINCT dv.visit_date) AS kirgan_kun,
  (SELECT count(*) FROM dubbing_jobs j WHERE j.user_id = u2.id AND j.created_at > now() - interval '7 days') AS dublaj_urinish,
  (SELECT count(*) FROM dubbing_jobs j WHERE j.user_id = u2.id AND j.created_at > now() - interval '7 days' AND j.status::text = 'FAILED') AS xato,
  (SELECT count(*) FROM dubbing_jobs j WHERE j.user_id = u2.id AND j.created_at > now() - interval '7 days' AND j.status::text = 'AWAITING_PAYMENT') AS tolov_kutgan,
  (SELECT plan::text FROM subscriptions s WHERE s.user_id = u2.id LIMIT 1) AS tarif
FROM user_daily_visits dv JOIN users u2 ON u2.id = dv.user_id
WHERE u2.is_internal IS NOT TRUE AND dv.visit_date > now() - interval '7 days'
  AND NOT EXISTS (SELECT 1 FROM dubbing_jobs j WHERE j.user_id = u2.id AND j.created_at > now() - interval '7 days' AND j.status::text = 'COMPLETED')
  AND NOT EXISTS (SELECT 1 FROM video_analyses a WHERE a.user_id = u2.id AND a.created_at > now() - interval '7 days' AND a.status::text = 'COMPLETED')
GROUP BY u2.id, u2.email HAVING count(DISTINCT dv.visit_date) >= 2
ORDER BY kirgan_kun DESC LIMIT 15;

\echo '=== 9. Kvota tugaganlar: bepul tarifda daqiqasi 0 qolgan faol (7 kun kirgan) foydalanuvchilar ==='
SELECT count(*) AS soni FROM subscriptions s
WHERE s.plan::text IN ('FREE','free')
  AND s.user_id IN (SELECT user_id FROM user_daily_visits WHERE visit_date > now() - interval '7 days')
  AND s.user_id IN (SELECT id FROM users WHERE is_internal IS NOT TRUE)
  AND COALESCE(s.monthly_minutes_used, 0) >= 5   -- bepul oylik limit (backend/services/plans.py)
  AND COALESCE(s.purchased_minutes, 0) <= 0;

ROLLBACK;
