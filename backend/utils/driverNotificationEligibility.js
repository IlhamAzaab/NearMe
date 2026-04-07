import { supabaseAdmin } from "../supabaseAdmin.js";

export const PICKUP_MODE_STATUSES = ["accepted"];

export const DELIVERING_MODE_STATUSES = [
  "picked_up",
  "on_the_way",
  "at_customer",
];

export const DELIVERY_IN_PROGRESS_STATUSES = [
  ...PICKUP_MODE_STATUSES,
  ...DELIVERING_MODE_STATUSES,
];

function uniqueIds(ids = []) {
  return [
    ...new Set(
      (ids || []).map((id) => String(id || "").trim()).filter(Boolean),
    ),
  ];
}

/**
 * Delivery broadcast eligibility based on business rules:
 * - driver_status must be "active"
 * - pickup mode (has accepted/picking_up) => ALLOW notifications
 * - pure delivering mode (has delivering statuses and NO pickup statuses) => BLOCK
 * - idle mode (no active delivery rows) => ALLOW
 */
export async function getEligibleDriverIdsForDeliveryNotifications(
  candidateDriverIds = null,
) {
  const scopedIds =
    Array.isArray(candidateDriverIds) && candidateDriverIds.length > 0
      ? uniqueIds(candidateDriverIds)
      : null;

  if (Array.isArray(candidateDriverIds) && scopedIds?.length === 0) {
    return [];
  }

  let driverQuery = supabaseAdmin
    .from("drivers")
    .select("id")
    .eq("driver_status", "active");

  if (scopedIds) {
    driverQuery = driverQuery.in("id", scopedIds);
  }

  const { data: activeDrivers, error: activeDriverError } = await driverQuery;

  if (activeDriverError) {
    console.error(
      "[DriverEligibility] Failed to fetch active drivers:",
      activeDriverError.message,
    );
    return [];
  }

  const activeIds = uniqueIds((activeDrivers || []).map((d) => d.id));
  if (activeIds.length === 0) return [];

  const { data: progressRows, error: progressError } = await supabaseAdmin
    .from("deliveries")
    .select("driver_id, status")
    .in("driver_id", activeIds)
    .in("status", DELIVERY_IN_PROGRESS_STATUSES);

  if (progressError) {
    console.warn(
      "[DriverEligibility] Status-filter query failed, retrying without status filter:",
      progressError.message,
    );

    // Fallback keeps notifications flowing even if enum/status values drift.
    const { data: fallbackRows, error: fallbackError } = await supabaseAdmin
      .from("deliveries")
      .select("driver_id, status")
      .in("driver_id", activeIds);

    if (fallbackError) {
      console.error(
        "[DriverEligibility] Failed to fetch driver progress rows (fallback):",
        fallbackError.message,
      );
      return [];
    }

    return computeEligibleDriverIds(activeIds, fallbackRows || []);
  }

  return computeEligibleDriverIds(activeIds, progressRows || []);
}

function computeEligibleDriverIds(activeIds, progressRows) {
  const trackedStatuses = new Set(DELIVERY_IN_PROGRESS_STATUSES);

  const modeByDriver = new Map();

  for (const row of progressRows || []) {
    const driverId = String(row?.driver_id || "").trim();
    const status = String(row?.status || "")
      .trim()
      .toLowerCase();
    if (!driverId || !status || !trackedStatuses.has(status)) continue;

    if (!modeByDriver.has(driverId)) {
      modeByDriver.set(driverId, {
        hasPickupMode: false,
        hasDeliveringMode: false,
      });
    }

    const mode = modeByDriver.get(driverId);
    if (PICKUP_MODE_STATUSES.includes(status)) {
      mode.hasPickupMode = true;
    }
    if (DELIVERING_MODE_STATUSES.includes(status)) {
      mode.hasDeliveringMode = true;
    }
  }

  return activeIds.filter((driverId) => {
    const mode = modeByDriver.get(driverId);

    // No active rows means idle mode -> allow.
    if (!mode) return true;

    // Pickup mode always allows notifications, even if one order is already picked.
    if (mode.hasPickupMode) return true;

    // Block only when driver is purely in delivering mode.
    if (mode.hasDeliveringMode) return false;

    return true;
  });
}
