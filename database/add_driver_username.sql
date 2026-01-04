-- Add user_name column to drivers table
ALTER TABLE public.drivers 
ADD COLUMN IF NOT EXISTS user_name TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.drivers.user_name IS 'Username chosen by driver during profile setup';
