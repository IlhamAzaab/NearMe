/**
 * Google Maps Routing Service (Backend)
 * Replaces OSRM with Google Directions API
 *
 * IMPORTANT: This service tries multiple travel modes (TWO_WHEELER, DRIVING, WALKING)
 * and picks the SHORTEST route. This handles cases where Google Maps has inaccurate
 * data (e.g., buildings blocking roads that are actually passable).
 */

/**
 * Fetch route for a specific travel mode
 * @param {string} origin - Origin coordinates "lat,lng"
 * @param {string} destination - Destination coordinates "lat,lng"
 * @param {string} waypointsParam - Waypoints parameter string
 * @param {string} mode - Travel mode (driving, walking, two_wheeler)
 * @param {string} apiKey - Google Maps API key
 * @returns {Promise} Route data or null if failed
 */
async function fetchRouteForMode(
  origin,
  destination,
  waypointsParam,
  mode,
  apiKey,
) {
  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}${waypointsParam}&mode=${mode}&alternatives=true&key=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) return null;

    const data = await response.json();
    if (data.status !== "OK" || !data.routes || data.routes.length === 0)
      return null;

    // Find shortest route among alternatives for this mode
    let shortestRoute = data.routes[0];
    let shortestDistance = data.routes[0].legs.reduce(
      (sum, leg) => sum + leg.distance.value,
      0,
    );

    for (const route of data.routes) {
      const distance = route.legs.reduce(
        (sum, leg) => sum + leg.distance.value,
        0,
      );
      if (distance < shortestDistance) {
        shortestDistance = distance;
        shortestRoute = route;
      }
    }

    return {
      route: shortestRoute,
      distance: shortestDistance,
      mode: mode,
      alternativesCount: data.routes.length,
    };
  } catch (err) {
    console.log(`[GOOGLE MAPS] ⚠️ ${mode} mode failed: ${err.message}`);
    return null;
  }
}

/**
 * Get route using Google Directions API - tries multiple modes for shortest route
 * @param {Array} waypoints - Array of {lat, lng, label} objects
 * @param {string} context - Optional context for logging
 * @param {Object} options - Additional options (travelMode, optimize, findShortest)
 * @returns {Promise} Route data with distance, duration, geometry, and road segments
 */
export async function getGoogleRoute(waypoints, context = "", options = {}) {
  // Read API key at runtime (after dotenv has loaded)
  const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

  // findShortest: try multiple modes and pick the shortest (handles inaccurate map data)
  const findShortest = options.findShortest !== false; // Default to true
  const optimize = options.optimize !== false; // Default to true - optimize waypoint order

  console.log(
    `\n[GOOGLE MAPS] 🗺️ Getting route for ${waypoints.length} waypoints${context ? ` (${context})` : ""}`,
  );
  console.log(
    `[GOOGLE MAPS] 🔍 Find shortest across modes: ${findShortest}, Optimize waypoints: ${optimize}`,
  );

  if (!waypoints || waypoints.length < 2) {
    throw new Error("Need at least 2 waypoints for routing");
  }

  if (
    !GOOGLE_MAPS_API_KEY ||
    GOOGLE_MAPS_API_KEY === "YOUR_GOOGLE_MAPS_API_KEY_HERE"
  ) {
    console.error(
      "[GOOGLE MAPS] ❌ API key not configured. Please set GOOGLE_MAPS_API_KEY environment variable",
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
    // Add optimize:true to let Google find the best order for intermediate waypoints
    waypointsParam = optimize
      ? `&waypoints=optimize:true|${intermediateWaypoints}`
      : `&waypoints=${intermediateWaypoints}`;
  }

  // Try multiple travel modes to find the shortest route
  // This handles cases where Google Maps has inaccurate data (buildings blocking roads)
  // WALKING mode ignores most vehicle restrictions and gives more direct paths
  const modesToTry = findShortest
    ? ["two_wheeler", "driving", "walking"]
    : ["two_wheeler"];

  console.log(`[GOOGLE MAPS] → Trying modes: ${modesToTry.join(", ")}...`);

  // Fetch routes for all modes in parallel
  const routePromises = modesToTry.map((mode) =>
    fetchRouteForMode(
      origin,
      destination,
      waypointsParam,
      mode,
      GOOGLE_MAPS_API_KEY,
    ),
  );

  const routeResults = await Promise.all(routePromises);

  // Filter out failed attempts and find the shortest route
  const validRoutes = routeResults.filter((r) => r !== null);

  if (validRoutes.length === 0) {
    console.error("[GOOGLE MAPS] ❌ All travel modes failed");
    throw new Error("Google Maps: No valid routes found");
  }

  // Log all route distances for comparison
  console.log(`[GOOGLE MAPS] 📊 Route comparison:`);
  validRoutes.forEach((r) => {
    console.log(
      `[GOOGLE MAPS]   ${r.mode.toUpperCase()}: ${(r.distance / 1000).toFixed(3)} km (${r.alternativesCount} alternatives)`,
    );
  });

  // Select the shortest route across all modes
  const shortest = validRoutes.reduce((best, current) =>
    current.distance < best.distance ? current : best,
  );

  console.log(
    `[GOOGLE MAPS] ✅ Selected: ${shortest.mode.toUpperCase()} mode with ${(shortest.distance / 1000).toFixed(3)} km`,
  );

  const route = shortest.route;

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
          name: step.html_instructions?.replace(/<[^>]*>/g, "") || "unnamed", // Remove HTML tags
          distance: step.distance.value,
          duration: step.duration.value,
          coordinates: coordinates.map((coord) => [coord.lng, coord.lat]), // Convert to [lng, lat] format
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
      coordinates: fullRouteCoordinates.map((coord) => [coord.lng, coord.lat]), // [lng, lat] format
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
