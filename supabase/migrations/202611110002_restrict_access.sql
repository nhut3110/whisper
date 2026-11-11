-- Supabase only. No direct browser read/write or public RPC.
ALTER TABLE public.hush_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hush_messages FROM PUBLIC, anon, authenticated;
-- No RLS policies: default deny for public API roles.
-- The Rust backend connects via a private database connection, never an anon key.
