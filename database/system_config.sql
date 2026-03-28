-- ============================================================================
-- SYSTEM CONFIGURATION TABLE
-- Stores all configurable system parameters (single row, upsert only)
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- Ensures only ONE row ever exists

  -- Section 1: Driver Earnings
  rate_per_km NUMERIC(10,2) NOT NULL DEFAULT 40,
  max_driver_to_restaurant_km NUMERIC(10,2) NOT NULL DEFAULT 1,
  max_driver_to_restaurant_amount NUMERIC(10,2) NOT NULL DEFAULT 30,
  max_restaurant_proximity_km NUMERIC(10,2) NOT NULL DEFAULT 1,
  second_delivery_bonus NUMERIC(10,2) NOT NULL DEFAULT 20,
  additional_delivery_bonus NUMERIC(10,2) NOT NULL DEFAULT 30,

  -- Section 2: Delivery Availability Thresholds
  max_extra_time_minutes INT NOT NULL DEFAULT 10,
  max_extra_distance_km NUMERIC(10,2) NOT NULL DEFAULT 3,
  max_active_deliveries INT NOT NULL DEFAULT 5,

  -- Section 2b: Commission
  commission_percentage NUMERIC(5,2) NOT NULL DEFAULT 10,

  -- Section 3: Service Fee Tiers (stored as JSONB array)
  -- Format: [{"min": 0, "max": 300, "fee": 0}, {"min": 300, "max": 1000, "fee": 31}, ...]
  service_fee_tiers JSONB NOT NULL DEFAULT '[
    {"min": 0, "max": 300, "fee": 0},
    {"min": 300, "max": 1000, "fee": 31},
    {"min": 1000, "max": 1500, "fee": 42},
    {"min": 1500, "max": 2500, "fee": 56},
    {"min": 2500, "max": null, "fee": 62}
  ]'::jsonb,

  -- Section 4: Delivery Fee Tiers (stored as JSONB array)
  -- Format: [{"max_km": 1, "fee": 50}, {"max_km": 2, "fee": 80}, ...]
  -- Last tier has extra_per_100m for distance-based pricing
  delivery_fee_tiers JSONB NOT NULL DEFAULT '[
    {"max_km": 1, "fee": 50},
    {"max_km": 2, "fee": 80},
    {"max_km": 2.5, "fee": 87},
    {"max_km": null, "base_fee": 87, "extra_per_100m": 2.3, "base_km": 2.5}
  ]'::jsonb,

  -- Section 5: Pending Delivery Alert
  pending_alert_minutes INT NOT NULL DEFAULT 10,

  -- Section 6: Working Hours
  day_shift_start NUMERIC(4,2) NOT NULL DEFAULT 5.0,    -- 5:00 AM
  day_shift_end NUMERIC(4,2) NOT NULL DEFAULT 19.0,     -- 7:00 PM
  night_shift_start NUMERIC(4,2) NOT NULL DEFAULT 18.0, -- 6:00 PM
  night_shift_end NUMERIC(4,2) NOT NULL DEFAULT 6.0,    -- 6:00 AM

  -- Section 7: Launch Promotion (First Delivery)
  launch_promo_enabled BOOLEAN NOT NULL DEFAULT true,
  launch_promo_first_km_rate NUMERIC(10,2) NOT NULL DEFAULT 1,
  launch_promo_max_km NUMERIC(10,2) NOT NULL DEFAULT 5,
  launch_promo_beyond_km_rate NUMERIC(10,2) NOT NULL DEFAULT 40,

  -- Metadata
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- Insert the default row
INSERT INTO system_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Create an update trigger for updated_at
CREATE OR REPLACE FUNCTION update_system_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS system_config_updated_at ON system_config;
CREATE TRIGGER system_config_updated_at
  BEFORE UPDATE ON system_config
  FOR EACH ROW
  EXECUTE FUNCTION update_system_config_timestamp();

-- RLS: Only managers can read/update
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read system_config"
  ON system_config FOR SELECT
  USING (true);

CREATE POLICY "Service role can update system_config"
  ON system_config FOR UPDATE
  USING (true);

CREATE POLICY "Service role can insert system_config"
  ON system_config FOR INSERT
  WITH CHECK (true);
