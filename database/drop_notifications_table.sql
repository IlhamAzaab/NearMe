-- ======================================================================
-- DROP NOTIFICATIONS TABLE
-- ======================================================================
-- This script removes the deprecated notifications table completely
-- including all indexes, triggers, policies, and records.
-- 
-- IMPORTANT: Run this ONLY after verifying:
-- 1. All backend code uses notification_log (not notifications)
-- 2. All frontend code uses notification_log (not notifications)
-- 3. Push notification service logs to notification_log
-- 4. Test notifications work end-to-end
-- ======================================================================

-- Drop all dependent objects first (CASCADE will handle most, but being explicit is safer)

-- Drop policies (if any)
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Service role full access" ON public.notifications;

-- Drop triggers (if any)
DROP TRIGGER IF EXISTS update_notifications_updated_at ON public.notifications;

-- Drop indexes (CASCADE should handle these, but listing for visibility)
-- Note: Indexes are automatically dropped with the table
-- DROP INDEX IF EXISTS idx_notifications_recipient_id;
-- DROP INDEX IF EXISTS idx_notifications_created_at;
-- DROP INDEX IF EXISTS idx_notifications_is_read;

-- Drop the table (CASCADE removes all dependent objects)
DROP TABLE IF EXISTS public.notifications CASCADE;

-- Verify the table is gone
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
    RAISE NOTICE '✅ notifications table successfully dropped';
  ELSE
    RAISE NOTICE '❌ notifications table still exists';
  END IF;
END $$;

-- ======================================================================
-- VERIFICATION QUERIES
-- ======================================================================
-- Run these to verify notification_log is working:

-- 1. Check notification_log has recent data
-- SELECT COUNT(*), MAX(created_at) as latest_notification 
-- FROM public.notification_log;

-- 2. Check notification_log by user type
-- SELECT user_type, COUNT(*) as count 
-- FROM public.notification_log 
-- GROUP BY user_type;

-- 3. Sample recent notifications
-- SELECT user_type, title, body, created_at 
-- FROM public.notification_log 
-- ORDER BY created_at DESC 
-- LIMIT 10;
