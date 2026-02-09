-- ============================================================================
-- FIX RESTAURANT PAYMENTS VIEW TO USE DELIVERIES.STATUS
-- ============================================================================
-- Admin payments should only count when deliveries.status is 'picked_up' or beyond
-- This means manager pays restaurant when driver picks up the order
-- ============================================================================

-- Drop and recreate the restaurant_payments view to use deliveries.status
DROP VIEW IF EXISTS restaurant_payments;

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
INNER JOIN deliveries d ON d.order_id = o.id
WHERE d.status IN ('picked_up', 'on_the_way', 'delivered')
GROUP BY o.restaurant_id, o.restaurant_name, DATE(o.placed_at)
ORDER BY order_date DESC, o.restaurant_name;

-- Add comment explaining the view logic
COMMENT ON VIEW restaurant_payments IS 'Restaurant payments view - only includes orders where delivery status is picked_up or beyond (driver has picked up from restaurant)';

-- ============================================================================
-- FIX MANAGER EARNINGS SUMMARY VIEW TO USE DELIVERIES.STATUS
-- ============================================================================
-- Manager earnings should also only count when deliveries.status is 'picked_up' or beyond

DROP VIEW IF EXISTS manager_earnings_summary;

CREATE OR REPLACE VIEW manager_earnings_summary AS
SELECT 
  DATE(o.placed_at) as order_date,
  COUNT(*) as total_orders,
  SUM(o.subtotal) as customer_food_total,
  SUM(o.admin_subtotal) as restaurant_payment_total,
  SUM(o.commission_total) as commission_earned,
  SUM(o.service_fee) as service_fee_earned,
  SUM(o.delivery_fee) as delivery_fee_collected,
  SUM(o.total_amount) as total_collected
FROM orders o
INNER JOIN deliveries d ON d.order_id = o.id
WHERE d.status IN ('picked_up', 'on_the_way', 'delivered')
GROUP BY DATE(o.placed_at)
ORDER BY order_date DESC;

-- Add comment explaining the view logic
COMMENT ON VIEW manager_earnings_summary IS 'Manager earnings summary - only includes orders where delivery status is picked_up or beyond';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Views updated successfully!';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Changes:';
  RAISE NOTICE '   - restaurant_payments: Now uses deliveries.status instead of orders.status';
  RAISE NOTICE '   - manager_earnings_summary: Now uses deliveries.status instead of orders.status';
  RAISE NOTICE '   - Both views only count orders when delivery is picked_up, on_the_way, or delivered';
  RAISE NOTICE '   - Manager pays restaurant only after driver picks up the order';
END $$;
