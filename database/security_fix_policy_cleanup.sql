-- ============================================================================
-- NearMe Security Fix — Policy Cleanup & Performance Optimization
-- ============================================================================
-- Fixes:
--   1. auth_rls_initplan (59 warnings) — old policies use auth.uid() per-row
--   2. multiple_permissive_policies (40+ warnings) — duplicate/overlapping policies
--   3. security_definer_view (6 errors) — views with SECURITY DEFINER
--   4. spatial_ref_sys RLS (1 error) — revoke access instead
--
-- WHY THIS IS SAFE:
--   - ALL CRUD goes through backend Express API using service_role key
--   - service_role BYPASSES RLS entirely — backend continues working
--   - Frontend uses ONLY anon key for Supabase Realtime subscriptions
--   - Nobody connects as "authenticated" through PostgREST
--   - Therefore: all old "TO authenticated" / auth.uid() policies are UNUSED
--
-- WHAT WE KEEP:
--   - anon_select_* on 4 tables (for Supabase Realtime)
--   - service_role_full_* on all tables (explicit clarity)
--   - "Anyone can read system_config" (public config)
--   - anon SELECT grants on foods, restaurants (public browsing)
--
-- Run in Supabase SQL Editor AFTER security_fix_master.sql
-- ============================================================================


-- ============================================================================
-- SECTION 1: DROP OLD POLICIES ON MANAGERS
-- ============================================================================
DROP POLICY IF EXISTS "Manager can read own profile" ON public.managers;
DROP POLICY IF EXISTS "Block all anon access" ON public.managers;


-- ============================================================================
-- SECTION 2: DROP OLD POLICIES ON DRIVERS
-- ============================================================================
DROP POLICY IF EXISTS "Drivers can view own profile" ON public.drivers;
DROP POLICY IF EXISTS "Drivers can update own profile" ON public.drivers;
DROP POLICY IF EXISTS "Drivers can view their own profile" ON public.drivers;
DROP POLICY IF EXISTS "Drivers can update their own profile" ON public.drivers;
DROP POLICY IF EXISTS "Service role full access to drivers" ON public.drivers;
DROP POLICY IF EXISTS "Service role has full access" ON public.drivers;


-- ============================================================================
-- SECTION 3: DROP OLD POLICIES ON DRIVER SUB-TABLES
-- ============================================================================

-- driver_vehicle_license
DROP POLICY IF EXISTS "Drivers can view own vehicle" ON public.driver_vehicle_license;
DROP POLICY IF EXISTS "Drivers can insert own vehicle" ON public.driver_vehicle_license;
DROP POLICY IF EXISTS "Drivers can update own vehicle" ON public.driver_vehicle_license;
DROP POLICY IF EXISTS "Service role full access to vehicle" ON public.driver_vehicle_license;

-- driver_documents
DROP POLICY IF EXISTS "Drivers can view own documents" ON public.driver_documents;
DROP POLICY IF EXISTS "Drivers can insert own documents" ON public.driver_documents;
DROP POLICY IF EXISTS "Drivers can update own documents" ON public.driver_documents;
DROP POLICY IF EXISTS "Service role full access to documents" ON public.driver_documents;

-- driver_bank_accounts
DROP POLICY IF EXISTS "Drivers can view own bank account" ON public.driver_bank_accounts;
DROP POLICY IF EXISTS "Drivers can insert own bank account" ON public.driver_bank_accounts;
DROP POLICY IF EXISTS "Drivers can update own bank account" ON public.driver_bank_accounts;
DROP POLICY IF EXISTS "Service role full access to bank accounts" ON public.driver_bank_accounts;

-- driver_contracts
DROP POLICY IF EXISTS "Drivers can view own contracts" ON public.driver_contracts;
DROP POLICY IF EXISTS "Drivers can insert own contracts" ON public.driver_contracts;
DROP POLICY IF EXISTS "Service role full access to contracts" ON public.driver_contracts;


-- ============================================================================
-- SECTION 4: DROP OLD POLICIES ON ADMINS
-- ============================================================================
DROP POLICY IF EXISTS "admin_cannot_self_activate" ON public.admins;
DROP POLICY IF EXISTS "admin_read_own_profile" ON public.admins;
DROP POLICY IF EXISTS "admin_update_own_profile" ON public.admins;
DROP POLICY IF EXISTS "admins_access_user" ON public.admins;
DROP POLICY IF EXISTS "manager_full_access_admins" ON public.admins;


-- ============================================================================
-- SECTION 5: DROP OLD POLICIES ON RESTAURANTS & SUB-TABLES
-- ============================================================================

