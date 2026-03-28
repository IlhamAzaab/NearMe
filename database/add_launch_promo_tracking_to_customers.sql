-- ============================================================================
-- ADD LAUNCH PROMOTION TRACKING TO CUSTOMERS
-- ============================================================================
-- Tracks whether a customer acknowledged launch promotion popup.
-- ============================================================================

ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS launch_promo_seen_at TIMESTAMPTZ;

ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS launch_promo_acknowledged BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS launch_promo_acknowledged_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_launch_promo_ack
ON public.customers (launch_promo_acknowledged, launch_promo_acknowledged_at DESC);
