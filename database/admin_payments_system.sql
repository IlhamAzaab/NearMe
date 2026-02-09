-- ============================================================================
-- ADMIN PAYMENT SYSTEM
-- System for manager to process payments to restaurant admins
-- ============================================================================

-- Drop existing table if exists
DROP TABLE IF EXISTS admin_payments CASCADE;

-- Create admin_payments table to track payments from manager to restaurant admins
CREATE TABLE admin_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  proof_url TEXT NOT NULL,
  proof_type VARCHAR(10) NOT NULL CHECK (proof_type IN ('image', 'pdf')),
  paid_by UUID NOT NULL REFERENCES managers(user_id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'Asia/Colombo')
);

-- Create indexes for performance
CREATE INDEX idx_admin_payments_restaurant ON admin_payments(restaurant_id);
CREATE INDEX idx_admin_payments_created ON admin_payments(created_at DESC);
CREATE INDEX idx_admin_payments_paid_by ON admin_payments(paid_by);

-- Enable RLS
ALTER TABLE admin_payments ENABLE ROW LEVEL SECURITY;

-- Policy: Managers can view all payments
CREATE POLICY admin_payments_manager_select ON admin_payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM managers WHERE user_id = auth.uid()
    )
  );

-- Policy: Managers can insert payments
CREATE POLICY admin_payments_manager_insert ON admin_payments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM managers WHERE user_id = auth.uid()
    )
    AND paid_by = auth.uid()
  );

-- Policy: Restaurant admins can view their own payments
CREATE POLICY admin_payments_admin_select ON admin_payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM restaurants r
      INNER JOIN admins a ON r.admin_id = a.id
      WHERE r.id = admin_payments.restaurant_id
      AND a.id = auth.uid()
    )
  );

-- Create view for admin payment summary (similar to driver_payments view)
CREATE OR REPLACE VIEW admin_payment_summary AS
SELECT 
  r.id as restaurant_id,
  r.restaurant_name,
  r.admin_id,
  a.email as admin_email,
  COALESCE(SUM(rp.amount_to_pay), 0) as total_earnings,
  COALESCE(
    (SELECT SUM(amount) FROM admin_payments ap WHERE ap.restaurant_id = r.id),
    0
  ) as total_paid,
  GREATEST(
    0,
    COALESCE(SUM(rp.amount_to_pay), 0) - COALESCE(
      (SELECT SUM(amount) FROM admin_payments ap WHERE ap.restaurant_id = r.id),
      0
    )
  ) as withdrawal_balance,
  COUNT(DISTINCT rp.order_date) as order_days_count
FROM restaurants r
LEFT JOIN admins a ON r.admin_id = a.id
LEFT JOIN restaurant_payments rp ON r.id = rp.restaurant_id
WHERE r.restaurant_status = 'active'
GROUP BY r.id, r.restaurant_name, r.admin_id, a.email
ORDER BY withdrawal_balance DESC;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Admin payment system created successfully!';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Created:';
  RAISE NOTICE '   - admin_payments table: Track manager payments to admins';
  RAISE NOTICE '   - admin_payment_summary view: Summary of earnings and balances';
  RAISE NOTICE '   - RLS policies for secure access';
END $$;
