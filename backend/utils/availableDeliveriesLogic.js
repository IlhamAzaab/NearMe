/**
 * ============================================================================
 * AVAILABLE DELIVERIES LOGIC - Route Extension Model
 * ============================================================================
 *
 * KEY RULE: Pick up ALL food from ALL restaurants FIRST, then deliver to ALL customers
 *
 * EXTRA DISTANCE CALCULATION:
 * 1. R0 = Current optimal route (Driver G�� All current Restaurants G�� All current Customers)
 * 2. R1 = COMBINED optimal route (Driver G�� All Restaurants including new G�� All Customers including new)
 * 3. Extra Distance = R1 - R0 (TRUE extra distance driver needs to travel)
 *
 * OPTIMIZATION:
 * - Restaurants: Nearest to driver first, then nearest to previous restaurant
 * - Customers: Nearest to last restaurant first, then nearest to previous customer
 *
 * This ensures we calculate the ACTUAL extra km the driver needs to travel
 * ============================================================================
 */

import { supabaseAdmin } from "../supabaseAdmin.js";
import { getDriverRouteContext } from "./driverRouteContext.js";
import { getOSRMRoute as calculateOSRMRoute } from "./osrmService.js";
import { getSystemConfig } from "./systemConfig.js";

// Default thresholds (fallback values G�� overridden by DB system_config)
const AVAILABLE_DELIVERY_THRESHOLDS = {
  MAX_EXTRA_TIME_MINUTES: 10,
  MAX_EXTRA_DISTANCE_KM: 3,
  MAX_ACTIVE_DELIVERIES: 5,
};

// Default driver earnings (fallback values G�� overridden by DB system_config)
const DRIVER_EARNINGS = {
  RATE_PER_KM: 40,
  RTC_RATE_BELOW_5KM: 40,
  RTC_RATE_ABOVE_5KM: 35,
  MAX_RESTAURANT_PROXIMITY_KM: 2,
  DELIVERY_BONUS: {
    SECOND_DELIVERY: 20,
    ADDITIONAL_DELIVERY: 30,
  },
};

/**
 * RTC-only distance calculation (Restaurant → Customer).
 */
async function getRestaurantToCustomerDistance(
  restaurantLocation,
  customerLocation,
  context = "",
) {
  console.log(
    `\n[RTC-DISTANCE] 🏪→🏠 Calculating Restaurant → Customer distance ${context ? `(${context})` : ""}`,
  );

  const restaurantToCustomerRoute = await getOSRMRoute(
    [restaurantLocation, customerLocation],
    "Restaurant → Customer",
  );

  const rtcDistanceKm = Number(restaurantToCustomerRoute.distance || 0) / 1000;
  const rtcDurationSeconds = Number(restaurantToCustomerRoute.duration || 0);

  console.log(
    `[RTC-DISTANCE]   📍 Restaurant → Customer: ${rtcDistanceKm.toFixed(3)} km`,
  );

  return {
    restaurantToCustomerDistance: restaurantToCustomerRoute.distance, // meters
    restaurantToCustomerDuration: rtcDurationSeconds, // seconds
    restaurantToCustomerKm: rtcDistanceKm,
    restaurantToCustomerGeometry: restaurantToCustomerRoute.geometry,
    restaurantToCustomerPolyline: restaurantToCustomerRoute.polyline,
    isUnavailable: Boolean(restaurantToCustomerRoute.isUnavailable),
  };
}

function calculateRTCEarnings(distanceKm, earningsConfig = DRIVER_EARNINGS) {
  const km = Math.max(0, Number(distanceKm) || 0);
  const belowRate = Number(
    earningsConfig?.RTC_RATE_BELOW_5KM ?? earningsConfig?.RATE_PER_KM ?? 40,
  );
  const aboveRate = Number(earningsConfig?.RTC_RATE_ABOVE_5KM ?? 35);

  if (km <= 5) {
    return km * belowRate;
  }

  return 5 * belowRate + (km - 5) * aboveRate;
}

// ============================================================================
// OSRM ROUTE CALCULATION (Using Public OSRM Server)
// ============================================================================
async function getOSRMRoute(waypoints, context = "", options = {}) {
  // Uses OSRM foot profile for shortest distance (suitable for motorcycles too)
  return await calculateOSRMRoute(waypoints, context, {
    useSingleMode: true,
    ...options,
  });
}

// ============================================================================
// HAVERSINE DISTANCE - FOR INTERNAL OPTIMIZATION ONLY
// ============================================================================
// Used ONLY for:
// 1. Internal route optimization algorithms (finding optimal delivery order)
// 2. Nearest-neighbor sorting within the algorithm
// 3. Restaurant proximity threshold checks (geometric, not route distance)
//
// NOT used for user-facing distance displays - those use OSRM via osrmService.
// ============================================================================
function haversineDistanceForOptimization(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
}

// Alias for backward compatibility within this file
const haversineDistance = haversineDistanceForOptimization;

// ============================================================================
// MINIMUM DISTANCE ROUTE OPTIMIZATION (for 3+ deliveries)
// ============================================================================

/**
 * Find the optimal delivery order that minimizes total route distance.
 *
 * Algorithm:
 * 1. For each customer, calculate how far they are from ALL restaurants
 * 2. Find the customer that is closest to restaurants overall (first delivery target)
 * 3. Order restaurants by: visit the restaurant whose customer we're going to first
 * 4. After first customer, find next nearest customer from current position
 *
 * This ensures we pick up food and deliver in an order that minimizes backtracking.
 *
 * @param {Object} driverLocation - {lat, lng, label}
 * @param {Array} deliveries - Array of {restaurant: {lat, lng, label}, customer: {lat, lng, label}}
 * @returns {Object} {orderedRestaurants: [], orderedCustomers: [], totalEstimatedDistance: number}
 */
function getMinimumDistanceDeliveryOrder(driverLocation, deliveries) {
  if (deliveries.length === 0) {
    return {
      orderedRestaurants: [],
      orderedCustomers: [],
      totalEstimatedDistance: 0,
    };
  }

  if (deliveries.length > 4) {
    return findOptimalOrderGreedy(driverLocation, deliveries);
  }

  const indices = deliveries.map((_, index) => index);
  const allPerms = [];
  const permute = (arr, start = 0) => {
    if (start === arr.length - 1) {
      allPerms.push([...arr]);
      return;
    }

    for (let i = start; i < arr.length; i++) {
      [arr[start], arr[i]] = [arr[i], arr[start]];
      permute(arr, start + 1);
      [arr[start], arr[i]] = [arr[i], arr[start]];
    }
  };
  permute(indices);

  let bestDistance = Infinity;
  let bestOrder = null;

  console.log(`[MIN-DISTANCE]   Testing ${allPerms.length} permutations...`);

  for (const perm of allPerms) {
    // For this customer order, determine restaurant order
    // Rule: Pick up from restaurant before we can deliver to its customer
    // So we need to pick up all restaurants whose customers come first

    // Greedy restaurant order: nearest to driver, then nearest to previous
    const customerOrder = perm.map((i) => deliveries[i].customer);

    // For restaurant order, we still use nearest-neighbor from driver
    // because we must pick up ALL restaurants before ANY delivery
    const restaurants = perm.map((i) => deliveries[i].restaurant);
    const restaurantOrder = getOptimizedRestaurantOrderStatic(
      driverLocation,
      restaurants,
    );

    // Calculate total estimated distance using haversine
    let totalDist = 0;
    let currentLat = driverLocation.lat;
    let currentLng = driverLocation.lng;

    // Driver G�� All Restaurants
    for (const r of restaurantOrder) {
      totalDist += haversineDistance(currentLat, currentLng, r.lat, r.lng);
      currentLat = r.lat;
      currentLng = r.lng;
    }

    // Last Restaurant G�� All Customers (in this permutation order)
    for (const c of customerOrder) {
      totalDist += haversineDistance(currentLat, currentLng, c.lat, c.lng);
      currentLat = c.lat;
      currentLng = c.lng;
    }

    if (totalDist < bestDistance) {
      bestDistance = totalDist;
      bestOrder = {
        customerIndices: perm,
        restaurantOrder: restaurantOrder,
        customerOrder: customerOrder,
      };
    }
  }

  console.log(
    `[MIN-DISTANCE]   Best estimated distance: ${(bestDistance / 1000).toFixed(3)} km`,
  );
  console.log(
    `[MIN-DISTANCE]   Best customer order: ${bestOrder.customerOrder.map((c) => c.label).join(" G�� ")}`,
  );
  console.log(
    `[MIN-DISTANCE]   Best restaurant order: ${bestOrder.restaurantOrder.map((r) => r.label).join(" G�� ")}`,
  );

  return {
    orderedRestaurants: bestOrder.restaurantOrder,
    orderedCustomers: bestOrder.customerOrder,
    totalEstimatedDistance: bestDistance,
  };
}

