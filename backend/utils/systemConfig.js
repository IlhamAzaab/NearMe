/**
 * ============================================================================
 * SYSTEM CONFIG UTILITY
 * ============================================================================
 * Fetches and caches system configuration from the database.
 * All configurable values (driver earnings, fees, thresholds, etc.)
 * are stored in a single row in the system_config table.
 * ============================================================================
 */

import { supabaseAdmin } from "../supabaseAdmin.js";

// In-memory cache (refreshed every 60 seconds or on demand)
let cachedConfig = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

/**
 * Get system configuration from database (with caching)
 * @param {boolean} forceRefresh - bypass cache
 * @returns {Object} system config
 */
export async function getSystemConfig(forceRefresh = false) {
  const now = Date.now();

  if (!forceRefresh && cachedConfig && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("system_config")
      .select("*")
      .eq("id", 1)
      .single();

    if (error) {
      console.error("Failed to fetch system_config:", error.message);
      // Return defaults if DB fetch fails
      return getDefaults();
    }

    cachedConfig = data;
    cacheTimestamp = now;
    return data;
  } catch (err) {
    console.error("System config fetch error:", err.message);
    return getDefaults();
  }
}

/**
 * Invalidate the cache (call after update)
 */
export function invalidateConfigCache() {
  cachedConfig = null;
  cacheTimestamp = 0;
}

/**
 * Parse service fee tiers from config
 * @param {Object} config - system config object
 * @returns {Array} sorted tiers
 */
export function getServiceFeeTiers(config) {
  try {
    const tiers =
      typeof config.service_fee_tiers === "string"
        ? JSON.parse(config.service_fee_tiers)
        : config.service_fee_tiers;
    return tiers.sort((a, b) => a.min - b.min);
  } catch {
    return getDefaults().service_fee_tiers;
  }
}

/**
 * Parse delivery fee tiers from config
 * @param {Object} config - system config object
 * @returns {Array} sorted tiers
 */
export function getDeliveryFeeTiers(config) {
  try {
    const tiers =
      typeof config.delivery_fee_tiers === "string"
        ? JSON.parse(config.delivery_fee_tiers)
        : config.delivery_fee_tiers;
    // Sort: tiers with max_km first (ascending), then the overflow tier (max_km: null) last
    return tiers.sort((a, b) => {
      if (a.max_km === null) return 1;
      if (b.max_km === null) return -1;
      return a.max_km - b.max_km;
    });
  } catch {
    return getDefaults().delivery_fee_tiers;
  }
}

/**
 * Parse launch promotion config from system config
 * @param {Object} config - system config object
 * @returns {Object} normalized launch promotion config
 */
export function getLaunchPromoConfig(config) {
  const defaults = getDefaults();
  return {
    enabled: Boolean(
      config?.launch_promo_enabled ?? defaults.launch_promo_enabled,
    ),
    first_km_rate: parseFloat(
      config?.launch_promo_first_km_rate ?? defaults.launch_promo_first_km_rate,
    ),
    max_km: parseFloat(config?.launch_promo_max_km ?? defaults.launch_promo_max_km),
    beyond_km_rate: parseFloat(
      config?.launch_promo_beyond_km_rate ?? defaults.launch_promo_beyond_km_rate,
    ),
  };
}

/**
 * Calculate service fee from config tiers
 */
export function calculateServiceFeeFromConfig(subtotal, config) {
  const tiers = getServiceFeeTiers(config);
  for (let i = tiers.length - 1; i >= 0; i--) {
    const tier = tiers[i];
    if (subtotal >= tier.min) {
      return tier.fee;
    }
  }
  return 0;
}

/**
 * Calculate delivery fee from config tiers
 */
export function calculateDeliveryFeeFromConfig(distanceKm, config) {
  if (distanceKm === null || distanceKm === undefined) return null;

  const tiers = getDeliveryFeeTiers(config);

  for (const tier of tiers) {
    if (tier.max_km !== null && distanceKm <= tier.max_km) {
      return tier.fee;
    }
    if (tier.max_km === null) {
      // Overflow tier: base_fee + extra_per_100m for distance beyond base_km
      const extraMeters = (distanceKm - tier.base_km) * 1000;
      const extra100mUnits = Math.ceil(extraMeters / 100);
      return tier.base_fee + extra100mUnits * tier.extra_per_100m;
    }
  }
  return 0;
}

/**
 * Default values (fallback if DB is unavailable)
 */
function getDefaults() {
  return {
    id: 1,
    rate_per_km: 40,
    rtc_rate_below_5km: 40,
    rtc_rate_above_5km: 40,
    max_driver_to_restaurant_km: 1,
    max_driver_to_restaurant_amount: 30,
    max_restaurant_proximity_km: 1,
    second_delivery_bonus: 20,
    additional_delivery_bonus: 30,
    max_extra_time_minutes: 10,
    max_extra_distance_km: 3,
    max_active_deliveries: 5,
    commission_percentage: 10,
    service_fee_tiers: [
      { min: 0, max: 300, fee: 0 },
      { min: 300, max: 1000, fee: 31 },
      { min: 1000, max: 1500, fee: 42 },
      { min: 1500, max: 2500, fee: 56 },
      { min: 2500, max: null, fee: 62 },
    ],
    delivery_fee_tiers: [
      { max_km: 1, fee: 50 },
      { max_km: 2, fee: 80 },
      { max_km: 2.5, fee: 87 },
      { max_km: null, base_fee: 87, extra_per_100m: 2.3, base_km: 2.5 },
    ],
    pending_alert_minutes: 10,
    day_shift_start: 5.0,
    day_shift_end: 19.0,
    night_shift_start: 18.0,
    night_shift_end: 6.0,
    order_distance_constraints: [
      { min_km: 0, max_km: 5, min_subtotal: 300 },
      { min_km: 5, max_km: 10, min_subtotal: 1000 },
      { min_km: 10, max_km: 15, min_subtotal: 2000 },
      { min_km: 15, max_km: 25, min_subtotal: 3000 },
    ],
    max_order_distance_km: 25,
    launch_promo_enabled: true,
    launch_promo_first_km_rate: 1,
    launch_promo_max_km: 5,
    launch_promo_beyond_km_rate: 40,
  };
}
