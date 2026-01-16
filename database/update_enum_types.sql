-- ============================================================================
-- Update Enum Types for Driver Delivery System
-- This script drops old enum types and creates new ones with correct values
-- ============================================================================

-- STEP 1: Drop existing enum types (this will fail if columns are using them)
-- We need to convert columns to text first, then drop enums, then recreate

-- Convert orders.status to text temporarily
ALTER TABLE orders 
ALTER COLUMN status TYPE TEXT;

-- Convert deliveries.status to text temporarily
ALTER TABLE deliveries 
ALTER COLUMN status TYPE TEXT;

-- Drop old enum types
DROP TYPE IF EXISTS order_status CASCADE;
DROP TYPE IF EXISTS delivery_status CASCADE;

-- STEP 2: Create new enum types with correct values

-- Order Status Enum
CREATE TYPE order_status AS ENUM (
  'placed',
  'accepted',
  'rejected',
  'ready',
  'delivered',
  'cancelled'
);

-- Delivery Status Enum
CREATE TYPE delivery_status AS ENUM (
  'pending',
  'accepted',
  'picked_up',
  'on_the_way',
  'at_customer',
  'delivered',
  'cancelled'
);

-- STEP 3: Update existing data to match new enum values

-- Update orders table - map old values to new values
UPDATE orders
SET status = CASE
  WHEN status = 'placed' THEN 'placed'
  WHEN status = 'accepted' THEN 'accepted'
  WHEN status = 'rejected' THEN 'rejected'
  WHEN status = 'ready' THEN 'ready'
  WHEN status = 'delivered' THEN 'delivered'
  WHEN status IN ('cancelled', 'canceled') THEN 'cancelled'
  ELSE 'placed' -- default for any unexpected values
END;

-- Update deliveries table - map old values to new values
UPDATE deliveries
SET status = CASE
  WHEN status = 'pending' THEN 'pending'
  WHEN status IN ('accepted', 'heading_to_restaurant', 'at_restaurant') THEN 'accepted'
  WHEN status = 'picked_up' THEN 'picked_up'
  WHEN status = 'heading_to_customer' THEN 'on_the_way'
  WHEN status = 'at_customer' THEN 'at_customer'
  WHEN status = 'delivered' THEN 'delivered'
  WHEN status IN ('cancelled', 'failed') THEN 'cancelled'
  ELSE 'pending' -- default for any unexpected values
END;

-- STEP 4: Convert columns back to enum types
ALTER TABLE orders 
ALTER COLUMN status TYPE order_status USING status::order_status;

ALTER TABLE deliveries 
ALTER COLUMN status TYPE delivery_status USING status::delivery_status;

-- STEP 5: Set default values
ALTER TABLE orders 
ALTER COLUMN status SET DEFAULT 'placed'::order_status;

ALTER TABLE deliveries 
ALTER COLUMN status SET DEFAULT 'pending'::delivery_status;

-- ============================================================================
-- Verification Query
-- ============================================================================
-- Run this to verify the enum types were created correctly:
-- SELECT enum_range(NULL::order_status);
-- SELECT enum_range(NULL::delivery_status);
