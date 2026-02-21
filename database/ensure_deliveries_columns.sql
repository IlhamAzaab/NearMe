-- ============================================================================
-- Ensure deliveries table has all required columns
-- ============================================================================
-- Run this before the migration_drop_orders_status.sql
-- ============================================================================

-- Add res_accepted_at (restaurant acceptance timestamp) if not exists
-- This is set when restaurant accepts the order (status = pending)
ALTER TABLE deliveries 
ADD COLUMN IF NOT EXISTS res_accepted_at TIMESTAMPTZ;

-- Add rejection_reason column if not exists (for failed deliveries)
ALTER TABLE deliveries 
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Add rejected_at timestamp if not exists
ALTER TABLE deliveries 
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

-- Add cancelled_at timestamp if not exists
ALTER TABLE deliveries 
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Update status enum to include 'failed' status (maps to rejected)
-- Note: Check if your status column is an ENUM or TEXT
-- If ENUM, you may need to alter the type:
-- ALTER TYPE delivery_status_enum ADD VALUE IF NOT EXISTS 'failed';

-- If using TEXT with CHECK constraint, update constraint:
DO $$ 
BEGIN
  -- Drop old constraint if exists
  ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_status_check;
  
  -- Add updated constraint with 'failed' status
  ALTER TABLE deliveries 
  ADD CONSTRAINT deliveries_status_check 
  CHECK (status IN (
    'placed',           -- Initial state when order placed
    'pending',          -- Restaurant accepted, waiting for driver
    'accepted',         -- Driver accepted
    'picked_up',        -- Driver picked up from restaurant
    'on_the_way',       -- Driver on the way to customer
    'at_customer',      -- Driver arrived at customer location
    'delivered',        -- Successfully delivered
    'failed',           -- Rejected by restaurant or failed delivery
    'cancelled'         -- Cancelled by customer/admin
  ));
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_deliveries_res_accepted_at 
ON deliveries(res_accepted_at) WHERE res_accepted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deliveries_status_driver 
ON deliveries(status, driver_id);

-- Verification
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'deliveries' 
  AND column_name IN ('res_accepted_at', 'rejection_reason', 'rejected_at', 'cancelled_at', 'status')
ORDER BY ordinal_position;

COMMENT ON COLUMN deliveries.res_accepted_at IS 'Timestamp when restaurant accepted the order (status changed to pending)';
COMMENT ON COLUMN deliveries.rejection_reason IS 'Reason why order was rejected/failed (when status = failed)';
COMMENT ON COLUMN deliveries.rejected_at IS 'Timestamp when order was rejected/failed';
COMMENT ON COLUMN deliveries.cancelled_at IS 'Timestamp when delivery was cancelled';
