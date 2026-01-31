/**
 * Google Maps Utilities and Hooks Index
 * Central export for all Google Maps related modules
 */

// Components
export { GoogleMapsProvider } from "../components/GoogleMapsProvider";
export { default as GoogleDeliveryMap } from "../components/GoogleDeliveryMap";

// Hooks
export { useGoogleDirections } from "../hooks/useGoogleDirections";
export { useMultiDeliveryRoute } from "../hooks/useMultiDeliveryRoute";
export { useETAUpdates } from "../hooks/useETAUpdates";

// Utilities
export {
  getTotalDistanceKm,
  getTotalDurationMinutes,
  getOptimizedWaypointOrder,
  calculateExtraDistance,
  getLegBreakdown,
  decodePolyline,
  formatDistance,
  formatDuration,
} from "../utils/routeCalculations";

export { routeCache } from "../utils/routeCache";

// Services
export {
  submitRouteForEarnings,
  updateDeliveryRoute,
  updateDriverLocation,
  updateDeliveryStatus,
  fetchPickups,
  fetchDeliveriesRoute,
  acceptDelivery,
} from "../services/deliveryService";
