/**
 * ============================================================================
 * ETA (Estimated Time of Arrival) Calculator
 * ============================================================================
 *
 * Calculates dynamic estimated arrival times for deliveries.
 *
 * ROUTING STRATEGY:
 * - Routes are calculated using FOOT (walking) profile for SHORTEST DISTANCE (in osrmService.js)
 * - ETA is calculated using DRIVING profile for REALISTIC BIKE SPEED (here in etaCalculator.js)
 * - This gives best of both: shortest route + accurate bike ETA
 *
 * CUSTOMER ETA RULES:
 * - Each stop (restaurant or customer) gets a 5-minute base wait allocation
 * - OSRM DRIVING profile provides realistic bike travel time between stops
 * - Total ETA = sum of all OSRM travel segments + 5 min per stop before customer
 * - Displayed as range: X min — (X+10) min
 * - As driver completes stops, deduct the 5-min allocation from remaining ETA
 * - If stop takes < 5 min, deduct the full 5 min (saving time)
 * - If driver stays > 5 min at a stop, add another 5 min instantly
 *
 * DRIVER ETA RULES:
 * - Only show OSRM travel time (no stop wait times)
 * - Available deliveries: driver→restaurant + restaurant→customer
 * - Active deliveries: driver→next stop
 * - Uses DRIVING profile for realistic motorcycle/bike ETA
 *
 * ============================================================================
 */

import { supabaseAdmin } from "../supabaseAdmin.js";

// Public OSRM server with backup
const OSRM_PRIMARY_URL =
  process.env.OSRM_URL || "https://router.project-osrm.org";
const OSRM_BACKUP_URL = "https://router.project-osrm.org"; // Use same for ETA (driving mode)

// Constants
const STOP_WAIT_TIME_SEC = 300; // 5 minutes in seconds
const STOP_OVERTIME_THRESHOLD_SEC = 300; // After 5 min at stop, add more time
const ETA_RANGE_BUFFER_MIN = 10; // Display range: X to X+10

/**
 * Haversine distance - ONLY for proximity detection (<50m) and internal sorting.
 * NOT for user-facing route distance calculations.
 */
function haversineDistanceForProximityAndSorting(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Get OSRM route duration between two points (seconds)
 * OSRM-ONLY: No Haversine fallback. Returns unavailable state if all retries fail.
 * Uses DRIVING profile for realistic motorcycle/bike ETA.
 */
async function getOSRMDuration(fromLat, fromLng, toLat, toLng) {
  const servers = [OSRM_PRIMARY_URL, OSRM_BACKUP_URL];
  const profiles = ["driving"]; // DRIVING for realistic bike/motorcycle ETA
  const RETRY_DELAYS = [0, 1500]; // Retry after 1.5s backoff

  for (const serverUrl of servers) {
    for (let retry = 0; retry < RETRY_DELAYS.length; retry++) {
      if (retry > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAYS[retry]),
        );
      }

      for (const profile of profiles) {
        try {
          const coords = `${fromLng},${fromLat};${toLng},${toLat}`;
          const url = `${serverUrl}/route/v1/${profile}/${coords}?overview=false`;
          const controller = new AbortController();
          const timeout = setTimeout(
            () => controller.abort(),
            6000 + retry * 2000,
          );
          const res = await fetch(url, { signal: controller.signal });
          clearTimeout(timeout);

          if (res.ok) {
            const data = await res.json();
            if (data.code === "Ok" && data.routes?.[0]) {
              return {
                duration: data.routes[0].duration, // seconds
                distance: data.routes[0].distance, // meters
                isUnavailable: false,
              };
            }
          }
        } catch (e) {
          // Continue to next server
        }
      }
    }
  }

  // All retries failed - return unavailable state (NO Haversine fallback)
  console.log("[ETA] OSRM unavailable for route calculation");
  return {
    duration: null,
    distance: null,
    isUnavailable: true,
    unavailableReason: "OSRM service unavailable after retries",
  };
}

// Proximity threshold for "arrived at stop" detection (50 meters)
const ARRIVAL_PROXIMITY_METERS = 50;

