-- ============================================================================
-- COMMISSION SYSTEM MIGRATION
-- Add commission tracking fields to cart_items and orders tables
-- ============================================================================

-- ============================================================================
-- 1. ADD COMMISSION COLUMNS TO CART_ITEMS TABLE
-- ============================================================================
-- These columns track the original admin price and commission for each item

-- Admin unit price (original price set by restaurant)
ALTER TABLE cart_items
ADD COLUMN IF NOT EXISTS admin_unit_price NUMERIC(10, 2);

-- Admin total price (admin_unit_price * quantity)
ALTER TABLE cart_items
ADD COLUMN IF NOT EXISTS admin_total_price NUMERIC(10, 2);

-- Commission per item (difference between customer price and admin price)
ALTER TABLE cart_items
ADD COLUMN IF NOT EXISTS commission_per_item NUMERIC(10, 2);

-- Add comments for clarity
COMMENT ON COLUMN cart_items.admin_unit_price IS 'Original price set by restaurant admin (before commission)';
COMMENT ON COLUMN cart_items.admin_total_price IS 'Total admin price (admin_unit_price * quantity)';
COMMENT ON COLUMN cart_items.commission_per_item IS 'Commission charged per item (customer_price - admin_price)';
COMMENT ON COLUMN cart_items.unit_price IS 'Customer-facing price (includes commission)';
COMMENT ON COLUMN cart_items.total_price IS 'Total customer price (unit_price * quantity, includes commission)';


-- ============================================================================
-- 2. ADD COMMISSION COLUMNS TO ORDER_ITEMS TABLE
-- ============================================================================

-- Admin unit price for order items
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS admin_unit_price NUMERIC(10, 2);

-- Admin total price for order items
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS admin_total_price NUMERIC(10, 2);

-- Commission per item for order items
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS commission_per_item NUMERIC(10, 2);

-- Add comments
COMMENT ON COLUMN order_items.admin_unit_price IS 'Original price set by restaurant admin (before commission)';
COMMENT ON COLUMN order_items.admin_total_price IS 'Total admin price (admin_unit_price * quantity)';
COMMENT ON COLUMN order_items.commission_per_item IS 'Commission charged per item';


-- ============================================================================
-- 3. ADD COMMISSION TRACKING TO ORDERS TABLE
-- ============================================================================

-- Admin subtotal - what manager pays to restaurant
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS admin_subtotal NUMERIC(10, 2);

-- Total commission earned by manager/system from food items
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS commission_total NUMERIC(10, 2);

-- Add comments
COMMENT ON COLUMN orders.admin_subtotal IS 'Total amount to pay to restaurant (sum of admin prices)';
COMMENT ON COLUMN orders.commission_total IS 'Total commission earned by manager/system (subtotal - admin_subtotal)';
COMMENT ON COLUMN orders.subtotal IS 'Customer subtotal for food items (includes commission)';
COMMENT ON COLUMN orders.total_amount IS 'Grand total customer pays (subtotal + delivery_fee + service_fee)';


-- ============================================================================
-- 4. CREATE MANAGER EARNINGS VIEW
-- ============================================================================
-- This view provides a summary of manager earnings from orders

CREATE OR REPLACE VIEW manager_earnings_summary AS
SELECT 
  DATE(placed_at) as order_date,
  COUNT(*) as total_orders,
  SUM(subtotal) as customer_food_total,
  SUM(admin_subtotal) as restaurant_payment_total,
  SUM(commission_total) as commission_earned,
  SUM(service_fee) as service_fee_earned,
  SUM(delivery_fee) as delivery_fee_collected,
  SUM(total_amount) as total_collected
FROM orders
WHERE status NOT IN ('cancelled', 'rejected')
GROUP BY DATE(placed_at)
ORDER BY order_date DESC;


-- ============================================================================
-- 5. CREATE RESTAURANT PAYMENT VIEW
-- ============================================================================
-- This view shows what needs to be paid to each restaurant

CREATE OR REPLACE VIEW restaurant_payments AS
SELECT 
  o.restaurant_id,
  o.restaurant_name,
  DATE(o.placed_at) as order_date,
  COUNT(*) as order_count,
  SUM(o.admin_subtotal) as amount_to_pay,
  SUM(o.subtotal) as customer_paid,
  SUM(o.commission_total) as commission_deducted
FROM orders o
WHERE o.status = 'delivered'
GROUP BY o.restaurant_id, o.restaurant_name, DATE(o.placed_at)
ORDER BY order_date DESC, o.restaurant_name;


-- ============================================================================
-- 6. CREATE ORDER FINANCIAL DETAILS VIEW
-- ============================================================================
-- Detailed view for each order's financial breakdown

CREATE OR REPLACE VIEW order_financial_details AS
SELECT 
  o.id as order_id,
  o.order_number,
  o.placed_at,
  o.status,
  o.restaurant_id,
  o.restaurant_name,
  o.customer_id,
  o.customer_name,
  -- Customer charges
  o.subtotal as customer_food_subtotal,
  o.delivery_fee,
  o.service_fee,
  o.total_amount as customer_total,
  -- Restaurant payment
  o.admin_subtotal as restaurant_payment,
  -- Manager earnings
  o.commission_total as food_commission,
  o.service_fee as service_fee_earning,
  (o.commission_total + o.service_fee) as total_manager_earning
FROM orders o;


-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Commission system migration completed successfully!';
  RAISE NOTICE '';
  RAISE NOTICE '📊 New columns added:';
  RAISE NOTICE '   - cart_items: admin_unit_price, admin_total_price, commission_per_item';
  RAISE NOTICE '   - order_items: admin_unit_price, admin_total_price, commission_per_item';
  RAISE NOTICE '   - orders: admin_subtotal, commission_total';
  RAISE NOTICE '';
  RAISE NOTICE '📈 New views created:';
  RAISE NOTICE '   - manager_earnings_summary: Daily earnings summary';
  RAISE NOTICE '   - restaurant_payments: Amount to pay each restaurant';
  RAISE NOTICE '   - order_financial_details: Per-order financial breakdown';
END $$;
