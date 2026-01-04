-- ============================================================================
-- DISABLE RLS ON ALL TABLES
-- ============================================================================
-- This prevents "new row violates row-level security policy" errors
-- when using the service role key in the backend.
-- 
-- Why disable RLS?
-- - Backend uses service role (full admin access)
-- - Users don't access database directly
-- - API endpoints handle authorization with JWT tokens
-- - Simplifies development and prevents policy conflicts
-- ============================================================================

-- Core tables
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.managers DISABLE ROW LEVEL SECURITY;

-- Admin & Restaurant tables (may already be disabled)
ALTER TABLE public.admins DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_bank_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_contracts DISABLE ROW LEVEL SECURITY;

-- Driver tables
ALTER TABLE public.drivers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_vehicle_license DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_bank_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_contracts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_status_log DISABLE ROW LEVEL SECURITY;

-- Optional: Verify RLS is disabled (should return 'f' for all)
-- SELECT 
--   tablename, 
--   rowsecurity AS rls_enabled
-- FROM pg_tables t
-- JOIN pg_class c ON c.relname = t.tablename
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'users', 'managers', 'admins', 'restaurants', 
--     'restaurant_bank_accounts', 'restaurant_contracts',
--     'drivers', 'driver_vehicle_license', 'driver_documents',
--     'driver_bank_accounts', 'driver_contracts', 'driver_status_log'
--   )
-- ORDER BY tablename;
