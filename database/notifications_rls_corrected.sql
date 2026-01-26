-- ============================================================================
-- CORRECTED: Production-Grade RLS Policies for Notifications Table
-- PostgreSQL Syntax Fixed - Ready to Run!
-- ============================================================================

-- 1. ENABLE RLS (if not already enabled)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 2. DROP EXISTING POLICIES (if any)
DROP POLICY IF EXISTS "Notifications - Service role insert" ON notifications;
DROP POLICY IF EXISTS "Notifications - Users select own" ON notifications;
DROP POLICY IF EXISTS "Notifications - Users update own" ON notifications;
DROP POLICY IF EXISTS "Notifications - Service role delete" ON notifications;

-- ============================================================================
-- POLICY 1: Service Role Can INSERT (Backend Notifications)
-- ============================================================================
-- Syntax: FOR INSERT requires WITH CHECK (not USING)
CREATE POLICY "Notifications - Service role insert"
ON notifications
FOR INSERT
WITH CHECK (true);

-- ============================================================================
-- POLICY 2: Authenticated Users Can SELECT Their Own Notifications
-- ============================================================================
-- Syntax: FOR SELECT requires USING (NOT WITH CHECK)
-- WITH CHECK cannot be used with SELECT!
CREATE POLICY "Notifications - Users select own"
ON notifications
FOR SELECT
TO authenticated
USING (recipient_id = auth.uid());

-- ============================================================================
-- POLICY 3: Authenticated Users Can UPDATE Their Own (Mark as Read)
-- ============================================================================
-- Syntax: FOR UPDATE requires both USING and WITH CHECK
CREATE POLICY "Notifications - Users update own"
ON notifications
FOR UPDATE
TO authenticated
USING (recipient_id = auth.uid())
WITH CHECK (recipient_id = auth.uid());

-- ============================================================================
-- POLICY 4: Service Role Can DELETE (Backend Cleanup)
-- ============================================================================
-- Syntax: FOR DELETE requires USING (NOT WITH CHECK)
-- WITH CHECK cannot be used with DELETE!
CREATE POLICY "Notifications - Service role delete"
ON notifications
FOR DELETE
USING (true);

-- ============================================================================
-- PERMISSION GRANTS (Security)
-- ============================================================================

-- Revoke all permissions first
REVOKE ALL ON notifications FROM PUBLIC;
REVOKE ALL ON notifications FROM authenticated;

-- Grant specific permissions to authenticated users
GRANT SELECT ON notifications TO authenticated;
GRANT UPDATE ON notifications TO authenticated;

-- Grant insert/delete to service_role (backend only)
GRANT INSERT, DELETE ON notifications TO service_role;
GRANT SELECT ON notifications TO service_role;

-- ============================================================================
-- VERIFICATION: Check if policies were created
-- ============================================================================
SELECT 
  policyname,
  permissive,
  roles,
  qual as condition
FROM pg_policies
WHERE tablename = 'notifications'
ORDER BY policyname;

-- Expected output: 4 rows
-- ✅ Notifications - Service role delete
-- ✅ Notifications - Service role insert
-- ✅ Notifications - Users select own
-- ✅ Notifications - Users update own