/**
 * Check if driver is within proximity threshold of a stop.
 * Returns true if distance <= ARRIVAL_PROXIMITY_METERS
 * Uses Haversine for geometric proximity check (acceptable for <50m detection)
 */
function isDriverAtStop(driverLat, driverLng, stopLat, stopLng) {
  const distanceMeters = haversineDistanceForProximityAndSorting(
    driverLat,
    driverLng,
    stopLat,
    stopLng,
  );
  return distanceMeters <= ARRIVAL_PROXIMITY_METERS;
}

/**
 * Build the stop sequence for a driver's current deliveries.
 * Returns an ordered array of stops with coordinates, types and delivery info.
 *
 * Each stop: { delivery_id, stop_type, lat, lng, stop_order, status, customer_id,
 *              arrived_at (timestamp when driver arrived at this stop),
 *              is_driver_nearby (boolean if driver currently within 50m) }
 */
async function getDeliveryStopSequence(driverId, driverLocation = null) {
  // Get all active deliveries for this driver
  const { data: deliveries, error } = await supabaseAdmin
    .from("deliveries")
    .select(
      `
      id,
      order_id,
      status,
      accepted_at,
      picked_up_at,
      on_the_way_at,
      arrived_restaurant_at,
      arrived_customer_at,
      delivered_at,
      current_latitude,
      current_longitude,
      last_location_update,
      delivery_sequence,
      orders (
        customer_id,
        restaurant_latitude,
        restaurant_longitude,
        delivery_latitude,
        delivery_longitude,
        restaurant_name,
        customer_name,
        order_number
      )
    `,
    )
    .eq("driver_id", driverId)
    .in("status", ["accepted", "picked_up", "on_the_way", "at_customer"])
    .order("delivery_sequence", { ascending: true });

  if (error || !deliveries?.length) return [];

  // Build ordered stops by delivery sequence (source-of-truth ordering).
  // For each delivery:
  // - status=accepted: restaurant stop first, then customer stop
  // - status in picked_up/on_the_way/at_customer: customer stop only
  const stops = [];

  // Get driver's current location for proximity detection
  const driverLat = driverLocation?.latitude
    ? parseFloat(driverLocation.latitude)
    : null;
  const driverLng = driverLocation?.longitude
    ? parseFloat(driverLocation.longitude)
    : null;

  for (let index = 0; index < deliveries.length; index += 1) {
    const d = deliveries[index];
    const o = d.orders;
    if (!o) continue;
    const sequence = Number.isFinite(Number(d.delivery_sequence))
      ? Number(d.delivery_sequence)
      : index + 1;

    const resLat = parseFloat(o.restaurant_latitude);
    const resLng = parseFloat(o.restaurant_longitude);
    const cusLat = parseFloat(o.delivery_latitude);
    const cusLng = parseFloat(o.delivery_longitude);

    // Restaurant stop — only if not yet picked up
    if (d.status === "accepted") {
      // Check if driver is currently within 50m of restaurant
      const isNearby =
        driverLat && driverLng
          ? isDriverAtStop(driverLat, driverLng, resLat, resLng)
          : false;
      // Use arrived_restaurant_at if set, otherwise use last_location_update if nearby
      const arrivedAt =
        d.arrived_restaurant_at ||
        (isNearby && d.last_location_update ? d.last_location_update : null);

      stops.push({
        delivery_id: d.id,
        order_id: d.order_id,
        delivery_sequence: sequence,
        stop_type: "restaurant",
        lat: resLat,
        lng: resLng,
        completed: false,
        arrived_at: arrivedAt,
        is_driver_nearby: isNearby,
        customer_id: o.customer_id,
        order_number: o.order_number,
        restaurant_name: o.restaurant_name,
        customer_name: o.customer_name,
        delivery_status: d.status,
      });
    }

    // Customer stop — only if not yet delivered
    const customerCompleted = d.status === "delivered";
    if (!customerCompleted) {
      // Check if driver is currently within 50m of customer
      const isNearby =
        driverLat && driverLng
          ? isDriverAtStop(driverLat, driverLng, cusLat, cusLng)
          : false;
      // Use arrived_customer_at if set, otherwise use last_location_update if nearby
      const arrivedAt =
        d.arrived_customer_at ||
        (isNearby && d.last_location_update ? d.last_location_update : null);

      stops.push({
        delivery_id: d.id,
        order_id: d.order_id,
        delivery_sequence: sequence,
        stop_type: "customer",
        lat: cusLat,
        lng: cusLng,
        completed: false,
        arrived_at: arrivedAt,
        is_driver_nearby: isNearby,
        customer_id: o.customer_id,
        order_number: o.order_number,
        restaurant_name: o.restaurant_name,
        customer_name: o.customer_name,
        delivery_status: d.status,
      });
    }
  }

  // Stable sort by delivery sequence. For same delivery sequence, restaurant stop
  // must come before customer stop.
  stops.sort((a, b) => {
    if (a.delivery_sequence !== b.delivery_sequence) {
      return a.delivery_sequence - b.delivery_sequence;
    }

    if (a.stop_type === b.stop_type) return 0;
    return a.stop_type === "restaurant" ? -1 : 1;
  });

  return stops;
}

