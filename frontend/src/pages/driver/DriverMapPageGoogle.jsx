/**
 * Driver Map Page with Google Maps
 * Real-time delivery tracking with optimized routing
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DriverLayout from "../../components/DriverLayout";
import { GoogleMapsProvider } from "../../components/GoogleMapsProvider";
import GoogleDeliveryMap from "../../components/GoogleDeliveryMap";
import { useGoogleDirections } from "../../hooks/useGoogleDirections";
import { useETAUpdates } from "../../hooks/useETAUpdates";
import {
  getTotalDistanceKm,
  getTotalDurationMinutes,
  formatDistance,
  formatDuration,
} from "../../utils/routeCalculations";

function DriverMapPageContent() {
  const { deliveryId } = useParams();
  const navigate = useNavigate();
  const locationUpdateInterval = useRef(null);
  const recenterFnRef = useRef(null);

  const [mode, setMode] = useState("pickup"); // "pickup" or "delivery"
  const [pickups, setPickups] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [currentTarget, setCurrentTarget] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [directionsResult, setDirectionsResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [userHasInteracted, setUserHasInteracted] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);

  const { calculateOptimizedRoute } = useGoogleDirections();

  // Get destination for ETA updates
  const destination =
    mode === "pickup" && currentTarget?.restaurant
      ? {
          lat: currentTarget.restaurant.latitude,
          lng: currentTarget.restaurant.longitude,
        }
      : mode === "delivery" && currentTarget?.customer
        ? {
            lat: currentTarget.customer.latitude,
            lng: currentTarget.customer.longitude,
          }
        : null;

  const { eta, distanceRemaining } = useETAUpdates(
    driverLocation,
    destination,
    30000,
  );

  // Handle user interaction with map
  const handleUserInteraction = useCallback(() => {
    setUserHasInteracted(true);
  }, []);

  // Handle recenter button click
  const handleRecenterMap = useCallback(() => {
    setUserHasInteracted(false);
    if (recenterFnRef.current) {
      recenterFnRef.current();
    }
  }, []);

  // Store recenter function from map component
  const setRecenterFn = useCallback((fn) => {
    recenterFnRef.current = fn;
  }, []);

  // Start location tracking
  const startLocationTracking = useCallback(() => {
    if (!navigator.geolocation) {
      alert("Geolocation not supported");
      return;
    }

    setIsTracking(true);

    // Get initial location
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setDriverLocation(location);
        updateLocationOnBackend(deliveryId, location);
      },
      (error) => {
        console.error("Location error:", error);
        setIsTracking(false);
      },
      { enableHighAccuracy: true },
    );

    // Update every 3 seconds for live tracking
    locationUpdateInterval.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setDriverLocation(location);
          updateLocationOnBackend(deliveryId, location);
        },
        (error) => console.error("Location update error:", error),
        { enableHighAccuracy: true, maximumAge: 0 },
      );
    }, 3000);
  }, [deliveryId]);

  // Stop location tracking
  const stopLocationTracking = useCallback(() => {
    setIsTracking(false);
    if (locationUpdateInterval.current) {
      clearInterval(locationUpdateInterval.current);
      locationUpdateInterval.current = null;
    }
  }, []);

  // Update location on backend
  const updateLocationOnBackend = async (delivId, location) => {
    try {
      const token = localStorage.getItem("token");
      await fetch(
        `http://localhost:5000/driver/deliveries/${delivId}/location`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            latitude: location.lat,
            longitude: location.lng,
          }),
        },
      );
    } catch (e) {
      console.error("Location update error:", e);
    }
  };

  // Fetch pickups and deliveries
  const fetchPickupsAndDeliveries = useCallback(async () => {
    if (!driverLocation) return;

    try {
      const token = localStorage.getItem("token");

      // Fetch pickups (accepted status)
      const pickupsUrl = `http://localhost:5000/driver/deliveries/pickups?driver_latitude=${driverLocation.lat}&driver_longitude=${driverLocation.lng}`;
      const pickupsRes = await fetch(pickupsUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const pickupsData = await pickupsRes.json();

      // Fetch deliveries (picked_up, on_the_way, at_customer)
      const deliveriesUrl = `http://localhost:5000/driver/deliveries/deliveries-route?driver_latitude=${driverLocation.lat}&driver_longitude=${driverLocation.lng}`;
      const deliveriesRes = await fetch(deliveriesUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const deliveriesData = await deliveriesRes.json();

      if (pickupsRes.ok) {
        setPickups(pickupsData.pickups || []);
        if (pickupsData.pickups && pickupsData.pickups.length > 0) {
          setMode("pickup");
          setCurrentTarget(pickupsData.pickups[0]);
        }
      }

      if (deliveriesRes.ok) {
        setDeliveries(deliveriesData.deliveries || []);
        // If no pickups, switch to delivery mode
        if (
          (!pickupsData.pickups || pickupsData.pickups.length === 0) &&
          deliveriesData.deliveries &&
          deliveriesData.deliveries.length > 0
        ) {
          setMode("delivery");
          setCurrentTarget(deliveriesData.deliveries[0]);
        }
      }
    } catch (e) {
      console.error("Fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [driverLocation]);

  // Calculate route using Google Directions API
  const calculateRoute = useCallback(async () => {
    if (!driverLocation || !currentTarget) return;

    try {
      let result;

      if (mode === "pickup" && currentTarget.restaurant) {
        result = await calculateOptimizedRoute(
          driverLocation,
          [],
          {
            lat: currentTarget.restaurant.latitude,
            lng: currentTarget.restaurant.longitude,
          },
          false,
        );
      } else if (mode === "delivery" && currentTarget.customer) {
        result = await calculateOptimizedRoute(
          driverLocation,
          [],
          {
            lat: currentTarget.customer.latitude,
            lng: currentTarget.customer.longitude,
          },
          false,
        );
      }

      if (result) {
        setDirectionsResult(result);
        setRouteInfo({
          distanceKm: getTotalDistanceKm(result),
          durationMin: getTotalDurationMinutes(result),
        });
      }
    } catch (error) {
      console.error("Route calculation error:", error);
    }
  }, [driverLocation, currentTarget, mode, calculateOptimizedRoute]);

  // Initialize
  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "driver") {
      navigate("/login");
      return;
    }

    startLocationTracking();

    return () => {
      stopLocationTracking();
    };
  }, [navigate, startLocationTracking, stopLocationTracking]);

  // Fetch data when location is available
  useEffect(() => {
    if (driverLocation) {
      fetchPickupsAndDeliveries();
    }
  }, [driverLocation, fetchPickupsAndDeliveries]);

  // Calculate route when target changes
  useEffect(() => {
    if (driverLocation && currentTarget) {
      calculateRoute();
    }
  }, [driverLocation, currentTarget, calculateRoute]);

  // Handle pickup completion
  const handlePickedUp = async () => {
    if (!currentTarget) return;

    setUpdating(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `http://localhost:5000/driver/deliveries/${currentTarget.delivery_id}/status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: "picked_up",
            latitude: driverLocation.lat,
            longitude: driverLocation.lng,
          }),
        },
      );

      if (res.ok) {
        const updatedPickups = pickups.filter(
          (p) => p.delivery_id !== currentTarget.delivery_id,
        );
        setPickups(updatedPickups);

        if (updatedPickups.length > 0) {
          setCurrentTarget(updatedPickups[0]);
        } else {
          await fetchPickupsAndDeliveries();
        }
      } else {
        const data = await res.json();
        alert(data.message || "Failed to update status");
      }
    } catch (e) {
      console.error("Update error:", e);
      alert("Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  // Handle start delivery
  const handleStartDelivery = () => {
    if (deliveries.length > 0) {
      setMode("delivery");
      setCurrentTarget(deliveries[0]);
    }
  };

  // Handle delivery completion
  const handleDelivered = async () => {
    if (!currentTarget) return;

    setUpdating(true);
    try {
      const token = localStorage.getItem("token");

      // Update status progression
      if (currentTarget.status === "picked_up") {
        await fetch(
          `http://localhost:5000/driver/deliveries/${currentTarget.delivery_id}/status`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ status: "on_the_way" }),
          },
        );
      }

      if (
        currentTarget.status === "picked_up" ||
        currentTarget.status === "on_the_way"
      ) {
        await fetch(
          `http://localhost:5000/driver/deliveries/${currentTarget.delivery_id}/status`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ status: "at_customer" }),
          },
        );
      }

      // Mark as delivered
      const res = await fetch(
        `http://localhost:5000/driver/deliveries/${currentTarget.delivery_id}/status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: "delivered",
            latitude: driverLocation.lat,
            longitude: driverLocation.lng,
          }),
        },
      );

      if (res.ok) {
        const data = await res.json();
        const updatedDeliveries = deliveries.filter(
          (d) => d.delivery_id !== currentTarget.delivery_id,
        );

        if (data.promotedDelivery && updatedDeliveries.length > 0) {
          const promotedIndex = updatedDeliveries.findIndex(
            (d) => d.delivery_id === data.promotedDelivery.id,
          );
          if (promotedIndex !== -1) {
            updatedDeliveries[promotedIndex].status = "on_the_way";
          }
        }

        setDeliveries(updatedDeliveries);

        if (updatedDeliveries.length > 0) {
          setCurrentTarget(updatedDeliveries[0]);
        } else {
          alert("All deliveries completed!");
          navigate("/driver/deliveries/active");
        }
      } else {
        const data = await res.json();
        alert(data.message || "Failed to update status");
      }
    } catch (e) {
      console.error("Delivery error:", e);
      alert("Failed to mark as delivered");
    } finally {
      setUpdating(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <DriverLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-600"></div>
        </div>
      </DriverLayout>
    );
  }

  // No current target
  if (!currentTarget) {
    return (
      <DriverLayout>
        <div className="flex flex-col items-center justify-center h-screen p-6">
          <svg
            className="w-24 h-24 text-gray-400 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h2 className="text-2xl font-bold text-gray-700 mb-2">
            All Deliveries Completed!
          </h2>
          <button
            onClick={() => navigate("/driver/deliveries")}
            className="mt-6 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold"
          >
            View Available Deliveries
          </button>
        </div>
      </DriverLayout>
    );
  }

  return (
    <DriverLayout>
      <div className="h-screen flex flex-col bg-gray-50">
        {/* Map Container */}
        <div className="flex-1 relative">
          {driverLocation && (
            <GoogleDeliveryMap
              driverLocation={driverLocation}
              currentTarget={currentTarget}
              mode={mode}
              directionsResult={directionsResult}
              userHasInteracted={userHasInteracted}
              onUserInteraction={handleUserInteraction}
              setRecenterFn={setRecenterFn}
            />
          )}

          {/* Mode Badge */}
          <div className="absolute top-4 left-4 bg-white px-4 py-2 rounded-full shadow-lg z-10">
            <span className="font-bold text-gray-700">
              {mode === "pickup" ? "🏪 PICKUP MODE" : "📦 DELIVERY MODE"}
            </span>
          </div>

          {/* Status & ETA Badge */}
          <div className="absolute top-4 right-4 bg-white px-4 py-2 rounded-full shadow-lg z-10">
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${
                  isTracking ? "bg-green-500 animate-pulse" : "bg-gray-400"
                }`}
              ></div>
              <span className="text-sm font-semibold text-gray-700">
                {isTracking ? "Live (3s)" : "Not Tracking"}
              </span>
              {eta && distanceRemaining && (
                <>
                  <span className="text-gray-300">|</span>
                  <span className="text-sm font-semibold text-blue-600">
                    {eta} min • {distanceRemaining} km
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Recenter Button */}
          {userHasInteracted && (
            <button
              onClick={handleRecenterMap}
              className="absolute bottom-4 right-4 bg-white px-4 py-3 rounded-full shadow-lg hover:bg-gray-50 transition-all duration-200 flex items-center gap-2 z-10"
              title="Recenter map to show full route"
            >
              <svg
                className="w-5 h-5 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              </svg>
              <span className="text-sm font-semibold text-gray-700">
                Recenter
              </span>
            </button>
          )}
        </div>

        {/* Bottom Section */}
        <div className="bg-white border-t border-gray-200 max-h-[45vh] overflow-y-auto">
          <div className="p-4">
            {/* Current Target Info */}
            {mode === "pickup" ? (
              <PickupInfo
                pickup={currentTarget}
                onPickedUp={handlePickedUp}
                updating={updating}
                routeInfo={routeInfo}
              />
            ) : (
              <DeliveryInfo
                delivery={currentTarget}
                onDelivered={handleDelivered}
                updating={updating}
                routeInfo={routeInfo}
              />
            )}

            {/* Upcoming List */}
            <div className="mt-6">
              <h3 className="font-bold text-gray-700 mb-3">
                {mode === "pickup"
                  ? `Upcoming Pickups (${Math.max(0, pickups.length - 1)})`
                  : `Upcoming Deliveries (${Math.max(0, deliveries.length - 1)})`}
              </h3>

              {mode === "pickup" &&
                pickups
                  .slice(1)
                  .map((pickup, index) => (
                    <UpcomingPickupCard
                      key={pickup.delivery_id}
                      pickup={pickup}
                      index={index + 2}
                    />
                  ))}

              {mode === "delivery" &&
                deliveries
                  .slice(1)
                  .map((delivery, index) => (
                    <UpcomingDeliveryCard
                      key={delivery.delivery_id}
                      delivery={delivery}
                      index={index + 2}
                    />
                  ))}
            </div>

            {/* Start Delivery Button */}
            {mode === "pickup" &&
              pickups.length === 0 &&
              deliveries.length > 0 && (
                <button
                  onClick={handleStartDelivery}
                  className="w-full mt-4 py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 transition"
                >
                  START DELIVERY
                </button>
              )}
          </div>
        </div>
      </div>
    </DriverLayout>
  );
}

// Pickup Info Component
function PickupInfo({ pickup, onPickedUp, updating, routeInfo }) {
  const { order_number, restaurant, distance_km, estimated_time_minutes } =
    pickup;

  const displayDistance = routeInfo?.distanceKm?.toFixed(1) || distance_km;
  const displayDuration = routeInfo?.durationMin || estimated_time_minutes;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-gray-500 uppercase font-semibold">
            Order #{order_number}
          </p>
          <h2 className="text-2xl font-bold text-gray-800">
            {restaurant.name}
          </h2>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-1">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
              <span className="font-bold">{displayDistance} km</span>
            </div>
            <div className="flex items-center gap-1">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="font-bold">{displayDuration} min</span>
            </div>
          </div>
        </div>
      </div>

      <p className="text-gray-600 mb-2">{restaurant.address}</p>
      {restaurant.phone && (
        <a
          href={`tel:${restaurant.phone}`}
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold mb-4"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
            />
          </svg>
          <span>{restaurant.phone}</span>
        </a>
      )}

      <button
        onClick={onPickedUp}
        disabled={updating}
        className="w-full py-4 bg-green-600 text-white rounded-xl font-bold text-lg hover:bg-green-700 transition disabled:opacity-50 mt-4"
      >
        {updating ? "Updating..." : "MARK AS PICKED UP"}
      </button>
    </div>
  );
}

// Delivery Info Component
function DeliveryInfo({ delivery, onDelivered, updating, routeInfo }) {
  const {
    order_number,
    customer,
    pricing,
    distance_km,
    estimated_time_minutes,
    restaurant_name,
  } = delivery;

  const displayDistance = routeInfo?.distanceKm?.toFixed(1) || distance_km;
  const displayDuration = routeInfo?.durationMin || estimated_time_minutes;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-gray-500 uppercase font-semibold">
            Order #{order_number}
          </p>
          <h2 className="text-2xl font-bold text-gray-800">{customer.name}</h2>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-1">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
              <span className="font-bold">{displayDistance} km</span>
            </div>
            <div className="flex items-center gap-1">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="font-bold">{displayDuration} min</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4 p-4 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-500 mb-2">From: {restaurant_name}</p>
        {pricing && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-gray-500">Subtotal</p>
              <p className="font-bold">
                ${pricing.subtotal?.toFixed(2) || "0.00"}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Delivery Fee</p>
              <p className="font-bold">
                ${pricing.delivery_fee?.toFixed(2) || "0.00"}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Service Fee</p>
              <p className="font-bold">
                ${pricing.service_fee?.toFixed(2) || "0.00"}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Total</p>
              <p className="font-bold text-lg text-green-600">
                ${pricing.total?.toFixed(2) || "0.00"}
              </p>
            </div>
          </div>
        )}
      </div>

      <p className="text-gray-600 mb-2">{customer.address}</p>
      {customer.phone && (
        <a
          href={`tel:${customer.phone}`}
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold mb-4"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
            />
          </svg>
          <span>{customer.phone}</span>
        </a>
      )}

      <button
        onClick={onDelivered}
        disabled={updating}
        className="w-full py-4 bg-green-600 text-white rounded-xl font-bold text-lg hover:bg-green-700 transition disabled:opacity-50 mt-4"
      >
        {updating ? "Updating..." : "MARK AS DELIVERED"}
      </button>
    </div>
  );
}

// Upcoming Pickup Card Component
function UpcomingPickupCard({ pickup, index }) {
  return (
    <div className="mb-3 p-3 bg-gray-50 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center text-sm font-bold">
            {index}
          </div>
          <div>
            <p className="font-bold text-gray-800">{pickup.restaurant.name}</p>
            <p className="text-xs text-gray-500">#{pickup.order_number}</p>
          </div>
        </div>
        <div className="text-right text-xs text-gray-600">
          <p>{pickup.distance_km} km</p>
          <p>{pickup.estimated_time_minutes} min</p>
        </div>
      </div>
    </div>
  );
}

// Upcoming Delivery Card Component
function UpcomingDeliveryCard({ delivery, index }) {
  return (
    <div className="mb-3 p-3 bg-gray-50 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center text-sm font-bold">
            {index}
          </div>
          <div>
            <p className="font-bold text-gray-800">{delivery.customer.name}</p>
            <p className="text-xs text-gray-500">#{delivery.order_number}</p>
          </div>
        </div>
        <div className="text-right text-xs text-gray-600">
          <p>{delivery.distance_km} km</p>
          <p>{delivery.estimated_time_minutes} min</p>
        </div>
      </div>
    </div>
  );
}

// Main export with GoogleMapsProvider wrapper
export default function DriverMapPageGoogle() {
  return (
    <GoogleMapsProvider>
      <DriverMapPageContent />
    </GoogleMapsProvider>
  );
}
