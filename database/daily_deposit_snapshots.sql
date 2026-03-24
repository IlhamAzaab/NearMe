-- ============================================================================
-- DAILY DEPOSIT SNAPSHOTS - For tracking prev. pending balance
-- ============================================================================
-- This table stores daily snapshots of the deposit system state
-- Used to calculate "Prev. Pending" in the manager dashboard
-- Snapshots are created at midnight Sri Lanka time (UTC+5:30)
-- ============================================================================

-- Drop if exists (clean slate for initial setup)
DROP TABLE IF EXISTS daily_deposit_snapshots CASCADE;

-- ============================================================================
-- TABLE: daily_deposit_snapshots
-- Stores daily ending balances for each day
-- ============================================================================
CREATE TABLE daily_deposit_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- The date this snapshot represents (Sri Lanka timezone)
  snapshot_date DATE NOT NULL UNIQUE,
  
  -- Total pending amount across all drivers at end of day
  ending_pending NUMERIC(10, 2) NOT NULL DEFAULT 0,
  
  -- Total sales (cash collected) for this day
  total_sales NUMERIC(10, 2) NOT NULL DEFAULT 0,
  
  -- Total approved deposits for this day
  total_approved NUMERIC(10, 2) NOT NULL DEFAULT 0,
  
  -- Number of pending deposits at end of day
  pending_deposits_count INTEGER NOT NULL DEFAULT 0,
  
  -- Timestamp when snapshot was created
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast date lookups
CREATE INDEX idx_daily_snapshots_date ON daily_deposit_snapshots(snapshot_date DESC);

-- ============================================================================
-- FUNCTION: Create daily snapshot
-- Called at midnight Sri Lanka time via cron job or scheduled function
-- 
-- SNAPSHOT LOGIC:
-- ending_pending = (todays_sales + prev_pending) - todays_approved
-- This is what carries forward to the next day as prev_pending
-- ============================================================================
CREATE OR REPLACE FUNCTION create_daily_deposit_snapshot()
RETURNS void AS $$
DECLARE
  v_today DATE;
  v_total_sales NUMERIC;
  v_total_approved NUMERIC;
  v_prev_pending NUMERIC;
  v_snapshot_boundary TIMESTAMPTZ;
  v_total_sales_today NUMERIC;
  v_ending_pending NUMERIC;
  v_pending_count INTEGER;
BEGIN
  -- Get current date in Sri Lanka timezone
  v_today := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Colombo')::DATE;
  
  -- Get the most recent snapshot as the boundary
  -- Everything AFTER this snapshot's created_at is "today's" data
  SELECT COALESCE(ending_pending, 0), created_at
  INTO v_prev_pending, v_snapshot_boundary
  FROM daily_deposit_snapshots
  ORDER BY snapshot_date DESC
  LIMIT 1;
  
  -- If no snapshot exists, default to 0 with no boundary
  IF v_prev_pending IS NULL THEN
    v_prev_pending := 0;
  END IF;
  
  -- Calculate cash sales AFTER the last snapshot boundary
  IF v_snapshot_boundary IS NOT NULL THEN
    SELECT COALESCE(SUM(o.total_amount), 0)
    INTO v_total_sales
    FROM deliveries d
    JOIN orders o ON o.id = d.order_id
    WHERE d.status = 'delivered'
      AND o.payment_method = 'cash'
      AND d.delivered_at > v_snapshot_boundary;
  ELSE
    SELECT COALESCE(SUM(o.total_amount), 0)
    INTO v_total_sales
    FROM deliveries d
    JOIN orders o ON o.id = d.order_id
    WHERE d.status = 'delivered'
      AND o.payment_method = 'cash';
  END IF;
  
  -- Calculate approved deposits AFTER the last snapshot boundary
  IF v_snapshot_boundary IS NOT NULL THEN
    SELECT COALESCE(SUM(approved_amount), 0)
    INTO v_total_approved
    FROM driver_deposits
    WHERE status = 'approved'
      AND reviewed_at > v_snapshot_boundary;
  ELSE
    SELECT COALESCE(SUM(approved_amount), 0)
    INTO v_total_approved
    FROM driver_deposits
    WHERE status = 'approved';
  END IF;
  
  -- Calculate total_sales_today = todays_sales + prev_pending
  v_total_sales_today := v_total_sales + v_prev_pending;
  
  -- Calculate ending_pending = total_sales_today - paid_today
  -- This becomes the next period's prev_pending
  v_ending_pending := GREATEST(0, v_total_sales_today - v_total_approved);
  
  -- Count pending deposits
  SELECT COUNT(*)
  INTO v_pending_count
  FROM driver_deposits
  WHERE status = 'pending';
  
  -- Insert or update snapshot
  INSERT INTO daily_deposit_snapshots (
    snapshot_date,
    ending_pending,
    total_sales,
    total_approved,
    pending_deposits_count
  )
  VALUES (
    v_today,
    v_ending_pending,
    v_total_sales,
    v_total_approved,
    v_pending_count
  )
  ON CONFLICT (snapshot_date) 
  DO UPDATE SET
    ending_pending = EXCLUDED.ending_pending,
    total_sales = EXCLUDED.total_sales,
    total_approved = EXCLUDED.total_approved,
    pending_deposits_count = EXCLUDED.pending_deposits_count,
    created_at = now();
  
  RAISE NOTICE 'Snapshot for %: sales=% (after boundary), prev_pending=%, total=%, approved=%, ending_pending=%', 
    v_today, v_total_sales, v_prev_pending, v_total_sales_today, v_total_approved, v_ending_pending;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SCHEDULED JOB: Create snapshot at midnight (Sri Lanka time)