/**
 * Calculate how much extra time a stop incurs if the driver has been
 * waiting longer than the base 5 minutes.
 * Returns 0 if not arrived or within the base 5 min.
 * Returns additional seconds beyond the first 5 min (in 5-min increments).
 */
function getStopOvertimeSeconds(arrivedAt) {
  if (!arrivedAt) return 0;
  const elapsed = (Date.now() - new Date(arrivedAt).getTime()) / 1000;
  if (elapsed <= STOP_WAIT_TIME_SEC) return 0;

  // Add +5 min immediately after crossing base wait, then +5 for each
  // additional 5-min overtime window.
  const overtime = elapsed - STOP_WAIT_TIME_SEC;
  const extraBlocks = Math.ceil(overtime / STOP_OVERTIME_THRESHOLD_SEC);
  return extraBlocks * STOP_WAIT_TIME_SEC;
}

/**
 * ============================================================================
 * MAIN: Calculate Customer ETA
 * ============================================================================
 *
 * For a specific customer's order, calculate how many minutes until delivery.
 *
 * @param {string} orderId - The order ID
 * @param {Object} driverLocation - { latitude, longitude } current driver position
 * @returns {Object} { etaMinutes, etaRangeMin, etaRangeMax, etaDetails }
 */
export async function calculateCustomerETA(orderId, driverLocation = null) {
  try {
    // 1. Get the delivery for this order
    const { data: delivery, error: dError } = await supabaseAdmin
      .from("deliveries")
      .select(
        `
        id,
        driver_id,
        status,
        accepted_at,
        picked_up_at,
        on_the_way_at,
        arrived_customer_at,
        current_latitude,
        current_longitude,
        last_location_update,
        delivery_sequence,
        orders (
          customer_id,
          restaurant_latitude,
          restaurant_longitude,
          delivery_latitude,
          delivery_longitude,
          restaurant_name,
          order_number
        )
      `,
      )
      .eq("order_id", orderId)
      .in("status", ["accepted", "picked_up", "on_the_way", "at_customer"])
      .maybeSingle();

    if (dError || !delivery) {
      return null; // No active delivery
    }

    // 2. Get driver's current location
    const driverLat =
      driverLocation?.latitude || parseFloat(delivery.current_latitude) || null;
    const driverLng =
      driverLocation?.longitude ||
      parseFloat(delivery.current_longitude) ||
      null;

    if (!driverLat || !driverLng) {
      return null; // Can't calculate without driver location
    }

    // SPECIAL CASE: on_the_way / at_customer → direct driver→customer OSRM time only
    // BUT ONLY if there are NO restaurant stops remaining (all pickups complete)
    if (delivery.status === "on_the_way" || delivery.status === "at_customer") {
      // First, get all stops to verify if this customer is the next immediate stop
      const allStopsPreCheck = await getDeliveryStopSequence(
        delivery.driver_id,
        {
          latitude: driverLat,
          longitude: driverLng,
        },
      );
      const targetStopPreCheck = allStopsPreCheck.find(
        (s) => s.order_id === orderId && s.stop_type === "customer",
      );
      const targetIdx = targetStopPreCheck
        ? allStopsPreCheck.indexOf(targetStopPreCheck)
        : -1;

      // Check if there are any restaurant stops before this customer
      const hasRestaurantStopsBefore =
        targetIdx > 0 &&
        allStopsPreCheck
          .slice(0, targetIdx)
          .some((s) => s.stop_type === "restaurant");

      // Only use direct calculation if:
      // 1. Customer is first stop (index 0) AND
      // 2. No restaurant stops remain before it
      const isFirstStop = targetIdx === 0;
      const canUseDirectRoute = isFirstStop && !hasRestaurantStopsBefore;

      if (canUseDirectRoute) {
        const customerLat = parseFloat(delivery.orders.delivery_latitude);
        const customerLng = parseFloat(delivery.orders.delivery_longitude);

        // Check if driver is within 50m of customer (overtime scenario)
        const isAtCustomer = isDriverAtStop(
          driverLat,
          driverLng,
          customerLat,
          customerLng,
        );
        let exactSeconds = 0;

        if (isAtCustomer && delivery.last_location_update) {
          // Driver is at customer location \u2014 delivery imminent (1-2 mins)
          // No overtime calculation for customer delivery (unlike restaurant wait)
          exactSeconds = 60; // 1 minute for delivery handoff
        } else {
          // Normal case: driver en route to customer
          const directTravel = await getOSRMDuration(
            driverLat,
            driverLng,
            customerLat,
            customerLng,
          );
          exactSeconds = directTravel.duration;
        }

        const exactMinutes = Math.max(1, Math.ceil(exactSeconds / 60));

        return {
          etaMinutes: exactMinutes,
          etaRangeMin: exactMinutes,
          etaRangeMax: exactMinutes, // Same — no range buffer
          etaDisplay: `${exactMinutes} min`,
          etaSeconds: Math.round(exactSeconds),
          segments: [
            {
              type: isAtCustomer ? "waiting" : "travel",
              from: "driver",
              to: "customer",
              duration_sec: Math.round(exactSeconds),
              distance_m: isAtCustomer ? 0 : null,
            },
          ],
          stopsBeforeCustomer: 0,
          driverStatus: delivery.status,
          isExact: true,
        };
      }
      // If NOT first stop, fall through to normal multi-stop calculation below
    }

    // 3. Get ALL stops for this driver (multi-delivery route with proximity detection)
    const allStops = await getDeliveryStopSequence(delivery.driver_id, {
      latitude: driverLat,
      longitude: driverLng,
    });

    if (!allStops.length) return null;

    // 4. Find the customer stop for THIS order
    const targetCustomerStop = allStops.find(
      (s) => s.order_id === orderId && s.stop_type === "customer",
    );

    if (!targetCustomerStop) return null;

    // 5. Find the index of the target customer stop
    const targetIdx = allStops.indexOf(targetCustomerStop);

    // 6. Calculate cumulative ETA from driver → through all stops → to this customer
    let totalETASeconds = 0;
    let prevLat = driverLat;
    let prevLng = driverLng;

    // CRITICAL FIX: If the first stop has arrived_at, use that stop's coordinates as starting point
    // This prevents GPS drift from causing ETA fluctuations when driver is waiting
    if (allStops.length > 0 && allStops[0].arrived_at) {
      prevLat = allStops[0].lat;
      prevLng = allStops[0].lng;
    }

    const segmentDetails = [];

    for (let i = 0; i <= targetIdx; i++) {
      const stop = allStops[i];

      // Travel time from previous point to this stop
      // If driver has already arrived at this stop, use 0 travel time (already there)
      let travelDuration = 0;
      let travelDistance = 0;

      if (stop.arrived_at) {
        // Driver is already at this stop - no travel time needed
        travelDuration = 0;
        travelDistance = 0;
      } else {
        // Driver hasn't arrived yet - calculate OSRM travel time
        const travel = await getOSRMDuration(
          prevLat,
          prevLng,
          stop.lat,
          stop.lng,
        );
        travelDuration = travel.duration;
        travelDistance = travel.distance;
      }

      totalETASeconds += travelDuration;

      segmentDetails.push({
        type: "travel",
        from: i === 0 ? "driver" : allStops[i - 1].stop_type,
        to: stop.stop_type,
        delivery_id: stop.delivery_id,
        order_number: stop.order_number,
        duration_sec: Math.round(travelDuration),
        distance_m: Math.round(travelDistance),
      });

      // Stop wait time (remaining from 5 min base + overtime if applicable)
      // Don't add wait time for the final customer stop (that's the destination)
      if (i < targetIdx) {
        // STRICT ALLOCATION: every pending intermediate stop contributes
        // a full 5-minute wait budget, then overtime blocks if stop exceeds 5 minutes.
        // We do NOT count down this wait while a stop is in progress.
        const overtime = stop.arrived_at
          ? getStopOvertimeSeconds(stop.arrived_at)
          : 0;
        const waitTime = STOP_WAIT_TIME_SEC + overtime;

        const elapsedWaitSec = stop.arrived_at
          ? Math.max(0, (new Date() - new Date(stop.arrived_at)) / 1000)
          : 0;

        totalETASeconds += waitTime;

        segmentDetails.push({
          type: "stop_wait",
          stop_type: stop.stop_type,
          delivery_id: stop.delivery_id,
          order_number: stop.order_number,
          base_wait_sec: STOP_WAIT_TIME_SEC,
          elapsed_wait_sec: Math.round(elapsedWaitSec),
          remaining_base_wait_sec: STOP_WAIT_TIME_SEC,
          overtime_sec: overtime,
          total_wait_sec: Math.round(waitTime),
        });
      }

      prevLat = stop.lat;
      prevLng = stop.lng;
    }

    const etaMinutes = Math.ceil(totalETASeconds / 60);
    const etaRangeMin = etaMinutes;
    const etaRangeMax = etaMinutes + ETA_RANGE_BUFFER_MIN;

    return {
      etaMinutes,
      etaRangeMin,
      etaRangeMax,
      etaDisplay: `${etaRangeMin} - ${etaRangeMax} min`,
      etaSeconds: Math.round(totalETASeconds),
      segments: segmentDetails,
      stopsBeforeCustomer: targetIdx,
      driverStatus: delivery.status,
      isExact: false,
    };
  } catch (e) {
    console.error("[ETA] calculateCustomerETA error:", e.message);
    return null;
  }
}

