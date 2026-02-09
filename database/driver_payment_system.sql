-- ============================================================================
-- DRIVER PAYMENT SYSTEM - Manager pays drivers their delivery earnings
-- ============================================================================
-- This table tracks payments made by the manager to drivers
-- for their delivery earnings (driver_earnings from deliveries table)
--
-- LOGIC:
-- Total Earnings = SUM(driver_earnings) from all delivered deliveries for a driver
-- Total Paid = SUM(amount) from all completed driver_payments for a driver
-- Total Withdrawal Balance = Total Earnings - Total Paid (what manager still owes)
-- ============================================================================

-- Drop if exists (clean slate)
DROP TABLE IF EXISTS driver_payments CASCADE;

-- ============================================================================
-- TABLE: driver_payments
-- Each row = one payment transfer from manager to driver
-- ============================================================================
CREATE TABLE driver_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- The driver being paid
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  
  -- Amount transferred by manager
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  
  -- Proof of transfer (receipt image/PDF uploaded to Cloudinary)
  proof_url TEXT NOT NULL,
  proof_type TEXT DEFAULT 'image' CHECK (proof_type IN ('image', 'pdf')),
  
  -- Manager who made the payment
  paid_by UUID NOT NULL REFERENCES auth.users(id),
  
  -- Optional note from manager
  note TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_driver_payments_driver ON driver_payments(driver_id);
CREATE INDEX idx_driver_payments_created ON driver_payments(created_at DESC);
CREATE INDEX idx_driver_payments_paid_by ON driver_payments(paid_by);

-- ============================================================================
-- GRANT PERMISSIONS (adjust based on your RLS setup)
-- ============================================================================
-- ALTER TABLE driver_payments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SAMPLE QUERIES
-- ============================================================================
-- Get total paid to a driver:
-- SELECT COALESCE(SUM(amount), 0) as total_paid FROM driver_payments WHERE driver_id = 'xxx';

-- Get withdrawal balance per driver:
-- SELECT d.id, d.full_name,
--   COALESCE(SUM(del.driver_earnings), 0) as total_earnings,
--   COALESCE((SELECT SUM(amount) FROM driver_payments WHERE driver_id = d.id), 0) as total_paid,
--   COALESCE(SUM(del.driver_earnings), 0) - COALESCE((SELECT SUM(amount) FROM driver_payments WHERE driver_id = d.id), 0) as withdrawal_balance
-- FROM drivers d
-- LEFT JOIN deliveries del ON del.driver_id = d.id AND del.status = 'delivered'
-- GROUP BY d.id, d.full_name;
