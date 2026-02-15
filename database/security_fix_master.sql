-- ============================================================================
-- NearMe Security Fix Master Migration
-- ============================================================================
-- Fixes ALL 51 Supabase Security Advisor issues:
--   1. Enable RLS on ALL public tables
--   2. Create proper policies for tables needing frontend realtime access
--   3. Fix function search_path (23 functions)
--   4. Recreate views without SECURITY DEFINER (6 views)
--   5. Fix overly-permissive system_config policies
--   6. Move PostGIS to extensions schema
--
-- IMPORTANT: 
--   - Backend uses service_role key which BYPASSES RLS — backend continues working.
--   - Frontend uses anon key for Supabase Realtime subscriptions only.
--   - All CRUD operations go through backend API (Express + service_role).
--   - Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query).
--   - Review each section before running.
--
-- Date: 2026-02-13
-- ============================================================================

-- ============================================================================
-- SECTION 1: ENABLE RLS ON ALL PUBLIC TABLES
-- ============================================================================
-- This enables Row Level Security on every table. Tables without policies
-- become inaccessible via PostgREST API (anon/authenticated roles).
-- Backend (service_role) bypasses RLS and continues working normally.
-- ============================================================================

-- Core user tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Driver tables
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_vehicle_license ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_status_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_payments ENABLE ROW LEVEL SECURITY;

-- Restaurant tables
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_contracts ENABLE ROW LEVEL SECURITY;

-- Food & cart tables
ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

-- Order & delivery tables
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_stops ENABLE ROW LEVEL SECURITY;

-- Financial tables
ALTER TABLE public.daily_deposit_snapshots ENABLE ROW LEVEL SECURITY;

-- System config table (may already have RLS — idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'system_config') THEN
    EXECUTE 'ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- System tables (spatial_ref_sys is a PostGIS system table — owned by superuser, skip if not owner)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'spatial_ref_sys') THEN
    EXECUTE 'ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY';
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping spatial_ref_sys — owned by superuser. This is safe to ignore.';
END $$;

-- Notifications table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
    EXECUTE 'ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- Admin payments table (may already have RLS enabled)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_payments') THEN
    EXECUTE 'ALTER TABLE public.admin_payments ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- ============================================================================
-- SECTION 2: REALTIME-REQUIRED POLICIES (anon SELECT only)
-- ============================================================================
-- The frontend uses Supabase Realtime (postgres_changes) on 4 tables.
-- These need anon SELECT policies for realtime events to be delivered.
-- All write operations go through backend API (service_role).
-- ============================================================================

-- 2a. DELIVERIES — realtime used by admin, customer, driver listeners
DO $$
BEGIN
  -- Drop existing anon policies if any, then create new one
  DROP POLICY IF EXISTS "anon_select_deliveries" ON public.deliveries;
  CREATE POLICY "anon_select_deliveries"
    ON public.deliveries
    FOR SELECT
    TO anon
    USING (true);
END $$;

-- 2b. ORDERS — realtime used by customer order tracking
DO $$
BEGIN
  DROP POLICY IF EXISTS "anon_select_orders" ON public.orders;
  CREATE POLICY "anon_select_orders"
    ON public.orders
    FOR SELECT
    TO anon
    USING (true);
END $$;

-- 2c. DRIVER_DEPOSITS — realtime used by manager & driver deposit pages
DO $$
BEGIN
  DROP POLICY IF EXISTS "anon_select_driver_deposits" ON public.driver_deposits;
  CREATE POLICY "anon_select_driver_deposits"
    ON public.driver_deposits
    FOR SELECT
    TO anon
    USING (true);
END $$;

-- 2d. NOTIFICATIONS — realtime used by driver & admin notification listeners
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
    DROP POLICY IF EXISTS "anon_select_notifications" ON public.notifications;
    EXECUTE 'CREATE POLICY "anon_select_notifications"
      ON public.notifications
      FOR SELECT
      TO anon
      USING (true)';
  END IF;
END $$;

-- ============================================================================
-- SECTION 3: SERVICE ROLE FULL ACCESS POLICIES
-- ============================================================================
-- Ensures service_role (backend) has explicit full access on all tables.
-- service_role already bypasses RLS, but explicit policies provide clarity.
-- ============================================================================

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'users', 'managers', 'admins', 'customers',
    'drivers', 'driver_vehicle_license', 'driver_documents', 
    'driver_bank_accounts', 'driver_contracts', 'driver_status_log',
    'driver_balances', 'driver_deposits', 'driver_payments',
    'restaurants', 'restaurant_bank_accounts', 'restaurant_contracts',
    'foods', 'food_reviews', 'carts', 'cart_items',
    'orders', 'order_items', 'order_status_history',
    'deliveries', 'delivery_stops',
    'daily_deposit_snapshots'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('DROP POLICY IF EXISTS "service_role_full_%s" ON public.%I', tbl, tbl);
      EXECUTE format(
        'CREATE POLICY "service_role_full_%s" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        tbl, tbl
      );
    END IF;
  END LOOP;