/**
 * ============================================================================
 * Calculate Driver ETA (travel time only, no stop waits)
 * ============================================================================
 *
 * For available deliveries: driver→restaurant + restaurant→customer
 * For active deliveries: driver→next stop
 *
 * @param {Object} params
 * @param {number} params.driverLat
 * @param {number} params.driverLng
 * @param {number} params.restaurantLat
 * @param {number} params.restaurantLng
 * @param {number} params.customerLat
 * @param {number} params.customerLng
 * @param {string} params.mode - 'available' | 'active_next_stop'
 * @param {number} [params.nextStopLat] - For active mode
 * @param {number} [params.nextStopLng] - For active mode
 * @returns {Object} { totalMinutes, driverToRestaurantMin, restaurantToCustomerMin }
 */
export async function calculateDriverETA(params) {
  const {
    driverLat,
    driverLng,
    restaurantLat,
    restaurantLng,
    customerLat,
    customerLng,
    mode = "available",
    nextStopLat,
    nextStopLng,
  } = params;

  try {
    if (mode === "active_next_stop" && nextStopLat && nextStopLng) {
      // Driver to next stop only
      const route = await getOSRMDuration(
        driverLat,
        driverLng,
        nextStopLat,
        nextStopLng,
      );
      return {
        totalMinutes: Math.ceil(route.duration / 60),
        totalSeconds: Math.round(route.duration),
        driverToNextStopMin: Math.ceil(route.duration / 60),
      };
    }

    // Available delivery mode: driver→restaurant + restaurant→customer
    const [dToR, rToC] = await Promise.all([
      getOSRMDuration(driverLat, driverLng, restaurantLat, restaurantLng),
      getOSRMDuration(restaurantLat, restaurantLng, customerLat, customerLng),
    ]);

    return {
      totalMinutes: Math.ceil((dToR.duration + rToC.duration) / 60),
      totalSeconds: Math.round(dToR.duration + rToC.duration),
      driverToRestaurantMin: Math.ceil(dToR.duration / 60),
      restaurantToCustomerMin: Math.ceil(rToC.duration / 60),
      driverToRestaurantSec: Math.round(dToR.duration),
      restaurantToCustomerSec: Math.round(rToC.duration),
    };
  } catch (e) {
    console.error("[ETA] calculateDriverETA error:", e.message);
    return { totalMinutes: 0, totalSeconds: 0 };
  }
}

