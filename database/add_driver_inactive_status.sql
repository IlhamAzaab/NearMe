-- Add 'inactive' to the allowed driver_status values
-- This fixes the 500 error when drivers toggle offline

-- Drop and recreate the CHECK constraint to include 'inactive'
ALTER TABLE drivers 
DROP CONSTRAINT IF EXISTS drivers_driver_status_check;

ALTER TABLE drivers 
ADD CONSTRAINT drivers_driver_status_check 
CHECK (driver_status IN ('pending', 'active', 'inactive', 'suspended', 'rejected'));

-- Verify the change
SELECT 
  constraint_name, 
  check_clause 
FROM information_schema.check_constraints 
WHERE constraint_name LIKE '%driver_status%';
