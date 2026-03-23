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
 * - Uses FOOT (walking) profile for shortest distance through small lanes
 *
 * Travel mode:
 * - FOOT profile ONLY (pedestrian/walking routes)
 * - Optimal for motorcycle/bike riders on short distances
 * - Uses small lanes and shortcuts instead of main roads
 * - Provides shortest actual distance for delivery fee calculation
 *
 * OSRM-ONLY POLICY: When OSRM is unavailable, returns explicit unavailable state.
 * No Haversine fallback for route calculations - all user-facing routes
 * must use actual road-based routing for accuracy.
 * ============================================================================
 */

// OSRM server URLs for retry strategy
const OSRM_PRIMARY_URL =
  process.env.OSRM_URL || "https://router.project-osrm.org";
const OSRM_BACKUP_URL =
  process.env.OSRM_BACKUP_URL || "https://routing.openstreetmap.de/routed-foot";
const OSRM_BASE_URL = OSRM_PRIMARY_URL; // Default for compatibility

// Flag to track if OSRM is available (to avoid repeated failed attempts)
let osrmAvailable = true;
let osrmLastCheckTime = 0;
const OSRM_RETRY_INTERVAL = 30000; // Retry OSRM every 30 seconds after failure (reduced from 60s)
const OSRM_MAX_RETRIES = 3; // Number of retry attempts per request
const OSRM_RETRY_BACKOFF_MS = [1000, 2000, 3000]; // Backoff delays for retries

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
 * Haversine distance calculation - ONLY for proximity/geometric checks (NOT for routing)
 * This is kept for internal micro-distance checks (<50m) only.
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} Distance in meters
 */
function haversineDistanceForProximityOnly(lat1, lng1, lat2, lng2) {
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
 * Create unavailable route result (replaces Haversine fallback)
 * Returns explicit unavailable state instead of estimated distances
 * @param {Array} waypoints - Array of {lat, lng, label} waypoints
 * @param {string} reason - Reason for unavailability
 * @returns {Object} Unavailable route result
 */
function createUnavailableRouteResult(waypoints, reason = "OSRM unavailable") {
  console.log(`[OSRM] ⚠️ Route unavailable: ${reason}`);
  return {
    distance: null,
    duration: null,
    geometry: {
      type: "LineString",
      coordinates: waypoints.map((wp) => [wp.lng, wp.lat]),
    },
    roadSegments: [],
    polyline: "",
    legs: [],
    isUnavailable: true,
    unavailableReason: reason,
    // Provide basic straight-line coordinates for display fallback (not for distance)
    straightLineCoordinates: waypoints.map((wp) => [wp.lng, wp.lat]),
  };
}

/**
 * Fetch route for a specific travel mode from OSRM with retry support
 * @param {Array} waypoints - Array of {lat, lng} waypoints
 * @param {string} profile - OSRM profile: 'driving', 'foot', 'bike'
 * @param {string} baseUrl - OSRM server base URL
 * @param {number} retryAttempt - Current retry attempt (for backoff)
 * @returns {Promise} Route data or null if failed
 */
async function fetchRouteForProfile(
  waypoints,
  profile,
  baseUrl = OSRM_PRIMARY_URL,
  retryAttempt = 0,
) {
  try {
    // OSRM uses format: lng,lat;lng,lat (opposite of Google Maps)
    const coordinates = waypoints.map((wp) => `${wp.lng},${wp.lat}`).join(";");

    const url = `${baseUrl}/route/v1/${profile}/${coordinates}?overview=full&geometries=geojson&steps=true&alternatives=true`;

    // Set a timeout for the fetch request (increasing with retry)
    const controller = new AbortController();
    const timeoutMs = 8000 + retryAttempt * 2000; // 8s, 10s, 12s
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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
      serverUsed: baseUrl,
    };
  } catch (err) {
    console.log(
      `[OSRM] ⚠️ ${profile} profile failed (${baseUrl}): ${err.message}`,
    );
    return null;
  }
}

