-- Add is_manually_unavailable column to foods table
-- When true, the food was explicitly toggled off by admin and the scheduler won't auto-enable it
-- When false (default), the scheduler controls is_available based on available_time slots

ALTER TABLE foods
ADD COLUMN IF NOT EXISTS is_manually_unavailable BOOLEAN DEFAULT false;

-- Set existing unavailable foods as manually unavailable (preserve admin intent)
UPDATE foods SET is_manually_unavailable = true WHERE is_available = false;

-- Add index for the scheduler query
CREATE INDEX IF NOT EXISTS idx_foods_manually_unavailable ON foods (is_manually_unavailable);
