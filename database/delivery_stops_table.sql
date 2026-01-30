-- ============================================================================
-- DELIVERY_STOPS TABLE
-- ============================================================================
-- Represents the ordered stops in a driver's route
-- This is the KEY DATA STRUCTURE for the new route-based delivery system
--
-- When a driver accepts a delivery:
--   - Insert 1 stop for restaurant (stop_type='restaurant')
--   - Insert 1 stop for customer (stop_type='customer')
--   - stop_order is sequentially assigned (last_stop + 1, last_stop + 2)
--
-- Active Deliveries page queries this table ordered by stop_order
-- Available Deliveries endpoint simulates adding new stops to this route
-- ============================================================================

CREATE TABLE IF NOT EXISTS delivery_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Which driver has this stop in their route
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  
  -- Which delivery does this stop belong to
  -- (a delivery has 2 stops: restaurant + customer)
  delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  
  -- Type of stop
  stop_type TEXT NOT NULL CHECK (stop_type IN ('restaurant', 'customer')),
  
  -- Location coordinates
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(10, 7) NOT NULL,
  
  -- Position in driver's route (ordered sequentially)
  -- Example:
  --   1 = Restaurant A (first pickup)
  --   2 = Customer A (first dropoff)
  --   3 = Restaurant B (second pickup)
  --   4 = Customer B (second dropoff)
  stop_order INTEGER NOT NULL,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Ensure a driver cannot have duplicate stops for same delivery
  UNIQUE(driver_id, delivery_id, stop_type)
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Query: "Get all stops for a driver" (used for Active Deliveries page)
CREATE INDEX IF NOT EXISTS idx_delivery_stops_driver_id 
ON delivery_stops(driver_id);

-- Query: "Get all stops ordered by sequence" (for route display)
CREATE INDEX IF NOT EXISTS idx_delivery_stops_driver_order 
ON delivery_stops(driver_id, stop_order);

-- Query: "Find stops by delivery ID"
CREATE INDEX IF NOT EXISTS idx_delivery_stops_delivery_id 
ON delivery_stops(delivery_id);

-- Query: "Filter stops by type" (restaurants vs customers)
CREATE INDEX IF NOT EXISTS idx_delivery_stops_type 
ON delivery_stops(stop_type);

-- ============================================================================
-- POLICY: Drivers can only see their own stops
-- ============================================================================

ALTER TABLE delivery_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view own delivery stops"
ON delivery_stops
FOR SELECT
TO authenticated
USING (driver_id = auth.uid());

CREATE POLICY "Service role can manage all delivery stops"
ON delivery_stops
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- HELPER: Get next stop_order for a driver
-- ============================================================================
-- Used when inserting new stops to ensure sequential ordering

CREATE OR REPLACE FUNCTION get_next_stop_order(p_driver_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_next_order INTEGER;
BEGIN
  SELECT COALESCE(MAX(stop_order), 0) + 1 INTO v_next_order
  FROM delivery_stops
  WHERE driver_id = p_driver_id;
  
  RETURN v_next_order;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CONSOLE OUTPUT HELPER (for debugging)
-- ============================================================================
-- When inserting stops, log to console what's happening

CREATE OR REPLACE FUNCTION log_delivery_stop_insertion()
RETURNS TRIGGER AS $$
BEGIN
  RAISE NOTICE '[DELIVERY_STOPS] ✓ Inserted: driver_id=%, delivery_id=%, stop_type=%, stop_order=%',
    NEW.driver_id, NEW.delivery_id, NEW.stop_type, NEW.stop_order;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_delivery_stop
AFTER INSERT ON delivery_stops
FOR EACH ROW
EXECUTE FUNCTION log_delivery_stop_insertion();

-- ============================================================================
-- CONSOLE OUTPUT: Describe the new table structure
-- ============================================================================

\echo '============================================================================'
\echo '[SCHEMA] ✅ Created delivery_stops table'
\echo '[PURPOSE] Tracks ordered stops in driver routes (restaurant → customer)'
\echo '[KEY CONCEPT] Driver has 1 route with multiple stops, not separate trips'
\echo '============================================================================'
