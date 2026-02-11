/**
 * ============================================================================
 * OSRM Directions Hook
 * ============================================================================
 *
 * Uses OSRM (Open Source Routing Machine) for route calculation
 * Free, no API key required
 * ============================================================================
 */
import { useCallback, useRef } from "react";
import { routeCache } from "../utils/routeCache";

// Public OSRM server URL
const OSRM_BASE_URL =
  import.meta.env.VITE_OSRM_URL || "https://router.project-osrm.org";

export function useOSRMDirections() {
  const pendingRequestsRef = useRef(new Map());

  /**
   * Calculate optimized route for multiple deliveries
   * @param {Object} origin - Driver location {lat, lng}
   * @param {Array} waypoints - Array of waypoint locations [{lat, lng}]
   * @param {Object} destination - Final destination {lat, lng}
   * @param {boolean} optimizeWaypoints - Whether to optimize waypoint order (using OSRM trip service)
   * @returns {Promise<Object>} Route result
   */
  const calculateOptimizedRoute = useCallback(
    async (origin, waypoints, destination, optimizeWaypoints = true) => {
      // Build all points array
      const allPoints = [origin, ...waypoints, destination];

      // Generate cache key
      const cacheKey = routeCache.generateKey(origin, destination, waypoints);

      // Check cache first
      const cached = routeCache.get(cacheKey);
      if (cached) {
        console.log("[OSRM] Using cached route");
        return cached;
      }

      // Check for pending request with same key
      if (pendingRequestsRef.current.has(cacheKey)) {
        console.log("[OSRM] Waiting for pending request");
        return pendingRequestsRef.current.get(cacheKey);
      }

      // Create request promise
      const requestPromise = (async () => {
        try {
          // OSRM coordinates format: lng,lat;lng,lat
          const coordinates = allPoints
            .map((wp) => `${wp.lng},${wp.lat}`)
            .join(";");

          // Use trip service for optimization if requested and we have waypoints
          let url;
          if (optimizeWaypoints && waypoints.length > 1) {
            // Trip service optimizes the order of waypoints
            url = `${OSRM_BASE_URL}/trip/v1/driving/${coordinates}?source=first&destination=last&roundtrip=false&overview=full&geometries=geojson&steps=true`;
          } else {
            // Regular route service
            url = `${OSRM_BASE_URL}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true&alternatives=true`;
          }

          console.log("[OSRM] Fetching route...");
          const response = await fetch(url);

          if (!response.ok) {
            throw new Error(`OSRM HTTP ${response.status}`);
          }

          const data = await response.json();

          if (data.code !== "Ok") {
            throw new Error(`OSRM error: ${data.code}`);
          }

          // Get the route (trip service uses 'trips', route service uses 'routes')
          const route = data.trips?.[0] || data.routes?.[0];

          if (!route) {
            throw new Error("No route found");
          }

          // Convert OSRM response to Google Directions-like format
          const result = convertToGoogleFormat(route, data.waypoints || []);

          // Cache the result
          routeCache.set(cacheKey, result);

          return result;
        } finally {
          // Remove from pending requests
          pendingRequestsRef.current.delete(cacheKey);
        }
      })();

      // Store pending request
      pendingRequestsRef.current.set(cacheKey, requestPromise);

      return requestPromise;
    },
    [],
  );

  /**
   * Calculate single route (no waypoints)
   * @param {Object} origin - Start location {lat, lng}
   * @param {Object} destination - End location {lat, lng}
   * @returns {Promise<Object>} Route result
   */
  const calculateSingleRoute = useCallback(
    async (origin, destination) => {
      return calculateOptimizedRoute(origin, [], destination, false);
    },
    [calculateOptimizedRoute],
  );

  /**
   * Calculate route (traffic not available in OSRM, falls back to regular route)
   * @param {Object} origin - Start location {lat, lng}
   * @param {Object} destination - End location {lat, lng}
   * @returns {Promise<Object>} Route result
   */
  const calculateRouteWithTraffic = useCallback(
    async (origin, destination) => {
      // OSRM doesn't have real-time traffic, use regular route
      return calculateSingleRoute(origin, destination);
    },
    [calculateSingleRoute],
  );

  return {
    calculateOptimizedRoute,
    calculateSingleRoute,
    calculateRouteWithTraffic,
  };
}

/**
 * Convert OSRM response to Google Directions-like format
 * This allows existing code to work without modification
 */
function convertToGoogleFormat(route, waypoints) {
  // Build legs from OSRM route
  const legs = route.legs.map((leg, index) => ({
    distance: {
      value: leg.distance, // meters
      text: formatDistance(leg.distance),
    },
    duration: {
      value: leg.duration, // seconds
      text: formatDuration(leg.duration),
    },
    start_address: waypoints[index]?.name || `Point ${index}`,
    end_address: waypoints[index + 1]?.name || `Point ${index + 1}`,
    start_location: {
      lat: () => waypoints[index]?.location?.[1] || 0,
      lng: () => waypoints[index]?.location?.[0] || 0,
    },
    end_location: {
      lat: () => waypoints[index + 1]?.location?.[1] || 0,
      lng: () => waypoints[index + 1]?.location?.[0] || 0,
    },
    steps: (leg.steps || []).map((step) => ({
      distance: {
        value: step.distance,
        text: formatDistance(step.distance),
      },
      duration: {
        value: step.duration,
        text: formatDuration(step.duration),
      },
      html_instructions: step.name || "Continue",
      travel_mode: "DRIVING",
      start_location: {
        lat: () => step.maneuver?.location?.[1] || 0,
        lng: () => step.maneuver?.location?.[0] || 0,
      },
      polyline: {
        // OSRM provides geometry for each step
        points: encodePolyline(step.geometry?.coordinates || []),
      },
    })),
  }));

  // Calculate waypoint order (for trip service)
  const waypointOrder = waypoints
    .slice(1, -1) // Exclude origin and destination
    .map((wp, index) =>
      wp.waypoint_index !== undefined ? wp.waypoint_index - 1 : index,
    );

  return {
    routes: [
      {
        legs: legs,
        overview_polyline: {
          points: encodePolyline(route.geometry?.coordinates || []),
        },
        waypoint_order: waypointOrder,
        summary: "OSRM Route",
        bounds: calculateBounds(route.geometry?.coordinates || []),
      },
    ],
    // Additional data for direct access
    geometry: route.geometry,
    distance: route.distance,
    duration: route.duration,
    decodedPath: (route.geometry?.coordinates || []).map((coord) => ({
      lat: coord[1],
      lng: coord[0],
    })),
  };
}

/**
 * Format distance for display
 */
function formatDistance(meters) {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Format duration for display
 */
function formatDuration(seconds) {
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return `${minutes} mins`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return `${hours} hr ${remainingMins} mins`;
}

/**
 * Encode coordinates to polyline
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
 * Calculate bounds from coordinates
 */
function calculateBounds(coordinates) {
  if (!coordinates || coordinates.length === 0) {
    return {
      northeast: { lat: 0, lng: 0 },
      southwest: { lat: 0, lng: 0 },
    };
  }

  let minLat = Infinity,
    maxLat = -Infinity;
  let minLng = Infinity,
    maxLng = -Infinity;

  for (const coord of coordinates) {
    minLng = Math.min(minLng, coord[0]);
    maxLng = Math.max(maxLng, coord[0]);
    minLat = Math.min(minLat, coord[1]);
    maxLat = Math.max(maxLat, coord[1]);
  }

  return {
    northeast: { lat: maxLat, lng: maxLng },
    southwest: { lat: minLat, lng: minLng },
  };
}

export default useOSRMDirections;
