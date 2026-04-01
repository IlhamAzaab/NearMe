-- Ensure customer profile supports map-pinned location
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;

ALTER TABLE customers
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
