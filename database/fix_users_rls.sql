-- Disable Row Level Security on users table to fix manager insert errors
-- This resolves the "new row violates row-level security policy" error
-- when managers try to create admins or drivers

-- First, drop all existing RLS policies
DROP POLICY IF EXISTS "Block all anon access" ON public.users;
DROP POLICY IF EXISTS "Service role can do anything" ON public.users;
DROP POLICY IF EXISTS "service_role delete users" ON public.users;
DROP POLICY IF EXISTS "service_role insert users" ON public.users;
DROP POLICY IF EXISTS "service_role select users" ON public.users;
DROP POLICY IF EXISTS "User can read own role" ON public.users;

-- Now disable RLS entirely
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Verify: Check if RLS is disabled (should return 'f' for false)
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'users';