/**
 * Static version of getOptimizedRestaurantOrder (doesn't modify original array)
 */
function getOptimizedRestaurantOrderStatic(startLocation, restaurants) {
  if (restaurants.length <= 1) return [...restaurants];

  const optimized = [];
  const remaining = [...restaurants];

  let currentLat = startLocation.lat;
  let currentLng = startLocation.lng;

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = haversineDistance(
      currentLat,
      currentLng,
      remaining[0].lat,
      remaining[0].lng,
    );

    for (let i = 1; i < remaining.length; i++) {
      const dist = haversineDistance(
        currentLat,
        currentLng,
        remaining[i].lat,
        remaining[i].lng,
      );
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestIndex = i;
      }
    }

    const nearest = remaining.splice(nearestIndex, 1)[0];
    optimized.push(nearest);
    currentLat = nearest.lat;
    currentLng = nearest.lng;
  }

  return optimized;
}

/**
 * Greedy optimal ordering (for larger number of deliveries > 4)
 */
function findOptimalOrderGreedy(driverLocation, deliveries) {
  // Use standard nearest-neighbor for both restaurants and customers
  const restaurants = deliveries.map((d) => d.restaurant);
  const customers = deliveries.map((d) => d.customer);

  const orderedRestaurants = getOptimizedRestaurantOrderStatic(
    driverLocation,
    restaurants,
  );
  const lastRestaurant = orderedRestaurants[orderedRestaurants.length - 1];
  const orderedCustomers = getOptimizedCustomerOrderStatic(
    lastRestaurant,
    customers,
  );

  // Calculate estimated total distance
  let totalDist = 0;
  let currentLat = driverLocation.lat;
  let currentLng = driverLocation.lng;

  for (const r of orderedRestaurants) {
    totalDist += haversineDistance(currentLat, currentLng, r.lat, r.lng);
    currentLat = r.lat;
    currentLng = r.lng;
  }

  for (const c of orderedCustomers) {
    totalDist += haversineDistance(currentLat, currentLng, c.lat, c.lng);
    currentLat = c.lat;
    currentLng = c.lng;
  }

  console.log(
    `[MIN-DISTANCE]   Greedy estimated distance: ${(totalDist / 1000).toFixed(3)} km`,
  );

  return {
    orderedRestaurants,
    orderedCustomers,
    totalEstimatedDistance: totalDist,
  };
}

/**
 * Static version of getOptimizedCustomerOrder
 */
function getOptimizedCustomerOrderStatic(startLocation, customers) {
  if (customers.length <= 1) return [...customers];

  const optimized = [];
  const remaining = [...customers];

  let currentLat = startLocation.lat;
  let currentLng = startLocation.lng;

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = haversineDistance(
      currentLat,
      currentLng,
      remaining[0].lat,
      remaining[0].lng,
    );

    for (let i = 1; i < remaining.length; i++) {
      const dist = haversineDistance(
        currentLat,
        currentLng,
        remaining[i].lat,
        remaining[i].lng,
      );
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestIndex = i;
      }
    }

    const nearest = remaining.splice(nearestIndex, 1)[0];
    optimized.push(nearest);
    currentLat = nearest.lat;
    currentLng = nearest.lng;
  }

  return optimized;
}

// ============================================================================
// OPTIMIZED ORDER FUNCTIONS (for nearest-neighbor routing)
// ============================================================================

/**
 * Get optimized restaurant pickup order (nearest to driver first, then nearest to previous)
 * @param {Object} driverLocation - {lat, lng, label}
 * @param {Array} restaurants - Array of {lat, lng, label} objects
 * @returns {Array} Optimized order of restaurants
 */
function getOptimizedRestaurantOrder(driverLocation, restaurants) {
  if (restaurants.length <= 1) return restaurants;

  const optimized = [];
  const remaining = [...restaurants];

  // Start from driver location
  let currentLat = driverLocation.lat;
  let currentLng = driverLocation.lng;

  while (remaining.length > 0) {
    // Find nearest restaurant to current position
    let nearestIndex = 0;
    let nearestDistance = haversineDistance(
      currentLat,
      currentLng,
      remaining[0].lat,
      remaining[0].lng,
    );

    for (let i = 1; i < remaining.length; i++) {
      const dist = haversineDistance(
        currentLat,
        currentLng,
        remaining[i].lat,
        remaining[i].lng,
      );
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestIndex = i;
      }
    }

    // Move to nearest restaurant
    const nearest = remaining.splice(nearestIndex, 1)[0];
    optimized.push(nearest);
    currentLat = nearest.lat;
    currentLng = nearest.lng;
  }

  return optimized;
}

/**
 * Get optimized customer delivery order (nearest to last restaurant first, then nearest to previous)
 * @param {Object} lastRestaurant - Last restaurant location {lat, lng}
 * @param {Array} customers - Array of {lat, lng, label} objects
 * @returns {Array} Optimized order of customers
 */
function getOptimizedCustomerOrder(lastRestaurant, customers) {
  if (customers.length <= 1) return customers;

  const optimized = [];
  const remaining = [...customers];

  // Start from last restaurant location
  let currentLat = lastRestaurant.lat;
  let currentLng = lastRestaurant.lng;

  while (remaining.length > 0) {
    // Find nearest customer to current position
    let nearestIndex = 0;
    let nearestDistance = haversineDistance(
      currentLat,
      currentLng,
      remaining[0].lat,
      remaining[0].lng,
    );

    for (let i = 1; i < remaining.length; i++) {
      const dist = haversineDistance(
        currentLat,
        currentLng,
        remaining[i].lat,
        remaining[i].lng,
      );
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestIndex = i;
      }
    }

    // Move to nearest customer
    const nearest = remaining.splice(nearestIndex, 1)[0];
    optimized.push(nearest);
    currentLat = nearest.lat;
    currentLng = nearest.lng;
  }

  return optimized;
}

function buildDeliveriesFromStops(stops = []) {
  const deliveries = [];
  const processedIds = new Set();

  for (const stop of stops) {
    if (!stop?.delivery_id || processedIds.has(stop.delivery_id)) continue;

    const restaurantStop = stops.find(
      (s) => s.delivery_id === stop.delivery_id && s.stop_type === "restaurant",
    );
    const customerStop = stops.find(
      (s) => s.delivery_id === stop.delivery_id && s.stop_type === "customer",
    );

    if (!restaurantStop || !customerStop) continue;

    deliveries.push({
      id: stop.delivery_id,
      restaurant: {
        lat: restaurantStop.latitude,
        lng: restaurantStop.longitude,
        label: `R${deliveries.length + 1}`,
      },
      customer: {
        lat: customerStop.latitude,
        lng: customerStop.longitude,
        label: `C${deliveries.length + 1}`,
      },
    });

    processedIds.add(stop.delivery_id);
  }

  return deliveries;
}

async function sumRtcDistanceKm(deliveries, context = "") {
  let totalKm = 0;

  for (const delivery of deliveries) {
    const rtcResult = await getRestaurantToCustomerDistance(
      delivery.restaurant,
      delivery.customer,
      context,
    );
    totalKm += Number(rtcResult.restaurantToCustomerKm || 0);
  }

  if (context) {
    console.log(`[RTC-SUM] ${context}: ${totalKm.toFixed(3)} km`);
  }

  return totalKm;
}

