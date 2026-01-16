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

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "driver") {
      navigate("/login");
      return;
    }

    // Get driver's current location, fallback to default
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setDriverLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          console.error(
            "Error getting location, using default Kinniya location:",
            error
          );
          setDriverLocation(DEFAULT_DRIVER_LOCATION);
        }
      );
    } else {
      setDriverLocation(DEFAULT_DRIVER_LOCATION);
    }

    fetchPendingDeliveries();
  }, [navigate]);

  const fetchPendingDeliveries = async () => {
    try {
      const token = localStorage.getItem("token");

      // Send driver location with request
      const currentLoc = driverLocation || DEFAULT_DRIVER_LOCATION;
      const url = `http://localhost:5000/driver/deliveries/pending?driver_latitude=${currentLoc.latitude}&driver_longitude=${currentLoc.longitude}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        
        // If it's a network error that can be retried
        if (res.status === 503 && errorData.retry) {
          console.error("Database connection issue, will retry...");
          // Could add retry logic here
        }
        
        throw new Error(errorData.message || `HTTP ${res.status}`);
      }
      
      const data = await res.json();
      setDeliveries(data.deliveries || []);
      
      // If driver location from backend is available, use it
      if (data.driver_location) {
        setDriverLocation(data.driver_location);
      }
    } catch (e) {
      console.error("Failed to fetch deliveries:", e);
      setDeliveries([]);
      
      // Show user-friendly error message
      if (e.message.includes("Failed to fetch") || e.message.includes("NetworkError")) {
        alert("Cannot connect to server. Please check your internet connection and try again.");
      }
    }
  };

  const handleAccept = async (deliveryId) => {
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
        }
      );

      const data = await res.json();

      if (res.ok) {
        // Remove from list and show success message
        setDeliveries((prev) =>
          prev.filter((d) => d.delivery_id !== deliveryId)
        );
        alert("Delivery accepted! Check Active Deliveries.");
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
      <div className="min-h-screen bg-gray-50 py-6 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-800">
              Available Deliveries
            </h2>
            <button
              onClick={() => navigate("/driver/deliveries/active")}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Active Deliveries
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
              <p className="mt-4 text-gray-600">Loading deliveries...</p>
            </div>
          ) : deliveries.length === 0 ? (
            <div className="text-center py-12">
              <svg
                className="mx-auto h-24 w-24 text-gray-400"
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
              <h3 className="mt-4 text-xl font-semibold text-gray-700">
                No Pending Deliveries
              </h3>
              <p className="mt-2 text-gray-500">
                Check back later for new delivery requests
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
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
    0
  );

  // Calculate map center and bounds
  const mapCenter = restaurant
    ? [restaurant.latitude, restaurant.longitude]
    : [0, 0];

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Interactive Map */}
      <div className="h-64 relative">
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
                    (coord) => [coord[1], coord[0]]
                  )}
                  color="#86efac"
                  weight={5}
                  opacity={0.9}
                />
              )}

            {/* Route from Restaurant to Customer - Grey */}
            {restaurant_to_customer_route &&
              restaurant_to_customer_route.coordinates && (
                <Polyline
                  positions={restaurant_to_customer_route.coordinates.map(
                    (coord) => [coord[1], coord[0]]
                  )}
                  color="#9ca3af"
                  weight={5}
                  opacity={0.9}
                />
              )}
          </MapContainer>
        )}

        {/* Order Number Badge */}
        <div className="absolute top-4 right-4 bg-white px-3 py-2 rounded-full shadow-md">
          <p className="text-xs font-semibold text-gray-600">Order</p>
          <p className="text-sm font-bold text-gray-800">#{order_number}</p>
        </div>

        {/* Items Count Badge */}
        <div className="absolute top-4 left-4 bg-blue-600 px-3 py-2 rounded-full shadow-md">
          <p className="text-xs font-bold text-white">
            {totalItems} item{totalItems !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Delivery Details */}
      <div className="p-6">
        {/* Earnings and Info */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 mb-1">Order #{order_number}</p>
            <p className="text-sm text-gray-500">Driver Earnings</p>
            <p className="text-2xl font-bold text-green-600">
              ${pricing.driver_earnings.toFixed(2)}
            </p>
            <p className="text-xs text-blue-600 font-semibold mt-1">
              {totalItems} food item{totalItems !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-3 text-sm text-gray-600">
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
                <span className="font-medium">{distance_km} km</span>
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
                <span className="font-medium">
                  {estimated_time_minutes} min
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Pick-up Location */}
        <div className="mb-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-xl">
              🍽️
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-500 uppercase font-semibold mb-1">
                Pick-up Location
              </p>
              <p className="font-bold text-gray-800">{restaurant.name}</p>
              <p className="text-sm text-gray-600">{restaurant.address}</p>
              {restaurant.phone && (
                <p className="text-sm text-gray-500 mt-1">
                  📞 {restaurant.phone}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Delivery Address */}
        <div className="mb-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-xl">
              👤
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-500 uppercase font-semibold mb-1">
                Delivery Address
              </p>
              <p className="font-bold text-gray-800">{customer.name}</p>
              <p className="text-sm text-gray-600">{deliveryAddress.address}</p>
              {customer.phone && (
                <p className="text-sm text-gray-500 mt-1">
                  📞 {customer.phone}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Accept Button */}
        <button
          onClick={() => onAccept(delivery_id)}
          disabled={accepting}
          className="w-full py-3 bg-green-600 text-white rounded-xl font-bold text-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {accepting ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
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
    </div>
  );
}
