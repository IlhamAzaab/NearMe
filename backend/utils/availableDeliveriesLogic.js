/**
 * ============================================================================
 * AVAILABLE DELIVERIES LOGIC - Route Extension Model
 * ============================================================================
 *
 * KEY RULE: Pick up ALL food from ALL restaurants FIRST, then deliver to ALL customers
 *
 * EXTRA DISTANCE CALCULATION:
 * 1. R0 = Current optimal route (Driver → All current Restaurants → All current Customers)
 * 2. R1 = COMBINED optimal route (Driver → All Restaurants including new → All Customers including new)
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
// OSRM replaces Google Maps - same interface, same return format
import { getOSRMRoute as getGoogleRoute } from "./osrmService.js";

// Thresholds for showing available deliveries
const AVAILABLE_DELIVERY_THRESHOLDS = {
  MAX_EXTRA_TIME_MINUTES: 10,
  MAX_EXTRA_DISTANCE_KM: 3,
  MAX_ACTIVE_DELIVERIES: 5,
};

// Driver earnings constants
const DRIVER_EARNINGS = {
  RATE_PER_KM: 40, // Rs per km
  MAX_DRIVER_TO_RESTAURANT_KM: 1, // Maximum distance paid for driver to restaurant
  MAX_RESTAURANT_PROXIMITY_KM: 1, // Maximum distance between new and existing restaurants for subsequent deliveries
  DELIVERY_BONUS: {
    SECOND_DELIVERY: 20, // Rs bonus when driver has 1 active delivery (getting 2nd)
    ADDITIONAL_DELIVERY: 30, // Rs bonus when driver has 2+ active deliveries (getting 3rd, 4th, 5th)
  },
};

// ============================================================================
// OSRM ROUTE CALCULATION (Using Public OSRM Server)
// ============================================================================
async function getOSRMRoute(waypoints, context = "") {
  // Uses OSRM foot profile for shortest distance (suitable for motorcycles too)
  return await getGoogleRoute(waypoints, context, { useSingleMode: true });
}

// ============================================================================
// HAVERSINE DISTANCE (for micro-segment distance calculation)
// ============================================================================
function haversineDistance(lat1, lng1, lat2, lng2) {
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

// ============================================================================
// RETURN-VIA-SAME-PATH ALGORITHM
// ============================================================================
/**
 * Creates complete optimized route: Driver → Restaurant → Customer
 * Accounts for overlapping road segments to minimize total distance
 */
