/**
 * ============================================================================
 * OSRM Service (Frontend)
 * ============================================================================
 *
 * Uses OSRM (Open Source Routing Machine) for route calculation
 * Public OSRM server: https://router.project-osrm.org
 *
 * Features:
 * - Free and open source, no API key required
 * - Uses FOOT (walking) profile for shortest distance through small lanes
 * - Optimal for motorcycle/bike riders on short distances
 * ============================================================================
 */

// Public OSRM server URL (free, no API key required)
const OSRM_BASE_URL =
  import.meta.env.VITE_OSRM_URL || "https://router.project-osrm.org";

/**
 * Fetch route for a specific travel profile from OSRM
 * @param {Array} waypoints - Array of {lat, lng} waypoints
 * @param {string} profile - OSRM profile: 'driving', 'foot', 'bike'
 * @returns {Promise} Route data or null if failed
 */
async function fetchRouteForProfile(waypoints, profile) {
  try {
    // OSRM uses format: lng,lat;lng,lat
    const coordinates = waypoints.map((wp) => `${wp.lng},${wp.lat}`).join(";");

    const url = `${OSRM_BASE_URL}/route/v1/${profile}/${coordinates}?overview=full&geometries=geojson&steps=true&alternatives=true`;

    console.log(`[OSRM] → Fetching ${profile} route...`);

    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`[OSRM] ⚠️ ${profile} HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
      console.warn(`[OSRM] ⚠️ ${profile} returned: ${data.code}`);
      return null;
    }

    // Find shortest route among alternatives
    let shortestRoute = data.routes[0];
    let shortestDistance = data.routes[0].distance;

    for (const route of data.routes) {
      if (route.distance < shortestDistance) {
        shortestDistance = route.distance;
        shortestRoute = route;
      }
    }

    return {
      route: shortestRoute,
      distance: shortestDistance,
      profile: profile,
      alternativesCount: data.routes.length,
    };
  } catch (err) {
    console.warn(`[OSRM] ⚠️ ${profile} failed: ${err.message}`);
    return null;
  }
}

/**
 * Calculate route using OSRM
 * Same interface as getGoogleRoute() for drop-in replacement
 *
 * @param {Array} waypoints - Array of {lat, lng, label} waypoints
 * @param {string} context - Optional context for logging
 * @returns {Promise} Route data with distance, duration, and geometry
 */
export async function getOSRMRoute(waypoints, context = "") {
  console.log(
    `\n[OSRM] 🗺️ Getting route for ${waypoints.length} waypoints${context ? ` (${context})` : ""}`,
  );

  if (!waypoints || waypoints.length < 2) {
    throw new Error("Need at least 2 waypoints for routing");
  }

  waypoints.forEach((wp, idx) => {
    const label = wp.label || `Point ${idx}`;
    console.log(
      `[OSRM]   ${idx}: ${label} (${wp.lat.toFixed(6)}, ${wp.lng.toFixed(6)})`,
    );
  });

  // ALWAYS use FOOT profile - shortest distance through small lanes
  // Optimal for motorcycle/bike riders on short distances
  const profilesToTry = ["foot"];

  console.log(`[OSRM] → Using profile: FOOT (walking) for shortest routes`);

  // Fetch routes for all profiles in parallel
  const routePromises = profilesToTry.map((profile) =>
    fetchRouteForProfile(waypoints, profile),
  );

  const routeResults = await Promise.all(routePromises);

  // Filter out failed attempts
  const validRoutes = routeResults.filter((r) => r !== null);

  if (validRoutes.length === 0) {
    console.error("[OSRM] ❌ FOOT profile failed");
    throw new Error(
      "OSRM: No valid routes found. Please check your internet connection.",
    );
  }

  // Use the foot route
  const shortest = validRoutes[0];

  console.log(
    `[OSRM] ✅ FOOT route: ${(shortest.distance / 1000).toFixed(3)} km (${shortest.alternativesCount} alternatives)`,
  );

  const route = shortest.route;

  // OSRM returns distance in meters and duration in seconds
  const totalDistance = route.distance;
  const totalDuration = route.duration;

  console.log(`[OSRM] ✓ Distance: ${(totalDistance / 1000).toFixed(3)} km`);
  console.log(`[OSRM] ✓ Duration: ${Math.ceil(totalDuration / 60)} mins`);

  // Extract road segments from steps for overlap calculation
  const roadSegments = [];
  if (route.legs) {
    route.legs.forEach((leg, legIdx) => {
      if (leg.steps) {
        leg.steps.forEach((step, stepIdx) => {
          if (step.geometry && step.geometry.coordinates) {
            roadSegments.push({
              legIdx,
              stepIdx,
              name: step.name || "unnamed",
              distance: step.distance,
              duration: step.duration,
              // Convert [lng, lat] to {lat, lng} format for consistency
              coordinates: step.geometry.coordinates.map((coord) => ({
                lat: coord[1],
                lng: coord[0],
              })),
            });
          }
        });
      }
    });
  }

  console.log(`[OSRM] ✓ Road segments (steps): ${roadSegments.length}`);

  // Extract full route geometry
  const geometry = route.geometry;

  // Convert GeoJSON coordinates to {lat, lng} format
  const fullRouteCoordinates = geometry.coordinates.map((coord) => ({
    lat: coord[1],
    lng: coord[0],
  }));

  // Create encoded polyline for compatibility
  const polyline = encodePolyline(geometry.coordinates);

  return {
    distance: totalDistance,
    duration: totalDuration,
    geometry: {
      type: "LineString",
      coordinates: geometry.coordinates, // Keep as [lng, lat] format
    },
    roadSegments: roadSegments,
    polyline: polyline,
    legs: route.legs || [],
    // Additional properties for Leaflet
    decodedCoordinates: fullRouteCoordinates, // {lat, lng} format for Leaflet
  };
}

/**
 * Encode coordinates array to polyline string
 * @param {Array} coordinates - Array of [lng, lat] coordinates
 * @returns {string} Encoded polyline string
 */
function encodePolyline(coordinates) {
  if (!coordinates || coordinates.length === 0) return "";

  let encoded = "";
  let prevLat = 0;
  let prevLng = 0;

  for (const coord of coordinates) {
    const lat = Math.round(coord[1] * 1e5);
    const lng = Math.round(coord[0] * 1e5);

    encoded += encodeNumber(lat - prevLat);
    encoded += encodeNumber(lng - prevLng);

    prevLat = lat;
    prevLng = lng;
  }

  return encoded;
}

function encodeNumber(num) {
  let value = num < 0 ? ~(num << 1) : num << 1;
  let encoded = "";

  while (value >= 0x20) {
    encoded += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
    value >>= 5;
  }
  encoded += String.fromCharCode(value + 63);

  return encoded;
}

/**
 * Decode polyline to array of coordinates
 * @param {string} encoded - Encoded polyline string
 * @returns {Array} Array of {lat, lng} coordinates
 */
export function decodePolyline(encoded) {
  if (!encoded) return [];

  const poly = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    poly.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return poly;
}

/**
 * Calculate haversine distance between two points
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} Distance in meters
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
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
  return R * c;
}

/**
 * Get complete optimized route: Driver → Restaurant → Customer
 */
export async function getCompleteOptimizedRoute(
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

  console.log(
    `[COMPLETE-ROUTE] ✓ Total Distance: ${(totalDistance / 1000).toFixed(3)} km`,
  );

  return {
    distance: totalDistance,
    duration: totalDuration,
    driverToRestaurantGeometry: driverToRestaurantRoute.geometry,
    restaurantToCustomerGeometry: bestRestaurantToCustomer.route.geometry,
    driverToRestaurantPolyline: driverToRestaurantRoute.polyline,
    restaurantToCustomerPolyline: bestRestaurantToCustomer.route.polyline,
    driverToRestaurantDistance: driverToRestaurantRoute.distance,
    restaurantToCustomerDistance: bestRestaurantToCustomer.route.distance,
    selectedOption: bestRestaurantToCustomer.option,
    // Additional for Leaflet
    driverToRestaurantCoords: driverToRestaurantRoute.decodedCoordinates,
    restaurantToCustomerCoords:
      bestRestaurantToCustomer.route.decodedCoordinates,
  };
}

/**
 * Alias for backward compatibility
 * Code that imports getGoogleRoute can use this directly
 */
export const getGoogleRoute = getOSRMRoute;

export default {
  getOSRMRoute,
  getGoogleRoute: getOSRMRoute,
  getCompleteOptimizedRoute,
  haversineDistance,
  decodePolyline,
};
