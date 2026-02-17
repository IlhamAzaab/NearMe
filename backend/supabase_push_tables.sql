-- ============================================================================
-- PUSH NOTIFICATION TABLES for NearMe
-- Run this SQL in your Supabase Dashboard → SQL Editor
-- ============================================================================

-- 1. Push Notification Tokens - stores Expo push tokens for each user/device
CREATE TABLE IF NOT EXISTS push_notification_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IN ('admin', 'driver', 'customer', 'manager')),
  expo_push_token TEXT NOT NULL,
  device_type TEXT NOT NULL DEFAULT 'android' CHECK (device_type IN ('android', 'ios')),
  device_id TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Each user can have one token per device
  UNIQUE (user_id, device_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_notification_tokens (user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_type ON push_notification_tokens (user_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_push_tokens_expo_token ON push_notification_tokens (expo_push_token);

-- 2. Notification Log - tracks all sent push notifications
CREATE TABLE IF NOT EXISTS notification_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  user_type TEXT,
  title TEXT,
  body TEXT,
  data JSONB,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'delivered')),
  ticket_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying notification history
CREATE INDEX IF NOT EXISTS idx_notification_log_user ON notification_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_status ON notification_log (status, created_at DESC);

-- ============================================================================
-- DONE! After running this, push notifications will work end-to-end.
-- ============================================================================
