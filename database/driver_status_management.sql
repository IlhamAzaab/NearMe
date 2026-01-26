-- Auto-update driver status based on working_time
-- This function checks if a driver should be active based on their working_time schedule
-- and automatically updates their status if needed

-- Function to check if current time falls within driver's working hours
CREATE OR REPLACE FUNCTION is_driver_active_time(working_time_param TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  current_minutes INTEGER;
  current_hour INTEGER;
BEGIN
  -- Get current hour and calculate minutes since midnight
  current_hour := EXTRACT(HOUR FROM CURRENT_TIME);
  current_minutes := current_hour * 60 + EXTRACT(MINUTE FROM CURRENT_TIME);
  
  CASE working_time_param
    WHEN 'full_time' THEN
      -- Full time drivers are always active
      RETURN TRUE;
    
    WHEN 'morning' THEN
      -- Day Time: 6:00 AM (360 min) to 6:30 PM (1110 min)
      RETURN current_minutes >= 360 AND current_minutes < 1110;
    
    WHEN 'night' THEN
      -- Night Time: 6:00 PM (1080 min) to 6:00 AM (360 min)
      -- Crosses midnight
      RETURN current_minutes >= 1080 OR current_minutes < 360;
    
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-update driver status based on working_time
-- This can be called by a cron job or trigger
CREATE OR REPLACE FUNCTION auto_update_driver_status()
RETURNS TABLE(driver_id UUID, old_status TEXT, new_status TEXT, working_time TEXT) AS $$
BEGIN
  RETURN QUERY
  WITH status_updates AS (
    UPDATE drivers
    SET 
      driver_status = CASE
        -- If driver should be active based on time, keep their current status (active/inactive)
        -- If driver should NOT be active based on time, force to inactive
        WHEN is_driver_active_time(working_time) THEN driver_status
        WHEN NOT is_driver_active_time(working_time) THEN 'inactive'
        ELSE driver_status
      END,
      updated_at = NOW()
    WHERE 
      -- Only update if status needs to change
      (NOT is_driver_active_time(working_time) AND driver_status = 'active')
      OR (working_time IS NOT NULL)
    RETURNING 
      id,
      LAG(driver_status) OVER (PARTITION BY id ORDER BY updated_at) as old_status_val,
      driver_status as new_status_val,
      working_time as working_time_val
  )
  SELECT 
    id as driver_id,
    old_status_val as old_status,
    new_status_val as new_status,
    working_time_val as working_time
  FROM status_updates
  WHERE old_status_val IS DISTINCT FROM new_status_val;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to validate driver status changes
-- Prevents drivers from going active outside their working hours
CREATE OR REPLACE FUNCTION validate_driver_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow status changes for non-active/inactive statuses (pending, suspended, etc.)
  IF NEW.driver_status NOT IN ('active', 'inactive') THEN
    RETURN NEW;
  END IF;

  -- If driver is trying to go active, check if they're within working hours
  IF NEW.driver_status = 'active' AND OLD.driver_status != 'active' THEN
    IF NOT is_driver_active_time(NEW.working_time) THEN
      RAISE EXCEPTION 'Cannot activate driver outside their working time schedule. Working time: %, Current status would be inactive.', NEW.working_time;
    END IF;
  END IF;

  -- Always allow going inactive
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on drivers table
DROP TRIGGER IF EXISTS validate_driver_status_trigger ON drivers;
CREATE TRIGGER validate_driver_status_trigger
  BEFORE UPDATE OF driver_status ON drivers
  FOR EACH ROW
  EXECUTE FUNCTION validate_driver_status_change();

-- Helper function to get drivers that should be active right now
CREATE OR REPLACE FUNCTION get_active_available_drivers(city_filter TEXT DEFAULT NULL)
RETURNS TABLE(
  driver_id UUID,
  driver_name TEXT,
  driver_type TEXT,
  driver_status TEXT,
  working_time TEXT,
  should_be_active BOOLEAN,
  city TEXT
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
    d.city
  FROM drivers d
  WHERE 
    d.driver_status = 'active'
    AND is_driver_active_time(d.working_time) = TRUE
    AND d.onboarding_completed = TRUE
    AND (city_filter IS NULL OR d.city = city_filter)
  ORDER BY d.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get driver status info
CREATE OR REPLACE FUNCTION get_driver_status_info(driver_id_param UUID)
RETURNS TABLE(
  driver_id UUID,
  current_status TEXT,
  working_time TEXT,
  should_be_active BOOLEAN,
  can_toggle_active BOOLEAN,
  can_toggle_inactive BOOLEAN,
  next_status_change TIMESTAMP
) AS $$
DECLARE
  driver_working_time TEXT;
  current_minutes INTEGER;
BEGIN
  -- Get driver's working time
  SELECT working_time INTO driver_working_time
  FROM drivers
  WHERE id = driver_id_param;

  current_minutes := EXTRACT(HOUR FROM CURRENT_TIME) * 60 + EXTRACT(MINUTE FROM CURRENT_TIME);

  RETURN QUERY
  SELECT 
    d.id as driver_id,
    d.driver_status as current_status,
    d.working_time,
    is_driver_active_time(d.working_time) as should_be_active,
    is_driver_active_time(d.working_time) as can_toggle_active,
    TRUE as can_toggle_inactive,
    CASE 
      WHEN d.working_time = 'full_time' THEN NULL
      WHEN d.working_time = 'morning' THEN
        CASE 
          WHEN current_minutes < 360 THEN CURRENT_DATE + TIME '06:00:00'
          WHEN current_minutes >= 1110 THEN CURRENT_DATE + INTERVAL '1 day' + TIME '06:00:00'
          ELSE CURRENT_DATE + TIME '18:30:00'
        END
      WHEN d.working_time = 'night' THEN
        CASE 
          WHEN current_minutes < 360 THEN CURRENT_DATE + TIME '06:00:00'
          WHEN current_minutes >= 1080 THEN CURRENT_DATE + INTERVAL '1 day' + TIME '06:00:00'
          ELSE CURRENT_DATE + TIME '18:00:00'
        END
      ELSE NULL
    END as next_status_change
  FROM drivers d
  WHERE d.id = driver_id_param;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION is_driver_active_time(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION auto_update_driver_status() TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_available_drivers(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_driver_status_info(UUID) TO authenticated;

COMMENT ON FUNCTION is_driver_active_time IS 'Check if a driver should be active based on their working_time schedule';
COMMENT ON FUNCTION auto_update_driver_status IS 'Automatically update driver status based on working_time schedules';
COMMENT ON FUNCTION get_active_available_drivers IS 'Get all drivers that are currently active and within their working hours';
COMMENT ON FUNCTION get_driver_status_info IS 'Get detailed status information for a specific driver';
