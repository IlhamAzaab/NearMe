/**
 * ETA Updates Hook
 * Provides real-time ETA updates using Google Distance Matrix API
 */
import { useState, useEffect, useCallback, useRef } from "react";

export function useETAUpdates(
  driverLocation,
  destination,
  updateIntervalMs = 30000,
) {
  const [eta, setEta] = useState(null);
  const [distanceRemaining, setDistanceRemaining] = useState(null);
  const [loading, setLoading] = useState(false);
  const distanceMatrixServiceRef = useRef(null);

  /**
   * Get or create DistanceMatrixService instance
   */
  const getDistanceMatrixService = useCallback(() => {
    if (!distanceMatrixServiceRef.current && window.google) {
      distanceMatrixServiceRef.current =
        new window.google.maps.DistanceMatrixService();
    }
    return distanceMatrixServiceRef.current;
  }, []);

  /**
   * Update ETA based on current driver location
   */
  const updateETA = useCallback(async () => {
    if (!window.google || !driverLocation || !destination) return;

    const service = getDistanceMatrixService();
    if (!service) return;

    setLoading(true);

    service.getDistanceMatrix(
      {
        origins: [
          new window.google.maps.LatLng(driverLocation.lat, driverLocation.lng),
        ],
        destinations: [
          new window.google.maps.LatLng(destination.lat, destination.lng),
        ],
        travelMode: window.google.maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: window.google.maps.TrafficModel.BEST_GUESS,
        },
      },
      (response, status) => {
        setLoading(false);

        if (status === "OK" && response.rows[0]?.elements[0]?.status === "OK") {
          const element = response.rows[0].elements[0];

          // Use traffic-aware duration if available
          const durationValue =
            element.duration_in_traffic?.value || element.duration.value;
          setEta(Math.ceil(durationValue / 60)); // Convert to minutes

          // Distance in km
          setDistanceRemaining(
            parseFloat((element.distance.value / 1000).toFixed(1)),
          );
        }
      },
    );
  }, [driverLocation, destination, getDistanceMatrixService]);

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
