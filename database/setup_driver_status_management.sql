-- Quick Setup Script for Driver Status Management
-- Run this script to set up all necessary database functions and triggers

-- ============================================================================
-- STEP 1: Create helper function to check if driver should be active
-- ============================================================================
CREATE OR REPLACE FUNCTION is_driver_active_time(working_time_param TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  current_minutes INTEGER;
  current_hour INTEGER;
BEGIN
  current_hour := EXTRACT(HOUR FROM CURRENT_TIME);
  current_minutes := current_hour * 60 + EXTRACT(MINUTE FROM CURRENT_TIME);
  
  CASE working_time_param
    WHEN 'full_time' THEN
      RETURN TRUE;
    WHEN 'morning' THEN
      RETURN current_minutes >= 360 AND current_minutes < 1110;
    WHEN 'night' THEN
      RETURN current_minutes >= 1080 OR current_minutes < 360;
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 2: Create trigger function to validate status changes
-- ============================================================================
CREATE OR REPLACE FUNCTION validate_driver_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.driver_status NOT IN ('active', 'inactive') THEN
    RETURN NEW;
  END IF;

  IF NEW.driver_status = 'active' AND OLD.driver_status != 'active' THEN
    IF NOT is_driver_active_time(NEW.working_time) THEN
      RAISE EXCEPTION 'Cannot activate driver outside their working time schedule. Working time: %, Current status would be inactive.', NEW.working_time;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 3: Create or replace trigger
-- ============================================================================
DROP TRIGGER IF EXISTS validate_driver_status_trigger ON drivers;
CREATE TRIGGER validate_driver_status_trigger
  BEFORE UPDATE OF driver_status ON drivers
  FOR EACH ROW
  EXECUTE FUNCTION validate_driver_status_change();

-- ============================================================================
-- STEP 4: Create function to get active available drivers
-- ============================================================================
CREATE OR REPLACE FUNCTION get_active_available_drivers(city_filter TEXT DEFAULT NULL)
RETURNS TABLE(
  driver_id UUID,
  driver_name TEXT,
  driver_type TEXT,
  driver_status TEXT,
  working_time TEXT,
  should_be_active BOOLEAN,
  city TEXT,
  latitude NUMERIC,
  longitude NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id as driver_id,
    d.full_name as driver_name,
    d.driver_type,
    d.driver_status,
    d.working_time,
    is_driver_active_time(d.working_time) as should_be_active,
    d.city,
    d.latitude,
    d.longitude
  FROM drivers d
  WHERE 
    d.driver_status = 'active'
    AND is_driver_active_time(d.working_time) = TRUE
    AND d.onboarding_completed = TRUE
    AND (city_filter IS NULL OR d.city = city_filter)
  ORDER BY d.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 5: Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION is_driver_active_time(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_available_drivers(TEXT) TO authenticated;

-- ============================================================================
-- STEP 6: Test the functions
-- ============================================================================
-- Test 1: Check if function works
SELECT is_driver_active_time('full_time') as full_time_active,
       is_driver_active_time('morning') as morning_active,
       is_driver_active_time('night') as night_active;

-- Test 2: Get currently active drivers (should return only those within working hours)
SELECT * FROM get_active_available_drivers();

-- Test 3: Check specific driver status (replace with actual driver ID)
-- SELECT 
--   id,
--   full_name,
--   driver_status,
--   working_time,
--   is_driver_active_time(working_time) as should_be_active
-- FROM drivers
-- WHERE id = 'YOUR_DRIVER_ID_HERE';

-- ============================================================================
-- STEP 7: Optional - Set default working_time for existing drivers
-- ============================================================================
-- Uncomment and run if you have existing drivers without working_time set
-- UPDATE drivers 
-- SET working_time = 'full_time' 
-- WHERE working_time IS NULL;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Check drivers and their calculated status
SELECT 
  id,
  full_name,
  driver_status,
  working_time,
  is_driver_active_time(working_time) as should_be_active,
  CASE 
    WHEN driver_status = 'active' AND is_driver_active_time(working_time) THEN 'ACTIVE & IN TIME ✓'
    WHEN driver_status = 'active' AND NOT is_driver_active_time(working_time) THEN 'ACTIVE BUT OUT OF TIME ✗'
    WHEN driver_status = 'inactive' AND is_driver_active_time(working_time) THEN 'INACTIVE BUT IN TIME'
    ELSE 'INACTIVE & OUT OF TIME'
  END as status_check
FROM drivers
WHERE onboarding_completed = true
ORDER BY full_name;

-- Check all drivers grouped by working_time
SELECT 
  working_time,
  COUNT(*) as total_drivers,
  COUNT(*) FILTER (WHERE driver_status = 'active') as active_drivers,
  COUNT(*) FILTER (WHERE driver_status = 'active' AND is_driver_active_time(working_time)) as truly_active
FROM drivers
WHERE onboarding_completed = true
GROUP BY working_time;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✓ Driver Status Management Setup Complete!';
  RAISE NOTICE '✓ Functions created: is_driver_active_time, get_active_available_drivers';
  RAISE NOTICE '✓ Trigger created: validate_driver_status_trigger';
  RAISE NOTICE '✓ Permissions granted';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '1. Restart your backend server';
  RAISE NOTICE '2. Test the status toggle in driver dashboard';
  RAISE NOTICE '3. Verify notifications page shows correctly';
  RAISE NOTICE '4. Check that deliveries only show to active drivers in working hours';
END $$;