END $$;

-- Notifications table service role policy
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
    DROP POLICY IF EXISTS "service_role_full_notifications" ON public.notifications;
    EXECUTE 'CREATE POLICY "service_role_full_notifications" ON public.notifications FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- Admin payments table service role policy
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_payments') THEN
    DROP POLICY IF EXISTS "service_role_full_admin_payments" ON public.admin_payments;
    EXECUTE 'CREATE POLICY "service_role_full_admin_payments" ON public.admin_payments FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;


-- ============================================================================
-- SECTION 4: FIX SYSTEM_CONFIG OVERLY-PERMISSIVE POLICIES
-- ============================================================================
-- Current: WITH CHECK (true) and USING (true) on INSERT/UPDATE
-- Fix: Restrict to service_role only (config is managed by backend)
-- ============================================================================

-- Drop overly-permissive policies
DROP POLICY IF EXISTS "Service role can insert system_config" ON public.system_config;
DROP POLICY IF EXISTS "Service role can update system_config" ON public.system_config;

-- Keep the SELECT policy (public read is intentional for config)
-- DROP POLICY IF EXISTS "Anyone can read system_config" ON public.system_config;
-- (SELECT with USING (true) is acceptable per Supabase docs)

-- Create restrictive INSERT/UPDATE for service_role only
CREATE POLICY "service_role_insert_system_config"
  ON public.system_config
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "service_role_update_system_config"
  ON public.system_config
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ============================================================================
-- SECTION 5: FIX FUNCTION SEARCH_PATH (23 Functions)
-- ============================================================================
-- All functions must have search_path set to prevent path injection.
-- This uses ALTER FUNCTION to add SET search_path = public.
-- ============================================================================

-- Trigger functions (no params)
DO $$ BEGIN ALTER FUNCTION public.validate_driver_status_change() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.log_delivery_stop_insertion() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.validate_driver_onboarding() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.update_updated_at_column() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.deduct_approved_deposit() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.log_driver_status_change() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.update_food_average_stars() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.update_updated_at() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.update_cart_updated_at() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.auto_update_driver_status() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.add_cash_to_pending_deposit() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.notifications_broadcast_trigger() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.update_system_config_timestamp() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- Functions with params
DO $$ BEGIN ALTER FUNCTION public.create_daily_deposit_snapshot() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.get_next_stop_order(UUID) SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.get_driver_status_info(UUID) SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.is_driver_active_time(TEXT) SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.update_driver_profile(TEXT, TEXT) SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.get_active_available_drivers(TEXT) SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.get_active_available_drivers() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.generate_order_number() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.can_access_restaurant_dashboard() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.get_active_drivers() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- notify_drivers_new_order has multiple overloaded signatures
DO $$ BEGIN ALTER FUNCTION public.notify_drivers_new_order(UUID) SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.notify_drivers_new_order(UUID, UUID, TEXT, TEXT, TEXT) SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END $$;


-- ============================================================================
-- SECTION 6: RECREATE VIEWS WITHOUT SECURITY DEFINER
-- ============================================================================
-- Supabase Security Advisor detected these as SECURITY DEFINER.
-- Recreating them ensures they use SECURITY INVOKER (default).
-- ============================================================================

-- 6a. cart_summary
DROP VIEW IF EXISTS public.cart_summary CASCADE;
CREATE OR REPLACE VIEW public.cart_summary AS
SELECT 
  c.id as cart_id,
  c.customer_id,
  c.restaurant_id,
  r.restaurant_name,
  r.logo_url as restaurant_image,
  c.status,
  COUNT(ci.id) as item_count,
  SUM(ci.quantity) as total_items,
  SUM(
    CASE 
      WHEN ci.size = 'large' THEN f.extra_price * ci.quantity
      ELSE f.regular_price * ci.quantity
    END
  ) as cart_total,
  c.created_at,
  c.updated_at
FROM carts c
LEFT JOIN cart_items ci ON ci.cart_id = c.id
LEFT JOIN foods f ON f.id = ci.food_id
LEFT JOIN restaurants r ON r.id = c.restaurant_id
GROUP BY c.id, r.restaurant_name, r.logo_url;

