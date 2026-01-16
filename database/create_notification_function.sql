-- ============================================================================
-- SECURITY DEFINER Function for Notifications
-- This allows backend to insert notifications while RLS is enabled
-- ============================================================================

-- Create the notification function that bypasses RLS
CREATE OR REPLACE FUNCTION public.create_notification(
  p_recipient_id uuid,
  p_recipient_role text,
  p_order_id uuid DEFAULT NULL,
  p_restaurant_id uuid DEFAULT NULL,
  p_type text DEFAULT 'info',
  p_title text DEFAULT '',
  p_message text DEFAULT '',
  p_metadata jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id uuid;
BEGIN
  INSERT INTO notifications (
    recipient_id,
    recipient_role,
    order_id,
    restaurant_id,
    type,
    title,
    message,
    metadata,
    is_read,
    created_at
  )
  VALUES (
    p_recipient_id,
    p_recipient_role,
    p_order_id,
    p_restaurant_id,
    p_type,
    p_title,
    p_message,
    p_metadata,
    false,
    now()
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- Grant execute permission to service_role only
REVOKE ALL ON FUNCTION public.create_notification FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.create_notification TO service_role;

-- Verify function was created
SELECT 
  routine_name, 
  routine_type,
  security_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name = 'create_notification';
