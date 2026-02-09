TRUNCATE TABLE
  order_items,
  deliveries,
  orders,
  cart_items,
  carts,
  daily_deposit_snapshots,
  driver_balances,
  driver_deposits,
  delivery_stops
RESTART IDENTITY CASCADE;

SELECT create_daily_deposit_snapshot();
SELECT * FROM daily_deposit_snapshots ORDER BY snapshot_date DESC;

