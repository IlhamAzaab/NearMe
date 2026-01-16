-- ============================================================================
-- UPDATE DELIVERY STATUS VALUES
-- This migration updates the deliveries table to support the new status workflow
-- ============================================================================

-- Drop the old CHECK constraint
ALTER TABLE deliveries 
  DROP CONSTRAINT IF EXISTS deliveries_status_check;

-- Add new CHECK constraint with updated status values
ALTER TABLE deliveries 
  ADD CONSTRAINT deliveries_status_check 
  CHECK (status IN (
    'pending',           -- No driver assigned yet
    'accepted',          -- Driver accepted the delivery
    'heading_to_restaurant',  -- Driver is on the way to restaurant
    'at_restaurant',     -- Driver arrived at restaurant
    'picked_up',         -- Driver picked up the order
    'heading_to_customer',    -- Driver is on the way to customer
    'at_customer',       -- Driver arrived at customer location
    'delivered',         -- Order delivered successfully
    'failed',            -- Delivery failed
    'cancelled'          -- Delivery cancelled
  ));

-- Add new timestamp columns
ALTER TABLE deliveries 
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS heading_to_restaurant_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS arrived_restaurant_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS heading_to_customer_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS arrived_customer_at TIMESTAMPTZ;

-- Update existing 'assigned' status to 'accepted' (if any)
UPDATE deliveries 
SET status = 'accepted' 
WHERE status = 'assigned';

-- Create index for faster status queries
CREATE INDEX IF NOT EXISTS idx_deliveries_status_driver ON deliveries(status, driver_id);

COMMENT ON COLUMN deliveries.status IS 'Delivery status: pending, accepted, heading_to_restaurant, at_restaurant, picked_up, heading_to_customer, at_customer, delivered, failed, cancelled';
