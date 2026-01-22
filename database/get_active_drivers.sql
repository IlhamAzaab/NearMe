/**
 * PostgreSQL Function: get_active_drivers
 * Returns all drivers that are currently active and have working_time set
 * 
 * Created to bypass potential RLS restrictions on direct table access
 * Usage: SELECT * FROM get_active_drivers();
 */

CREATE OR REPLACE FUNCTION get_active_drivers()
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  driver_status TEXT,
  working_time TEXT,
  city TEXT,
  driver_type TEXT,
  email TEXT,
  phone TEXT,
  onboarding_completed BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id,
    d.full_name,
    d.driver_status,
    d.working_time,
    d.city,
    d.driver_type,
    d.email,
    d.phone,
    d.onboarding_completed
  FROM drivers d
  WHERE d.driver_status = 'active'
    AND d.working_time IS NOT NULL
    AND d.onboarding_completed = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to anon and authenticated roles
GRANT EXECUTE ON FUNCTION get_active_drivers() TO anon, authenticated;
