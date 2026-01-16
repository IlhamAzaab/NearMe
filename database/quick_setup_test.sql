-- ============================================================================
-- QUICK SETUP SCRIPT - Run this to test the driver tracking system
-- ============================================================================

-- 1. First, ensure you have the base schema
-- Run this if you haven't already set up the deliveries table

-- 2. Add the tracking columns (from delivery_tracking_schema.sql)
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS heading_to_restaurant_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS arrived_restaurant_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS heading_to_customer_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS arrived_customer_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS current_latitude NUMERIC(10, 7);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS current_longitude NUMERIC(10, 7);

-- 3. Update the status constraint
ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_status_check;
ALTER TABLE deliveries ADD CONSTRAINT deliveries_status_check
  CHECK (status IN (
    'pending',
    'accepted',
    'heading_to_restaurant',
    'arrived_restaurant',
    'picked_up',
    'heading_to_customer',
    'arrived_customer',
    'delivered',
    'failed',
    'cancelled'
  ));

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_deliveries_driver_status ON deliveries(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_deliveries_location_update ON deliveries(last_location_update);

-- 5. Test query - Check if a driver has active deliveries
SELECT 
  d.id,
  d.status,
  d.current_latitude,
  d.current_longitude,
  o.order_number,
  o.restaurant_name,
  o.customer_name
FROM deliveries d
JOIN orders o ON d.order_id = o.id
WHERE d.driver_id = 'YOUR_DRIVER_ID_HERE'
  AND d.status NOT IN ('delivered', 'failed', 'cancelled')
ORDER BY d.assigned_at DESC;

-- ============================================================================
-- Test Data Setup (Optional - for development/testing)
-- ============================================================================

-- Create a test delivery with proper coordinates
-- Note: Replace IDs with actual IDs from your database

-- Example: Update an existing delivery with test coordinates
/*
UPDATE deliveries 
SET 
  current_latitude = 40.7128,  -- New York coordinates as example
  current_longitude = -74.0060,
  status = 'accepted',
  accepted_at = NOW()
WHERE id = 'YOUR_DELIVERY_ID';

-- Update the associated order with restaurant and customer coordinates
UPDATE orders
SET
  restaurant_latitude = 40.7580,
  restaurant_longitude = -73.9855,
  delivery_latitude = 40.7489,
  delivery_longitude = -73.9680
WHERE id = 'YOUR_ORDER_ID';
*/

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Check if columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'deliveries' 
  AND column_name IN (
    'accepted_at',
    'heading_to_restaurant_at',
    'arrived_restaurant_at',
    'picked_up_at',
    'heading_to_customer_at',
    'arrived_customer_at',
    'delivered_at',
    'current_latitude',
    'current_longitude'
  )
ORDER BY column_name;

-- Check status constraint
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'deliveries'::regclass 
  AND conname = 'deliveries_status_check';

-- Check indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'deliveries' 
  AND indexname IN (
    'idx_deliveries_driver_status',
    'idx_deliveries_location_update'
  );
