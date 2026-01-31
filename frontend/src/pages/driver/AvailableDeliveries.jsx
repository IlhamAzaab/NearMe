import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import DriverRealtimeNotificationListener from "../../components/DriverRealtimeNotificationListener";
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  Polyline,
  InfoWindow,
} from "@react-google-maps/api";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

// Google Maps container style - mobile optimized
const mapContainerStyle = {
  width: "100%",
  height: "100%",
};

// Google Maps options - mobile optimized
const mapOptions = {
  disableDefaultUI: true,
  zoomControl: false,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: false,
  gestureHandling: "greedy",
};

// Default driver location (Kinniya, Sri Lanka)
const DEFAULT_DRIVER_LOCATION = {
  latitude: 8.5017,
  longitude: 81.186,
};

// Cache key for localStorage
const CACHE_KEY = "available_deliveries_cache";
const CACHE_EXPIRY = 60000; // 1 minute cache

// Load cached data
const loadCachedData = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_EXPIRY) {
        return data;
      }
    }
  } catch (e) {
    console.warn("Cache load error:", e);
  }
  return null;
};

// Save to cache
const saveCacheData = (data) => {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        data,
        timestamp: Date.now(),
      }),
    );
  } catch (e) {
    console.warn("Cache save error:", e);
  }
};

