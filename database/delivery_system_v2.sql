-- ============================================================================
-- DELIVERY SYSTEM V2 - Production-Ready with Proper RLS & Atomic Operations
-- ============================================================================
-- Features:
-- - Proper RLS policies (no service_role_key bypass)
-- - Atomic driver acceptance (prevents race conditions)
-- - Real-time tracking via Supabase Realtime
-- - Notification system for all parties
--
-- IMPORTANT: Run this AFTER orders_schema.sql
-- ============================================================================

-- ============================================================================
-- 0. ADD MISSING COLUMNS TO DRIVERS TABLE (for location tracking)
-- ============================================================================

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'rejected'));
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- If status column already exists with driver_status name, sync it
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'driver_status') THEN
    UPDATE drivers SET status = driver_status WHERE status IS NULL;
  END IF;
END $$;


-- ============================================================================
-- 0.5 NOTIFICATIONS TABLE - Already exists, skip creation
-- ============================================================================
-- The notifications table uses:
--   recipient_id (not user_id)
--   recipient_role (not user_role)
--   type uses notification_type enum


-- ============================================================================
-- 0.6 CREATE ORDER_STATUS_HISTORY TABLE IF NOT EXISTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID,
  changed_by_role TEXT CHECK (changed_by_role IN ('customer', 'admin', 'driver', 'manager')),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id);


-- ============================================================================
-- 0.7 CREATE DELIVERIES TABLE IF NOT EXISTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'assigned', 'picking_up', 'picked_up', 'delivering', 'delivered', 'failed')),
  driver_latitude NUMERIC(10, 7),
  driver_longitude NUMERIC(10, 7),
  last_location_update TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  delivery_photo_url TEXT,
  delivery_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deliveries_order_id ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver_id ON deliveries(driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);


-- ============================================================================
-- 1. DROP EXISTING POLICIES (Clean slate)
-- ============================================================================

-- Orders policies
DROP POLICY IF EXISTS orders_customer_select ON orders;
DROP POLICY IF EXISTS orders_customer_insert ON orders;
DROP POLICY IF EXISTS orders_admin_select ON orders;
DROP POLICY IF EXISTS orders_admin_update ON orders;
DROP POLICY IF EXISTS orders_driver_select ON orders;
DROP POLICY IF EXISTS orders_driver_update ON orders;

-- Order items policies
DROP POLICY IF EXISTS order_items_customer_select ON order_items;
DROP POLICY IF EXISTS order_items_customer_insert ON order_items;
DROP POLICY IF EXISTS order_items_admin_select ON order_items;
DROP POLICY IF EXISTS order_items_driver_select ON order_items;

-- Deliveries policies
DROP POLICY IF EXISTS deliveries_customer_select ON deliveries;
DROP POLICY IF EXISTS deliveries_customer_insert ON deliveries;
DROP POLICY IF EXISTS deliveries_admin_select ON deliveries;
DROP POLICY IF EXISTS deliveries_driver_select ON deliveries;
DROP POLICY IF EXISTS deliveries_driver_update ON deliveries;
DROP POLICY IF EXISTS deliveries_driver_accept ON deliveries;

-- Notifications policies
DROP POLICY IF EXISTS notifications_select ON notifications;
DROP POLICY IF EXISTS notifications_insert ON notifications;
DROP POLICY IF EXISTS notifications_update ON notifications;

-- Order status history policies
DROP POLICY IF EXISTS order_status_history_select ON order_status_history;
DROP POLICY IF EXISTS order_status_history_insert ON order_status_history;


-- ============================================================================
-- 2. ENABLE RLS ON ALL TABLES
-- ============================================================================

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 3. ORDERS TABLE POLICIES
-- ============================================================================

-- Customers can view their own orders
CREATE POLICY orders_customer_select ON orders
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

-- Customers can create orders
CREATE POLICY orders_customer_insert ON orders
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());

-- Restaurant admins can view their restaurant's orders
CREATE POLICY orders_admin_select ON orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.id = auth.uid()
      AND admins.restaurant_id = orders.restaurant_id
    )
  );

-- Restaurant admins can update their restaurant's orders
CREATE POLICY orders_admin_update ON orders
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.id = auth.uid()
      AND admins.restaurant_id = orders.restaurant_id
    )
  );

-- Drivers can view orders they are assigned to
CREATE POLICY orders_driver_select ON orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM deliveries
      WHERE deliveries.order_id = orders.id
      AND deliveries.driver_id = auth.uid()
    )
  );

