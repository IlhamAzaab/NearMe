-- Add OTP columns to users table for WhatsApp verification
-- Run this in Supabase SQL Editor

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS otp_code TEXT,
ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false;

-- Index for fast OTP lookups
CREATE INDEX IF NOT EXISTS idx_users_otp_code ON public.users(otp_code) WHERE otp_code IS NOT NULL;