-- This requires pg_cron extension to be enabled
-- If pg_cron is not available, use external scheduler (cron, CloudWatch, etc.)
-- ============================================================================

-- Uncomment below if pg_cron is available:
-- SELECT cron.schedule(
--   'daily-deposit-snapshot',
--   '30 18 * * *',  -- 18:30 UTC = 00:00 Sri Lanka (UTC+5:30)
--   $$SELECT create_daily_deposit_snapshot()$$
-- );

-- ============================================================================
-- VIEW: Manager deposit dashboard data
-- Combines current data with snapshots for dashboard display
-- 
-- LOGIC (snapshot-boundary based):
-- prev_pending = latest snapshot's ending_pending
-- todays_sales = cash deliveries AFTER latest snapshot's created_at
-- total_sales_today = todays_sales + prev_pending
-- paid = approved deposits AFTER latest snapshot's created_at
-- pending = total_sales_today - paid
-- ============================================================================
CREATE OR REPLACE VIEW manager_deposit_dashboard AS
WITH latest_snapshot AS (
  SELECT ending_pending, created_at
  FROM daily_deposit_snapshots
  ORDER BY snapshot_date DESC
  LIMIT 1
),
snapshot_values AS (
  SELECT 
    COALESCE(ls.ending_pending, 0) as prev_pending,
    ls.created_at as boundary
  FROM (SELECT 1) dummy
  LEFT JOIN latest_snapshot ls ON true
),
today_sales AS (
  SELECT COALESCE(SUM(o.total_amount), 0) as total
  FROM deliveries d
  JOIN orders o ON o.id = d.order_id
  CROSS JOIN snapshot_values sv
  WHERE d.status = 'delivered'
    AND o.payment_method = 'cash'
    AND (sv.boundary IS NULL OR d.delivered_at > sv.boundary)
),
today_approved AS (
  SELECT COALESCE(SUM(approved_amount), 0) as total
  FROM driver_deposits d
  CROSS JOIN snapshot_values sv
  WHERE d.status = 'approved'
    AND (sv.boundary IS NULL OR d.reviewed_at > sv.boundary)
),
pending_count AS (
  SELECT COUNT(*) as count
  FROM driver_deposits
  WHERE status = 'pending'
),
calculated_values AS (
  SELECT 
    COALESCE(ts.total, 0) as todays_sales,
    sv.prev_pending,
    COALESCE(ta.total, 0) as paid,
    (COALESCE(ts.total, 0) + sv.prev_pending) as total_sales_today
  FROM today_sales ts
  CROSS JOIN today_approved ta
  CROSS JOIN snapshot_values sv
)
SELECT
  (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Colombo')::DATE as snapshot_date,
  cv.todays_sales,
  cv.prev_pending,
  cv.total_sales_today,
  GREATEST(0, cv.total_sales_today - cv.paid) as pending,
  cv.paid,
  pc.count as pending_deposits_count
FROM calculated_values cv
CROSS JOIN pending_count pc;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
-- Grant access to authenticated users (for RLS bypass via service role)
-- GRANT SELECT ON daily_deposit_snapshots TO authenticated;
-- GRANT SELECT ON manager_deposit_dashboard TO authenticated;

-- ============================================================================
-- SAMPLE QUERIES
-- ============================================================================

-- Get manager dashboard data
-- SELECT * FROM manager_deposit_dashboard;

-- Manually create today's snapshot
-- SELECT create_daily_deposit_snapshot();

-- Get last 7 days of snapshots
-- SELECT * FROM daily_deposit_snapshots ORDER BY snapshot_date DESC LIMIT 7;
