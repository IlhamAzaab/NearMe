-- ============================================================================
-- Add configurable commission percentage to system_config
-- ============================================================================

ALTER TABLE public.system_config
ADD COLUMN IF NOT EXISTS commission_percentage NUMERIC(5,2) NOT NULL DEFAULT 10;

-- Ensure existing row has a valid value
UPDATE public.system_config
SET commission_percentage = 10
WHERE commission_percentage IS NULL OR commission_percentage <= 0;
