-- Add manual_status_override column to drivers table
-- This column tracks if a driver has manually overridden their status
-- to go online outside their scheduled working hours

-- Add the column (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'drivers' AND column_name = 'manual_status_override'
    ) THEN
        ALTER TABLE drivers ADD COLUMN manual_status_override BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Update existing drivers to have manual_status_override = false
UPDATE drivers SET manual_status_override = FALSE WHERE manual_status_override IS NULL;

-- Add comment to the column
COMMENT ON COLUMN drivers.manual_status_override IS 'True if driver has manually overridden working hours to go active';

-- Grant permissions (if needed)
-- GRANT SELECT, UPDATE ON drivers TO authenticated;

-- Success message
SELECT 'manual_status_override column added successfully' as result;
