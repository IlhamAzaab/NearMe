/**
 * ETA Updates Hook
 * Provides real-time ETA updates using OSRM routing
 */
import { useState, useEffect, useCallback, useRef } from "react";

// OSRM base URL
const OSRM_BASE_URL =
  import.meta.env.VITE_OSRM_URL || "https://router.project-osrm.org";

export function useETAUpdates(
  driverLocation,
  destination,
  updateIntervalMs = 30000,
) {
  const [eta, setEta] = useState(null);
  const [distanceRemaining, setDistanceRemaining] = useState(null);
  const [loading, setLoading] = useState(false);
  const abortControllerRef = useRef(null);

  /**
   * Update ETA based on current driver location using OSRM
   */
  const updateETA = useCallback(async () => {
    if (!driverLocation || !destination) return;

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);

    try {
      // OSRM uses lng,lat format
      const coords = `${driverLocation.lng},${driverLocation.lat};${destination.lng},${destination.lat}`;
      const url = `${OSRM_BASE_URL}/route/v1/driving/${coords}?overview=false`;

      const response = await fetch(url, {
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`OSRM error: ${response.status}`);
      }

      const data = await response.json();

      if (data.code === "Ok" && data.routes && data.routes.length > 0) {
        const route = data.routes[0];

        // Duration in minutes
        setEta(Math.ceil(route.duration / 60));

        // Distance in km
        setDistanceRemaining(parseFloat((route.distance / 1000).toFixed(1)));
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.warn("[useETAUpdates] Error fetching ETA:", error.message);
      }
    } finally {
      setLoading(false);
    }
  }, [driverLocation, destination]);

  // Update ETA on mount and at regular intervals
  useEffect(() => {
    if (!driverLocation || !destination) return;

    // Initial update
    updateETA();

    // Set up interval for updates
    const interval = setInterval(updateETA, updateIntervalMs);

    return () => {
      clearInterval(interval);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [updateETA, updateIntervalMs, driverLocation, destination]);

  /**
   * Manually trigger ETA update
   */
  const refreshETA = useCallback(() => {
    updateETA();
  }, [updateETA]);

  return {
    eta,
    distanceRemaining,
    loading,
    refreshETA,
  };
}

export default useETAUpdates;
