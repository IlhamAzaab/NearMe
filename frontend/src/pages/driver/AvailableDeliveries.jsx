import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import DriverRealtimeNotificationListener from "../../components/DriverRealtimeNotificationListener";
import DriverLayout from "../../components/DriverLayout";
import AdminSkeleton from "../../components/AdminSkeleton";
import PageWrapper from "../../components/PageWrapper";
import { API_URL } from "../../config";
import { useSocket } from "../../context/SocketContext";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./AvailableDeliveries.css";
import AnimatedAlert, { useAlert } from "../../components/AnimatedAlert";

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

// Custom marker icons for Leaflet
const createCircleIcon = (color, borderColor = "#ffffff") => {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      width: 20px;
      height: 20px;
      background-color: ${color};
      border: 3px solid ${borderColor};
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
  });
};

// Custom SVG icons for Leaflet (black, no background)
const createSvgIcon = (svgPath, size = 32) => {
  return L.divIcon({
    className: "custom-svg-marker",
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="#1a1a1a" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">${svgPath}</svg>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
};

// Driver icon (motorcycle/scooter)
const driverSvgIcon = createSvgIcon(
  '<path d="M19 7c0-1.1-.9-2-2-2h-3v2h3v2.65L13.52 14H10V9H6c-2.21 0-4 1.79-4 4v3h2c0 1.66 1.34 3 3 3s3-1.34 3-3h4.48L19 10.35V7zM7 17c-.55 0-1-.45-1-1h2c0 .55-.45 1-1 1z"/><path d="M5 6h5v2H5zm14 7c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm0 4c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>',
  28,
);

// Restaurant icon (storefront/building)
const restaurantSvgIcon = createSvgIcon(
  '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>',
  28,
);

// Restaurant alt icon (home/store)
const restaurantHomeIcon = createSvgIcon(
  '<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>',
  28,
);

// Customer icon (location pin)
const customerSvgIcon = createSvgIcon(
  '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>',
  28,
);

const driverIcon = createCircleIcon("#13ec37");
const restaurantIcon = createCircleIcon("#13ec37");
const customerIcon = createCircleIcon("#111812");

// Leaflet container style - mobile optimized
const mapContainerStyle = {
  width: "100%",
  height: "100%",
};

// Default driver location (Kinniya, Sri Lanka)
const DEFAULT_DRIVER_LOCATION = {
  latitude: 8.5017,
  longitude: 81.186,
};

// Cache key for localStorage
const CACHE_KEY = "available_deliveries_cache";
const CACHE_EXPIRY = 60000; // 1 minute cache

// OpenStreetMap tile URL
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

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
  const queryClient = useQueryClient();
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const userId = localStorage.getItem("userId") || "default";
  const deliveriesQueryKey = ["driver", "available-deliveries", userId];

  // Socket connection for real-time notifications
  const {
    connectAsDriver,
    disconnect,
    isConnected,
    newDeliveryAlert,
    clearNewDeliveryAlert,
    takenDeliveries,
    clearAllTakenDeliveries,
  } = useSocket();

  // Initialize with cached data for instant display
  const cachedData = loadCachedData();
  const cachedQueryData = queryClient.getQueryData(deliveriesQueryKey);
  const initialSnapshot = cachedQueryData || cachedData;
  const [deliveries, setDeliveries] = useState(
    initialSnapshot?.deliveries || [],
  );
  const [declinedIds, setDeclinedIds] = useState(new Set()); // Track declined delivery IDs
  const [initialLoading, setInitialLoading] = useState(() => !initialSnapshot);
  const [hasCompletedFirstFetch, setHasCompletedFirstFetch] =
    useState(!!initialSnapshot); // Track if first fetch is done
  const [isRefreshing, setIsRefreshing] = useState(false); // Background refresh indicator
  const [accepting, setAccepting] = useState(null);
  const [driverLocation, setDriverLocation] = useState(
    initialSnapshot?.driverLocation || DEFAULT_DRIVER_LOCATION,
  );
  const [inDeliveringMode, setInDeliveringMode] = useState(false);
  const [currentRoute, setCurrentRoute] = useState(
    initialSnapshot?.currentRoute || {
      total_stops: 0,
      active_deliveries: 0,
    },
  );
  const [deliveryListRef, setDeliveryListRef] = useState(null);
  const {
    alert: alertState,
    visible: alertVisible,
    showSuccess,
    showError,
  } = useAlert();
  const [fetchError, setFetchError] = useState(null); // Network error state
  const [showNewDeliveryBanner, setShowNewDeliveryBanner] = useState(false); // Real-time alert banner
  const deliveryListRefEl = useRef(null);
  const abortControllerRef = useRef(null); // For cancelling pending requests

  useQuery({
    queryKey: deliveriesQueryKey,
    enabled: !!token && role === "driver",
    staleTime: 60 * 1000,
    queryFn: async () => {
      const currentLoc = driverLocation || DEFAULT_DRIVER_LOCATION;
      const url = `${API_URL}/driver/deliveries/available/v2?driver_latitude=${currentLoc.latitude}&driver_longitude=${currentLoc.longitude}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      return {
        deliveries: data.available_deliveries || [],
        currentRoute: data.current_route || {
          total_stops: 0,
          active_deliveries: 0,
        },
        driverLocation: data.driver_location || currentLoc,
      };
    },
  });

  useEffect(() => {
    if (!cachedQueryData) return;
    setDeliveries(cachedQueryData.deliveries || []);
    setCurrentRoute(
      cachedQueryData.currentRoute || { total_stops: 0, active_deliveries: 0 },
    );
    setDriverLocation(
      cachedQueryData.driverLocation || DEFAULT_DRIVER_LOCATION,
    );
    setHasCompletedFirstFetch(true);
    setInitialLoading(false);
  }, [cachedQueryData]);

  // Leaflet is always loaded (no API key needed)
  const isLoaded = true;

  // Connect to WebSocket when component mounts
  useEffect(() => {
    const driverId = localStorage.getItem("userId");
    const role = localStorage.getItem("role");

    if (role === "driver" && driverId) {
      console.log(
        "[AvailableDeliveries] Connecting to WebSocket as driver:",
        driverId,
      );
      connectAsDriver(driverId);
    }

    // No cleanup - let socket persist for other pages
    // The socket will be cleaned up when the app unmounts
  }, []); // Empty deps - connect only once on mount

  // Handle real-time new delivery alerts
  useEffect(() => {
    if (newDeliveryAlert) {
      console.log(
        "[AvailableDeliveries] 🚨 New delivery alert received!",
        newDeliveryAlert,
      );

      // Show the banner
      setShowNewDeliveryBanner(true);

      // Play notification sound (optional)
      try {
        const audio = new Audio("/driver-alert-tone.wav");
        audio.volume = 0.5;
        audio.play().catch(() => {}); // Ignore errors if audio can't play
      } catch (e) {}

      // Auto-refresh to get the new delivery
      if (driverLocation) {
        fetchPendingDeliveriesWithLocation(driverLocation, true);
      }

      // Hide banner after 5 seconds
      setTimeout(() => {
        setShowNewDeliveryBanner(false);
        clearNewDeliveryAlert();
      }, 5000);
    }
  }, [newDeliveryAlert, driverLocation, clearNewDeliveryAlert]);

  // Handle deliveries taken by other drivers (remove from list)
  useEffect(() => {
    if (takenDeliveries.size > 0) {
      setDeliveries((prev) =>
        prev.filter((d) => !takenDeliveries.has(d.delivery_id)),
      );
      // Clear after processing
      clearAllTakenDeliveries();
    }
  }, [takenDeliveries, clearAllTakenDeliveries]);

  // Refs for location tracking
  const watchIdRef = useRef(null);
  const isFetchingRef = useRef(false);
  const lastFetchLocationRef = useRef(null);
  const lastLocationRef = useRef(null);
  const fetchPendingDeliveriesRef = useRef(null); // Ref to hold fetch function
  const hasFetchedInitialRef = useRef(false);

  // Minimum distance (in meters) driver must move before triggering a data refresh
  const MOVEMENT_THRESHOLD_METERS = 100;

  // Function to update location only - uses watchPosition (event-driven)
  // Only triggers data refresh if driver moved significantly
  // (This is now handled inside the watchPosition callback in useEffect below)

  // Function to fetch deliveries with current location (every 10 seconds)
  const fetchDeliveriesWithCurrentLocation = useCallback(
    (isBackgroundRefresh = false) => {
      if (isFetchingRef.current && isBackgroundRefresh) return;

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const location = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };
            setDriverLocation(location);
            lastFetchLocationRef.current = location;
            fetchPendingDeliveriesWithLocation(location, isBackgroundRefresh);
          },
          (error) => {
            console.error("Error getting location:", error);
            // Use default on initial load if no location
            if (!driverLocation && !isBackgroundRefresh) {
              setDriverLocation(DEFAULT_DRIVER_LOCATION);
              fetchPendingDeliveriesWithLocation(
                DEFAULT_DRIVER_LOCATION,
                isBackgroundRefresh,
              );
            } else if (driverLocation) {
              // Use last known location for background refresh
              fetchPendingDeliveriesWithLocation(
                driverLocation,
                isBackgroundRefresh,
              );
            }
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
        );
      } else if (!driverLocation) {
        setDriverLocation(DEFAULT_DRIVER_LOCATION);
        fetchPendingDeliveriesWithLocation(
          DEFAULT_DRIVER_LOCATION,
          isBackgroundRefresh,
        );
      }
    },
    [driverLocation],
  );

  // Helper: distance between two coords in meters (for movement threshold)
  const getDistanceMeters = (lat1, lng1, lat2, lng2) => {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "driver") {
      navigate("/login");
      return;
    }

    // Check if driver is in delivering mode first
    checkDeliveringMode();

    // Get initial location and fetch deliveries
    fetchDeliveriesWithCurrentLocation(false);

    // Use watchPosition (event-driven, fires only on real device movement)
    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const newLoc = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };

          const prev = lastLocationRef.current;
          if (!prev) {
            lastLocationRef.current = newLoc;
            setDriverLocation(newLoc);
            return;
          }

          // Only update map marker when driver moved 10+ meters
          const moved = getDistanceMeters(
            prev.latitude,
            prev.longitude,
            newLoc.latitude,
            newLoc.longitude,
          );

          if (moved >= 10) {
            lastLocationRef.current = newLoc;
            setDriverLocation(newLoc);
          }

          // Only refetch data when driver moved 50+ meters since last API call
          if (lastFetchLocationRef.current) {
            const movedSinceFetch = getDistanceMeters(
              lastFetchLocationRef.current.latitude,
              lastFetchLocationRef.current.longitude,
              newLoc.latitude,
              newLoc.longitude,
            );

            if (movedSinceFetch >= MOVEMENT_THRESHOLD_METERS) {
              console.log(
                `[LOCATION] Driver moved ${movedSinceFetch.toFixed(0)}m → refreshing`,
              );
              lastFetchLocationRef.current = newLoc;
              if (fetchPendingDeliveriesRef.current) {
                fetchPendingDeliveriesRef.current(newLoc, true);
              }
            }
          }
        },
        (error) => console.error("Location watch error:", error),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
      );
    }

    // NO periodic intervals — rely on:
    // 1. WebSocket events for new/taken deliveries (real-time)
    // 2. watchPosition for location-based refresh when driver moves 50+ meters

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [navigate]);

  const checkDeliveringMode = async () => {
    try {
      const token = localStorage.getItem("token");

      // Use proper driver location if available, otherwise use default coordinates
      const currentLoc = driverLocation || DEFAULT_DRIVER_LOCATION;

      const res = await fetch(
        `${API_URL}/driver/deliveries/pickups?driver_latitude=${currentLoc.latitude}&driver_longitude=${currentLoc.longitude}`,
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
          const activeRes = await fetch(`${API_URL}/driver/deliveries/active`, {
            headers: { Authorization: `Bearer ${token}` },
          });
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
      // Show skeleton on initial load (before first successful fetch)
      if (!hasCompletedFirstFetch) {
        setInitialLoading(true);
      } else if (isBackgroundRefresh) {
        setIsRefreshing(true);
      }

      const token = localStorage.getItem("token");
      const currentLoc = location || DEFAULT_DRIVER_LOCATION;

      const url = `${API_URL}/driver/deliveries/available/v2?driver_latitude=${currentLoc.latitude}&driver_longitude=${currentLoc.longitude}`;

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

      const deliveriesArray = data.available_deliveries || [];
      // Don't sort - we use CSS order property to visually move declined items
      setDeliveries(deliveriesArray);

      const newCurrentRoute = data.current_route || {
        total_stops: 0,
        active_deliveries: 0,
      };
      setCurrentRoute(newCurrentRoute);

      const newDriverLocation = data.driver_location || currentLoc;
      setDriverLocation(newDriverLocation);

      // Save to cache for instant load next time
      const snapshot = {
        deliveries: deliveriesArray,
        currentRoute: newCurrentRoute,
        driverLocation: newDriverLocation,
      };

      saveCacheData(snapshot);
      queryClient.setQueryData(deliveriesQueryKey, snapshot);

      // Clear any previous errors on successful fetch
      setFetchError(null);

      // Mark first fetch as complete
      setHasCompletedFirstFetch(true);
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

  // Store fetch function in ref so watchPosition callback can access it without circular dependency
  fetchPendingDeliveriesRef.current = fetchPendingDeliveriesWithLocation;

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
              tip_amount: parseFloat(delivery.pricing?.tip_amount || 0),
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
        `${API_URL}/driver/deliveries/${deliveryId}/accept`,
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
        // Show toast notification
        showToast("✅ Delivery accepted!");

        // IMPORTANT: Clear ALL deliveries immediately to prevent showing stale earnings data
        // The earnings for remaining deliveries need to be recalculated based on the new route
        setDeliveries([]);

        // Fetch updated deliveries with recalculated earnings based on new route context
        // The backend will recalculate extra_distance and extra_earnings for the new delivery_sequence
        setTimeout(async () => {
          await fetchPendingDeliveriesWithLocation(driverLocation, false);
        }, 500); // 500ms delay to ensure DB has updated before fetching
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

  // Handle decline - just add to declined set, use CSS order to move visually
  // This avoids re-ordering the array which causes Leaflet map container issues
  const handleDecline = (deliveryId) => {
    setDeclinedIds((prev) => new Set([...prev, deliveryId]));

    // Scroll to top to show next delivery
    if (deliveryListRefEl.current) {
      deliveryListRefEl.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Simple toast notification
  const showToast = (message, type = "success") => {
    if (type === "error") showError(message);
    else showSuccess(message);
  };

  return (
    <DriverLayout>
      <div
        className="bg-gray-50 flex flex-col"
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

        {/* 🚨 REAL-TIME NEW DELIVERY ALERT BANNER */}
        {showNewDeliveryBanner && newDeliveryAlert && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-green-500 to-emerald-600 text-white px-4 py-3 shadow-lg animate-pulse">
            <div className="max-w-4xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
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
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-bold text-sm">
                    🚨 New Delivery Available!
                  </p>
                  <p className="text-xs opacity-90">
                    {newDeliveryAlert.restaurant?.name || "Restaurant"} → Order
                    #{newDeliveryAlert.order_number}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowNewDeliveryBanner(false)}
                className="text-white/80 hover:text-white"
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
            </div>
          </div>
        )}

        {/* WebSocket Connection Status Indicator */}
        <div
          className={`fixed bottom-20 right-4 z-40 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg transition-all duration-300 ${
            isConnected
              ? "bg-green-100 text-green-700 border border-green-200"
              : "bg-red-100 text-red-700 border border-red-200"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`}
            ></div>
            {isConnected ? "Live" : "Offline"}
          </div>
        </div>

        <AnimatedAlert alert={alertState} visible={alertVisible} />

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
            <div className="flex-1 items-center text-center">
              <h1 className="text-lg text-center font-bold text-gray-900">
                New Delivery Request
              </h1>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                {deliveries.length} available
                {isRefreshing && (
                  <span className="inline-block w-3 h-3 border-2 border-green-500 border-t-transparent rounded-3xl animate-spin ml-1"></span>
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
        <PageWrapper
          isFetching={isRefreshing}
          dataKey={`available-${deliveries.length}`}
        >
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
            ) : initialLoading || !hasCompletedFirstFetch ? (
              <div className="p-4">
                <AdminSkeleton type="deliveries" />
              </div>
            ) : deliveries.length === 0 ? (
              <div className="p-6">
                {/* Active Deliveries Card - Show prominently if driver has active deliveries */}
                {currentRoute.active_deliveries > 0 && (
                  <div
                    onClick={() => navigate("/driver/deliveries/active")}
                    className="mb-6 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-6 text-white shadow-lg cursor-pointer active:scale-[0.98] transition-transform"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                          <span className="text-2xl">🚗</span>
                        </div>
                        <div>
                          <div className="text-sm font-medium opacity-90">
                            You have
                          </div>
                          <div className="text-2xl font-bold">
                            {currentRoute.active_deliveries} Active Deliver
                            {currentRoute.active_deliveries === 1 ? "y" : "ies"}
                          </div>
                        </div>
                      </div>
                      <span className="material-icons text-3xl">
                        arrow_forward
                      </span>
                    </div>
                    <div className="text-sm opacity-90 mt-2">
                      Tap to view and manage your active deliveries
                    </div>
                  </div>
                )}

                {/* No Available Deliveries Message */}
                <div className="text-center">
                  <div className="text-5xl mb-4">�</div>
                  <h3 className="text-lg font-bold text-gray-700 mb-2">
                    No Deliveries Near You
                  </h3>
                  <p className="text-sm text-gray-500 mb-6">
                    {currentRoute.active_deliveries >= 5
                      ? "You've reached the maximum of 5 deliveries. Complete some deliveries first."
                      : "No delivery requests available in your area right now. We'll notify you when new orders come in!"}
                  </p>
                  <button
                    onClick={() => {
                      fetchPendingDeliveriesWithLocation(driverLocation, false);
                    }}
                    className="px-6 py-2 bg-green-500 text-white rounded-full text-sm font-medium hover:bg-green-600 active:scale-95 transition-all"
                  >
                    🔄 Refresh
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col">
                {deliveries.map((delivery, index) => {
                  const isDeclined = declinedIds.has(delivery.delivery_id);
                  // Count non-declined items before this one to determine if it's "first"
                  const nonDeclinedBefore = deliveries
                    .slice(0, index)
                    .filter((d) => !declinedIds.has(d.delivery_id)).length;
                  const isFirstNonDeclined =
                    !isDeclined && nonDeclinedBefore === 0;

                  return (
                    <div
                      key={delivery.delivery_id}
                      style={{ order: isDeclined ? 1000 + index : index }}
                    >
                      <DeliveryCard
                        delivery={delivery}
                        driverLocation={driverLocation}
                        accepting={accepting === delivery.delivery_id}
                        onAccept={handleAcceptDelivery}
                        onDecline={handleDecline}
                        hasActiveDeliveries={currentRoute.total_stops > 0}
                        isLoaded={isLoaded}
                        isFirstDelivery={isFirstNonDeclined}
                        isDeclined={isDeclined}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </PageWrapper>

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
        @keyframes heartbeat {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.02); opacity: 0.9; }
        }
      `}</style>
      </div>
    </DriverLayout>
  );
}

// Skeleton Loading Card Component - Matches new design with optional heartbeat
function SkeletonCard({ withHeartbeat = false }) {
  const heartbeatStyle = withHeartbeat
    ? {
        animation: "heartbeat 1.2s ease-in-out infinite",
      }
    : {};

  return (
    <div className="bg-white overflow-hidden" style={heartbeatStyle}>
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
    base_amount = 0, // First: Driver-to-Restaurant earnings | Subsequent: R0 × Rs.40
    extra_earnings = 0, // First: Restaurant-to-Customer earnings | Subsequent: Extra × Rs.40
    bonus_amount = 0, // Rs.25 for 2nd, Rs.30 for 3rd+
    total_trip_earnings = 0, // Total earnings
    r0_distance_km = 0,
    r1_distance_km = 0,
    // First delivery specific fields
    is_first_delivery = false,
    driver_to_restaurant_km = 0,
    paid_driver_to_restaurant_km = 0,
    restaurant_to_customer_km = 0,
    driver_to_restaurant_earnings = 0,
    restaurant_to_customer_earnings = 0,
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
    // First delivery specific
    is_first_delivery,
    driver_to_restaurant_km,
    paid_driver_to_restaurant_km,
    restaurant_to_customer_km,
    driver_to_restaurant_earnings,
    restaurant_to_customer_earnings,
  });

  // Safety check for pricing - use total_trip_earnings for first delivery
  const driverEarnings =
    pricing?.total_trip_earnings || total_trip_earnings || 0;

  // Get tip amount from pricing (set by manager)
  const tipAmount = parseFloat(pricing?.tip_amount || 0);

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

  // DEBUG: Log route data to understand structure
  console.log("🗺️ Route Data Debug:", {
    order_number,
    driver_to_restaurant_route,
    restaurant_to_customer_route,
    hasDriverRoute: !!driver_to_restaurant_route,
    hasRestaurantRoute: !!restaurant_to_customer_route,
    driverRouteKeys: driver_to_restaurant_route
      ? Object.keys(driver_to_restaurant_route)
      : [],
    driverRouteCoords: driver_to_restaurant_route?.coordinates?.length || 0,
    restaurantRouteCoords:
      restaurant_to_customer_route?.coordinates?.length || 0,
  });

  // Prepare route paths for polylines
  // Handle both GeoJSON format (coordinates array) and encoded polyline format
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

  // Generate curved path points between two locations (for animated dashed line)
  const generateCurvedPath = useCallback((start, end, numPoints = 50) => {
    if (!start || !end) return [];

    const points = [];

    // Calculate midpoint
    const midLat = (start.lat + end.lat) / 2;
    const midLng = (start.lng + end.lng) / 2;

    // Calculate perpendicular offset for curve (arc height)
    const dx = end.lng - start.lng;
    const dy = end.lat - start.lat;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Curve offset (perpendicular to the line) - adjust multiplier for curve intensity
    const curveIntensity = distance * 0.25;
    const perpX = (-dy / distance) * curveIntensity;
    const perpY = (dx / distance) * curveIntensity;

    // Control point for quadratic bezier curve
    const controlPoint = {
      lat: midLat + perpY,
      lng: midLng + perpX,
    };

    // Generate points along quadratic bezier curve
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const oneMinusT = 1 - t;

      // Quadratic bezier formula: B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
      const lat =
        oneMinusT * oneMinusT * start.lat +
        2 * oneMinusT * t * controlPoint.lat +
        t * t * end.lat;
      const lng =
        oneMinusT * oneMinusT * start.lng +
        2 * oneMinusT * t * controlPoint.lng +
        t * t * end.lng;

      points.push([lat, lng]); // Leaflet format [lat, lng]
    }

    return points;
  }, []);

  // Generate curved paths for stacked deliveries (driver → restaurant → customer)
  // Also used as fallback for first delivery when backend doesn't provide polyline data
  const driverToRestaurantCurved = useMemo(() => {
    if (!driverLocation || !restaurant) return [];
    return generateCurvedPath(
      { lat: driverLocation.latitude, lng: driverLocation.longitude },
      { lat: restaurant.latitude, lng: restaurant.longitude },
    );
  }, [driverLocation, restaurant, generateCurvedPath]);

  const restaurantToCustomerCurved = useMemo(() => {
    if (!restaurant || !customer) return [];
    return generateCurvedPath(
      { lat: restaurant.latitude, lng: restaurant.longitude },
      { lat: customer.latitude, lng: customer.longitude },
    );
  }, [restaurant, customer, generateCurvedPath]);

  // 🆕 Show routes for ALL deliveries when driver has no active deliveries
  // When driver accepts first delivery, routes will be hidden for remaining available deliveries
  const showRoutes = !hasActiveDeliveries;

  // Is this a stacked delivery (2nd or more)?
  const isStackedDelivery = hasActiveDeliveries;

  // Check if we have actual polyline data from backend, otherwise use curved paths
  const hasPolylineData =
    driverToRestaurantPath.length > 0 || restaurantToCustomerPath.length > 0;

  return (
    <div
      className={`bg-white overflow-hidden transition-all duration-300 ${isDeclined ? "opacity-60 scale-[0.98]" : ""} ${!can_accept ? "border-2 border-red-200 opacity-75" : ""}`}
    >
      {/* Declined Badge */}
      {isDeclined && (
        <div className="bg-gray-100 px-4 py-2 flex items-center justify-between border-b border-gray-200">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-gray-500"
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
            <span className="text-sm text-gray-600 font-medium">
              Moved to bottom
            </span>
          </div>
          <span className="text-xs text-gray-500">
            Still available to accept
          </span>
        </div>
      )}

      {/* Map Section - Full Width */}
      <div className="relative w-full h-[40vh] min-h-[220px]">
        {restaurant && customer && isLoaded ? (
          <MapContainer
            center={[mapCenter.lat, mapCenter.lng]}
            zoom={13}
            style={mapContainerStyle}
            zoomControl={false}
            attributionControl={false}
          >
            <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />

            {/* Driver Marker - Motorcycle icon (black, no background) */}
            {driverLocation && (
              <Marker
                position={[driverLocation.latitude, driverLocation.longitude]}
                icon={driverSvgIcon}
                eventHandlers={{
                  click: () => setSelectedMarker("driver"),
                }}
              >
                {selectedMarker === "driver" && (
                  <Popup onClose={() => setSelectedMarker(null)}>
                    <div className="text-center p-1">
                      <p className="font-bold text-gray-800 text-sm">🛵 You</p>
                    </div>
                  </Popup>
                )}
              </Marker>
            )}

            {/* Restaurant Marker - Home/Store icon (black, no background) */}
            <Marker
              position={[restaurant.latitude, restaurant.longitude]}
              icon={restaurantHomeIcon}
              eventHandlers={{
                click: () => setSelectedMarker("restaurant"),
              }}
            >
              {selectedMarker === "restaurant" && (
                <Popup onClose={() => setSelectedMarker(null)}>
                  <div className="p-1">
                    <p className="font-bold text-sm">🍽️ {restaurant.name}</p>
                  </div>
                </Popup>
              )}
            </Marker>

            {/* Customer Marker - Location pin icon (black, no background) */}
            <Marker
              position={[customer?.latitude || 0, customer?.longitude || 0]}
              icon={customerSvgIcon}
              eventHandlers={{
                click: () => setSelectedMarker("customer"),
              }}
            >
              {selectedMarker === "customer" && (
                <Popup onClose={() => setSelectedMarker(null)}>
                  <div className="p-1">
                    <p className="font-bold text-sm">
                      📍 {customer?.name || "Customer"}
                    </p>
                  </div>
                </Popup>
              )}
            </Marker>

            {/* FIRST DELIVERY: Show actual polyline routes from OSRM if available */}
            {showRoutes &&
              hasPolylineData &&
              driverToRestaurantPath.length > 0 && (
                <Polyline
                  positions={driverToRestaurantPath.map((p) => [p.lat, p.lng])}
                  pathOptions={{
                    color: "#1a1a1a",
                    opacity: 0.9,
                    weight: 4,
                  }}
                />
              )}

            {showRoutes &&
              hasPolylineData &&
              restaurantToCustomerPath.length > 0 && (
                <Polyline
                  positions={restaurantToCustomerPath.map((p) => [
                    p.lat,
                    p.lng,
                  ])}
                  pathOptions={{
                    color: "#1a1a1a",
                    opacity: 0.7,
                    weight: 3,
                  }}
                />
              )}

            {/* FIRST DELIVERY FALLBACK: Use curved solid lines when no polyline data */}
            {showRoutes &&
              !hasPolylineData &&
              driverToRestaurantCurved.length > 0 && (
                <Polyline
                  positions={driverToRestaurantCurved}
                  pathOptions={{
                    color: "#1a1a1a",
                    opacity: 0.9,
                    weight: 4,
                  }}
                />
              )}

            {showRoutes &&
              !hasPolylineData &&
              restaurantToCustomerCurved.length > 0 && (
                <Polyline
                  positions={restaurantToCustomerCurved}
                  pathOptions={{
                    color: "#1a1a1a",
                    opacity: 0.7,
                    weight: 3,
                  }}
                />
              )}

            {/* STACKED DELIVERY (2nd+): Show animated curved dashed lines */}
            {isStackedDelivery && driverToRestaurantCurved.length > 0 && (
              <Polyline
                positions={driverToRestaurantCurved}
                pathOptions={{
                  color: "#1a1a1a",
                  weight: 4,
                  dashArray: "8, 12",
                  opacity: 0.85,
                  lineCap: "round",
                }}
              />
            )}

            {isStackedDelivery && restaurantToCustomerCurved.length > 0 && (
              <Polyline
                positions={restaurantToCustomerCurved}
                pathOptions={{
                  color: "#1a1a1a",
                  weight: 4,
                  dashArray: "8, 12",
                  opacity: 0.7,
                  lineCap: "round",
                }}
              />
            )}
          </MapContainer>
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            <div className="text-center">
              <div className="w-10 h-10 border-3 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-gray-500 text-sm">Loading map...</p>
            </div>
          </div>
        )}

        {/* Floating Decline Button - Only show if not already declined */}
        {/* z-[1000] ensures it's above Leaflet map layers */}
        {onDecline && !isDeclined && (
          <button
            onClick={() => onDecline(delivery_id)}
            className="absolute top-4 right-4 bg-white/95 backdrop-blur shadow-lg rounded-full px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 transition-all active:scale-95 z-[1000] flex items-center gap-1.5 border border-gray-200"
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
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            <span className="text-sm font-semibold">Decline</span>
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
            {/* Tip Amount Badge */}
            {tipAmount > 0 && (
              <div className="p-3 rounded-xl border-2 border-dashed border-yellow-400 bg-yellow-50 mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">💰</span>
                  <span className="text-gray-800 font-bold text-sm">
                    Manager Tip Included
                  </span>
                </div>
                <span className="text-yellow-600 font-bold text-lg">
                  +Rs.{tipAmount.toFixed(0)}
                </span>
              </div>
            )}

            {/* Bonus Amount Box - Only show if bonus exists */}
            {Number(bonus_amount || 0) > 0 && (
              <div className="p-3 rounded-xl border-2 border-dashed border-[#13ec37] bg-green-50 mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-gray-800 font-bold text-sm">
                    Bonus For This Delivery
                  </span>
                </div>
                <span className="text-[#13ec37] font-bold text-lg">
                  +Rs.{Number(bonus_amount).toFixed(2)}
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
          /* For FIRST delivery - Show earnings with detailed breakdown */
          <>
            {/* Tip Amount Badge */}
            {tipAmount > 0 && (
              <div className="p-3 rounded-xl border-2 border-dashed border-yellow-400 bg-yellow-50 mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">💰</span>
                  <span className="text-gray-800 font-bold text-sm">
                    Manager Tip Included
                  </span>
                </div>
                <span className="text-yellow-600 font-bold text-lg">
                  +Rs.{tipAmount.toFixed(0)}
                </span>
              </div>
            )}

            {/* Distance & Time Stats */}
            <div className="flex items-center justify-between mb-5 pb-5 my-4 border-b border-gray-100">
              <div>
                <p className="text-[#13ec37] text-3xl font-bold leading-tight">
                  Rs.{" "}
                  {Number(total_trip_earnings || driverEarnings || 0).toFixed(
                    2,
                  )}
                </p>
                <p className="text-black text-sm font-medium">Total Earnings</p>
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
                  {Number(
                    total_delivery_distance_km || r1_distance_km || 0,
                  ).toFixed(1)}{" "}
                  km
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
          </>
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
                <span className="text-black font-bold leading-snug">
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