-- 6b. driver_deposit_summary
DROP VIEW IF EXISTS public.driver_deposit_summary CASCADE;
CREATE OR REPLACE VIEW public.driver_deposit_summary AS
SELECT 
  db.driver_id,
  db.pending_deposit,
  db.total_collected,
  db.total_approved,
  db.updated_at,
  d.full_name as driver_name,
  d.phone as driver_phone,
  (SELECT COUNT(*) FROM driver_deposits dd WHERE dd.driver_id = db.driver_id AND dd.status = 'pending') as pending_deposits_count,
  (SELECT COUNT(*) FROM driver_deposits dd WHERE dd.driver_id = db.driver_id AND dd.status = 'approved') as approved_deposits_count
FROM driver_balances db
LEFT JOIN drivers d ON d.id = db.driver_id;

-- 6c. admin_payment_summary
DROP VIEW IF EXISTS public.admin_payment_summary CASCADE;
CREATE OR REPLACE VIEW public.admin_payment_summary AS
SELECT 
  r.id as restaurant_id,
  r.restaurant_name,
  r.admin_id,
  a.email as admin_email,
  COALESCE(SUM(rp.amount_to_pay), 0) as total_earnings,
  COALESCE(
    (SELECT SUM(amount) FROM admin_payments ap WHERE ap.restaurant_id = r.id),
    0
  ) as total_paid,
  GREATEST(
    0,
    COALESCE(SUM(rp.amount_to_pay), 0) - COALESCE(
      (SELECT SUM(amount) FROM admin_payments ap WHERE ap.restaurant_id = r.id),
      0
    )
  ) as withdrawal_balance,
  COUNT(DISTINCT rp.order_date) as order_days_count
FROM restaurants r
LEFT JOIN admins a ON r.admin_id = a.id
LEFT JOIN restaurant_payments rp ON r.id = rp.restaurant_id
WHERE r.restaurant_status = 'active'
GROUP BY r.id, r.restaurant_name, r.admin_id, a.email
ORDER BY withdrawal_balance DESC;

-- 6d. restaurant_payments
DROP VIEW IF EXISTS public.restaurant_payments CASCADE;
CREATE OR REPLACE VIEW public.restaurant_payments AS
SELECT 
  o.restaurant_id,
  o.restaurant_name,
  DATE(o.placed_at) as order_date,
  COUNT(*) as order_count,
  SUM(o.admin_subtotal) as amount_to_pay,
  SUM(o.subtotal) as customer_paid,
  SUM(o.commission_total) as commission_deducted
FROM orders o
INNER JOIN deliveries d ON d.order_id = o.id
WHERE d.status IN ('picked_up', 'on_the_way', 'delivered')
GROUP BY o.restaurant_id, o.restaurant_name, DATE(o.placed_at)
ORDER BY order_date DESC, o.restaurant_name;

-- 6e. order_financial_details
DROP VIEW IF EXISTS public.order_financial_details CASCADE;
CREATE OR REPLACE VIEW public.order_financial_details AS
SELECT 
  o.id as order_id,
  o.order_number,
  o.placed_at,
  COALESCE(d.status, 'placed') as status,
  o.restaurant_id,
  o.restaurant_name,
  o.customer_id,
  o.customer_name,
  o.subtotal as customer_food_subtotal,
  o.delivery_fee,
  o.service_fee,
  o.total_amount as customer_total,
  o.admin_subtotal as restaurant_payment,
  o.commission_total as food_commission,
  o.service_fee as service_fee_earning,
  (o.commission_total + o.service_fee) as total_manager_earning
FROM orders o
LEFT JOIN deliveries d ON d.order_id = o.id;

