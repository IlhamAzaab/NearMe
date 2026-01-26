/**
 * RLS Policies for Drivers Table
 * Allows service role (backend) to query all drivers
 * Allows drivers to view and update their own profile
 */

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Drivers can view their own profile" ON drivers;
DROP POLICY IF EXISTS "Drivers can update their own profile" ON drivers;
DROP POLICY IF EXISTS "Service role has full access" ON drivers;

-- Enable RLS on drivers table
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;

-- Policy 1: Drivers can SELECT their own profile
CREATE POLICY "Drivers can view their own profile"
ON drivers
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
);

-- Policy 2: Drivers can UPDATE their own profile
CREATE POLICY "Drivers can update their own profile"
ON drivers
FOR UPDATE
TO authenticated
USING (
  id = auth.uid()
)
WITH CHECK (
  id = auth.uid()
);

-- Policy 3: Service role has full access (backend operations)
CREATE POLICY "Service role has full access"
ON drivers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Grant necessary permissions
GRANT SELECT, UPDATE ON drivers TO authenticated;
GRANT ALL ON drivers TO service_role;

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
WHERE tablename = 'drivers';
