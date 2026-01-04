-- Customer Authentication & Profile Setup
-- Run this SQL in your Supabase SQL Editor

-- ========================================
-- 1. Create Customers Table
-- ========================================

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY
    REFERENCES auth.users(id) ON DELETE CASCADE,

  username TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,

  nic_number TEXT,

  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,

  address TEXT,
  city TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- 2. Add Unique Constraints
-- ========================================

ALTER TABLE customers
ADD CONSTRAINT customers_username_unique UNIQUE (username);

ALTER TABLE customers
ADD CONSTRAINT customers_email_unique UNIQUE (email);

ALTER TABLE customers
ADD CONSTRAINT customers_phone_unique UNIQUE (phone);

-- ========================================
-- 3. Create Indexes for Performance
-- ========================================

-- Location index for finding nearby customers
CREATE INDEX IF NOT EXISTS idx_customers_location
ON customers (latitude, longitude);

-- Email index for faster lookups
CREATE INDEX IF NOT EXISTS idx_customers_email
ON customers (email);

-- Phone index for faster lookups
CREATE INDEX IF NOT EXISTS idx_customers_phone
ON customers (phone);

-- Username index
CREATE INDEX IF NOT EXISTS idx_customers_username
ON customers (username);

-- ========================================
-- 4. Update Users Table (if needed)
-- ========================================

-- Add email and phone columns to users table if they don't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;

-- Create unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email 
ON users(email) WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone 
ON users(phone) WHERE phone IS NOT NULL;

-- ========================================
-- 5. Disable Row Level Security
-- ========================================

-- For backend service role access
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- ========================================
-- 6. Create Helper Function (Optional)
-- ========================================

-- Function to check if email or phone is already used
CREATE OR REPLACE FUNCTION check_email_phone_availability(
  p_email TEXT,
  p_phone TEXT
)
RETURNS TABLE(
  email_exists BOOLEAN,
  phone_exists BOOLEAN,
  existing_role TEXT
) AS $$
BEGIN
  -- Check in users table
  IF EXISTS (SELECT 1 FROM users WHERE email = p_email) THEN
    RETURN QUERY SELECT true, false, (SELECT role FROM users WHERE email = p_email LIMIT 1);
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM users WHERE phone = p_phone) THEN
    RETURN QUERY SELECT false, true, (SELECT role FROM users WHERE phone = p_phone LIMIT 1);
    RETURN;
  END IF;

  -- Check in admins table
  IF EXISTS (SELECT 1 FROM admins WHERE email = p_email) THEN
    RETURN QUERY SELECT true, false, 'admin'::TEXT;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM admins WHERE phone = p_phone) THEN
    RETURN QUERY SELECT false, true, 'admin'::TEXT;
    RETURN;
  END IF;

  -- Check in drivers table
  IF EXISTS (SELECT 1 FROM drivers WHERE email = p_email) THEN
    RETURN QUERY SELECT true, false, 'driver'::TEXT;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM drivers WHERE phone = p_phone) THEN
    RETURN QUERY SELECT false, true, 'driver'::TEXT;
    RETURN;
  END IF;

  -- Check in customers table
  IF EXISTS (SELECT 1 FROM customers WHERE email = p_email) THEN
    RETURN QUERY SELECT true, false, 'customer'::TEXT;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM customers WHERE phone = p_phone) THEN
    RETURN QUERY SELECT false, true, 'customer'::TEXT;
    RETURN;
  END IF;

  -- Check in managers table
  IF EXISTS (SELECT 1 FROM managers WHERE email = p_email) THEN
    RETURN QUERY SELECT true, false, 'manager'::TEXT;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM managers WHERE mobile_number = p_phone) THEN
    RETURN QUERY SELECT false, true, 'manager'::TEXT;
    RETURN;
  END IF;

  -- If nothing found, return false
  RETURN QUERY SELECT false, false, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 7. Create Updated At Trigger
-- ========================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for customers table
DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- Setup Complete!
-- ========================================

-- Verify the setup
SELECT 
  'customers' as table_name,
  COUNT(*) as row_count
FROM customers
UNION ALL
SELECT 
  'users' as table_name,
  COUNT(*) as row_count
FROM users;
