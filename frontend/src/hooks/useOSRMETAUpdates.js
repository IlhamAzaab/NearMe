/**
 * ============================================================================
 * ETA Updates Hook (OSRM Version)
 * ============================================================================
 *
 * Provides real-time ETA updates using OSRM
 * Same interface as useETAUpdates (Google version)
 * ============================================================================
 */
import { useState, useEffect, useCallback, useRef } from "react";

// Public OSRM server URL
const OSRM_BASE_URL =
  import.meta.env.VITE_OSRM_URL || "https://router.project-osrm.org";

export function useOSRMETAUpdates(
  driverLocation,
  destination,
  updateIntervalMs = 30000,
) {
  const [eta, setEta] = useState(null);
  const [distanceRemaining, setDistanceRemaining] = useState(null);
  const [loading, setLoading] = useState(false);
  const lastRequestRef = useRef(null);

  /**
   * Update ETA based on current driver location using OSRM
   */
  const updateETA = useCallback(async () => {
    if (!driverLocation || !destination) return;

    // Avoid duplicate requests
    const requestKey = `${driverLocation.lat},${driverLocation.lng}-${destination.lat},${destination.lng}`;
    if (lastRequestRef.current === requestKey && eta !== null) {
      return;
    }

    setLoading(true);

    try {
      // OSRM coordinates format: lng,lat;lng,lat
      const coordinates = `${driverLocation.lng},${driverLocation.lat};${destination.lng},${destination.lat}`;
      const url = `${OSRM_BASE_URL}/route/v1/driving/${coordinates}?overview=false`;

      const response = await fetch(url);

      if (!response.ok) {
        console.warn(`[OSRM ETA] HTTP ${response.status}`);
        return;
      }

      const data = await response.json();

      if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
        console.warn(`[OSRM ETA] No route found: ${data.code}`);
        return;
      }

      const route = data.routes[0];

      // Update ETA in minutes (OSRM returns duration in seconds)
      setEta(Math.ceil(route.duration / 60));

      // Update distance remaining in km (OSRM returns distance in meters)
      setDistanceRemaining(parseFloat((route.distance / 1000).toFixed(1)));

      lastRequestRef.current = requestKey;
    } catch (error) {
      console.warn("[OSRM ETA] Error:", error.message);
    } finally {
      setLoading(false);
    }
  }, [driverLocation, destination, eta]);

  // Update ETA on mount and at regular intervals
  useEffect(() => {
    if (!driverLocation || !destination) return;

    // Initial update
    updateETA();

    // Set up interval for updates
    const interval = setInterval(updateETA, updateIntervalMs);

    return () => clearInterval(interval);
  }, [updateETA, updateIntervalMs, driverLocation, destination]);

  /**
   * Manually trigger ETA update
   */
  const refreshETA = useCallback(() => {
    lastRequestRef.current = null; // Force refresh
    updateETA();
  }, [updateETA]);

  return {
    eta,
    distanceRemaining,
    loading,
    refreshETA,
  };
}

// Alias for backward compatibility
export const useETAUpdates = useOSRMETAUpdates;

export default useOSRMETAUpdates;
