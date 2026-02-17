-- ============================================================================
-- PUSH NOTIFICATION TOKENS TABLE (Expo Push Notifications + Supabase)
-- Stores Expo push tokens for mobile notifications (Android & iOS)
-- ============================================================================

-- Drop existing table if exists
DROP TABLE IF EXISTS push_notification_tokens CASCADE;

-- Create push notification tokens table
CREATE TABLE push_notification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('admin', 'driver', 'customer', 'manager')),
  expo_push_token TEXT NOT NULL, -- Expo push token (ExponentPushToken[xxx])
  device_type VARCHAR(20) NOT NULL CHECK (device_type IN ('android', 'ios', 'web')),
  device_id TEXT, -- Unique device identifier
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint: one token per device per user
  UNIQUE(user_id, device_id)
);

-- Create indexes for fast lookups
CREATE INDEX idx_push_tokens_user_id ON push_notification_tokens(user_id);
CREATE INDEX idx_push_tokens_user_type ON push_notification_tokens(user_type);
CREATE INDEX idx_push_tokens_expo_token ON push_notification_tokens(expo_push_token);
CREATE INDEX idx_push_tokens_active ON push_notification_tokens(is_active) WHERE is_active = true;

-- Add comments
COMMENT ON TABLE push_notification_tokens IS 'Stores Expo push tokens for mobile push notifications';
COMMENT ON COLUMN push_notification_tokens.user_type IS 'Type of user: admin, driver, customer, or manager';
COMMENT ON COLUMN push_notification_tokens.expo_push_token IS 'Expo Push Token (format: ExponentPushToken[xxx])';
COMMENT ON COLUMN push_notification_tokens.device_type IS 'Device platform: android, ios, or web';

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_push_token_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating timestamp
DROP TRIGGER IF EXISTS push_token_updated_at ON push_notification_tokens;
CREATE TRIGGER push_token_updated_at
  BEFORE UPDATE ON push_notification_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_push_token_timestamp();

-- Disable RLS for simplicity (tokens are managed by backend)
ALTER TABLE push_notification_tokens DISABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT ALL ON push_notification_tokens TO authenticated;
GRANT ALL ON push_notification_tokens TO service_role;

-- ============================================================================
-- NOTIFICATION LOG TABLE (Optional - for tracking sent notifications)
-- ============================================================================

DROP TABLE IF EXISTS notification_log CASCADE;

CREATE TABLE notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_type VARCHAR(20) NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'clicked')),
  ticket_id TEXT, -- Expo receipt ticket ID
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notification_log_user ON notification_log(user_id);
CREATE INDEX idx_notification_log_sent_at ON notification_log(sent_at);

ALTER TABLE notification_log DISABLE ROW LEVEL SECURITY;
GRANT ALL ON notification_log TO authenticated;
GRANT ALL ON notification_log TO service_role;

SELECT 'Expo Push notification tables created successfully!' as result;