-- restaurants
DROP POLICY IF EXISTS "admin_create_own_restaurant" ON public.restaurants;
DROP POLICY IF EXISTS "admin_read_own_restaurant" ON public.restaurants;
DROP POLICY IF EXISTS "manager_full_access_restaurants" ON public.restaurants;

-- restaurant_bank_accounts
DROP POLICY IF EXISTS "admin_manage_own_bank_account" ON public.restaurant_bank_accounts;
DROP POLICY IF EXISTS "manager_full_access_bank_accounts" ON public.restaurant_bank_accounts;

-- restaurant_contracts
DROP POLICY IF EXISTS "admin_accept_contract" ON public.restaurant_contracts;
DROP POLICY IF EXISTS "admin_read_contract" ON public.restaurant_contracts;
DROP POLICY IF EXISTS "manager_full_access_contracts" ON public.restaurant_contracts;


-- ============================================================================
-- SECTION 6: DROP OLD POLICIES ON CARTS & CART_ITEMS
-- ============================================================================

-- carts
DROP POLICY IF EXISTS "customer_view_own_carts" ON public.carts;
DROP POLICY IF EXISTS "customer_create_own_carts" ON public.carts;
DROP POLICY IF EXISTS "customer_update_own_carts" ON public.carts;
DROP POLICY IF EXISTS "customer_delete_own_carts" ON public.carts;

-- cart_items
DROP POLICY IF EXISTS "customer_view_own_cart_items" ON public.cart_items;
DROP POLICY IF EXISTS "customer_create_cart_items" ON public.cart_items;
DROP POLICY IF EXISTS "customer_update_cart_items" ON public.cart_items;
DROP POLICY IF EXISTS "customer_delete_cart_items" ON public.cart_items;


-- ============================================================================
-- SECTION 7: DROP OLD POLICIES ON ORDERS
-- ============================================================================
DROP POLICY IF EXISTS "orders_customer_select" ON public.orders;
DROP POLICY IF EXISTS "orders_customer_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_select" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_update" ON public.orders;
DROP POLICY IF EXISTS "orders_driver_select" ON public.orders;
DROP POLICY IF EXISTS "orders_driver_select_available" ON public.orders;
DROP POLICY IF EXISTS "orders_driver_update" ON public.orders;
DROP POLICY IF EXISTS "admins_read_restaurant_orders" ON public.orders;
DROP POLICY IF EXISTS "admins_update_restaurant_orders" ON public.orders;
DROP POLICY IF EXISTS "customers_read_own_orders" ON public.orders;


-- ============================================================================
-- SECTION 8: DROP OLD POLICIES ON ORDER_ITEMS
-- ============================================================================
DROP POLICY IF EXISTS "order_items_customer_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_customer_insert" ON public.order_items;
DROP POLICY IF EXISTS "order_items_admin_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_driver_select" ON public.order_items;
DROP POLICY IF EXISTS "admins_read_restaurant_order_items" ON public.order_items;
DROP POLICY IF EXISTS "customers_read_own_order_items" ON public.order_items;


-- ============================================================================
-- SECTION 9: DROP OLD POLICIES ON DELIVERIES
-- ============================================================================
DROP POLICY IF EXISTS "deliveries_customer_select" ON public.deliveries;
DROP POLICY IF EXISTS "deliveries_customer_insert" ON public.deliveries;
DROP POLICY IF EXISTS "deliveries_admin_select" ON public.deliveries;
DROP POLICY IF EXISTS "deliveries_driver_select_pending" ON public.deliveries;
DROP POLICY IF EXISTS "deliveries_driver_select" ON public.deliveries;
DROP POLICY IF EXISTS "deliveries_driver_update" ON public.deliveries;
DROP POLICY IF EXISTS "deliveries_driver_location_update" ON public.deliveries;
DROP POLICY IF EXISTS "admins_read_restaurant_deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "customers_read_own_deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "drivers_read_assigned_deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "drivers_update_assigned_deliveries" ON public.deliveries;


-- ============================================================================
-- SECTION 10: DROP OLD POLICIES ON ORDER_STATUS_HISTORY
-- ============================================================================
DROP POLICY IF EXISTS "order_status_history_select" ON public.order_status_history;
DROP POLICY IF EXISTS "order_status_history_insert" ON public.order_status_history;
DROP POLICY IF EXISTS "admins_read_restaurant_order_history" ON public.order_status_history;
DROP POLICY IF EXISTS "customers_read_own_order_history" ON public.order_status_history;


