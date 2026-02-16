/**
 * Utility functions for distance calculation and time formatting
 */

/**
 * Calculate the distance between two points using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
export function calculateDistance(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;

  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in kilometers
}

/**
 * Format distance for display
 * @param {number} distance - Distance in kilometers
 * @returns {string} Formatted distance string
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
 * Convert 24-hour time format to 12-hour format
 * @param {string} time24 - Time in 24-hour format (HH:mm:ss or HH:mm)
 * @returns {string} Time in 12-hour format (h.mma.m or h.mmp.m)
 */
export function formatTime12Hour(time24) {
  if (!time24) return "";

  // Handle different time formats
  const timeParts = time24.split(":");
  const hours = parseInt(timeParts[0], 10);
  const minutes = parseInt(timeParts[1], 10);

  if (isNaN(hours) || isNaN(minutes)) return "";

  const period = hours >= 12 ? "p.m" : "a.m";
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  const displayMinutes = minutes.toString().padStart(2, "0");

  return `${displayHours}.${displayMinutes}${period}`;
}

/**
 * Format restaurant hours for display
 * @param {string} openTime - Opening time in 24-hour format
 * @param {string} closeTime - Closing time in 24-hour format
 * @returns {string} Formatted hours string
 */
export function formatRestaurantHours(openTime, closeTime) {
  if (!openTime || !closeTime) return "";

  const formattedOpen = formatTime12Hour(openTime);
  const formattedClose = formatTime12Hour(closeTime);

  if (!formattedOpen || !formattedClose) return "";

  return `${formattedOpen} - ${formattedClose}`;
}

/**
 * Get user's current location
 * @returns {Promise<{latitude: number, longitude: number}>} User's coordinates
 */
export function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 600000, // 10 minutes
      },
    );
  });
}
