-- ============================================================================
-- DELIVERY TRACKING SCHEMA - Live Map and Status Timestamps
-- ============================================================================
-- This migration adds all required columns for live driver tracking
-- Run this after delivery_system_v2.sql
-- ============================================================================

-- ============================================================================
-- 1. ADD STATUS TIMESTAMP COLUMNS TO DELIVERIES TABLE
-- ============================================================================

ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS heading_to_restaurant_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS arrived_restaurant_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS heading_to_customer_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS arrived_customer_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- Add current location columns (driver's real-time location)
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS current_latitude NUMERIC(10, 7);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS current_longitude NUMERIC(10, 7);

-- ============================================================================
-- 2. UPDATE DELIVERY STATUS ENUM TO INCLUDE NEW STATUSES
-- ============================================================================

-- Drop the existing constraint
ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_status_check;

-- Add new constraint with all status values
ALTER TABLE deliveries ADD CONSTRAINT deliveries_status_check
  CHECK (status IN (
    'pending',
    'accepted',
    'heading_to_restaurant',
    'at_restaurant',
    'picked_up',
    'heading_to_customer',
    'at_customer',
    'delivered',
    'failed',
    'cancelled'
  ));

-- ============================================================================
-- 3. CREATE INDEX FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_deliveries_driver_status ON deliveries(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_deliveries_location_update ON deliveries(last_location_update);

-- ============================================================================
-- 4. UPDATE RLS POLICIES FOR LOCATION UPDATES
-- ============================================================================

-- Drop existing driver update policy if it exists
DROP POLICY IF EXISTS deliveries_driver_location_update ON deliveries;

-- Drivers can update location and status for their own deliveries
CREATE POLICY deliveries_driver_location_update ON deliveries
  FOR UPDATE TO authenticated
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());

-- ============================================================================
-- 5. CREATE FUNCTION TO AUTO-UPDATE TIMESTAMP
-- ============================================================================

CREATE OR REPLACE FUNCTION update_deliveries_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_deliveries_timestamp ON deliveries;
CREATE TRIGGER trigger_update_deliveries_timestamp
  BEFORE UPDATE ON deliveries
  FOR EACH ROW
  EXECUTE FUNCTION update_deliveries_timestamp();

-- ============================================================================
-- 6. ENABLE REALTIME FOR DELIVERIES TABLE (for live tracking)
-- ============================================================================

-- This allows real-time subscriptions to delivery updates
-- Run this in Supabase Dashboard: Database > Replication
-- ALTER PUBLICATION supabase_realtime ADD TABLE deliveries;
