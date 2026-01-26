import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DriverLayout from "../../components/DriverLayout";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix for default markers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Custom emoji icons
const createEmojiIcon = (emoji, bgColor) =>
  L.divIcon({
    html: `<div style="background-color: ${bgColor}; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">${emoji}</div>`,
    className: "",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });

const driverIcon = createEmojiIcon("📍", "#10b981"); // Green location pin
const restaurantIcon = createEmojiIcon("🍽️", "#ef4444"); // Red restaurant
const customerIcon = createEmojiIcon("👤", "#3b82f6"); // Blue person

// Default driver location (Kinniya, Sri Lanka)
const DEFAULT_DRIVER_LOCATION = {
  latitude: 8.5017,
  longitude: 81.186,
};

export default function AvailableDeliveries() {
  const navigate = useNavigate();
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(null);
  const [driverLocation, setDriverLocation] = useState(DEFAULT_DRIVER_LOCATION);
  const [inDeliveringMode, setInDeliveringMode] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "driver") {
      navigate("/login");
      return;
    }

    // Check if driver is in delivering mode first
    checkDeliveringMode();

    // Get driver's current location, fallback to default
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setDriverLocation(location);
          fetchPendingDeliveriesWithLocation(location);
        },
        (error) => {
          console.error(
            "Error getting location, using default Kinniya location:",
            error,
          );
          setDriverLocation(DEFAULT_DRIVER_LOCATION);
          fetchPendingDeliveriesWithLocation(DEFAULT_DRIVER_LOCATION);
        },
      );
    } else {
      setDriverLocation(DEFAULT_DRIVER_LOCATION);
      fetchPendingDeliveriesWithLocation(DEFAULT_DRIVER_LOCATION);
    }
  }, [navigate]);

  const checkDeliveringMode = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        "http://localhost:5000/driver/deliveries/pickups?driver_latitude=0&driver_longitude=0",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (res.ok) {
        const data = await res.json();
        // If driver has any pickups (accepted but not yet picked up), they're in pickup mode
        // If no pickups but has active deliveries, check for delivering mode
        if (!data.pickups || data.pickups.length === 0) {
          // Check for deliveries in delivering statuses
          const activeRes = await fetch(
            "http://localhost:5000/driver/deliveries/active",
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          );
          if (activeRes.ok) {
            const activeData = await activeRes.json();
            const hasDeliveringOrders = activeData.deliveries?.some((d) =>
              ["picked_up", "on_the_way", "at_customer"].includes(d.status),
            );
            if (hasDeliveringOrders) {
              setInDeliveringMode(true);
              // Redirect to active deliveries
              setTimeout(() => navigate("/driver/deliveries/active"), 100);
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to check delivering mode:", e);
    }
  };

  const fetchPendingDeliveriesWithLocation = async (location) => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");

      // Send driver location with request
      const currentLoc = location || DEFAULT_DRIVER_LOCATION;
      const url = `http://localhost:5000/driver/deliveries/pending?driver_latitude=${currentLoc.latitude}&driver_longitude=${currentLoc.longitude}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));

        // If it's a network error that can be retried
        if (res.status === 503 && errorData.retry) {
          console.error("Database connection issue, will retry...");
        }

        throw new Error(errorData.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      console.log("Fetched deliveries:", data);
      setDeliveries(data.deliveries || []);

      // If driver location from backend is available, use it
      if (data.driver_location) {
        setDriverLocation(data.driver_location);
      }
    } catch (e) {
      console.error("Failed to fetch deliveries:", e);
      setDeliveries([]);

      // Show user-friendly error message
      if (
        e.message.includes("Failed to fetch") ||
        e.message.includes("NetworkError")
      ) {
        alert(
          "Cannot connect to server. Please check your internet connection and try again.",
        );
      } else {
        console.error("Fetch error details:", e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptDelivery = async (deliveryId) => {
    setAccepting(deliveryId);
    try {
      const token = localStorage.getItem("token");
      const body = {};

      // Send driver location if available
      if (driverLocation) {
        body.driver_latitude = driverLocation.latitude;
        body.driver_longitude = driverLocation.longitude;
      }

      const res = await fetch(
        `http://localhost:5000/driver/deliveries/${deliveryId}/accept`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );

      const data = await res.json();

      if (res.ok) {
        // Remove from list and show success message
        setDeliveries((prev) =>
          prev.filter((d) => d.delivery_id !== deliveryId),
        );
        alert("Delivery accepted successfully!");
        // Stay on current page - driver navigates manually when ready
      } else {
        alert(data.message || "Failed to accept delivery");
      }
    } catch (e) {
      console.error("Accept error:", e);
      alert("Failed to accept delivery");
    } finally {
      setAccepting(null);
    }
  };

  return (
    <DriverLayout>
      <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600 bg-clip-text text-transparent">
              Available Deliveries
            </h1>
            <p className="text-gray-600 mt-1 text-sm sm:text-base">
              Accept deliveries and start earning
            </p>
          </div>
          <button
            onClick={() => navigate("/driver/deliveries/active")}
            className="px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-300 shadow-md hover:shadow-lg font-medium text-sm sm:text-base whitespace-nowrap"
          >
            Active Deliveries
          </button>
        </div>

        {/* Delivering Mode Restriction */}
        {inDeliveringMode ? (
          <div className="bg-yellow-50 rounded-xl shadow border border-yellow-200 p-12 text-center">
            <div className="text-6xl mb-4">🚗</div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">
              Currently in Delivering Mode
            </h3>
            <p className="text-gray-600 mb-6">
              Complete your current deliveries before accepting new ones
            </p>
            <button
              onClick={() => navigate("/driver/deliveries/active")}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-300 shadow-md hover:shadow-lg font-medium"
            >
              Go to Active Deliveries
            </button>
          </div>
        ) : loading ? (
          /* Loading State */
          <div className="bg-white rounded-xl shadow border border-blue-100 p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600 font-medium">
              Loading deliveries...
            </p>
          </div>
        ) : deliveries.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-xl shadow border border-blue-100 hover:shadow-xl transition-shadow duration-300">
            <div className="text-center py-12 text-gray-500">
              <svg
                className="w-20 h-20 mx-auto text-gray-400 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                />
              </svg>
              <h3 className="text-xl font-bold text-gray-700 mb-2">
                No Available Deliveries
              </h3>
              <p className="text-gray-500">
                Check back later for new delivery requests
              </p>
              <button
                onClick={() =>
                  fetchPendingDeliveriesWithLocation(driverLocation)
                }
                className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Refresh
              </button>
            </div>
          </div>
        ) : (
          /* Deliveries Grid */
          <div className="grid gap-6 lg:grid-cols-2">
            {deliveries.map((delivery) => (
              <DeliveryCard
                key={delivery.delivery_id}
                delivery={delivery}
                driverLocation={driverLocation}
                accepting={accepting === delivery.delivery_id}
                onAccept={handleAcceptDelivery}
              />
            ))}
          </div>
        )}
      </div>
    </DriverLayout>
  );
}

