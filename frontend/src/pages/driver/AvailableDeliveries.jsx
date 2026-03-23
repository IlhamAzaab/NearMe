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
import { API_URL } from "../../config";
import { useSocket } from "../../context/SocketContext";
import DraggableMap, {
  MAP_ICONS,
  decodePolyline,
  generateCurvedPath,
} from "../../components/DraggableMap";
import "leaflet/dist/leaflet.css";
import "./AvailableDeliveries.css";
import AnimatedAlert, { useAlert } from "../../components/AnimatedAlert";
import {
  buildDriverActiveMapPath,
  cacheDriverActiveDeliveryId,
  resolveDriverActiveMapPath,
} from "../../utils/driverActiveDelivery";

// Fix Leaflet default marker icons (still needed for legacy)
import L from "leaflet";
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

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
  const queryClient = useQueryClient();
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const userId = localStorage.getItem("userId") || "default";
  const deliveriesQueryKey = ["driver", "available-deliveries", userId];

  // Socket connection for real-time notifications
  const {
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
  const [declinedIds, setDeclinedIds] = useState(new Set());
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
  const {
    alert: alertState,
    visible: alertVisible,
    showSuccess,
    showError,
  } = useAlert();

  const openActiveMap = useCallback(async () => {
    const path = await resolveDriverActiveMapPath({
      queryClient,
      token,
      userId,
    });
    navigate(path);
  }, [navigate, queryClient, token, userId]);
  const [fetchError, setFetchError] = useState(null); // Network error state
  const [showNewDeliveryBanner, setShowNewDeliveryBanner] = useState(false); // Real-time alert banner
  const abortControllerRef = useRef(null); // For cancelling pending requests
  const deliveryMetaRef = useRef(new Map());
  const arrivalSeqRef = useRef(0);
  const scrollContainerRef = useRef(null);
  const cardRefs = useRef(new Map());

  const syncDeliveryMeta = (incomingDeliveries) => {
    const meta = deliveryMetaRef.current;

    const idsInList = new Set();
    incomingDeliveries.forEach((delivery) => {
      const id = delivery.delivery_id;
      idsInList.add(id);

      const existing = meta.get(id);

      if (!existing) {
        meta.set(id, {
          // LCFS based on observed arrival sequence.
          priorityTs: ++arrivalSeqRef.current,
        });
      } else {
        meta.set(id, existing);
      }
    });

    for (const id of meta.keys()) {
      if (!idsInList.has(id)) {
        meta.delete(id);
      }
    }
  };

  // Keep state array stable for React-Leaflet; only sort visually at render time.
  const displayedDeliveries = useMemo(() => {
    const meta = deliveryMetaRef.current;
    const originalIndex = new Map(
      deliveries.map((delivery, index) => [delivery.delivery_id, index]),
    );

    return [...deliveries].sort((a, b) => {
      const aDeclined = declinedIds.has(a.delivery_id);
      const bDeclined = declinedIds.has(b.delivery_id);
      if (aDeclined !== bDeclined) return aDeclined ? 1 : -1;

      const priorityA = Number(meta.get(a.delivery_id)?.priorityTs || 0);
      const priorityB = Number(meta.get(b.delivery_id)?.priorityTs || 0);
      if (priorityA !== priorityB) return priorityB - priorityA;

      return (
        (originalIndex.get(a.delivery_id) || 0) -
        (originalIndex.get(b.delivery_id) || 0)
      );
    });
  }, [deliveries, declinedIds]);

  const displayOrderById = useMemo(() => {
    const orderMap = new Map();
    displayedDeliveries.forEach((delivery, index) => {
      orderMap.set(delivery.delivery_id, index);
    });
    return orderMap;
  }, [displayedDeliveries]);

  const displayedIds = useMemo(
    () => displayedDeliveries.map((d) => d.delivery_id),
    [displayedDeliveries],
  );

  const applyPrioritizedSort = (incomingDeliveries) => {
    syncDeliveryMeta(incomingDeliveries);
    return incomingDeliveries;
  };

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
    setDeliveries(applyPrioritizedSort(cachedQueryData.deliveries || []));
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

  // Socket connection is managed globally by DriverSocketConnector.

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
      setDeclinedIds((prev) => {
        const next = new Set(
          [...prev].filter((id) => !takenDeliveries.has(id)),
        );
        return next;
      });
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
              // Redirect directly to map page
              const activeMapPath = await resolveDriverActiveMapPath({
                queryClient,
                token,
                userId,
              });
              setTimeout(() => navigate(activeMapPath), 100);
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

      // Keep declined IDs only for deliveries still present after refresh.
      setDeclinedIds((prev) => {
        const availableIds = new Set(deliveriesArray.map((d) => d.delivery_id));
        return new Set([...prev].filter((id) => availableIds.has(id)));
      });

      // Sort with priority: non-declined first, higher tips first, newest first.
      setDeliveries(applyPrioritizedSort(deliveriesArray));

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
        cacheDriverActiveDeliveryId(queryClient, { userId, deliveryId });
        // Go straight to map page after accept (no Active Deliveries page hop).
        navigate(buildDriverActiveMapPath(deliveryId));
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

  // Simple toast notification
  const showToast = (message, type = "success") => {
    if (type === "error") showError(message);
    else showSuccess(message);
  };

  const handleDecline = (deliveryId, cardIndex) => {
    const orderedIds = displayedIds;
    const safeIndex =
      typeof cardIndex === "number" && cardIndex >= 0
        ? cardIndex
        : orderedIds.indexOf(deliveryId);
    const nextId =
      orderedIds[safeIndex + 1] || orderedIds[safeIndex - 1] || null;

    setDeclinedIds((prev) => {
      const next = new Set(prev);
      next.add(deliveryId);
      return next;
    });

    // Smoothly snap to the adjacent card for continuous browsing.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (nextId && cardRefs.current.has(nextId)) {
          const node = cardRefs.current.get(nextId);
          node?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }

        const container = scrollContainerRef.current;
        if (!container) return;
        const nextTop = Math.min(
          container.scrollTop + container.clientHeight,
          container.scrollHeight - container.clientHeight,
        );
        container.scrollTo({ top: nextTop, behavior: "smooth" });
      });
    });
  };

  return (
    <DriverLayout>
      <div
        className="bg-gray-100"
        style={{ fontFamily: "'Work Sans', sans-serif" }}
      >
        <div className="relative h-[calc(100vh-5rem)] overflow-hidden">
          <DriverRealtimeNotificationListener
            onNewDelivery={() => {
              if (driverLocation) {
                fetchPendingDeliveriesWithLocation(driverLocation, true);
              }
            }}
          />

          <AnimatedAlert alert={alertState} visible={alertVisible} />

          {inDeliveringMode ? (
            <div className="h-full flex items-center justify-center p-6 text-center">
              <div>
                <div className="text-5xl mb-4">🚗</div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">
                  Currently Delivering
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Complete current deliveries first
                </p>
                <button
                  onClick={openActiveMap}
                  className="px-6 py-3 bg-green-500 text-white rounded-full font-medium"
                >
                  Go to Map
                </button>
              </div>
            </div>
          ) : initialLoading || !hasCompletedFirstFetch ? (
            <SkeletonCard withHeartbeat />
          ) : deliveries.length === 0 ? (
            <div className="h-full flex flex-col">
              {/* Back button for empty state */}
              <button
                onClick={() => navigate(-1)}
                className="absolute top-4 left-4 w-10 h-10 bg-white/95 backdrop-blur shadow-lg rounded-full flex items-center justify-center z-50 active:scale-95 transition-all"
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

              <div className="flex-1 flex items-center justify-center p-6">
                <div className="text-center">
                  {/* Active Deliveries Card */}
                  {currentRoute.active_deliveries > 0 && (
                    <div
                      onClick={openActiveMap}
                      className="mb-6 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-6 text-white shadow-lg cursor-pointer active:scale-[0.98] transition-transform text-left"
                    >
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
                      <div className="text-sm opacity-90 mt-2">
                        Tap to open your live delivery map
                      </div>
                    </div>
                  )}

                  <div className="text-5xl mb-4">📭</div>
                  <h3 className="text-lg font-bold text-gray-700 mb-2">
                    No Deliveries Near You
                  </h3>
                  <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto">
                    {currentRoute.active_deliveries >= 5
                      ? "You've reached the maximum of 5 deliveries. Complete some deliveries first."
                      : "No delivery requests available in your area right now. We'll notify you when new orders come in!"}
                  </p>

                  <div className="flex items-center justify-center gap-3 flex-wrap">
                    <button
                      onClick={() =>
                        fetchPendingDeliveriesWithLocation(
                          driverLocation,
                          false,
                        )
                      }
                      className="px-6 py-2 bg-green-500 text-white rounded-full text-sm font-medium hover:bg-green-600 active:scale-95 transition-all"
                    >
                      Refresh
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div
              ref={scrollContainerRef}
              className="h-full overflow-y-auto snap-y snap-mandatory flex flex-col"
            >
              {deliveries.map((delivery, index) => (
                <div
                  key={delivery.delivery_id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(delivery.delivery_id, el);
                    else cardRefs.current.delete(delivery.delivery_id);
                  }}
                  style={{
                    order: displayOrderById.get(delivery.delivery_id) ?? index,
                  }}
                  className="relative h-[calc(100vh-5rem)] snap-start shrink-0"
                >
                  <DeliveryCard
                    delivery={delivery}
                    driverLocation={driverLocation}
                    accepting={accepting === delivery.delivery_id}
                    onAccept={handleAcceptDelivery}
                    onDecline={handleDecline}
                    onBack={() => navigate(-1)}
                    hasActiveDeliveries={currentRoute.total_stops > 0}
                    isLoaded={isLoaded}
                    isFirstDelivery={
                      (displayOrderById.get(delivery.delivery_id) ?? index) ===
                      0
                    }
                    cardIndex={
                      displayOrderById.get(delivery.delivery_id) ?? index
                    }
                    currentIndex={
                      (displayOrderById.get(delivery.delivery_id) ?? index) + 1
                    }
                    totalAvailable={
                      displayedDeliveries.length || deliveries.length
                    }
                  />
                </div>
              ))}
            </div>
          )}

          <style>{`
        @keyframes slide-down {
          from { opacity: 0; transform: translate(-50%, -20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        .animate-slide-down { animation: slide-down 0.3s ease-out; }
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
        @keyframes pulse-dot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.7; }
        }
        .animate-pulse-dot { animation: pulse-dot 1.5s ease-in-out infinite; }
      `}</style>
        </div>
      </div>
    </DriverLayout>
  );
}