// ============================================================================
// SEGMENT-BY-SEGMENT ROUTE DISTANCE CALCULATION (For Multi-Delivery)
// ============================================================================
/**
 * CORRECT MULTI-DELIVERY ROUTE DISTANCE CALCULATION
 * ==================================================
 * Calculates route distance by summing INDIVIDUAL segment OSRM calls.
 *
 * For 2nd delivery (1 existing + 1 new):
 *   R1 = DriverG��R1 + R1G��R2 + R2G��C1 + C1G��C2
 *
 * For 3rd delivery (2 existing + 1 new):
 *   R1 = DriverG��R1 + R1G��R2 + R2G��R3 + R3G��C1 + C1G��C2 + C2G��C3
 *
 * ORDERING RULES:
 * - Restaurants: Nearest to driver first, then nearest to previous restaurant
 * - Customers: Nearest to last restaurant first, then nearest to previous customer
 *
 * G�� NOT a single combined OSRM request
 * G�� Sum of individual segment OSRM calls for FAIR calculation
 */
async function calculateSegmentBySegmentRouteDistance(
  driverLocation,
  restaurants, // Array of {lat, lng, label}
  customers, // Array of {lat, lng, label}
  context = "",
) {
  if (restaurants.length === 0 || customers.length === 0) {
    return { totalDistance: 0, totalDuration: 0, segments: [] };
  }

  console.log(
    `\n[SEGMENT-ROUTE] =��� Calculating segment-by-segment distance ${context ? `(${context})` : ""}`,
  );
  console.log(
    `[SEGMENT-ROUTE]   Restaurants: ${restaurants.length}, Customers: ${customers.length}`,
  );

  // Build deliveries array linking each restaurant to its customer
  // Assumes restaurants[i] corresponds to customers[i]
  const deliveries = restaurants.map((restaurant, idx) => ({
    restaurant,
    customer: customers[idx],
  }));

  // Use minimum distance optimization for 2+ deliveries
  // This tries all permutations for small numbers and picks the shortest total route
  let optimizedRestaurants, optimizedCustomers;

  if (restaurants.length >= 2) {
    // Use brute-force/greedy optimization to find minimum total distance
    const optimized = getMinimumDistanceDeliveryOrder(
      driverLocation,
      deliveries,
    );
    optimizedRestaurants = optimized.orderedRestaurants;
    optimizedCustomers = optimized.orderedCustomers;
    console.log(`[SEGMENT-ROUTE]   =�Ļ Using MINIMUM DISTANCE optimization`);
  } else {
    // For single delivery, just use as-is
    optimizedRestaurants = restaurants;
    optimizedCustomers = customers;
  }

  // Build the complete waypoint sequence
  const waypoints = [
    driverLocation,
    ...optimizedRestaurants,
    ...optimizedCustomers,
  ];

  console.log(`[SEGMENT-ROUTE]   Optimized route order:`);
  waypoints.forEach((wp, i) => {
    console.log(
      `[SEGMENT-ROUTE]     ${i}: ${wp.label} (${wp.lat.toFixed(6)}, ${wp.lng.toFixed(6)})`,
    );
  });

  // Calculate each segment separately
  let totalDistance = 0;
  let totalDuration = 0;
  const segments = [];
  let hasUnavailableSegments = false;
  let routeProfileLock = "foot";

  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];
    const samePointDistanceMeters = haversineDistance(
      from.lat,
      from.lng,
      to.lat,
      to.lng,
    );
    const isSamePointSegment = samePointDistanceMeters < 50;

    const segmentRoute = await getOSRMRoute(
      [from, to],
      `${from.label} G�� ${to.label}`,
      {
        preferredProfile: routeProfileLock,
        fallbackProfiles:
          routeProfileLock === "foot"
            ? ["bike", "driving"]
            : routeProfileLock === "bike"
              ? ["driving"]
              : [],
      },
    );

    if (
      segmentRoute?.profileUsed &&
      segmentRoute.profileUsed !== routeProfileLock
    ) {
      console.log(
        `[SEGMENT-ROUTE] =��� Profile fallback locked to ${segmentRoute.profileUsed.toUpperCase()} for remaining segments`,
      );
      routeProfileLock = segmentRoute.profileUsed;
    }

    let segmentDistance = Number(segmentRoute?.distance);
    let segmentDuration = Number(segmentRoute?.duration);

    if (
      !Number.isFinite(segmentDistance) ||
      segmentDistance < 0 ||
      !Number.isFinite(segmentDuration) ||
      segmentDuration < 0
    ) {
      const retriedRoute = await getOSRMRoute(
        [from, to],
        `${from.label} G�� ${to.label} (forced retry)`,
        {
          preferredProfile: routeProfileLock,
          fallbackProfiles:
            routeProfileLock === "foot"
              ? ["bike", "driving"]
              : routeProfileLock === "bike"
                ? ["driving"]
                : [],
          forceRetry: true,
          allowStaleCache: true,
        },
      );

      if (
        retriedRoute?.profileUsed &&
        retriedRoute.profileUsed !== routeProfileLock
      ) {
        console.log(
          `[SEGMENT-ROUTE] =��� Forced-retry profile locked to ${retriedRoute.profileUsed.toUpperCase()} for remaining segments`,
        );
        routeProfileLock = retriedRoute.profileUsed;
      }

      segmentDistance = Number(retriedRoute?.distance);
      segmentDuration = Number(retriedRoute?.duration);

      if (
        !Number.isFinite(segmentDistance) ||
        segmentDistance < 0 ||
        !Number.isFinite(segmentDuration) ||
        segmentDuration < 0
      ) {
        throw new Error(
          `OSRM unavailable for segment ${from.label} -> ${to.label}`,
        );
      }

      hasUnavailableSegments = Boolean(retriedRoute?.isUnavailable);
      console.warn(
        `[SEGMENT-ROUTE] G��n+� OSRM live route unavailable for ${from.label} G�� ${to.label}; recovered via forced retry/cache ${(segmentDistance / 1000).toFixed(3)} km`,
      );
    }

    // Same-location segments are valid and should not break route evaluation.
    if (isSamePointSegment && segmentDistance === 0) {
      segmentDuration = 0;
    }

    const segmentDistanceKm = segmentDistance / 1000;
    totalDistance += segmentDistance;
    totalDuration += segmentDuration;

    segments.push({
      from: from.label,
      to: to.label,
      distance: segmentDistance,
      distanceKm: segmentDistanceKm,
      duration: segmentDuration,
      osrm_unavailable: Boolean(segmentRoute?.isUnavailable),
    });

    console.log(
      `[SEGMENT-ROUTE]     ${from.label} G�� ${to.label}: ${segmentDistanceKm.toFixed(3)} km`,
    );
  }

  const totalDistanceKm = totalDistance / 1000;
  console.log(
    `[SEGMENT-ROUTE]   G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��`,
  );
  console.log(
    `[SEGMENT-ROUTE]   =�Ʀ TOTAL DISTANCE (sum of segments): ${totalDistanceKm.toFixed(3)} km`,
  );
  console.log(
    `[SEGMENT-ROUTE]   GŦn+�  TOTAL DURATION: ${Math.ceil(totalDuration / 60)} mins`,
  );

  return {
    totalDistance, // meters
    totalDuration, // seconds
    totalDistanceKm,
    totalDurationMins: Math.ceil(totalDuration / 60),
    segments,
    optimizedRestaurants,
    optimizedCustomers,
    hasUnavailableSegments,
  };
}

// ============================================================================
// LEGACY: RETURN-VIA-SAME-PATH ALGORITHM (for map display only, NOT earnings)
// ============================================================================
/**
 * Creates complete optimized route: Driver G�� Restaurant G�� Customer
 * Accounts for overlapping road segments to minimize total distance
 */
