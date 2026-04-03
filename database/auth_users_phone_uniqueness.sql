-- Enforce global phone uniqueness in Supabase Auth
-- Run in Supabase SQL editor with a privileged role.

-- 1) Ensure a unique constraint exists on auth.users.phone.
-- If a unique constraint already exists, this block is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'auth.users'::regclass
      AND conname = 'users_phone_key'
  ) THEN
    ALTER TABLE auth.users
      ADD CONSTRAINT users_phone_key UNIQUE (phone);
  END IF;
END
$$;

-- 2) Optional RPC used by backend for fast availability checks.
-- SECURITY DEFINER allows reading auth.users from application calls.
CREATE OR REPLACE FUNCTION public.is_phone_registered(input_phone text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  normalized text;
BEGIN
  normalized := regexp_replace(COALESCE(input_phone, ''), '\\D', '', 'g');

  IF normalized = '' THEN
    RETURN false;
  END IF;

  IF normalized ~ '^94[0-9]{9}$' THEN
    normalized := '+' || normalized;
  ELSIF normalized ~ '^0[0-9]{9}$' THEN
    normalized := '+94' || substr(normalized, 2);
  ELSIF normalized ~ '^[0-9]{9}$' THEN
    normalized := '+94' || normalized;
  ELSIF normalized ~ '^\+94[0-9]{9}$' THEN
    normalized := normalized;
  ELSE
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.phone IN (
      normalized,
      replace(normalized, '+', ''),
      '0' || substr(normalized, 4)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_phone_registered(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_phone_registered(text) TO service_role;
