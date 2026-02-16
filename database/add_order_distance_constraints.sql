-- ============================================================================
-- ADD ORDER DISTANCE CONSTRAINTS TO SYSTEM CONFIG
-- ============================================================================
-- Stores distance-based minimum order subtotal constraints as JSONB
-- Format: [{"min_km": 0, "max_km": 5, "min_subtotal": 300}, ...]
-- Also stores max_order_distance_km (beyond which ordering is blocked)
-- ============================================================================

-- Add order distance constraints column
ALTER TABLE system_config
ADD COLUMN IF NOT EXISTS order_distance_constraints JSONB NOT NULL DEFAULT '[
  {"min_km": 0, "max_km": 5, "min_subtotal": 300},
  {"min_km": 5, "max_km": 10, "min_subtotal": 1000},
  {"min_km": 10, "max_km": 15, "min_subtotal": 2000},
  {"min_km": 15, "max_km": 25, "min_subtotal": 3000}
]'::jsonb;

-- Maximum distance a customer can order from (beyond this, ordering is blocked)
ALTER TABLE system_config
ADD COLUMN IF NOT EXISTS max_order_distance_km NUMERIC(10,2) NOT NULL DEFAULT 25;
