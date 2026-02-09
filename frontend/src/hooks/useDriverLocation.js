import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Custom hook for live driver location tracking
 * Updates the driver's location every `intervalMs` milliseconds (default 3000ms)
 *
 * @param {Object} options
 * @param {number} options.intervalMs - Update interval in milliseconds (default: 3000)
 * @param {boolean} options.enableHighAccuracy - Use high accuracy GPS (default: true)
 * @param {Object} options.defaultLocation - Fallback location if geolocation fails
 * @param {Function} options.onLocationUpdate - Callback when location updates
 * @returns {Object} { location, isTracking, error, startTracking, stopTracking }
 */
export function useDriverLocation({
  intervalMs = 3000,
  enableHighAccuracy = true,
  defaultLocation = null,
  onLocationUpdate = null,
} = {}) {
  const [location, setLocation] = useState(defaultLocation);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const watchIdRef = useRef(null);

  // Get current location once
  const getCurrentLocation = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation not supported"));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          };
          resolve(newLocation);
        },
        (err) => {
          reject(err);
        },
        {
          enableHighAccuracy,
          timeout: 10000,
          maximumAge: 0,
        },
      );
    });
  }, [enableHighAccuracy]);

  // Update location and notify callback
  const updateLocation = useCallback(async () => {
    try {
      const newLocation = await getCurrentLocation();
      setLocation(newLocation);
      setError(null);

      if (onLocationUpdate) {
        onLocationUpdate(newLocation);
      }

      console.log(
        `[LOCATION] Updated: (${newLocation.latitude.toFixed(6)}, ${newLocation.longitude.toFixed(6)})`,
      );
      return newLocation;
    } catch (err) {
      console.error("[LOCATION] Error:", err.message);
      setError(err.message);

      // Use default location if provided
      if (defaultLocation && !location) {
        setLocation(defaultLocation);
        if (onLocationUpdate) {
          onLocationUpdate(defaultLocation);
        }
      }
      return null;
    }
  }, [getCurrentLocation, defaultLocation, location, onLocationUpdate]);

  // Start continuous tracking
  const startTracking = useCallback(async () => {
    if (isTracking) return;

    console.log(`[LOCATION] Starting tracking with ${intervalMs}ms interval`);
    setIsTracking(true);
    setError(null);

    // Get initial location immediately
    await updateLocation();

    // Set up interval for continuous updates
    intervalRef.current = setInterval(() => {
      updateLocation();
    }, intervalMs);
  }, [isTracking, intervalMs, updateLocation]);

  // Stop tracking
  const stopTracking = useCallback(() => {
    console.log("[LOCATION] Stopping tracking");
    setIsTracking(false);

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, [stopTracking]);

  return {
    location,
    isTracking,
    error,
    startTracking,
    stopTracking,
    updateLocation,
  };
}

export default useDriverLocation;
