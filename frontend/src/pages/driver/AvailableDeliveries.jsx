import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import DriverLayout from "../../components/DriverLayout";
import DriverRealtimeNotificationListener from "../../components/DriverRealtimeNotificationListener";
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
  const [currentRoute, setCurrentRoute] = useState({
    total_stops: 0,
    active_deliveries: 0,
  });

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

      // Use proper driver location if available, otherwise use default coordinates
      const currentLoc = driverLocation || DEFAULT_DRIVER_LOCATION;

      const res = await fetch(
        `http://localhost:5000/driver/deliveries/pickups?driver_latitude=${currentLoc.latitude}&driver_longitude=${currentLoc.longitude}`,
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

      // 🆕 Use the NEW /available/v2 endpoint for route-based filtering
      const url = `http://localhost:5000/driver/deliveries/available/v2?driver_latitude=${currentLoc.latitude}&driver_longitude=${currentLoc.longitude}`;

      console.log(
        "🔍 [FRONTEND] Fetching available deliveries with route context...",
      );

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
      console.log("✅ [FRONTEND] Received route-based deliveries:", data);
      console.log("📊 [FRONTEND] Total available:", data.total_available);
      console.log(
        "🚗 [FRONTEND] Current route stops:",
        data.current_route?.total_stops || 0,
      );
      console.log(
        "📦 [FRONTEND] Active deliveries:",
        data.current_route?.active_deliveries || 0,
      );
      console.log("🎯 [FRONTEND] Deliveries array:", data.available_deliveries);
      console.log(
        "📝 [FRONTEND] Deliveries count:",
        data.available_deliveries?.length || 0,
      );

      const deliveriesArray = data.available_deliveries || [];
      console.log(
        "🔍 [FRONTEND] Setting deliveries state to:",
        deliveriesArray,
      );
      setDeliveries(deliveriesArray);

      // Store current route info to determine if driver has active deliveries
      if (data.current_route) {
        console.log(
          "🚗 [FRONTEND] Setting currentRoute state to:",
          data.current_route,
        );
        setCurrentRoute(data.current_route);
      } else {
        console.log("⚠️ [FRONTEND] No current_route in response!");
      }

      // If driver location from backend is available, use it
      if (data.driver_location) {
        setDriverLocation(data.driver_location);
      }
    } catch (e) {
      console.error("❌ [FRONTEND] Failed to fetch deliveries:", e);
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
      <DriverRealtimeNotificationListener
        onNewDelivery={() => {
          // Refresh deliveries list when new pending delivery arrives
          if (driverLocation) {
            fetchPendingDeliveriesWithLocation(driverLocation);
          }
        }}
      />
      <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-green-400 via-green-500 to-[#07af45] bg-clip-text text-transparent">
              Available Deliveries
            </h1>
            <p className="text-gray-600 mt-1 text-sm sm:text-base">
              Accept deliveries and start earning
            </p>
          </div>
          <button
            onClick={() => navigate("/driver/deliveries/active")}
            className="px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-green-400 via-green-500 to-[#07af45] text-white rounded-full hover:from-green-700 hover:to-green-800 transition-all duration-300 shadow-md hover:shadow-lg font-medium text-sm sm:text-base whitespace-nowrap"
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
              className="px-6 py-3 bg-gradient-to-r from-[#61ecd7] via-[#0da88f] to-[#0da88f] text-white rounded-full hover:from-green-700 hover:to-green-800 transition-all duration-300 shadow-md hover:shadow-lg font-medium"
            >
              Go to Active Deliveries
            </button>
          </div>
        ) : loading ? (
          /* Loading State */
          <div className="bg-white rounded-xl shadow border border-blue-100 p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-400 mx-auto"></div>
            <p className="mt-4 text-gray-600 font-medium">
              Loading deliveries...
            </p>
          </div>
        ) : (() => {
            console.log(
              "🎨 [FRONTEND] Render decision - deliveries.length:",
              deliveries.length,
            );
            console.log(
              "🎨 [FRONTEND] Render decision - deliveries:",
              deliveries,
            );
            return deliveries.length === 0;
          })() ? (
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
                className="mt-6 px-6 py-2 bg-green-500 text-white rounded-full hover:bg-green-700 transition-colors font-medium"
              >
                Refresh
              </button>
            </div>
          </div>
        ) : (
          /* Deliveries Grid */
          <div className="grid gap-6 lg:grid-cols-2">
            {(() => {
              console.log("🎨 [FRONTEND] About to render deliveries grid");
              console.log("🎨 [FRONTEND] deliveries.map input:", deliveries);
              console.log("🎨 [FRONTEND] currentRoute state:", currentRoute);
              console.log(
                "🎨 [FRONTEND] total_stops:",
                currentRoute.total_stops,
              );
              console.log(
                "🎨 [FRONTEND] hasActiveDeliveries would be:",
                currentRoute.total_stops > 0,
              );
              return null;
            })()}
            {deliveries.map((delivery, index) => {
              console.log(`🎨 [FRONTEND] Rendering delivery ${index + 1}:`, {
                delivery_id: delivery.delivery_id,
                order_number: delivery.order_number,
                route_impact: delivery.route_impact,
                pricing: delivery.pricing,
              });
              return (
                <DeliveryCard
                  key={delivery.delivery_id}
                  delivery={delivery}
                  driverLocation={driverLocation}
                  accepting={accepting === delivery.delivery_id}
                  onAccept={handleAcceptDelivery}
                  hasActiveDeliveries={currentRoute.total_stops > 0}
                />
              );
            })}
          </div>
        )}
      </div>
    </DriverLayout>
  );
}

