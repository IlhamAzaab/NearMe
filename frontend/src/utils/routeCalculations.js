/**
 * Route Calculation Utilities
 * Helper functions for extracting data from Google Directions API responses
 */

/**
 * Extract total distance from Google Directions result
 * @param {Object} directionsResult - Google Directions API response
 * @returns {number} Total distance in kilometers
 */
export function getTotalDistanceKm(directionsResult) {
  if (!directionsResult?.routes?.[0]?.legs) return 0;

  const totalMeters = directionsResult.routes[0].legs.reduce(
    (sum, leg) => sum + leg.distance.value,
    0,
  );

  return totalMeters / 1000; // Convert to km
}

/**
 * Extract total duration from Google Directions result
 * @param {Object} directionsResult - Google Directions API response
 * @returns {number} Total duration in minutes
 */
export function getTotalDurationMinutes(directionsResult) {
  if (!directionsResult?.routes?.[0]?.legs) return 0;

  const totalSeconds = directionsResult.routes[0].legs.reduce(
    (sum, leg) => sum + leg.duration.value,
    0,
  );

  return Math.ceil(totalSeconds / 60);
}

/**
 * Get optimized waypoint order from Google result
 * @param {Object} directionsResult - Google Directions API response
 * @returns {Array} Optimized order indices
 */
export function getOptimizedWaypointOrder(directionsResult) {
  return directionsResult?.routes?.[0]?.waypoint_order || [];
}

/**
 * Calculate extra distance for multi-delivery payment
 * @param {number} baseDistanceKm - Single delivery distance
 * @param {number} optimizedDistanceKm - Multi-delivery optimized distance
 * @returns {number} Extra distance driver should be paid for
 */
export function calculateExtraDistance(baseDistanceKm, optimizedDistanceKm) {
  const extraDistance = optimizedDistanceKm - baseDistanceKm;
  return Math.max(0, extraDistance); // Never negative
}

/**
 * Extract leg-by-leg breakdown for each delivery
 * @param {Object} directionsResult - Google Directions API response
 * @param {Array} deliveryIds - Original delivery IDs in order
 * @returns {Array} Array of {deliveryId, distanceKm, durationMin}
 */
export function getLegBreakdown(directionsResult, deliveryIds) {
  const legs = directionsResult?.routes?.[0]?.legs || [];
  const waypointOrder = getOptimizedWaypointOrder(directionsResult);

  // Reorder delivery IDs based on Google's optimization
  const optimizedDeliveryIds =
    waypointOrder.length > 0
      ? waypointOrder.map((idx) => deliveryIds[idx])
      : deliveryIds;

  return legs.map((leg, index) => ({
    deliveryId: optimizedDeliveryIds[index] || null,
    distanceKm: leg.distance.value / 1000,
    durationMin: Math.ceil(leg.duration.value / 60),
    startAddress: leg.start_address,
    endAddress: leg.end_address,
  }));
}

/**
 * Decode Google's encoded polyline to array of coordinates
 * @param {string} encoded - Encoded polyline string
 * @returns {Array} Array of {lat, lng} objects
 */
export function decodePolyline(encoded) {
  if (!encoded) return [];

  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
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

    points.push({
      lat: lat / 1e5,
      lng: lng / 1e5,
    });
  }

  return points;
}

/**
 * Format distance for display
 * @param {number} distanceKm - Distance in kilometers
 * @returns {string} Formatted distance string
 */
export function formatDistance(distanceKm) {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}

/**
 * Format duration for display
 * @param {number} durationMin - Duration in minutes
 * @returns {string} Formatted duration string
 */
export function formatDuration(durationMin) {
  if (durationMin < 60) {
    return `${Math.round(durationMin)} min`;
  }
  const hours = Math.floor(durationMin / 60);
  const mins = Math.round(durationMin % 60);
  return `${hours}h ${mins}m`;
}
