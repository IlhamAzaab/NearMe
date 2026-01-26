-- ============================================================================
-- PRODUCTION: Notify Active Drivers When Order is Accepted
-- PostgreSQL Function with Supabase Realtime
-- ============================================================================

/**
 * Notify all active drivers about a new order
 * 
 * This function:
 * 1. Finds all drivers with driver_status = 'active'
 * 2. Inserts one notification per driver
 * 3. Respects working_time schedules
 * 4. Triggers Supabase Realtime broadcast
 * 5. Prevents duplicate notifications
 * 
 * Usage:
 *   SELECT notify_drivers_new_order(
 *     order_id := 'uuid',
 *     restaurant_id := 'uuid',
 *     restaurant_name := 'Restaurant Name',
 *     delivery_address := 'Address',
 *     delivery_city := 'City'
 *   );
 */

CREATE OR REPLACE FUNCTION notify_drivers_new_order(
  order_id UUID,
  restaurant_id UUID,
  restaurant_name TEXT,
  delivery_address TEXT,
  delivery_city TEXT
)
RETURNS TABLE(
  notification_count INTEGER,
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_active_drivers_count INTEGER;
  v_inserted_count INTEGER;
BEGIN
  -- Get count of active drivers within working hours
  SELECT COUNT(*) INTO v_active_drivers_count
  FROM drivers
  WHERE 
    driver_status = 'active'
    AND is_driver_active_time(working_time) = TRUE
    AND onboarding_completed = TRUE
    AND (driver_type IS NOT NULL);  -- Has driver type selected

  -- If no active drivers, return early
  IF v_active_drivers_count = 0 THEN
    RETURN QUERY SELECT 0, FALSE, 'No active drivers found'::TEXT;
    RETURN;
  END IF;

  -- Insert notifications for each active driver
  INSERT INTO notifications (
    recipient_id,
    recipient_role,
    order_id,
    type,
    title,
    message,
    metadata,
    read,
    created_at
  )
  SELECT
    d.id,
    'driver'::TEXT,
    order_id,
    'new_delivery'::TEXT,
    'New Delivery Available!'::TEXT,
    CONCAT(
      'Pickup from ', 
      restaurant_name, 
      ' - ', 
      delivery_address
    )::TEXT,
    JSONB_BUILD_OBJECT(
      'order_id', order_id,
      'restaurant_id', restaurant_id,
      'restaurant_name', restaurant_name,
      'delivery_address', delivery_address,
      'delivery_city', delivery_city,
      'driver_type', d.driver_type
    )::TEXT,
    FALSE,
    NOW()
  FROM drivers d
  WHERE 
    d.driver_status = 'active'
    AND is_driver_active_time(d.working_time) = TRUE
    AND d.onboarding_completed = TRUE
    AND d.driver_type IS NOT NULL
  ON CONFLICT DO NOTHING;  -- Prevent duplicates

  -- Get count of inserted notifications
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  -- Return success response
  RETURN QUERY 
  SELECT 
    v_inserted_count,
    TRUE,
    CONCAT(v_inserted_count, ' drivers notified')::TEXT;

EXCEPTION WHEN OTHERS THEN
  -- Log error and return failure
  RAISE WARNING 'notify_drivers_new_order error: %', SQLERRM;
  RETURN QUERY SELECT 0, FALSE, CONCAT('Error: ', SQLERRM)::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Grant execute permission to authenticated users
-- ============================================================================
GRANT EXECUTE ON FUNCTION notify_drivers_new_order(UUID, UUID, TEXT, TEXT, TEXT) 
  TO authenticated;

-- ============================================================================
-- Alternative: Simpler version without working_time check
-- Use this if you want to notify ALL active drivers regardless of schedule
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_drivers_new_order_simple(
  order_id UUID,
  restaurant_id UUID,
  restaurant_name TEXT,
  delivery_address TEXT,
  delivery_city TEXT
)
RETURNS TABLE(
  notification_count INTEGER,
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_inserted_count INTEGER;
BEGIN
  -- Insert notifications for all active drivers
  INSERT INTO notifications (
    recipient_id,
    recipient_role,
    order_id,
    type,
    title,
    message,
    metadata,
    read,
    created_at
  )
  SELECT
    d.id,
    'driver'::TEXT,
    order_id,
    'new_delivery'::TEXT,
    'New Delivery Available!'::TEXT,
    CONCAT(
      'Pickup from ', 
      restaurant_name, 
      ' - ', 
      delivery_address
    )::TEXT,
    JSONB_BUILD_OBJECT(
      'order_id', order_id,
      'restaurant_id', restaurant_id,
      'restaurant_name', restaurant_name,
      'delivery_address', delivery_address,
      'delivery_city', delivery_city
    )::TEXT,
    FALSE,
    NOW()
  FROM drivers d
  WHERE 
    d.driver_status = 'active'
    AND d.onboarding_completed = TRUE
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  RETURN QUERY 
  SELECT 
    v_inserted_count,
    TRUE,
    CONCAT(v_inserted_count, ' drivers notified')::TEXT;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_drivers_new_order_simple error: %', SQLERRM;
  RETURN QUERY SELECT 0, FALSE, CONCAT('Error: ', SQLERRM)::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION notify_drivers_new_order_simple(UUID, UUID, TEXT, TEXT, TEXT) 
  TO authenticated;

-- ============================================================================
-- Test the function
-- ============================================================================
-- SELECT * FROM notify_drivers_new_order_simple(
--   '550e8400-e29b-41d4-a716-446655440000'::UUID,
--   '550e8400-e29b-41d4-a716-446655440001'::UUID,
--   'Test Restaurant',
--   '123 Main Street, City',
--   'Colombo'
-- );
