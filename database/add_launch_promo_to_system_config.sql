-- ============================================================================
-- ADD LAUNCH PROMOTION CONFIG TO SYSTEM CONFIG
-- ============================================================================
-- Adds first-delivery launch promotion fields editable from manager config page.
-- ============================================================================

ALTER TABLE public.system_config
ADD COLUMN IF NOT EXISTS launch_promo_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.system_config
ADD COLUMN IF NOT EXISTS launch_promo_first_km_rate NUMERIC(10,2) NOT NULL DEFAULT 1;

ALTER TABLE public.system_config
ADD COLUMN IF NOT EXISTS launch_promo_max_km NUMERIC(10,2) NOT NULL DEFAULT 5;

ALTER TABLE public.system_config
ADD COLUMN IF NOT EXISTS launch_promo_beyond_km_rate NUMERIC(10,2) NOT NULL DEFAULT 40;
