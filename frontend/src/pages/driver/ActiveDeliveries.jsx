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

export default function ActiveDeliveries() {
  const navigate = useNavigate();
  const [pickups, setPickups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [driverLocation, setDriverLocation] = useState(null);
  const [mode, setMode] = useState("pickup"); // pickup | deliver
  const [deliveries, setDeliveries] = useState([]);

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "driver") {
      navigate("/login");
      return;
    }

    // Get driver's current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setDriverLocation(location);
          fetchPickups(location);
        },
        (error) => {
          console.error("Error getting location:", error);
          // Try to fetch without location
          fetchPickups(null);
        },
      );
    } else {
      fetchPickups(null);
    }

    // Update location every 10 seconds
    const locationInterval = setInterval(() => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const location = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };
            setDriverLocation(location);
            fetchPickups(location);
          },
          (error) => console.error("Location update error:", error),
        );
      }
    }, 10000);

    return () => clearInterval(locationInterval);
  }, [navigate]);

  const fetchPickups = async (location) => {
    try {
      const token = localStorage.getItem("token");

      if (!location) {
        setLoading(false);
        return;
      }

      const url = `http://localhost:5000/driver/deliveries/pickups?driver_latitude=${location.latitude}&driver_longitude=${location.longitude}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (res.ok) {
        const list = data.pickups || [];
        setPickups(list);
        if (list.length > 0) {
          setMode("pickup");
          setDeliveries([]);
        } else {
          // No pickups left → switch to delivering mode
          await fetchDeliveriesRoute(location);
        }
      } else {
        console.error("Failed to fetch pickups:", data.message);
      }
    } catch (e) {
      console.error("Fetch pickups error:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchDeliveriesRoute = async (location) => {
    try {
      const token = localStorage.getItem("token");
      const url = `http://localhost:5000/driver/deliveries/deliveries-route?driver_latitude=${location.latitude}&driver_longitude=${location.longitude}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        const list = data.deliveries || [];
        setDeliveries(list);
        setMode("deliver");
        setPickups([]);

        // Auto-set first delivery to on-the-way when starting delivering mode
        if (list.length > 0 && list[0].status === "picked_up") {
          try {
            await fetch(
              `http://localhost:5000/driver/deliveries/${list[0].delivery_id}/status`,
              {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ status: "on_the_way" }),
              },
            );
            // Optimistically reflect status
            setDeliveries((prev) =>
              prev.map((d, i) =>
                i === 0 ? { ...d, status: "on_the_way" } : d,
              ),
            );
          } catch (err) {
            console.error("Failed to auto-set first delivery on-the-way:", err);
          }
        }
      } else {
        console.error("Failed to fetch deliveries route:", data.message);
      }
    } catch (e) {
      console.error("Fetch deliveries route error:", e);
    }
  };

  const handlePrimaryAction = () => {
    if (mode === "pickup") {
      if (pickups.length === 0) {
        alert("No pickups available");
        return;
      }
      navigate(`/driver/delivery/active/${pickups[0].delivery_id}/map`);
      return;
    }
    if (mode === "deliver") {
      if (deliveries.length === 0) {
        alert("No deliveries available");
        return;
      }
      // Ensure status is set to on-the-way before navigating
      const token = localStorage.getItem("token");
      const firstId = deliveries[0].delivery_id;
      fetch(`http://localhost:5000/driver/deliveries/${firstId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "on_the_way" }),
      }).catch((err) => console.error("Set on-the-way error:", err));
      navigate(`/driver/delivery/active/${deliveries[0].delivery_id}/map`);
    }
  };

  return (
    <DriverLayout>
      <div className="min-h-screen bg-gray-50 pb-24">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">
                Active Deliveries
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {mode === "pickup"
                  ? `${pickups.length} pickup${pickups.length !== 1 ? "s" : ""} ready`
                  : `${deliveries.length} delivery${deliveries.length !== 1 ? "ies" : ""} ready`}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Mode: {mode === "pickup" ? "Pick-up" : "Delivering"}
              </p>
            </div>
            <button
              onClick={() => navigate("/driver/deliveries")}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Available
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
              <p className="mt-4 text-gray-600">Loading pickups...</p>
            </div>
          ) : (
              mode === "pickup" ? pickups.length === 0 : deliveries.length === 0
            ) ? (
            <div className="bg-white rounded-xl shadow-md p-12 text-center">
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
                {mode === "pickup"
                  ? "No Active Pickups"
                  : "No Active Deliveries"}
              </h3>
              <p className="mt-2 text-gray-500">
                {mode === "pickup"
                  ? "Accept deliveries to start picking up orders"
                  : "Pick up orders to start delivering to customers"}
              </p>
              <button
                onClick={() => navigate("/driver/deliveries")}
                className="mt-6 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold"
              >
                View Available Deliveries
              </button>
            </div>
          ) : (
            <>
              {/* List */}
              {mode === "pickup" ? (
                <div className="space-y-4 mb-6">
                  {pickups.map((pickup, index) => (
                    <PickupCard
                      key={pickup.delivery_id}
                      pickup={pickup}
                      index={index}
                      isFirst={index === 0}
                      driverLocation={driverLocation}
                      showMap={index === 0}
                      showCustomer={false}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-4 mb-6">
                  {deliveries.map((delivery, index) => (
                    <DeliveryCard
                      key={delivery.delivery_id}
                      delivery={delivery}
                      index={index}
                      isFirst={index === 0}
                      driverLocation={driverLocation}
                      showMap={index === 0}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Fixed Start Pickup Button */}
        {(mode === "pickup" ? pickups.length > 0 : deliveries.length > 0) && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg">
            <div className="max-w-4xl mx-auto">
              <button
                onClick={handlePrimaryAction}
                className="w-full py-4 bg-green-600 text-white rounded-xl font-bold text-lg hover:bg-green-700 transition flex items-center justify-center gap-2 shadow-md"
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
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <span>
                  {mode === "pickup" ? "START PICK-UP" : "START DELIVERY"}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </DriverLayout>
  );
}

function PickupCard({
  pickup,
  index,
  isFirst,
  driverLocation,
  showMap = true,
  showCustomer = false,
}) {
  const {
    delivery_id,
    order_number,
    restaurant,
    customer,
    distance_km,
    estimated_time_minutes,
    route_geometry,
    customer_route_geometry,
  } = pickup;

  // Calculate map center
  const mapCenter = restaurant
    ? [restaurant.latitude, restaurant.longitude]
    : [0, 0];

  return (
    <div
      className={`bg-white rounded-xl shadow-lg border-2 overflow-hidden ${
        isFirst ? "border-green-500" : "border-gray-200"
      }`}
    >
      {/* Interactive Map (only for active item) */}
      {showMap && (
        <div className="h-64 relative">
          {restaurant && (
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

              {/* Customer Marker (hidden in pickup mode) */}
              {showCustomer && customer && (
                <Marker
                  position={[customer.latitude, customer.longitude]}
                  icon={customerIcon}
                >
                  <Popup>
                    <div className="min-w-[200px]">
                      <p className="font-bold text-blue-600">👤 Customer</p>
                      <p className="font-semibold mt-1">{customer.name}</p>
                      <p className="text-xs text-gray-600 mt-1">
                        {customer.address}
                      </p>
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* OSRM Route from Driver to Restaurant - Light Green */}
              {route_geometry && route_geometry.coordinates && (
                <Polyline
                  positions={route_geometry.coordinates.map((coord) => [
                    coord[1],
                    coord[0],
                  ])}
                  color="#86efac"
                  weight={6}
                  opacity={0.9}
                />
              )}

              {/* OSRM Route from Restaurant to Customer - Grey (hidden in pickup mode) */}
              {showCustomer &&
                customer_route_geometry &&
                customer_route_geometry.coordinates && (
                  <Polyline
                    positions={customer_route_geometry.coordinates.map(
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
          <div className="absolute top-3 right-3 bg-gradient-to-r from-green-600 to-green-700 px-4 py-2 rounded-full shadow-lg">
            <p className="text-xs font-semibold text-white">
              Order #{order_number}
            </p>
          </div>
        </div>
      )}

      {/* Details Section */}
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                isFirst
                  ? "bg-green-600 text-white"
                  : "bg-gray-200 text-gray-600"
              }`}
            >
              {index + 1}
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold">
                Order #{order_number}
              </p>
              {isFirst && (
                <p className="text-xs text-green-600 font-bold mt-1">
                  NEXT PICKUP
                </p>
              )}
            </div>
          </div>

          {/* Distance and Time */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1 text-gray-600">
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
              <span className="font-semibold">{distance_km} km (OSRM)</span>
            </div>
            <div className="flex items-center gap-1 text-gray-600">
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
              <span className="font-semibold">
                {estimated_time_minutes} min
              </span>
            </div>
          </div>
        </div>

        {/* Restaurant Info */}
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
            <svg
              className="w-6 h-6 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-bold text-gray-800 text-lg">{restaurant.name}</p>
            <p className="text-sm text-gray-600 mt-1">{restaurant.address}</p>
            {restaurant.phone && (
              <a
                href={`tel:${restaurant.phone}`}
                className="inline-flex items-center gap-2 mt-2 text-blue-600 hover:text-blue-700 font-semibold text-sm"
              >
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
                <span>{restaurant.phone}</span>
              </a>
            )}
          </div>
        </div>

        {/* Customer Info */}
        <div className="flex items-start gap-3 pt-2 border-t border-gray-200">
          <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <svg
              className="w-6 h-6 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-bold text-gray-800 text-lg">
              {customer?.name || "Customer"}
            </p>
            <p className="text-sm text-gray-600 mt-1">{customer?.address}</p>
            {customer?.phone && (
              <a
                href={`tel:${customer.phone}`}
                className="inline-flex items-center gap-2 mt-2 text-blue-600 hover:text-blue-700 font-semibold text-sm"
              >
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
                <span>{customer.phone}</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DeliveryCard({
  delivery,
  index,
  isFirst,
  driverLocation,
  showMap = true,
}) {
  const {
    order_number,
    customer,
    distance_km,
    estimated_time_minutes,
    route_geometry,
  } = delivery;

  const mapCenter = customer ? [customer.latitude, customer.longitude] : [0, 0];

  return (
    <div
      className={`bg-white rounded-xl shadow-lg border-2 overflow-hidden ${
        isFirst ? "border-green-500" : "border-gray-200"
      }`}
    >
      {/* Interactive Map (only for active item) */}
      {showMap && (
        <div className="h-64 relative">
          {customer && (
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

              {/* Customer Marker */}
              <Marker
                position={[customer.latitude, customer.longitude]}
                icon={customerIcon}
              >
                <Popup>
                  <div className="min-w-[200px]">
                    <p className="font-bold text-blue-600">👤 Customer</p>
                    <p className="font-semibold mt-1">{customer.name}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      {customer.address}
                    </p>
                  </div>
                </Popup>
              </Marker>

              {/* OSRM Route from Driver to Customer */}
              {route_geometry && route_geometry.coordinates && (
                <Polyline
                  positions={route_geometry.coordinates.map((coord) => [
                    coord[1],
                    coord[0],
                  ])}
                  color="#86efac"
                  weight={6}
                  opacity={0.9}
                />
              )}
            </MapContainer>
          )}

          {/* Order Number Badge */}
          <div className="absolute top-3 right-3 bg-gradient-to-r from-green-600 to-green-700 px-4 py-2 rounded-full shadow-lg">
            <p className="text-xs font-semibold text-white">
              Order #{order_number}
            </p>
          </div>
        </div>
      )}

      {/* Details Section */}
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                isFirst
                  ? "bg-green-600 text-white"
                  : "bg-gray-200 text-gray-600"
              }`}
            >
              {index + 1}
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold">
                Order #{order_number}
              </p>
              {isFirst && (
                <p className="text-xs text-green-600 font-bold mt-1">
                  NEXT DELIVERY
                </p>
              )}
            </div>
          </div>

          {/* Distance and Time */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1 text-gray-600">
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
              <span className="font-semibold">{distance_km} km (OSRM)</span>
            </div>
            <div className="flex items-center gap-1 text-gray-600">
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
              <span className="font-semibold">
                {estimated_time_minutes} min
              </span>
            </div>
          </div>
        </div>

        {/* Customer Info */}
        <div className="flex items-start gap-3 pt-2">
          <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <svg
              className="w-6 h-6 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-bold text-gray-800 text-lg">
              {customer?.name || "Customer"}
            </p>
            <p className="text-sm text-gray-600 mt-1">{customer?.address}</p>
            {customer?.phone && (
              <a
                href={`tel:${customer.phone}`}
                className="inline-flex items-center gap-2 mt-2 text-blue-600 hover:text-blue-700 font-semibold text-sm"
              >
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
                <span>{customer.phone}</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
