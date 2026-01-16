import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import DriverLayout from "../../components/DriverLayout";

// Fix Leaflet default marker icons
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
const createCustomIcon = (color) =>
  new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

const driverIcon = createCustomIcon("blue");
const restaurantIcon = createCustomIcon("red");
const customerIcon = createCustomIcon("green");

// Component to auto-fit map bounds
function MapBounds({ positions }) {
  const map = useMap();

  useEffect(() => {
    if (positions && positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [positions, map]);

  return null;
}

export default function DriverMapPage() {
  const { deliveryId } = useParams();
  const navigate = useNavigate();
  const locationUpdateInterval = useRef(null);

  const [mode, setMode] = useState("pickup"); // "pickup" or "delivery"
  const [pickups, setPickups] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [currentTarget, setCurrentTarget] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [isTracking, setIsTracking] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "driver") {
      navigate("/login");
      return;
    }

    // Start location tracking
    startLocationTracking();

    // Cleanup on unmount
    return () => {
      stopLocationTracking();
    };
  }, [navigate]);

  useEffect(() => {
    if (driverLocation) {
      fetchPickupsAndDeliveries();
    }
  }, [driverLocation]);

  const startLocationTracking = () => {
    if (!navigator.geolocation) {
      alert("Geolocation not supported");
      return;
    }

    setIsTracking(true);

    // Get initial location
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setDriverLocation(location);
        updateLocationOnBackend(deliveryId, location);
      },
      (error) => {
        console.error("Location error:", error);
        setIsTracking(false);
      },
      { enableHighAccuracy: true }
    );

    // Update every 5 seconds
    locationUpdateInterval.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setDriverLocation(location);
          updateLocationOnBackend(deliveryId, location);
        },
        (error) => console.error("Location update error:", error),
        { enableHighAccuracy: true, maximumAge: 0 }
      );
    }, 5000);
  };

  const stopLocationTracking = () => {
    setIsTracking(false);
    if (locationUpdateInterval.current) {
      clearInterval(locationUpdateInterval.current);
      locationUpdateInterval.current = null;
    }
  };

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
            latitude: location.latitude,
            longitude: location.longitude,
          }),
        }
      );
    } catch (e) {
      console.error("Location update error:", e);
    }
  };

  const fetchPickupsAndDeliveries = async () => {
    try {
      const token = localStorage.getItem("token");

      // Fetch pickups (accepted status)
      const pickupsUrl = `http://localhost:5000/driver/deliveries/pickups?driver_latitude=${driverLocation.latitude}&driver_longitude=${driverLocation.longitude}`;
      const pickupsRes = await fetch(pickupsUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const pickupsData = await pickupsRes.json();

      // Fetch deliveries (picked_up, heading_to_customer, at_customer)
      const deliveriesUrl = `http://localhost:5000/driver/deliveries/deliveries-route?driver_latitude=${driverLocation.latitude}&driver_longitude=${driverLocation.longitude}`;
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
  };

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
            latitude: driverLocation.latitude,
            longitude: driverLocation.longitude,
          }),
        }
      );

      if (res.ok) {
        // Remove from pickups and fetch updated data
        const updatedPickups = pickups.filter(
          (p) => p.delivery_id !== currentTarget.delivery_id
        );
        setPickups(updatedPickups);

        // If more pickups, move to next
        if (updatedPickups.length > 0) {
          setCurrentTarget(updatedPickups[0]);
        } else {
          // All pickups done, switch to delivery mode
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

  const handleStartDelivery = () => {
    if (deliveries.length > 0) {
      setMode("delivery");
      setCurrentTarget(deliveries[0]);
    }
  };

  const handleDelivered = async () => {
    if (!currentTarget) return;

    setUpdating(true);
    try {
      const token = localStorage.getItem("token");
      
      // First update to heading_to_customer if not already
      if (currentTarget.status === "picked_up") {
        await fetch(
          `http://localhost:5000/driver/deliveries/${currentTarget.delivery_id}/status`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ status: "heading_to_customer" }),
          }
        );
      }

      // Then to at_customer if not already
      if (
        currentTarget.status === "picked_up" ||
        currentTarget.status === "heading_to_customer"
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
          }
        );
      }

      // Finally mark as delivered
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
            latitude: driverLocation.latitude,
            longitude: driverLocation.longitude,
          }),
        }
      );

      if (res.ok) {
        const updatedDeliveries = deliveries.filter(
          (d) => d.delivery_id !== currentTarget.delivery_id
        );
        setDeliveries(updatedDeliveries);

        // If more deliveries, move to next
        if (updatedDeliveries.length > 0) {
          setCurrentTarget(updatedDeliveries[0]);
        } else {
          // All done
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

  if (loading) {
    return (
      <DriverLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-600"></div>
        </div>
      </DriverLayout>
    );
  }

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

  // Calculate map bounds
  const mapPositions = [];
  if (driverLocation) {
    mapPositions.push([driverLocation.latitude, driverLocation.longitude]);
  }
  if (mode === "pickup" && currentTarget.restaurant) {
    mapPositions.push([
      currentTarget.restaurant.latitude,
      currentTarget.restaurant.longitude,
    ]);
  }
  if (mode === "delivery" && currentTarget.customer) {
    mapPositions.push([
      currentTarget.customer.latitude,
      currentTarget.customer.longitude,
    ]);
  }

  const mapCenter =
    mapPositions.length > 0 ? mapPositions[0] : [0, 0];

  return (
    <DriverLayout>
      <div className="h-screen flex flex-col bg-gray-50">
        {/* Map */}
        <div className="flex-1 relative">
          {driverLocation && (
            <MapContainer
              center={mapCenter}
              zoom={14}
              className="h-full w-full"
              zoomControl={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <MapBounds positions={mapPositions} />

              {/* Driver Marker */}
              <Marker
                position={[driverLocation.latitude, driverLocation.longitude]}
                icon={driverIcon}
              >
                <Popup>Your Location</Popup>
              </Marker>

              {/* Current Target Marker and Route */}
              {mode === "pickup" && currentTarget.restaurant && (
                <>
                  <Marker
                    position={[
                      currentTarget.restaurant.latitude,
                      currentTarget.restaurant.longitude,
                    ]}
                    icon={restaurantIcon}
                  >
                    <Popup>{currentTarget.restaurant.name}</Popup>
                  </Marker>
                  {currentTarget.route_geometry &&
                    currentTarget.route_geometry.coordinates && (
                      <Polyline
                        positions={currentTarget.route_geometry.coordinates.map(
                          (coord) => [coord[1], coord[0]]
                        )}
                        color="#ef4444"
                        weight={4}
                        opacity={0.7}
                      />
                    )}
                </>
              )}

              {mode === "delivery" && currentTarget.customer && (
                <>
                  <Marker
                    position={[
                      currentTarget.customer.latitude,
                      currentTarget.customer.longitude,
                    ]}
                    icon={customerIcon}
                  >
                    <Popup>{currentTarget.customer.name}</Popup>
                  </Marker>
                  {currentTarget.route_geometry &&
                    currentTarget.route_geometry.coordinates && (
                      <Polyline
                        positions={currentTarget.route_geometry.coordinates.map(
                          (coord) => [coord[1], coord[0]]
                        )}
                        color="#10b981"
                        weight={4}
                        opacity={0.7}
                      />
                    )}
                </>
              )}
            </MapContainer>
          )}

          {/* Mode Badge */}
          <div className="absolute top-4 left-4 bg-white px-4 py-2 rounded-full shadow-lg">
            <span className="font-bold text-gray-700">
              {mode === "pickup" ? "🏪 PICKUP MODE" : "📦 DELIVERY MODE"}
            </span>
          </div>

          {/* Status Badge */}
          <div className="absolute top-4 right-4 bg-white px-4 py-2 rounded-full shadow-lg">
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  isTracking ? "bg-green-500 animate-pulse" : "bg-gray-400"
                }`}
              ></div>
              <span className="text-sm font-semibold text-gray-700">
                {isTracking ? "Tracking" : "Not Tracking"}
              </span>
            </div>
          </div>
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
              />
            ) : (
              <DeliveryInfo
                delivery={currentTarget}
                onDelivered={handleDelivered}
                updating={updating}
              />
            )}

            {/* Upcoming List */}
            <div className="mt-6">
              <h3 className="font-bold text-gray-700 mb-3">
                {mode === "pickup"
                  ? `Upcoming Pickups (${pickups.length - 1})`
                  : `Upcoming Deliveries (${deliveries.length - 1})`}
              </h3>

              {mode === "pickup" &&
                pickups.slice(1).map((pickup, index) => (
                  <UpcomingPickupCard key={pickup.delivery_id} pickup={pickup} index={index + 2} />
                ))}

              {mode === "delivery" &&
                deliveries.slice(1).map((delivery, index) => (
                  <UpcomingDeliveryCard
                    key={delivery.delivery_id}
                    delivery={delivery}
                    index={index + 2}
                  />
                ))}
            </div>

            {/* Start Delivery Button */}
            {mode === "pickup" && pickups.length === 0 && deliveries.length > 0 && (
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

function PickupInfo({ pickup, onPickedUp, updating }) {
  const { order_number, restaurant, distance_km, estimated_time_minutes } = pickup;

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
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <span className="font-bold">{distance_km} km</span>
            </div>
            <div className="flex items-center gap-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-bold">{estimated_time_minutes} min</span>
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
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
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

function DeliveryInfo({ delivery, onDelivered, updating }) {
  const { order_number, customer, pricing, distance_km, estimated_time_minutes, restaurant_name } =
    delivery;

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
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <span className="font-bold">{distance_km} km</span>
            </div>
            <div className="flex items-center gap-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-bold">{estimated_time_minutes} min</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4 p-4 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-500 mb-2">From: {restaurant_name}</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-gray-500">Subtotal</p>
            <p className="font-bold">${pricing.subtotal.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-gray-500">Delivery Fee</p>
            <p className="font-bold">${pricing.delivery_fee.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-gray-500">Service Fee</p>
            <p className="font-bold">${pricing.service_fee.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-gray-500">Total</p>
            <p className="font-bold text-lg text-green-600">
              ${pricing.total.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <p className="text-gray-600 mb-2">{customer.address}</p>
      {customer.phone && (
        <a
          href={`tel:${customer.phone}`}
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold mb-4"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
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