function DeliveryCard({
  delivery,
  driverLocation,
  accepting,
  onAccept,
  hasActiveDeliveries,
}) {
  const {
    delivery_id,
    order_number,
    restaurant,
    customer,
    pricing,
    distance_km,
    estimated_time_minutes,
    // 🆕 Route-extension fields from backend (nested in route_impact)
    route_impact = {},
    can_accept = true,
    reason,
    driver_to_restaurant_route,
    restaurant_to_customer_route,
    order_items = [],
    route_geometry = null,
    total_delivery_distance_km = 0,
  } = delivery;

  // Extract route impact fields with proper fallbacks
  const {
    extra_distance_km = 0,
    extra_time_minutes = 0,
    extra_earnings = 0,
    bonus_amount = 0,
    base_earnings = 0,
    total_enhanced_earnings = 0,
  } = route_impact || {};

  // Calculate total items
  const totalItems = order_items.reduce(
    (sum, item) => sum + (item.quantity || 0),
    0,
  );

  // Calculate map center and bounds
  const mapCenter = restaurant
    ? [restaurant.latitude, restaurant.longitude]
    : [0, 0];

  // 🆕 Show route-extension context when driver has active deliveries
  // This shows the purple "Route Extension Impact" block
  const showRouteExtension = hasActiveDeliveries;

  console.log("🔍 DeliveryCard Debug:", {
    delivery_id,
    order_number,
    hasActiveDeliveries,
    extra_distance_km,
    extra_time_minutes,
    extra_earnings,
    bonus_amount,
    base_earnings,
    total_enhanced_earnings,
    showRouteExtension,
    route_impact: route_impact,
    pricing: pricing,
    total_delivery_distance_km,
    currentRoute: hasActiveDeliveries ? "HAS ACTIVE" : "FIRST DELIVERY",
  });

  // Safety check for pricing
  const driverEarnings = pricing?.driver_earnings || 0;

  return (
    <div
      className={`bg-white rounded-xl shadow-lg border overflow-hidden hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 animate-fade-in ${!can_accept ? "border-red-300 opacity-75" : "border-blue-100"}`}
    >
      {/* Interactive Map */}
      <div className="h-72 relative">
        {restaurant && customer && (
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
              position={[customer?.latitude || 0, customer?.longitude || 0]}
              icon={customerIcon}
            >
              <Popup>
                <div className="min-w-[200px]">
                  <p className="font-bold text-blue-600">👤 Customer</p>
                  <p className="font-semibold mt-1">
                    {customer?.name || "Customer"}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {customer?.address || "No address provided"}
                  </p>
                </div>
              </Popup>
            </Marker>

            {/* Route from Driver to Restaurant - Blue */}
            {driver_to_restaurant_route &&
              driver_to_restaurant_route.coordinates && (
                <Polyline
                  positions={driver_to_restaurant_route.coordinates.map(
                    (coord) => [coord[1], coord[0]],
                  )}
                  color="black"
                  weight={5}
                  opacity={0.9}
                />
              )}

            {/* Route from Restaurant to Customer - Orange */}
            {restaurant_to_customer_route &&
              restaurant_to_customer_route.coordinates && (
                <Polyline
                  positions={restaurant_to_customer_route.coordinates.map(
                    (coord) => [coord[1], coord[0]],
                  )}
                  color="grey"
                  weight={5}
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
        {/* 🆕 Route Extension Badge - Purple Block (ALWAYS show when driver has active deliveries) */}
        {showRouteExtension && (
          <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-4 border-2 border-purple-300">
            <p className="text-xs text-purple-700 font-bold uppercase mb-2 flex items-center gap-2">
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
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
              🚗 Route Extension - Extra Earnings
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center bg-white rounded-lg p-2 shadow-sm">
                <p className="text-2xl font-bold text-purple-700">
                  +{extra_distance_km?.toFixed(2) || "0.00"}
                </p>
                <p className="text-xs text-purple-600 font-semibold">
                  km added
                </p>
              </div>
              <div className="text-center bg-white rounded-lg p-2 shadow-sm">
                <p className="text-2xl font-bold text-purple-700">
                  +
                  {extra_time_minutes?.toFixed
                    ? extra_time_minutes.toFixed(0)
                    : extra_time_minutes || 0}
                </p>
                <p className="text-xs text-purple-600 font-semibold">
                  min added
                </p>
              </div>
              <div className="text-center bg-white rounded-lg p-2 shadow-sm">
                <p className="text-2xl font-bold text-green-700">
                  +Rs. {extra_earnings?.toFixed(2) || "0.00"}
                </p>
                <p className="text-xs text-green-600 font-semibold">
                  extra earnings
                </p>
              </div>
            </div>
            <p className="text-xs text-purple-600 mt-3 text-center italic bg-purple-50 p-2 rounded">
              💡 This delivery adds{" "}
              <strong>{extra_distance_km?.toFixed(2) || "0.00"} km</strong> and{" "}
              <strong>
                {extra_time_minutes?.toFixed
                  ? extra_time_minutes.toFixed(0)
                  : extra_time_minutes || 0}{" "}
                min
              </strong>{" "}
              to your current route
            </p>
          </div>
        )}

        {/* 🆕 Cannot Accept Warning */}
        {!can_accept && reason && (
          <div className="bg-red-50 rounded-lg p-4 border-2 border-red-300">
            <p className="text-sm text-red-700 font-semibold flex items-center gap-2">
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
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Cannot Accept: {reason}
            </p>
          </div>
        )}

        {/* Earnings and Stats - ALWAYS SHOW */}
        <div
          className={`rounded-lg p-4 border ${hasActiveDeliveries ? "bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200" : "bg-gradient-to-r from-green-50 to-green-100 border-green-200"}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p
                className={`text-xs font-semibold uppercase mb-1 ${hasActiveDeliveries ? "text-blue-700" : "text-green-700"}`}
              >
                {hasActiveDeliveries ? "Additional Earnings" : "Your Earnings"}
              </p>
              <p
                className={`text-3xl font-bold ${hasActiveDeliveries ? "text-blue-600" : "text-green-600"}`}
              >
                Rs.{" "}
                {hasActiveDeliveries
                  ? (
                      Number(base_earnings || 0) +
                      Number(extra_earnings || 0) +
                      Number(bonus_amount || 0)
                    ).toFixed(2)
                  : driverEarnings?.toFixed(2) || "0.00"}
              </p>
              <p
                className={`text-xs mt-1 ${hasActiveDeliveries ? "text-blue-600" : "text-green-600"}`}
              >
                {hasActiveDeliveries
                  ? `Base: Rs. ${Number(base_earnings || 0).toFixed(2)} + Extra: Rs. ${Number(extra_earnings || 0).toFixed(2)}${Number(bonus_amount || 0) > 0 ? ` + Bonus: Rs. ${Number(bonus_amount).toFixed(2)}` : ""}`
                  : "First Delivery Earnings"}
              </p>
            </div>
            <div className="text-right space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <svg
                  className={`w-5 h-5 ${hasActiveDeliveries ? "text-blue-600" : "text-green-600"}`}
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
                <span
                  className={`font-bold ${hasActiveDeliveries ? "text-blue-600" : "text-green-600"}`}
                >
                  {Number(total_delivery_distance_km || 0).toFixed(2)} km
                </span>
                <span className="text-xs text-gray-500">
                  {hasActiveDeliveries
                    ? `(+${Number(extra_distance_km || 0).toFixed(2)} km extra)`
                    : "(Total Distance)"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <svg
                  className={`w-5 h-5 ${hasActiveDeliveries ? "text-purple-600" : "text-blue-600"}`}
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
                <span className="font-bold">
                  {estimated_time_minutes || 0} min
                </span>
                {hasActiveDeliveries && (
                  <span className="text-xs text-gray-500">
                    (+{Number(extra_time_minutes || 0).toFixed(0)} min extra)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        {Number(bonus_amount || 0) > 0 && (
          <div className="mt-4 bg-gradient-to-r from-[#6bf7db] via-[#15e1b9] to-[#10c4a9] rounded-lg p-3 border border-yellow-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="text-2xl animate-bounce">🎁</div>
                <div>
                  <p className="text-purple-700 font-bold text-sm drop-shadow-lg">
                    DELIVERY BONUS!
                  </p>
                  <p className="text-purple-600 text-xs font-semibold">
                    More orders = More money!
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="bg-[#97f9eb] bg-opacity-20 rounded px-3 py-1 backdrop-blur-sm">
                  <p className="text-purple-700 text-lg font-bold drop-shadow-lg">
                    +Rs. {Number(bonus_amount).toFixed(2)}
                  </p>
                  <p className="text-purple-600 text-xs font-semibold">BONUS</p>
                </div>
              </div>
            </div>
          </div>
        )}

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
                {customer?.address || "No address provided"}
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
          disabled={accepting || !can_accept}
          className={`w-full py-4 rounded-xl font-bold text-lg transition-all duration-300 flex items-center justify-center gap-2 shadow-lg transform ${
            !can_accept
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-gradient-to-r from-green-600 to-green-700 text-white hover:from-green-700 hover:to-green-800 hover:shadow-xl hover:scale-105"
          } ${accepting ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {accepting ? (
            <>
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
              <span>Accepting...</span>
            </>
          ) : !can_accept ? (
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
                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                />
              </svg>
              <span>CANNOT ACCEPT</span>
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
