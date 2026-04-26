-- Driver document renewal workflow
-- Run this migration before using renewed document approval endpoints.

CREATE TABLE IF NOT EXISTS driver_document_renewals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (
    document_type IN (
      'license_front',
      'license_back',
      'insurance',
      'revenue_license'
    )
  ),
  proposed_document_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'rejected')
  ),
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES users(id),
  review_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_document_renewals_driver
  ON driver_document_renewals(driver_id);

CREATE INDEX IF NOT EXISTS idx_driver_document_renewals_status
  ON driver_document_renewals(status);

CREATE INDEX IF NOT EXISTS idx_driver_document_renewals_submitted
  ON driver_document_renewals(submitted_at DESC);

ALTER TABLE driver_document_renewals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers can view own document renewals" ON driver_document_renewals;
CREATE POLICY "Drivers can view own document renewals"
ON driver_document_renewals FOR SELECT
TO authenticated
USING (auth.uid() = driver_id);

DROP POLICY IF EXISTS "Drivers can insert own document renewals" ON driver_document_renewals;
CREATE POLICY "Drivers can insert own document renewals"
ON driver_document_renewals FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = driver_id);

DROP POLICY IF EXISTS "Service role full access to document renewals" ON driver_document_renewals;
CREATE POLICY "Service role full access to document renewals"
ON driver_document_renewals FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
