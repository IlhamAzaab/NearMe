import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DriverLayout from "../../components/DriverLayout";

export default function ActiveDeliveries() {
  const navigate = useNavigate();
  const [pickups, setPickups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [driverLocation, setDriverLocation] = useState(null);
  const [error, setError] = useState(null);

  // Default driver location (Kinniya, Sri Lanka)
  const DEFAULT_DRIVER_LOCATION = {
    latitude: 8.5017,
    longitude: 81.186,
  };

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
          // Use default location
          setDriverLocation(DEFAULT_DRIVER_LOCATION);
          fetchPickups(DEFAULT_DRIVER_LOCATION);
        },
      );
    } else {
      setDriverLocation(DEFAULT_DRIVER_LOCATION);
      fetchPickups(DEFAULT_DRIVER_LOCATION);
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
      setLoading(true);
      setError(null);
      const token = localStorage.getItem("token");

      if (!location) {
        setLoading(false);
        return;
      }

      const url = `http://localhost:5000/driver/deliveries/active?driver_latitude=${location.latitude}&driver_longitude=${location.longitude}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (res.ok) {
        setPickups(data.deliveries || []);
      } else {
        console.error("Failed to fetch pickups:", data.message);
        setError(data.message || "Failed to fetch active deliveries");
        setPickups([]);
      }
    } catch (e) {
      console.error("Fetch pickups error:", e);
      setError("Cannot connect to server. Please check your connection.");
      setPickups([]);
    } finally {
      setLoading(false);
    }
  };

  const handleStartPickup = () => {
    if (pickups.length === 0) {
      alert("No pickups available");
      return;
    }

    // Navigate to map page with the first delivery ID
    navigate(`/driver/delivery/active/${pickups[0].delivery_id}/map`);
  };

  return (
    <DriverLayout>
      <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-green-600 via-green-500 to-green-600 bg-clip-text text-transparent">
              Active Deliveries
            </h1>
            <p className="text-gray-600 mt-1 text-sm sm:text-base">
              {pickups.length} delivery{pickups.length !== 1 ? "ies" : ""} in
              progress
            </p>
          </div>
          <button
            onClick={() => navigate("/driver/deliveries")}
            className="px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-300 shadow-md hover:shadow-lg font-medium text-sm sm:text-base whitespace-nowrap"
          >
            Available Deliveries
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 flex items-start gap-3">
            <svg
              className="w-5 h-5 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4v2m0 4v2M8.228 4h7.544a2 2 0 011.973 2.5l-1.347 6.75H4.602l-1.347-6.75A2 2 0 016.684 4h1.544m0 0a1 1 0 00-.98-1.242h-7.544a1 1 0 00-.98 1.242"
              />
            </svg>
            <div>
              <p className="font-semibold">{error}</p>
              <button
                onClick={() => fetchPickups(driverLocation)}
                className="text-sm underline hover:no-underline mt-1"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="bg-white rounded-xl shadow border border-green-100 p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-green-600 mx-auto"></div>
            <p className="mt-4 text-gray-600 font-medium">
              Loading active deliveries...
            </p>
          </div>
        ) : pickups.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-xl shadow border border-green-100 hover:shadow-xl transition-shadow duration-300">
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
                No Active Deliveries
              </h3>
              <p className="text-gray-500 mb-6">
                Accept deliveries to start picking up orders
              </p>
              <button
                onClick={() => navigate("/driver/deliveries")}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
              >
                View Available Deliveries
              </button>
            </div>
          </div>
        ) : (
          /* Pickups List */
          <div className="space-y-4">
            {pickups.map((pickup, index) => (
              <PickupCard
                key={pickup.delivery_id}
                pickup={pickup}
                index={index}
                isFirst={index === 0}
                onNavigate={() =>
                  navigate(`/driver/delivery/active/${pickup.delivery_id}/map`)
                }
              />
            ))}
          </div>
        )}

        {/* Fixed Start Pickup Button */}
        {pickups.length > 0 && !loading && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-2xl">
            <div className="max-w-4xl mx-auto px-4">
              <button
                onClick={handleStartPickup}
                className="w-full py-4 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl font-bold text-lg hover:from-green-700 hover:to-green-800 transition-all duration-300 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105"
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
                <span>START PICK-UP</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </DriverLayout>
  );
}

function PickupCard({ pickup, index, isFirst, onNavigate }) {
  const {
    delivery_id,
    order_number,
    restaurant,
    distance_km,
    estimated_time_minutes,
  } = pickup;

  return (
    <div
      className={`bg-white rounded-xl shadow-lg border-2 p-5 sm:p-6 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 ${
        isFirst
          ? "border-green-500 ring-2 ring-green-200"
          : "border-gray-200 hover:border-green-300"
      } ${isFirst ? "animate-bounce-in" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg shadow-md transition-all ${
              isFirst
                ? "bg-gradient-to-r from-green-500 to-green-600 text-white ring-2 ring-green-200"
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
              <p className="text-xs text-green-600 font-bold mt-1 flex items-center gap-1">
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                NEXT PICKUP
              </p>
            )}
          </div>
        </div>

        {/* Distance and Time */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-gray-700 bg-blue-50 px-3 py-1.5 rounded-full">
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
            <span className="font-bold">{distance_km} km</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-700 bg-orange-50 px-3 py-1.5 rounded-full">
            <svg
              className="w-5 h-5 text-orange-600"
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

      {/* Restaurant Info */}
      <div className="bg-gradient-to-r from-red-50 to-red-100 rounded-lg p-4 border border-red-200 mb-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-r from-red-500 to-red-600 rounded-full flex items-center justify-center text-2xl shadow-md">
            🍽️
          </div>
          <div className="flex-1">
            <p className="text-xs text-red-700 uppercase font-bold mb-1">
              Restaurant
            </p>
            <p className="font-bold text-gray-900 text-lg">{restaurant.name}</p>
            <p className="text-sm text-gray-600 mt-1">{restaurant.address}</p>
            {restaurant.phone && (
              <a
                href={`tel:${restaurant.phone}`}
                className="inline-flex items-center gap-2 mt-2 text-red-600 hover:text-red-700 font-semibold text-sm transition-colors"
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
      </div>

      {/* Navigate Button */}
      <button
        onClick={onNavigate}
        className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-300 font-semibold flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
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
            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
          />
        </svg>
        View on Map
      </button>
    </div>
  );
}