function DeliveryCard({ delivery, driverLocation, accepting, onAccept }) {
  const {
    delivery_id,
    order_number,
    restaurant,
    delivery: deliveryAddress,
    customer,
    pricing,
    distance_km,
    estimated_time_minutes,
    driver_to_restaurant_route,
    restaurant_to_customer_route,
    order_items = [],
  } = delivery;

  // Calculate total items
  const totalItems = order_items.reduce(
    (sum, item) => sum + (item.quantity || 0),
    0,
  );

  // Calculate map center and bounds
  const mapCenter = restaurant
    ? [restaurant.latitude, restaurant.longitude]
    : [0, 0];

  return (
    <div className="bg-white rounded-xl shadow-lg border border-blue-100 overflow-hidden hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 animate-fade-in">
      {/* Interactive Map */}
      <div className="h-72 relative">
        {restaurant && deliveryAddress && (
          <MapContainer
            center={mapCenter}
            zoom={13}
            scrollWheelZoom={true}
            className="h-full w-full"
            zoomControl={true}
            dragging={true}
            doubleClickZoom={true}
            touchZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Driver Marker */}
            {driverLocation && (
              <Marker
                position={[driverLocation.latitude, driverLocation.longitude]}
                icon={driverIcon}
              >
                <Popup>
                  <div className="text-center">
                    <p className="font-bold text-green-600">Your Location</p>
                    <p className="text-xs text-gray-600">Driver Position</p>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Restaurant Marker */}
            <Marker
              position={[restaurant.latitude, restaurant.longitude]}
              icon={restaurantIcon}
            >
              <Popup>
                <div className="min-w-[200px]">
                  <p className="font-bold text-red-600">🍽️ Restaurant</p>
                  <p className="font-semibold mt-1">{restaurant.name}</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {restaurant.address}
                  </p>
                </div>
              </Popup>
            </Marker>

            {/* Customer Marker */}
            <Marker
              position={[deliveryAddress.latitude, deliveryAddress.longitude]}
              icon={customerIcon}
            >
              <Popup>
                <div className="min-w-[200px]">
                  <p className="font-bold text-blue-600">👤 Customer</p>
                  <p className="font-semibold mt-1">
                    {customer?.name || "Customer"}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {deliveryAddress.address}
                  </p>
                </div>
              </Popup>
            </Marker>

            {/* Route from Driver to Restaurant - Light Green */}
            {driver_to_restaurant_route &&
              driver_to_restaurant_route.coordinates && (
                <Polyline
                  positions={driver_to_restaurant_route.coordinates.map(
                    (coord) => [coord[1], coord[0]],
                  )}
                  color="#86efac"
                  weight={6}
                  opacity={0.9}
                />
              )}

            {/* Route from Restaurant to Customer - Grey */}
            {restaurant_to_customer_route &&
              restaurant_to_customer_route.coordinates && (
                <Polyline
                  positions={restaurant_to_customer_route.coordinates.map(
                    (coord) => [coord[1], coord[0]],
                  )}
                  color="#9ca3af"
                  weight={6}
                  opacity={0.9}
                />
              )}
          </MapContainer>
        )}

        {/* Order Number Badge */}
        <div className="absolute top-3 right-3 bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 rounded-full shadow-lg">
          <p className="text-xs font-semibold text-white">
            Order #{order_number}
          </p>
        </div>

        {/* Items Count Badge */}
        <div className="absolute top-3 left-3 bg-gradient-to-r from-green-600 to-green-700 px-4 py-2 rounded-full shadow-lg">
          <p className="text-xs font-bold text-white">
            {totalItems} item{totalItems !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Delivery Details */}
      <div className="p-6 space-y-5">
        {/* Earnings and Stats */}
        <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-green-700 font-semibold uppercase mb-1">
                Your Earnings
              </p>
              <p className="text-3xl font-bold text-green-600">
                Rs. {pricing?.driver_earnings?.toFixed(2) || "0.00"}
              </p>
            </div>
            <div className="text-right space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-700">
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
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                  />
                </svg>
                <span className="font-bold">{distance_km} km (OSRM)</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700">
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
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="font-bold">{estimated_time_minutes} min</span>
              </div>
            </div>
          </div>
        </div>

        {/* Pick-up Location */}
        <div className="bg-red-50 rounded-lg p-4 border border-red-200">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-r from-red-500 to-red-600 rounded-full flex items-center justify-center text-2xl shadow-md">
              🍽️
            </div>
            <div className="flex-1">
              <p className="text-xs text-red-700 uppercase font-bold mb-1 flex items-center gap-1">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 10l7-7m0 0l7 7m-7-7v18"
                  />
                </svg>
                Pick-up Location
              </p>
              <p className="font-bold text-gray-900 text-lg">
                {restaurant.name}
              </p>
              <p className="text-sm text-gray-600 mt-1">{restaurant.address}</p>
              {restaurant.phone && (
                <p className="text-sm text-gray-700 mt-2 flex items-center gap-1 font-medium">
                  <svg
                    className="w-4 h-4"
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
                  {restaurant.phone}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Delivery Address */}
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-2xl shadow-md">
              👤
            </div>
            <div className="flex-1">
              <p className="text-xs text-blue-700 uppercase font-bold mb-1 flex items-center gap-1">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 14l-7 7m0 0l-7-7m7 7V3"
                  />
                </svg>
                Delivery Address
              </p>
              <p className="font-bold text-gray-900 text-lg">
                {customer?.name || "Customer"}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {deliveryAddress.address}
              </p>
              {customer?.phone && (
                <p className="text-sm text-gray-700 mt-2 flex items-center gap-1 font-medium">
                  <svg
                    className="w-4 h-4"
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
                  {customer.phone}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Accept Button */}
        <button
          onClick={() => onAccept(delivery_id)}
          disabled={accepting}
          className="w-full py-4 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl font-bold text-lg hover:from-green-700 hover:to-green-800 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105"
        >
          {accepting ? (
            <>
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
              <span>Accepting...</span>
            </>
          ) : (
            <>
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
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span>ACCEPT DELIVERY</span>
            </>
          )}
        </button>
      </div>

      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}
