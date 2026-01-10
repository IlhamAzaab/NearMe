-- ============================================================================
-- FIX ORDERS RLS POLICIES
-- ============================================================================
-- Run this in your Supabase SQL Editor to fix the RLS issues
-- Option 1: Disable RLS completely (recommended for backend-only access)
-- Option 2: Add proper policies (if you need RLS)
-- ============================================================================

-- ============================================================================
-- OPTION 1: DISABLE RLS ON ORDERS TABLES (Recommended)
-- ============================================================================
-- If all order operations go through your backend (which uses service role key),
-- you can disable RLS on these tables.

ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- OPTION 2: ADD PROPER RLS POLICIES (Alternative)
-- ============================================================================
-- Uncomment below if you want to keep RLS enabled but add proper policies

/*
-- Drop existing policies first
DROP POLICY IF EXISTS "orders_insert_policy" ON orders;
DROP POLICY IF EXISTS "orders_select_customer" ON orders;
DROP POLICY IF EXISTS "orders_select_admin" ON orders;
DROP POLICY IF EXISTS "orders_update_admin" ON orders;

-- Enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Allow customers to insert orders (their own)
CREATE POLICY "orders_insert_customer" ON orders
  FOR INSERT
  WITH CHECK (customer_id = auth.uid());

-- Allow customers to view their own orders
CREATE POLICY "orders_select_customer" ON orders
  FOR SELECT
  USING (customer_id = auth.uid());

-- Allow restaurant admins to view their restaurant's orders
CREATE POLICY "orders_select_admin" ON orders
  FOR SELECT
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM admins WHERE id = auth.uid()
    )
  );

-- Allow restaurant admins to update their restaurant's orders
CREATE POLICY "orders_update_admin" ON orders
  FOR UPDATE
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM admins WHERE id = auth.uid()
    )
  );

-- Order items policies
DROP POLICY IF EXISTS "order_items_insert" ON order_items;
DROP POLICY IF EXISTS "order_items_select" ON order_items;

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_items_insert" ON order_items
  FOR INSERT
  WITH CHECK (
    order_id IN (
      SELECT id FROM orders WHERE customer_id = auth.uid()
    )
  );

CREATE POLICY "order_items_select" ON order_items
  FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders WHERE customer_id = auth.uid()
      UNION
      SELECT o.id FROM orders o
      JOIN admins a ON o.restaurant_id = a.restaurant_id
      WHERE a.id = auth.uid()
    )
  );
*/

-- ============================================================================
-- VERIFY RLS STATUS
-- ============================================================================
-- Run this to check if RLS is disabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('orders', 'order_items', 'deliveries');
