/**
 * Service for calculating restaurant distances using OSRM and customer's delivery location
 */

import { API_URL } from "../config";

/**
 * Calculate OSRM distance between two points
 */
async function calculateOSRMDistance(lat1, lon1, lat2, lon2) {
  try {
    // Use FOOT profile for delivery distance calculation (like checkout page)
    const url = `https://router.project-osrm.org/route/v1/foot/${lon1},${lat1};${lon2},${lat2}?overview=false`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.code === "Ok" && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      return {
        distance: route.distance / 1000, // Convert meters to kilometers
        duration: route.duration / 60, // Convert seconds to minutes
        success: true,
      };
    }

    return { success: false, error: "No route found" };
  } catch (error) {
    console.error("OSRM routing error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get customer's delivery location from their profile
 */
async function getCustomerDeliveryLocation() {
  try {
    const token = localStorage.getItem("token");
    if (!token) return null;

    const res = await fetch(`${API_URL}/cart/customer-profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (data.success && data.customer) {
      const { latitude, longitude } = data.customer;
      if (latitude && longitude) {
        return {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
        };
      }
    }
    return null;
  } catch (error) {
    console.error("Failed to fetch customer location:", error);
    return null;
  }
}

/**
 * Calculate distance from customer's delivery location to a restaurant
 */
export async function calculateRestaurantDistance(restaurant) {
  if (!restaurant?.latitude || !restaurant?.longitude) {
    return null;
  }

  const customerLocation = await getCustomerDeliveryLocation();
  if (!customerLocation) {
    return null;
  }

  const result = await calculateOSRMDistance(
    customerLocation.latitude,
    customerLocation.longitude,
    parseFloat(restaurant.latitude),
    parseFloat(restaurant.longitude),
  );

  return result.success ? result.distance : null;
}

/**
 * Calculate distances for multiple restaurants
 */
export async function calculateRestaurantDistances(restaurants) {
  const customerLocation = await getCustomerDeliveryLocation();
  if (!customerLocation || !Array.isArray(restaurants)) {
    return restaurants.map((r) => ({ ...r, distance: null }));
  }

  // Calculate distances for all restaurants
  const restaurantsWithDistances = await Promise.allSettled(
    restaurants.map(async (restaurant) => {
      if (!restaurant?.latitude || !restaurant?.longitude) {
        return { ...restaurant, distance: null };
      }

      const result = await calculateOSRMDistance(
        customerLocation.latitude,
        customerLocation.longitude,
        parseFloat(restaurant.latitude),
        parseFloat(restaurant.longitude),
      );

      return {
        ...restaurant,
        distance: result.success ? result.distance : null,
      };
    }),
  );

  // Return results, handling any rejections
  return restaurantsWithDistances.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    } else {
      console.error(
        `Distance calculation failed for restaurant ${restaurants[index].id}:`,
        result.reason,
      );
      return { ...restaurants[index], distance: null };
    }
  });
}

/**
 * Format distance for display
 */
export function formatDistance(distance) {
  if (!distance) return "";

  if (distance < 1) {
    return `${Math.round(distance * 1000)}m`;
  } else {
    return `${distance.toFixed(1)}km`;
  }
}

/**
 * Check if customer has delivery location set
 */
export async function hasCustomerDeliveryLocation() {
  const location = await getCustomerDeliveryLocation();
  return location !== null;
}