export default function AvailableDeliveries() {
  const navigate = useNavigate();

  // Initialize with cached data for instant display
  const cachedData = loadCachedData();
  const [deliveries, setDeliveries] = useState(cachedData?.deliveries || []);
  const [declinedIds, setDeclinedIds] = useState(new Set()); // Track declined delivery IDs
  const [initialLoading, setInitialLoading] = useState(!cachedData); // Only show skeleton on first load
  const [isRefreshing, setIsRefreshing] = useState(false); // Background refresh indicator
  const [accepting, setAccepting] = useState(null);
  const [driverLocation, setDriverLocation] = useState(
    cachedData?.driverLocation || DEFAULT_DRIVER_LOCATION,
  );
  const [inDeliveringMode, setInDeliveringMode] = useState(false);
  const [currentRoute, setCurrentRoute] = useState(
    cachedData?.currentRoute || {
      total_stops: 0,
      active_deliveries: 0,
    },
  );
  const [deliveryListRef, setDeliveryListRef] = useState(null);
  const [toast, setToast] = useState(null);
  const [fetchError, setFetchError] = useState(null); // Network error state
  const deliveryListRefEl = useRef(null);
  const abortControllerRef = useRef(null); // For cancelling pending requests

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

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!driverLocation) return;

    const intervalId = setInterval(() => {
      console.log("[AUTO-REFRESH] Polling for new deliveries...");
      fetchPendingDeliveriesWithLocation(driverLocation, true);
    }, 30000); // 30 seconds

    return () => clearInterval(intervalId);
  }, [driverLocation]);

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

  const fetchPendingDeliveriesWithLocation = async (
    location,
    isBackgroundRefresh = false,
  ) => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      // Only show skeleton on initial load when no cached data
      if (!isBackgroundRefresh && deliveries.length === 0) {
        setInitialLoading(true);
      } else {
        setIsRefreshing(true);
      }

      const token = localStorage.getItem("token");
      const currentLoc = location || DEFAULT_DRIVER_LOCATION;

      const url = `http://localhost:5000/driver/deliveries/available/v2?driver_latitude=${currentLoc.latitude}&driver_longitude=${currentLoc.longitude}`;

      console.log("[FETCH] Requesting available deliveries from:", url);

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: abortControllerRef.current.signal,
      });

      console.log("[FETCH] Response status:", res.status);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("[FETCH] Error response:", errorData);
        throw new Error(errorData.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      console.log("[FETCH] Response data:", {
        total_available: data.total_available,
        deliveries_count: data.available_deliveries?.length || 0,
        current_route: data.current_route,
      });

      let deliveriesArray = data.available_deliveries || [];

      // Sort: Non-declined first (newest first), declined at bottom
      deliveriesArray = sortDeliveries(deliveriesArray, declinedIds);
      setDeliveries(deliveriesArray);

      const newCurrentRoute = data.current_route || {
        total_stops: 0,
        active_deliveries: 0,
      };
      setCurrentRoute(newCurrentRoute);

      const newDriverLocation = data.driver_location || currentLoc;
      setDriverLocation(newDriverLocation);

      // Save to cache for instant load next time
      saveCacheData({
        deliveries: deliveriesArray,
        currentRoute: newCurrentRoute,
        driverLocation: newDriverLocation,
      });

      // Clear any previous errors on successful fetch
      setFetchError(null);
    } catch (e) {
      if (e.name === "AbortError") return; // Ignore aborted requests
      console.error("❌ [FRONTEND] Failed to fetch deliveries:", e);

      // Set error message for display
      const errorMessage = e.message.includes("NetworkError")
        ? "No internet connection. Retrying..."
        : e.message.includes("HTTP 500")
          ? "Server error. Please try again."
          : e.message.includes("HTTP 401")
            ? "Authentication failed. Please log in again."
            : e.message || "Failed to fetch deliveries";

      setFetchError(errorMessage);

      // Don't clear deliveries on error if we have cached data
      if (deliveries.length === 0) {
        setDeliveries([]);
      }
    } finally {
      setInitialLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleAcceptDelivery = async (deliveryId) => {
    setAccepting(deliveryId);
    try {
      const token = localStorage.getItem("token");

      // Find the delivery to get its earnings data
      const delivery = deliveries.find((d) => d.delivery_id === deliveryId);

      const body = {
        // Driver location
        driver_latitude: driverLocation?.latitude,
        driver_longitude: driverLocation?.longitude,
        // Earnings data from route_impact
        earnings_data: delivery
          ? {
              delivery_sequence: currentRoute.active_deliveries + 1,
              base_amount:
                delivery.route_impact?.base_amount ||
                delivery.pricing?.total_trip_earnings ||
                0,
              extra_earnings: delivery.route_impact?.extra_earnings || 0,
              bonus_amount: delivery.route_impact?.bonus_amount || 0,
              r0_distance_km: delivery.route_impact?.r0_distance_km || null,
              r1_distance_km:
                delivery.route_impact?.r1_distance_km ||
                delivery.total_delivery_distance_km ||
                0,
              extra_distance_km: delivery.route_impact?.extra_distance_km || 0,
              total_distance_km: delivery.total_delivery_distance_km || 0,
            }
          : null,
      };

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
        // Remove accepted delivery
        setDeliveries((prev) =>
          prev.filter((d) => d.delivery_id !== deliveryId),
        );

        // Show toast notification
        showToast("✅ Delivery accepted!");

        // Auto-refresh in background to get updated earnings calculations
        setTimeout(() => {
          fetchPendingDeliveriesWithLocation(driverLocation, true);
        }, 300);
      } else {
        showToast(data.message || "Failed to accept delivery", "error");
      }
    } catch (e) {
      console.error("Accept error:", e);
      showToast("Failed to accept delivery", "error");
    } finally {
      setAccepting(null);
    }
  };

  // Sort deliveries: non-declined first, declined at bottom
  const sortDeliveries = (deliveriesArray, declinedSet) => {
    const nonDeclined = deliveriesArray.filter(
      (d) => !declinedSet.has(d.delivery_id),
    );
    const declined = deliveriesArray.filter((d) =>
      declinedSet.has(d.delivery_id),
    );
    return [...nonDeclined, ...declined];
  };

  // Handle decline - move to bottom of list
  const handleDecline = (deliveryId) => {
    const newDeclinedIds = new Set([...declinedIds, deliveryId]);
    setDeclinedIds(newDeclinedIds);
    setDeliveries((prev) => sortDeliveries(prev, newDeclinedIds));

    // Scroll to top to show next delivery
    if (deliveryListRefEl.current) {
      deliveryListRefEl.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Simple toast notification
  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div
      className="min-h-screen bg-gray-50 flex flex-col"
      style={{ fontFamily: "'Work Sans', sans-serif" }}
    >
      <DriverRealtimeNotificationListener
        onNewDelivery={() => {
          if (driverLocation) {
            // Background refresh - don't block UI
            fetchPendingDeliveriesWithLocation(driverLocation, true);
          }
        }}
      />

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-lg text-white font-medium text-sm animate-slide-down ${
            toast.type === "error" ? "bg-red-500" : "bg-green-500"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Network Error Alert */}
      {fetchError && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-3 flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <svg
              className="w-5 h-5 text-red-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-red-800">
              Connection Error
            </h3>
            <p className="text-xs text-red-700 mt-0.5">{fetchError}</p>
          </div>
          <button
            onClick={() => {
              setFetchError(null);
              if (driverLocation) {
                fetchPendingDeliveriesWithLocation(driverLocation);
              }
            }}
            className="flex-shrink-0 text-red-700 hover:text-red-800 font-medium text-xs"
          >
            Retry
          </button>
        </div>
      )}

      {/* Top Navbar */}
      <div className="shrink-0 bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/driver/deliveries/active")}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 active:scale-95 transition-all"
          >
            <svg
              className="w-6 h-6 text-gray-800"
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
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900">
              New Delivery Request
            </h1>
            <p className="text-xs text-gray-500 flex items-center gap-1">
              {deliveries.length} available
              {isRefreshing && (
                <span className="inline-block w-3 h-3 border-2 border-green-500 border-t-transparent rounded-full animate-spin ml-1"></span>
              )}
            </p>
          </div>
          {currentRoute.active_deliveries > 0 && (
            <span className="bg-green-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              {currentRoute.active_deliveries} Active
            </span>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div ref={deliveryListRefEl} className="flex-1 overflow-y-auto pb-24">
        {inDeliveringMode ? (
          <div className="p-6 text-center">
            <div className="text-5xl mb-4">🚗</div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">
              Currently Delivering
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Complete current deliveries first
            </p>
            <button
              onClick={() => navigate("/driver/deliveries/active")}
              className="px-6 py-3 bg-green-500 text-white rounded-full font-medium"
            >
              Go to Active Deliveries
            </button>
          </div>
        ) : initialLoading ? (
          /* Skeleton Loading Blocks */
          <div className="space-y-4 p-4">
            {[1, 2, 3].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : deliveries.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-5xl mb-4">📦</div>
            <h3 className="text-lg font-bold text-gray-700 mb-2">
              No Deliveries Available
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              {currentRoute.active_deliveries >= 5
                ? "You've reached the maximum deliveries. Complete some deliveries first."
                : "No new delivery requests match your current location. Check back soon!"}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() =>
                  fetchPendingDeliveriesWithLocation(driverLocation)
                }
                className="px-6 py-2 bg-green-500 text-white rounded-full text-sm font-medium hover:bg-green-600 active:scale-95 transition-all"
              >
                Refresh
              </button>
              {currentRoute.active_deliveries > 0 && (
                <button
                  onClick={() => navigate("/driver/deliveries/active")}
                  className="px-6 py-2 border border-green-500 text-green-500 rounded-full text-sm font-medium hover:bg-green-50 active:scale-95 transition-all"
                >
                  View Active ({currentRoute.active_deliveries})
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-0">
            {deliveries.map((delivery, index) => (
              <DeliveryCard
                key={delivery.delivery_id}
                delivery={delivery}
                driverLocation={driverLocation}
                accepting={accepting === delivery.delivery_id}
                onAccept={handleAcceptDelivery}
                onDecline={handleDecline}
                hasActiveDeliveries={currentRoute.total_stops > 0}
                isLoaded={isLoaded}
                isFirstDelivery={
                  index === 0 && !declinedIds.has(delivery.delivery_id)
                }
                isDeclined={declinedIds.has(delivery.delivery_id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-2 z-20">
        <div className="flex items-center justify-around">
          <button
            onClick={() => navigate("/driver/dashboard")}
            className="flex flex-col items-center gap-1 py-2 px-4 text-gray-500 hover:text-gray-900 transition-colors"
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
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
            <span className="text-xs font-medium">Home</span>
          </button>
          <button className="flex flex-col items-center gap-1 py-2 px-4 text-[#13ec37]">
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
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <span className="text-xs font-bold">Orders</span>
          </button>
          <button
            onClick={() => navigate("/driver/deliveries/active")}
            className="flex flex-col items-center gap-1 py-2 px-4 text-gray-500 hover:text-gray-900 transition-colors relative"
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
            <span className="text-xs font-medium">Active</span>
            {currentRoute.active_deliveries > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {currentRoute.active_deliveries}
              </span>
            )}
          </button>
          <button
            onClick={() => navigate("/driver/profile")}
            className="flex flex-col items-center gap-1 py-2 px-4 text-gray-500 hover:text-gray-900 transition-colors"
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
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            <span className="text-xs font-medium">Profile</span>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slide-down {
          from {
            opacity: 0;
            transform: translate(-50%, -20px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
        .animate-slide-down {
          animation: slide-down 0.3s ease-out;
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .animate-shimmer {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }
      `}</style>
    </div>
  );
}

// Skeleton Loading Card Component - Matches new design
function SkeletonCard() {
  return (
    <div className="bg-white overflow-hidden">
      {/* Map Skeleton - Full Width */}
      <div className="h-[40vh] min-h-[220px] bg-gradient-to-br from-gray-100 to-gray-200 relative">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.4) 50%, transparent 75%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s infinite",
          }}
        ></div>
        <div className="absolute top-4 right-4 w-10 h-10 bg-white/60 rounded-full"></div>
      </div>

      {/* Content Card Skeleton */}
      <div className="bg-white rounded-t-[28px] -mt-7 relative z-10 px-5 pt-6 pb-5">
        {/* Earnings Row */}
        <div className="flex items-center justify-between mb-5 pb-5 border-b border-gray-100">
          <div className="space-y-2">
            <div
              className="w-24 h-8 bg-gray-200 rounded-lg"
              style={{
                background:
                  "linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s infinite",
              }}
            ></div>
            <div className="w-32 h-4 bg-gray-200 rounded"></div>
          </div>
          <div className="space-y-2">
            <div className="w-20 h-7 bg-gray-100 rounded-lg"></div>
            <div className="w-20 h-7 bg-gray-100 rounded-lg"></div>
          </div>
        </div>

        {/* Route Details Header */}
        <div className="w-28 h-5 bg-gray-200 rounded mb-4"></div>

        {/* Timeline Skeleton - New Style */}
        <div className="flex flex-col gap-0 mb-5">
          {/* Pickup Skeleton */}
          <div className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 bg-[#13ec37]/20 rounded-full"></div>
              <div className="w-0.5 bg-[#13ec37]/30 flex-1 min-h-[40px]"></div>
            </div>
            <div className="flex-1 pb-4 space-y-2">
              <div className="w-14 h-3 bg-[#13ec37]/30 rounded"></div>
              <div
                className="w-40 h-5 bg-gray-200 rounded"
                style={{
                  background:
                    "linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)",
                  backgroundSize: "200% 100%",
                  animation: "shimmer 1.5s infinite",
                }}
              ></div>
              <div className="w-52 h-4 bg-gray-100 rounded"></div>
            </div>
          </div>

          {/* Drop-off Skeleton */}
          <div className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 bg-gray-100 rounded-full"></div>
            </div>
            <div className="flex-1 space-y-2">
              <div className="w-14 h-3 bg-gray-200 rounded"></div>
              <div className="w-32 h-5 bg-gray-200 rounded"></div>
              <div className="w-44 h-4 bg-gray-100 rounded"></div>
            </div>
          </div>
        </div>

        {/* Button Skeleton */}
        <div
          className="w-full h-14 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, #bbf7d0 25%, #86efac 50%, #bbf7d0 75%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s infinite",
          }}
        ></div>
      </div>
    </div>
  );
}

function DeliveryCard({
  delivery,
  driverLocation,
  accepting,
  onAccept,
  onDecline,
  hasActiveDeliveries,
  isLoaded = false,
  isFirstDelivery = false,
  isDeclined = false,
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
    base_amount = 0, // 1st order's earnings (R0 × Rs.40)
    extra_earnings = 0, // Extra distance × Rs.40
    bonus_amount = 0, // Rs.25 for 2nd, Rs.30 for 3rd+
    total_trip_earnings = 0, // Base + Extra + Bonus
    r0_distance_km = 0,
    r1_distance_km = 0,
  } = route_impact || {};

  // Calculate total items
  const totalItems = order_items.reduce(
    (sum, item) => sum + (item.quantity || 0),
    0,
  );

  // Calculate map center and bounds
  const mapCenter = restaurant
    ? { lat: restaurant.latitude, lng: restaurant.longitude }
    : { lat: 0, lng: 0 };

  // 🆕 Show route-extension context when driver has active deliveries
  // This shows the purple "Route Extension Impact" block
  const showRouteExtension = hasActiveDeliveries;

  console.log("🔍 DeliveryCard Debug:", {
    delivery_id,
    order_number,
    hasActiveDeliveries,
    extra_distance_km,
    extra_time_minutes,
    base_amount,
    extra_earnings,
    bonus_amount,
    total_trip_earnings,
    r0_distance_km,
    r1_distance_km,
    showRouteExtension,
    route_impact: route_impact,
    pricing: pricing,
    total_delivery_distance_km,
    currentRoute: hasActiveDeliveries ? "HAS ACTIVE" : "FIRST DELIVERY",
  });

  // Safety check for pricing - use total_trip_earnings for first delivery
  const driverEarnings =
    pricing?.total_trip_earnings || total_trip_earnings || 0;

  // Decode polyline for routes
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

  // Prepare route paths for polylines
  const driverToRestaurantPath = driver_to_restaurant_route?.encoded_polyline
    ? decodePolyline(driver_to_restaurant_route.encoded_polyline)
    : driver_to_restaurant_route?.coordinates
      ? driver_to_restaurant_route.coordinates.map((coord) => ({
          lat: coord[1],
          lng: coord[0],
        }))
      : [];

  const restaurantToCustomerPath =
    restaurant_to_customer_route?.encoded_polyline
      ? decodePolyline(restaurant_to_customer_route.encoded_polyline)
      : restaurant_to_customer_route?.coordinates
        ? restaurant_to_customer_route.coordinates.map((coord) => ({
            lat: coord[1],
            lng: coord[0],
          }))
        : [];

  // State for info windows
  const [selectedMarker, setSelectedMarker] = useState(null);

  // 🆕 Only show routes for first delivery when no active deliveries
  const showRoutes = isFirstDelivery && !hasActiveDeliveries;

  // Is this a stacked delivery (2nd or more)?
  const isStackedDelivery = hasActiveDeliveries;

  return (
    <div
      className={`bg-white overflow-hidden transition-all duration-300 ${isDeclined ? "opacity-50 scale-[0.98]" : ""} ${!can_accept ? "border-2 border-red-200 opacity-75" : ""}`}
    >
      {/* Map Section - Full Width */}
      <div className="relative w-full h-[40vh] min-h-[220px]">
        {restaurant && customer && isLoaded ? (
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
                  fillColor: "#13ec37",
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
                <div className="text-center p-1">
                  <p className="font-bold text-green-600 text-sm">📍 You</p>
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
                fillColor: "#13ec37",
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
                <div className="p-1">
                  <p className="font-bold text-sm">🍽️ {restaurant.name}</p>
                </div>
              </InfoWindow>
            )}

            {/* Customer Marker */}
            <Marker
              position={{
                lat: customer?.latitude || 0,
                lng: customer?.longitude || 0,
              }}
              icon={{
                path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
                scale: 10,
                fillColor: "#111812",
                fillOpacity: 1,
                strokeWeight: 3,
                strokeColor: "#ffffff",
              }}
              onClick={() => setSelectedMarker("customer")}
            />

            {selectedMarker === "customer" && customer && (
              <InfoWindow
                position={{
                  lat: customer.latitude,
                  lng: customer.longitude,
                }}
                onCloseClick={() => setSelectedMarker(null)}
              >
                <div className="p-1">
                  <p className="font-bold text-sm">
                    📍 {customer?.name || "Customer"}
                  </p>
                </div>
              </InfoWindow>
            )}

            {/* Route Polylines */}
            {showRoutes && driverToRestaurantPath.length > 0 && (
              <Polyline
                path={driverToRestaurantPath}
                options={{
                  strokeColor: "#13ec37",
                  strokeOpacity: 0.9,
                  strokeWeight: 5,
                }}
              />
            )}

            {showRoutes && restaurantToCustomerPath.length > 0 && (
              <Polyline
                path={restaurantToCustomerPath}
                options={{
                  strokeColor: "#13ec37",
                  strokeOpacity: 0.6,
                  strokeWeight: 4,
                }}
              />
            )}
          </GoogleMap>
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            <div className="text-center">
              <div className="w-10 h-10 border-3 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-gray-500 text-sm">Loading map...</p>
            </div>
          </div>
        )}

        {/* Floating Decline Button */}
        {onDecline && (
          <button
            onClick={() => onDecline(delivery_id)}
            className="absolute top-4 right-4 bg-white/90 backdrop-blur shadow-lg rounded-full p-2.5 text-gray-600 hover:text-gray-900 hover:bg-white transition-all active:scale-90 z-10"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Content Card - Slides over map */}
      <div className="bg-white rounded-t-[28px] -mt-7 relative z-10 px-5 pt-6 pb-5">
        {/* Cannot Accept Warning */}
        {!can_accept && reason && (
          <div className="bg-red-50 rounded-xl p-3 border border-red-200 mb-4">
            <p className="text-sm text-red-700 font-semibold flex items-center gap-2">
              <span>⚠️</span> {reason}
            </p>
          </div>
        )}

        {/* For STACKED deliveries (2nd or more) - Show bonus above earnings */}
        {isStackedDelivery ? (
          <>
            {/* Bonus Amount Box - Only show if bonus exists */}
            {Number(bonus_amount || 0) > 0 && (
              <div className="p-3 rounded-xl border-2 border-dashed border-[#13ec37] bg-green-50 mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-gray-800 font-bold text-sm">
                    Bonus For This Delivery
                  </span>
                </div>
                <span className="text-[#13ec37] font-bold text-lg">
                  +Rs.{Number(bonus_amount).toFixed(0)}
                </span>
              </div>
            )}

            {/* Extra Earnings & Stats */}
            <div className="flex items-center justify-between mb-5 pb-5 border-b border-gray-100">
              <div>
                <p className="text-[#13ec37] text-3xl font-bold leading-tight">
                  +Rs.{Number(extra_earnings || 0).toFixed(2)}
                </p>
                <p className="text-gray-500 text-sm font-medium">
                  Extra Earnings
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex items-center gap-2 text-[#111812] dark:text-black font-bold bg-gray-50 dark:bg-gray-50 px-3 py-1 rounded-full">
                  <svg
                    className="w-4 h-4 text-[#13ec37] font-bold"
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
                  +{Number(extra_distance_km || 0).toFixed(1)} km
                </div>
                <div className="flex items-center gap-2 text-black dark:text-black font-bold bg-gray-50 dark:bg-gray-50 px-3 py-1 rounded-full">
                  <svg
                    className="w-4 h-4 text-[#13ec37] font-bold"
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
                  +{Number(extra_time_minutes || 0).toFixed(0)} mins
                </div>
              </div>
            </div>
          </>
        ) : (
          /* For FIRST delivery - Show earnings prominently */
          <div className="flex items-center justify-between mb-5 pb-5 border-b border-gray-100">
            <div>
              <p className="text-[#13ec37] text-3xl font-bold leading-tight">
                Rs. {driverEarnings?.toFixed(0) || "0"}
              </p>
              <p className="text-gray-500 text-sm font-medium">
                Estimated Earnings
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2 text-black dark:text-black font-bold bg-gray-50 dark:bg-gray-50 px-3 py-1 rounded-full">
                <svg
                  className="w-4 h-4 text-green-400 font-bold"
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
                {Number(total_delivery_distance_km || 0).toFixed(1)} km
              </div>
              <div className="flex items-center gap-2 text-black dark:text-black font-bold bg-gray-50 dark:bg-gray-50 px-3 py-1 rounded-full">
                <svg
                  className="w-4 h-4 text-green-400 font-bold"
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
                {estimated_time_minutes || 0} mins
              </div>
            </div>
          </div>
        )}

        {/* Route Details Header */}
        <h3 className="text-gray-900 text-base font-bold mb-4">
          Route Details
        </h3>

        {/* Timeline Component - Address Style from Mockup */}
        <div className="flex flex-col gap-0 mb-5">
          {/* Pickup */}
          <div className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 bg-[#13ec37]/10 rounded-full flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-[#13ec37]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </div>
              <div className="w-1 bg-[#13ec37]/30 flex-0.5 min-h-[40px]"></div>
            </div>
            <div className="flex-1 pb-4">
              <p className="text-[#13ec37] text-xs font-bold uppercase tracking-wide">
                Pickup:{" "}
                <span className="text-gray-900 text-[15px] font-bold leading-snug">
                  {restaurant.name}
                </span>
              </p>

              <p className="text-gray-500 text-sm leading-snug">
                {restaurant.address}
              </p>
            </div>
          </div>

          {/* Drop-off */}
          <div className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 bg-[#13ec37]/10 rounded-full flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-[#13ec37]"
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
              </div>
            </div>
            <div className="flex-1">
              <p className="text-[#13ec37] text-xs font-bold uppercase tracking-wide">
                Drop-off:{" "}
                <span className="text-black font-bold leading-snug">
                  {customer?.name || "Customer"}
                </span>
              </p>
              <p className="text-gray-500 text-sm leading-snug">
                {customer?.address || "No address"}
              </p>
            </div>
          </div>
        </div>

        {/* Items Badge */}
        {totalItems > 0 && (
          <div className="flex items-center gap-2 mb-5">
            <span className="bg-gray-100 px-3 py-1.5 rounded-full text-sm text-gray-700 font-medium flex items-center gap-1.5">
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
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                />
              </svg>
              {totalItems} item{totalItems !== 1 ? "s" : ""}
            </span>
            <span className="bg-gray-100 px-3 py-1.5 rounded-full text-sm text-gray-700 font-medium">
              #{order_number}
            </span>
          </div>
        )}

        {/* Accept Button */}
        <button
          onClick={() => onAccept(delivery_id)}
          disabled={accepting || !can_accept}
          className={`w-full py-4 rounded-full font-bold text-base transition-all flex items-center justify-center gap-2 ${
            !can_accept
              ? "bg-gray-200 text-gray-500 cursor-not-allowed"
              : accepting
                ? "bg-[#13ec37]/70 text-gray-900 cursor-not-allowed"
                : "bg-[#13ec37] text-gray-900 hover:bg-[#10d632] active:scale-[0.98]"
          }`}
        >
          {accepting ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
              <span>Accepting...</span>
            </>
          ) : !can_accept ? (
            <span>Cannot Accept</span>
          ) : (
            <>
              <span>
                {isStackedDelivery
                  ? "Accept Stacked Delivery"
                  : "Accept Delivery"}
              </span>
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
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
