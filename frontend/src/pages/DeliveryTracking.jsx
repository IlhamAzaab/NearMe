/**
 * Driver Delivery Tracking Page
 *
 * Features:
 * - Live OSRM route display between driver → restaurant → customer
 * - Real-time location updates every 5-10 seconds
 * - Status update buttons (picking_up, picked_up, delivering, delivered)
 * - Supabase Realtime for notifications
 * - Turn-by-turn navigation info
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import supabaseClient from "../supabaseClient";
import AnimatedAlert, { useAlert } from "../components/AnimatedAlert";
import { API_URL } from "../config";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Shared Supabase client (singleton)
const supabase = supabaseClient;

// Fix Leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Custom marker icons
const createIcon = (emoji, color) => {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="background: ${color}; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.3); border: 3px solid white;">${emoji}</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
};

const driverIcon = createIcon("🚗", "#3B82F6");
const restaurantIcon = createIcon("🍽️", "#EF4444");
const customerIcon = createIcon("🏠", "#10B981");

// Map controller component
function MapController({ bounds }) {
  const map = useMap();

  useEffect(() => {
    if (bounds && bounds.length === 2) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [bounds, map]);

  return null;
}

export default function DriverDeliveryTracking() {
  const navigate = useNavigate();
  const { deliveryId } = useParams();

  const [delivery, setDelivery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);

  // Driver location
  const [driverLocation, setDriverLocation] = useState(null);
  const [watchId, setWatchId] = useState(null);

  // Route data
  const [routeToRestaurant, setRouteToRestaurant] = useState(null);
  const [routeToCustomer, setRouteToCustomer] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const { alert: alertState, visible: alertVisible, showError } = useAlert();

  // Location update interval
  const locationIntervalRef = useRef(null);

  // ============================================================================
  // FETCH ACTIVE DELIVERY
  // ============================================================================

  const fetchActiveDelivery = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/driver/deliveries/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (response.ok) {
        setDelivery(data.delivery);
        if (!data.delivery) {
          setError("No active delivery found");
        }
      } else {
        setError(data.message || "Failed to fetch delivery");
      }
    } catch (err) {
      console.error("Fetch delivery error:", err);
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActiveDelivery();
  }, [fetchActiveDelivery]);

  // ============================================================================
  // GEOLOCATION TRACKING
  // ============================================================================

  useEffect(() => {
    if (!delivery) return;

    // Start watching position
    if (navigator.geolocation) {
      const id = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setDriverLocation({ latitude, longitude });
        },
        (error) => {
          console.error("Geolocation error:", error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        },
      );
      setWatchId(id);
    }

    return () => {
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [delivery]);

  // ============================================================================
  // SEND LOCATION UPDATES TO SERVER (every 5 seconds)
  // ============================================================================

  useEffect(() => {
    if (!delivery || !driverLocation) return;

    const sendLocationUpdate = async () => {
      try {
        const token = localStorage.getItem("token");
        await fetch(`${API_URL}/driver/deliveries/${delivery.id}/location`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            latitude: driverLocation.latitude,
            longitude: driverLocation.longitude,
          }),
        });
      } catch (err) {
        console.error("Location update error:", err);
      }
    };

    // Send immediately
    sendLocationUpdate();

    // Then every 5 seconds
    locationIntervalRef.current = setInterval(sendLocationUpdate, 5000);

    return () => {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
      }
    };
  }, [delivery, driverLocation]);

  // ============================================================================
  // FETCH OSRM ROUTES
  // ============================================================================

  const fetchRoute = async (from, to) => {
    try {
      // Use FOOT profile for shortest distance (motorcycles can use walking paths in town)
      const url = `https://router.project-osrm.org/route/v1/foot/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.code === "Ok" && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        return {
          coordinates: route.geometry.coordinates.map(([lng, lat]) => [
            lat,
            lng,
          ]),
          distance: route.distance / 1000, // km
          duration: route.duration / 60, // minutes
        };
      }
      return null;
    } catch (error) {
      console.error("OSRM route error:", error);
      return null;
    }
  };

  useEffect(() => {
    if (!delivery || !driverLocation) return;

    const fetchRoutes = async () => {
      const restaurant = {
        latitude: delivery.order.restaurant.latitude,
        longitude: delivery.order.restaurant.longitude,
      };
      const customer = {
        latitude: delivery.order.delivery.latitude,
        longitude: delivery.order.delivery.longitude,
      };

      // Determine which routes to show based on delivery status
      if (delivery.status === "assigned" || delivery.status === "picking_up") {
        // Driver → Restaurant
        const routeToRest = await fetchRoute(driverLocation, restaurant);
        if (routeToRest) {
          setRouteToRestaurant(routeToRest.coordinates);
          setRouteInfo({
            phase: "pickup",
            distance: routeToRest.distance,
            duration: routeToRest.duration,
            destination: delivery.order.restaurant.name,
          });
        }
      } else if (
        delivery.status === "picked_up" ||
        delivery.status === "delivering"
      ) {
        // Driver → Customer
        const routeToCust = await fetchRoute(driverLocation, customer);
        if (routeToCust) {
          setRouteToCustomer(routeToCust.coordinates);
          setRouteInfo({
            phase: "delivery",
            distance: routeToCust.distance,
            duration: routeToCust.duration,
            destination: delivery.order.delivery.address,
          });
        }
      }
    };

    fetchRoutes();

    // Refresh routes every 30 seconds
    const interval = setInterval(fetchRoutes, 30000);
    return () => clearInterval(interval);
  }, [delivery, driverLocation]);

  // ============================================================================
  // UPDATE DELIVERY STATUS
  // ============================================================================

  const updateStatus = async (newStatus) => {
    if (!delivery) return;

    setUpdating(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${API_URL}/driver/deliveries/${delivery.id}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: newStatus }),
        },
      );

      const data = await response.json();
      if (response.ok) {
        setDelivery((prev) => ({ ...prev, status: newStatus }));

        // If delivered, navigate back to dashboard
        if (newStatus === "delivered") {
          setTimeout(() => navigate("/driver/dashboard"), 2000);
        }
      } else {
        showError(data.message || "Failed to update status");
      }
    } catch (err) {
      console.error("Update status error:", err);
      showError("Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-500 mx-auto"></div>
          <p className="text-white mt-4">Loading delivery...</p>
        </div>
      </div>
    );
  }

  if (error || !delivery) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 text-lg">
            {error || "No active delivery"}
          </p>
          <button
            onClick={() => navigate("/driver/dashboard")}
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const restaurant = delivery.order.restaurant;
  const customer = delivery.order.delivery;

  // Calculate map bounds
  const allPoints = [
    [restaurant.latitude, restaurant.longitude],
    [customer.latitude, customer.longitude],
  ];
  if (driverLocation) {
    allPoints.push([driverLocation.latitude, driverLocation.longitude]);
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      <AnimatedAlert alert={alertState} visible={alertVisible} />
      {/* Map Container */}
      <div className="flex-1 relative">
        <MapContainer
          center={[restaurant.latitude, restaurant.longitude]}
          zoom={14}
          className="h-full w-full"
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapController bounds={allPoints.length >= 2 ? allPoints : null} />

          {/* Driver Marker */}
          {driverLocation && (
            <Marker
              position={[driverLocation.latitude, driverLocation.longitude]}
              icon={driverIcon}
            >
              <Popup>📍 Your Location</Popup>
            </Marker>
          )}

          {/* Restaurant Marker */}
          <Marker
            position={[restaurant.latitude, restaurant.longitude]}
            icon={restaurantIcon}
          >
            <Popup>
              <strong>{restaurant.name}</strong>
              <br />
              {restaurant.address}
            </Popup>
          </Marker>

          {/* Customer Marker */}
          <Marker
            position={[customer.latitude, customer.longitude]}
            icon={customerIcon}
          >
            <Popup>
              <strong>Drop-off Location</strong>
              <br />
              {customer.address}
            </Popup>
          </Marker>

          {/* Route to Restaurant (blue) */}
          {routeToRestaurant && (
            <Polyline
              positions={routeToRestaurant}
              color="#3B82F6"
              weight={5}
              opacity={0.8}
            />
          )}

          {/* Route to Customer (green) */}
          {routeToCustomer && (
            <Polyline
              positions={routeToCustomer}
              color="#10B981"
              weight={5}
              opacity={0.8}
            />
          )}
        </MapContainer>

        {/* Route Info Overlay */}
        {routeInfo && (
          <div className="absolute top-4 left-4 right-4 bg-white rounded-xl shadow-lg p-4 z-[1000]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">
                  {routeInfo.phase === "pickup"
                    ? "Heading to pickup"
                    : "Delivering to"}
                </p>
                <p className="font-bold text-gray-900 truncate">
                  {routeInfo.destination}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-blue-600">
                  {routeInfo.distance.toFixed(1)} km
                </p>
                <p className="text-sm text-gray-500">
                  ~{Math.ceil(routeInfo.duration)} min
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Panel */}
      <div className="bg-white rounded-t-3xl shadow-2xl p-6 space-y-4">
        {/* Order Info */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Order</p>
            <p className="font-bold text-lg">{delivery.order.order_number}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Amount</p>
            <p className="font-bold text-lg text-green-600">
              Rs. {delivery.order.total_amount.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Customer Info */}
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Customer</p>
              <p className="font-semibold">{delivery.order.customer.name}</p>
            </div>
            <a
              href={`tel:${delivery.order.customer.phone}`}
              className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center"
            >
              <svg
                className="w-6 h-6 text-green-600"
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
            </a>
          </div>
        </div>

        {/* Status Progress */}
        <div className="flex items-center justify-between text-center">
          {[
            "assigned",
            "picking_up",
            "picked_up",
            "delivering",
            "delivered",
          ].map((status, index) => {
            const statuses = [
              "assigned",
              "picking_up",
              "picked_up",
              "delivering",
              "delivered",
            ];
            const currentIndex = statuses.indexOf(delivery.status);
            const isCompleted = index <= currentIndex;
            const isCurrent = index === currentIndex;

            return (
              <div key={status} className="flex-1">
                <div
                  className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center text-sm ${
                    isCompleted
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-500"
                  } ${isCurrent ? "ring-2 ring-blue-300" : ""}`}
                >
                  {index + 1}
                </div>
                <p
                  className={`text-xs mt-1 ${
                    isCompleted ? "text-blue-600 font-medium" : "text-gray-400"
                  }`}
                >
                  {status.replace("_", " ")}
                </p>
              </div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {delivery.status === "assigned" && (
            <button
              onClick={() => updateStatus("picking_up")}
              disabled={updating}
              className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {updating ? "Updating..." : "🚗 Start Pickup"}
            </button>
          )}

          {delivery.status === "picking_up" && (
            <button
              onClick={() => updateStatus("picked_up")}
              disabled={updating}
              className="w-full py-4 bg-purple-600 text-white rounded-xl font-bold text-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {updating ? "Updating..." : "📦 Order Picked Up"}
            </button>
          )}

          {delivery.status === "picked_up" && (
            <button
              onClick={() => updateStatus("delivering")}
              disabled={updating}
              className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold text-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {updating ? "Updating..." : "🛵 Start Delivery"}
            </button>
          )}

          {delivery.status === "delivering" && (
            <button
              onClick={() => updateStatus("delivered")}
              disabled={updating}
              className="w-full py-4 bg-green-600 text-white rounded-xl font-bold text-lg hover:bg-green-700 disabled:opacity-50"
            >
              {updating ? "Updating..." : "✅ Complete Delivery"}
            </button>
          )}

          {delivery.status === "delivered" && (
            <div className="text-center py-4">
              <p className="text-2xl">🎉</p>
              <p className="text-green-600 font-bold text-lg">
                Delivery Completed!
              </p>
              <p className="text-gray-500">Redirecting to dashboard...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
