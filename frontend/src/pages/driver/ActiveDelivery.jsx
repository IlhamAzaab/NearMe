/**
 * Driver Active Delivery Page
 *
 * Shows the driver's currently active delivery with:
 * - Live map tracking with OSRM routes
 * - Geolocation updates to server
 * - Status progression buttons
 * - Customer contact info
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import DriverLayout from "../../components/DriverLayout";

// Leaflet imports
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

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

export default function ActiveDelivery() {
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const routeLayerRef = useRef(null);
  const markersRef = useRef({});
  const watchIdRef = useRef(null);

  const [delivery, setDelivery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentPosition, setCurrentPosition] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);

  // ============================================================================
  // FETCH ACTIVE DELIVERY
  // ============================================================================

  const fetchActiveDelivery = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        "http://localhost:5000/driver/deliveries/active",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await response.json();
      if (response.ok && data.delivery) {
        setDelivery(data.delivery);
      } else if (response.ok && !data.delivery) {
        // No active delivery, redirect to available
        navigate("/driver/deliveries");
      } else {
        setError(data.message || "Failed to fetch delivery");
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setError("Failed to fetch delivery");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "driver") {
      navigate("/login");
      return;
    }
    fetchActiveDelivery();
  }, [fetchActiveDelivery, navigate]);

  // ============================================================================
  // INITIALIZE MAP
  // ============================================================================

  useEffect(() => {
    if (!delivery || !mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [6.9271, 79.8612], // Default to Colombo
      zoom: 13,
      zoomControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [delivery]);

  // ============================================================================
  // GEOLOCATION WATCH
  // ============================================================================

  useEffect(() => {
    if (!delivery) return;

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const pos = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setCurrentPosition(pos);
      },
      (err) => {
        console.error("Geolocation error:", err);
        setError("Failed to get location. Please enable GPS.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [delivery]);

  // ============================================================================
  // UPDATE LOCATION TO SERVER
  // ============================================================================

  useEffect(() => {
    if (!delivery || !currentPosition) return;

    const updateLocation = async () => {
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
            body: JSON.stringify({
              latitude: currentPosition.lat,
              longitude: currentPosition.lng,
            }),
          }
        );
      } catch (err) {
        console.error("Location update error:", err);
      }
    };

    updateLocation();
    const interval = setInterval(updateLocation, 5000);
    return () => clearInterval(interval);
  }, [delivery, currentPosition]);

  // ============================================================================
  // UPDATE MAP WITH POSITIONS AND ROUTE
  // ============================================================================

  useEffect(() => {
    if (!mapInstanceRef.current || !currentPosition || !delivery) return;

    const map = mapInstanceRef.current;

    // Parse restaurant location (backend returns as delivery.order.restaurant or delivery.restaurant)
    const restaurant = delivery.order?.restaurant || delivery.restaurant;
    const restaurantLat = parseFloat(restaurant?.latitude);
    const restaurantLng = parseFloat(restaurant?.longitude);

    // Parse customer location (backend returns as delivery.order.delivery or delivery.delivery)
    const deliveryInfo = delivery.order?.delivery || delivery;
    const customerLat = parseFloat(
      deliveryInfo?.latitude || delivery.delivery_latitude
    );
    const customerLng = parseFloat(
      deliveryInfo?.longitude || delivery.delivery_longitude
    );

    // Create/update driver marker
    if (!markersRef.current.driver) {
      markersRef.current.driver = L.marker(
        [currentPosition.lat, currentPosition.lng],
        {
          icon: L.divIcon({
            className: "driver-marker",
            html: `<div style="background: #3B82F6; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 2px 10px rgba(0,0,0,0.3);">
            <span style="font-size: 20px;">🛵</span>
          </div>`,
            iconSize: [40, 40],
            iconAnchor: [20, 20],
          }),
        }
      ).addTo(map);
    } else {
      markersRef.current.driver.setLatLng([
        currentPosition.lat,
        currentPosition.lng,
      ]);
    }

    // Create restaurant marker
    if (
      !isNaN(restaurantLat) &&
      !isNaN(restaurantLng) &&
      !markersRef.current.restaurant
    ) {
      markersRef.current.restaurant = L.marker([restaurantLat, restaurantLng], {
        icon: L.divIcon({
          className: "restaurant-marker",
          html: `<div style="background: #EF4444; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 2px 10px rgba(0,0,0,0.3);">
            <span style="font-size: 18px;">🍽️</span>
          </div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        }),
      }).addTo(map);
    }

    // Create customer marker
    if (
      !isNaN(customerLat) &&
      !isNaN(customerLng) &&
      !markersRef.current.customer
    ) {
      markersRef.current.customer = L.marker([customerLat, customerLng], {
        icon: L.divIcon({
          className: "customer-marker",
          html: `<div style="background: #10B981; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 2px 10px rgba(0,0,0,0.3);">
            <span style="font-size: 18px;">📍</span>
          </div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        }),
      }).addTo(map);
    }

    // Fit bounds to show all markers
    const bounds = L.latLngBounds([currentPosition.lat, currentPosition.lng]);
    if (!isNaN(restaurantLat) && !isNaN(restaurantLng)) {
      bounds.extend([restaurantLat, restaurantLng]);
    }
    if (!isNaN(customerLat) && !isNaN(customerLng)) {
      bounds.extend([customerLat, customerLng]);
    }
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [currentPosition, delivery]);

  // ============================================================================
  // FETCH OSRM ROUTE
  // ============================================================================

  useEffect(() => {
    if (!currentPosition || !delivery || !mapInstanceRef.current) return;

    const fetchRoute = async () => {
      try {
        const map = mapInstanceRef.current;

        // Determine destination based on status
        let destLat, destLng;
        const status = delivery.status;

        // Get restaurant and delivery locations from proper nested structure
        const restaurant = delivery.order?.restaurant || delivery.restaurant;
        const deliveryInfo = delivery.order?.delivery || delivery;

        if (status === "assigned" || status === "picking_up") {
          // Route to restaurant
          destLat = parseFloat(restaurant?.latitude);
          destLng = parseFloat(restaurant?.longitude);
        } else {
          // Route to customer
          destLat = parseFloat(
            deliveryInfo?.latitude || delivery.delivery_latitude
          );
          destLng = parseFloat(
            deliveryInfo?.longitude || delivery.delivery_longitude
          );
        }

        if (isNaN(destLat) || isNaN(destLng)) return;

        const url = `https://router.project-osrm.org/route/v1/driving/${currentPosition.lng},${currentPosition.lat};${destLng},${destLat}?overview=full&geometries=geojson`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes[0]) {
          const route = data.routes[0];

          // Update route info
          setRouteInfo({
            distance: (route.distance / 1000).toFixed(1),
            duration: Math.ceil(route.duration / 60),
          });

          // Remove old route layer
          if (routeLayerRef.current) {
            map.removeLayer(routeLayerRef.current);
          }

          // Add new route
          const color =
            status === "assigned" || status === "picking_up"
              ? "#EF4444"
              : "#10B981";
          routeLayerRef.current = L.geoJSON(route.geometry, {
            style: {
              color,
              weight: 5,
              opacity: 0.8,
            },
          }).addTo(map);
        }
      } catch (err) {
        console.error("OSRM error:", err);
      }
    };

    fetchRoute();
    const interval = setInterval(fetchRoute, 30000);
    return () => clearInterval(interval);
  }, [currentPosition, delivery]);

  // ============================================================================
  // UPDATE DELIVERY STATUS
  // ============================================================================

  const updateStatus = async (newStatus) => {
    setUpdating(true);
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
        }
      );

      const data = await response.json();
      if (response.ok) {
        if (newStatus === "delivered") {
          // Delivery complete, navigate back
          navigate("/driver/deliveries");
        } else {
          setDelivery((prev) => ({ ...prev, status: newStatus }));
        }
      } else {
        alert(data.message || "Failed to update status");
      }
    } catch (err) {
      console.error("Status update error:", err);
      alert("Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  // ============================================================================
  // STATUS HELPERS
  // ============================================================================

  const getNextStatus = () => {
    const statusFlow = {
      assigned: { next: "picking_up", label: "Start Pickup", icon: "🚗" },
      picking_up: { next: "picked_up", label: "Order Picked Up", icon: "📦" },
      picked_up: { next: "delivering", label: "Start Delivery", icon: "🛵" },
      delivering: { next: "delivered", label: "Order Delivered", icon: "✅" },
    };
    return statusFlow[delivery?.status] || null;
  };

  const getStatusLabel = (status) => {
    const labels = {
      assigned: "Assigned",
      picking_up: "On Way to Pickup",
      picked_up: "Order Picked Up",
      delivering: "Delivering",
      delivered: "Delivered",
    };
    return labels[status] || status;
  };

  const getStatusProgress = () => {
    const statuses = [
      "assigned",
      "picking_up",
      "picked_up",
      "delivering",
      "delivered",
    ];
    const currentIdx = statuses.indexOf(delivery?.status);
    return ((currentIdx + 1) / statuses.length) * 100;
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <DriverLayout>
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading delivery...</p>
          </div>
        </div>
      </DriverLayout>
    );
  }

  if (error) {
    return (
      <DriverLayout>
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 text-center max-w-sm">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">⚠️</span>
            </div>
            <p className="text-red-600 font-medium mb-4">{error}</p>
            <button
              onClick={() => navigate("/driver/deliveries")}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg"
            >
              Go to Available Deliveries
            </button>
          </div>
        </div>
      </DriverLayout>
    );
  }

  if (!delivery) {
    return (
      <DriverLayout>
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 text-center max-w-sm">
            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">📦</span>
            </div>
            <p className="text-gray-600 mb-4">No active delivery</p>
            <button
              onClick={() => navigate("/driver/deliveries")}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg"
            >
              Find Deliveries
            </button>
          </div>
        </div>
      </DriverLayout>
    );
  }

  const nextStatus = getNextStatus();

  return (
    <DriverLayout>
      <div className="h-screen flex flex-col relative">
        {/* Map Container */}
        <div ref={mapRef} className="flex-1 z-0" />

        {/* Status Bar at Top */}
        <div className="absolute top-0 left-0 right-0 bg-white/95 backdrop-blur-sm shadow-md z-10 p-4">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => navigate("/driver/deliveries")}
              className="p-2 -ml-2"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <h1 className="font-bold text-lg">
              {getStatusLabel(delivery.status)}
            </h1>
            <div className="w-10"></div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${getStatusProgress()}%` }}
            />
          </div>
        </div>

        {/* Route Info Overlay */}
        {routeInfo && (
          <div className="absolute top-24 left-4 right-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-3 z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">📍</span>
                <div>
                  <p className="font-bold text-lg">{routeInfo.distance} km</p>
                  <p className="text-sm text-gray-500">distance</p>
                </div>
              </div>
              <div className="h-10 w-px bg-gray-200"></div>
              <div className="flex items-center gap-2">
                <span className="text-xl">⏱️</span>
                <div>
                  <p className="font-bold text-lg">{routeInfo.duration} min</p>
                  <p className="text-sm text-gray-500">ETA</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Panel */}
        <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-10">
          {/* Handle */}
          <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mt-3"></div>

          <div className="p-4 space-y-4">
            {/* Destination Info */}
            <div className="flex items-start gap-3">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  delivery.status === "assigned" ||
                  delivery.status === "picking_up"
                    ? "bg-red-100"
                    : "bg-green-100"
                }`}
              >
                <span className="text-2xl">
                  {delivery.status === "assigned" ||
                  delivery.status === "picking_up"
                    ? "🍽️"
                    : "🏠"}
                </span>
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-500">
                  {delivery.status === "assigned" ||
                  delivery.status === "picking_up"
                    ? "Pickup from"
                    : "Deliver to"}
                </p>
                <p className="font-bold text-gray-900">
                  {delivery.status === "assigned" ||
                  delivery.status === "picking_up"
                    ? delivery.restaurant?.name
                    : delivery.customer?.name || "Customer"}
                </p>
                <p className="text-sm text-gray-600 truncate">
                  {delivery.status === "assigned" ||
                  delivery.status === "picking_up"
                    ? delivery.restaurant?.address
                    : delivery.delivery_address}
                </p>
              </div>
              {delivery.customer?.phone && (
                <a
                  href={`tel:${delivery.customer.phone}`}
                  className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center"
                >
                  <svg
                    className="w-6 h-6 text-white"
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
              )}
            </div>

            {/* Order Summary */}
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-sm text-gray-500">Order Total</p>
              <p className="font-bold text-xl text-gray-900">
                Rs. {parseFloat(delivery.total_amount).toFixed(0)}
              </p>
            </div>

            {/* Action Button */}
            {nextStatus && (
              <button
                onClick={() => updateStatus(nextStatus.next)}
                disabled={updating}
                className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {updating ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Updating...
                  </>
                ) : (
                  <>
                    <span>{nextStatus.icon}</span>
                    {nextStatus.label}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </DriverLayout>
  );
}