/**
 * ============================================================================
 * Calculate extra time for additional delivery acceptance
 * ============================================================================
 *
 * When driver has active deliveries and a new one is available,
 * calculate extra time added by the new delivery.
 *
 * @param {string} driverId
 * @param {Object} newDelivery - { restaurantLat, restaurantLng, customerLat, customerLng }
 * @returns {Object} { extraMinutes, extraSeconds }
 */
export async function calculateExtraDeliveryTime(driverId, newDelivery) {
  try {
    const stops = await getDeliveryStopSequence(driverId);

    if (!stops.length) {
      // No current deliveries, just return standard time
      return { extraMinutes: 0, extraSeconds: 0 };
    }

    // The new stops would be appended after current last stop
    const lastStop = stops[stops.length - 1];

    // Calculate: lastStop → newRestaurant + newRestaurant → newCustomer + 5 min wait at restaurant
    const [toNewRes, newResToCus] = await Promise.all([
      getOSRMDuration(
        lastStop.lat,
        lastStop.lng,
        newDelivery.restaurantLat,
        newDelivery.restaurantLng,
      ),
      getOSRMDuration(
        newDelivery.restaurantLat,
        newDelivery.restaurantLng,
        newDelivery.customerLat,
        newDelivery.customerLng,
      ),
    ]);

    const extraSeconds =
      toNewRes.duration +
      STOP_WAIT_TIME_SEC +
      newResToCus.duration +
      STOP_WAIT_TIME_SEC;
    // +5min for new restaurant + 5min at new customer (for preceding customers' ETA)

    return {
      extraMinutes: Math.ceil(extraSeconds / 60),
      extraSeconds: Math.round(extraSeconds),
    };
  } catch (e) {
    console.error("[ETA] calculateExtraDeliveryTime error:", e.message);
    return { extraMinutes: 0, extraSeconds: 0 };
  }
}

