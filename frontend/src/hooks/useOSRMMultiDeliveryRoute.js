/**
 * ============================================================================
 * Multi-Delivery Route Hook (OSRM Version)
 * ============================================================================
 *
 * Calculates optimized routes for multiple deliveries using OSRM
 * ============================================================================
 */
import { useState, useCallback } from "react";
import { useOSRMDirections } from "./useOSRMDirections";
import {
  getTotalDistanceKm,
  getTotalDurationMinutes,
  getOptimizedWaypointOrder,
  calculateExtraDistance,
  getLegBreakdown,
} from "../utils/routeCalculations";

export function useOSRMMultiDeliveryRoute() {
  const { calculateOptimizedRoute } = useOSRMDirections();
  const [routeData, setRouteData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Calculate routes and distances for driver payment
   * @param {Object} driverLocation - {lat, lng}
   * @param {Array} deliveries - Array of delivery objects with location data
   * @returns {Promise<Object>} Route data including distances for payment calculation
   */
  const calculateDeliveryRoutes = useCallback(
    async (driverLocation, deliveries) => {
      setLoading(true);
      setError(null);

      try {
        if (!deliveries || deliveries.length === 0) {
          setRouteData(null);
          return null;
        }

        // For single delivery - calculate base route
        if (deliveries.length === 1) {
          const delivery = deliveries[0];

          // Driver → Restaurant → Customer
          const result = await calculateOptimizedRoute(
            driverLocation,
            [
              {
                lat: delivery.restaurantLat || delivery.restaurant?.latitude,
                lng: delivery.restaurantLng || delivery.restaurant?.longitude,
              },
            ],
            {
              lat: delivery.customerLat || delivery.customer?.latitude,
              lng: delivery.customerLng || delivery.customer?.longitude,
            },
            false, // No optimization needed for single delivery
          );

          const totalDistanceKm = getTotalDistanceKm(result);
          const totalDurationMin = getTotalDurationMinutes(result);

          const data = {
            type: "single",
            directionsResult: result,
            totalDistanceKm,
            totalDurationMin,
            baseDistanceKm: totalDistanceKm,
            extraDistanceKm: 0,
            optimizedOrder: [0],
            deliveryCount: 1,
            legs: getLegBreakdown(result, [
              delivery.deliveryId || delivery.delivery_id,
            ]),
          };

          setRouteData(data);
          return data;
        }

        // For multiple deliveries - calculate optimized route
        // Build waypoints: all restaurants first, then all customers
        const pickupWaypoints = deliveries.map((d) => ({
          lat: d.restaurantLat || d.restaurant?.latitude,
          lng: d.restaurantLng || d.restaurant?.longitude,
          type: "pickup",
          deliveryId: d.deliveryId || d.delivery_id,
        }));

        const dropoffWaypoints = deliveries.map((d) => ({
          lat: d.customerLat || d.customer?.latitude,
          lng: d.customerLng || d.customer?.longitude,
          type: "dropoff",
          deliveryId: d.deliveryId || d.delivery_id,
        }));

        // Combine waypoints - pickups first, then dropoffs (except last which is destination)
        const allWaypoints = [
          ...pickupWaypoints,
          ...dropoffWaypoints.slice(0, -1),
        ];
        const finalDestination = dropoffWaypoints[dropoffWaypoints.length - 1];

        // Calculate optimized multi-stop route
        const optimizedResult = await calculateOptimizedRoute(
          driverLocation,
          allWaypoints,
          finalDestination,
          true, // Optimize waypoint order
        );

        const optimizedDistanceKm = getTotalDistanceKm(optimizedResult);
        const optimizedDurationMin = getTotalDurationMinutes(optimizedResult);

        // Calculate base distance (what single delivery would cost)
        // Use the first delivery as the "base" comparison
        const firstDelivery = deliveries[0];
        const baseResult = await calculateOptimizedRoute(
          driverLocation,
          [
            {
              lat:
                firstDelivery.restaurantLat ||
                firstDelivery.restaurant?.latitude,
              lng:
                firstDelivery.restaurantLng ||
                firstDelivery.restaurant?.longitude,
            },
          ],
          {
            lat: firstDelivery.customerLat || firstDelivery.customer?.latitude,
            lng: firstDelivery.customerLng || firstDelivery.customer?.longitude,
          },
          false,
        );
        const baseDistanceKm = getTotalDistanceKm(baseResult);

        // Calculate extra distance driver should be paid for
        const extraDistanceKm = calculateExtraDistance(
          baseDistanceKm,
          optimizedDistanceKm,
        );

        const data = {
          type: "multi",
          directionsResult: optimizedResult,
          totalDistanceKm: optimizedDistanceKm,
          totalDurationMin: optimizedDurationMin,
          baseDistanceKm,
          extraDistanceKm,
          optimizedOrder: getOptimizedWaypointOrder(optimizedResult),
          deliveryCount: deliveries.length,
          deliveryIds: deliveries.map((d) => d.deliveryId || d.delivery_id),
        };

        setRouteData(data);
        return data;
      } catch (err) {
        console.error("Route calculation error:", err);
        setError(err.message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [calculateOptimizedRoute],
  );

  /**
   * Clear current route data
   */
  const clearRouteData = useCallback(() => {
    setRouteData(null);
    setError(null);
  }, []);

  return {
    routeData,
    loading,
    error,
    calculateDeliveryRoutes,
    clearRouteData,
  };
}

// Alias for backward compatibility
export const useMultiDeliveryRoute = useOSRMMultiDeliveryRoute;

export default useOSRMMultiDeliveryRoute;
