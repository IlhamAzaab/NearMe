-- ============================================================================
-- ORDERS SCHEMA - Production-Ready Food Delivery Order System
-- ============================================================================
-- This schema implements a complete order lifecycle with:
-- - Immutable order snapshots (no cart dependency after creation)
-- - Order status tracking with history
-- - Delivery management
-- - Real-time notifications
-- - Row Level Security (RLS)
-- ============================================================================

-- ============================================================================
-- 1. ORDERS TABLE
-- ============================================================================
-- Main orders table - stores complete order information as an immutable snapshot

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Human-readable order number (e.g., ORD-20260109-0001)
  order_number TEXT NOT NULL UNIQUE,
  
  -- Customer information
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  
  -- Restaurant information (snapshot at order time)
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
  restaurant_name TEXT NOT NULL,
  restaurant_phone TEXT,
  restaurant_address TEXT,
  restaurant_latitude NUMERIC(10, 7),
  restaurant_longitude NUMERIC(10, 7),
  
  -- Delivery information
  delivery_address TEXT NOT NULL,
  delivery_city TEXT,
  delivery_latitude NUMERIC(10, 7) NOT NULL,
  delivery_longitude NUMERIC(10, 7) NOT NULL,
  
  -- Pricing breakdown (immutable snapshot)
  subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
  delivery_fee NUMERIC(10, 2) NOT NULL CHECK (delivery_fee >= 0),
  service_fee NUMERIC(10, 2) NOT NULL CHECK (service_fee >= 0),
  total_amount NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
  
  -- Route information
  distance_km NUMERIC(10, 2) NOT NULL CHECK (distance_km >= 0),
  estimated_duration_min INTEGER NOT NULL CHECK (estimated_duration_min >= 0),
  
  -- Payment
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card')),
  payment_status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  
  -- Order status
  status TEXT NOT NULL DEFAULT 'placed'
    CHECK (status IN (
      'placed',      -- Customer placed order, waiting for restaurant
      'accepted',    -- Restaurant accepted
      'rejected',    -- Restaurant rejected
      'preparing',   -- Restaurant is preparing food
      'ready',       -- Food is ready for pickup
      'picked_up',   -- Driver picked up the order
      'on_the_way',  -- Driver is on the way to customer
      'delivered',   -- Order delivered
      'cancelled'    -- Order cancelled
    )),
  
  -- Special instructions
  notes TEXT,
  
  -- Timestamps
  placed_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  preparing_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_id ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_placed_at ON orders(placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status ON orders(restaurant_id, status);


-- ============================================================================
-- 2. ORDER_ITEMS TABLE
-- ============================================================================
-- Stores individual items in an order (immutable snapshot from cart)

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  -- Food reference (for analytics, may be deleted later)
  food_id UUID REFERENCES foods(id) ON DELETE SET NULL,
  
  -- Snapshot data (immutable - captured at order time)
  food_name TEXT NOT NULL,
  food_image_url TEXT,
  size TEXT CHECK (size IN ('regular', 'large')),
  
  -- Quantity and pricing (snapshot)
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
  total_price NUMERIC(10, 2) NOT NULL CHECK (total_price >= 0),
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_food_id ON order_items(food_id);


-- ============================================================================
-- 3. DELIVERIES TABLE
-- ============================================================================
-- Tracks delivery assignment and status

CREATE TABLE IF NOT EXISTS deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  
  -- Driver assignment (NULL until assigned)
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  
  -- Delivery status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',        -- Waiting for driver assignment
      'assigned',       -- Driver assigned
      'picking_up',     -- Driver heading to restaurant
      'picked_up',      -- Driver has the order
      'delivering',     -- Driver heading to customer
      'delivered',      -- Delivered successfully
      'failed'          -- Delivery failed
    )),
  
  -- Driver location tracking (updated in real-time)
  driver_latitude NUMERIC(10, 7),
  driver_longitude NUMERIC(10, 7),
  last_location_update TIMESTAMPTZ,
  
  -- Timestamps
  assigned_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  
  -- Proof of delivery
  delivery_photo_url TEXT,
  delivery_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deliveries_order_id ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver_id ON deliveries(driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);


-- ============================================================================
-- 4. ORDER_STATUS_HISTORY TABLE
-- ============================================================================
-- Audit log for all status changes

CREATE TABLE IF NOT EXISTS order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  -- Status change
  from_status TEXT,
  to_status TEXT NOT NULL,
  
  -- Who made the change
  changed_by UUID,
  changed_by_role TEXT CHECK (changed_by_role IN ('customer', 'admin', 'driver', 'manager')),
  
  -- Optional reason (e.g., for rejection)
  reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_created_at ON order_status_history(created_at DESC);


-- ============================================================================
-- 5. NOTIFICATIONS TABLE
-- ============================================================================
-- In-app notifications for real-time updates

create table public.notifications (
  id uuid not null default gen_random_uuid (),
  recipient_id uuid not null,
  recipient_role text not null,
  order_id uuid null,
  restaurant_id uuid null,
  type public.notification_type not null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  read_at timestamp with time zone null,
  metadata jsonb null,
  created_at timestamp with time zone not null default now(),
  constraint notifications_pkey primary key (id),
  constraint notifications_order_id_fkey foreign KEY (order_id) references orders (id) on delete CASCADE,
  constraint notifications_recipient_id_fkey foreign KEY (recipient_id) references users (id) on delete CASCADE,
  constraint notifications_restaurant_id_fkey foreign KEY (restaurant_id) references restaurants (id) on delete set null
) TABLESPACE pg_default;