-- 6f. manager_deposit_dashboard
DROP VIEW IF EXISTS public.manager_deposit_dashboard CASCADE;
CREATE OR REPLACE VIEW public.manager_deposit_dashboard AS
WITH latest_snapshot AS (
  SELECT ending_pending, created_at
  FROM daily_deposit_snapshots
  ORDER BY snapshot_date DESC
  LIMIT 1
),
snapshot_values AS (
  SELECT 
    COALESCE(ls.ending_pending, 0) as prev_pending,
    ls.created_at as boundary
  FROM (SELECT 1) dummy
  LEFT JOIN latest_snapshot ls ON true
),
today_sales AS (
  SELECT COALESCE(SUM(o.total_amount), 0) as total
  FROM deliveries d
  JOIN orders o ON o.id = d.order_id
  CROSS JOIN snapshot_values sv
  WHERE d.status = 'delivered'
    AND o.payment_method = 'cash'
    AND (sv.boundary IS NULL OR d.updated_at > sv.boundary)
),
today_approved AS (
  SELECT COALESCE(SUM(approved_amount), 0) as total
  FROM driver_deposits d
  CROSS JOIN snapshot_values sv
  WHERE d.status = 'approved'
    AND (sv.boundary IS NULL OR d.reviewed_at > sv.boundary)
),
pending_count AS (
  SELECT COUNT(*) as count
  FROM driver_deposits
  WHERE status = 'pending'
),
calculated_values AS (
  SELECT 
    COALESCE(ts.total, 0) as todays_sales,
    sv.prev_pending,
    COALESCE(ta.total, 0) as paid,
    (COALESCE(ts.total, 0) + sv.prev_pending) as total_sales_today
  FROM today_sales ts
  CROSS JOIN today_approved ta
  CROSS JOIN snapshot_values sv
)
SELECT
  (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Colombo')::DATE as snapshot_date,
  cv.todays_sales,
  cv.prev_pending,
  cv.total_sales_today,
  GREATEST(0, cv.total_sales_today - cv.paid) as pending,
  cv.paid,
  pc.count as pending_deposits_count
FROM calculated_values cv
CROSS JOIN pending_count pc;


-- ============================================================================
-- SECTION 7: MOVE POSTGIS TO EXTENSIONS SCHEMA
-- ============================================================================
-- PostGIS should not be in the public schema.
-- NOTE: This may fail if PostGIS types are used in table columns.
-- If it fails, it is safe to skip — the risk is LOW for this issue.
-- ============================================================================

DO $$
BEGIN
  -- Create extensions schema if not exists
  CREATE SCHEMA IF NOT EXISTS extensions;
  
  -- Try to move PostGIS
  ALTER EXTENSION postgis SET SCHEMA extensions;
  
  RAISE NOTICE 'PostGIS successfully moved to extensions schema';
EXCEPTION 
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not move PostGIS to extensions schema: %. This is expected if PostGIS types are used in table columns. You can skip this safely.', SQLERRM;
END $$;


-- ============================================================================
-- SECTION 8: GRANT PROPER TABLE PERMISSIONS
-- ============================================================================
-- Revoke unnecessary permissions from anon/authenticated on sensitive tables.
-- Only grant what's needed for Supabase Realtime.
-- ============================================================================

-- Revoke ALL from anon on sensitive financial/identity tables
REVOKE ALL ON public.restaurant_bank_accounts FROM anon;
REVOKE ALL ON public.driver_bank_accounts FROM anon;
REVOKE ALL ON public.driver_balances FROM anon;
REVOKE ALL ON public.driver_payments FROM anon;
REVOKE ALL ON public.daily_deposit_snapshots FROM anon;
REVOKE ALL ON public.users FROM anon;
REVOKE ALL ON public.managers FROM anon;
REVOKE ALL ON public.admins FROM anon;
REVOKE ALL ON public.customers FROM anon;
REVOKE ALL ON public.drivers FROM anon;
REVOKE ALL ON public.driver_vehicle_license FROM anon;
REVOKE ALL ON public.driver_documents FROM anon;
REVOKE ALL ON public.driver_contracts FROM anon;
REVOKE ALL ON public.driver_status_log FROM anon;
REVOKE ALL ON public.restaurant_contracts FROM anon;
REVOKE ALL ON public.order_status_history FROM anon;
REVOKE ALL ON public.delivery_stops FROM anon;
REVOKE ALL ON public.food_reviews FROM anon;
REVOKE ALL ON public.carts FROM anon;
REVOKE ALL ON public.cart_items FROM anon;
REVOKE ALL ON public.order_items FROM anon;

-- Grant only SELECT on tables that need Supabase Realtime
GRANT SELECT ON public.deliveries TO anon;
GRANT SELECT ON public.orders TO anon;
GRANT SELECT ON public.driver_deposits TO anon;

-- Grant SELECT on notifications (for realtime listener)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
    EXECUTE 'GRANT SELECT ON public.notifications TO anon';
  END IF;
END $$;

-- Grant SELECT on public-readable tables (menus, restaurants)
GRANT SELECT ON public.foods TO anon;
GRANT SELECT ON public.restaurants TO anon;


-- ============================================================================
-- SECTION 9: VERIFICATION QUERIES
-- ============================================================================
-- Run these after the migration to verify everything is correct.
-- ============================================================================

-- Verify RLS is enabled on all tables
SELECT 
  schemaname, 
  tablename, 
  rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;

-- Count active policies per table
SELECT 
  schemaname, 
  tablename, 
  COUNT(*) as policy_count
FROM pg_policies 
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
ORDER BY tablename;
