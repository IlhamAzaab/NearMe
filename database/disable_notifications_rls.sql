-- ============================================================================
-- QUICKEST FIX: Disable RLS on notifications table
-- Use this if the other fix doesn't work
-- ============================================================================

-- Option 1: Disable RLS completely (SIMPLEST - use this first)
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- Then grant permissions
GRANT ALL ON TABLE notifications TO service_role;
GRANT ALL ON TABLE notifications TO authenticated;
GRANT ALL ON TABLE notifications TO anon;
