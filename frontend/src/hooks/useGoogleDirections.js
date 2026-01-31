/**
 * Google Directions Hook
 * Provides functions for calculating routes using Google Directions API
 */
import { useCallback, useRef } from "react";
import { routeCache } from "../utils/routeCache";

export function useGoogleDirections() {
  const directionsServiceRef = useRef(null);
  const pendingRequestsRef = useRef(new Map());

  /**
   * Get or create DirectionsService instance
   */
  const getDirectionsService = useCallback(() => {
    if (!directionsServiceRef.current && window.google) {
      directionsServiceRef.current = new window.google.maps.DirectionsService();
    }
    return directionsServiceRef.current;
  }, []);

  /**
   * Calculate optimized route for multiple deliveries
   * @param {Object} origin - Driver location {lat, lng}
   * @param {Array} waypoints - Array of waypoint locations [{lat, lng}]
   * @param {Object} destination - Final destination {lat, lng}
   * @param {boolean} optimizeWaypoints - Whether to optimize waypoint order
   * @returns {Promise<Object>} Google Directions result
   */
  const calculateOptimizedRoute = useCallback(
    async (origin, waypoints, destination, optimizeWaypoints = true) => {
      const service = getDirectionsService();
      if (!service) throw new Error("Google Maps not loaded");

      // Generate cache key
      const cacheKey = routeCache.generateKey(origin, destination, waypoints);

      // Check cache first
      const cached = routeCache.get(cacheKey);
      if (cached) {
        console.log("Using cached route");
        return cached;
      }

      // Check for pending request with same key
      if (pendingRequestsRef.current.has(cacheKey)) {
        console.log("Waiting for pending request");
        return pendingRequestsRef.current.get(cacheKey);
      }

      // Format waypoints for Google Directions API
      const formattedWaypoints = waypoints.map((wp) => ({
        location: new window.google.maps.LatLng(wp.lat, wp.lng),
        stopover: true,
      }));

      // Create request promise
      const requestPromise = new Promise((resolve, reject) => {
        service.route(
          {
            origin: new window.google.maps.LatLng(origin.lat, origin.lng),
            destination: new window.google.maps.LatLng(
              destination.lat,
              destination.lng,
            ),
            waypoints: formattedWaypoints,
            optimizeWaypoints: optimizeWaypoints && waypoints.length > 1,
            travelMode: window.google.maps.TravelMode.DRIVING,
            drivingOptions: {
              departureTime: new Date(),
              trafficModel: window.google.maps.TrafficModel.BEST_GUESS,
            },
          },
          (result, status) => {
            // Remove from pending requests
            pendingRequestsRef.current.delete(cacheKey);

            if (status === "OK") {
              // Cache the result
              routeCache.set(cacheKey, result);
              resolve(result);
            } else {
              reject(new Error(`Directions request failed: ${status}`));
            }
          },
        );
      });

      // Store pending request
      pendingRequestsRef.current.set(cacheKey, requestPromise);

      return requestPromise;
    },
    [getDirectionsService],
  );

  /**
   * Calculate single route (no waypoints)
   * @param {Object} origin - Start location {lat, lng}
   * @param {Object} destination - End location {lat, lng}
   * @returns {Promise<Object>} Google Directions result
   */
  const calculateSingleRoute = useCallback(
    async (origin, destination) => {
      return calculateOptimizedRoute(origin, [], destination, false);
    },
    [calculateOptimizedRoute],
  );

  /**
   * Calculate route with real-time traffic
   * @param {Object} origin - Start location {lat, lng}
   * @param {Object} destination - End location {lat, lng}
   * @returns {Promise<Object>} Google Directions result with traffic data
   */
  const calculateRouteWithTraffic = useCallback(
    async (origin, destination) => {
      const service = getDirectionsService();
      if (!service) throw new Error("Google Maps not loaded");

      return new Promise((resolve, reject) => {
        service.route(
          {
            origin: new window.google.maps.LatLng(origin.lat, origin.lng),
            destination: new window.google.maps.LatLng(
              destination.lat,
              destination.lng,
            ),
            travelMode: window.google.maps.TravelMode.DRIVING,
            drivingOptions: {
              departureTime: new Date(),
              trafficModel: window.google.maps.TrafficModel.BEST_GUESS,
            },
          },
          (result, status) => {
            if (status === "OK") {
              resolve(result);
            } else {
              reject(new Error(`Directions request failed: ${status}`));
            }
          },
        );
      });
    },
    [getDirectionsService],
  );

  return {
    calculateOptimizedRoute,
    calculateSingleRoute,
    calculateRouteWithTraffic,
  };
}

export default useGoogleDirections;
