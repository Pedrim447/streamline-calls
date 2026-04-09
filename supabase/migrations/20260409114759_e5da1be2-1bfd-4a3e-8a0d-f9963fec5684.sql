-- Remove unused columns from tickets
ALTER TABLE public.tickets DROP COLUMN IF EXISTS cancel_reason;

-- Remove unused columns from profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS avatar_url;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS current_session_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS last_login_at;

-- Remove unused columns from settings
ALTER TABLE public.settings DROP COLUMN IF EXISTS max_retry_attempts;
ALTER TABLE public.settings DROP COLUMN IF EXISTS lock_timeout_seconds;

-- Clean old completed/cancelled/skipped tickets (older than 7 days)
DELETE FROM public.tickets 
WHERE status IN ('completed', 'cancelled', 'skipped') 
AND created_at < NOW() - INTERVAL '7 days';