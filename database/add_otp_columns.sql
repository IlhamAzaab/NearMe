-- Add OTP columns to customers table for WhatsApp verification
-- OTP is only for customers, so store in customers table (not users)
-- Run this in Supabase SQL Editor

-- Remove old OTP columns from users table if they exist
ALTER TABLE public.users
DROP COLUMN IF EXISTS otp_code,
DROP COLUMN IF EXISTS otp_expires_at,
DROP COLUMN IF EXISTS phone_verified;

DROP INDEX IF EXISTS idx_users_otp_code;

-- Add OTP columns to customers table
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS otp_code TEXT,
ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false;

-- Index for fast OTP lookups on customers table
CREATE INDEX IF NOT EXISTS idx_customers_otp_code ON public.customers(otp_code) WHERE otp_code IS NOT NULL;