/**
 * Get route using OSRM - uses FOOT (walking) profile for shortest distance
 * OSRM-ONLY: Returns unavailable state when OSRM fails (no Haversine fallback)
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
  // This is a geometric proximity check, not a route calculation
  if (waypoints.length === 2) {
    const microDist = haversineDistanceForProximityOnly(
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

  // If OSRM was marked as unavailable, return unavailable state directly
  if (!osrmAvailable) {
    console.log(
      `[OSRM] ⚠️ OSRM circuit breaker active, returning unavailable state`,
    );
    return createUnavailableRouteResult(
      waypoints,
      "OSRM service temporarily unavailable",
    );
  }

  // For optimization with waypoints, we need to use OSRM's trip service
  // For now, we'll use the simple route service
  let orderedWaypoints = [...waypoints];

  // ===== OSRM-ONLY RETRY STRATEGY =====
  // ALWAYS use FOOT profile (walking) for shortest distance through small lanes
  // Foot routing is optimal for motorcycle/bike riders on short distances
  // 1. Try primary OSRM server with foot profile
  // 2. Retry with backoff
  // 3. Try backup OSRM server with foot profile
  // 4. If all fail, return unavailable state (NO Haversine fallback)

  const profilesToTry = ["foot"]; // ALWAYS foot - shortest distance through lanes
  const serversToTry = [OSRM_PRIMARY_URL, OSRM_BACKUP_URL].filter(Boolean);

  console.log(`[OSRM] → Using profile: FOOT (walking) for shortest routes`);
  console.log(`[OSRM] → Available servers: ${serversToTry.length}`);

  // Try each server with retry backoff
  for (let serverIdx = 0; serverIdx < serversToTry.length; serverIdx++) {
    const serverUrl = serversToTry[serverIdx];
    console.log(
      `[OSRM] → Attempting server ${serverIdx + 1}/${serversToTry.length}: ${serverUrl}`,
    );

    // Try each profile on this server
    for (let retry = 0; retry <= OSRM_MAX_RETRIES; retry++) {
      if (retry > 0) {
        const backoffMs = OSRM_RETRY_BACKOFF_MS[retry - 1] || 3000;
        console.log(
          `[OSRM] → Retry ${retry}/${OSRM_MAX_RETRIES} after ${backoffMs}ms backoff`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }

      // Fetch routes for all profiles in parallel on this attempt
      const routePromises = profilesToTry.map((profile) =>
        fetchRouteForProfile(orderedWaypoints, profile, serverUrl, retry),
      );

      const routeResults = await Promise.all(routePromises);

      // Filter out failed attempts and find the shortest route
      const validRoutes = routeResults.filter((r) => r !== null);

      if (validRoutes.length > 0) {
        // Success! Log comparison and return best route
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

        console.log(
          `[OSRM] ✓ Distance: ${(totalDistance / 1000).toFixed(3)} km`,
        );
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
                    coordinates: step.geometry.coordinates,
                  });
                }
              });
            }
          });
        }

        console.log(`[OSRM] ✓ Road segments (steps): ${roadSegments.length}`);

        // Extract full route geometry
        const geometry = route.geometry;
        const polyline = encodePolyline(geometry.coordinates);

        const finalResult = {
          distance: totalDistance,
          duration: totalDuration,
          geometry: geometry,
          roadSegments: roadSegments,
          polyline: polyline,
          legs: route.legs || [],
          serverUsed: serverUrl,
        };

        // Store in cache
        setCachedRoute(cacheKey, finalResult);

        return finalResult;
      }
    }
  }

  // All retries on all servers failed - mark OSRM as unavailable
  console.log(
    "[OSRM] ❌ All OSRM servers and retries exhausted - returning unavailable state",
  );
  osrmAvailable = false;
  osrmLastCheckTime = now;

  return createUnavailableRouteResult(
    waypoints,
    "All OSRM servers failed after multiple retries",
  );
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
