-- ============================================================================
-- ADD LAUNCH PROMOTION SNAPSHOT COLUMNS TO ORDERS
-- ============================================================================
-- Stores whether launch promo was applied and discount amount per order.
-- ============================================================================

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS launch_promo_applied BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS launch_promo_discount NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS launch_promo_delivery_fee NUMERIC(10,2);
