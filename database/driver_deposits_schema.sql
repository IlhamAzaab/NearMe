-- ============================================================================
-- DRIVER DEPOSITS SYSTEM
-- ============================================================================
-- Purpose: Track cash collected by drivers and their bank transfer deposits
-- 
-- Flow:
-- 1. Driver delivers cash orders → cash_collected increases
-- 2. Driver sends bank transfer → creates deposit request with proof
-- 3. Manager reviews proof → approves/rejects deposit
-- 4. Approved deposit → deducts from pending_deposit
-- ============================================================================

-- Table: driver_deposits
-- Stores individual deposit requests from drivers
CREATE TABLE IF NOT EXISTS driver_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Deposit amount
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  
  -- Bank transfer proof (uploaded file URL)
  proof_url TEXT NOT NULL,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'approved', 'rejected')),
  
  -- Manager review
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  
  -- For which date's collections this deposit covers
  collection_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_driver_deposits_driver_id ON driver_deposits(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_deposits_status ON driver_deposits(status);
CREATE INDEX IF NOT EXISTS idx_driver_deposits_collection_date ON driver_deposits(collection_date);
CREATE INDEX IF NOT EXISTS idx_driver_deposits_created_at ON driver_deposits(created_at DESC);

-- Table: driver_cash_collections
-- Tracks each cash order delivered by driver (automatically populated when order is delivered)
CREATE TABLE IF NOT EXISTS driver_cash_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  delivery_id UUID REFERENCES deliveries(id) ON DELETE SET NULL,
  
  -- Amount collected from customer
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  
  -- Collection date (date when order was delivered)
  collection_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Whether this collection has been deposited
  is_deposited BOOLEAN DEFAULT FALSE,
  deposit_id UUID REFERENCES driver_deposits(id),
  
  -- Timestamps
  collected_at TIMESTAMPTZ DEFAULT now(),
  deposited_at TIMESTAMPTZ
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_cash_collections_driver_id ON driver_cash_collections(driver_id);
CREATE INDEX IF NOT EXISTS idx_cash_collections_date ON driver_cash_collections(collection_date);
CREATE INDEX IF NOT EXISTS idx_cash_collections_is_deposited ON driver_cash_collections(is_deposited);

-- ============================================================================
-- VIEWS FOR EASY QUERYING
-- ============================================================================

-- View: driver_pending_deposits
-- Shows each driver's pending deposit amount (cash collected but not yet deposited)
CREATE OR REPLACE VIEW driver_pending_deposits AS
SELECT 
  driver_id,
  collection_date,
  SUM(amount) as total_collected,
  COUNT(*) as order_count
FROM driver_cash_collections
WHERE is_deposited = FALSE
GROUP BY driver_id, collection_date
ORDER BY collection_date DESC;

-- View: driver_deposit_summary
-- Shows overall deposit status for each driver
CREATE OR REPLACE VIEW driver_deposit_summary AS
SELECT 
  d.driver_id,
  COALESCE(SUM(CASE WHEN d.is_deposited = FALSE THEN d.amount ELSE 0 END), 0) as pending_amount,
  COALESCE(SUM(CASE WHEN d.is_deposited = TRUE THEN d.amount ELSE 0 END), 0) as deposited_amount,
  COUNT(CASE WHEN d.is_deposited = FALSE THEN 1 END) as pending_orders,
  COUNT(CASE WHEN d.is_deposited = TRUE THEN 1 END) as deposited_orders
FROM driver_cash_collections d
GROUP BY d.driver_id;

-- ============================================================================
-- FUNCTION: Record cash collection when order is delivered
-- ============================================================================
CREATE OR REPLACE FUNCTION record_cash_collection()
RETURNS TRIGGER AS $$
BEGIN
  -- Only record for cash orders that are being marked as delivered
  IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
    -- Check if the order payment method is cash
    DECLARE
      v_order RECORD;
      v_delivery RECORD;
    BEGIN
      SELECT * INTO v_order FROM orders WHERE id = NEW.order_id;
      SELECT * INTO v_delivery FROM deliveries WHERE id = NEW.id;
      
      IF v_order.payment_method = 'cash' THEN
        -- Insert cash collection record
        INSERT INTO driver_cash_collections (
          driver_id,
          order_id,
          delivery_id,
          amount,
          collection_date,
          collected_at
        ) VALUES (
          NEW.driver_id,
          NEW.order_id,
          NEW.id,
          v_order.total_amount,
          CURRENT_DATE,
          NOW()
        );
      END IF;
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-record cash collections
DROP TRIGGER IF EXISTS trigger_record_cash_collection ON deliveries;
CREATE TRIGGER trigger_record_cash_collection
  AFTER UPDATE ON deliveries
  FOR EACH ROW
  EXECUTE FUNCTION record_cash_collection();

-- ============================================================================
-- FUNCTION: Mark collections as deposited when deposit is approved
-- ============================================================================
CREATE OR REPLACE FUNCTION mark_collections_deposited()
RETURNS TRIGGER AS $$
BEGIN
  -- When deposit is approved, mark related collections as deposited
  IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
    UPDATE driver_cash_collections
    SET 
      is_deposited = TRUE,
      deposit_id = NEW.id,
      deposited_at = NOW()
    WHERE driver_id = NEW.driver_id
      AND collection_date <= NEW.collection_date
      AND is_deposited = FALSE;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-mark collections when deposit approved
DROP TRIGGER IF EXISTS trigger_mark_collections_deposited ON driver_deposits;
CREATE TRIGGER trigger_mark_collections_deposited
  AFTER UPDATE ON driver_deposits
  FOR EACH ROW
  EXECUTE FUNCTION mark_collections_deposited();

-- ============================================================================
-- SAMPLE QUERIES FOR REFERENCE
-- ============================================================================

-- Get driver's pending deposit amount (total cash not yet deposited)
-- SELECT SUM(amount) FROM driver_cash_collections 
-- WHERE driver_id = 'xxx' AND is_deposited = FALSE;

-- Get driver's deposit history
-- SELECT * FROM driver_deposits 
-- WHERE driver_id = 'xxx' 
-- ORDER BY created_at DESC;

-- Get all pending deposits for manager review
-- SELECT dp.*, u.full_name as driver_name
-- FROM driver_deposits dp
-- JOIN users u ON u.id = dp.driver_id
-- WHERE dp.status = 'pending'
-- ORDER BY dp.created_at ASC;

-- Get driver's cash collections for today
-- SELECT * FROM driver_cash_collections
-- WHERE driver_id = 'xxx' AND collection_date = CURRENT_DATE;
