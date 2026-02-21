-- ============================================================================
-- Migration: Drop orders.status column
-- ============================================================================
-- IMPORTANT: Run ensure_deliveries_columns.sql FIRST before this migration!
-- Then deploy the backend code changes that remove dependencies on orders.status
-- Finally, run this migration to drop the obsolete columns.
-- ============================================================================
-- Date: 2026-02-21
-- Description: Remove orders.status and related timestamp columns since 
--              deliveries.status is now the single source of truth.
--              Backend has been refactored to use deliveries table exclusively.
-- 
-- Order of operations:
--   1. Run ensure_deliveries_columns.sql (adds missing columns to deliveries)
--   2. Deploy backend changes (removes orders.status dependencies)
--   3. Test thoroughly in production
--   4. Run this migration (drops obsolete orders columns)
-- ============================================================================

-- Step 1: Verify deliveries table has all necessary status values
-- Check if any order has a status not reflected in its delivery record
SELECT 
  o.id,
  o.order_number,
  o.status AS order_status,
  d.status AS delivery_status,
  o.placed_at
FROM orders o
LEFT JOIN deliveries d ON d.order_id = o.id
WHERE o.status IS NOT NULL
  AND (d.status IS NULL OR d.status != COALESCE(
    CASE 
      WHEN o.status = 'placed' THEN 'placed'
      WHEN o.status = 'accepted' THEN 'pending'
      WHEN o.status = 'preparing' THEN 'preparing'
      WHEN o.status = 'ready' THEN 'ready'
      WHEN o.status = 'rejected' THEN 'failed'
      WHEN o.status = 'cancelled' THEN 'cancelled'
      WHEN o.status = 'delivered' THEN 'delivered'
      ELSE o.status
    END,
    d.status
  ))
ORDER BY o.placed_at DESC
LIMIT 20;

-- Step 2: Optional - Sync any missing delivery statuses before dropping column
-- (Run this only if Step 1 shows discrepancies)
-- UPDATE deliveries d
-- SET status = CASE 
--   WHEN o.status = 'placed' THEN 'placed'
--   WHEN o.status = 'accepted' THEN 'pending'
--   WHEN o.status = 'preparing' THEN 'preparing'
--   WHEN o.status = 'ready' THEN 'ready'
--   WHEN o.status = 'rejected' THEN 'failed'
--   WHEN o.status = 'cancelled' THEN 'cancelled'
--   WHEN o.status = 'delivered' THEN 'delivered'
--   ELSE d.status
-- END
-- FROM orders o
-- WHERE d.order_id = o.id AND o.status IS NOT NULL;

-- Step 3: Drop the orders.status column
-- This is safe after confirming deliveries table has correct statuses
ALTER TABLE orders DROP COLUMN IF EXISTS status;

-- Step 4: Drop timestamp columns that are now tracked in deliveries table
-- Note: These columns have been removed from all backend queries
-- The deliveries table is the single source of truth for these timestamps
ALTER TABLE orders DROP COLUMN IF EXISTS accepted_at;    -- Use deliveries.res_accepted_at instead
ALTER TABLE orders DROP COLUMN IF EXISTS preparing_at;   -- Not needed per requirements
ALTER TABLE orders DROP COLUMN IF EXISTS ready_at;       -- Not needed per requirements
ALTER TABLE orders DROP COLUMN IF EXISTS picked_up_at;   -- Use deliveries.picked_up_at instead

-- Note: Keep delivered_at in orders for payment tracking reference

-- Step 5: Drop rejection_reason from orders (now in deliveries.rejection_reason)
ALTER TABLE orders DROP COLUMN IF EXISTS rejection_reason;

-- ============================================================================
-- Verification queries
-- ============================================================================

-- Check orders table schema after migration
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'orders'
ORDER BY ordinal_position;

-- Check deliveries table has status column
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'deliveries' AND column_name IN ('status', 'rejection_reason', 'rejected_at')
ORDER BY ordinal_position;

-- Count deliveries by status to ensure data integrity
SELECT status, COUNT(*) as count
FROM deliveries
GROUP BY status
ORDER BY count DESC;

-- ============================================================================
-- Rollback (if needed - BEFORE dropping column)
-- ============================================================================
-- If you need to rollback, restore the column and sync from deliveries:
-- 
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS status TEXT;
-- 
-- UPDATE orders o
-- SET status = CASE 
--   WHEN d.status = 'placed' THEN 'placed'
--   WHEN d.status = 'pending' THEN 'accepted'
--   WHEN d.status = 'preparing' THEN 'preparing'
--   WHEN d.status = 'ready' THEN 'ready'
--   WHEN d.status = 'failed' THEN 'rejected'
--   WHEN d.status = 'cancelled' THEN 'cancelled'
--   WHEN d.status = 'delivered' THEN 'delivered'
--   ELSE 'placed'
-- END
-- FROM deliveries d
-- WHERE d.order_id = o.id;
-- ============================================================================
