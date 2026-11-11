-- Supabase only: enable pg_cron in Dashboard > Database > Extensions first.
-- Independent TTL cleanup even when the Rust server is asleep/offline.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('hush-expiry', '* * * * *',
  $$DELETE FROM public.hush_messages WHERE expires_at <= EXTRACT(EPOCH FROM now())::bigint OR attempts >= 5$$);
