-- =====================================================
-- DRIVER ONBOARDING SYSTEM - COMPLETE SCHEMA
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. ADD ONBOARDING COLUMNS TO DRIVERS TABLE
ALTER TABLE drivers
ADD COLUMN IF NOT EXISTS onboarding_step INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS working_time TEXT;

-- 2. DRIVER VEHICLE & LICENSE TABLE (Combined)
CREATE TABLE IF NOT EXISTS driver_vehicle_license (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  
  -- Vehicle Details
  vehicle_number TEXT NOT NULL UNIQUE,
  vehicle_type TEXT CHECK (vehicle_type IN ('bike', 'car', 'auto', 'van')),
  vehicle_model TEXT,
  insurance_expiry DATE NOT NULL,
  vehicle_license_expiry DATE NOT NULL,
  
  -- License Details
  driving_license_number TEXT NOT NULL UNIQUE,
  license_expiry_date DATE NOT NULL,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  CONSTRAINT unique_driver_vehicle UNIQUE(driver_id)
);

-- Index for quick driver lookup
CREATE INDEX IF NOT EXISTS idx_vehicle_license_driver ON driver_vehicle_license(driver_id);

-- RLS Policies for driver_vehicle_license
ALTER TABLE driver_vehicle_license ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view own vehicle"
ON driver_vehicle_license FOR SELECT
TO authenticated
USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can insert own vehicle"
ON driver_vehicle_license FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Drivers can update own vehicle"
ON driver_vehicle_license FOR UPDATE
TO authenticated
USING (auth.uid() = driver_id);

CREATE POLICY "Service role full access to vehicle"
ON driver_vehicle_license FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3. DRIVER DOCUMENTS TABLE
CREATE TABLE IF NOT EXISTS driver_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (
    document_type IN (
      'nic_front',
      'nic_back',
      'license_front',
      'license_back',
      'insurance',
      'revenue_license',
      'police_clearance',
      'profile_photo'
    )
  ),
  document_url TEXT NOT NULL,
  uploaded_at TIMESTAMP DEFAULT now(),
  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMP,
  verified_by UUID REFERENCES users(id),
  rejection_reason TEXT,
  
  CONSTRAINT unique_driver_document_type UNIQUE(driver_id, document_type)
);

-- Index for document queries
CREATE INDEX IF NOT EXISTS idx_documents_driver ON driver_documents(driver_id);
CREATE INDEX IF NOT EXISTS idx_documents_verified ON driver_documents(verified);

-- RLS Policies for driver_documents
ALTER TABLE driver_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view own documents"
ON driver_documents FOR SELECT
TO authenticated
USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can insert own documents"
ON driver_documents FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Drivers can update own documents"
ON driver_documents FOR UPDATE
TO authenticated
USING (auth.uid() = driver_id);

CREATE POLICY "Service role full access to documents"
ON driver_documents FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. DRIVER BANK ACCOUNTS TABLE
CREATE TABLE IF NOT EXISTS driver_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  account_holder_name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  branch TEXT NOT NULL,
  account_number TEXT NOT NULL,
  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMP,
  verified_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  CONSTRAINT unique_driver_bank UNIQUE(driver_id)
);

-- Index for bank account queries
CREATE INDEX IF NOT EXISTS idx_bank_accounts_driver ON driver_bank_accounts(driver_id);

-- RLS Policies for driver_bank_accounts
ALTER TABLE driver_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view own bank account"
ON driver_bank_accounts FOR SELECT
TO authenticated
USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can insert own bank account"
ON driver_bank_accounts FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Drivers can update own bank account"
ON driver_bank_accounts FOR UPDATE
TO authenticated
USING (auth.uid() = driver_id);

CREATE POLICY "Service role full access to bank accounts"
ON driver_bank_accounts FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 5. DRIVER CONTRACTS TABLE (Legal Protection)
CREATE TABLE IF NOT EXISTS driver_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  contract_version TEXT NOT NULL DEFAULT '1.0',
  accepted_at TIMESTAMP NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  contract_html TEXT, -- Store contract content for legal proof
  
  CONSTRAINT unique_driver_contract_version UNIQUE(driver_id, contract_version)
);

-- Index for contract queries
CREATE INDEX IF NOT EXISTS idx_contracts_driver ON driver_contracts(driver_id);
CREATE INDEX IF NOT EXISTS idx_contracts_accepted ON driver_contracts(accepted_at);