async function getCompleteOptimizedRoute(
  driverLocation,
  restaurantLocation,
  customerLocation,
  context = "",
) {
  console.log(
    `\n[COMPLETE-ROUTE] =�Ļ Building complete optimized route ${context ? `(${context})` : ""}`,
  );

  // Step 1: Get driver-to-restaurant route
  const driverToRestaurantRoute = await getOSRMRoute(
    [driverLocation, restaurantLocation],
    "Driver to Restaurant",
  );
  console.log(
    `[COMPLETE-ROUTE] G�� Driver to Restaurant: ${(driverToRestaurantRoute.distance / 1000).toFixed(3)} km`,
  );

  // Step 2: Calculate restaurant-to-customer options and find best
  console.log(
    `[COMPLETE-ROUTE] G�� Evaluating restaurant-to-customer options:`,
  );

  // Option 1: Direct restaurant to customer
  const directRoute = await getOSRMRoute(
    [restaurantLocation, customerLocation],
    "Direct Restaurant to Customer",
  );
  console.log(
    `[COMPLETE-ROUTE]   Option 1 (Direct): ${(directRoute.distance / 1000).toFixed(3)} km`,
  );

  // Option 2: Restaurant G�� Driver location G�� Customer (return via same path)
  const returnViaDriverRoute = await getOSRMRoute(
    [restaurantLocation, driverLocation, customerLocation],
    "Restaurant G�� Driver G�� Customer",
  );
  console.log(
    `[COMPLETE-ROUTE]   Option 2 (Return via driver): ${(returnViaDriverRoute.distance / 1000).toFixed(3)} km`,
  );

  // Find best restaurant-to-customer route
  const bestRestaurantToCustomer =
    directRoute.distance <= returnViaDriverRoute.distance
      ? { route: directRoute, option: "Direct" }
      : { route: returnViaDriverRoute, option: "Return via driver location" };

  console.log(
    `[COMPLETE-ROUTE] G�� Best restaurant-to-customer: ${bestRestaurantToCustomer.option} (${(bestRestaurantToCustomer.route.distance / 1000).toFixed(3)} km)`,
  );

  // Step 3: Create complete route by combining segments
  const totalDistance =
    driverToRestaurantRoute.distance + bestRestaurantToCustomer.route.distance;
  const totalDuration =
    driverToRestaurantRoute.duration + bestRestaurantToCustomer.route.duration;

  // Combine road segments
  const combinedRoadSegments = [
    ...(driverToRestaurantRoute.roadSegments || []),
    ...(bestRestaurantToCustomer.route.roadSegments || []),
  ];

  // Calculate potential overlap savings when return via driver path is used
  let overlapSavings = 0;
  if (bestRestaurantToCustomer.option === "Return via driver location") {
    // When returning via driver location, we can save distance on overlapping segments
    const directDistance = directRoute.distance;
    const returnDistance = bestRestaurantToCustomer.route.distance;
    const driverToRestaurantDistance = driverToRestaurantRoute.distance;

    // If return route is shorter than (direct + driver-to-restaurant), we have overlap savings
    if (returnDistance < directDistance + driverToRestaurantDistance) {
      overlapSavings =
        directDistance + driverToRestaurantDistance - returnDistance;
    }
  }

  console.log(`[COMPLETE-ROUTE] G�� Complete route breakdown:`);
  console.log(
    `[COMPLETE-ROUTE]   G�� Driver to Restaurant: ${(driverToRestaurantRoute.distance / 1000).toFixed(3)} km`,
  );
  console.log(
    `[COMPLETE-ROUTE]   G�� Restaurant to Customer: ${(bestRestaurantToCustomer.route.distance / 1000).toFixed(3)} km (${bestRestaurantToCustomer.option})`,
  );
  if (overlapSavings > 0) {
    console.log(
      `[COMPLETE-ROUTE]   G�� Overlap Savings: ${(overlapSavings / 1000).toFixed(3)} km =�Ļ`,
    );
    console.log(
      `[COMPLETE-ROUTE]   G�� ROUTE OPTIMIZED! Driver returns via same path`,
    );
  }
  console.log(
    `[COMPLETE-ROUTE] G�� Total Distance: ${(totalDistance / 1000).toFixed(3)} km`,
  );

  return {
    distance: totalDistance,
    duration: totalDuration,
    driverToRestaurantGeometry: driverToRestaurantRoute.geometry,
    restaurantToCustomerGeometry: bestRestaurantToCustomer.route.geometry,
    driverToRestaurantPolyline: driverToRestaurantRoute.polyline, // Google Maps encoded polyline
    restaurantToCustomerPolyline: bestRestaurantToCustomer.route.polyline, // Google Maps encoded polyline
    roadSegments: combinedRoadSegments,
    driverToRestaurantDistance: driverToRestaurantRoute.distance,
    restaurantToCustomerDistance: bestRestaurantToCustomer.route.distance,
    selectedOption: bestRestaurantToCustomer.option,
    overlapSavings: overlapSavings,
    isOptimized: bestRestaurantToCustomer.option !== "Direct",
  };
}

// ============================================================================
// CREATE MICRO-SEGMENT KEY (for coordinate pairs)
// ============================================================================
function createMicroSegmentKey(coord1, coord2) {
  // Round to 4 decimal places (~11 meters tolerance for matching)
  // Use both directions since roads can be traveled both ways
  const lng1 = coord1[0].toFixed(4);
  const lat1 = coord1[1].toFixed(4);
  const lng2 = coord2[0].toFixed(4);
  const lat2 = coord2[1].toFixed(4);

  // Normalize direction (always use smaller coordinate first for consistent key)
  if (lng1 < lng2 || (lng1 === lng2 && lat1 < lat2)) {
    return `${lng1},${lat1}G��${lng2},${lat2}`;
  } else {
    return `${lng2},${lat2}G��${lng1},${lat1}`;
  }
}

// ============================================================================
// EXTRACT ALL MICRO-SEGMENTS FROM OSRM ROUTE
// Break each road segment into coordinate-by-coordinate pieces
// ============================================================================
function extractMicroSegments(roadSegments) {
  const microSegments = [];

  for (const segment of roadSegments) {
    if (!segment.coordinates || segment.coordinates.length < 2) continue;

    // Break this segment into micro-segments (between each pair of consecutive coordinates)
    for (let i = 0; i < segment.coordinates.length - 1; i++) {
      const coord1 = segment.coordinates[i];
      const coord2 = segment.coordinates[i + 1];

      // Calculate distance of this micro-segment
      const distance = haversineDistance(
        coord1[1],
        coord1[0],
        coord2[1],
        coord2[0],
      );

      // Create a unique key for this micro-segment
      const key = createMicroSegmentKey(coord1, coord2);

      microSegments.push({
        key,
        coord1,
        coord2,
        distance,
        roadName: segment.name || "unnamed",
        parentSegmentIdx: segment.stepIdx,
      });
    }
  }

  return microSegments;
}