-- Drivers can view orders that are ready for pickup (pending deliveries)
CREATE POLICY orders_driver_select_available ON orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM drivers WHERE id = auth.uid() AND (status = 'active' OR driver_status = 'active')
    )
    AND status IN ('accepted', 'preparing', 'ready')
    AND EXISTS (
      SELECT 1 FROM deliveries
      WHERE deliveries.order_id = orders.id
      AND deliveries.driver_id IS NULL
      AND deliveries.status = 'pending'
    )
  );

-- Drivers can update orders they are assigned to
CREATE POLICY orders_driver_update ON orders
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM deliveries
      WHERE deliveries.order_id = orders.id
      AND deliveries.driver_id = auth.uid()
    )
  );


-- ============================================================================
-- 4. ORDER_ITEMS TABLE POLICIES
-- ============================================================================

-- Customers can view items from their orders
CREATE POLICY order_items_customer_select ON order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND orders.customer_id = auth.uid()
    )
  );

-- Customers can insert items when creating order
CREATE POLICY order_items_customer_insert ON order_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND orders.customer_id = auth.uid()
    )
  );

-- Restaurant admins can view order items
CREATE POLICY order_items_admin_select ON order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      JOIN admins ON admins.restaurant_id = orders.restaurant_id
      WHERE orders.id = order_items.order_id
      AND admins.id = auth.uid()
    )
  );

-- Drivers can view items for their deliveries
CREATE POLICY order_items_driver_select ON order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM deliveries
      WHERE deliveries.order_id = order_items.order_id
      AND deliveries.driver_id = auth.uid()
    )
  );


-- ============================================================================
-- 5. DELIVERIES TABLE POLICIES
-- ============================================================================

-- Customers can view deliveries for their orders
CREATE POLICY deliveries_customer_select ON deliveries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = deliveries.order_id
      AND orders.customer_id = auth.uid()
    )
  );

-- Customers can create delivery record when placing order
CREATE POLICY deliveries_customer_insert ON deliveries
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = deliveries.order_id
      AND orders.customer_id = auth.uid()
    )
  );

-- Restaurant admins can view deliveries
CREATE POLICY deliveries_admin_select ON deliveries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      JOIN admins ON admins.restaurant_id = orders.restaurant_id
      WHERE orders.id = deliveries.order_id
      AND admins.id = auth.uid()
    )
  );

-- Drivers can view pending deliveries (for acceptance)
CREATE POLICY deliveries_driver_select_pending ON deliveries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM drivers WHERE id = auth.uid() AND (status = 'active' OR driver_status = 'active')
    )
    AND driver_id IS NULL
    AND status = 'pending'
  );

-- Drivers can view their assigned deliveries
CREATE POLICY deliveries_driver_select ON deliveries
  FOR SELECT TO authenticated
  USING (driver_id = auth.uid());

-- Drivers can update their assigned deliveries (location, status)
CREATE POLICY deliveries_driver_update ON deliveries
  FOR UPDATE TO authenticated
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());


-- ============================================================================
-- 6. ATOMIC DRIVER ACCEPTANCE FUNCTION
-- ============================================================================
-- This function atomically assigns a driver to a delivery
-- It prevents race conditions when multiple drivers try to accept

