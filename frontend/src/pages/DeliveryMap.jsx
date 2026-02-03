/**
 * Delivery Map Page
 *
 * Shows:
 * - Green route: Driver to Restaurant
 * - Grey route: Restaurant to Customer
 * - Real-time driver location updates
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import supabaseClient from "../supabaseClient";
import DriverLayout from "../components/DriverLayout";

// Leaflet imports
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Initialize Supabase
const supabase = supabaseClient;

// Fix default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

export default function DeliveryMap() {
  const navigate = useNavigate();
  const { deliveryId } = useParams();
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef({ driverRoute: null, customerRoute: null });
  const markersRef = useRef({});
  const watchIdRef = useRef(null);

  const [delivery, setDelivery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [status, setStatus] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [driverId, setDriverId] = useState(null);

  // ============================================================================
  // AUTH CHECK
  // ============================================================================

  useEffect(() => {
    const role = localStorage.getItem("role");
    const userId = localStorage.getItem("userId");

    if (role !== "driver") {
      navigate("/login");
      return;
    }

    setDriverId(userId);
  }, [navigate]);

  // ============================================================================
  // FETCH DELIVERY DETAILS
  // ============================================================================

  const fetchDelivery = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");

      const res = await fetch(
        `http://localhost:5000/driver/deliveries/${deliveryId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const data = await res.json();

      if (res.ok) {
        setDelivery(data.delivery);
        setStatus(data.delivery.status);

        // use backend driver location if exists
        if (data.delivery.driver_location?.latitude) {
          setCurrentLocation(data.delivery.driver_location);
        }
      }
    } catch (err) {
      console.error("Fetch delivery error:", err);
    } finally {
      setLoading(false);
    }
  }, [deliveryId]);

  useEffect(() => {
    if (driverId) {
      fetchDelivery();
      // Refresh every 5 seconds
      const interval = setInterval(fetchDelivery, 5000);
      return () => clearInterval(interval);
    }
  }, [driverId, fetchDelivery]);

  // ============================================================================
  // GEOLOCATION TRACKING
  // ============================================================================

  useEffect(() => {
    if (!delivery || !driverId) return;

    // Start watching position
    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setCurrentLocation({ latitude, longitude });

          // Update to backend
          try {
            const token = localStorage.getItem("token");
            await fetch(
              `http://localhost:5000/driver/deliveries/${delivery.id}/location`,
              {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ latitude, longitude }),
              },
            );
          } catch (error) {
            console.error("Location update error:", error);
          }
        },
        (error) => console.error("Geolocation error:", error),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
      );
    }

    return () => {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [delivery, driverId]);

  // ============================================================================
  // MAP INITIALIZATION & ROUTE DRAWING
  // ============================================================================

  useEffect(() => {
    if (!mapRef.current || !delivery) return;

    // Initialize map if not already done
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current).setView([30.2, 71.5], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(mapInstanceRef.current);
    }

    const map = mapInstanceRef.current;

    // Get coordinates

    const restaurantLat = delivery.order.restaurant.latitude;
    const restaurantLng = delivery.order.restaurant.longitude;

    const customerLat = delivery.order.delivery.latitude;
    const customerLng = delivery.order.delivery.longitude;

    const driverLat = currentLocation?.latitude || restaurantLat;
    const driverLng = currentLocation?.longitude || restaurantLng;

    // Remove old layers
    if (layersRef.current.driverRoute) {
      map.removeLayer(layersRef.current.driverRoute);
    }
    if (layersRef.current.customerRoute) {
      map.removeLayer(layersRef.current.customerRoute);
    }

    // Remove old markers
    Object.values(markersRef.current).forEach((marker) => {
      if (marker) map.removeLayer(marker);
    });
    markersRef.current = {};

    // Fetch and draw routes using OSRM
    const drawRoutes = async () => {
      try {
        // Driver to Restaurant route (GREEN) - Use FOOT profile for shortest distance
        const driverToRestaurantUrl = `https://router.project-osrm.org/route/v1/foot/${driverLng},${driverLat};${restaurantLng},${restaurantLat}?geometries=geojson&overview=full`;
        const driverRestaurantRes = await fetch(driverToRestaurantUrl);
        const driverRestaurantData = await driverRestaurantRes.json();

        if (
          driverRestaurantData.routes &&
          driverRestaurantData.routes.length > 0
        ) {
          const route = driverRestaurantData.routes[0];
          const coordinates = route.geometry.coordinates.map((c) => [
            c[1],
            c[0],
          ]);

          layersRef.current.driverRoute = L.polyline(coordinates, {
            color: "#22c55e",
            weight: 5,
            opacity: 0.8,
            dashArray: "0",
          }).addTo(map);
        }

        // Restaurant to Customer route (GREY) - Use FOOT profile for shortest distance
        const restaurantToCustomerUrl = `https://router.project-osrm.org/route/v1/foot/${restaurantLng},${restaurantLat};${customerLng},${customerLat}?geometries=geojson&overview=full`;
        const restaurantCustomerRes = await fetch(restaurantToCustomerUrl);
        const restaurantCustomerData = await restaurantCustomerRes.json();

        if (
          restaurantCustomerData.routes &&
          restaurantCustomerData.routes.length > 0
        ) {
          const route = restaurantCustomerData.routes[0];
          const coordinates = route.geometry.coordinates.map((c) => [
            c[1],
            c[0],
          ]);

          layersRef.current.customerRoute = L.polyline(coordinates, {
            color: "#a0aec0",
            weight: 5,
            opacity: 0.6,
            dashArray: "5, 5",
          }).addTo(map);
        }
      } catch (error) {
        console.error("Route drawing error:", error);
      }
    };

    drawRoutes();

    // Add markers
    // Driver marker
    markersRef.current.driver = L.circleMarker([driverLat, driverLng], {
      radius: 8,
      fillColor: "#3b82f6",
      color: "#fff",
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8,
    })
      .addTo(map)
      .bindPopup("📍 Your Location");

    // Restaurant marker
    markersRef.current.restaurant = L.marker([restaurantLat, restaurantLng], {
      title: "Restaurant",
    })
      .addTo(map)
      .bindPopup(
        `<div><strong>🍽️ ${delivery.order.restaurant.name}</strong><br>${delivery.order.restaurant.address}</div>`,
      );

    // Customer marker
    markersRef.current.customer = L.marker([customerLat, customerLng], {
      title: "Customer",
      icon: L.icon({
        iconUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
      }),
    })
      .addTo(map)
      .bindPopup(
        `<div><strong>🏠 ${delivery.order.customer.name}</strong><br>${delivery.order.delivery.address}</div>`,
      );

    // Fit bounds
    const group = new L.featureGroup([
      markersRef.current.driver,
      markersRef.current.restaurant,
      markersRef.current.customer,
    ]);
    map.fitBounds(group.getBounds().pad(0.1));
  }, [delivery, currentLocation]);

  // ============================================================================
  // STATUS UPDATE HANDLER
  // ============================================================================

  const updateStatus = async (newStatus) => {
    setUpdatingStatus(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:5000/driver/deliveries/${delivery.id}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: newStatus }),
        },
      );

      if (response.ok) {
        setStatus(newStatus);
        fetchDelivery();
      }
    } catch (error) {
      console.error("Status update error:", error);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // ============================================================================
  // HELPERS
  // ============================================================================

  const getStatusSteps = () => {
    const steps = [
      { key: "accepted", label: "Accepted", icon: "✅" },
      {
        key: "heading_to_restaurant",
        label: "Heading to Restaurant",
        icon: "🚗",
      },
      { key: "arrived_restaurant", label: "Arrived at Restaurant", icon: "🏪" },
      { key: "picked_up", label: "Picked Up", icon: "📦" },
      { key: "on_the_way", label: "On the Way", icon: "🚗" },
      { key: "arrived_customer", label: "Arrived at Customer", icon: "🏠" },
      { key: "delivered", label: "Delivered", icon: "🎉" },
    ];
    return steps;
  };

  const getNextStatus = () => {
    const steps = getStatusSteps();
    const currentIndex = steps.findIndex((s) => s.key === status);
    return steps[currentIndex + 1];
  };
  if (
    !delivery ||
    !delivery.order ||
    !delivery.order.restaurant ||
    !delivery.order.delivery ||
    !delivery.driver_location ||
    delivery.order.restaurant.latitude == null ||
    delivery.order.restaurant.longitude == null ||
    delivery.order.delivery.latitude == null ||
    delivery.order.delivery.longitude == null
  ) {
    return (
      <DriverLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <p className="text-xl font-semibold text-gray-900">
              Loading map...
            </p>
          </div>
        </div>
      </DriverLayout>
    );
  }

  if (!delivery) {
    return (
      <DriverLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <p className="text-xl font-semibold text-gray-900">
              Delivery not found
            </p>
            <button
              onClick={() => navigate("/driver/delivery/active")}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Back to Deliveries
            </button>
          </div>
        </div>
      </DriverLayout>
    );
  }

  const nextStatus = getNextStatus();

  return (
    <DriverLayout>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-4 lg:p-6">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Delivery Tracking
                </h1>
                <p className="text-gray-500 mt-1">
                  Order #{delivery.order.order_number}
                </p>
              </div>
              <button
                onClick={() => navigate("/driver/deliveries")}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 lg:p-6 max-w-6xl mx-auto w-full">
          {/* Map */}
          <div className="flex-1 bg-white rounded-xl shadow overflow-hidden">
            <div
              ref={mapRef}
              className="w-full h-96 lg:h-full min-h-[500px]"
            ></div>
          </div>

          {/* Info Panel */}
          <div className="lg:w-96 space-y-4">
            {/* Status Card */}
            <div className="bg-white rounded-xl shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-4">
                Delivery Status
              </h3>
              <div className="space-y-3">
                {getStatusSteps().map((step, index) => {
                  const isCompleted = getStatusSteps()
                    .slice(0, index)
                    .some((s) => s.key === status);
                  const isCurrent = step.key === status;

                  return (
                    <div
                      key={step.key}
                      className={`flex items-center gap-3 p-3 rounded-lg ${
                        isCurrent
                          ? "bg-blue-50 border border-blue-200"
                          : isCompleted
                            ? "bg-green-50"
                            : "bg-gray-50"
                      }`}
                    >
                      <div className="text-xl">{step.icon}</div>
                      <div className="flex-1">
                        <p
                          className={`text-sm font-medium ${
                            isCurrent ? "text-blue-900" : "text-gray-700"
                          }`}
                        >
                          {step.label}
                        </p>
                      </div>
                      {isCompleted && <span className="text-lg">✅</span>}
                      {isCurrent && (
                        <span className="animate-pulse text-lg">●</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Restaurant Info */}
            <div className="bg-white rounded-xl shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-3">Restaurant</h3>
              <p className="font-medium text-gray-900">
                {delivery.order.restaurant.name}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {delivery.order.restaurant.address}
              </p>
            </div>

            {/* Customer Info */}
            <div className="bg-white rounded-xl shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-3">Customer</h3>
              <p className="font-medium text-gray-900">
                {delivery.order.customer.name}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {delivery.order.delivery.address}
              </p>
              <p className="text-sm text-gray-600 mt-2">
                📞 {delivery.order.customer.phone}
              </p>
            </div>

            {/* Action Button */}
            {nextStatus && (
              <button
                onClick={() => updateStatus(nextStatus.key)}
                disabled={updatingStatus}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {updatingStatus ? "Updating..." : `Mark as ${nextStatus.label}`}
              </button>
            )}

            {status === "delivered" && (
              <button
                onClick={() => navigate("/driver/deliveries")}
                className="w-full py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors"
              >
                ✅ Delivery Complete
              </button>
            )}
          </div>
        </div>
      </div>
    </DriverLayout>
  );
}
