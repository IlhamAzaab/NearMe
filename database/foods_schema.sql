-- Foods Table Schema
-- Type for available time enum
CREATE TYPE food_available_time AS ENUM (
  'breakfast',
  'lunch',
  'dinner'
);

-- Foods table
CREATE TABLE IF NOT EXISTS foods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  restaurant_id UUID NOT NULL
    REFERENCES restaurants(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  
  is_available BOOLEAN DEFAULT true,
  
  available_time food_available_time[] NOT NULL,
  -- example: {'breakfast','lunch'}
  
  -- Regular size
  regular_size TEXT,
  regular_portion TEXT,
  regular_price NUMERIC(10,2) NOT NULL CHECK (regular_price >= 0),
  offer_price NUMERIC(10,2) CHECK (offer_price >= 0),
  
  -- Extra size
  extra_size TEXT,
  extra_portion TEXT,
  extra_price NUMERIC(10,2) CHECK (extra_price >= 0),
  
  -- ⭐ Average rating (auto-calculated)
  stars NUMERIC(2,1) DEFAULT 0 CHECK (stars BETWEEN 0 AND 5),
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Food reviews table
CREATE TABLE IF NOT EXISTS food_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  food_id UUID NOT NULL
    REFERENCES foods(id) ON DELETE CASCADE,
  
  customer_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- One review per customer per food
  UNIQUE (food_id, customer_id)
);

-- Indexes for performance
-- Restaurant menu loading
CREATE INDEX IF NOT EXISTS idx_foods_restaurant_id
ON foods(restaurant_id);

-- Availability filtering
CREATE INDEX IF NOT EXISTS idx_foods_is_available
ON foods(is_available);

-- Available time filtering (GIN index for arrays)
CREATE INDEX IF NOT EXISTS idx_foods_available_time
ON foods USING GIN (available_time);

-- Rating sorting
CREATE INDEX IF NOT EXISTS idx_foods_stars
ON foods(stars);

-- Function to recalculate average stars
CREATE OR REPLACE FUNCTION update_food_average_stars()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE foods
  SET stars = (
    SELECT COALESCE(ROUND(AVG(stars)::NUMERIC, 1), 0)
    FROM food_reviews
    WHERE food_id = COALESCE(NEW.food_id, OLD.food_id)
  ),
  updated_at = NOW()
  WHERE id = COALESCE(NEW.food_id, OLD.food_id);
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update stars on review change
CREATE TRIGGER IF NOT EXISTS trg_update_food_stars
AFTER INSERT OR UPDATE OR DELETE
ON food_reviews
FOR EACH ROW
EXECUTE FUNCTION update_food_average_stars();