-- RLS Policies for driver_contracts
ALTER TABLE driver_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view own contracts"
ON driver_contracts FOR SELECT
TO authenticated
USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can insert own contracts"
ON driver_contracts FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Service role full access to contracts"
ON driver_contracts FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 6. DRIVER STATUS AUDIT LOG (Track all status changes)
CREATE TABLE IF NOT EXISTS driver_status_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES users(id),
  change_reason TEXT,
  changed_at TIMESTAMP DEFAULT now()
);

-- Index for audit queries
CREATE INDEX IF NOT EXISTS idx_status_log_driver ON driver_status_log(driver_id);
CREATE INDEX IF NOT EXISTS idx_status_log_date ON driver_status_log(changed_at);

-- RLS Policies for driver_status_log
ALTER TABLE driver_status_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to status log"
ON driver_status_log FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 7. UPDATE DRIVERS RLS POLICIES
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Drivers can view own profile" ON drivers;

CREATE POLICY "Drivers can view own profile"
ON drivers FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Drivers can update own profile"
ON drivers FOR UPDATE
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Service role full access to drivers"
ON drivers FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 8. TRIGGER TO UPDATE updated_at TIMESTAMP
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to relevant tables
DROP TRIGGER IF EXISTS update_drivers_updated_at ON drivers;
CREATE TRIGGER update_drivers_updated_at
BEFORE UPDATE ON drivers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_vehicle_license_updated_at ON driver_vehicle_license;
CREATE TRIGGER update_vehicle_license_updated_at
BEFORE UPDATE ON driver_vehicle_license
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_bank_accounts_updated_at ON driver_bank_accounts;
CREATE TRIGGER update_bank_accounts_updated_at
BEFORE UPDATE ON driver_bank_accounts
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- 9. FUNCTION TO LOG STATUS CHANGES (Automatic audit trail)
CREATE OR REPLACE FUNCTION log_driver_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.driver_status IS DISTINCT FROM NEW.driver_status THEN
    INSERT INTO driver_status_log (
      driver_id,
      old_status,
      new_status,
      change_reason
    ) VALUES (
      NEW.id,
      OLD.driver_status,
      NEW.driver_status,
      'System change'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_driver_status ON drivers;
CREATE TRIGGER log_driver_status
AFTER UPDATE ON drivers
FOR EACH ROW
EXECUTE FUNCTION log_driver_status_change();

-- 10. VALIDATION CONSTRAINTS
-- Ensure NIC is unique and non-null when onboarding is completed
CREATE OR REPLACE FUNCTION validate_driver_onboarding()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.onboarding_completed = true THEN
    IF NEW.nic_number IS NULL OR NEW.full_name IS NULL OR NEW.phone IS NULL THEN
      RAISE EXCEPTION 'Cannot complete onboarding without required personal details';
    END IF;
    
    -- Check if all required documents exist
    IF NOT EXISTS (
      SELECT 1 FROM driver_documents
      WHERE driver_id = NEW.id
      AND document_type IN ('nic_front', 'nic_back', 'license_front', 'license_back', 'insurance', 'revenue_license')
    ) THEN
      RAISE EXCEPTION 'Cannot complete onboarding without required documents';
    END IF;
    
    -- Check if vehicle/license exists
    IF NOT EXISTS (
      SELECT 1 FROM driver_vehicle_license WHERE driver_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Cannot complete onboarding without vehicle/license details';
    END IF;
    
    -- Check if bank account exists
    IF NOT EXISTS (
      SELECT 1 FROM driver_bank_accounts WHERE driver_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Cannot complete onboarding without bank account';
    END IF;
    
    -- Check if contract accepted
    IF NOT EXISTS (
      SELECT 1 FROM driver_contracts WHERE driver_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Cannot complete onboarding without accepting contract';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_onboarding ON drivers;
CREATE TRIGGER validate_onboarding
BEFORE UPDATE ON drivers
FOR EACH ROW
EXECUTE FUNCTION validate_driver_onboarding();

-- =====================================================
-- VERIFICATION: Check all tables created successfully
-- =====================================================
SELECT 'Schema migration completed successfully!' as status;

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name IN (
  'drivers',
  'driver_vehicle_license',
  'driver_documents',
  'driver_bank_accounts',
  'driver_contracts',
  'driver_status_log'
)
ORDER BY table_name, ordinal_position;
