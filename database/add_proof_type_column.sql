-- Add proof_type column to driver_deposits table
-- This stores whether the uploaded proof is an 'image' or 'pdf'

ALTER TABLE driver_deposits 
ADD COLUMN IF NOT EXISTS proof_type TEXT DEFAULT 'image';

-- Add comment for documentation
COMMENT ON COLUMN driver_deposits.proof_type IS 'Type of proof file: image or pdf';