-- ============================================================================
-- SECTION 11: DROP OLD POLICIES ON NOTIFICATIONS
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
    EXECUTE 'DROP POLICY IF EXISTS "notifications_select" ON public.notifications';
    EXECUTE 'DROP POLICY IF EXISTS "notifications_update" ON public.notifications';
    EXECUTE 'DROP POLICY IF EXISTS "notifications_insert" ON public.notifications';
    EXECUTE 'DROP POLICY IF EXISTS "notifications_service_insert" ON public.notifications';
    EXECUTE 'DROP POLICY IF EXISTS "notifications_authenticated_insert" ON public.notifications';
    EXECUTE 'DROP POLICY IF EXISTS "Notifications - Service role insert" ON public.notifications';
    EXECUTE 'DROP POLICY IF EXISTS "Notifications - Users select own" ON public.notifications';
    EXECUTE 'DROP POLICY IF EXISTS "Notifications - Users update own" ON public.notifications';
    EXECUTE 'DROP POLICY IF EXISTS "Notifications - Service role delete" ON public.notifications';
    EXECUTE 'DROP POLICY IF EXISTS "Drivers can view their own notifications" ON public.notifications';
    EXECUTE 'DROP POLICY IF EXISTS "Drivers can update their own notifications" ON public.notifications';
    EXECUTE 'DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications';
    EXECUTE 'DROP POLICY IF EXISTS "Admins can insert notifications" ON public.notifications';
  END IF;
END $$;


-- ============================================================================
-- SECTION 12: DROP OLD POLICIES ON DELIVERY_STOPS
-- ============================================================================
DROP POLICY IF EXISTS "Drivers can view own delivery stops" ON public.delivery_stops;
DROP POLICY IF EXISTS "Service role can manage all delivery stops" ON public.delivery_stops;


-- ============================================================================
-- SECTION 13: DROP OLD POLICIES ON ADMIN_PAYMENTS
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_payments') THEN
    EXECUTE 'DROP POLICY IF EXISTS "admin_payments_manager_select" ON public.admin_payments';
    EXECUTE 'DROP POLICY IF EXISTS "admin_payments_manager_insert" ON public.admin_payments';
    EXECUTE 'DROP POLICY IF EXISTS "admin_payments_admin_select" ON public.admin_payments';
  END IF;
END $$;


-- ============================================================================
-- SECTION 14: DROP OLD POLICIES ON USERS
-- ============================================================================
DROP POLICY IF EXISTS "service_role insert users" ON public.users;
DROP POLICY IF EXISTS "service_role delete users" ON public.users;
DROP POLICY IF EXISTS "service_role select users" ON public.users;
DROP POLICY IF EXISTS "Block all anon access" ON public.users;
DROP POLICY IF EXISTS "Service role can do anything" ON public.users;
DROP POLICY IF EXISTS "User can read own role" ON public.users;


-- ============================================================================
-- SECTION 15: DROP OLD SYSTEM_CONFIG POLICIES (already replaced in master)
-- ============================================================================
DROP POLICY IF EXISTS "Service role can update system_config" ON public.system_config;
DROP POLICY IF EXISTS "Service role can insert system_config" ON public.system_config;


-- ============================================================================
-- SECTION 16: FIX SECURITY DEFINER VIEWS
-- ============================================================================
-- ALTER VIEW SET (security_invoker = on) is the correct fix for PostgreSQL 15+
-- ============================================================================

ALTER VIEW public.cart_summary SET (security_invoker = on);
ALTER VIEW public.driver_deposit_summary SET (security_invoker = on);
ALTER VIEW public.order_financial_details SET (security_invoker = on);
ALTER VIEW public.manager_deposit_dashboard SET (security_invoker = on);
ALTER VIEW public.restaurant_payments SET (security_invoker = on);
ALTER VIEW public.manager_earnings_summary SET (security_invoker = on);


-- ============================================================================
-- SECTION 17: REVOKE ACCESS ON spatial_ref_sys
-- ============================================================================
-- Cannot enable RLS (owned by superuser). Revoking access makes it
-- inaccessible via PostgREST API.
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
    RAISE NOTICE 'Cannot revoke on spatial_ref_sys — owned by superuser. Low-risk, safe to ignore.';
END $$;


-- ============================================================================
-- SECTION 18: VERIFICATION
-- ============================================================================

-- Show remaining policies (should only be anon_select_* and service_role_full_*)
SELECT 
  tablename,
  policyname,
  roles,
  cmd,
  permissive
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Verify views are SECURITY INVOKER
SELECT 
  c.relname as view_name,
  CASE 
    WHEN c.reloptions @> ARRAY['security_invoker=on'] THEN 'INVOKER ✓'
    ELSE 'DEFINER ✗'
  END as security_mode
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'v'
  AND c.relname IN (
    'cart_summary', 'driver_deposit_summary', 'order_financial_details',
    'manager_deposit_dashboard', 'restaurant_payments', 'manager_earnings_summary'
  )
ORDER BY c.relname;
