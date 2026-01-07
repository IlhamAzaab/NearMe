-- Shopping Cart Schema
-- This implements a cart system where customers can have multiple active carts,
-- but only ONE active cart per restaurant.

-- ============================================================================
-- 1. CARTS TABLE
-- ============================================================================
-- Each cart belongs to a customer and a restaurant
-- A customer can have multiple carts (one per restaurant)

CREATE TABLE IF NOT EXISTS carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  customer_id UUID NOT NULL 
    REFERENCES customers(id) ON DELETE CASCADE,
  
  restaurant_id UUID NOT NULL 
    REFERENCES restaurants(id) ON DELETE CASCADE,
  
  -- Status: active (can add items), completed (ordered), cancelled
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled')),
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- IMPORTANT: Unique constraint - only ONE active cart per restaurant per customer
-- ============================================================================
-- This prevents mixing restaurants in one cart automatically
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_cart_per_restaurant
  ON carts (customer_id, restaurant_id)
  WHERE status = 'active';

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_carts_customer_status 
  ON carts(customer_id, status);

CREATE INDEX IF NOT EXISTS idx_carts_restaurant 
  ON carts(restaurant_id);


-- ============================================================================
-- 2. CART_ITEMS TABLE
-- ============================================================================
-- Each row represents one food item in a cart

CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  cart_id UUID NOT NULL 
    REFERENCES carts(id) ON DELETE CASCADE,
  
  food_id UUID NOT NULL 
    REFERENCES foods(id) ON DELETE CASCADE,
  
  -- Snapshot data (for display if food is deleted)
  food_name TEXT NOT NULL,
  food_image_url TEXT,
  
  -- Size selection
  size TEXT CHECK (size IN ('regular', 'large')),
  
  -- Quantity
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  
  -- Price tracking (unit price from food at time of adding)
  unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  
  -- Total = unit_price * quantity
  total_price NUMERIC(10,2) NOT NULL CHECK (total_price >= 0),
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for faster cart item lookups
CREATE INDEX IF NOT EXISTS idx_cart_items_cart 
  ON cart_items(cart_id);

CREATE INDEX IF NOT EXISTS idx_cart_items_food 
  ON cart_items(food_id);

-- Prevent duplicate food with same size in the same cart
CREATE UNIQUE INDEX IF NOT EXISTS unique_food_size_per_cart
  ON cart_items (cart_id, food_id, size);


-- ============================================================================
-- 3. UPDATED_AT TRIGGERS
-- ============================================================================

-- Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_cart_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to carts table
DROP TRIGGER IF EXISTS trigger_update_cart_timestamp ON carts;
CREATE TRIGGER trigger_update_cart_timestamp
  BEFORE UPDATE ON carts
  FOR EACH ROW
  EXECUTE FUNCTION update_cart_updated_at();

-- Apply trigger to cart_items table
DROP TRIGGER IF EXISTS trigger_update_cart_item_timestamp ON cart_items;
CREATE TRIGGER trigger_update_cart_item_timestamp
  BEFORE UPDATE ON cart_items
  FOR EACH ROW
  EXECUTE FUNCTION update_cart_updated_at();


-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

-- Policy: Customers can only see their own carts
CREATE POLICY customer_view_own_carts ON carts
  FOR SELECT
  USING (
    auth.uid() = customer_id
    OR auth.jwt()->>'role' = 'admin'
    OR auth.jwt()->>'role' = 'manager'
  );

-- Policy: Customers can create their own carts
CREATE POLICY customer_create_own_carts ON carts
  FOR INSERT
  WITH CHECK (auth.uid() = customer_id);

-- Policy: Customers can update their own active carts
CREATE POLICY customer_update_own_carts ON carts
  FOR UPDATE
  USING (auth.uid() = customer_id);

-- Policy: Customers can delete their own carts
CREATE POLICY customer_delete_own_carts ON carts
  FOR DELETE
  USING (auth.uid() = customer_id);


-- Policy: Customers can view cart items from their own carts
CREATE POLICY customer_view_own_cart_items ON cart_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM carts
      WHERE carts.id = cart_items.cart_id
      AND carts.customer_id = auth.uid()
    )
    OR auth.jwt()->>'role' = 'admin'
    OR auth.jwt()->>'role' = 'manager'
  );

-- Policy: Customers can add items to their own carts
CREATE POLICY customer_create_cart_items ON cart_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM carts
      WHERE carts.id = cart_items.cart_id
      AND carts.customer_id = auth.uid()
      AND carts.status = 'active'
    )
  );

-- Policy: Customers can update items in their own active carts
CREATE POLICY customer_update_cart_items ON cart_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM carts
      WHERE carts.id = cart_items.cart_id
      AND carts.customer_id = auth.uid()
      AND carts.status = 'active'
    )
  );

-- Policy: Customers can delete items from their own carts
CREATE POLICY customer_delete_cart_items ON cart_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM carts
      WHERE carts.id = cart_items.cart_id
      AND carts.customer_id = auth.uid()
    )
  );


-- ============================================================================
-- 5. HELPER VIEW - Cart Summary
-- ============================================================================
-- Useful view to get cart totals with current prices

CREATE OR REPLACE VIEW cart_summary AS
SELECT 
  c.id as cart_id,
  c.customer_id,
  c.restaurant_id,
  r.restaurant_name,
  r.logo_url as restaurant_image,
  c.status,
  COUNT(ci.id) as item_count,
  SUM(ci.quantity) as total_items,
  -- Calculate total using CURRENT food prices
  SUM(
    CASE 
      WHEN ci.size = 'large' THEN f.extra_price * ci.quantity
      ELSE f.regular_price * ci.quantity
    END
  ) as cart_total,
  c.created_at,
  c.updated_at
FROM carts c
LEFT JOIN cart_items ci ON ci.cart_id = c.id
LEFT JOIN foods f ON f.id = ci.food_id
LEFT JOIN restaurants r ON r.id = c.restaurant_id
GROUP BY c.id, r.restaurant_name, r.logo_url;


-- ============================================================================
-- DONE! Schema ready for use
-- ============================================================================

-- To use:
-- 1. Run this migration in your Supabase SQL editor
-- 2. Create backend API endpoints for cart operations
-- 3. Create frontend cart UI components
