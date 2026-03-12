-- ============================================================================
-- FIX: order_financial_details view
-- Run this in Supabase SQL Editor to update the view
-- ============================================================================

-- Recreate order_financial_details view with driver_payment column
-- and corrected total_manager_earning (deducts driver payment)
DROP VIEW IF EXISTS public.order_financial_details CASCADE;
CREATE OR REPLACE VIEW public.order_financial_details AS
SELECT 
  o.id as order_id,
  o.order_number,
  o.placed_at,
  COALESCE(d.status, 'placed') as status,
  o.restaurant_id,
  o.restaurant_name,
  o.customer_id,
  o.customer_name,
  o.subtotal as customer_food_subtotal,
  o.delivery_fee,
  o.service_fee,
  o.total_amount as customer_total,
  o.admin_subtotal as restaurant_payment,
  COALESCE(d.driver_earnings, 0) as driver_payment,
  o.commission_total as food_commission,
  o.service_fee as service_fee_earning,
  (o.commission_total + o.service_fee - COALESCE(d.driver_earnings, 0)) as total_manager_earning
FROM orders o
LEFT JOIN deliveries d ON d.order_id = o.id;

-- Grant access
GRANT SELECT ON public.order_financial_details TO authenticated;

-- ============================================================================
-- DROP order_status_history table (no longer used)
-- ============================================================================
DROP TABLE IF EXISTS public.order_status_history CASCADE;
