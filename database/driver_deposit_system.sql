-- ============================================================================
-- DRIVER DEPOSIT SYSTEM - CLEAN SCHEMA
-- ============================================================================
-- Flow:
-- 1. Driver delivers cash order → pending_deposit INCREASES
-- 2. Driver uploads transfer proof → creates deposit record (status=pending)
-- 3. Manager reviews & approves → approved_amount stored, pending_deposit DECREASES
-- ============================================================================

-- Drop existing tables if they exist (clean slate)
DROP TABLE IF EXISTS driver_deposits CASCADE;
DROP TABLE IF EXISTS driver_balances CASCADE;

-- ============================================================================
-- TABLE: driver_balances
-- Stores each driver's current pending deposit balance
-- ============================================================================
CREATE TABLE driver_balances (
  driver_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Current pending amount (driver owes this to manager)
  pending_deposit NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (pending_deposit >= 0),
  
  -- Lifetime totals for stats
  total_collected NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_approved NUMERIC(10, 2) NOT NULL DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_driver_balances_pending ON driver_balances(pending_deposit) WHERE pending_deposit > 0;

-- ============================================================================
-- TABLE: driver_deposits
-- Individual deposit submissions from drivers
-- ============================================================================
CREATE TABLE driver_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Proof of transfer (PDF or image URL)
  proof_url TEXT NOT NULL,
  
  -- Deposit status: pending → approved/rejected
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'approved', 'rejected')),
  
  -- Amount driver claims to have transferred
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  
  -- Amount manager verifies and approves (may differ from claimed amount)
  -- This is the amount that gets deducted from pending_deposit
  approved_amount NUMERIC(10, 2) DEFAULT NULL,
  
  -- Which date's collections this deposit covers
  collection_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Manager review fields
  reviewed_at TIMESTAMPTZ DEFAULT NULL,
  reviewed_by UUID REFERENCES auth.users(id) DEFAULT NULL,
  review_note TEXT DEFAULT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX idx_driver_deposits_driver_id ON driver_deposits(driver_id);
CREATE INDEX idx_driver_deposits_status ON driver_deposits(status);
CREATE INDEX idx_driver_deposits_collection_date ON driver_deposits(collection_date);
CREATE INDEX idx_driver_deposits_created_at ON driver_deposits(created_at DESC);
CREATE INDEX idx_driver_deposits_pending ON driver_deposits(status) WHERE status = 'pending';

-- ============================================================================
-- FUNCTION: Add to pending_deposit when cash order is delivered
-- Called by trigger on deliveries table
-- ============================================================================
CREATE OR REPLACE FUNCTION add_cash_to_pending_deposit()
RETURNS TRIGGER AS $$
DECLARE
  v_order RECORD;
  v_payment_method TEXT;
  v_total_amount NUMERIC;
BEGIN
  -- Only process when delivery status changes to 'delivered'
  IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status != 'delivered') THEN
    
    -- Get order details
    SELECT payment_method, total_amount 
    INTO v_payment_method, v_total_amount
    FROM orders 
    WHERE id = NEW.order_id;
    
    -- Only add to pending_deposit if payment method is cash
    IF v_payment_method = 'cash' THEN
      -- Insert or update driver_balances
      INSERT INTO driver_balances (driver_id, pending_deposit, total_collected, updated_at)
      VALUES (NEW.driver_id, v_total_amount, v_total_amount, now())
      ON CONFLICT (driver_id) 
      DO UPDATE SET 
        pending_deposit = driver_balances.pending_deposit + v_total_amount,
        total_collected = driver_balances.total_collected + v_total_amount,
        updated_at = now();
      
      RAISE NOTICE 'Added Rs.% to pending_deposit for driver %', v_total_amount, NEW.driver_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on deliveries table
DROP TRIGGER IF EXISTS trigger_add_cash_to_pending ON deliveries;
CREATE TRIGGER trigger_add_cash_to_pending
  AFTER UPDATE ON deliveries
  FOR EACH ROW
  EXECUTE FUNCTION add_cash_to_pending_deposit();

-- Also handle INSERT (in case delivery is created with status='delivered')
DROP TRIGGER IF EXISTS trigger_add_cash_to_pending_insert ON deliveries;
CREATE TRIGGER trigger_add_cash_to_pending_insert
  AFTER INSERT ON deliveries
  FOR EACH ROW
  WHEN (NEW.status = 'delivered')
  EXECUTE FUNCTION add_cash_to_pending_deposit();

-- ============================================================================
-- FUNCTION: Deduct from pending_deposit when deposit is approved
-- Called by trigger on driver_deposits table
-- ============================================================================
CREATE OR REPLACE FUNCTION deduct_approved_deposit()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process when status changes to 'approved'
  IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
    
    -- Deduct approved_amount from pending_deposit
    UPDATE driver_balances
    SET 
      pending_deposit = GREATEST(0, pending_deposit - COALESCE(NEW.approved_amount, 0)),
      total_approved = total_approved + COALESCE(NEW.approved_amount, 0),
      updated_at = now()
    WHERE driver_id = NEW.driver_id;
    
    RAISE NOTICE 'Deducted Rs.% from pending_deposit for driver %', NEW.approved_amount, NEW.driver_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on driver_deposits table
DROP TRIGGER IF EXISTS trigger_deduct_approved_deposit ON driver_deposits;
CREATE TRIGGER trigger_deduct_approved_deposit
  AFTER UPDATE ON driver_deposits
  FOR EACH ROW
  EXECUTE FUNCTION deduct_approved_deposit();

-- ============================================================================
-- FUNCTION: Auto-update updated_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to driver_deposits
DROP TRIGGER IF EXISTS trigger_update_deposits_timestamp ON driver_deposits;
CREATE TRIGGER trigger_update_deposits_timestamp
  BEFORE UPDATE ON driver_deposits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply to driver_balances
DROP TRIGGER IF EXISTS trigger_update_balances_timestamp ON driver_balances;
CREATE TRIGGER trigger_update_balances_timestamp
  BEFORE UPDATE ON driver_balances
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- HELPER VIEW: Driver deposit summary
-- ============================================================================
CREATE OR REPLACE VIEW driver_deposit_summary AS
SELECT 
  db.driver_id,
  db.pending_deposit,
  db.total_collected,
  db.total_approved,
  db.updated_at,
  u.full_name as driver_name,
  u.phone as driver_phone,
  (SELECT COUNT(*) FROM driver_deposits dd WHERE dd.driver_id = db.driver_id AND dd.status = 'pending') as pending_deposits_count,
  (SELECT COUNT(*) FROM driver_deposits dd WHERE dd.driver_id = db.driver_id AND dd.status = 'approved') as approved_deposits_count
FROM driver_balances db
LEFT JOIN users u ON u.id = db.driver_id;

-- ============================================================================
-- SAMPLE QUERIES
-- ============================================================================

-- Get driver's current pending deposit
-- SELECT pending_deposit FROM driver_balances WHERE driver_id = 'xxx';

-- Get all pending deposits for manager review
-- SELECT dp.*, u.full_name as driver_name 
-- FROM driver_deposits dp 
-- JOIN users u ON u.id = dp.driver_id 
-- WHERE dp.status = 'pending' 
-- ORDER BY dp.created_at ASC;

-- Get driver's deposit history
-- SELECT * FROM driver_deposits 
-- WHERE driver_id = 'xxx' 
-- ORDER BY created_at DESC;
