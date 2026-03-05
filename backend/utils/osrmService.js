/**
 * ============================================================================
 * OSRM Routing Service (Backend)
 * ============================================================================
 *
 * Uses OSRM (Open Source Routing Machine) for route calculation
 * Public OSRM server: https://router.project-osrm.org
 *
 * Features:
 * - No API key required
 * - Free and open source
 * - Supports driving, walking, cycling profiles
 *
 * Travel modes:
 * - driving → OSRM 'driving' profile (car/motorcycle)
 * - walking → OSRM 'foot' profile (pedestrians)
 *
 * FALLBACK: When OSRM is unavailable, uses Haversine distance calculation
 * with a 1.4x multiplier to approximate road distance
 * ============================================================================
 */

// Public OSRM server URL (free, no API key required)
const OSRM_BASE_URL = process.env.OSRM_URL || "https://router.project-osrm.org";

// Flag to track if OSRM is available (to avoid repeated failed attempts)
let osrmAvailable = true;
let osrmLastCheckTime = 0;
const OSRM_RETRY_INTERVAL = 60000; // Retry OSRM every 60 seconds after failure

// ============================================================================
// OSRM ROUTE CACHE — avoids redundant network calls for identical segments
// ============================================================================
// Key = rounded coordinates (4 decimals ≈ 11m precision), Value = { result, timestamp }
const osrmRouteCache = new Map();
const OSRM_CACHE_TTL_MS = 5 * 60 * 1000; // Cache routes for 5 minutes
const OSRM_CACHE_MAX_SIZE = 500; // Max entries to prevent memory leak

// Minimum distance (meters) between two points to bother calling OSRM
// Below this, we return zero-distance immediately
const OSRM_MIN_SEGMENT_DISTANCE_M = 50;

function makeRouteCacheKey(waypoints) {
  // Round to 4 decimals (~11m) for cache key stability
  return waypoints
    .map((wp) => `${wp.lat.toFixed(4)},${wp.lng.toFixed(4)}`)
    .join("|");
}

function getCachedRoute(key) {
  const entry = osrmRouteCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > OSRM_CACHE_TTL_MS) {
    osrmRouteCache.delete(key);
    return null;
  }
  return entry.result;
}

function setCachedRoute(key, result) {
  // Evict oldest entries if cache is full
  if (osrmRouteCache.size >= OSRM_CACHE_MAX_SIZE) {
    const firstKey = osrmRouteCache.keys().next().value;
    osrmRouteCache.delete(firstKey);
  }
  osrmRouteCache.set(key, { result, timestamp: Date.now() });
}

/**
 * Haversine distance calculation (fallback when OSRM is unavailable)
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} Distance in meters
 */
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

/**
 * Calculate fallback route using Haversine distance
 * @param {Array} waypoints - Array of {lat, lng, label} waypoints
 * @returns {Object} Route data with distance, duration, geometry
 */
function calculateFallbackRoute(waypoints) {
  let totalDistance = 0;
  const coordinates = [];
  const legs = [];

  for (let i = 0; i < waypoints.length; i++) {
    coordinates.push([waypoints[i].lng, waypoints[i].lat]);

    if (i < waypoints.length - 1) {
      const segmentDistance = haversineDistance(
        waypoints[i].lat,
        waypoints[i].lng,
        waypoints[i + 1].lat,
        waypoints[i + 1].lng,
      );
      // Multiply by 1.4 to approximate road distance (roads are not straight)
      const roadDistance = segmentDistance * 1.4;
      totalDistance += roadDistance;

      legs.push({
        distance: roadDistance,
        duration: (roadDistance / 1000) * 60 * 3, // Assume 20 km/h average speed = 3 mins per km
        steps: [
          {
            name: "Direct route",
            distance: roadDistance,
            duration: (roadDistance / 1000) * 60 * 3,
            geometry: {
              type: "LineString",
              coordinates: [
                [waypoints[i].lng, waypoints[i].lat],
                [waypoints[i + 1].lng, waypoints[i + 1].lat],
              ],
            },
          },
        ],
      });
    }
  }

  // Average walking/motorcycle speed of ~20 km/h
  const totalDuration = (totalDistance / 1000) * 60 * 3; // seconds

  return {
    distance: totalDistance,
    duration: totalDuration,
    geometry: {
      type: "LineString",
      coordinates: coordinates,
    },
    roadSegments: legs.flatMap((leg, legIdx) =>
      leg.steps.map((step, stepIdx) => ({
        legIdx,
        stepIdx,
        name: step.name,
        distance: step.distance,
        duration: step.duration,
        coordinates: step.geometry.coordinates,
      })),
    ),
    polyline: "",
    legs: legs,
    isFallback: true,
  };
}

