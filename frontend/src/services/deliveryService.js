/**
 * Delivery Service
 * API calls for delivery-related operations
 */

import { API_URL } from "../config";

const API_BASE = API_URL;

/**
 * Submit route calculation to backend for earnings calculation
 * Backend handles the actual payment logic
 * @param {string} token - Auth token
 * @param {Object} routeData - Route calculation data
 */
export async function submitRouteForEarnings(token, routeData) {
  const response = await fetch(
    `${API_BASE}/driver/deliveries/calculate-earnings`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        deliveryIds: routeData.deliveryIds,
        totalDistanceKm: routeData.totalDistanceKm,
        baseDistanceKm: routeData.baseDistanceKm,
        extraDistanceKm: routeData.extraDistanceKm,
        optimizedOrder: routeData.optimizedOrder,
        // Include encoded polyline for verification if needed
        encodedPolyline:
          routeData.directionsResult?.routes?.[0]?.overview_polyline?.points,
      }),
    },
  );

  return response.json();
}

/**
 * Update delivery with route information
 * @param {string} token - Auth token
 * @param {string} deliveryId - Delivery ID
 * @param {Object} legData - Route leg data
 */
export async function updateDeliveryRoute(token, deliveryId, legData) {
  const response = await fetch(
    `${API_BASE}/driver/deliveries/${deliveryId}/route`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        distanceKm: legData.distanceKm,
        estimatedDurationMin: legData.durationMin,
        routeGeometry: legData.encodedPolyline,
      }),
    },
  );

  return response.json();
}

/**
 * Update driver location
 * @param {string} token - Auth token
 * @param {string} deliveryId - Delivery ID
 * @param {Object} location - {lat, lng} or {latitude, longitude}
 */
export async function updateDriverLocation(token, deliveryId, location) {
  const response = await fetch(
    `${API_BASE}/driver/deliveries/${deliveryId}/location`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        driver_latitude: location.lat || location.latitude,
        driver_longitude: location.lng || location.longitude,
      }),
    },
  );

  return response.json();
}

/**
 * Update delivery status
 * @param {string} token - Auth token
 * @param {string} deliveryId - Delivery ID
 * @param {string} status - New status
 * @param {Object} location - Optional location {lat, lng}
 */
export async function updateDeliveryStatus(
  token,
  deliveryId,
  status,
  location = null,
) {
  const body = { status };
  if (location) {
    body.latitude = location.lat || location.latitude;
    body.longitude = location.lng || location.longitude;
  }

  const response = await fetch(
    `${API_BASE}/driver/deliveries/${deliveryId}/status`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    },
  );

  return response.json();
}

/**
 * Fetch pickups for driver
 * @param {string} token - Auth token
 * @param {Object} location - Driver location {lat, lng}
 */
export async function fetchPickups(token, location) {
  const url = `${API_BASE}/driver/deliveries/pickups?driver_latitude=${location.lat}&driver_longitude=${location.lng}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.json();
}

/**
 * Fetch deliveries route for driver
 * @param {string} token - Auth token
 * @param {Object} location - Driver location {lat, lng}
 */
export async function fetchDeliveriesRoute(token, location) {
  const url = `${API_BASE}/driver/deliveries/deliveries-route?driver_latitude=${location.lat}&driver_longitude=${location.lng}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.json();
}

/**
 * Accept a delivery
 * @param {string} token - Auth token
 * @param {string} deliveryId - Delivery ID
 * @param {Object} location - Driver location {lat, lng}
 */
export async function acceptDelivery(token, deliveryId, location) {
  const response = await fetch(
    `${API_BASE}/driver/deliveries/${deliveryId}/accept`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        latitude: location.lat || location.latitude,
        longitude: location.lng || location.longitude,
      }),
    },
  );

  return response.json();
}

export default {
  submitRouteForEarnings,
  updateDeliveryRoute,
  updateDriverLocation,
  updateDeliveryStatus,
  fetchPickups,
  fetchDeliveriesRoute,
  acceptDelivery,
};
