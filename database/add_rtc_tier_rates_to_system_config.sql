-- Add tiered Restaurant->Customer earnings rates to system_config
-- Below/equal 5km uses rtc_rate_below_5km, above 5km uses rtc_rate_above_5km

ALTER TABLE system_config
  ADD COLUMN IF NOT EXISTS rtc_rate_below_5km NUMERIC(10,2) NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS rtc_rate_above_5km NUMERIC(10,2) NOT NULL DEFAULT 40;

-- Backfill from existing single rate to preserve current behavior
UPDATE system_config
SET
  rtc_rate_below_5km = COALESCE(rtc_rate_below_5km, rate_per_km, 40),
  rtc_rate_above_5km = COALESCE(rtc_rate_above_5km, rate_per_km, 40)
WHERE id = 1;