/**
 * Fetch route for a specific travel mode from OSRM
 * @param {Array} waypoints - Array of {lat, lng} waypoints
 * @param {string} profile - OSRM profile: 'driving', 'foot', 'bike'
 * @returns {Promise} Route data or null if failed
 */
async function fetchRouteForProfile(waypoints, profile) {
  try {
    // OSRM uses format: lng,lat;lng,lat (opposite of Google Maps)
    const coordinates = waypoints.map((wp) => `${wp.lng},${wp.lat}`).join(";");

    const url = `${OSRM_BASE_URL}/route/v1/${profile}/${coordinates}?overview=full&geometries=geojson&steps=true&alternatives=true`;

    // Set a timeout for the fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = await response.json();

    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
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

    // Mark OSRM as available since we got a successful response
    osrmAvailable = true;

    return {
      route: shortestRoute,
      distance: shortestDistance,
      profile: profile,
      alternativesCount: data.routes.length,
    };
  } catch (err) {
    console.log(`[OSRM] ⚠️ ${profile} profile failed: ${err.message}`);
    return null;
  }
}

/**
 * Get route using OSRM - uses FOOT (walking) profile for shortest distance
 * Falls back to Haversine calculation when OSRM is unavailable
 *
 * @param {Array} waypoints - Array of {lat, lng, label} objects
 * @param {string} context - Optional context for logging
 * @param {Object} options - Additional options (useSingleMode, optimize)
 * @returns {Promise} Route data with distance, duration, geometry, and road segments
 */