// Skeleton Loading Card Component - Full-screen design
function SkeletonCard({ withHeartbeat = false }) {
  const heartbeatStyle = withHeartbeat
    ? { animation: "heartbeat 1.2s ease-in-out infinite" }
    : {};

  return (
    <div className="relative h-full w-full" style={heartbeatStyle}>
      {/* Full-screen Map Skeleton */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-200">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.4) 50%, transparent 75%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s infinite",
          }}
        ></div>
      </div>

      {/* Back Button Skeleton */}
      <div className="absolute top-4 left-4 w-10 h-10 bg-white/60 rounded-full z-50"></div>

      {/* Skip Button Skeleton */}
      <div className="absolute top-4 right-4 w-20 h-9 bg-white/60 rounded-full z-50"></div>

      {/* Content Card Skeleton - Overlapping from bottom */}
      <div className="absolute bottom-0 left-0 right-0 z-40">
        <div className="bg-white rounded-t-[28px] shadow-2xl px-5 pt-6 pb-8">
          {/* Earnings Skeleton */}
          <div className="text-center mb-4">
            <div
              className="w-32 h-10 bg-gray-200 rounded-lg mx-auto mb-2"
              style={{
                background:
                  "linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s infinite",
              }}
            ></div>
            <div className="w-24 h-4 bg-gray-200 rounded mx-auto"></div>
          </div>

          {/* Badges Skeleton */}
          <div className="flex justify-center gap-2 mb-4">
            <div className="w-28 h-7 bg-gray-100 rounded-full"></div>
            <div className="w-24 h-7 bg-green-100 rounded-full"></div>
            <div className="w-20 h-7 bg-gray-800/20 rounded-full"></div>
          </div>

          {/* Stats Skeleton */}
          <div className="flex justify-center gap-4 mb-5">
            <div className="w-20 h-6 bg-gray-100 rounded"></div>
            <div className="w-20 h-6 bg-gray-100 rounded"></div>
          </div>

          {/* Timeline Skeleton */}
          <div className="flex flex-col gap-0 mb-4">
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 bg-green-200 rounded-full"></div>
                <div className="w-0.5 bg-gray-200 flex-1 min-h-[40px]"></div>
              </div>
              <div className="flex-1 pb-3 space-y-2">
                <div className="w-12 h-3 bg-green-100 rounded"></div>
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
            <div className="flex gap-3">
              <div className="w-3 h-3 bg-gray-200 rounded-full"></div>
              <div className="flex-1 space-y-2">
                <div className="w-16 h-3 bg-gray-100 rounded"></div>
                <div className="w-32 h-5 bg-gray-200 rounded"></div>
                <div className="w-44 h-4 bg-gray-100 rounded"></div>
              </div>
            </div>
          </div>

          {/* Order Number Skeleton */}
          <div className="w-32 h-4 bg-gray-100 rounded mb-4"></div>

          {/* Button Skeleton */}
          <div className="flex items-center gap-3">
            <div
              className="flex-1 h-14 rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, #bbf7d0 25%, #86efac 50%, #bbf7d0 75%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s infinite",
              }}
            ></div>
            <div className="w-16 h-10 bg-gray-100 rounded-full"></div>
          </div>
        </div>
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
  onBack,
  hasActiveDeliveries,
  isLoaded = false,
  isFirstDelivery = false,
  cardIndex = 0,
  currentIndex = 1,
  totalAvailable = 1,
}) {
  const rawDeliveryLocation = delivery?.delivery || {};

  const {
    delivery_id,
    order_number,
    restaurant,
    customer,
    pricing,
    distance_km,
    estimated_time_minutes,
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
    base_amount = 0,
    extra_earnings = 0,
    bonus_amount = 0,
    total_trip_earnings = 0,
    r0_distance_km = 0,
    r1_distance_km = 0,
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

  // Get tip amount from pricing (set by manager)
  const tipAmount = parseFloat(pricing?.tip_amount || 0);

  // Is this a stacked delivery (2nd or more)?
  const isStackedDelivery = hasActiveDeliveries;

  // Calculate earnings based on delivery type
  // For 1st delivery: total = base_earnings + tip
  // For 2nd+ delivery: total = extra_earnings + bonus_amount + tip
  const baseEarnings = Number(
    base_amount || total_trip_earnings || pricing?.total_trip_earnings || 0,
  );
  const extraEarnings = Number(extra_earnings || 0);
  const bonusAmt = Number(bonus_amount || 0);

  const totalEarnings = isStackedDelivery
    ? extraEarnings + bonusAmt + tipAmount
    : baseEarnings + tipAmount;

  const toNumberOrNull = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const toLatLngFromCoordinates = (coordinates) => {
    if (!Array.isArray(coordinates)) return [];
    return coordinates
      .filter(
        (coord) =>
          Array.isArray(coord) &&
          coord.length >= 2 &&
          Number.isFinite(Number(coord[1])) &&
          Number.isFinite(Number(coord[0])),
      )
      .map((coord) => [Number(coord[1]), Number(coord[0])]);
  };

  const getRoutePath = (route) => {
    if (route?.encoded_polyline) {
      return decodePolyline(route.encoded_polyline);
    }
    if (route?.coordinates) {
      return toLatLngFromCoordinates(route.coordinates);
    }
    return [];
  };

  const driverToRestaurantPath = getRoutePath(driver_to_restaurant_route);
  const restaurantToCustomerPath = getRoutePath(restaurant_to_customer_route);

  const restaurantCoords = {
    lat: toNumberOrNull(restaurant?.latitude),
    lng: toNumberOrNull(restaurant?.longitude),
  };

  const customerFallbackFromRoute =
    restaurantToCustomerPath.length > 0
      ? restaurantToCustomerPath[restaurantToCustomerPath.length - 1]
      : driverToRestaurantPath.length > 0
        ? driverToRestaurantPath[driverToRestaurantPath.length - 1]
        : null;

  const customerCoords = {
    lat:
      toNumberOrNull(customer?.latitude) ??
      toNumberOrNull(rawDeliveryLocation?.latitude) ??
      (customerFallbackFromRoute ? customerFallbackFromRoute[0] : null),
    lng:
      toNumberOrNull(customer?.longitude) ??
      toNumberOrNull(rawDeliveryLocation?.longitude) ??
      (customerFallbackFromRoute ? customerFallbackFromRoute[1] : null),
  };

  const safeDriverCoords = {
    lat: toNumberOrNull(driverLocation?.latitude),
    lng: toNumberOrNull(driverLocation?.longitude),
  };

  // Prepare markers for DraggableMap
  const mapMarkers = useMemo(() => {
    const markers = [];

    if (safeDriverCoords.lat != null && safeDriverCoords.lng != null) {
      markers.push({
        id: "driver",
        lat: safeDriverCoords.lat,
        lng: safeDriverCoords.lng,
        icon: MAP_ICONS.driver,
        popup: <span className="font-bold">🛵 You</span>,
      });
    }

    if (restaurantCoords.lat != null && restaurantCoords.lng != null) {
      markers.push({
        id: "restaurant",
        lat: restaurantCoords.lat,
        lng: restaurantCoords.lng,
        icon: MAP_ICONS.restaurant,
        popup: <span className="font-bold">🍽️ {restaurant.name}</span>,
      });
    }

    if (customerCoords.lat != null && customerCoords.lng != null) {
      markers.push({
        id: "customer",
        lat: customerCoords.lat,
        lng: customerCoords.lng,
        icon: MAP_ICONS.customer,
        popup: (
          <span className="font-bold">📍 {customer?.name || "Customer"}</span>
        ),
      });
    }

    return markers;
  }, [
    safeDriverCoords,
    restaurant,
    restaurantCoords,
    customer,
    customerCoords,
  ]);

  // Prepare polylines for DraggableMap
  const mapPolylines = useMemo(() => {
    const lines = [];

    // Generate curved paths as fallback
    const driverToRestaurantCurved =
      safeDriverCoords.lat != null &&
      safeDriverCoords.lng != null &&
      restaurantCoords.lat != null &&
      restaurantCoords.lng != null
        ? generateCurvedPath(
            { lat: safeDriverCoords.lat, lng: safeDriverCoords.lng },
            { lat: restaurantCoords.lat, lng: restaurantCoords.lng },
          )
        : [];

    const restaurantToCustomerCurved =
      restaurantCoords.lat != null &&
      restaurantCoords.lng != null &&
      customerCoords.lat != null &&
      customerCoords.lng != null
        ? generateCurvedPath(
            { lat: restaurantCoords.lat, lng: restaurantCoords.lng },
            { lat: customerCoords.lat, lng: customerCoords.lng },
          )
        : [];

    const hasPolylineData =
      driverToRestaurantPath.length > 0 || restaurantToCustomerPath.length > 0;

    if (!isStackedDelivery) {
      // First delivery - solid lines
      if (hasPolylineData) {
        if (driverToRestaurantPath.length > 0) {
          lines.push({
            id: "driver-to-restaurant",
            positions: driverToRestaurantPath,
            color: "#1a1a1a",
            weight: 4,
            opacity: 0.9,
          });
        }
        if (restaurantToCustomerPath.length > 0) {
          lines.push({
            id: "restaurant-to-customer",
            positions: restaurantToCustomerPath,
            color: "#1a1a1a",
            weight: 3,
            opacity: 0.7,
          });
        }
      } else {
        // Fallback curved paths
        if (driverToRestaurantCurved.length > 0) {
          lines.push({
            id: "driver-to-restaurant-curved",
            positions: driverToRestaurantCurved,
            color: "#1a1a1a",
            weight: 4,
            opacity: 0.9,
          });
        }
        if (restaurantToCustomerCurved.length > 0) {
          lines.push({
            id: "restaurant-to-customer-curved",
            positions: restaurantToCustomerCurved,
            color: "#1a1a1a",
            weight: 3,
            opacity: 0.7,
          });
        }
      }
    } else {
      // Stacked delivery - dashed lines
      if (driverToRestaurantCurved.length > 0) {
        lines.push({
          id: "driver-to-restaurant-stacked",
          positions: driverToRestaurantCurved,
          color: "#1a1a1a",
          weight: 4,
          opacity: 0.85,
          dashArray: "8, 12",
        });
      }
      if (restaurantToCustomerCurved.length > 0) {
        lines.push({
          id: "restaurant-to-customer-stacked",
          positions: restaurantToCustomerCurved,
          color: "#1a1a1a",
          weight: 4,
          opacity: 0.7,
          dashArray: "8, 12",
        });
      }
    }

    return lines;
  }, [
    safeDriverCoords,
    restaurantCoords,
    customerCoords,
    driverToRestaurantPath,
    restaurantToCustomerPath,
    isStackedDelivery,
  ]);

  const hasMapContent = mapMarkers.length > 0 || mapPolylines.length > 0;

  return (
    <div className="relative h-full w-full flex flex-col overflow-hidden">
      {/* Full-screen Map Background - z-0 to stay behind card */}
      <div className="absolute inset-0 z-0">
        {hasMapContent && isLoaded ? (
          <DraggableMap
            markers={mapMarkers}
            polylines={mapPolylines}
            height="100%"
            draggable={true}
            zoomControl={false}
            fitBounds={true}
            paddingTopLeft={[40, 40]}
            paddingBottomRight={[40, 320]}
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 border-3 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-gray-500 text-sm">Loading map...</p>
            </div>
          </div>
        )}
      </div>

      {/* Floating Back Button - Top Left */}
      {onBack && (
        <button
          onClick={onBack}
          className="absolute top-4 left-4 w-10 h-10 bg-white/95 backdrop-blur shadow-lg rounded-full flex items-center justify-center z-[1000] active:scale-95 transition-all"
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
      )}

      {onDecline && (
        <button
          onClick={() => onDecline(delivery_id, cardIndex)}
          className="absolute top-4 right-4 bg-white/95 backdrop-blur shadow-lg rounded-full px-4 py-2 text-gray-700 hover:text-red-600 hover:bg-red-50 transition-all active:scale-95 z-[1000] flex items-center gap-2"
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          <span className="text-sm font-semibold">Decline</span>
        </button>
      )}

      {/* Delivery Details Card - Overlapping from Bottom - z-[999] to stay above map */}
      <div className="absolute bottom-0 left-0 right-0 z-[999]">
        <div className="bg-white rounded-t-[28px] shadow-[0_-10px_40px_rgba(0,0,0,0.15)] px-5 pt-6 pb-8 max-h-[65vh] overflow-y-auto">
          {/* Cannot Accept Warning */}
          {!can_accept && reason && (
            <div className="bg-red-50 rounded-xl p-3 border border-red-200 mb-4">
              <p className="text-sm text-red-700 font-semibold flex items-center gap-2">
                <span>⚠️</span> {reason}
              </p>
            </div>
          )}

          {/* TOTAL EARNINGS - Large Display */}
          <div className="text-center mb-4">
            <p className="text-[#13ec37] text-4xl font-extrabold leading-tight">
              Rs. {totalEarnings.toFixed(2)}
            </p>
            <p className="text-gray-600 text-sm font-semibold mt-1">
              Total Earnings
            </p>
          </div>

          {/* Earnings Breakdown - Small pills below total */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
            {isStackedDelivery ? (
              <>
                <span className="px-3 py-1.5 bg-gray-100 rounded-full text-xs font-semibold text-gray-700">
                  Delivery: Rs.{extraEarnings.toFixed(0)}
                </span>
                {bonusAmt > 0 && (
                  <span className="px-3 py-1.5 bg-[#13ec37] rounded-full text-xs font-bold text-white">
                    Bonus: Rs.{bonusAmt.toFixed(0)}
                  </span>
                )}
                {tipAmount > 0 && (
                  <span className="px-3 py-1.5 bg-black rounded-full text-xs font-bold text-white">
                    Tip: Rs.{tipAmount.toFixed(0)}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="px-3 py-1.5 bg-gray-100 rounded-full text-xs font-semibold text-gray-700">
                  Delivery: Rs.{baseEarnings.toFixed(0)}
                </span>
                {bonusAmt > 0 && (
                  <span className="px-3 py-1.5 bg-[#13ec37] rounded-full text-xs font-bold text-white">
                    Bonus: Rs.{bonusAmt.toFixed(0)}
                  </span>
                )}
                {tipAmount > 0 && (
                  <span className="px-3 py-1.5 bg-black rounded-full text-xs font-bold text-white">
                    Tip: Rs.{tipAmount.toFixed(0)}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Distance & Time Stats */}
          <div className="flex items-center justify-center gap-4 mb-5">
            <div className="flex items-center gap-1.5 text-gray-700 font-medium">
              <svg
                className="w-5 h-5 text-gray-400"
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
              <span>
                {isStackedDelivery ? "+" : ""}
                {Number(
                  isStackedDelivery
                    ? extra_distance_km
                    : total_delivery_distance_km || r1_distance_km || 0,
                ).toFixed(1)}{" "}
                km
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-700 font-medium">
              <svg
                className="w-5 h-5 text-gray-400"
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
              <span>
                {isStackedDelivery ? "+" : ""}
                {Number(
                  isStackedDelivery
                    ? extra_time_minutes
                    : estimated_time_minutes || 0,
                ).toFixed(0)}{" "}
                mins
              </span>
            </div>
          </div>

          {/* Route Details - Timeline */}
          <div className="flex flex-col gap-0 mb-4">
            {/* Pickup */}
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 bg-[#13ec37] rounded-full"></div>
                <div className="w-0.5 bg-gray-300 flex-1 min-h-[40px]"></div>
              </div>
              <div className="flex-1 pb-3 -mt-1">
                <p className="text-[#13ec37] text-[10px] font-bold uppercase tracking-wider">
                  PICKUP
                </p>
                <p className="text-gray-900 font-semibold text-sm">
                  {restaurant?.name}
                </p>
                <p className="text-gray-500 text-xs">{restaurant?.address}</p>
              </div>
            </div>

            {/* Drop-off */}
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
              </div>
              <div className="flex-1 -mt-1">
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">
                  DROP-OFF
                </p>
                <p className="text-gray-900 font-semibold text-sm">
                  {customer?.name || "Customer"}
                </p>
                <p className="text-gray-500 text-xs">
                  {customer?.address || "No address"}
                </p>
              </div>
            </div>
          </div>

          {/* Order Number + Position */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <p className="text-gray-400 text-xs">#{order_number}</p>
            <p className="text-gray-500 text-xs font-semibold">
              {currentIndex} of {Math.max(1, totalAvailable)}
            </p>
          </div>

          {/* Accept Button with Live Indicator */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => onAccept(delivery_id)}
              disabled={accepting || !can_accept}
              className={`flex-1 py-4 rounded-full font-bold text-base transition-all flex items-center justify-center gap-2 ${
                !can_accept
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : accepting
                    ? "bg-[#13ec37]/70 text-gray-900 cursor-not-allowed"
                    : "bg-[#13ec37] text-gray-900 hover:bg-[#10d632] active:scale-[0.98]"
              }`}
            >
              {accepting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-900 border-t-transparent"></div>
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

            {/* Live Indicator */}
            <div className="flex items-center gap-1.5 bg-gray-100 px-3 py-2 rounded-full">
              <div className="w-2.5 h-2.5 bg-[#13ec37] rounded-full animate-pulse-dot"></div>
              <span className="text-xs font-semibold text-gray-700">Live</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
