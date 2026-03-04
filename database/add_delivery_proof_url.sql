-- Add delivery_proof_url column to deliveries table
-- This stores the Cloudinary URL of the delivery proof photo uploaded by the driver

ALTER TABLE deliveries 
ADD COLUMN IF NOT EXISTS delivery_proof_url TEXT DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN deliveries.delivery_proof_url IS 'Optional delivery proof photo URL (Cloudinary). Uploaded by driver for security/verification.';