/**
 * ============================================================================
 * Calculate ETA for ALL customers of a driver's active deliveries
 * ============================================================================
 *
 * Used to broadcast updated ETAs when driver status changes or moves.
 *
 * @param {string} driverId
 * @param {Object} driverLocation - { latitude, longitude }
 * @returns {Array} [{ customer_id, order_id, etaMinutes, etaRangeMin, etaRangeMax, etaDisplay }]
 */
export async function calculateAllCustomerETAs(driverId, driverLocation) {
  try {
    const stops = await getDeliveryStopSequence(driverId, driverLocation);
    if (!stops.length) return [];

    const driverLat = driverLocation.latitude;
    const driverLng = driverLocation.longitude;

    if (!driverLat || !driverLng) return [];

    const results = [];
    let prevLat = driverLat;
    let prevLng = driverLng;

    // CRITICAL FIX: If the first stop has arrived_at, use that stop's coordinates as starting point
    // This prevents GPS drift from causing ETA fluctuations when driver is waiting
    if (stops.length > 0 && stops[0].arrived_at) {
      prevLat = stops[0].lat;
      prevLng = stops[0].lng;
    }

    let cumulativeSeconds = 0;

    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];

      // Travel time from previous point
      // If driver has already arrived at this stop, use 0 travel time
      let travelDuration = 0;

      if (stop.arrived_at) {
        // Driver is already at this stop - no travel time
        travelDuration = 0;
      } else {
        // Driver hasn't arrived yet - calculate OSRM travel time
        const travel = await getOSRMDuration(
          prevLat,
          prevLng,
          stop.lat,
          stop.lng,
        );
        travelDuration = travel.duration;
      }

      cumulativeSeconds += travelDuration;

      // If this is a customer stop, record the ETA
      if (stop.stop_type === "customer") {
        // For on_the_way/at_customer: use direct driver→customer ONLY if:
        // 1. It's the first stop in sequence AND
        // 2. There are NO restaurant stops remaining (all pickups complete)
        const isOnTheWay =
          stop.delivery_status === "on_the_way" ||
          stop.delivery_status === "at_customer";
        const isFirstStop = i === 0;

        // Check if there are any restaurant stops before this customer
        const hasRestaurantStopsBefore = stops
          .slice(0, i)
          .some((s) => s.stop_type === "restaurant");

        // Only use direct route if: on_the_way AND first stop AND no restaurant stops before it
        if (isOnTheWay && isFirstStop && !hasRestaurantStopsBefore) {
          let exactSeconds = 0;
          // Check if driver is at customer (within 50m) — delivery imminent
          if (stop.is_driver_nearby && stop.arrived_at) {
            // Driver at customer location — just delivery handoff time (1 min)
            exactSeconds = 60;
          } else {
            const directTravel = await getOSRMDuration(
              driverLat,
              driverLng,
              stop.lat,
              stop.lng,
            );
            exactSeconds = directTravel.duration;
          }
          const exactMins = Math.max(1, Math.ceil(exactSeconds / 60));
          results.push({
            customer_id: stop.customer_id,
            order_id: stop.order_id,
            delivery_id: stop.delivery_id,
            order_number: stop.order_number,
            etaMinutes: exactMins,
            etaRangeMin: exactMins,
            etaRangeMax: exactMins, // No buffer for on_the_way
            etaDisplay: `${exactMins} min`,
            etaSeconds: Math.round(exactSeconds),
            driverStatus: stop.delivery_status,
            isExact: true,
          });
        } else {
          const etaMins = Math.ceil(cumulativeSeconds / 60);
          results.push({
            customer_id: stop.customer_id,
            order_id: stop.order_id,
            delivery_id: stop.delivery_id,
            order_number: stop.order_number,
            etaMinutes: etaMins,
            etaRangeMin: etaMins,
            etaRangeMax: etaMins + ETA_RANGE_BUFFER_MIN,
            etaDisplay: `${etaMins} - ${etaMins + ETA_RANGE_BUFFER_MIN} min`,
            etaSeconds: Math.round(cumulativeSeconds),
            driverStatus: stop.delivery_status,
            isExact: false,
          });
        }
      }

      // Add wait time for non-final stops (restaurant stops, intermediate customer stops)
      if (i < stops.length - 1) {
        // Keep all-customer ETA consistent with single-customer ETA:
        // full 5-minute wait per pending intermediate stop + overtime blocks.
        const overtime = stop.arrived_at
          ? getStopOvertimeSeconds(stop.arrived_at)
          : 0;
        const waitTime = STOP_WAIT_TIME_SEC + overtime;

        cumulativeSeconds += waitTime;
      }

      prevLat = stop.lat;
      prevLng = stop.lng;
    }

    return results;
  } catch (e) {
    console.error("[ETA] calculateAllCustomerETAs error:", e.message);
    return [];
  }
}

export default {
  calculateCustomerETA,
  calculateDriverETA,
  calculateExtraDeliveryTime,
  calculateAllCustomerETAs,
  STOP_WAIT_TIME_SEC,
  ETA_RANGE_BUFFER_MIN,
};