// ============================================================================
// FIND COMMON ROAD SEGMENTS BETWEEN TWO ROUTES (MICRO-SEGMENT MATCHING)
// ============================================================================
function findCommonRoadSegments(r0Segments, r1Segments) {
  console.log(
    `\n[COMMON SEGMENTS] =��� Finding common road segments (micro-segment matching)`,
  );
  console.log(`[COMMON SEGMENTS]   R0 has ${r0Segments.length} OSRM steps`);
  console.log(`[COMMON SEGMENTS]   R1 has ${r1Segments.length} OSRM steps`);

  // Step 1: Extract all micro-segments from both routes
  const r0MicroSegments = extractMicroSegments(r0Segments);
  const r1MicroSegments = extractMicroSegments(r1Segments);

  console.log(
    `[COMMON SEGMENTS]   R0 micro-segments: ${r0MicroSegments.length}`,
  );
  console.log(
    `[COMMON SEGMENTS]   R1 micro-segments: ${r1MicroSegments.length}`,
  );

  // Step 2: Create a Set of R0 micro-segment keys for fast lookup
  const r0KeySet = new Set();
  r0MicroSegments.forEach((ms) => r0KeySet.add(ms.key));

  // Log R0 road segments summary
  console.log(`\n[COMMON SEGMENTS]   R0 roads breakdown:`);
  const r0RoadSummary = new Map();
  r0MicroSegments.forEach((ms) => {
    if (!r0RoadSummary.has(ms.roadName)) {
      r0RoadSummary.set(ms.roadName, { count: 0, distance: 0 });
    }
    const entry = r0RoadSummary.get(ms.roadName);
    entry.count++;
    entry.distance += ms.distance;
  });
  r0RoadSummary.forEach((val, roadName) => {
    console.log(
      `[COMMON SEGMENTS]     - ${roadName}: ${val.count} micro-segs, ${(val.distance / 1000).toFixed(3)} km`,
    );
  });

  // Step 3: Check each R1 micro-segment against R0
  let commonDistance = 0;
  let uniqueDistance = 0;
  const commonMicroSegments = [];
  const uniqueMicroSegments = [];

  console.log(`\n[COMMON SEGMENTS]   Analyzing R1 micro-segments against R0:`);

  // Group by road name for logging
  const r1RoadAnalysis = new Map();

  r1MicroSegments.forEach((ms) => {
    const isCommon = r0KeySet.has(ms.key);

    if (!r1RoadAnalysis.has(ms.roadName)) {
      r1RoadAnalysis.set(ms.roadName, {
        common: 0,
        unique: 0,
        commonDist: 0,
        uniqueDist: 0,
      });
    }
    const analysis = r1RoadAnalysis.get(ms.roadName);

    if (isCommon) {
      commonMicroSegments.push(ms);
      commonDistance += ms.distance;
      analysis.common++;
      analysis.commonDist += ms.distance;
    } else {
      uniqueMicroSegments.push(ms);
      uniqueDistance += ms.distance;
      analysis.unique++;
      analysis.uniqueDist += ms.distance;
    }
  });

  // Log detailed road-by-road analysis
  r1RoadAnalysis.forEach((val, roadName) => {
    const totalSegs = val.common + val.unique;
    const totalDist = val.commonDist + val.uniqueDist;
    if (val.common > 0 && val.unique > 0) {
      console.log(
        `[COMMON SEGMENTS]     =��� ${roadName}: ${totalSegs} micro-segs (${(totalDist / 1000).toFixed(3)} km)`,
      );
      console.log(
        `[COMMON SEGMENTS]        G�� COMMON: ${val.common} segs (${(val.commonDist / 1000).toFixed(3)} km)`,
      );
      console.log(
        `[COMMON SEGMENTS]        G�� UNIQUE: ${val.unique} segs (${(val.uniqueDist / 1000).toFixed(3)} km)`,
      );
    } else if (val.common > 0) {
      console.log(
        `[COMMON SEGMENTS]     G�� COMMON: ${roadName} - ${val.common} micro-segs (${(val.commonDist / 1000).toFixed(3)} km)`,
      );
    } else {
      console.log(
        `[COMMON SEGMENTS]     G�� UNIQUE: ${roadName} - ${val.unique} micro-segs (${(val.uniqueDist / 1000).toFixed(3)} km)`,
      );
    }
  });

  console.log(
    `\n[COMMON SEGMENTS]   G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��`,
  );
  console.log(`[COMMON SEGMENTS]   =��� SUMMARY:`);
  console.log(
    `[COMMON SEGMENTS]     - Common micro-segments: ${commonMicroSegments.length} (${(commonDistance / 1000).toFixed(3)} km)`,
  );
  console.log(
    `[COMMON SEGMENTS]     - Unique micro-segments: ${uniqueMicroSegments.length} (${(uniqueDistance / 1000).toFixed(3)} km)`,
  );
  console.log(
    `[COMMON SEGMENTS]   G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��`,
  );

  return {
    commonDistance,
    uniqueDistance,
    commonSegments: commonMicroSegments,
    uniqueSegments: uniqueMicroSegments,
  };
}

// ============================================================================
// FIND OPTIMAL ORDER FOR PICKUP/DELIVERY (Nearest Neighbor)
// ============================================================================
async function findOptimalOrderOSRM(startPoint, points) {
  if (points.length === 0) return [];
  if (points.length === 1) return [points[0]];

  const result = [];
  const remaining = [...points];
  let current = startPoint;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;

    // For small number of points, we can check each one
    for (let i = 0; i < remaining.length; i++) {
      try {
        const route = await getOSRMRoute(
          [current, remaining[i]],
          `finding nearest to ${current.label || "current"}`,
        );
        if (route.distance < nearestDist) {
          nearestDist = route.distance;
          nearestIdx = i;
        }
      } catch (e) {
        console.warn(`[OPTIMAL ORDER] Failed to get distance: ${e.message}`);
      }
    }

    const nearest = remaining.splice(nearestIdx, 1)[0];
    result.push(nearest);
    current = nearest;
  }

  return result;
}

// ============================================================================
// MULTI-STOP ROUTING WITH OSRM
// ============================================================================
/**
 * Calculate route distance for a sequence of waypoints
 * Used to evaluate both current route and simulated route
 *
 * Example:
 *   waypoints = [
 *     { lat: 8.5, lng: 81.1 }, // Driver location
 *     { lat: 8.51, lng: 81.11 }, // Restaurant A
 *     { lat: 8.52, lng: 81.12 }, // Customer A
 *     { lat: 8.53, lng: 81.13 }, // Restaurant B
 *     { lat: 8.54, lng: 81.14 }, // Customer B
 *   ]
 */
