/**
 * RLS Policies for Notifications Table
 * Allows drivers to read their own notifications and mark them as read
 */

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Drivers can view their own notifications" ON notifications;
DROP POLICY IF EXISTS "Drivers can update their own notifications" ON notifications;
DROP POLICY IF EXISTS "Service role can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Admins can insert notifications" ON notifications;

-- Enable RLS on notifications table
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policy 1: Drivers can SELECT their own notifications
CREATE POLICY "Drivers can view their own notifications"
ON notifications
FOR SELECT
TO authenticated
USING (
  recipient_role = 'driver' 
  AND recipient_id = auth.uid()
);

-- Policy 2: Drivers can UPDATE their own notifications (mark as read)
CREATE POLICY "Drivers can update their own notifications"
ON notifications
FOR UPDATE
TO authenticated
USING (
  recipient_role = 'driver' 
  AND recipient_id = auth.uid()
)
WITH CHECK (
  recipient_role = 'driver' 
  AND recipient_id = auth.uid()
);

-- Policy 3: Service role can INSERT notifications (backend uses service_role key)
CREATE POLICY "Service role can insert notifications"
ON notifications
FOR INSERT
TO service_role
WITH CHECK (true);

-- Policy 4: Authenticated admins can INSERT notifications
CREATE POLICY "Admins can insert notifications"
ON notifications
FOR INSERT
TO authenticated
WITH CHECK (
  auth.jwt() ->> 'role' = 'admin'
);

-- Grant necessary permissions
GRANT SELECT, UPDATE ON notifications TO authenticated;
GRANT ALL ON notifications TO service_role;

-- Verify policies
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'notifications';
