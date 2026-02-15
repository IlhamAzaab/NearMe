TRUNCATE TABLE
  order_items,
  order_status_history,
  deliveries,
  orders,
  cart_items,
  carts,
  daily_deposit_snapshots,
  driver_balances,
  driver_deposits,
  delivery_stops,
  admin_payments,
  driver_payments
RESTART IDENTITY CASCADE;

SELECT create_daily_deposit_snapshot();
SELECT * FROM daily_deposit_snapshots ORDER BY snapshot_date DESC;

--test the  database size and index size for all tables
SELECT
  pg_size_pretty(pg_database_size(current_database())) AS total_database_size;
SELECT
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
SELECT
  relname AS table_name,
  pg_size_pretty(pg_indexes_size(relid)) AS index_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_indexes_size(relid) DESC;


Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep -Seconds 1; Write-Host "All node processes killed"


$TOKEN = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjhiZTU3ZmNiLThmMmMtNGI1My1hMTZhLTNmMGYwMzVhNjM2NyIsInJvbGUiOiJjdXN0b21lciIsImlhdCI6MTc3MDk4NzUwNywiZXhwIjoxNzcxNTkyMzA3fQ.Z_WPgO5RptmOgiW2qvh_KOSQvtsXRDMTiy9dpsjIyoA
$ADMIN_TOKEN = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImI0ZDVlZjQ3LTExZjQtNGYwYi04ZjY5LWRkMWJhOGYzYTgxZSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3MDk4NzcwOSwiZXhwIjoxNzcxNTkyNTA5fQ.4qKrjDE08mRtncgKTKnSP1Q6N85h3zjG_5Q8dztIaCM
$DRIVER_TOKEN = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImJjNDNhNDEzLTE4OGUtNDA1Yi05ZjBkLTFjOWZkNTZjNjEyZCIsInJvbGUiOiJkcml2ZXIiLCJpYXQiOjE3NzA5ODc4MjksImV4cCI6MTc3MTU5MjYyOX0.pOEyHNOByJLUVfxiEzz7K1N5gtAfKPpkX3zxvgnT2sY