export async function getOSRMRoute(waypoints, context = "", options = {}) {
  // Use FOOT (walking) profile by default (shortest distance)
  const useSingleMode = options.useSingleMode !== false;
  const optimize = options.optimize !== false;

  if (!waypoints || waypoints.length < 2) {
    throw new Error("Need at least 2 waypoints for routing");
  }

  // ── Zero-distance skip: if all waypoints are within 50m, return zero immediately ──
  if (waypoints.length === 2) {
    const microDist = haversineDistance(
      waypoints[0].lat,
      waypoints[0].lng,
      waypoints[1].lat,
      waypoints[1].lng,
    );
    if (microDist < OSRM_MIN_SEGMENT_DISTANCE_M) {
      // Points are essentially the same spot — skip OSRM call entirely
      return {
        distance: 0,
        duration: 0,
        geometry: {
          type: "LineString",
          coordinates: [
            [waypoints[0].lng, waypoints[0].lat],
            [waypoints[1].lng, waypoints[1].lat],
          ],
        },
        roadSegments: [],
        polyline: "",
        legs: [],
        isFallback: false,
        isZeroDistance: true,
      };
    }
  }

  // ── Cache lookup ──
  const cacheKey = makeRouteCacheKey(waypoints);
  const cached = getCachedRoute(cacheKey);
  if (cached) {
    return cached;
  }

  console.log(
    `\n[OSRM] 🗺️ Getting route for ${waypoints.length} waypoints${context ? ` (${context})` : ""}`,
  );

  waypoints.forEach((wp, idx) => {
    const label = wp.label || `Point ${idx}`;
    console.log(
      `[OSRM]   ${idx}: ${label} (${wp.lat.toFixed(6)}, ${wp.lng.toFixed(6)})`,
    );
  });

  // Check if we should retry OSRM after previous failures
  const now = Date.now();
  if (!osrmAvailable && now - osrmLastCheckTime > OSRM_RETRY_INTERVAL) {
    console.log(`[OSRM] 🔄 Retrying OSRM after cooldown period...`);
    osrmAvailable = true; // Allow retry
  }

  // If OSRM was marked as unavailable, use fallback directly
  if (!osrmAvailable) {
    console.log(`[OSRM] ⚠️ OSRM unavailable, using Haversine fallback`);
    const fallbackResult = calculateFallbackRoute(waypoints);
    console.log(
      `[OSRM] ✓ Fallback Distance: ${(fallbackResult.distance / 1000).toFixed(3)} km`,
    );
    console.log(
      `[OSRM] ✓ Fallback Duration: ${Math.ceil(fallbackResult.duration / 60)} mins`,
    );
    return fallbackResult;
  }

  // For optimization with waypoints, we need to use OSRM's trip service
  // For now, we'll use the simple route service
  let orderedWaypoints = [...waypoints];

  // Try multiple travel profiles to find the shortest route
  // FOOT profile gives shortest distance (suitable for motorcycles too in narrow streets)
  // Single mode: Just use FOOT (optimized for shortest distance)
  const profilesToTry = useSingleMode ? ["foot"] : ["driving", "foot"];

  console.log(`[OSRM] → Trying profiles: ${profilesToTry.join(", ")}...`);

  // Fetch routes for all profiles in parallel
  const routePromises = profilesToTry.map((profile) =>
    fetchRouteForProfile(orderedWaypoints, profile),
  );

  const routeResults = await Promise.all(routePromises);

  // Filter out failed attempts and find the shortest route
  const validRoutes = routeResults.filter((r) => r !== null);

  if (validRoutes.length === 0) {
    console.log(
      "[OSRM] ⚠️ All travel profiles failed, using Haversine fallback",
    );

    // Mark OSRM as unavailable and record time
    osrmAvailable = false;
    osrmLastCheckTime = now;

    const fallbackResult = calculateFallbackRoute(waypoints);
    console.log(
      `[OSRM] ✓ Fallback Distance: ${(fallbackResult.distance / 1000).toFixed(3)} km`,
    );
    console.log(
      `[OSRM] ✓ Fallback Duration: ${Math.ceil(fallbackResult.duration / 60)} mins`,
    );
    return fallbackResult;
  }

  // Log all route distances for comparison
  console.log(`[OSRM] 📊 Route comparison:`);
  validRoutes.forEach((r) => {
    console.log(
      `[OSRM]   ${r.profile.toUpperCase()}: ${(r.distance / 1000).toFixed(3)} km (${r.alternativesCount} alternatives)`,
    );
  });

  // Select the shortest route across all profiles
  const shortest = validRoutes.reduce((best, current) =>
    current.distance < best.distance ? current : best,
  );

  console.log(
    `[OSRM] ✅ Selected: ${shortest.profile.toUpperCase()} profile with ${(shortest.distance / 1000).toFixed(3)} km`,
  );

  const route = shortest.route;

  // OSRM returns distance in meters and duration in seconds
  const totalDistance = route.distance; // meters
  const totalDuration = route.duration; // seconds

  console.log(`[OSRM] ✓ Distance: ${(totalDistance / 1000).toFixed(3)} km`);
  console.log(`[OSRM] ✓ Duration: ${Math.ceil(totalDuration / 60)} mins`);

  // Extract road segments from steps for overlap calculation
  // OSRM structure: route.legs[].steps[]
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
              coordinates: step.geometry.coordinates, // Already in [lng, lat] format
            });
          }
        });
      }
    });
  }

  console.log(`[OSRM] ✓ Road segments (steps): ${roadSegments.length}`);

  // ── Store in cache before returning ──
  // (We'll set the cache after building the final result below)

  // Extract full route geometry (GeoJSON format from OSRM)
  // OSRM returns geometry in GeoJSON format when geometries=geojson
  const geometry = route.geometry; // { type: "LineString", coordinates: [[lng, lat], ...] }

  // Create encoded polyline for compatibility (if needed)
  // OSRM can return polyline format with geometries=polyline
  const polyline = encodePolyline(geometry.coordinates);

  const finalResult = {
    distance: totalDistance,
    duration: totalDuration,
    geometry: geometry, // GeoJSON LineString: { type: "LineString", coordinates: [[lng, lat], ...] }
    roadSegments: roadSegments,
    polyline: polyline, // Encoded polyline string for compatibility
    legs: route.legs || [],
  };

  // Store in cache
  setCachedRoute(cacheKey, finalResult);

  return finalResult;
}

/**
 * Encode coordinates array to polyline string
 * (For compatibility with code expecting Google-style polyline)
 * @param {Array} coordinates - Array of [lng, lat] coordinates
 * @returns {string} Encoded polyline string
 */
function encodePolyline(coordinates) {
  if (!coordinates || coordinates.length === 0) return "";

  let encoded = "";
  let prevLat = 0;
  let prevLng = 0;

  for (const coord of coordinates) {
    const lat = Math.round(coord[1] * 1e5); // coord is [lng, lat]
    const lng = Math.round(coord[0] * 1e5);

    encoded += encodeNumber(lat - prevLat);
    encoded += encodeNumber(lng - prevLng);

    prevLat = lat;
    prevLng = lng;
  }

  return encoded;
}

/**
 * Encode a single number for polyline
 * @param {number} num - Number to encode
 * @returns {string} Encoded string
 */
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
 * (For compatibility with existing code)
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

export default {
  getOSRMRoute,
  decodePolyline,
};