async function calculateMultiStopRoute(waypoints, context = "") {
  console.log(
    `\n[MULTI-STOP ROUTE] =���n+� Calculating route for ${waypoints.length} waypoints${context ? ` (${context})` : ""}`,
  );

  try {
    if (!waypoints || waypoints.length < 2) {
      throw new Error("Need at least 2 waypoints for routing");
    }

    // Format for OSRM: lng,lat;lng,lat;lng,lat...
    const coordinates = waypoints.map((wp) => `${wp.lng},${wp.lat}`).join(";");

    console.log(`[MULTI-STOP ROUTE] G�� Waypoints: ${waypoints.length} stops`);
    waypoints.forEach((wp, idx) => {
      console.log(
        `[MULTI-STOP ROUTE]   ${idx}: (${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)})`,
      );
    });

    // Use public OSRM service with FOOT profile for shortest routes (motorcycles can use walking paths in town)
    const url = `https://router.project-osrm.org/route/v1/foot/${coordinates}?overview=full&geometries=geojson&alternatives=true`;

    console.log(`[MULTI-STOP ROUTE] G�� Requesting OSRM...`);
    console.log(`[MULTI-STOP ROUTE] G�� URL: ${url}`);

    const response = await fetch(url);

    // Check if response is valid before parsing JSON
    if (!response.ok) {
      const text = await response.text();
      console.error(
        `[MULTI-STOP ROUTE] G�� HTTP ${response.status}: ${text.substring(0, 100)}`,
      );
      throw new Error(`OSRM HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!response.ok || data.code !== "Ok") {
      console.error(
        `[MULTI-STOP ROUTE] G�� OSRM error: ${data.code} - ${data.message}`,
      );
      throw new Error(`OSRM error: ${data.code}`);
    }

    // Select the shortest route from alternatives for multi-stop routing
    let selectedRoute = data.routes[0]; // Default to first route
    if (data.routes && data.routes.length > 1) {
      // Find the route with minimum distance
      selectedRoute = data.routes.reduce((shortest, current) =>
        current.distance < shortest.distance ? current : shortest,
      );
      console.log(
        `[MULTI-STOP ROUTE] =�Ļ Selected shortest route: ${(selectedRoute.distance / 1000).toFixed(3)} km from ${data.routes.length} alternatives`,
      );
    }

    const route = selectedRoute;
    const totalDistance = route.distance; // meters
    const totalDuration = route.duration; // seconds

    console.log(
      `[MULTI-STOP ROUTE] G�� Distance: ${(totalDistance / 1000).toFixed(2)} km`,
    );
    console.log(
      `[MULTI-STOP ROUTE] G�� Duration: ${Math.ceil(totalDuration / 60)} mins`,
    );

    return {
      distance: totalDistance,
      duration: totalDuration,
      geometry: route.geometry,
    };
  } catch (error) {
    console.error(`[MULTI-STOP ROUTE] G�� Error: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// EVALUATE AVAILABLE DELIVERY (CORRECT ALGORITHM)
// ============================================================================
/**
 * CORRECT ALGORITHM:
 * 1. R0 = Current optimal route (Driver G�� All Restaurants G�� All Customers) using OSRM
 * 2. R1 = New delivery's SINGLE route (Driver G�� New Restaurant G�� New Customer) using OSRM
 * 3. Find common ROAD segments between R0 and R1 using OSRM geometry
 * 4. Extra Distance = R1 - (common road segments)
 *
 * This gives the TRUE extra distance: only road segments the driver hasn't already traveled.
 */
async function evaluateAvailableDelivery(
  driverId,
  deliveryId,
  availableDelivery,
  routeContext,
  getRouteDistance,
) {
  return evaluateAvailableDeliveryOptimized(
    driverId,
    deliveryId,
    availableDelivery,
    routeContext,
    getRouteDistance,
    null,
  );
}

// ============================================================================
// OPTIMIZED EVALUATE AVAILABLE DELIVERY (FAST - Uses Pre-calculated R0)
// ============================================================================
/**
 * OPTIMIZED VERSION - Accepts pre-calculated R0 to avoid redundant OSRM calls
 * This function only calculates R1 (the combined route with new delivery)
 *
 * Performance improvement: From 2 OSRM calls per delivery to 1 OSRM call per delivery
 */
async function evaluateAvailableDeliveryOptimized(
  driverId,
  deliveryId,
  availableDelivery,
  routeContext,
  getRouteDistance,
  preCalculatedR0 = null, // Pre-calculated R0 route (distance/duration)
) {
  const orderNumber = availableDelivery.orders?.order_number || deliveryId;

  try {
    const activeDeliveryCount = routeContext.total_stops / 2;
    if (
      activeDeliveryCount >= AVAILABLE_DELIVERY_THRESHOLDS.MAX_ACTIVE_DELIVERIES
    ) {
      return {
        delivery_id: deliveryId,
        can_accept: false,
        reason: "Driver has maximum active deliveries",
      };
    }

    const newRestaurant = {
      lat: parseFloat(availableDelivery.orders.restaurant_latitude),
      lng: parseFloat(availableDelivery.orders.restaurant_longitude),
      label: "New Restaurant",
    };
    const newCustomer = {
      lat: parseFloat(availableDelivery.orders.delivery_latitude),
      lng: parseFloat(availableDelivery.orders.delivery_longitude),
      label: "New Customer",
    };

    const currentDeliveries = buildDeliveriesFromStops(routeContext.stops);

    if (activeDeliveryCount > 0) {
      let isWithinProximity = false;
      let closestRestaurantDistance = Infinity;

      for (const delivery of currentDeliveries) {
        const distanceMeters = haversineDistance(
          newRestaurant.lat,
          newRestaurant.lng,
          delivery.restaurant.lat,
          delivery.restaurant.lng,
        );
        const distanceKm = distanceMeters / 1000;

        if (distanceKm <= DRIVER_EARNINGS.MAX_RESTAURANT_PROXIMITY_KM) {
          isWithinProximity = true;
        }

        if (distanceKm < closestRestaurantDistance) {
          closestRestaurantDistance = distanceKm;
        }
      }

      if (!isWithinProximity) {
        return {
          delivery_id: deliveryId,
          can_accept: false,
          reason: `New restaurant too far from existing restaurants (closest: ${closestRestaurantDistance.toFixed(3)}km, max: ${DRIVER_EARNINGS.MAX_RESTAURANT_PROXIMITY_KM}km)`,
        };
      }
    }

    const rtcResult = await getRestaurantToCustomerDistance(
      newRestaurant,
      newCustomer,
      `RTC ${orderNumber}`,
    );

    const rtcDistanceKm = Math.max(
      0,
      Number(rtcResult.restaurantToCustomerKm) || 0,
    );

    const r0DistanceKm = preCalculatedR0?.distanceKm
      ? Number(preCalculatedR0.distanceKm)
      : await sumRtcDistanceKm(currentDeliveries, "R0 RTC Sum");

    const r1DistanceKm = r0DistanceKm + rtcDistanceKm;
    const extraDistanceKm = Math.max(0, r1DistanceKm - r0DistanceKm);
    const extraTimeMinutes = Math.max(
      0,
      Math.ceil((Number(rtcResult.restaurantToCustomerDuration) || 0) / 60),
    );

    const isFirstDelivery = activeDeliveryCount === 0;
    const baseAmount = isFirstDelivery
      ? calculateRTCEarnings(rtcDistanceKm)
      : 0;
    const extraEarnings = isFirstDelivery
      ? 0
      : calculateRTCEarnings(extraDistanceKm);

    let bonusAmount = 0;
    if (!isFirstDelivery) {
      if (activeDeliveryCount === 1) {
        bonusAmount = DRIVER_EARNINGS.DELIVERY_BONUS.SECOND_DELIVERY;
      } else if (activeDeliveryCount >= 2) {
        bonusAmount = DRIVER_EARNINGS.DELIVERY_BONUS.ADDITIONAL_DELIVERY;
      }
    }

    const totalTripEarnings = baseAmount + extraEarnings + bonusAmount;
    const thisDeliveryEarnings = isFirstDelivery
      ? baseAmount
      : extraEarnings + bonusAmount;

    return {
      delivery_id: deliveryId,
      can_accept: true,
      extra_distance_km: parseFloat(Math.max(0, extraDistanceKm).toFixed(2)),
      extra_time_minutes: parseFloat(extraTimeMinutes.toFixed(1)),
      base_amount: parseFloat(baseAmount.toFixed(2)),
      extra_earnings: parseFloat(extraEarnings.toFixed(2)),
      bonus_amount: parseFloat(bonusAmount.toFixed(2)),
      this_delivery_earnings: parseFloat(thisDeliveryEarnings.toFixed(2)),
      total_trip_earnings: parseFloat(totalTripEarnings.toFixed(2)),
      cumulative_previous_earnings: null,
      total_combined_distance_km: parseFloat(r1DistanceKm.toFixed(2)),
      estimated_time_minutes: extraTimeMinutes,
      r0_distance_km: parseFloat(r0DistanceKm.toFixed(2)),
      r1_distance_km: parseFloat(r1DistanceKm.toFixed(2)),
      extra_calculation_method: isFirstDelivery
        ? "FIRST_DELIVERY (RTC only)"
        : "R1 - R0 (RTC only)",
      restaurant_to_customer_route: {
        coordinates:
          rtcResult.restaurantToCustomerGeometry?.coordinates || null,
        encoded_polyline: rtcResult.restaurantToCustomerPolyline || null,
      },
      restaurant_to_customer_km: parseFloat(rtcDistanceKm.toFixed(3)),
      is_first_delivery: isFirstDelivery,
      route_unavailable: Boolean(rtcResult.isUnavailable),
    };
  } catch (error) {
    console.error(
      `[EVALUATE-OPTIMIZED] ? Error for order ${orderNumber}: ${error.message}`,
    );
    return {
      delivery_id: deliveryId,
      can_accept: false,
      reason: `Evaluation error: ${error.message}`,
    };
  }
}

// ============================================================================
// GET AVAILABLE DELIVERIES FOR DRIVER (MAIN ENDPOINT)
// ============================================================================
export async function getAvailableDeliveriesForDriver(
  driverId,
  driverLatitude,
  driverLongitude,
  getRouteDistance, // OSRM helper function
  options = {},
) {
  console.log(`\n\n${"=".repeat(80)}`);
  console.log(
    `[AVAILABLE DELIVERIES] =��� Processing available deliveries for driver`,
  );
  console.log(`${"=".repeat(80)}`);

  try {
    const trigger = options?.trigger || {};
    const triggerReason = String(trigger.reason || "manual");
    const forceRecalculateAll = Boolean(trigger.forceRecalculateAll);
    const pendingSignature = String(trigger.pendingSignature || "");
    const activeSignature = String(trigger.activeSignature || "");

    // Load live config from DB (cached, refreshes every 60s)
    const { thresholds: liveThresholds, earnings: liveEarnings } =
      await loadConfigConstants();
    // Update module-level constants so all evaluate functions use DB values
    Object.assign(AVAILABLE_DELIVERY_THRESHOLDS, liveThresholds);
    Object.assign(DRIVER_EARNINGS, liveEarnings);
    // Also update nested DELIVERY_BONUS
    Object.assign(DRIVER_EARNINGS.DELIVERY_BONUS, liveEarnings.DELIVERY_BONUS);
    console.log(
      `[AVAILABLE DELIVERIES] G��n+�  Config loaded: RATE_PER_KM=${DRIVER_EARNINGS.RATE_PER_KM}, RTC_RATE_BELOW_5KM=${DRIVER_EARNINGS.RTC_RATE_BELOW_5KM}, RTC_RATE_ABOVE_5KM=${DRIVER_EARNINGS.RTC_RATE_ABOVE_5KM}, MAX_ACTIVE=${AVAILABLE_DELIVERY_THRESHOLDS.MAX_ACTIVE_DELIVERIES}`,
    );

    // Step 1: Get driver's current route context (pass coordinates to ensure location is set)
    console.log(
      `\n[AVAILABLE DELIVERIES] Step 1n+�G�� : Get driver's route context`,
    );
    const routeContext = await getDriverRouteContext(
      driverId,
      driverLatitude,
      driverLongitude,
    );

    // Ensure driver location is set from query params if not from DB
    if (
      driverLatitude &&
      driverLongitude &&
      (!routeContext.driver_location.latitude ||
        !routeContext.driver_location.longitude)
    ) {
      routeContext.driver_location = {
        latitude: driverLatitude,
        longitude: driverLongitude,
      };
      console.log(
        `[AVAILABLE DELIVERIES]   G�� Updated driver location from query: (${driverLatitude}, ${driverLongitude})`,
      );
    }

    // Step 2: Fetch candidate deliveries (pending, no driver assigned)
    // Sort by res_accepted_at (restaurant acceptance time) - newest first
    console.log(
      `\n[AVAILABLE DELIVERIES] Step 2n+�G�� : Fetch candidate deliveries (pending, sorted by res_accepted_at DESC)`,
    );
    const { data: candidateDeliveries, error: fetchError } = await supabaseAdmin
      .from("deliveries")
      .select(
        `
          id,
          order_id,
          status,
          res_accepted_at,
          tip_amount,
          orders (
            id,
            order_number,
            restaurant_id,
            restaurant_name,
            restaurant_address,
            restaurant_latitude,
            restaurant_longitude,
            delivery_address,
            delivery_city,
            delivery_latitude,
            delivery_longitude,
            delivery_fee,
            service_fee,
            subtotal,
            total_amount,
            customer_id,
            customer_name,
            customer_phone,
            payment_method,
            placed_at
          )
        `,
      )
      .eq("status", "pending")
      .is("driver_id", null)
      .order("res_accepted_at", { ascending: false, nullsFirst: false }); // Newest restaurant acceptance first

    if (fetchError) {
      throw new Error(`Failed to fetch deliveries: ${fetchError.message}`);
    }

    console.log(
      `[AVAILABLE DELIVERIES]   G�� Found ${candidateDeliveries?.length || 0} pending deliveries`,
    );

    if (!candidateDeliveries || candidateDeliveries.length === 0) {
      console.log(
        `[AVAILABLE DELIVERIES] G�n+� No deliveries available right now`,
      );
      return {
        available_deliveries: [],
        total_available: 0,
        driver_location: routeContext.driver_location,
      };
    }

    // Step 3: Evaluate each candidate delivery
    console.log(
      `\n[AVAILABLE DELIVERIES] Step 3n+�G�� : Evaluate each delivery as route extension`,
    );
    console.log(
      `[AVAILABLE DELIVERIES]   Processing ${candidateDeliveries.length} candidates...`,
    );

    const driverEvalCache = availableEvaluationCacheByDriver.get(driverId);
    const canReuseCachedEvaluations =
      !forceRecalculateAll &&
      driverEvalCache &&
      driverEvalCache.activeSignature === activeSignature;

    if (forceRecalculateAll) {
      console.log(
        `[AVAILABLE DELIVERIES]   Triggered full recompute (movement >= 200m or route context changed)`,
      );
    } else if (canReuseCachedEvaluations) {
      console.log(
        `[AVAILABLE DELIVERIES]   Reusing cached per-delivery evaluations where possible`,
      );
    }

    // OPTIMIZATION: Pre-calculate R0 (current route) ONCE for all evaluations
    // This saves 1 OSRM call per delivery
    const startTime = Date.now();
    let preCalculatedR0 = null;

    const deliveriesNeedingEvaluation = [];
    const evaluationResults = [];
    const evaluationStateByDelivery = new Map();

    for (const delivery of candidateDeliveries) {
      const signature = buildCandidateDeliverySignature(delivery);
      const cachedState = canReuseCachedEvaluations
        ? driverEvalCache.byDelivery?.get(delivery.id)
        : null;

      if (cachedState && cachedState.signature === signature) {
        evaluationResults.push(cachedState.result);
        evaluationStateByDelivery.set(delivery.id, {
          signature,
          result: cachedState.result,
        });
      } else {
        deliveriesNeedingEvaluation.push({ delivery, signature });
      }
    }

    console.log(
      `[AVAILABLE DELIVERIES]   Cached reuse: ${candidateDeliveries.length - deliveriesNeedingEvaluation.length}, New evaluations: ${deliveriesNeedingEvaluation.length}`,
    );

    const reusedEvaluationsCount =
      candidateDeliveries.length - deliveriesNeedingEvaluation.length;
    const newEvaluationsCount = deliveriesNeedingEvaluation.length;

    if (
      deliveriesNeedingEvaluation.length > 0 &&
      routeContext.stops &&
      routeContext.stops.length > 0
    ) {
      console.log(`[AVAILABLE DELIVERIES]   Pre-calculating R0 route...`);
      const driverLocation = {
        lat: routeContext.driver_location.latitude,
        lng: routeContext.driver_location.longitude,
        label: "A (Driver)",
      };

      // Build current deliveries from route context
      const currentDeliveries = [];
      const processedIds = new Set();
      for (const stop of routeContext.stops) {
        if (!processedIds.has(stop.delivery_id)) {
          const restaurantStop = routeContext.stops.find(
            (s) =>
              s.delivery_id === stop.delivery_id &&
              s.stop_type === "restaurant",
          );
          const customerStop = routeContext.stops.find(
            (s) =>
              s.delivery_id === stop.delivery_id && s.stop_type === "customer",
          );
          if (restaurantStop && customerStop) {
            currentDeliveries.push({
              restaurant: {
                lat: restaurantStop.latitude,
                lng: restaurantStop.longitude,
                label: `R${currentDeliveries.length + 1}`,
              },
              customer: {
                lat: customerStop.latitude,
                lng: customerStop.longitude,
                label: `C${currentDeliveries.length + 1}`,
              },
            });
            processedIds.add(stop.delivery_id);
          }
        }
      }

      if (currentDeliveries.length > 0) {
        const currentRestaurants = currentDeliveries.map((d) => d.restaurant);
        const currentCustomers = currentDeliveries.map((d) => d.customer);

        // Use SEGMENT-BY-SEGMENT calculation for R0 (FAIR calculation)
        const r0SegmentRoute = await calculateSegmentBySegmentRouteDistance(
          driverLocation,
          currentRestaurants,
          currentCustomers,
          "R0 - Pre-calculated (Segment-by-Segment)",
        );

        preCalculatedR0 = {
          distance: r0SegmentRoute.totalDistance,
          duration: r0SegmentRoute.totalDuration,
          distanceKm: r0SegmentRoute.totalDistanceKm,
          segments: r0SegmentRoute.segments,
        };
        console.log(
          `[AVAILABLE DELIVERIES]   G�� R0 pre-calculated: ${(preCalculatedR0.distance / 1000).toFixed(2)} km`,
        );
      }
    }

    // OPTIMIZATION: Process deliveries in PARALLEL with concurrency limit
    const CONCURRENCY_LIMIT = 5; // Process 5 at a time to avoid rate limiting

    for (
      let i = 0;
      i < deliveriesNeedingEvaluation.length;
      i += CONCURRENCY_LIMIT
    ) {
      const batch = deliveriesNeedingEvaluation.slice(i, i + CONCURRENCY_LIMIT);
      console.log(
        `[AVAILABLE DELIVERIES]   Processing batch ${Math.floor(i / CONCURRENCY_LIMIT) + 1}/${Math.ceil(deliveriesNeedingEvaluation.length / CONCURRENCY_LIMIT)} (${batch.length} deliveries)...`,
      );

      const batchResults = await Promise.all(
        batch.map(async ({ delivery, signature }) => {
          try {
            const result = await evaluateAvailableDeliveryOptimized(
              driverId,
              delivery.id,
              delivery,
              routeContext,
              getRouteDistance,
              preCalculatedR0, // Pass pre-calculated R0
            );
            return result;
          } catch (evalError) {
            console.error(
              `[AVAILABLE DELIVERIES] G��n+� Error evaluating delivery ${delivery.id}:`,
              evalError.message,
            );
            return {
              delivery_id: delivery.id,
              can_accept: false,
              reason: `Evaluation failed: ${evalError.message}`,
            };
          }
        }),
      );

      for (let j = 0; j < batchResults.length; j += 1) {
        const result = batchResults[j];
        const source = batch[j];
        evaluationResults.push(result);
        evaluationStateByDelivery.set(source.delivery.id, {
          signature: source.signature,
          result,
        });
      }
    }

    availableEvaluationCacheByDriver.set(driverId, {
      pendingSignature,
      activeSignature,
      byDelivery: evaluationStateByDelivery,
      updatedAt: Date.now(),
    });

    const totalTime = Date.now() - startTime;
    console.log(
      `[AVAILABLE DELIVERIES]   GŦn+� Total evaluation time: ${totalTime}ms for ${candidateDeliveries.length} deliveries`,
    );

    // Filter to only accepted deliveries
    const acceptedDeliveries = evaluationResults
      .filter((result) => result.can_accept)
      .map((result) => {
        const candidateDelivery = candidateDeliveries.find(
          (d) => d.id === result.delivery_id,
        );
        return {
          delivery_id: result.delivery_id,
          order_id: candidateDelivery.order_id,
          order_number: candidateDelivery.orders.order_number,
          restaurant: {
            name: candidateDelivery.orders.restaurant_name,
            address: candidateDelivery.orders.restaurant_address,
            latitude: candidateDelivery.orders.restaurant_latitude,
            longitude: candidateDelivery.orders.restaurant_longitude,
          },
          customer: {
            name: candidateDelivery.orders.customer_name,
            phone: candidateDelivery.orders.customer_phone,
            address: candidateDelivery.orders.delivery_address,
            latitude: candidateDelivery.orders.delivery_latitude,
            longitude: candidateDelivery.orders.delivery_longitude,
          },
          pricing: {
            subtotal: parseFloat(candidateDelivery.orders.subtotal || 0),
            delivery_fee: parseFloat(
              candidateDelivery.orders.delivery_fee || 0,
            ),
            service_fee: parseFloat(candidateDelivery.orders.service_fee || 0),
            total: parseFloat(candidateDelivery.orders.total_amount || 0),
            tip_amount: parseFloat(candidateDelivery.tip_amount || 0),
            // Driver earnings breakdown:
            base_amount: result.base_amount,
            extra_earnings: result.extra_earnings,
            bonus_amount: result.bonus_amount, // Rs.25 for 2nd, Rs.30 for 3rd+
            total_trip_earnings: result.total_trip_earnings, // Base + Extra + Bonus
          },
          route_impact: {
            extra_distance_km: result.extra_distance_km,
            extra_time_minutes: result.extra_time_minutes,
            // Earnings breakdown:
            base_amount: result.base_amount,
            extra_earnings: result.extra_earnings,
            bonus_amount: result.bonus_amount, // Rs.25 for 2nd, Rs.30 for 3rd+
            total_trip_earnings: result.total_trip_earnings, // Base + Extra + Bonus
            // Route info:
            r0_distance_km: result.r0_distance_km,
            r1_distance_km: result.r1_distance_km,
            calculation_method: result.extra_calculation_method, // "R1 - R0"
            // First delivery specific fields
            is_first_delivery: result.is_first_delivery || false,
            restaurant_to_customer_km: result.restaurant_to_customer_km || 0,
          },
          total_delivery_distance_km: result.is_first_delivery
            ? result.restaurant_to_customer_km
            : result.extra_distance_km,
          estimated_time_minutes: result.estimated_time_minutes,
          route_geometry: result.route_geometry, // OSRM route geometry
          restaurant_to_customer_route: result.restaurant_to_customer_route,
        };
      });

    const stableAcceptedDeliveries = acceptedDeliveries.filter((delivery) => {
      const distanceKm = Number.parseFloat(
        delivery.total_delivery_distance_km || 0,
      );
      const etaMinutes = Number.parseFloat(
        delivery.estimated_time_minutes || 0,
      );
      const routeImpact = delivery.route_impact || {};
      const pricing = delivery.pricing || {};
      const isFirstDelivery = Boolean(routeImpact.is_first_delivery);

      const baseAmount = Number.parseFloat(
        routeImpact.base_amount || pricing.base_amount || 0,
      );
      const extraEarnings = Number.parseFloat(
        routeImpact.extra_earnings || pricing.extra_earnings || 0,
      );
      const bonusAmount = Number.parseFloat(
        routeImpact.bonus_amount || pricing.bonus_amount || 0,
      );
      const totalTripEarnings = Number.parseFloat(
        routeImpact.total_trip_earnings || pricing.total_trip_earnings || 0,
      );

      const firstHasRoutes =
        !isFirstDelivery ||
        Boolean(delivery.restaurant_to_customer_route?.coordinates?.length);

      const hasValidEarnings = isFirstDelivery
        ? baseAmount > 0 && totalTripEarnings > 0
        : totalTripEarnings > 0 && extraEarnings + bonusAmount > 0;

      const isStable =
        distanceKm > 0 && etaMinutes > 0 && firstHasRoutes && hasValidEarnings;

      if (!isStable) {
        console.warn(
          `[AVAILABLE DELIVERIES] G��n+� Dropped unstable delivery ${delivery.delivery_id}: distance=${distanceKm}, eta=${etaMinutes}, first=${isFirstDelivery}, earnings(total=${totalTripEarnings}, base=${baseAmount}, extra=${extraEarnings}, bonus=${bonusAmount})`,
        );
      }

      return isStable;
    });

    const rejectedDeliveries = evaluationResults
      .filter((result) => !result.can_accept)
      .map((result) => ({
        delivery_id: result.delivery_id,
        reason: result.reason,
      }));

    const unstableRejected = acceptedDeliveries
      .filter(
        (delivery) =>
          !stableAcceptedDeliveries.some(
            (stable) => stable.delivery_id === delivery.delivery_id,
          ),
      )
      .map((delivery) => ({
        delivery_id: delivery.delivery_id,
        reason: "Unstable route/earnings calculation",
      }));

    rejectedDeliveries.push(...unstableRejected);

    // Step 4: Display summary
    console.log(`\n[AVAILABLE DELIVERIES] Step 4n+�G�� : Summary`);
    console.log(
      `[AVAILABLE DELIVERIES]   G�� Accepted: ${stableAcceptedDeliveries.length}`,
    );
    console.log(
      `[AVAILABLE DELIVERIES]   G�� Rejected: ${rejectedDeliveries.length}`,
    );

    stableAcceptedDeliveries.forEach((delivery) => {
      console.log(
        `[AVAILABLE DELIVERIES]     G�� Order #${delivery.order_number}: Total ${delivery.total_delivery_distance_km}km, Extra +${delivery.route_impact.extra_distance_km}km, ${delivery.route_impact.extra_time_minutes}min`,
      );
    });

    rejectedDeliveries.forEach((delivery) => {
      console.log(
        `[AVAILABLE DELIVERIES]     G�� ${delivery.delivery_id}: ${delivery.reason}`,
      );
    });

    // Sort: tipped deliveries first, then by tip amount descending
    stableAcceptedDeliveries.sort((a, b) => {
      const tipA = parseFloat(a.pricing?.tip_amount || 0);
      const tipB = parseFloat(b.pricing?.tip_amount || 0);
      if (tipA > 0 && tipB <= 0) return -1;
      if (tipB > 0 && tipA <= 0) return 1;
      if (tipA > 0 && tipB > 0) return tipB - tipA; // higher tip first
      return 0; // preserve existing order for non-tipped
    });

    console.log(
      `\n[AVAILABLE DELIVERIES] G�� Complete: Showing ${stableAcceptedDeliveries.length} available deliveries (tipped first)`,
    );
    console.log(`${"=".repeat(80)}\n`);

    return {
      available_deliveries: stableAcceptedDeliveries,
      total_available: stableAcceptedDeliveries.length,
      driver_location: routeContext.driver_location,
      current_route: {
        total_stops: routeContext.total_stops,
        active_deliveries: Math.ceil(routeContext.total_stops / 2),
      },
      telemetry: {
        trigger_reason: triggerReason,
        forced_full_recalculation: forceRecalculateAll,
        candidate_count: candidateDeliveries.length,
        reused_evaluations_count: reusedEvaluationsCount,
        new_evaluations_count: newEvaluationsCount,
      },
    };
  } catch (error) {
    console.error(`[AVAILABLE DELIVERIES] G�� Fatal error: ${error.message}`);
    throw error;
  }
}

// Export the thresholds and earnings constants for external reference
export {
  AVAILABLE_DELIVERY_THRESHOLDS,
  DRIVER_EARNINGS,
  loadConfigConstants,
  calculateSegmentBySegmentRouteDistance,
};