CREATE OR REPLACE FUNCTION accept_delivery(p_delivery_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id UUID;
  v_delivery deliveries%ROWTYPE;
  v_order orders%ROWTYPE;
  v_driver drivers%ROWTYPE;
BEGIN
  -- Get the current user's ID
  v_driver_id := auth.uid();
  
  -- Verify driver exists and is active (check both status and driver_status columns for compatibility)
  SELECT * INTO v_driver FROM drivers WHERE id = v_driver_id AND (status = 'active' OR driver_status = 'active');
  IF v_driver IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Driver not found or not active');
  END IF;
  
  -- Lock and update the delivery atomically
  UPDATE deliveries
  SET 
    driver_id = v_driver_id,
    status = 'assigned',
    assigned_at = now(),
    updated_at = now()
  WHERE id = p_delivery_id
    AND driver_id IS NULL  -- Critical: Only if no driver assigned
    AND status = 'pending'
  RETURNING * INTO v_delivery;
  
  -- Check if update was successful
  IF v_delivery IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Order already taken by another driver');
  END IF;
  
  -- Get the order details
  SELECT * INTO v_order FROM orders WHERE id = v_delivery.order_id;
  
  -- Update order status
  UPDATE orders
  SET status = 'picked_up', picked_up_at = now(), updated_at = now()
  WHERE id = v_delivery.order_id;
  
  -- Insert status history
  INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, changed_by_role)
  VALUES (v_delivery.order_id, v_order.status, 'picked_up', v_driver_id, 'driver');
  
  -- Notify customer that driver is assigned
  INSERT INTO notifications (recipient_id, recipient_role, type, title, message, order_id, metadata)
  VALUES (
    v_order.customer_id,
    'customer',
    'driver_assigned',
    'Driver Assigned!',
    'A driver has been assigned to your order and is on the way to pick it up.',
    v_order.id,
    json_build_object(
      'driver_name', v_driver.full_name,
      'driver_phone', v_driver.phone,
      'order_number', v_order.order_number
    )
  );
  
  -- Notify restaurant
  INSERT INTO notifications (recipient_id, recipient_role, type, title, message, order_id, restaurant_id, metadata)
  SELECT 
    admin_id,
    'admin',
    'driver_assigned',
    'Driver Assigned',
    'Driver ' || v_driver.full_name || ' will pick up order ' || v_order.order_number,
    v_order.id,
    v_order.restaurant_id,
    json_build_object('driver_name', v_driver.full_name, 'driver_phone', v_driver.phone)
  FROM restaurants WHERE id = v_order.restaurant_id;
  
  RETURN json_build_object(
    'success', true,
    'message', 'Delivery accepted successfully',
    'delivery_id', v_delivery.id,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'restaurant_name', v_order.restaurant_name,
    'restaurant_address', v_order.restaurant_address,
    'restaurant_latitude', v_order.restaurant_latitude,
    'restaurant_longitude', v_order.restaurant_longitude,
    'delivery_address', v_order.delivery_address,
    'delivery_latitude', v_order.delivery_latitude,
    'delivery_longitude', v_order.delivery_longitude,
    'customer_name', v_order.customer_name,
    'customer_phone', v_order.customer_phone
  );
END;
$$;


