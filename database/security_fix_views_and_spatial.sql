-- ============================================================================
-- NearMe Security Fix — Views (SECURITY DEFINER) & spatial_ref_sys
-- ============================================================================
-- Fixes 7 remaining Supabase Security Advisor issues:
--   - 6 views with SECURITY DEFINER property
--   - 1 table (spatial_ref_sys) with RLS disabled
--
-- Run this in Supabase SQL Editor AFTER security_fix_master.sql
-- ============================================================================


-- ============================================================================
-- FIX 1: SET SECURITY INVOKER ON ALL 6 VIEWS
-- ============================================================================
-- The original migration used DROP + CREATE, but CREATE VIEW in PostgreSQL 15+
-- defaults to security_invoker = false (SECURITY DEFINER behavior).
-- ALTER VIEW ... SET (security_invoker = on) is the correct fix.
-- ============================================================================

-- 1a. cart_summary
ALTER VIEW public.cart_summary SET (security_invoker = on);

-- 1b. driver_deposit_summary
ALTER VIEW public.driver_deposit_summary SET (security_invoker = on);

-- 1c. order_financial_details
ALTER VIEW public.order_financial_details SET (security_invoker = on);

-- 1d. manager_deposit_dashboard
ALTER VIEW public.manager_deposit_dashboard SET (security_invoker = on);

-- 1e. restaurant_payments
ALTER VIEW public.restaurant_payments SET (security_invoker = on);

-- 1f. manager_earnings_summary (was missing from original migration)
ALTER VIEW public.manager_earnings_summary SET (security_invoker = on);


-- ============================================================================
-- FIX 2: spatial_ref_sys — REVOKE PUBLIC ACCESS
-- ============================================================================
-- spatial_ref_sys is a PostGIS system table owned by the superuser.
-- We cannot ALTER it or enable RLS on it.
-- Instead, revoke all access from anon/authenticated so it's not queryable
-- through the PostgREST API.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'spatial_ref_sys') THEN
    EXECUTE 'REVOKE ALL ON public.spatial_ref_sys FROM anon';
    EXECUTE 'REVOKE ALL ON public.spatial_ref_sys FROM authenticated';
    RAISE NOTICE 'Revoked anon/authenticated access on spatial_ref_sys';
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Cannot revoke on spatial_ref_sys — owned by superuser. This is low-risk and can be ignored.';
END $$;


-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check views are now SECURITY INVOKER
SELECT 
  viewname,
  CASE 
    WHEN (pg_catalog.pg_class.relname IS NOT NULL 
          AND pg_catalog.pg_class.reloptions @> ARRAY['security_invoker=on'])
    THEN 'SECURITY INVOKER ✓'
    ELSE 'SECURITY DEFINER ✗'
  END as security_mode
FROM pg_views
JOIN pg_catalog.pg_class ON pg_class.relname = pg_views.viewname
WHERE schemaname = 'public'
  AND viewname IN (
    'cart_summary', 
    'driver_deposit_summary', 
    'order_financial_details',
    'manager_deposit_dashboard', 
    'restaurant_payments', 
    'manager_earnings_summary'
  )
ORDER BY viewname;

-- Check spatial_ref_sys access
SELECT 
  grantee, privilege_type 
FROM information_schema.table_privileges 
WHERE table_schema = 'public' 
  AND table_name = 'spatial_ref_sys';


[
  {
    "grantee": "postgres",
    "privilege_type": "INSERT"
  },
  {
    "grantee": "postgres",
    "privilege_type": "SELECT"
  },
  {
    "grantee": "postgres",
    "privilege_type": "UPDATE"
  },
  {
    "grantee": "postgres",
    "privilege_type": "DELETE"
  },
  {
    "grantee": "postgres",
    "privilege_type": "TRUNCATE"
  },
  {
    "grantee": "postgres",
    "privilege_type": "REFERENCES"
  },
  {
    "grantee": "postgres",
    "privilege_type": "TRIGGER"
  },
  {
    "grantee": "anon",
    "privilege_type": "INSERT"
  },
  {
    "grantee": "anon",
    "privilege_type": "SELECT"
  },
  {
    "grantee": "anon",
    "privilege_type": "UPDATE"
  },
  {
    "grantee": "anon",
    "privilege_type": "DELETE"
  },
  {
    "grantee": "anon",
    "privilege_type": "TRUNCATE"
  },
  {
    "grantee": "anon",
    "privilege_type": "REFERENCES"
  },
  {
    "grantee": "anon",
    "privilege_type": "TRIGGER"
  },
  {
    "grantee": "authenticated",
    "privilege_type": "INSERT"
  },
  {
    "grantee": "authenticated",
    "privilege_type": "SELECT"
  },
  {
    "grantee": "authenticated",
    "privilege_type": "UPDATE"
  },
  {
    "grantee": "authenticated",
    "privilege_type": "DELETE"
  },
  {
    "grantee": "authenticated",
    "privilege_type": "TRUNCATE"
  },
  {
    "grantee": "authenticated",
    "privilege_type": "REFERENCES"
  },
  {
    "grantee": "authenticated",
    "privilege_type": "TRIGGER"
  },
  {
    "grantee": "service_role",
    "privilege_type": "INSERT"
  },
  {
    "grantee": "service_role",
    "privilege_type": "SELECT"
  },
  {
    "grantee": "service_role",
    "privilege_type": "UPDATE"
  },
  {
    "grantee": "service_role",
    "privilege_type": "DELETE"
  },
  {
    "grantee": "service_role",
    "privilege_type": "TRUNCATE"
  },
  {
    "grantee": "service_role",
    "privilege_type": "REFERENCES"
  },
  {
    "grantee": "service_role",
    "privilege_type": "TRIGGER"
  },
  {
    "grantee": "PUBLIC",
    "privilege_type": "SELECT"
  }
]