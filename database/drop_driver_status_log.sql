-- Drop driver_status_log table and all related objects
-- Run this in Supabase SQL editor

-- Drop the trigger first (before dropping the function)
DROP TRIGGER IF EXISTS log_driver_status ON drivers;

-- Drop the trigger function
DROP FUNCTION IF EXISTS log_driver_status_change();

-- Drop the indexes
DROP INDEX IF EXISTS idx_status_log_driver;
DROP INDEX IF EXISTS idx_status_log_date;

-- Drop any policies
DROP POLICY IF EXISTS "Service role full access to status log" ON public.driver_status_log;

-- Drop the table
DROP TABLE IF EXISTS public.driver_status_log CASCADE;

-- Verify it's gone
SELECT 'driver_status_log table and related objects dropped successfully' AS result;
