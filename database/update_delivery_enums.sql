-- ============================================================================
-- Update Enum Types for Driver Delivery System - Production Ready
-- This script updates enum types to match the new requirements
-- ============================================================================

-- STEP 1: Convert columns to text temporarily
ALTER TABLE orders 
ALTER COLUMN status TYPE TEXT;

ALTER TABLE deliveries 
ALTER COLUMN status TYPE TEXT;

-- STEP 2: Drop old enum types
DROP TYPE IF EXISTS order_status CASCADE;
DROP TYPE IF EXISTS delivery_status CASCADE;

-- STEP 3: Create new enum types with correct values

-- Order Status Enum: [placed, accepted, rejected, ready, delivered, cancelled]
CREATE TYPE order_status AS ENUM (
  'placed',
  'accepted',
  'rejected',
  'ready',
  'delivered',
  'cancelled'
);

-- Delivery Status Enum: [pending, accepted, picked_up, on_the_way, at_customer, delivered, cancelled]
CREATE TYPE delivery_status AS ENUM (
  'pending',
  'accepted',
  'picked_up',
  'on_the_way',
  'at_customer',
  'delivered',
  'cancelled'
);

-- STEP 4: Update existing data to match new enum values

-- Update orders table
UPDATE orders
SET status = CASE
  WHEN status IN ('placed', 'pending') THEN 'placed'
  WHEN status = 'accepted' THEN 'accepted'
  WHEN status = 'rejected' THEN 'rejected'
  WHEN status IN ('ready', 'preparing') THEN 'ready'
  WHEN status = 'delivered' THEN 'delivered'
  WHEN status = 'cancelled' THEN 'cancelled'
  ELSE 'placed'
END;

-- Update deliveries table
UPDATE deliveries
SET status = CASE
  WHEN status IN ('pending', 'available') THEN 'pending'
  WHEN status = 'accepted' THEN 'accepted'
  WHEN status = 'picked_up' THEN 'picked_up'
  WHEN status = 'on_the_way' THEN 'on_the_way'
  WHEN status = 'at_customer' THEN 'at_customer'
  WHEN status = 'delivered' THEN 'delivered'
  WHEN status = 'cancelled' THEN 'cancelled'
  ELSE 'pending'
END;

-- STEP 5: Convert columns back to enum types
ALTER TABLE orders 
ALTER COLUMN status TYPE order_status USING status::order_status;

ALTER TABLE deliveries 
ALTER COLUMN status TYPE delivery_status USING status::delivery_status;

-- STEP 6: Set default values
ALTER TABLE orders 
ALTER COLUMN status SET DEFAULT 'placed';

ALTER TABLE deliveries 
ALTER COLUMN status SET DEFAULT 'pending';

-- STEP 7: Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver_status ON deliveries(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- ============================================================================
-- Verification Queries (run these to verify the changes)
-- ============================================================================

-- Check enum types
-- SELECT enum_range(NULL::order_status);
-- SELECT enum_range(NULL::delivery_status);

-- Check data distribution
-- SELECT status, COUNT(*) FROM orders GROUP BY status;
-- SELECT status, COUNT(*) FROM deliveries GROUP BY status;