create index IF not exists idx_notifications_recipient on public.notifications using btree (recipient_id, is_read) TABLESPACE pg_default;

create index IF not exists idx_notifications_order on public.notifications using btree (order_id) TABLESPACE pg_default;

create index IF not exists idx_notifications_created_at on public.notifications using btree (created_at desc) TABLESPACE pg_default;

-- ============================================================================
-- 6. TRIGGERS FOR UPDATED_AT
-- ============================================================================

-- Trigger function
CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to orders
DROP TRIGGER IF EXISTS trigger_orders_updated_at ON orders;
CREATE TRIGGER trigger_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_orders_updated_at();

-- Apply to deliveries
DROP TRIGGER IF EXISTS trigger_deliveries_updated_at ON deliveries;
CREATE TRIGGER trigger_deliveries_updated_at
  BEFORE UPDATE ON deliveries
  FOR EACH ROW
  EXECUTE FUNCTION update_orders_updated_at();


-- ============================================================================
-- 7. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- ORDERS POLICIES
-- ============================================================================

-- Customers can view their own orders
CREATE POLICY orders_customer_select ON orders
  FOR SELECT
  USING (
    auth.uid() = customer_id
    OR auth.jwt()->>'role' = 'manager'
  );

-- Customers can create their own orders
CREATE POLICY orders_customer_insert ON orders
  FOR INSERT
  WITH CHECK (auth.uid() = customer_id);

-- Restaurant admins can view orders for their restaurant
CREATE POLICY orders_admin_select ON orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.id = auth.uid()
      AND admins.restaurant_id = orders.restaurant_id
    )
  );

-- Restaurant admins can update order status
CREATE POLICY orders_admin_update ON orders
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.id = auth.uid()
      AND admins.restaurant_id = orders.restaurant_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.id = auth.uid()
      AND admins.restaurant_id = orders.restaurant_id
    )
  );

-- Drivers can view orders assigned to them
CREATE POLICY orders_driver_select ON orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM deliveries
      WHERE deliveries.order_id = orders.id
      AND deliveries.driver_id = auth.uid()
    )
  );


-- ============================================================================
-- ORDER_ITEMS POLICIES
-- ============================================================================

-- Customers can view items from their own orders
CREATE POLICY order_items_customer_select ON order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND orders.customer_id = auth.uid()
    )
    OR auth.jwt()->>'role' = 'manager'
  );

-- Customers can insert items (via order creation)
CREATE POLICY order_items_customer_insert ON order_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND orders.customer_id = auth.uid()
    )
  );

-- Restaurant admins can view order items
CREATE POLICY order_items_admin_select ON order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      JOIN admins ON admins.restaurant_id = orders.restaurant_id
      WHERE orders.id = order_items.order_id
      AND admins.id = auth.uid()
    )
  );

-- Drivers can view order items for their deliveries
CREATE POLICY order_items_driver_select ON order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM deliveries
      JOIN orders ON orders.id = deliveries.order_id
      WHERE orders.id = order_items.order_id
      AND deliveries.driver_id = auth.uid()
    )
  );


-- ============================================================================
-- DELIVERIES POLICIES
-- ============================================================================

-- Customers can view deliveries for their orders
CREATE POLICY deliveries_customer_select ON deliveries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = deliveries.order_id
      AND orders.customer_id = auth.uid()
    )
    OR auth.jwt()->>'role' = 'manager'
  );

-- Restaurant admins can view deliveries for their orders
CREATE POLICY deliveries_admin_select ON deliveries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      JOIN admins ON admins.restaurant_id = orders.restaurant_id
      WHERE orders.id = deliveries.order_id
      AND admins.id = auth.uid()
    )
  );

-- Drivers can view and update their assigned deliveries
CREATE POLICY deliveries_driver_select ON deliveries
  FOR SELECT
  USING (driver_id = auth.uid());

CREATE POLICY deliveries_driver_update ON deliveries
  FOR UPDATE
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());


-- ============================================================================
-- ORDER_STATUS_HISTORY POLICIES
-- ============================================================================

-- Anyone involved can view status history
CREATE POLICY order_status_history_select ON order_status_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_status_history.order_id
      AND (
        orders.customer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM admins
          WHERE admins.id = auth.uid()
          AND admins.restaurant_id = orders.restaurant_id
        )
        OR EXISTS (
          SELECT 1 FROM deliveries
          WHERE deliveries.order_id = orders.id
          AND deliveries.driver_id = auth.uid()
        )
      )
    )
    OR auth.jwt()->>'role' = 'manager'
  );


-- ============================================================================
-- NOTIFICATIONS POLICIES
-- ============================================================================

-- Users can only view their own notifications
CREATE POLICY notifications_select ON notifications
  FOR SELECT
  USING (user_id = auth.uid() OR auth.jwt()->>'role' = 'manager');

-- Users can update their own notifications (mark as read)
CREATE POLICY notifications_update ON notifications
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ============================================================================
-- ENABLE REALTIME
-- ============================================================================
-- Enable realtime for orders and notifications tables

ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;


-- ============================================================================
-- DONE!
-- ============================================================================
-- Run this SQL in Supabase SQL Editor to set up the orders system
