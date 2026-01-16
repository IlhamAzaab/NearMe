-- ============================================================================
-- Fix Notifications RLS Policies
-- Allow backend (service_role) to insert notifications
-- ============================================================================

-- Drop existing notification policies
DROP POLICY IF EXISTS notifications_select ON notifications;
DROP POLICY IF EXISTS notifications_insert ON notifications;
DROP POLICY IF EXISTS notifications_update ON notifications;
DROP POLICY IF EXISTS notifications_delete ON notifications;

-- Disable RLS temporarily to verify (optional - comment out if not needed)
-- ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- Or keep RLS enabled with proper policies:
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policy 1: Anyone can select their own notifications
CREATE POLICY notifications_select ON notifications
  FOR SELECT 
  TO public
  USING (recipient_id = auth.uid());

-- Policy 2: Service role can insert (backend creates notifications)
CREATE POLICY notifications_service_insert ON notifications
  FOR INSERT 
  TO service_role
  WITH CHECK (true);

-- Policy 3: Authenticated users can insert (for realtime triggers)
CREATE POLICY notifications_authenticated_insert ON notifications
  FOR INSERT 
  TO authenticated
  WITH CHECK (true);

-- Policy 4: Users can update their own notifications
CREATE POLICY notifications_update ON notifications
  FOR UPDATE 
  TO public
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- Grant explicit permissions to service_role
GRANT ALL ON TABLE notifications TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

