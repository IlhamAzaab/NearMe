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

