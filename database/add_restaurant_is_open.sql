-- Add is_open and is_manually_overridden columns to restaurants table
-- is_open: current open/close status shown to customers
-- is_manually_overridden: when true, the auto scheduler won't change is_open

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS is_manually_overridden BOOLEAN NOT NULL DEFAULT false;
