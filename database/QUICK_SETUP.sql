-- ============================================================================
-- QUICK SETUP - Run this in Supabase SQL Editor
-- ============================================================================

-- Create SECURITY DEFINER function for notifications
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
    recipient_id, recipient_role, order_id, restaurant_id,
    type, title, message, metadata, is_read, created_at
  )
  VALUES (
    p_recipient_id, p_recipient_role, p_order_id, p_restaurant_id,
    p_type, p_title, p_message, p_metadata, false, now()
  )
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- Lock down permissions
REVOKE ALL ON FUNCTION public.create_notification FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.create_notification TO service_role;

-- Grant table permissions to service_role
GRANT ALL ON TABLE notifications TO service_role;

-- Verify
SELECT 'Function created successfully!' as status;