async function getCompleteOptimizedRoute(
  driverLocation,
  restaurantLocation,
  customerLocation,
  context = "",
) {
  console.log(
    `\n[COMPLETE-ROUTE] 🎯 Building complete optimized route ${context ? `(${context})` : ""}`,
  );

  // Step 1: Get driver-to-restaurant route
  const driverToRestaurantRoute = await getOSRMRoute(
    [driverLocation, restaurantLocation],
    "Driver to Restaurant",
  );
  console.log(
    `[COMPLETE-ROUTE] → Driver to Restaurant: ${(driverToRestaurantRoute.distance / 1000).toFixed(3)} km`,
  );

  // Step 2: Calculate restaurant-to-customer options and find best
  console.log(`[COMPLETE-ROUTE] → Evaluating restaurant-to-customer options:`);

  // Option 1: Direct restaurant to customer
  const directRoute = await getOSRMRoute(
    [restaurantLocation, customerLocation],
    "Direct Restaurant to Customer",
  );
  console.log(
    `[COMPLETE-ROUTE]   Option 1 (Direct): ${(directRoute.distance / 1000).toFixed(3)} km`,
  );

  // Option 2: Restaurant → Driver location → Customer (return via same path)
  const returnViaDriverRoute = await getOSRMRoute(
    [restaurantLocation, driverLocation, customerLocation],
    "Restaurant → Driver → Customer",
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
    `[COMPLETE-ROUTE] ✓ Best restaurant-to-customer: ${bestRestaurantToCustomer.option} (${(bestRestaurantToCustomer.route.distance / 1000).toFixed(3)} km)`,
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

  console.log(`[COMPLETE-ROUTE] → Complete route breakdown:`);
  console.log(
    `[COMPLETE-ROUTE]   • Driver to Restaurant: ${(driverToRestaurantRoute.distance / 1000).toFixed(3)} km`,
  );
  console.log(
    `[COMPLETE-ROUTE]   • Restaurant to Customer: ${(bestRestaurantToCustomer.route.distance / 1000).toFixed(3)} km (${bestRestaurantToCustomer.option})`,
  );
  if (overlapSavings > 0) {
    console.log(
      `[COMPLETE-ROUTE]   • Overlap Savings: ${(overlapSavings / 1000).toFixed(3)} km 🎯`,
    );
    console.log(
      `[COMPLETE-ROUTE]   ✨ ROUTE OPTIMIZED! Driver returns via same path`,
    );
  }
  console.log(
    `[COMPLETE-ROUTE] ✓ Total Distance: ${(totalDistance / 1000).toFixed(3)} km`,
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
    return `${lng1},${lat1}→${lng2},${lat2}`;
  } else {
    return `${lng2},${lat2}→${lng1},${lat1}`;
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
    `\n[COMMON SEGMENTS] 🔍 Finding common road segments (micro-segment matching)`,
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
        `[COMMON SEGMENTS]     📍 ${roadName}: ${totalSegs} micro-segs (${(totalDist / 1000).toFixed(3)} km)`,
      );
      console.log(
        `[COMMON SEGMENTS]        ✓ COMMON: ${val.common} segs (${(val.commonDist / 1000).toFixed(3)} km)`,
      );
      console.log(
        `[COMMON SEGMENTS]        ✚ UNIQUE: ${val.unique} segs (${(val.uniqueDist / 1000).toFixed(3)} km)`,
      );
    } else if (val.common > 0) {
      console.log(
        `[COMMON SEGMENTS]     ✓ COMMON: ${roadName} - ${val.common} micro-segs (${(val.commonDist / 1000).toFixed(3)} km)`,
      );
    } else {
      console.log(
        `[COMMON SEGMENTS]     ✚ UNIQUE: ${roadName} - ${val.unique} micro-segs (${(val.uniqueDist / 1000).toFixed(3)} km)`,
      );
    }
  });

  console.log(
    `\n[COMMON SEGMENTS]   ═══════════════════════════════════════════════════`,
  );
  console.log(`[COMMON SEGMENTS]   📊 SUMMARY:`);
  console.log(
    `[COMMON SEGMENTS]     - Common micro-segments: ${commonMicroSegments.length} (${(commonDistance / 1000).toFixed(3)} km)`,
  );
  console.log(
    `[COMMON SEGMENTS]     - Unique micro-segments: ${uniqueMicroSegments.length} (${(uniqueDistance / 1000).toFixed(3)} km)`,
  );
  console.log(
    `[COMMON SEGMENTS]   ═══════════════════════════════════════════════════`,
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
    `\n[MULTI-STOP ROUTE] 🗺️ Calculating route for ${waypoints.length} waypoints${context ? ` (${context})` : ""}`,
  );

  try {
    if (!waypoints || waypoints.length < 2) {
      throw new Error("Need at least 2 waypoints for routing");
    }

    // Format for OSRM: lng,lat;lng,lat;lng,lat...
    const coordinates = waypoints.map((wp) => `${wp.lng},${wp.lat}`).join(";");

    console.log(`[MULTI-STOP ROUTE] → Waypoints: ${waypoints.length} stops`);
    waypoints.forEach((wp, idx) => {
      console.log(
        `[MULTI-STOP ROUTE]   ${idx}: (${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)})`,
      );
    });

    // Use public OSRM service with FOOT profile for shortest routes (motorcycles can use walking paths in town)
    const url = `https://router.project-osrm.org/route/v1/foot/${coordinates}?overview=full&geometries=geojson&alternatives=true`;

    console.log(`[MULTI-STOP ROUTE] → Requesting OSRM...`);
    console.log(`[MULTI-STOP ROUTE] → URL: ${url}`);

    const response = await fetch(url);

    // Check if response is valid before parsing JSON
    if (!response.ok) {
      const text = await response.text();
      console.error(
        `[MULTI-STOP ROUTE] ❌ HTTP ${response.status}: ${text.substring(0, 100)}`,
      );
      throw new Error(`OSRM HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!response.ok || data.code !== "Ok") {
      console.error(
        `[MULTI-STOP ROUTE] ❌ OSRM error: ${data.code} - ${data.message}`,
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
        `[MULTI-STOP ROUTE] 🎯 Selected shortest route: ${(selectedRoute.distance / 1000).toFixed(3)} km from ${data.routes.length} alternatives`,
      );
    }

    const route = selectedRoute;
    const totalDistance = route.distance; // meters
    const totalDuration = route.duration; // seconds

    console.log(
      `[MULTI-STOP ROUTE] ✓ Distance: ${(totalDistance / 1000).toFixed(2)} km`,
    );
    console.log(
      `[MULTI-STOP ROUTE] ✓ Duration: ${Math.ceil(totalDuration / 60)} mins`,
    );

    return {
      distance: totalDistance,
      duration: totalDuration,
      geometry: route.geometry,
    };
  } catch (error) {
    console.error(`[MULTI-STOP ROUTE] ❌ Error: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// EVALUATE AVAILABLE DELIVERY (CORRECT ALGORITHM)
// ============================================================================
/**
 * CORRECT ALGORITHM:
 * 1. R0 = Current optimal route (Driver → All Restaurants → All Customers) using OSRM
 * 2. R1 = New delivery's SINGLE route (Driver → New Restaurant → New Customer) using OSRM
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
  const orderNumber = availableDelivery.orders.order_number;

  console.log(`\n${"=".repeat(100)}`);
  console.log(`[EVALUATE] 🔍 Evaluating order ${orderNumber} (${deliveryId})`);
  console.log(`${"=".repeat(100)}`);

  try {
    // Check max deliveries
    const activeDeliveryCount = routeContext.total_stops / 2;
    console.log(
      `[EVALUATE] → Active deliveries: ${activeDeliveryCount}/${AVAILABLE_DELIVERY_THRESHOLDS.MAX_ACTIVE_DELIVERIES}`,
    );

    if (
      activeDeliveryCount >= AVAILABLE_DELIVERY_THRESHOLDS.MAX_ACTIVE_DELIVERIES
    ) {
      return {
        delivery_id: deliveryId,
        can_accept: false,
        reason: "Driver has maximum active deliveries",
      };
    }

    // Get driver location
    const driverLat = routeContext.driver_location.latitude;
    const driverLng = routeContext.driver_location.longitude;

    if (!driverLat || !driverLng) {
      return {
        delivery_id: deliveryId,
        can_accept: false,
        reason: "Cannot determine driver location",
      };
    }

    const driverLocation = {
      lat: driverLat,
      lng: driverLng,
      label: "A (Driver)",
    };
    console.log(
      `[EVALUATE] → Driver Location (A): (${driverLat.toFixed(6)}, ${driverLng.toFixed(6)})`,
    );

    // Get new delivery coordinates
    const newRestaurantLat = parseFloat(
      availableDelivery.orders.restaurant_latitude,
    );
    const newRestaurantLng = parseFloat(
      availableDelivery.orders.restaurant_longitude,
    );
    const newCustomerLat = parseFloat(
      availableDelivery.orders.delivery_latitude,
    );
    const newCustomerLng = parseFloat(
      availableDelivery.orders.delivery_longitude,
    );

    const newRestaurant = {
      lat: newRestaurantLat,
      lng: newRestaurantLng,
      label: "New Restaurant",
    };
    const newCustomer = {
      lat: newCustomerLat,
      lng: newCustomerLng,
      label: "New Customer",
    };

    console.log(
      `[EVALUATE] → New Restaurant: (${newRestaurantLat.toFixed(6)}, ${newRestaurantLng.toFixed(6)})`,
    );
    console.log(
      `[EVALUATE] → New Customer: (${newCustomerLat.toFixed(6)}, ${newCustomerLng.toFixed(6)})`,
    );

    // Build current deliveries list
    console.log(`\n[EVALUATE] 📦 Current accepted deliveries:`);
    const currentDeliveries = [];
    const processedDeliveryIds = new Set();
    let idx = 1;
    let firstDeliveryEarnings = 0; // Track first delivery's total earnings for base amount

    for (const stop of routeContext.stops) {
      if (!processedDeliveryIds.has(stop.delivery_id)) {
        const restaurantStop = routeContext.stops.find(
          (s) =>
            s.delivery_id === stop.delivery_id && s.stop_type === "restaurant",
        );
        const customerStop = routeContext.stops.find(
          (s) =>
            s.delivery_id === stop.delivery_id && s.stop_type === "customer",
        );

        if (restaurantStop && customerStop) {
          // Extract delivery earnings info from the stop's delivery data
          const deliveryData =
            restaurantStop.deliveries || customerStop.deliveries;
          const deliveryEarnings = parseFloat(
            deliveryData?.driver_earnings || 0,
          );
          const deliverySequence = deliveryData?.delivery_sequence || idx;

          // First delivery (sequence 1) earnings becomes the base for subsequent deliveries
          if (deliverySequence === 1 && deliveryEarnings > 0) {
            firstDeliveryEarnings = deliveryEarnings;
          }

          currentDeliveries.push({
            id: stop.delivery_id,
            restaurant: {
              lat: restaurantStop.latitude,
              lng: restaurantStop.longitude,
              label: `R${idx}`,
            },
            customer: {
              lat: customerStop.latitude,
              lng: customerStop.longitude,
              label: `C${idx}`,
            },
            driver_earnings: deliveryEarnings,
            delivery_sequence: deliverySequence,
          });
          console.log(
            `[EVALUATE]   Delivery ${idx} (Seq: ${deliverySequence}):`,
          );
          console.log(
            `[EVALUATE]     - Restaurant R${idx}: (${restaurantStop.latitude.toFixed(6)}, ${restaurantStop.longitude.toFixed(6)})`,
          );
          console.log(
            `[EVALUATE]     - Customer C${idx}: (${customerStop.latitude.toFixed(6)}, ${customerStop.longitude.toFixed(6)})`,
          );
          console.log(
            `[EVALUATE]     - Earnings: Rs. ${deliveryEarnings.toFixed(2)}`,
          );
          processedDeliveryIds.add(stop.delivery_id);
          idx++;
        }
      }
    }
    console.log(
      `[EVALUATE]   Total current deliveries: ${currentDeliveries.length}`,
    );
    if (firstDeliveryEarnings > 0) {
      console.log(
        `[EVALUATE]   💰 First delivery earnings (base for next): Rs. ${firstDeliveryEarnings.toFixed(2)}`,
      );
    }

    // =========================================================================
    // STEP 1: Calculate R0 (current route with existing deliveries ONLY)
    // Route: Driver → All Restaurants (optimized order) → All Customers (optimized order)
    // =========================================================================
    console.log(`\n${"─".repeat(80)}`);
    console.log(
      `[EVALUATE] 📊 STEP 1: Calculate R0 (current route WITHOUT new delivery)`,
    );
    console.log(`${"─".repeat(80)}`);

    let r0Route = { distance: 0, duration: 0 };

    if (currentDeliveries.length > 0) {
      // Get restaurants and customers from current deliveries
      const currentRestaurants = currentDeliveries.map((d) => d.restaurant);
      const currentCustomers = currentDeliveries.map((d) => d.customer);

      // Optimize order: nearest restaurant to driver first, nearest customer to last restaurant first
      const optimizedRestaurants = getOptimizedRestaurantOrder(
        driverLocation,
        currentRestaurants,
      );
      const lastRestaurant =
        optimizedRestaurants[optimizedRestaurants.length - 1];
      const optimizedCustomers = getOptimizedCustomerOrder(
        lastRestaurant,
        currentCustomers,
      );

      // Build R0 waypoints: Driver → All Restaurants (optimized) → All Customers (optimized)
      const r0Waypoints = [
        driverLocation,
        ...optimizedRestaurants,
        ...optimizedCustomers,
      ];

      console.log(`[EVALUATE] R0 Route waypoints (optimized order):`);
      r0Waypoints.forEach((wp, i) => {
        console.log(
          `[EVALUATE]   ${i}: ${wp.label} (${wp.lat.toFixed(6)}, ${wp.lng.toFixed(6)})`,
        );
      });

      r0Route = await getOSRMRoute(r0Waypoints, "R0 - Current Route");
      console.log(
        `[EVALUATE] ✓ R0 Distance: ${(r0Route.distance / 1000).toFixed(3)} km`,
      );
      console.log(
        `[EVALUATE] ✓ R0 Duration: ${Math.ceil(r0Route.duration / 60)} mins`,
      );
    } else {
      console.log(`[EVALUATE] (No current deliveries - R0 = 0)`);
    }

    // =========================================================================
    // STEP 2: Calculate R1 (COMBINED route WITH new delivery)
    // Route: Driver → All Restaurants including new (optimized) → All Customers including new (optimized)
    // =========================================================================
    console.log(`\n${"─".repeat(80)}`);
    console.log(
      `[EVALUATE] 📊 STEP 2: Calculate R1 (COMBINED route WITH new delivery)`,
    );
    console.log(`${"─".repeat(80)}`);

    // Add new restaurant and customer to existing lists
    const allRestaurants = [
      ...currentDeliveries.map((d) => d.restaurant),
      newRestaurant,
    ];
    const allCustomers = [
      ...currentDeliveries.map((d) => d.customer),
      newCustomer,
    ];

    // Optimize order: nearest restaurant to driver first, nearest customer to last restaurant first
    const optimizedAllRestaurants = getOptimizedRestaurantOrder(
      driverLocation,
      allRestaurants,
    );
    const lastRestaurantForR1 =
      optimizedAllRestaurants[optimizedAllRestaurants.length - 1];
    const optimizedAllCustomers = getOptimizedCustomerOrder(
      lastRestaurantForR1,
      allCustomers,
    );

    // Build R1 waypoints: Driver → All Restaurants (optimized) → All Customers (optimized)
    const r1Waypoints = [
      driverLocation,
      ...optimizedAllRestaurants,
      ...optimizedAllCustomers,
    ];

    console.log(
      `[EVALUATE] R1 Route waypoints (optimized order with new delivery):`,
    );
    r1Waypoints.forEach((wp, i) => {
      console.log(
        `[EVALUATE]   ${i}: ${wp.label} (${wp.lat.toFixed(6)}, ${wp.lng.toFixed(6)})`,
      );
    });

    const r1Route = await getOSRMRoute(r1Waypoints, "R1 - Combined Route");
    console.log(
      `[EVALUATE] ✓ R1 Distance: ${(r1Route.distance / 1000).toFixed(3)} km`,
    );
    console.log(
      `[EVALUATE] ✓ R1 Duration: ${Math.ceil(r1Route.duration / 60)} mins`,
    );

    // =========================================================================
    // STEP 3: Calculate EXTRA distance = R1 - R0
    // =========================================================================
    console.log(`\n${"─".repeat(80)}`);
    console.log(`[EVALUATE] 📊 STEP 3: Calculate EXTRA distance (R1 - R0)`);
    console.log(`${"─".repeat(80)}`);

    const extraDistance = r1Route.distance - r0Route.distance;
    const extraDistanceKm = Math.max(0, extraDistance / 1000); // Ensure non-negative

    // Calculate extra time proportionally
    const r1DurationMinutes = r1Route.duration / 60;
    const r0DurationMinutes = r0Route.duration / 60;
    const extraTimeMinutes = Math.max(0, r1DurationMinutes - r0DurationMinutes);

    console.log(
      `\n[EVALUATE] ╔══════════════════════════════════════════════════════════════╗`,
    );
    console.log(
      `[EVALUATE] ║                    FINAL CALCULATION                         ║`,
    );
    console.log(
      `[EVALUATE] ╠══════════════════════════════════════════════════════════════╣`,
    );
    console.log(
      `[EVALUATE] ║  R0 (current route):        ${(r0Route.distance / 1000).toFixed(3).padStart(10)} km              ║`,
    );
    console.log(
      `[EVALUATE] ║  R1 (combined route):       ${(r1Route.distance / 1000).toFixed(3).padStart(10)} km              ║`,
    );
    console.log(
      `[EVALUATE] ╠══════════════════════════════════════════════════════════════╣`,
    );
    console.log(
      `[EVALUATE] ║  EXTRA DISTANCE = R1 - R0                                    ║`,
    );
    console.log(
      `[EVALUATE] ║  EXTRA DISTANCE = ${(r1Route.distance / 1000).toFixed(3)} - ${(r0Route.distance / 1000).toFixed(3)} = ${extraDistanceKm.toFixed(3)} km         ║`,
    );
    console.log(
      `[EVALUATE] ║  EXTRA TIME:                ${extraTimeMinutes.toFixed(1).padStart(10)} min              ║`,
    );
    console.log(
      `[EVALUATE] ╚══════════════════════════════════════════════════════════════╝`,
    );

    // Calculate earnings
    let extraEarnings;
    let driverToRestaurantEarnings = 0;
    let restaurantToCustomerEarnings = 0;

    if (activeDeliveryCount === 0) {
      // For FIRST DELIVERY: Only calculate driver-to-restaurant + restaurant-to-customer earnings
      // NO base earnings (delivery_fee + service_fee)

      // Calculate complete optimized route for first delivery earnings
      const completeOptimizedRoute = await getCompleteOptimizedRoute(
        driverLocation,
        newRestaurant,
        newCustomer,
        "First Delivery Earnings",
      );

      const driverToRestaurantKm =
        completeOptimizedRoute.driverToRestaurantDistance / 1000;
      const restaurantToCustomerKm =
        completeOptimizedRoute.restaurantToCustomerDistance / 1000;
      const overlapSavingsKm =
        (completeOptimizedRoute.overlapSavings || 0) / 1000;

      // Apply maximum 1km limit for driver-to-restaurant earnings
      const paidDriverToRestaurantKm = Math.min(
        driverToRestaurantKm,
        DRIVER_EARNINGS.MAX_DRIVER_TO_RESTAURANT_KM,
      );
      driverToRestaurantEarnings =
        paidDriverToRestaurantKm * DRIVER_EARNINGS.RATE_PER_KM;

      // Calculate earnings: Rs. 4 for each 0.1km = Rs. 40 per km
      restaurantToCustomerEarnings =
        restaurantToCustomerKm * DRIVER_EARNINGS.RATE_PER_KM;

      // Total earnings = ONLY driver-to-restaurant + restaurant-to-customer (NO base earnings)
      extraEarnings = driverToRestaurantEarnings + restaurantToCustomerEarnings;

      console.log(`\n[EVALUATE] 🚗 FIRST DELIVERY - Complete Optimized Route:`);
      console.log(
        `[EVALUATE]   Route Type: ${completeOptimizedRoute.isOptimized ? "OPTIMIZED 🎯" : "DIRECT"}`,
      );
      console.log(
        `[EVALUATE]   Driver to Restaurant: ${driverToRestaurantKm.toFixed(3)} km`,
      );
      console.log(
        `[EVALUATE]   Paid distance: ${paidDriverToRestaurantKm.toFixed(3)} km (max ${DRIVER_EARNINGS.MAX_DRIVER_TO_RESTAURANT_KM} km)`,
      );
      console.log(
        `[EVALUATE]   Driver-to-Restaurant Earnings: ${paidDriverToRestaurantKm.toFixed(3)} × Rs. ${DRIVER_EARNINGS.RATE_PER_KM} = Rs. ${driverToRestaurantEarnings.toFixed(2)}`,
      );

      console.log(
        `\n[EVALUATE] 🏪➡️🏠 Restaurant to Customer (${completeOptimizedRoute.selectedOption}):`,
      );
      console.log(
        `[EVALUATE]   Distance: ${restaurantToCustomerKm.toFixed(3)} km`,
      );
      if (overlapSavingsKm > 0) {
        console.log(
          `[EVALUATE]   Overlap Savings: ${overlapSavingsKm.toFixed(3)} km 🎯`,
        );
        console.log(
          `[EVALUATE]   ✨ ROUTE OPTIMIZED! Driver uses same path for efficiency`,
        );
      }
      console.log(
        `[EVALUATE]   Rate: Rs. ${DRIVER_EARNINGS.RATE_PER_KM}/km (Rs. 4 per 0.1km)`,
      );
      console.log(
        `[EVALUATE]   Restaurant-to-Customer Earnings: ${restaurantToCustomerKm.toFixed(3)} × Rs. ${DRIVER_EARNINGS.RATE_PER_KM} = Rs. ${restaurantToCustomerEarnings.toFixed(2)}`,
      );
    } else {
      // For subsequent deliveries: Check restaurant proximity and use normal base earnings
      console.log(
        `\n[EVALUATE] 📍 SUBSEQUENT DELIVERY - Checking restaurant proximity:`,
      );

      // Check if new restaurant is within 1km of any existing restaurant
      let isWithinProximity = false;
      let closestRestaurantDistance = Infinity;
      let closestRestaurantIndex = -1;

      for (let i = 0; i < currentDeliveries.length; i++) {
        const existingRestaurant = {
          lat: currentDeliveries[i].restaurant.lat,
          lng: currentDeliveries[i].restaurant.lng,
          label: `Existing R${i + 1}`,
        };

        // Calculate distance between new restaurant and existing restaurant
        const distanceRoute = await getOSRMRoute(
          [newRestaurant, existingRestaurant],
          `Distance Check: New Restaurant to Existing R${i + 1}`,
        );
        const distanceKm = distanceRoute.distance / 1000;

        console.log(
          `[EVALUATE]   Distance to R${i + 1} (${existingRestaurant.lat.toFixed(6)}, ${existingRestaurant.lng.toFixed(6)}): ${distanceKm.toFixed(3)} km`,
        );

        if (distanceKm <= DRIVER_EARNINGS.MAX_RESTAURANT_PROXIMITY_KM) {
          isWithinProximity = true;
          if (distanceKm < closestRestaurantDistance) {
            closestRestaurantDistance = distanceKm;
            closestRestaurantIndex = i + 1;
          }
        }
      }

      console.log(
        `[EVALUATE]   Closest restaurant: R${closestRestaurantIndex} at ${closestRestaurantDistance.toFixed(3)} km`,
      );
      console.log(
        `[EVALUATE]   Within ${DRIVER_EARNINGS.MAX_RESTAURANT_PROXIMITY_KM}km proximity: ${isWithinProximity ? "YES ✅" : "NO ❌"}`,
      );

      // If not within proximity, reject the delivery
      if (!isWithinProximity) {
        return {
          delivery_id: deliveryId,
          can_accept: false,
          reason: `New restaurant too far from existing restaurants (closest: ${closestRestaurantDistance.toFixed(3)}km, max: ${DRIVER_EARNINGS.MAX_RESTAURANT_PROXIMITY_KM}km)`,
        };
      }

      // Use normal base earnings (delivery_fee + service_fee)
      extraEarnings =
        parseFloat(availableDelivery.orders.delivery_fee || 0) +
        parseFloat(availableDelivery.orders.service_fee || 0);

      // Calculate extra distance earnings (every 1km = Rs. 40)
      const extraDistanceEarnings =
        Math.max(0, extraDistanceKm) * DRIVER_EARNINGS.RATE_PER_KM;

      // Calculate delivery count bonus
      let deliveryCountBonus = 0;
      if (activeDeliveryCount === 1) {
        // Driver has 1 active delivery, getting 2nd delivery
        deliveryCountBonus = DRIVER_EARNINGS.DELIVERY_BONUS.SECOND_DELIVERY;
      } else if (activeDeliveryCount >= 2) {
        // Driver has 2+ active deliveries, getting additional delivery
        deliveryCountBonus = DRIVER_EARNINGS.DELIVERY_BONUS.ADDITIONAL_DELIVERY;
      }

      // Add extra distance earnings and bonus to total
      extraEarnings += extraDistanceEarnings + deliveryCountBonus;

      // Display attractive bonus information
      console.log(`\n[EVALUATE] 💰 SUBSEQUENT DELIVERY - Enhanced Earnings:`);
      console.log(
        `[EVALUATE]   📦 Current Active Deliveries: ${activeDeliveryCount}`,
      );
      console.log(
        `[EVALUATE]   📏 Extra Distance: ${Math.max(0, extraDistanceKm).toFixed(3)} km`,
      );
      console.log(
        `[EVALUATE]   💵 Base Earnings: Rs. ${(parseFloat(availableDelivery.orders.delivery_fee || 0) + parseFloat(availableDelivery.orders.service_fee || 0)).toFixed(2)}`,
      );
      console.log(
        `[EVALUATE]   🚗 Extra Distance Earnings: ${Math.max(0, extraDistanceKm).toFixed(3)} km × Rs. ${DRIVER_EARNINGS.RATE_PER_KM} = Rs. ${extraDistanceEarnings.toFixed(2)}`,
      );

      if (deliveryCountBonus > 0) {
        const bonusType =
          activeDeliveryCount === 1
            ? "2ND DELIVERY BONUS"
            : "MULTI-DELIVERY BONUS";
        console.log(
          `[EVALUATE]   🎁 ${bonusType}: Rs. ${deliveryCountBonus.toFixed(2)} 🔥`,
        );
        console.log(
          `[EVALUATE]   ✨ BONUS ACTIVATED! More deliveries = More money! 💎`,
        );
      }
    }

    // Total combined route distance (R1 = combined route with all deliveries including new)
    const totalCombinedDistanceKm = r1Route.distance / 1000;
    const totalCombinedTimeMinutes = r1Route.duration / 60;

    console.log(`\n[EVALUATE] 💰 Final Earnings Summary:`);
    if (activeDeliveryCount === 0) {
      // First delivery - distance-based earnings
      console.log(
        `[EVALUATE] 💰 Driver-to-Restaurant Earnings: Rs. ${driverToRestaurantEarnings.toFixed(2)}`,
      );
      console.log(
        `[EVALUATE] 💰 Restaurant-to-Customer Earnings: Rs. ${restaurantToCustomerEarnings.toFixed(2)}`,
      );
      console.log(
        `[EVALUATE] 💰 Total Earnings (First Delivery): Rs. ${extraEarnings.toFixed(2)}`,
      );
    } else {
      // Subsequent deliveries - base earnings + extra distance + bonus
      const baseEarnings =
        parseFloat(availableDelivery.orders.delivery_fee || 0) +
        parseFloat(availableDelivery.orders.service_fee || 0);
      const extraDistanceEarnings =
        Math.max(0, extraDistanceKm) * DRIVER_EARNINGS.RATE_PER_KM;
      let deliveryCountBonus = 0;
      if (activeDeliveryCount === 1) {
        deliveryCountBonus = DRIVER_EARNINGS.DELIVERY_BONUS.SECOND_DELIVERY;
      } else if (activeDeliveryCount >= 2) {
        deliveryCountBonus = DRIVER_EARNINGS.DELIVERY_BONUS.ADDITIONAL_DELIVERY;
      }

      console.log(
        `[EVALUATE] 💰 Base Earnings: Rs. ${baseEarnings.toFixed(2)}`,
      );
      console.log(
        `[EVALUATE] 💰 Extra Distance Earnings: Rs. ${extraDistanceEarnings.toFixed(2)}`,
      );
      if (deliveryCountBonus > 0) {
        console.log(
          `[EVALUATE] 🎁 Delivery Bonus: Rs. ${deliveryCountBonus.toFixed(2)} 🚀`,
        );
      }
      console.log(
        `[EVALUATE] 💰 TOTAL ENHANCED EARNINGS: Rs. ${extraEarnings.toFixed(2)} 💎`,
      );
    }
    console.log(
      `[EVALUATE] 📍 Total combined route distance (R1): ${totalCombinedDistanceKm.toFixed(3)} km`,
    );

    console.log(`\n${"=".repeat(100)}`);

    // Calculate separate earnings components for proper display
    // For FIRST DELIVERY:
    //   - Driver to Restaurant: min(distance, 1km) × Rs. 40
    //   - Restaurant to Customer: distance × Rs. 40
    //   - Total = Driver-to-Restaurant + Restaurant-to-Customer
    // For SUBSEQUENT deliveries:
    //   - Base Amount = 1st order's delivery earnings (R0 × Rs. 40/km)
    //   - Extra Earnings = (R1-R0) × Rs. 40/km
    //   - Bonus Amount = Rs. 25 for 2nd, Rs. 30 for 3rd+

    let baseAmount = 0; // For first: total earnings | For subsequent: 1st delivery's earnings
    let extraDistanceEarnings = 0; // For subsequent: extra distance × Rs.40 (0 for first)
    let bonusAmount = 0; // Delivery count bonus (0 for first)
    let totalTripEarnings = 0; // Total earnings for the entire trip
    let driverToRestaurantKm = 0; // For first delivery
    let restaurantToCustomerKm = 0; // For first delivery
    let paidDriverToRestaurantKm = 0; // For first delivery (capped at 1km)
    let driverToRestaurantEarningsDisplay = 0; // For first delivery display only
    let restaurantToCustomerEarningsDisplay = 0; // For first delivery display only

    if (activeDeliveryCount === 0) {
      // FIRST DELIVERY - Calculate using driver-to-restaurant + restaurant-to-customer
      // Get the complete optimized route for first delivery
      const completeRoute = await getCompleteOptimizedRoute(
        driverLocation,
        newRestaurant,
        newCustomer,
        "First Delivery Final Calculation",
      );

      driverToRestaurantKm = completeRoute.driverToRestaurantDistance / 1000;
      restaurantToCustomerKm =
        completeRoute.restaurantToCustomerDistance / 1000;

      // Apply maximum 1km limit for driver-to-restaurant earnings
      paidDriverToRestaurantKm = Math.min(
        driverToRestaurantKm,
        DRIVER_EARNINGS.MAX_DRIVER_TO_RESTAURANT_KM,
      );

      // Calculate earnings for first delivery
      const dtrEarnings =
        paidDriverToRestaurantKm * DRIVER_EARNINGS.RATE_PER_KM;
      const rtcEarnings = restaurantToCustomerKm * DRIVER_EARNINGS.RATE_PER_KM;

      // For first delivery:
      // - base_amount = TOTAL earnings (driver-to-restaurant + restaurant-to-customer)
      // - extra_earnings = 0 (no extra for first delivery)
      // - driver_earnings = base_amount
      totalTripEarnings = dtrEarnings + rtcEarnings;

      // Store for return object - base_amount is the total first delivery earnings
      baseAmount = totalTripEarnings; // Total first delivery earnings (DTR + RTC)
      extraDistanceEarnings = 0; // No extra earnings for first delivery
      bonusAmount = 0; // No bonus for first delivery

      // Store individual components for display purposes
      driverToRestaurantEarningsDisplay = dtrEarnings;
      restaurantToCustomerEarningsDisplay = rtcEarnings;
    } else {
      // Subsequent deliveries:
      // - Base Amount = First delivery's total earnings (not R0 × Rs.40)
      // - Extra Earnings = (R1 - R0) × Rs. 40/km
      // - Bonus = Rs. 25 for 2nd, Rs. 30 for 3rd+

      // Use first delivery's earnings as base, or fallback to R0 × Rs.40 if not available
      if (firstDeliveryEarnings > 0) {
        baseAmount = firstDeliveryEarnings;
        console.log(
          `[EVALUATE]   💵 Using first delivery's earnings as base: Rs. ${baseAmount.toFixed(2)}`,
        );
      } else {
        // Fallback: calculate from R0 distance if first delivery earnings not available
        baseAmount = (r0Route.distance / 1000) * DRIVER_EARNINGS.RATE_PER_KM;
        console.log(
          `[EVALUATE]   ⚠️ First delivery earnings not available, using R0 distance: Rs. ${baseAmount.toFixed(2)}`,
        );
      }

      extraDistanceEarnings =
        Math.max(0, extraDistanceKm) * DRIVER_EARNINGS.RATE_PER_KM;

      if (activeDeliveryCount === 1) {
        // Getting 2nd delivery
        bonusAmount = DRIVER_EARNINGS.DELIVERY_BONUS.SECOND_DELIVERY; // Rs. 25
      } else if (activeDeliveryCount >= 2) {
        // Getting 3rd, 4th, 5th delivery
        bonusAmount = DRIVER_EARNINGS.DELIVERY_BONUS.ADDITIONAL_DELIVERY; // Rs. 30
      }

      totalTripEarnings = baseAmount + extraDistanceEarnings + bonusAmount;
    }

    // Log earnings breakdown
    console.log(`\n[EVALUATE] 💰 EARNINGS BREAKDOWN:`);
    if (activeDeliveryCount === 0) {
      // First delivery breakdown
      console.log(
        `[EVALUATE]   🚗 Driver to Restaurant: ${driverToRestaurantKm.toFixed(3)} km`,
      );
      console.log(
        `[EVALUATE]   🚗 Paid Distance (max 1km): ${paidDriverToRestaurantKm.toFixed(3)} km`,
      );
      console.log(
        `[EVALUATE]   💵 Driver-to-Restaurant Earnings: Rs. ${driverToRestaurantEarningsDisplay.toFixed(2)}`,
      );
      console.log(
        `[EVALUATE]   🏪➡️🏠 Restaurant to Customer: ${restaurantToCustomerKm.toFixed(3)} km`,
      );
      console.log(
        `[EVALUATE]   💵 Restaurant-to-Customer Earnings: Rs. ${restaurantToCustomerEarningsDisplay.toFixed(2)}`,
      );
      console.log(
        `[EVALUATE]   💰 BASE AMOUNT (Total 1st Delivery): Rs. ${baseAmount.toFixed(2)}`,
      );
      console.log(
        `[EVALUATE]   💰 DRIVER EARNINGS (= base_amount): Rs. ${baseAmount.toFixed(2)}`,
      );
    } else {
      // Subsequent delivery breakdown
      console.log(
        `[EVALUATE]   📍 R0 (Current Route): ${(r0Route.distance / 1000).toFixed(2)} km`,
      );
      console.log(
        `[EVALUATE]   📍 R1 (Combined Route): ${(r1Route.distance / 1000).toFixed(2)} km`,
      );
      console.log(
        `[EVALUATE]   📍 Extra Distance: ${extraDistanceKm.toFixed(2)} km`,
      );
      console.log(
        `[EVALUATE]   💵 1st Delivery Earnings (stored base): Rs. ${baseAmount.toFixed(2)}`,
      );
      console.log(
        `[EVALUATE]   💵 Extra Earnings (Extra × Rs.40): Rs. ${extraDistanceEarnings.toFixed(2)}`,
      );
      console.log(
        `[EVALUATE]   🎁 Bonus Amount: Rs. ${bonusAmount.toFixed(2)}`,
      );
      console.log(
        `[EVALUATE]   💰 THIS DELIVERY EARNINGS (extra + bonus): Rs. ${(extraDistanceEarnings + bonusAmount).toFixed(2)}`,
      );
      console.log(
        `[EVALUATE]   💰 TOTAL TRIP EARNINGS (1st + this): Rs. ${totalTripEarnings.toFixed(2)}`,
      );
    }

    // Build return object with appropriate fields for first vs subsequent deliveries
    const returnObj = {
      delivery_id: deliveryId,
      can_accept: true,
      extra_distance_km: parseFloat(Math.max(0, extraDistanceKm).toFixed(2)),
      extra_time_minutes: parseFloat(Math.max(0, extraTimeMinutes).toFixed(1)),
      // Earnings breakdown:
      // For FIRST delivery: base_amount = total earnings (DTR + RTC), extra_earnings = 0, driver_earnings = base_amount
      // For SUBSEQUENT: base_amount = 1st delivery's total earnings, extra_earnings = (R1-R0) × Rs.40, driver_earnings = extra_earnings + bonus_amount
      base_amount: parseFloat(baseAmount.toFixed(2)),
      extra_earnings: parseFloat(extraDistanceEarnings.toFixed(2)),
      bonus_amount: parseFloat(bonusAmount.toFixed(2)), // Rs.25 for 2nd, Rs.30 for 3rd+ (0 for first)
      // driver_earnings for this delivery (what will be stored in DB)
      this_delivery_earnings: parseFloat(
        activeDeliveryCount === 0
          ? baseAmount.toFixed(2)
          : (extraDistanceEarnings + bonusAmount).toFixed(2),
      ),
      total_trip_earnings: parseFloat(totalTripEarnings.toFixed(2)), // Cumulative earnings for entire trip
      // For subsequent deliveries, track the first delivery's earnings used as base
      first_delivery_earnings:
        activeDeliveryCount > 0
          ? parseFloat(firstDeliveryEarnings.toFixed(2))
          : null,
      // Route distances:
      total_combined_distance_km: parseFloat(
        totalCombinedDistanceKm.toFixed(2),
      ), // R1 - combined route
      estimated_time_minutes: Math.ceil(totalCombinedTimeMinutes),
      r0_distance_km: parseFloat((r0Route.distance / 1000).toFixed(2)),
      r1_distance_km: parseFloat((r1Route.distance / 1000).toFixed(2)),
      extra_calculation_method:
        activeDeliveryCount === 0 ? "FIRST_DELIVERY" : "R1 - R0",
      driver_to_restaurant_route: {
        coordinates: r1Route.geometry?.coordinates || null,
        encoded_polyline: r1Route.polyline || null,
      },
      restaurant_to_customer_route: {
        coordinates: null,
        encoded_polyline: null,
      },
    };

    // Add first delivery specific fields
    if (activeDeliveryCount === 0) {
      returnObj.is_first_delivery = true;
      returnObj.driver_to_restaurant_km = parseFloat(
        driverToRestaurantKm.toFixed(3),
      );
      returnObj.paid_driver_to_restaurant_km = parseFloat(
        paidDriverToRestaurantKm.toFixed(3),
      );
      returnObj.restaurant_to_customer_km = parseFloat(
        restaurantToCustomerKm.toFixed(3),
      );
      // Display earnings (for UI breakdown, not stored separately)
      returnObj.driver_to_restaurant_earnings = parseFloat(
        driverToRestaurantEarningsDisplay.toFixed(2),
      );
      returnObj.restaurant_to_customer_earnings = parseFloat(
        restaurantToCustomerEarningsDisplay.toFixed(2),
      );
    } else {
      returnObj.is_first_delivery = false;
    }

    return returnObj;
  } catch (error) {
    console.error(`[EVALUATE] ❌ Error: ${error.message}`);
    console.error(error.stack);

    // Add extra details for distance errors
    if (error.message.includes("distance")) {
      console.error(
        `[EVALUATE]    New Restaurant: (${newRestaurantLat.toFixed(6)}, ${newRestaurantLng.toFixed(6)})`,
      );
      if (currentDeliveries.length > 0) {
        console.error(
          `[EVALUATE]    Existing Restaurants: ${currentDeliveries.map((d) => `(${d.restaurant.lat.toFixed(6)}, ${d.restaurant.lng.toFixed(6)})`).join(", ")}`,
        );
      }
    }

    return {
      delivery_id: deliveryId,
      can_accept: false,
      reason: `Evaluation error: ${error.message}`,
    };
  }
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
    // Check max deliveries
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

    // Get driver location
    const driverLat = routeContext.driver_location.latitude;
    const driverLng = routeContext.driver_location.longitude;

    if (!driverLat || !driverLng) {
      return {
        delivery_id: deliveryId,
        can_accept: false,
        reason: "Cannot determine driver location",
      };
    }

    const driverLocation = {
      lat: driverLat,
      lng: driverLng,
      label: "A (Driver)",
    };

    // Get new delivery coordinates
    const newRestaurantLat = parseFloat(
      availableDelivery.orders.restaurant_latitude,
    );
    const newRestaurantLng = parseFloat(
      availableDelivery.orders.restaurant_longitude,
    );
    const newCustomerLat = parseFloat(
      availableDelivery.orders.delivery_latitude,
    );
    const newCustomerLng = parseFloat(
      availableDelivery.orders.delivery_longitude,
    );

    const newRestaurant = {
      lat: newRestaurantLat,
      lng: newRestaurantLng,
      label: "New Restaurant",
    };
    const newCustomer = {
      lat: newCustomerLat,
      lng: newCustomerLng,
      label: "New Customer",
    };

    // Build current deliveries list
    const currentDeliveries = [];
    const processedDeliveryIds = new Set();
    let firstDeliveryEarnings = 0;

    for (const stop of routeContext.stops) {
      if (!processedDeliveryIds.has(stop.delivery_id)) {
        const restaurantStop = routeContext.stops.find(
          (s) =>
            s.delivery_id === stop.delivery_id && s.stop_type === "restaurant",
        );
        const customerStop = routeContext.stops.find(
          (s) =>
            s.delivery_id === stop.delivery_id && s.stop_type === "customer",
        );

        if (restaurantStop && customerStop) {
          const deliveryData =
            restaurantStop.deliveries || customerStop.deliveries;
          const deliveryEarnings = parseFloat(
            deliveryData?.driver_earnings || 0,
          );
          const deliverySequence =
            deliveryData?.delivery_sequence || currentDeliveries.length + 1;

          if (deliverySequence === 1 && deliveryEarnings > 0) {
            firstDeliveryEarnings = deliveryEarnings;
          }

          currentDeliveries.push({
            id: stop.delivery_id,
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
            driver_earnings: deliveryEarnings,
            delivery_sequence: deliverySequence,
          });
          processedDeliveryIds.add(stop.delivery_id);
        }
      }
    }

    // Use pre-calculated R0 or default to 0
    let r0Route = preCalculatedR0 || { distance: 0, duration: 0 };

    // Calculate R1 (COMBINED route WITH new delivery) - ONLY OSRM CALL NEEDED
    const allRestaurants = [
      ...currentDeliveries.map((d) => d.restaurant),
      newRestaurant,
    ];
    const allCustomers = [
      ...currentDeliveries.map((d) => d.customer),
      newCustomer,
    ];

    const optimizedAllRestaurants = getOptimizedRestaurantOrder(
      driverLocation,
      allRestaurants,
    );
    const lastRestaurantForR1 =
      optimizedAllRestaurants[optimizedAllRestaurants.length - 1];
    const optimizedAllCustomers = getOptimizedCustomerOrder(
      lastRestaurantForR1,
      allCustomers,
    );

    const r1Waypoints = [
      driverLocation,
      ...optimizedAllRestaurants,
      ...optimizedAllCustomers,
    ];
    const r1Route = await getOSRMRoute(
      r1Waypoints,
      `R1 - Order ${orderNumber}`,
    );

    // Calculate EXTRA distance = R1 - R0
    const extraDistance = r1Route.distance - r0Route.distance;
    const extraDistanceKm = Math.max(0, extraDistance / 1000);
    const extraTimeMinutes = Math.max(
      0,
      (r1Route.duration - r0Route.duration) / 60,
    );

    // Calculate earnings based on whether this is first or subsequent delivery
    let baseAmount = 0;
    let extraDistanceEarnings = 0;
    let bonusAmount = 0;
    let totalTripEarnings = 0;
    let driverToRestaurantKm = 0;
    let restaurantToCustomerKm = 0;
    let paidDriverToRestaurantKm = 0;
    let driverToRestaurantEarningsDisplay = 0;
    let restaurantToCustomerEarningsDisplay = 0;

    if (activeDeliveryCount === 0) {
      // FIRST DELIVERY - Simplified calculation: use R1 distance for earnings
      // R1 already gives us Driver → Restaurant → Customer total distance
      const totalDistanceKm = r1Route.distance / 1000;

      // Estimate driver-to-restaurant and restaurant-to-customer using Haversine proportions
      const dtrHaversine = haversineDistance(
        driverLat,
        driverLng,
        newRestaurantLat,
        newRestaurantLng,
      );
      const rtcHaversine = haversineDistance(
        newRestaurantLat,
        newRestaurantLng,
        newCustomerLat,
        newCustomerLng,
      );
      const totalHaversine = dtrHaversine + rtcHaversine;

      // Proportion-based split of actual OSRM distance
      driverToRestaurantKm =
        totalHaversine > 0
          ? totalDistanceKm * (dtrHaversine / totalHaversine)
          : totalDistanceKm / 2;
      restaurantToCustomerKm = totalDistanceKm - driverToRestaurantKm;

      paidDriverToRestaurantKm = Math.min(
        driverToRestaurantKm,
        DRIVER_EARNINGS.MAX_DRIVER_TO_RESTAURANT_KM,
      );

      const dtrEarnings =
        paidDriverToRestaurantKm * DRIVER_EARNINGS.RATE_PER_KM;
      const rtcEarnings = restaurantToCustomerKm * DRIVER_EARNINGS.RATE_PER_KM;

      totalTripEarnings = dtrEarnings + rtcEarnings;
      baseAmount = totalTripEarnings;
      driverToRestaurantEarningsDisplay = dtrEarnings;
      restaurantToCustomerEarningsDisplay = rtcEarnings;
    } else {
      // Subsequent deliveries: Check restaurant proximity using Haversine (FAST - no OSRM call)
      let isWithinProximity = false;
      let closestRestaurantDistance = Infinity;

      for (const delivery of currentDeliveries) {
        // Use Haversine for quick distance check (no OSRM call needed)
        const distanceKm = haversineDistance(
          newRestaurantLat,
          newRestaurantLng,
          delivery.restaurant.lat,
          delivery.restaurant.lng,
        );

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

      // Calculate earnings for subsequent delivery
      if (firstDeliveryEarnings > 0) {
        baseAmount = firstDeliveryEarnings;
      } else {
        baseAmount = (r0Route.distance / 1000) * DRIVER_EARNINGS.RATE_PER_KM;
      }

      extraDistanceEarnings =
        Math.max(0, extraDistanceKm) * DRIVER_EARNINGS.RATE_PER_KM;

      if (activeDeliveryCount === 1) {
        bonusAmount = DRIVER_EARNINGS.DELIVERY_BONUS.SECOND_DELIVERY;
      } else if (activeDeliveryCount >= 2) {
        bonusAmount = DRIVER_EARNINGS.DELIVERY_BONUS.ADDITIONAL_DELIVERY;
      }

      totalTripEarnings = baseAmount + extraDistanceEarnings + bonusAmount;
    }

    const totalCombinedDistanceKm = r1Route.distance / 1000;
    const totalCombinedTimeMinutes = r1Route.duration / 60;

    // Build return object
    const returnObj = {
      delivery_id: deliveryId,
      can_accept: true,
      extra_distance_km: parseFloat(Math.max(0, extraDistanceKm).toFixed(2)),
      extra_time_minutes: parseFloat(Math.max(0, extraTimeMinutes).toFixed(1)),
      base_amount: parseFloat(baseAmount.toFixed(2)),
      extra_earnings: parseFloat(extraDistanceEarnings.toFixed(2)),
      bonus_amount: parseFloat(bonusAmount.toFixed(2)),
      this_delivery_earnings: parseFloat(
        activeDeliveryCount === 0
          ? baseAmount.toFixed(2)
          : (extraDistanceEarnings + bonusAmount).toFixed(2),
      ),
      total_trip_earnings: parseFloat(totalTripEarnings.toFixed(2)),
      first_delivery_earnings:
        activeDeliveryCount > 0
          ? parseFloat(firstDeliveryEarnings.toFixed(2))
          : null,
      total_combined_distance_km: parseFloat(
        totalCombinedDistanceKm.toFixed(2),
      ),
      estimated_time_minutes: Math.ceil(totalCombinedTimeMinutes),
      r0_distance_km: parseFloat((r0Route.distance / 1000).toFixed(2)),
      r1_distance_km: parseFloat((r1Route.distance / 1000).toFixed(2)),
      extra_calculation_method:
        activeDeliveryCount === 0 ? "FIRST_DELIVERY" : "R1 - R0",
      driver_to_restaurant_route: {
        coordinates: r1Route.geometry?.coordinates || null,
        encoded_polyline: r1Route.polyline || null,
      },
      restaurant_to_customer_route: {
        coordinates: null,
        encoded_polyline: null,
      },
    };

    if (activeDeliveryCount === 0) {
      returnObj.is_first_delivery = true;
      returnObj.driver_to_restaurant_km = parseFloat(
        driverToRestaurantKm.toFixed(3),
      );
      returnObj.paid_driver_to_restaurant_km = parseFloat(
        paidDriverToRestaurantKm.toFixed(3),
      );
      returnObj.restaurant_to_customer_km = parseFloat(
        restaurantToCustomerKm.toFixed(3),
      );
      returnObj.driver_to_restaurant_earnings = parseFloat(
        driverToRestaurantEarningsDisplay.toFixed(2),
      );
      returnObj.restaurant_to_customer_earnings = parseFloat(
        restaurantToCustomerEarningsDisplay.toFixed(2),
      );
    } else {
      returnObj.is_first_delivery = false;
    }

    return returnObj;
  } catch (error) {
    console.error(
      `[EVALUATE-OPTIMIZED] ❌ Error for order ${orderNumber}: ${error.message}`,
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
) {
  console.log(`\n\n${"=".repeat(80)}`);
  console.log(
    `[AVAILABLE DELIVERIES] 📋 Processing available deliveries for driver`,
  );
  console.log(`${"=".repeat(80)}`);

  try {
    // Step 1: Get driver's current route context (pass coordinates to ensure location is set)
    console.log(
      `\n[AVAILABLE DELIVERIES] Step 1️⃣ : Get driver's route context`,
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
        `[AVAILABLE DELIVERIES]   ✓ Updated driver location from query: (${driverLatitude}, ${driverLongitude})`,
      );
    }

    // Step 2: Fetch candidate deliveries (pending, no driver assigned)
    // Sort by res_accepted_at (restaurant acceptance time) - newest first
    console.log(
      `\n[AVAILABLE DELIVERIES] Step 2️⃣ : Fetch candidate deliveries (pending, sorted by res_accepted_at DESC)`,
    );
    const { data: candidateDeliveries, error: fetchError } = await supabaseAdmin
      .from("deliveries")
      .select(
        `
          id,
          order_id,
          status,
          res_accepted_at,
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
      `[AVAILABLE DELIVERIES]   ✓ Found ${candidateDeliveries?.length || 0} pending deliveries`,
    );

    if (!candidateDeliveries || candidateDeliveries.length === 0) {
      console.log(
        `[AVAILABLE DELIVERIES] ℹ️ No deliveries available right now`,
      );
      return {
        available_deliveries: [],
        total_available: 0,
        driver_location: routeContext.driver_location,
      };
    }

    // Step 3: Evaluate each candidate delivery
    console.log(
      `\n[AVAILABLE DELIVERIES] Step 3️⃣ : Evaluate each delivery as route extension`,
    );
    console.log(
      `[AVAILABLE DELIVERIES]   Processing ${candidateDeliveries.length} candidates...`,
    );

    // OPTIMIZATION: Pre-calculate R0 (current route) ONCE for all evaluations
    // This saves 1 OSRM call per delivery
    const startTime = Date.now();
    let preCalculatedR0 = null;

    if (routeContext.stops && routeContext.stops.length > 0) {
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
        const optimizedRestaurants = getOptimizedRestaurantOrder(
          driverLocation,
          currentRestaurants,
        );
        const lastRestaurant =
          optimizedRestaurants[optimizedRestaurants.length - 1];
        const optimizedCustomers = getOptimizedCustomerOrder(
          lastRestaurant,
          currentCustomers,
        );
        const r0Waypoints = [
          driverLocation,
          ...optimizedRestaurants,
          ...optimizedCustomers,
        ];

        preCalculatedR0 = await getOSRMRoute(
          r0Waypoints,
          "R0 - Pre-calculated",
        );
        console.log(
          `[AVAILABLE DELIVERIES]   ✓ R0 pre-calculated: ${(preCalculatedR0.distance / 1000).toFixed(2)} km`,
        );
      }
    }

    // OPTIMIZATION: Process deliveries in PARALLEL with concurrency limit
    const CONCURRENCY_LIMIT = 5; // Process 5 at a time to avoid rate limiting
    const evaluationResults = [];

    for (let i = 0; i < candidateDeliveries.length; i += CONCURRENCY_LIMIT) {
      const batch = candidateDeliveries.slice(i, i + CONCURRENCY_LIMIT);
      console.log(
        `[AVAILABLE DELIVERIES]   Processing batch ${Math.floor(i / CONCURRENCY_LIMIT) + 1}/${Math.ceil(candidateDeliveries.length / CONCURRENCY_LIMIT)} (${batch.length} deliveries)...`,
      );

      const batchResults = await Promise.all(
        batch.map(async (delivery) => {
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
              `[AVAILABLE DELIVERIES] ⚠️ Error evaluating delivery ${delivery.id}:`,
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

      evaluationResults.push(...batchResults);
    }

    const totalTime = Date.now() - startTime;
    console.log(
      `[AVAILABLE DELIVERIES]   ⏱️ Total evaluation time: ${totalTime}ms for ${candidateDeliveries.length} deliveries`,
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
            // Driver earnings breakdown:
            base_amount: result.base_amount, // 1st order's earnings (R0 × Rs.40)
            extra_earnings: result.extra_earnings, // Extra distance × Rs.40
            bonus_amount: result.bonus_amount, // Rs.25 for 2nd, Rs.30 for 3rd+
            total_trip_earnings: result.total_trip_earnings, // Base + Extra + Bonus
          },
          route_impact: {
            extra_distance_km: result.extra_distance_km,
            extra_time_minutes: result.extra_time_minutes,
            // Earnings breakdown:
            base_amount: result.base_amount, // 1st order's earnings (R0 × Rs.40)
            extra_earnings: result.extra_earnings, // Extra distance × Rs.40
            bonus_amount: result.bonus_amount, // Rs.25 for 2nd, Rs.30 for 3rd+
            total_trip_earnings: result.total_trip_earnings, // Base + Extra + Bonus
            // Route info:
            r0_distance_km: result.r0_distance_km,
            r1_distance_km: result.r1_distance_km,
            calculation_method: result.extra_calculation_method, // "R1 - R0"
          },
          total_delivery_distance_km: result.total_combined_distance_km, // R1 - Combined route distance
          estimated_time_minutes: result.estimated_time_minutes, // 🆕 Total time for this delivery
          route_geometry: result.route_geometry, // OSRM route geometry
          driver_to_restaurant_route: result.driver_to_restaurant_route, // 🆕 Blue route
          restaurant_to_customer_route: result.restaurant_to_customer_route, // 🆕 Orange route
        };
      });

    const rejectedDeliveries = evaluationResults
      .filter((result) => !result.can_accept)
      .map((result) => ({
        delivery_id: result.delivery_id,
        reason: result.reason,
      }));

    // Step 4: Display summary
    console.log(`\n[AVAILABLE DELIVERIES] Step 4️⃣ : Summary`);
    console.log(
      `[AVAILABLE DELIVERIES]   ✓ Accepted: ${acceptedDeliveries.length}`,
    );
    console.log(
      `[AVAILABLE DELIVERIES]   ✗ Rejected: ${rejectedDeliveries.length}`,
    );

    acceptedDeliveries.forEach((delivery) => {
      console.log(
        `[AVAILABLE DELIVERIES]     ✅ Order #${delivery.order_number}: Total ${delivery.total_delivery_distance_km}km, Extra +${delivery.route_impact.extra_distance_km}km, ${delivery.route_impact.extra_time_minutes}min`,
      );
    });

    rejectedDeliveries.forEach((delivery) => {
      console.log(
        `[AVAILABLE DELIVERIES]     ❌ ${delivery.delivery_id}: ${delivery.reason}`,
      );
    });

    console.log(
      `\n[AVAILABLE DELIVERIES] ✅ Complete: Showing ${acceptedDeliveries.length} available deliveries`,
    );
    console.log(`${"=".repeat(80)}\n`);

    return {
      available_deliveries: acceptedDeliveries,
      total_available: acceptedDeliveries.length,
      driver_location: routeContext.driver_location,
      current_route: {
        total_stops: routeContext.total_stops,
        active_deliveries: Math.ceil(routeContext.total_stops / 2),
      },
    };
  } catch (error) {
    console.error(`[AVAILABLE DELIVERIES] ❌ Fatal error: ${error.message}`);
    throw error;
  }
}

// Export the thresholds and earnings constants for external reference
export { AVAILABLE_DELIVERY_THRESHOLDS, DRIVER_EARNINGS };
