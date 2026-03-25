/**
 * Utility functions for distance calculation and time formatting
 */

/**
 * Distance is now derived from route engine results (OSRM/backend route fields).
 * This legacy helper is retained only for API compatibility.
 */
export function calculateDistance() {
  return null;
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
