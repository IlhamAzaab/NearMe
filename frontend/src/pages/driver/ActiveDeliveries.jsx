import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import DriverLayout from "../../components/DriverLayout";
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  Polyline,
  InfoWindow,
  DirectionsRenderer,
} from "@react-google-maps/api";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

// Google Maps container style
const mapContainerStyle = {
  width: "100%",
  height: "100%",
};

// Google Maps options
const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: true,
};

export default function ActiveDeliveries() {
  const navigate = useNavigate();
  const [pickups, setPickups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [driverLocation, setDriverLocation] = useState(null);
  const [mode, setMode] = useState("pickup"); // pickup | deliver
  const [deliveries, setDeliveries] = useState([]);
  const [fullRouteData, setFullRouteData] = useState(null); // Store full route for developer view

  // Load Google Maps API once at component level
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });

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

        // Also fetch full route data for developer overview
        if (list.length > 0) {
          fetchFullRoute(location, list);
        }

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

  // Fetch full route for developer overview (Driver → All Restaurants → All Customers)
  const fetchFullRoute = async (location, pickupsList) => {
    try {
      const token = localStorage.getItem("token");
      const url = `http://localhost:5000/driver/deliveries/full-route?driver_latitude=${location.latitude}&driver_longitude=${location.longitude}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        console.log("📍 [FULL ROUTE] Received full route data:", data);
        setFullRouteData(data);
      } else {
        // If endpoint doesn't exist, build route data from pickups
        console.log("📍 [FULL ROUTE] Building route from pickups data");
        buildRouteFromPickups(location, pickupsList);
      }
    } catch (e) {
      console.error("Fetch full route error:", e);
      // Fallback: build route from pickups
      buildRouteFromPickups(location, pickupsList);
    }
  };

  // Build route data from pickups when full-route endpoint isn't available
  const buildRouteFromPickups = (location, pickupsList) => {
    const restaurants = pickupsList.map((p, idx) => ({
      id: p.delivery_id,
      order_number: p.order_number,
      lat: p.restaurant.latitude,
      lng: p.restaurant.longitude,
      name: p.restaurant.name,
      address: p.restaurant.address,
      label: `R${idx + 1}`,
    }));

    const customers = pickupsList.map((p, idx) => ({
      id: p.delivery_id,
      order_number: p.order_number,
      lat: p.customer.latitude,
      lng: p.customer.longitude,
      name: p.customer.name,
      address: p.customer.address,
      label: `C${idx + 1}`,
    }));

    setFullRouteData({
      driver_location: location,
      restaurants,
      customers,
      total_deliveries: pickupsList.length,
    });
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
              {/* Full Route Overview Map (Developer View) - Shows before pickup starts */}
              {mode === "pickup" && pickups.length > 0 && fullRouteData && (
                <FullRouteMap
                  driverLocation={driverLocation}
                  pickups={pickups}
                  fullRouteData={fullRouteData}
                  isLoaded={isLoaded}
                />
              )}

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
                      isLoaded={isLoaded}
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
                      isLoaded={isLoaded}
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
  isLoaded = false,
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

  const [selectedMarker, setSelectedMarker] = useState(null);

  // Calculate map center
  const mapCenter = restaurant
    ? { lat: restaurant.latitude, lng: restaurant.longitude }
    : { lat: 0, lng: 0 };

  // Decode polyline helper
  const decodePolyline = (encoded) => {
    if (!encoded) return [];
    const poly = [];
    let index = 0,
      len = encoded.length;
    let lat = 0,
      lng = 0;

    while (index < len) {
      let b,
        shift = 0,
        result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = result & 1 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = result & 1 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      poly.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
    return poly;
  };

  // Prepare route paths
  const driverToRestaurantPath = route_geometry?.encoded_polyline
    ? decodePolyline(route_geometry.encoded_polyline)
    : route_geometry?.coordinates
      ? route_geometry.coordinates.map((coord) => ({
          lat: coord[1],
          lng: coord[0],
        }))
      : [];

  const restaurantToCustomerPath = customer_route_geometry?.encoded_polyline
    ? decodePolyline(customer_route_geometry.encoded_polyline)
    : customer_route_geometry?.coordinates
      ? customer_route_geometry.coordinates.map((coord) => ({
          lat: coord[1],
          lng: coord[0],
        }))
      : [];

  return (
    <div
      className={`bg-white rounded-xl shadow-lg border-2 overflow-hidden ${
        isFirst ? "border-green-500" : "border-gray-200"
      }`}
    >
      {/* Interactive Map (only for active item) */}
      {showMap && (
        <div className="h-64 relative">
          {restaurant && isLoaded ? (
            <GoogleMap
              mapContainerStyle={mapContainerStyle}
              center={mapCenter}
              zoom={13}
              options={mapOptions}
            >
              {/* Driver Marker */}
              {driverLocation && (
                <Marker
                  position={{
                    lat: driverLocation.latitude,
                    lng: driverLocation.longitude,
                  }}
                  icon={{
                    path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
                    scale: 10,
                    fillColor: "#10b981",
                    fillOpacity: 1,
                    strokeWeight: 3,
                    strokeColor: "#ffffff",
                  }}
                  onClick={() => setSelectedMarker("driver")}
                />
              )}

              {selectedMarker === "driver" && driverLocation && (
                <InfoWindow
                  position={{
                    lat: driverLocation.latitude,
                    lng: driverLocation.longitude,
                  }}
                  onCloseClick={() => setSelectedMarker(null)}
                >
                  <div className="text-center p-2">
                    <p className="font-bold text-green-600">📍 Your Location</p>
                    <p className="text-xs text-gray-600">Driver Position</p>
                  </div>
                </InfoWindow>
              )}

              {/* Restaurant Marker */}
              <Marker
                position={{
                  lat: restaurant.latitude,
                  lng: restaurant.longitude,
                }}
                icon={{
                  path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
                  scale: 10,
                  fillColor: "#ef4444",
                  fillOpacity: 1,
                  strokeWeight: 3,
                  strokeColor: "#ffffff",
                }}
                onClick={() => setSelectedMarker("restaurant")}
              />

              {selectedMarker === "restaurant" && (
                <InfoWindow
                  position={{
                    lat: restaurant.latitude,
                    lng: restaurant.longitude,
                  }}
                  onCloseClick={() => setSelectedMarker(null)}
                >
                  <div className="min-w-[200px] p-2">
                    <p className="font-bold text-red-600">🍽️ Restaurant</p>
                    <p className="font-semibold mt-1">{restaurant.name}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      {restaurant.address}
                    </p>
                  </div>
                </InfoWindow>
              )}

              {/* Customer Marker (hidden in pickup mode) */}
              {showCustomer && customer && (
                <Marker
                  position={{
                    lat: customer.latitude,
                    lng: customer.longitude,
                  }}
                  icon={{
                    path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
                    scale: 10,
                    fillColor: "#3b82f6",
                    fillOpacity: 1,
                    strokeWeight: 3,
                    strokeColor: "#ffffff",
                  }}
                  onClick={() => setSelectedMarker("customer")}
                />
              )}

              {showCustomer && selectedMarker === "customer" && customer && (
                <InfoWindow
                  position={{
                    lat: customer.latitude,
                    lng: customer.longitude,
                  }}
                  onCloseClick={() => setSelectedMarker(null)}
                >
                  <div className="min-w-[200px] p-2">
                    <p className="font-bold text-blue-600">👤 Customer</p>
                    <p className="font-semibold mt-1">{customer.name}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      {customer.address}
                    </p>
                  </div>
                </InfoWindow>
              )}

              {/* Route from Driver to Restaurant - Green */}
              {driverToRestaurantPath.length > 0 && (
                <Polyline
                  path={driverToRestaurantPath}
                  options={{
                    strokeColor: "#86efac",
                    strokeOpacity: 0.9,
                    strokeWeight: 6,
                  }}
                />
              )}

              {/* Route from Restaurant to Customer - Grey (hidden in pickup mode) */}
              {showCustomer && restaurantToCustomerPath.length > 0 && (
                <Polyline
                  path={restaurantToCustomerPath}
                  options={{
                    strokeColor: "#9ca3af",
                    strokeOpacity: 0.9,
                    strokeWeight: 6,
                  }}
                />
              )}
            </GoogleMap>
          ) : (
            <div className="h-full w-full bg-gray-200 flex items-center justify-center">
              <p className="text-gray-500">
                {!isLoaded ? "Loading map..." : "Map data unavailable"}
              </p>
            </div>
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

// Full Route Map Component - Shows complete route (Driver → All Restaurants → All Customers)
function FullRouteMap({
  driverLocation,
  pickups,
  fullRouteData,
  isLoaded = false,
}) {
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [directions, setDirections] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [mapRef, setMapRef] = useState(null);
  const [optimizedCustomerOrder, setOptimizedCustomerOrder] = useState([]);

  // Calculate map center (average of all points)
  const calculateCenter = () => {
    const points = [];
    if (driverLocation) {
      points.push({
        lat: driverLocation.latitude,
        lng: driverLocation.longitude,
      });
    }
    pickups.forEach((p) => {
      if (p.restaurant) {
        points.push({
          lat: p.restaurant.latitude,
          lng: p.restaurant.longitude,
        });
      }
      if (p.customer) {
        points.push({ lat: p.customer.latitude, lng: p.customer.longitude });
      }
    });

    if (points.length === 0) return { lat: 0, lng: 0 };

    const avgLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
    const avgLng = points.reduce((sum, p) => sum + p.lng, 0) / points.length;
    return { lat: avgLat, lng: avgLng };
  };

  const mapCenter = calculateCenter();

  // Helper: Calculate distance between two points using Haversine formula
  const haversineDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371000; // Earth's radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in meters
  };

  // Optimize restaurant pickup order: nearest to driver first, then nearest to previous
  const getOptimizedRestaurantOrder = (pickupsList, driverLoc) => {
    if (pickupsList.length <= 1) return pickupsList;

    const remaining = [...pickupsList];
    const ordered = [];

    // Start from driver location
    let currentLat = driverLoc.latitude;
    let currentLng = driverLoc.longitude;

    console.log(
      `📍 [RESTAURANT ORDER] Optimizing ${remaining.length} restaurants from driver location`,
    );

    while (remaining.length > 0) {
      let nearestIdx = 0;
      let nearestDist = Infinity;

      remaining.forEach((pickup, idx) => {
        const dist = haversineDistance(
          currentLat,
          currentLng,
          pickup.restaurant.latitude,
          pickup.restaurant.longitude,
        );
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = idx;
        }
      });

      const nearest = remaining[nearestIdx];
      ordered.push(nearest);

      console.log(
        `📍 [RESTAURANT ORDER]   R${ordered.length}. ${nearest.restaurant.name} (${(nearestDist / 1000).toFixed(2)} km from ${ordered.length === 1 ? "driver" : "previous restaurant"})`,
      );

      // Update current location to this restaurant
      currentLat = nearest.restaurant.latitude;
      currentLng = nearest.restaurant.longitude;

      remaining.splice(nearestIdx, 1);
    }

    return ordered;
  };

  // Optimize customer delivery order: nearest to last restaurant first, then nearest to previous
  const getOptimizedCustomerOrder = (pickupsList, lastRestaurant) => {
    if (pickupsList.length <= 1) return pickupsList;

    const remaining = [...pickupsList];
    const ordered = [];

    // Start from last restaurant location
    let currentLat = lastRestaurant.latitude;
    let currentLng = lastRestaurant.longitude;

    console.log(
      `📍 [CUSTOMER ORDER] Optimizing ${remaining.length} customers from last restaurant (${lastRestaurant.name})`,
    );

    while (remaining.length > 0) {
      let nearestIdx = 0;
      let nearestDist = Infinity;

      remaining.forEach((pickup, idx) => {
        const dist = haversineDistance(
          currentLat,
          currentLng,
          pickup.customer.latitude,
          pickup.customer.longitude,
        );
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = idx;
        }
      });

      const nearest = remaining[nearestIdx];
      ordered.push(nearest);

      console.log(
        `📍 [CUSTOMER ORDER]   C${ordered.length}. ${nearest.customer.name} (${(nearestDist / 1000).toFixed(2)} km from ${ordered.length === 1 ? "last restaurant" : "previous customer"})`,
      );

      currentLat = nearest.customer.latitude;
      currentLng = nearest.customer.longitude;

      remaining.splice(nearestIdx, 1);
    }

    return ordered;
  };

  // State for optimized orders
  const [optimizedRestaurantOrder, setOptimizedRestaurantOrder] = useState([]);

  // Fetch directions when map loads - tries multiple modes for shortest route
  const fetchDirections = useCallback(async () => {
    if (!window.google || !driverLocation || pickups.length === 0) return;

    const directionsService = new window.google.maps.DirectionsService();

    // STEP 1: Optimize restaurant pickup order (nearest to driver first)
    const optimizedRestaurants = getOptimizedRestaurantOrder(
      pickups,
      driverLocation,
    );
    setOptimizedRestaurantOrder(optimizedRestaurants);

    // Get the last restaurant in optimized order (where driver will be after all pickups)
    const lastRestaurant =
      optimizedRestaurants[optimizedRestaurants.length - 1].restaurant;

    // STEP 2: Optimize customer delivery order (nearest to last restaurant first)
    const optimizedCustomers = getOptimizedCustomerOrder(
      optimizedRestaurants,
      lastRestaurant,
    );
    setOptimizedCustomerOrder(optimizedCustomers);

    console.log(`📍 [FULL ROUTE] ═══════════════════════════════════════════`);
    console.log(`📍 [FULL ROUTE] OPTIMIZED ROUTE ORDER:`);
    console.log(
      `📍 [FULL ROUTE]   Restaurants (nearest first): ${optimizedRestaurants.map((p) => p.restaurant.name).join(" → ")}`,
    );
    console.log(
      `📍 [FULL ROUTE]   Customers (nearest to last restaurant): ${optimizedCustomers.map((p) => p.customer.name).join(" → ")}`,
    );
    console.log(`📍 [FULL ROUTE] ═══════════════════════════════════════════`);

    // Build waypoints for Google Directions API
    const restaurantWaypoints = optimizedRestaurants.map((p) => ({
      location: { lat: p.restaurant.latitude, lng: p.restaurant.longitude },
      stopover: true,
    }));

    const customerWaypoints = optimizedCustomers.map((p) => ({
      location: { lat: p.customer.latitude, lng: p.customer.longitude },
      stopover: true,
    }));

    // All waypoints: Driver → Optimized Restaurants → Optimized Customers (except last which is destination)
    const allWaypoints = [
      ...restaurantWaypoints,
      ...customerWaypoints.slice(0, -1),
    ];

    const origin = {
      lat: driverLocation.latitude,
      lng: driverLocation.longitude,
    };

    // Destination is the last customer in optimized order
    const destination =
      customerWaypoints.length > 0
        ? customerWaypoints[customerWaypoints.length - 1].location
        : restaurantWaypoints[restaurantWaypoints.length - 1]?.location;

    // Try multiple travel modes and pick the shortest route
    const modesToTry = [
      window.google.maps.TravelMode.TWO_WHEELER,
      window.google.maps.TravelMode.DRIVING,
      window.google.maps.TravelMode.WALKING,
    ];

    const routeResults = [];

    for (const mode of modesToTry) {
      try {
        const result = await directionsService.route({
          origin,
          destination,
          waypoints: allWaypoints,
          optimizeWaypoints: false, // Keep the order: all restaurants first, then all customers
          travelMode: mode,
        });

        // Calculate total distance for this mode
        let totalDistance = 0;
        result.routes[0].legs.forEach((leg) => {
          totalDistance += leg.distance.value;
        });

        routeResults.push({
          result,
          distance: totalDistance,
          mode: mode,
        });

        console.log(
          `📍 [FULL ROUTE] ${mode} mode: ${(totalDistance / 1000).toFixed(2)} km`,
        );
      } catch (error) {
        console.log(`📍 [FULL ROUTE] ${mode} mode failed:`, error.message);
      }
    }

    // Pick the shortest route from all successful attempts
    if (routeResults.length === 0) {
      console.error("Failed to fetch directions: All modes failed");
      return;
    }

    const shortest = routeResults.reduce((best, current) =>
      current.distance < best.distance ? current : best,
    );

    console.log(
      `📍 [FULL ROUTE] ✅ Selected ${shortest.mode}: ${(shortest.distance / 1000).toFixed(2)} km (shortest)`,
    );

    setDirections(shortest.result);

    // Calculate total distance and time from selected route
    let totalDistance = 0;
    let totalDuration = 0;
    shortest.result.routes[0].legs.forEach((leg) => {
      totalDistance += leg.distance.value;
      totalDuration += leg.duration.value;
    });

    setRouteInfo({
      totalDistance: (totalDistance / 1000).toFixed(2),
      totalDuration: Math.ceil(totalDuration / 60),
      legs: shortest.result.routes[0].legs,
      optimizedRestaurants: optimizedRestaurants,
      optimizedCustomers: optimizedCustomers,
      selectedMode: shortest.mode,
    });

    console.log("📍 [FULL ROUTE] Route calculated:", {
      totalDistance: (totalDistance / 1000).toFixed(2) + " km",
      totalDuration: Math.ceil(totalDuration / 60) + " min",
      waypoints: allWaypoints.length,
      selectedMode: shortest.mode,
      restaurantOrder: optimizedRestaurants.map((p) => p.restaurant.name),
      customerOrder: optimizedCustomers.map((p) => p.customer.name),
    });
  }, [driverLocation, pickups]);

  // Marker colors
  const markerColors = {
    driver: "#10b981", // Green
    restaurant: "#ef4444", // Red
    customer: "#3b82f6", // Blue
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border-2 border-purple-300 overflow-hidden mb-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-4 py-3">
        <h3 className="text-white font-bold text-lg flex items-center gap-2">
          🗺️ Optimized Route Overview
        </h3>
        <p className="text-purple-100 text-sm mt-1">
          Driver → {pickups.length} Restaurant{pickups.length > 1 ? "s" : ""} →{" "}
          {pickups.length} Customer{pickups.length > 1 ? "s" : ""} (Optimized by
          distance)
        </p>
      </div>

      {/* Route Info Summary */}
      {routeInfo && (
        <div className="bg-purple-50 p-4 border-b border-purple-200">
          <div className="grid grid-cols-3 gap-4 text-center mb-3">
            <div>
              <p className="text-2xl font-bold text-purple-700">
                {routeInfo.totalDistance} km
              </p>
              <p className="text-xs text-purple-600 font-semibold">
                Total Distance
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-700">
                {routeInfo.totalDuration} min
              </p>
              <p className="text-xs text-purple-600 font-semibold">
                Estimated Time
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-700">
                {pickups.length * 2}
              </p>
              <p className="text-xs text-purple-600 font-semibold">
                Total Stops
              </p>
            </div>
          </div>
          {routeInfo.selectedMode && (
            <p className="text-xs text-center text-purple-500">
              Route Mode: {routeInfo.selectedMode} (shortest path selected)
            </p>
          )}
        </div>
      )}

      {/* Optimized Order Flow */}
      {routeInfo && routeInfo.optimizedRestaurants && (
        <div className="bg-green-50 px-4 py-3 border-b border-green-200">
          <p className="font-semibold text-green-700 text-sm mb-2">
            📋 Optimized Order Flow:
          </p>

          {/* Pickup Order */}
          <div className="mb-2">
            <p className="text-xs font-semibold text-red-600 mb-1">
              🍽️ PICKUP ORDER (nearest to driver first):
            </p>
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="bg-green-500 text-white px-2 py-1 rounded font-semibold">
                Driver
              </span>
              {routeInfo.optimizedRestaurants.map((p, i) => (
                <React.Fragment key={`r-flow-${i}`}>
                  <span className="text-green-600">→</span>
                  <span className="bg-red-500 text-white px-2 py-1 rounded">
                    R{i + 1}: {p.restaurant.name}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Delivery Order */}
          <div>
            <p className="text-xs font-semibold text-blue-600 mb-1">
              👤 DELIVERY ORDER (nearest to last restaurant first):
            </p>
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="bg-red-500 text-white px-2 py-1 rounded font-semibold">
                R{routeInfo.optimizedRestaurants.length}
              </span>
              {routeInfo.optimizedCustomers.map((p, i) => (
                <React.Fragment key={`c-flow-${i}`}>
                  <span className="text-blue-600">→</span>
                  <span className="bg-blue-500 text-white px-2 py-1 rounded">
                    C{i + 1}: {p.customer.name}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Map */}
      <div className="h-96 relative">
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={mapCenter}
            zoom={12}
            options={mapOptions}
            onLoad={(map) => {
              setMapRef(map);
              fetchDirections();
            }}
          >
            {/* Driver Marker */}
            {driverLocation && (
              <Marker
                position={{
                  lat: driverLocation.latitude,
                  lng: driverLocation.longitude,
                }}
                label={{
                  text: "D",
                  color: "#ffffff",
                  fontWeight: "bold",
                }}
                icon={{
                  path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
                  scale: 15,
                  fillColor: markerColors.driver,
                  fillOpacity: 1,
                  strokeWeight: 3,
                  strokeColor: "#ffffff",
                }}
                onClick={() => setSelectedMarker("driver")}
              />
            )}

            {selectedMarker === "driver" && driverLocation && (
              <InfoWindow
                position={{
                  lat: driverLocation.latitude,
                  lng: driverLocation.longitude,
                }}
                onCloseClick={() => setSelectedMarker(null)}
              >
                <div className="p-2">
                  <p className="font-bold text-green-600">📍 Driver Location</p>
                  <p className="text-xs text-gray-600">Starting Point</p>
                </div>
              </InfoWindow>
            )}

            {/* Restaurant Markers - Use optimized order */}
            {(optimizedRestaurantOrder.length > 0
              ? optimizedRestaurantOrder
              : pickups
            ).map((pickup, idx) => (
              <React.Fragment key={`restaurant-${pickup.delivery_id}`}>
                <Marker
                  position={{
                    lat: pickup.restaurant.latitude,
                    lng: pickup.restaurant.longitude,
                  }}
                  label={{
                    text: `R${idx + 1}`,
                    color: "#ffffff",
                    fontWeight: "bold",
                    fontSize: "12px",
                  }}
                  icon={{
                    path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
                    scale: 15,
                    fillColor: markerColors.restaurant,
                    fillOpacity: 1,
                    strokeWeight: 3,
                    strokeColor: "#ffffff",
                  }}
                  onClick={() => setSelectedMarker(`restaurant-${idx}`)}
                />
                {selectedMarker === `restaurant-${idx}` && (
                  <InfoWindow
                    position={{
                      lat: pickup.restaurant.latitude,
                      lng: pickup.restaurant.longitude,
                    }}
                    onCloseClick={() => setSelectedMarker(null)}
                  >
                    <div className="p-2 min-w-[200px]">
                      <p className="font-bold text-red-600">
                        🍽️ Restaurant #{idx + 1}
                      </p>
                      <p className="font-semibold mt-1">
                        {pickup.restaurant.name}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        {pickup.restaurant.address}
                      </p>
                      <p className="text-xs text-blue-600 mt-2">
                        Order #{pickup.order_number}
                      </p>
                    </div>
                  </InfoWindow>
                )}
              </React.Fragment>
            ))}

            {/* Customer Markers - Use optimized order for numbering */}
            {(optimizedCustomerOrder.length > 0
              ? optimizedCustomerOrder
              : pickups
            ).map((pickup, idx) => (
              <React.Fragment key={`customer-${pickup.delivery_id}`}>
                <Marker
                  position={{
                    lat: pickup.customer.latitude,
                    lng: pickup.customer.longitude,
                  }}
                  label={{
                    text: `C${idx + 1}`,
                    color: "#ffffff",
                    fontWeight: "bold",
                    fontSize: "12px",
                  }}
                  icon={{
                    path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
                    scale: 15,
                    fillColor: markerColors.customer,
                    fillOpacity: 1,
                    strokeWeight: 3,
                    strokeColor: "#ffffff",
                  }}
                  onClick={() => setSelectedMarker(`customer-${idx}`)}
                />
                {selectedMarker === `customer-${idx}` && (
                  <InfoWindow
                    position={{
                      lat: pickup.customer.latitude,
                      lng: pickup.customer.longitude,
                    }}
                    onCloseClick={() => setSelectedMarker(null)}
                  >
                    <div className="p-2 min-w-[200px]">
                      <p className="font-bold text-blue-600">
                        👤 Customer #{idx + 1}{" "}
                        {optimizedCustomerOrder.length > 0 && "(Optimized)"}
                      </p>
                      <p className="font-semibold mt-1">
                        {pickup.customer.name}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        {pickup.customer.address}
                      </p>
                      <p className="text-xs text-blue-600 mt-2">
                        Order #{pickup.order_number}
                      </p>
                    </div>
                  </InfoWindow>
                )}
              </React.Fragment>
            ))}

            {/* Directions Renderer - Shows the full route */}
            {directions && (
              <DirectionsRenderer
                directions={directions}
                options={{
                  suppressMarkers: true, // We use custom markers
                  polylineOptions: {
                    strokeColor: "#8b5cf6", // Purple color for full route
                    strokeOpacity: 0.8,
                    strokeWeight: 5,
                  },
                }}
              />
            )}
          </GoogleMap>
        ) : (
          <div className="h-full w-full bg-gray-200 flex items-center justify-center">
            <p className="text-gray-500">Loading map...</p>
          </div>
        )}
      </div>

      {/* Route Legend */}
      <div className="bg-gray-50 px-4 py-3 border-t">
        <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-500"></div>
            <span className="text-gray-600">Driver (D)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-500"></div>
            <span className="text-gray-600">Restaurant (R1, R2...)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-blue-500"></div>
            <span className="text-gray-600">Customer (C1, C2...)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-1 bg-purple-500 rounded"></div>
            <span className="text-gray-600">Route Path</span>
          </div>
        </div>
      </div>

      {/* Leg Details - Distance between each stop */}
      {routeInfo && routeInfo.legs && (
        <div className="px-4 py-3 border-t bg-white">
          <p className="font-semibold text-gray-700 mb-2 text-sm">
            📏 Distance Between Each Stop:
          </p>
          <div className="space-y-2">
            {routeInfo.legs.map((leg, idx) => {
              // Determine segment type with optimized orders
              let segmentLabel = "";
              let fromIcon = "";
              let toIcon = "";
              const totalRestaurants = pickups.length;
              const optRestaurants =
                routeInfo.optimizedRestaurants ||
                optimizedRestaurantOrder ||
                pickups;
              const optCustomers =
                routeInfo.optimizedCustomers ||
                optimizedCustomerOrder ||
                pickups;

              if (idx === 0) {
                // Driver to first restaurant (optimized)
                fromIcon = "🚗";
                toIcon = "🍽️";
                segmentLabel = `Driver → R1 (${optRestaurants[0]?.restaurant?.name || "Restaurant"})`;
              } else if (idx < totalRestaurants) {
                // Restaurant to restaurant (optimized order)
                fromIcon = "🍽️";
                toIcon = "🍽️";
                segmentLabel = `R${idx} (${optRestaurants[idx - 1]?.restaurant?.name}) → R${idx + 1} (${optRestaurants[idx]?.restaurant?.name})`;
              } else if (idx === totalRestaurants) {
                // Last restaurant to first customer (optimized)
                fromIcon = "🍽️";
                toIcon = "👤";
                const lastRestName =
                  optRestaurants[totalRestaurants - 1]?.restaurant?.name ||
                  "Restaurant";
                const firstCustName =
                  optCustomers[0]?.customer?.name || "Customer";
                segmentLabel = `R${totalRestaurants} (${lastRestName}) → C1 (${firstCustName})`;
              } else {
                // Customer to customer (optimized order)
                fromIcon = "👤";
                toIcon = "👤";
                const customerIdx = idx - totalRestaurants;
                const prevCustName =
                  optCustomers[customerIdx - 1]?.customer?.name || "Customer";
                const currCustName =
                  optCustomers[customerIdx]?.customer?.name || "Customer";
                segmentLabel = `C${customerIdx} (${prevCustName}) → C${customerIdx + 1} (${currCustName})`;
              }

              return (
                <div
                  key={idx}
                  className="flex items-center justify-between text-sm bg-gray-50 px-3 py-2 rounded"
                >
                  <div className="flex items-center gap-2">
                    <span>{fromIcon}</span>
                    <span className="text-gray-600 text-xs">
                      {segmentLabel}
                    </span>
                    <span>{toIcon}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-purple-600">
                      {(leg.distance.value / 1000).toFixed(2)} km
                    </span>
                    <span className="text-gray-500 text-xs">
                      ({Math.ceil(leg.duration.value / 60)} min)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total Summary */}
          <div className="mt-3 p-3 bg-purple-100 rounded-lg border border-purple-300">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-purple-700">
                📊 TOTAL ROUTE:
              </span>
              <div className="text-right">
                <span className="font-bold text-purple-700 text-lg">
                  {routeInfo.totalDistance} km
                </span>
                <span className="text-purple-600 ml-2">
                  ({routeInfo.totalDuration} min)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DeliveryCard({
  delivery,
  index,
  isFirst,
  driverLocation,
  showMap = true,
  isLoaded = false,
}) {
  const {
    order_number,
    customer,
    distance_km,
    estimated_time_minutes,
    route_geometry,
  } = delivery;

  const [selectedMarker, setSelectedMarker] = useState(null);

  const mapCenter = customer
    ? { lat: customer.latitude, lng: customer.longitude }
    : { lat: 0, lng: 0 };

  // Decode polyline helper
  const decodePolyline = (encoded) => {
    if (!encoded) return [];
    const poly = [];
    let index = 0,
      len = encoded.length;
    let lat = 0,
      lng = 0;

    while (index < len) {
      let b,
        shift = 0,
        result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = result & 1 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = result & 1 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      poly.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
    return poly;
  };

  // Prepare route path
  const routePath = route_geometry?.encoded_polyline
    ? decodePolyline(route_geometry.encoded_polyline)
    : route_geometry?.coordinates
      ? route_geometry.coordinates.map((coord) => ({
          lat: coord[1],
          lng: coord[0],
        }))
      : [];

  return (
    <div
      className={`bg-white rounded-xl shadow-lg border-2 overflow-hidden ${
        isFirst ? "border-green-500" : "border-gray-200"
      }`}
    >
      {/* Interactive Map (only for active item) */}
      {showMap && (
        <div className="h-64 relative">
          {customer && isLoaded ? (
            <GoogleMap
              mapContainerStyle={mapContainerStyle}
              center={mapCenter}
              zoom={13}
              options={mapOptions}
            >
              {/* Driver Marker */}
              {driverLocation && (
                <Marker
                  position={{
                    lat: driverLocation.latitude,
                    lng: driverLocation.longitude,
                  }}
                  icon={{
                    path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
                    scale: 10,
                    fillColor: "#10b981",
                    fillOpacity: 1,
                    strokeWeight: 3,
                    strokeColor: "#ffffff",
                  }}
                  onClick={() => setSelectedMarker("driver")}
                />
              )}

              {selectedMarker === "driver" && driverLocation && (
                <InfoWindow
                  position={{
                    lat: driverLocation.latitude,
                    lng: driverLocation.longitude,
                  }}
                  onCloseClick={() => setSelectedMarker(null)}
                >
                  <div className="text-center p-2">
                    <p className="font-bold text-green-600">📍 Your Location</p>
                    <p className="text-xs text-gray-600">Driver Position</p>
                  </div>
                </InfoWindow>
              )}

              {/* Customer Marker */}
              <Marker
                position={{
                  lat: customer.latitude,
                  lng: customer.longitude,
                }}
                icon={{
                  path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
                  scale: 10,
                  fillColor: "#3b82f6",
                  fillOpacity: 1,
                  strokeWeight: 3,
                  strokeColor: "#ffffff",
                }}
                onClick={() => setSelectedMarker("customer")}
              />

              {selectedMarker === "customer" && (
                <InfoWindow
                  position={{
                    lat: customer.latitude,
                    lng: customer.longitude,
                  }}
                  onCloseClick={() => setSelectedMarker(null)}
                >
                  <div className="min-w-[200px] p-2">
                    <p className="font-bold text-blue-600">👤 Customer</p>
                    <p className="font-semibold mt-1">{customer.name}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      {customer.address}
                    </p>
                  </div>
                </InfoWindow>
              )}

              {/* Route from Driver to Customer */}
              {routePath.length > 0 && (
                <Polyline
                  path={routePath}
                  options={{
                    strokeColor: "#86efac",
                    strokeOpacity: 0.9,
                    strokeWeight: 6,
                  }}
                />
              )}
            </GoogleMap>
          ) : (
            <div className="h-full w-full bg-gray-200 flex items-center justify-center">
              <p className="text-gray-500">Loading map...</p>
            </div>
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
