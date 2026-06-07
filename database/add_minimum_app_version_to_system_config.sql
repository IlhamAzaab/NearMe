-- Add minimum_app_version column to system_config table for force-update feature
ALTER TABLE public.system_config
ADD COLUMN IF NOT EXISTS minimum_app_version TEXT NOT NULL DEFAULT '1.0.0';

-- Comment explaining the column usage
COMMENT ON COLUMN public.system_config.minimum_app_version IS 'Minimum mobile app version required (e.g. 1.0.0). Apps below this version are blocked.';
