/**
 * Google Maps Service
 * Handles routing and distance calculations using Google Maps Directions API
 */

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

/**
 * Calculate route using Google Directions API
 * @param {Array} waypoints - Array of {lat, lng, label} waypoints
 * @param {string} context - Optional context for logging
 * @returns {Promise} Route data with distance, duration, and geometry
 */
export async function getGoogleRoute(waypoints, context = "") {
  console.log(
    `\n[GOOGLE MAPS] 🗺️ Getting route for ${waypoints.length} waypoints${context ? ` (${context})` : ""}`,
  );

  if (!waypoints || waypoints.length < 2) {
    throw new Error("Need at least 2 waypoints for routing");
  }

  if (
    !GOOGLE_MAPS_API_KEY ||
    GOOGLE_MAPS_API_KEY === "YOUR_GOOGLE_MAPS_API_KEY_HERE"
  ) {
    console.error(
      "[GOOGLE MAPS] ❌ API key not configured. Please set VITE_GOOGLE_MAPS_API_KEY in .env file",
    );
    throw new Error("Google Maps API key not configured");
  }

  waypoints.forEach((wp, idx) => {
    const label = wp.label || `Point ${idx}`;
    console.log(
      `[GOOGLE MAPS]   ${idx}: ${label} (${wp.lat.toFixed(6)}, ${wp.lng.toFixed(6)})`,
    );
  });

  // Prepare origin and destination
  const origin = `${waypoints[0].lat},${waypoints[0].lng}`;
  const destination = `${waypoints[waypoints.length - 1].lat},${waypoints[waypoints.length - 1].lng}`;

  // Prepare waypoints (if more than 2 points)
  let waypointsParam = "";
  if (waypoints.length > 2) {
    const intermediateWaypoints = waypoints
      .slice(1, -1)
      .map((wp) => `${wp.lat},${wp.lng}`)
      .join("|");
    waypointsParam = `&waypoints=${intermediateWaypoints}`;
  }

  // Build URL for Directions API
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}${waypointsParam}&alternatives=true&key=${GOOGLE_MAPS_API_KEY}`;

  console.log(`[GOOGLE MAPS] → Requesting...`);

  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text();
    console.error(
      `[GOOGLE MAPS] ❌ HTTP ${response.status}: ${text.substring(0, 100)}`,
    );
    throw new Error(`Google Maps HTTP ${response.status}`);
  }

  const data = await response.json();

  if (data.status !== "OK") {
    console.error(
      `[GOOGLE MAPS] ❌ Error: ${data.status} - ${data.error_message || "No error message"}`,
    );
    throw new Error(`Google Maps error: ${data.status}`);
  }

  // Select the shortest route from alternatives
  let selectedRoute = data.routes[0]; // Default to first route
  if (data.routes && data.routes.length > 1) {
    // Find the route with minimum distance
    selectedRoute = data.routes.reduce((shortest, current) => {
      const currentDistance = current.legs.reduce(
        (sum, leg) => sum + leg.distance.value,
        0,
      );
      const shortestDistance = shortest.legs.reduce(
        (sum, leg) => sum + leg.distance.value,
        0,
      );
      return currentDistance < shortestDistance ? current : shortest;
    });
    const selectedDistance = selectedRoute.legs.reduce(
      (sum, leg) => sum + leg.distance.value,
      0,
    );
    console.log(
      `[GOOGLE MAPS] 🎯 Selected shortest route: ${(selectedDistance / 1000).toFixed(3)} km from ${data.routes.length} alternatives`,
    );
  }

  const route = selectedRoute;

  // Calculate total distance and duration from all legs
  const totalDistance = route.legs.reduce(
    (sum, leg) => sum + leg.distance.value,
    0,
  ); // meters
  const totalDuration = route.legs.reduce(
    (sum, leg) => sum + leg.duration.value,
    0,
  ); // seconds

  console.log(
    `[GOOGLE MAPS] ✓ Distance: ${(totalDistance / 1000).toFixed(3)} km`,
  );
  console.log(
    `[GOOGLE MAPS] ✓ Duration: ${Math.ceil(totalDuration / 60)} mins`,
  );

  // Extract road segments from steps for overlap calculation
  const roadSegments = [];
  route.legs.forEach((leg, legIdx) => {
    leg.steps.forEach((step, stepIdx) => {
      if (step.polyline && step.polyline.points) {
        // Decode polyline to get coordinates
        const coordinates = decodePolyline(step.polyline.points);
        roadSegments.push({
          legIdx,
          stepIdx,
          name: step.html_instructions || "unnamed",
          distance: step.distance.value,
          duration: step.duration.value,
          coordinates: coordinates,
        });
      }
    });
  });

  console.log(`[GOOGLE MAPS] ✓ Road segments (steps): ${roadSegments.length}`);

  // Extract full route polyline
  const polylinePoints = route.overview_polyline.points;
  const fullRouteCoordinates = decodePolyline(polylinePoints);

  return {
    distance: totalDistance,
    duration: totalDuration,
    geometry: {
      type: "LineString",
      coordinates: fullRouteCoordinates.map((coord) => [coord.lng, coord.lat]), // [lng, lat] format for consistency
    },
    roadSegments: roadSegments,
    polyline: polylinePoints,
    legs: route.legs,
  };
}

/**
 * Decode Google Maps polyline to array of coordinates
 * @param {string} encoded - Encoded polyline string
 * @returns {Array} Array of {lat, lng} coordinates
 */
function decodePolyline(encoded) {
  const poly = [];
  let index = 0,
    len = encoded.length;
  let lat = 0,
    lng = 0;

  while (index < len) {
    let b,
      shift = 0,
      result = 0;
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
  return R * c; // Distance in meters
}

/**
 * Get complete optimized route: Driver → Restaurant → Customer
 * Same logic as OSRM implementation
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
  const driverToRestaurantRoute = await getGoogleRoute(
    [driverLocation, restaurantLocation],
    "Driver to Restaurant",
  );
  console.log(
    `[COMPLETE-ROUTE] → Driver to Restaurant: ${(driverToRestaurantRoute.distance / 1000).toFixed(3)} km`,
  );

  // Step 2: Calculate restaurant-to-customer options and find best
  console.log(`[COMPLETE-ROUTE] → Evaluating restaurant-to-customer options:`);

  // Option 1: Direct restaurant to customer
  const directRoute = await getGoogleRoute(
    [restaurantLocation, customerLocation],
    "Direct Restaurant to Customer",
  );
  console.log(
    `[COMPLETE-ROUTE]   Option 1 (Direct): ${(directRoute.distance / 1000).toFixed(3)} km`,
  );

  // Option 2: Restaurant → Driver location → Customer (return via same path)
  const returnViaDriverRoute = await getGoogleRoute(
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
  };
}