-- ============================================================================
-- 7. DRIVER LOCATION UPDATE FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION update_driver_location(
  p_delivery_id UUID,
  p_latitude NUMERIC,
  p_longitude NUMERIC
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id UUID;
  v_delivery deliveries%ROWTYPE;
BEGIN
  v_driver_id := auth.uid();
  
  -- Update delivery location
  UPDATE deliveries
  SET 
    driver_latitude = p_latitude,
    driver_longitude = p_longitude,
    last_location_update = now(),
    updated_at = now()
  WHERE id = p_delivery_id
    AND driver_id = v_driver_id
  RETURNING * INTO v_delivery;
  
  IF v_delivery IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Delivery not found or not assigned to you');
  END IF;
  
  -- Also update driver's location in drivers table
  UPDATE drivers
  SET 
    latitude = p_latitude,
    longitude = p_longitude,
    updated_at = now()
  WHERE id = v_driver_id;
  
  RETURN json_build_object('success', true, 'message', 'Location updated');
END;
$$;


-- ============================================================================
-- 8. DELIVERY STATUS UPDATE FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION update_delivery_status(
  p_delivery_id UUID,
  p_status TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id UUID;
  v_delivery deliveries%ROWTYPE;
  v_order orders%ROWTYPE;
  v_new_order_status TEXT;
  v_notification_type TEXT;
  v_notification_title TEXT;
  v_notification_message TEXT;
BEGIN
  v_driver_id := auth.uid();
  
  -- Validate status
  IF p_status NOT IN ('picking_up', 'picked_up', 'delivering', 'delivered') THEN
    RETURN json_build_object('success', false, 'message', 'Invalid status');
  END IF;
  
  -- Get current delivery
  SELECT * INTO v_delivery FROM deliveries WHERE id = p_delivery_id AND driver_id = v_driver_id;
  IF v_delivery IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Delivery not found');
  END IF;
  
  -- Get order
  SELECT * INTO v_order FROM orders WHERE id = v_delivery.order_id;
  
  -- Map delivery status to order status
  CASE p_status
    WHEN 'picking_up' THEN
      v_new_order_status := 'picked_up';
      v_notification_type := 'order_picked_up';
      v_notification_title := 'Driver on the way!';
      v_notification_message := 'Your driver is heading to pick up your order.';
    WHEN 'picked_up' THEN
      v_new_order_status := 'on_the_way';
      v_notification_type := 'order_on_the_way';
      v_notification_title := 'Order picked up!';
      v_notification_message := 'Your order has been picked up and is on the way.';
    WHEN 'delivering' THEN
      v_new_order_status := 'on_the_way';
      v_notification_type := 'order_on_the_way';
      v_notification_title := 'Almost there!';
      v_notification_message := 'Your driver is on the way to deliver your order.';
    WHEN 'delivered' THEN
      v_new_order_status := 'delivered';
      v_notification_type := 'order_delivered';
      v_notification_title := 'Order delivered!';
      v_notification_message := 'Your order has been delivered. Enjoy your meal!';
  END CASE;
  
  -- Update delivery
  UPDATE deliveries
  SET 
    status = p_status,
    picked_up_at = CASE WHEN p_status = 'picked_up' THEN now() ELSE picked_up_at END,
    delivered_at = CASE WHEN p_status = 'delivered' THEN now() ELSE delivered_at END,
    updated_at = now()
  WHERE id = p_delivery_id;
  
  -- Update order
  UPDATE orders
  SET 
    status = v_new_order_status,
    picked_up_at = CASE WHEN v_new_order_status = 'picked_up' THEN now() ELSE picked_up_at END,
    delivered_at = CASE WHEN v_new_order_status = 'delivered' THEN now() ELSE delivered_at END,
    updated_at = now()
  WHERE id = v_order.id;
  
  -- Insert status history
  INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, changed_by_role)
  VALUES (v_order.id, v_order.status, v_new_order_status, v_driver_id, 'driver');
  
  -- Notify customer
  INSERT INTO notifications (recipient_id, recipient_role, type, title, message, order_id)
  VALUES (v_order.customer_id, 'customer', v_notification_type, v_notification_title, v_notification_message, v_order.id);
  
  RETURN json_build_object('success', true, 'message', 'Status updated to ' || p_status);
END;
$$;


-- ============================================================================
-- 9. NOTIFY DRIVERS FUNCTION (Called when restaurant accepts order)
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_drivers_new_order(p_order_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_driver RECORD;
  v_count INTEGER := 0;
BEGIN
  -- Get order details
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF v_order IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Order not found');
  END IF;
  
  -- Notify all active drivers
  FOR v_driver IN 
    SELECT id, full_name FROM drivers WHERE status = 'active' OR driver_status = 'active'
  LOOP
    INSERT INTO notifications (recipient_id, recipient_role, type, title, message, order_id, metadata)
    VALUES (
      v_driver.id,
      'driver',
      'new_order',
      'New Delivery Available!',
      'Pickup from ' || v_order.restaurant_name || ' - ' || v_order.delivery_address,
      v_order.id,
      json_build_object(
        'order_number', v_order.order_number,
        'restaurant_name', v_order.restaurant_name,
        'restaurant_address', v_order.restaurant_address,
        'restaurant_latitude', v_order.restaurant_latitude,
        'restaurant_longitude', v_order.restaurant_longitude,
        'delivery_address', v_order.delivery_address,
        'delivery_latitude', v_order.delivery_latitude,
        'delivery_longitude', v_order.delivery_longitude,
        'total_amount', v_order.total_amount,
        'distance_km', v_order.distance_km
      )
    );
    v_count := v_count + 1;
  END LOOP;
  
  RETURN json_build_object('success', true, 'drivers_notified', v_count);
END;
$$;


-- ============================================================================
-- 10. NOTIFICATIONS TABLE POLICIES
-- ============================================================================

-- Users can view their own notifications
CREATE POLICY notifications_select ON notifications
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

-- System can insert notifications (via functions)
CREATE POLICY notifications_insert ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Users can update their own notifications (mark as read)
CREATE POLICY notifications_update ON notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());


-- ============================================================================
-- 11. ORDER_STATUS_HISTORY POLICIES
-- ============================================================================

-- Anyone involved can view
CREATE POLICY order_status_history_select ON order_status_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_status_history.order_id
      AND (
        orders.customer_id = auth.uid()
        OR EXISTS (SELECT 1 FROM admins WHERE id = auth.uid() AND restaurant_id = orders.restaurant_id)
        OR EXISTS (SELECT 1 FROM deliveries WHERE order_id = orders.id AND driver_id = auth.uid())
      )
    )
  );

-- Anyone involved can insert
CREATE POLICY order_status_history_insert ON order_status_history
  FOR INSERT TO authenticated
  WITH CHECK (changed_by = auth.uid());


-- ============================================================================
-- 12. ENABLE REALTIME
-- ============================================================================

-- Enable realtime for tracking
DO $$
BEGIN
  -- Try to add tables to realtime publication
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE deliveries;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;


-- ============================================================================
-- 13. GRANT EXECUTE ON FUNCTIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION accept_delivery(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_driver_location(UUID, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION update_delivery_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION notify_drivers_new_order(UUID) TO authenticated;


-- ============================================================================
-- DONE!
-- ============================================================================
-- Run this SQL in Supabase SQL Editor to set up the delivery system
-- 
-- Key Features:
-- 1. Proper RLS - No service_role_key needed
-- 2. Atomic driver acceptance - Prevents race conditions
-- 3. Real-time location tracking
-- 4. Automatic notifications at each stage
-- ============================================================================
