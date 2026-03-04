-- Scheduled Notifications Table
-- Stores notifications that managers schedule for future delivery

CREATE TABLE IF NOT EXISTS scheduled_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('customer', 'admin', 'driver')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  scheduled_at TIMESTAMPTZ NOT NULL,
  recipient_ids UUID[] DEFAULT NULL,  -- NULL = all users of the role
  created_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for the scheduler to find pending notifications
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_pending
  ON scheduled_notifications (scheduled_at)
  WHERE status = 'pending';

-- Index for history lookup
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_created_by
  ON scheduled_notifications (created_by, created_at DESC);
