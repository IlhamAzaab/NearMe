-- ============================================================================
-- Migration: Add pending_earnings column to deliveries table
-- Purpose: Store earnings data temporarily until delivery is completed
-- ============================================================================

-- Add pending_earnings column to store earnings data until delivery is completed
ALTER TABLE deliveries
ADD COLUMN IF NOT EXISTS pending_earnings JSONB DEFAULT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN deliveries.pending_earnings IS 
  'Stores earnings data (base_amount, extra_earnings, bonus_amount, driver_earnings) temporarily. 
   Actual earnings columns are only populated when delivery status becomes "delivered".
   This prevents earnings from being counted before delivery is actually completed.';

-- Index for querying deliveries with pending earnings (optional, for debugging)
CREATE INDEX IF NOT EXISTS idx_deliveries_pending_earnings 
ON deliveries ((pending_earnings IS NOT NULL)) 
WHERE pending_earnings IS NOT NULL;

-- ============================================================================
-- Verify the migration
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'deliveries' AND column_name = 'pending_earnings'
  ) THEN
    RAISE NOTICE '✅ pending_earnings column added successfully';
  ELSE
    RAISE EXCEPTION '❌ Failed to add pending_earnings column';
  END IF;
END $$;
