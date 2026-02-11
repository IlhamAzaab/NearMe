-- ============================================================================
-- Pending Deliveries & Tip Amount System
-- ============================================================================
-- This migration ensures the tip_amount column exists on the deliveries table.
-- The tip_amount column may already exist in your database (added manually).
-- Run this only if the column doesn't exist yet.
-- ============================================================================

-- Add tip_amount column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deliveries' AND column_name = 'tip_amount'
  ) THEN
    ALTER TABLE deliveries ADD COLUMN tip_amount NUMERIC(10,2) DEFAULT 0;
    RAISE NOTICE 'Added tip_amount column to deliveries table';
  ELSE
    RAISE NOTICE 'tip_amount column already exists';
  END IF;
END $$;

-- Ensure default is 0 for any NULL tip_amounts
UPDATE deliveries SET tip_amount = 0 WHERE tip_amount IS NULL;

-- Create index for fast lookup of pending deliveries without drivers
CREATE INDEX IF NOT EXISTS idx_deliveries_pending_no_driver
  ON deliveries (status, driver_id)
  WHERE status = 'pending' AND driver_id IS NULL;

-- ============================================================================
-- FLOW EXPLANATION:
-- ============================================================================
-- 1. Customer places order → order.status = 'placed', delivery.status = 'pending'
-- 2. Restaurant accepts → order.status = 'accepted', order.accepted_at = NOW()
-- 3. If no driver accepts within 10 minutes of order.accepted_at:
--    → Manager sees this delivery in Pending Deliveries page
-- 4. Manager sets tip_amount on the delivery to incentivize drivers
-- 5. Driver sees tip_amount in available deliveries (sorted to top)
-- 6. When driver delivers, their total earnings include:
--    driver_earnings = base_amount + extra_earnings + bonus_amount
--    PLUS tip_amount (shown separately but added to total payout)
-- ============================================================================
