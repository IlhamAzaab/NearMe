-- Add category column to foods table.
-- Use TEXT (not enum) so new categories can be added later without schema migrations.

ALTER TABLE foods
ADD COLUMN IF NOT EXISTS category TEXT;

-- Backfill existing rows to a safe default.
UPDATE foods
SET category = 'others'
WHERE category IS NULL OR btrim(category) = '';

-- Make category required for all new rows.
ALTER TABLE foods
ALTER COLUMN category SET NOT NULL;

-- Optional but useful for category-based filtering/search.
CREATE INDEX IF NOT EXISTS idx_foods_category ON foods (lower(category));
