-- ============================================================================
-- Update deliveries table schema for new status flow
-- Add on_the_way_at timestamp, keep other tracking columns
-- ============================================================================

-- Add new timestamp column for on_the_way status
ALTER TABLE deliveries
ADD COLUMN IF NOT EXISTS on_the_way_at TIMESTAMP WITH TIME ZONE;

-- Note: We keep the old timestamp columns for historical data
-- heading_to_restaurant_at, arrived_restaurant_at, heading_to_customer_at
-- can be dropped later if you want to clean up, but keeping them preserves history

-- Optional: Drop old timestamp columns (uncomment if you want to remove them)
-- ALTER TABLE deliveries DROP COLUMN IF EXISTS heading_to_restaurant_at;
-- ALTER TABLE deliveries DROP COLUMN IF EXISTS arrived_restaurant_at;
-- ALTER TABLE deliveries DROP COLUMN IF EXISTS heading_to_customer_at;

-- Verify the changes
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'deliveries' 
-- AND column_name LIKE '%_at'
-- ORDER BY column_name;
