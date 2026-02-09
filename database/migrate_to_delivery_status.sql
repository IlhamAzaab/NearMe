-- ============================================================================
-- MIGRATION: Use deliveries.status everywhere instead of orders.status
-- ============================================================================
-- This migration updates the order_financial_details view to join with 
-- the deliveries table and expose deliveries.status instead of orders.status.
-- ============================================================================

-- Drop and recreate the view with deliveries.status
DROP VIEW IF EXISTS order_financial_details;

CREATE OR REPLACE VIEW order_financial_details AS
SELECT 
  o.id as order_id,
  o.order_number,
  o.placed_at,
  COALESCE(d.status, 'placed') as status,
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
FROM orders o
LEFT JOIN deliveries d ON d.order_id = o.id;
