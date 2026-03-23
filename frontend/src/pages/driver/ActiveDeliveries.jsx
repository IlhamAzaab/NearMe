import React, { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import DriverLayout from "../../components/DriverLayout";
import AdminSkeleton from "../../components/AdminSkeleton";
import PageWrapper from "../../components/PageWrapper";
import AnimatedAlert, { useAlert } from "../../components/AnimatedAlert";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { API_URL } from "../../config";

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
const createCircleIcon = (color, borderColor = "#ffffff", scale = 10) => {
  const size = scale * 2;
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      width: ${size}px;
      height: ${size}px;
      background-color: ${color};
      border: 3px solid ${borderColor};
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
};

// ============================================================================
// NAVIGATION ARROW ICON - Consistent with DriverMapPage
// ============================================================================
const createNavigationArrowIcon = (heading = 0) => {
  const arrowSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
      <defs>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.3"/>
        </filter>
      </defs>
      <g transform="rotate(${heading}, 20, 20)" filter="url(#shadow)">
        <polygon points="20,4 32,32 20,26 8,32" fill="#2563eb" stroke="#1d4ed8" stroke-width="2"/>
      </g>
      <circle cx="20" cy="20" r="4" fill="white" stroke="#2563eb" stroke-width="2"/>
    </svg>
  `;

  return L.divIcon({
    className: "navigation-arrow-marker",
    html: arrowSvg,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
};

// ============================================================================
// CLEAN CIRCLE ICONS - Consistent with DriverMapPage
// ============================================================================
const createCleanCircleIcon = (color, emoji = "", size = 36) => {
  const innerSize = size - 8;
  return L.divIcon({
    className: "clean-marker",
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          width: ${innerSize}px;
          height: ${innerSize}px;
          background: ${color};
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 3px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
        ">${emoji}</div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
};

// Labeled marker icons for multi-stop routes
const createLabeledIcon = (color, label, scale = 15) => {
  const size = scale * 2;
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      width: ${size}px;
      height: ${size}px;
      background-color: ${color};
      border: 3px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      font-weight: bold;
      font-size: 12px;
    ">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
};

// OpenStreetMap tile URL
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// Cache keys for instant loading
const CACHE_KEY_ACTIVE = "active_deliveries_cache";
const CACHE_KEY_PREVIEWED = "active_deliveries_previewed"; // Tracks which delivery batches have been previewed
const CACHE_EXPIRY = 30000; // 30 seconds cache for active deliveries (needs fresher data)

// Load cached data
const loadCachedData = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEY_ACTIVE);
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
      CACHE_KEY_ACTIVE,
      JSON.stringify({
        data,
        timestamp: Date.now(),
      }),
    );
  } catch (e) {
    console.warn("Cache save error:", e);
  }
};

// ============================================================================
// SHOW-ONCE-PER-BATCH: Track which delivery sets have been previewed
// ============================================================================

// Get the set of delivery IDs that have been previewed (shown full map preview)
const getPreviewedDeliveryIds = () => {
  try {
    const stored = localStorage.getItem(CACHE_KEY_PREVIEWED);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch (e) {
    console.warn("Previewed IDs load error:", e);
  }
  return new Set();
};

// Mark delivery IDs as previewed (after user presses "Start Delivering")
const markDeliveriesAsPreviewed = (deliveryIds) => {
  try {
    const current = getPreviewedDeliveryIds();
    deliveryIds.forEach((id) => current.add(id));
    // Keep only last 50 IDs to prevent localStorage bloat
    const arr = Array.from(current).slice(-50);
    localStorage.setItem(CACHE_KEY_PREVIEWED, JSON.stringify(arr));
    console.log("[PREVIEW] Marked deliveries as previewed:", deliveryIds);
  } catch (e) {
    console.warn("Previewed IDs save error:", e);
  }
};

// Check if there are any NEW deliveries that haven't been previewed
const hasNewUnpreviewedDeliveries = (deliveryIds) => {
  const previewed = getPreviewedDeliveryIds();
  const newIds = deliveryIds.filter((id) => !previewed.has(id));
  console.log(
    `[PREVIEW] Checking: ${deliveryIds.length} total, ${newIds.length} new unpreviewed`,
  );
  return newIds.length > 0;
};

// Leaflet container style
const mapContainerStyle = {
  width: "100%",
  height: "100%",
};

// Minimum movement threshold
const MOVEMENT_THRESHOLD_METERS = 10;
const FETCH_MOVEMENT_THRESHOLD_METERS = 100; // Only re-fetch data when moved 100m+

function getDistanceMeters(lat1, lng1, lat2, lng2) {
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
}

export default function ActiveDeliveries() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const userId = localStorage.getItem("userId") || "default";
  const activeQueryKey = ["driver", "active-deliveries", userId];
  const { alert: alertState, visible: alertVisible, showError } = useAlert();

  // Initialize with cached data for instant display
  const cachedData = loadCachedData();
  const cachedQueryData = queryClient.getQueryData(activeQueryKey);
  const initialSnapshot = cachedQueryData || cachedData;
  const [pickups, setPickups] = useState(initialSnapshot?.pickups || []);
  const [initialLoading, setInitialLoading] = useState(() => !initialSnapshot); // Only skeleton on first load
  const [isRefreshing, setIsRefreshing] = useState(false); // Background refresh indicator
  const [fetchError, setFetchError] = useState(null); // Track fetch errors
  const [hasFetchedSuccessfully, setHasFetchedSuccessfully] =
    useState(!!initialSnapshot); // Track if we've had a successful fetch
  const [driverLocation, setDriverLocation] = useState(
    initialSnapshot?.driverLocation || null,
  );
  const [mode, setMode] = useState(initialSnapshot?.mode || "pickup"); // pickup | deliver
  const [deliveries, setDeliveries] = useState(
    initialSnapshot?.deliveries || [],
  );
  const [fullRouteData, setFullRouteData] = useState(
    initialSnapshot?.fullRouteData || null,
  ); // Store full route for developer view

  // ============================================================================
  // SHOW-ONCE-PER-BATCH: Preview mode state
  // ============================================================================
  // When true, show full route preview with "Start Delivering" button
  // When false, auto-navigate to DriverMapPage
  const [showPreviewMode, setShowPreviewMode] = useState(false);

  // Handler for "Start Delivering" button - marks deliveries as previewed and navigates
  const handleStartDelivering = useCallback(() => {
    // Get all current delivery IDs
    const currentDeliveryIds = [
      ...pickups.map((p) => p.delivery_id),
      ...deliveries.map((d) => d.delivery_id),
    ];

    // Mark them as previewed so next visit goes straight to map
    if (currentDeliveryIds.length > 0) {
      markDeliveriesAsPreviewed(currentDeliveryIds);
    }

    // Navigate to first delivery's map page
    const firstDeliveryId =
      pickups[0]?.delivery_id || deliveries[0]?.delivery_id;
    if (firstDeliveryId) {
      navigate(`/driver/delivery/active/${firstDeliveryId}/map`);
    }
  }, [pickups, deliveries, navigate]);

  useQuery({
    queryKey: activeQueryKey,
    enabled: !!token && role === "driver",
    staleTime: 30 * 1000,
    queryFn: async () => {
      const snapshot = loadCachedData();
      return snapshot || null;
    },
  });

  useEffect(() => {
    if (!cachedQueryData) return;
    setPickups(cachedQueryData.pickups || []);
    setDeliveries(cachedQueryData.deliveries || []);
    setMode(cachedQueryData.mode || "pickup");
    setDriverLocation(cachedQueryData.driverLocation || null);
    setFullRouteData(cachedQueryData.fullRouteData || null);
    setHasFetchedSuccessfully(true);
    setInitialLoading(false);
  }, [cachedQueryData]);

  // Leaflet is always loaded (no API key needed)
  const isLoaded = true;

  // Refs for location tracking
  const watchIdRef = useRef(null);
  const lastLocationRef = useRef(null);
  const lastFetchLocationRef = useRef(null);
  const isFetchingRef = useRef(false);
  const hasFetchedInitialRef = useRef(false);

  // Function to fetch with current location (used for action-triggered refresh)
  const fetchWithLocation = useCallback(
    (isBackgroundRefresh = false) => {
      if (isFetchingRef.current && isBackgroundRefresh) return; // Skip if already fetching

      const location = lastLocationRef.current || driverLocation;
      if (location) {
        fetchPickups(location, isBackgroundRefresh);
      } else if (!isBackgroundRefresh) {
        // No location yet — try to get one
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const loc = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              };
              lastLocationRef.current = loc;
              setDriverLocation(loc);
              fetchPickups(loc, isBackgroundRefresh);
            },
            (error) => {
              console.error("Error getting location:", error);
              fetchPickups(driverLocation);
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
          );
        } else {
          fetchPickups(driverLocation);
        }
      }
    },
    [driverLocation],
  );

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "driver") {
      navigate("/login");
      return;
    }

    // Initial fetch
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          lastLocationRef.current = loc;
          lastFetchLocationRef.current = loc;
          setDriverLocation(loc);
          fetchPickups(loc, false);
          hasFetchedInitialRef.current = true;
        },
        (error) => {
          console.error("Error getting initial location:", error);
          if (driverLocation) fetchPickups(driverLocation, false);
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
      );
    }

    // watchPosition fires only when the device detects real movement
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const newLoc = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        const prev = lastLocationRef.current;
        if (!prev) {
          lastLocationRef.current = newLoc;
          lastFetchLocationRef.current = newLoc;
          setDriverLocation(newLoc);
          if (!hasFetchedInitialRef.current) {
            hasFetchedInitialRef.current = true;
            fetchPickups(newLoc, false);
          }
          return;
        }

        const moved = getDistanceMeters(
          prev.latitude,
          prev.longitude,
          newLoc.latitude,
          newLoc.longitude,
        );

        if (moved >= MOVEMENT_THRESHOLD_METERS) {
          lastLocationRef.current = newLoc;
          setDriverLocation(newLoc);

          // Refresh data when driver has moved 100+ meters since last fetch
          const movedSinceFetch = lastFetchLocationRef.current
            ? getDistanceMeters(
                lastFetchLocationRef.current.latitude,
                lastFetchLocationRef.current.longitude,
                newLoc.latitude,
                newLoc.longitude,
              )
            : Infinity;

          if (movedSinceFetch >= FETCH_MOVEMENT_THRESHOLD_METERS) {
            console.log(
              `[LOCATION] Moved ${movedSinceFetch.toFixed(0)}m since last fetch → refreshing data`,
            );
            lastFetchLocationRef.current = newLoc;
            fetchPickups(newLoc, true);
          }
        }
        // else: no significant movement — do nothing
      },
      (error) => console.error("Location watch error:", error),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );

    // NO periodic intervals — data refreshes only on movement or user actions

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [navigate]);

  const fetchPickups = async (location, isBackgroundRefresh = false) => {
    try {
      const token = localStorage.getItem("token");

      if (!location) {
        // Even without location, check if there are any active deliveries
        // using the simpler endpoint that doesn't need coordinates
        try {
          const fallbackRes = await fetch(
            `${API_URL}/driver/deliveries/active`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            const activeList = fallbackData.deliveries || [];
            if (activeList.length > 0) {
              // Has active deliveries — check if they've been previewed
              const deliveryIds = activeList.map((d) => d.id);
              const hasNewDeliveries = hasNewUnpreviewedDeliveries(deliveryIds);

              if (hasNewDeliveries) {
                // New deliveries! Show preview (will be filled when location available)
                console.log(
                  "[PREVIEW] New unpreviewed deliveries (no location) - showing preview",
                );
                setShowPreviewMode(true);
                setInitialLoading(false);
              } else {
                // All deliveries already previewed - go straight to map
                console.log(
                  "[PREVIEW] All deliveries already previewed - navigating to map",
                );
                navigate(`/driver/delivery/active/${activeList[0].id}/map`);
              }
              return;
            }
          }
        } catch (e) {
          console.error("Fallback active check error:", e);
        }
        setInitialLoading(false);
        return;
      }

      // Only show skeleton on initial load when no cached data
      if (
        !isBackgroundRefresh &&
        pickups.length === 0 &&
        deliveries.length === 0
      ) {
        setInitialLoading(true);
      } else {
        setIsRefreshing(true);
      }

      // Clear previous error on new fetch attempt
      if (!isBackgroundRefresh) {
        setFetchError(null);
      }

      const url = `${API_URL}/driver/deliveries/pickups?driver_latitude=${location.latitude}&driver_longitude=${location.longitude}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (res.ok) {
        setHasFetchedSuccessfully(true);
        setFetchError(null);
        const list = data.pickups || [];
        setPickups(list);
        const pickupSnapshot = {
          pickups: list,
          deliveries: [],
          mode: "pickup",
          driverLocation: location,
          fullRouteData,
        };
        saveCacheData(pickupSnapshot);
        queryClient.setQueryData(activeQueryKey, pickupSnapshot);

        if (list.length > 0) {
          // Has pickups — check if this is a new batch that needs preview
          if (!isBackgroundRefresh) {
            const deliveryIds = list.map((p) => p.delivery_id);
            const hasNewDeliveries = hasNewUnpreviewedDeliveries(deliveryIds);

            if (hasNewDeliveries) {
              // New deliveries! Show full route preview
              console.log(
                "[PREVIEW] New unpreviewed deliveries detected - showing preview",
              );
              setShowPreviewMode(true);
              // Fetch full route for the preview map
              await fetchFullRoute(location, list);
            } else {
              // All deliveries already previewed - go straight to map
              console.log(
                "[PREVIEW] All deliveries already previewed - navigating to map",
              );
              navigate(`/driver/delivery/active/${list[0].delivery_id}/map`);
              return;
            }
          }
        } else {
          // No pickups left → check for deliveries to deliver
          await fetchDeliveriesRoute(location, isBackgroundRefresh);
        }
      } else {
        console.error("Failed to fetch pickups:", data.message);
        // Only set error if not a background refresh and no cached data
        if (!isBackgroundRefresh && !hasFetchedSuccessfully) {
          setFetchError(
            `Failed to load pickups: ${data.message || "Server error"}`,
          );
        }
      }
    } catch (e) {
      console.error("Fetch pickups error:", e);
      // Only set error if not a background refresh and no cached data
      if (!isBackgroundRefresh && !hasFetchedSuccessfully) {
        setFetchError(
          `Network error: ${e.message || "Unable to connect to server"}`,
        );
      }
    } finally {
      setInitialLoading(false);
      setIsRefreshing(false);
    }
  };

  // Fetch full route for developer overview (Driver → All Restaurants → All Customers)
  const fetchFullRoute = async (location, pickupsList) => {
    try {
      const token = localStorage.getItem("token");
      const url = `${API_URL}/driver/deliveries/full-route?driver_latitude=${location.latitude}&driver_longitude=${location.longitude}`;

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

  // Build route data from deliveries (for deliver mode) when full-route endpoint isn't available
  const buildRouteFromDeliveries = (location, deliveriesList) => {
    // In deliver mode, restaurants are empty (already picked up)
    const customers = deliveriesList.map((d, idx) => ({
      id: d.delivery_id,
      order_number: d.order_number,
      lat: d.customer?.latitude || d.delivery_latitude,
      lng: d.customer?.longitude || d.delivery_longitude,
      name: d.customer?.name || d.customer_name,
      address: d.customer?.address || d.delivery_address,
      label: `C${idx + 1}`,
    }));

    setFullRouteData({
      driver_location: location,
      restaurants: [], // Already picked up
      customers,
      total_deliveries: deliveriesList.length,
    });
  };

  const fetchDeliveriesRoute = async (
    location,
    isBackgroundRefresh = false,
  ) => {
    try {
      const token = localStorage.getItem("token");
      const url = `${API_URL}/driver/deliveries/deliveries-route?driver_latitude=${location.latitude}&driver_longitude=${location.longitude}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setHasFetchedSuccessfully(true);
        setFetchError(null);
        const list = data.deliveries || [];
        setDeliveries(list);
        setMode("deliver");
        setPickups([]);

        // Has deliveries to deliver — check if this is a new batch that needs preview
        if (list.length > 0 && !isBackgroundRefresh) {
          const deliveryIds = list.map((d) => d.delivery_id);
          const hasNewDeliveries = hasNewUnpreviewedDeliveries(deliveryIds);

          if (hasNewDeliveries) {
            // New deliveries! Show full route preview
            console.log(
              "[PREVIEW] New unpreviewed deliveries detected - showing preview",
            );
            setShowPreviewMode(true);
            // Build route data for the preview map
            buildRouteFromDeliveries(location, list);
          } else {
            // All deliveries already previewed - go straight to map
            console.log(
              "[PREVIEW] All deliveries already previewed - navigating to map",
            );
            navigate(`/driver/delivery/active/${list[0].delivery_id}/map`);
            return;
          }
        }

        // Save to cache
        const deliverySnapshot = {
          pickups: [],
          deliveries: list,
          mode: "deliver",
          driverLocation: location,
          fullRouteData,
        };
        saveCacheData(deliverySnapshot);
        queryClient.setQueryData(activeQueryKey, deliverySnapshot);

        // Auto-set first delivery to on-the-way when starting delivering mode
        if (list.length > 0 && list[0].status === "picked_up") {
          try {
            await fetch(
              `${API_URL}/driver/deliveries/${list[0].delivery_id}/status`,
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
        // Only set error if not a background refresh and no cached data
        if (!isBackgroundRefresh && !hasFetchedSuccessfully) {
          setFetchError(
            `Failed to load deliveries: ${data.message || "Server error"}`,
          );
        }
      }
    } catch (e) {
      console.error("Fetch deliveries route error:", e);
      // Only set error if not a background refresh and no cached data
      if (!isBackgroundRefresh && !hasFetchedSuccessfully) {
        setFetchError(
          `Network error: ${e.message || "Unable to connect to server"}`,
        );
      }
    }
  };

  const handlePrimaryAction = () => {
    if (mode === "pickup") {
      if (pickups.length === 0) {
        showError("No pickups available");
        return;
      }
      navigate(`/driver/delivery/active/${pickups[0].delivery_id}/map`);
      return;
    }
    if (mode === "deliver") {
      if (deliveries.length === 0) {
        showError("No deliveries available");
        return;
      }
      // For deliveries, just navigate - don't update status as they're already in progress
      navigate(`/driver/delivery/active/${deliveries[0].delivery_id}/map`);
    }
  };

  return (
    <DriverLayout>
      <AnimatedAlert alert={alertState} visible={alertVisible} />
      <div className="min-h-screen bg-gray-50 pb-24">
        <PageWrapper
          isFetching={isRefreshing}
          dataKey={`active-${mode}-${pickups.length}-${deliveries.length}`}
        >
          <div className="max-w-4xl mx-auto px-4 py-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                  {showPreviewMode ? "Route Preview" : "Active Deliveries"}
                  {isRefreshing && (
                    <span className="inline-block w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></span>
                  )}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {showPreviewMode
                    ? `${pickups.length + deliveries.length} stop${pickups.length + deliveries.length !== 1 ? "s" : ""} to complete`
                    : mode === "pickup"
                      ? `${pickups.length} pickup${pickups.length !== 1 ? "s" : ""} ready`
                      : `${deliveries.length} delivery${deliveries.length !== 1 ? "ies" : ""} ready`}
                </p>
                {!showPreviewMode && (
                  <p className="text-xs text-gray-500 mt-1">
                    Mode: {mode === "pickup" ? "Pick-up" : "Delivering"}
                  </p>
                )}
              </div>
              <button
                onClick={() => navigate("/driver/deliveries")}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Available
              </button>
            </div>

            {initialLoading ? (
              <div className="space-y-4">
                <AdminSkeleton type="deliveries" />
              </div>
            ) : fetchError ? (
              /* Error State - Network or Server Error */
              <div className="bg-white rounded-xl shadow-md p-12 text-center">
                <svg
                  className="mx-auto h-24 w-24 text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <h3 className="mt-4 text-xl font-semibold text-red-600">
                  Connection Error
                </h3>
                <p className="mt-2 text-gray-500">{fetchError}</p>
                <p className="mt-2 text-sm text-gray-400">
                  Please check your internet connection and try again
                </p>
                <button
                  onClick={() => {
                    setFetchError(null);
                    setInitialLoading(true);
                    fetchWithLocation();
                  }}
                  className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold flex items-center justify-center gap-2 mx-auto"
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
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Retry
                </button>
              </div>
            ) : (
                mode === "pickup"
                  ? pickups.length === 0
                  : deliveries.length === 0
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
                {/* Full Route Overview Map - Shows ordered stops */}
                {mode === "pickup" && pickups.length > 0 && fullRouteData && (
                  <FullRouteMap
                    driverLocation={driverLocation}
                    pickups={pickups}
                    fullRouteData={fullRouteData}
                    isLoaded={isLoaded}
                  />
                )}
              </>
            )}
          </div>
        </PageWrapper>

        {/* Fixed Start Button - Shows "Start Delivering" for preview mode */}
        {(mode === "pickup" ? pickups.length > 0 : deliveries.length > 0) && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg z-50">
            <div className="max-w-4xl mx-auto">
              <button
                onClick={
                  showPreviewMode ? handleStartDelivering : handlePrimaryAction
                }
                className={`w-full py-4 text-white rounded-xl font-bold text-lg transition flex items-center justify-center gap-2 shadow-md ${
                  showPreviewMode
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {showPreviewMode ? (
                  <>
                    {/* Navigation arrow icon for preview mode */}
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
                        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                      />
                    </svg>
                    <span>START DELIVERING</span>
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
                  </>
                )}
              </button>
              {showPreviewMode && (
                <p className="text-center text-sm text-gray-500 mt-2">
                  Review your {pickups.length + deliveries.length} stop
                  {pickups.length + deliveries.length !== 1 ? "s" : ""} route
                </p>
              )}
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
        <div className="relative w-full h-[40vh] min-h-[220px]">
          {restaurant && isLoaded ? (
            <MapContainer
              center={[mapCenter.lat, mapCenter.lng]}
              zoom={13}
              style={mapContainerStyle}
              zoomControl={false}
              attributionControl={false}
            >
              <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />

              {/* Driver Marker */}
              {driverLocation && (
                <Marker
                  position={[driverLocation.latitude, driverLocation.longitude]}
                  icon={createCircleIcon("#13ec37")}
                  eventHandlers={{
                    click: () => setSelectedMarker("driver"),
                  }}
                >
                  {selectedMarker === "driver" && (
                    <Popup onClose={() => setSelectedMarker(null)}>
                      <div className="text-center p-1">
                        <p className="font-bold text-green-600 text-sm">
                          📍 You
                        </p>
                      </div>
                    </Popup>
                  )}
                </Marker>
              )}

              {/* Restaurant Marker */}
              <Marker
                position={[restaurant.latitude, restaurant.longitude]}
                icon={createCircleIcon("#13ec37")}
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

              {/* Customer Marker (shown for reference) */}
              {customer && (
                <Marker
                  position={[customer.latitude, customer.longitude]}
                  icon={createCircleIcon("#111812")}
                  eventHandlers={{
                    click: () => setSelectedMarker("customer"),
                  }}
                >
                  {selectedMarker === "customer" && (
                    <Popup onClose={() => setSelectedMarker(null)}>
                      <div className="p-1">
                        <p className="font-bold text-sm">📍 {customer.name}</p>
                      </div>
                    </Popup>
                  )}
                </Marker>
              )}

              {/* Route Polylines */}
              {driverToRestaurantPath.length > 0 && (
                <Polyline
                  positions={driverToRestaurantPath.map((p) => [p.lat, p.lng])}
                  pathOptions={{
                    color: "#2563eb",
                    opacity: 0.9,
                    weight: 6,
                  }}
                />
              )}

              {restaurantToCustomerPath.length > 0 && (
                <Polyline
                  positions={restaurantToCustomerPath.map((p) => [
                    p.lat,
                    p.lng,
                  ])}
                  pathOptions={{
                    color: "#2563eb",
                    opacity: 0.6,
                    weight: 4,
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
        </div>
      )}

      {/* Content Card - Slides over map */}
      <div className="bg-white rounded-t-[28px] -mt-7 relative z-10 px-5 pt-6 pb-5">
        {/* Order Badge */}
        {isFirst && (
          <div className="absolute -top-3 right-5 bg-green-600 px-4 py-1 rounded-full shadow-lg">
            <p className="text-xs font-bold text-white">NEXT PICKUP</p>
          </div>
        )}

        {/* Order Number */}
        <div className="mb-4">
          <p className="text-sm text-blue-600 font-medium">
            Order #{order_number}
          </p>
        </div>

        {/* Distance and Time Stats */}
        <div className="flex items-center gap-4 mb-4 pb-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-green-600"
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
            <span className="font-semibold text-gray-700">
              {distance_km} km
            </span>
          </div>
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-green-600"
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
            <span className="font-semibold text-gray-700">
              {estimated_time_minutes} min
            </span>
          </div>
        </div>

        {/* Restaurant Info */}
        <div className="mb-4">
          <p className="text-xs text-gray-500 uppercase font-semibold mb-2">
            🍽️ Pickup Location
          </p>
          <p className="font-bold text-gray-800 text-lg">{restaurant.name}</p>
          <p className="text-sm text-gray-600 mt-1">{restaurant.address}</p>
          {restaurant.phone && (
            <a
              href={`tel:${restaurant.phone}`}
              className="inline-flex items-center gap-2 mt-2 text-green-600 hover:text-green-700 font-semibold text-sm"
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

        {/* Customer Info */}
        <div className="pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 uppercase font-semibold mb-2">
            👤 Deliver To
          </p>
          <p className="font-bold text-gray-800 text-lg">
            {customer?.name || "Customer"}
          </p>
          <p className="text-sm text-gray-600 mt-1">{customer?.address}</p>
          {customer?.phone && (
            <a
              href={`tel:${customer.phone}`}
              className="inline-flex items-center gap-2 mt-2 text-green-600 hover:text-green-700 font-semibold text-sm"
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
  const hasFetchedDirections = useRef(false);

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

  // Helper: Get OSRM walking distance between two points (meters)
  // Falls back to straight-line ONLY if network is completely unreachable (returns null)
  const getOSRMDistance = async (lat1, lng1, lat2, lng2) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const url = `https://router.project-osrm.org/route/v1/foot/${lng1},${lat1};${lng2},${lat2}?overview=false`;
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await response.json();
      if (data.code === "Ok" && data.routes?.[0]) {
        return data.routes[0].distance; // meters
      }
      // OSRM returned an error code — retry once
      const retry = await fetch(url);
      const retryData = await retry.json();
      if (retryData.code === "Ok" && retryData.routes?.[0]) {
        return retryData.routes[0].distance;
      }
      return null;
    } catch (e) {
      console.warn(`[OSRM] Distance request failed: ${e.message}`);
      return null;
    }
  };

  // Optimize restaurant pickup order using OSRM road distances
  const getOptimizedRestaurantOrderByShortest = async (
    pickupsList,
    driverLoc,
  ) => {
    if (pickupsList.length <= 1) return pickupsList;

    console.log(
      `📍 [SMART ROUTE] Analyzing ${pickupsList.length} deliveries via OSRM...`,
    );

    // For each restaurant, get OSRM distance to its customer + from driver
    const enriched = await Promise.all(
      pickupsList.map(async (pickup) => {
        const [distToCustomer, distFromDriver] = await Promise.all([
          getOSRMDistance(
            pickup.restaurant.latitude,
            pickup.restaurant.longitude,
            pickup.customer.latitude,
            pickup.customer.longitude,
          ),
          getOSRMDistance(
            driverLoc.latitude,
            driverLoc.longitude,
            pickup.restaurant.latitude,
            pickup.restaurant.longitude,
          ),
        ]);

        return {
          ...pickup,
          distToOwnCustomer: distToCustomer ?? Infinity,
          distFromDriver: distFromDriver ?? Infinity,
        };
      }),
    );

    // Sort: restaurant with largest total trip first (far customers first)
    const sorted = [...enriched].sort((a, b) => {
      const totalA = a.distFromDriver + a.distToOwnCustomer;
      const totalB = b.distFromDriver + b.distToOwnCustomer;
      return totalB - totalA;
    });

    console.log(`📍 [SMART ROUTE] Pickup order (OSRM):`);
    sorted.forEach((item, idx) => {
      console.log(
        `📍 [SMART ROUTE]   ${idx + 1}. ${item.restaurant.name} → ${item.customer.name} (${(item.distToOwnCustomer / 1000).toFixed(2)} km to customer)`,
      );
    });

    return sorted;
  };

  // Optimize customer delivery order using OSRM (nearest-neighbor)
  const getOptimizedCustomerOrderByShortest = async (pickupsList) => {
    if (pickupsList.length <= 1) return pickupsList;

    const lastRestaurant = pickupsList[pickupsList.length - 1].restaurant;
    const remaining = [...pickupsList];
    const ordered = [];
    let currentLat = lastRestaurant.latitude;
    let currentLng = lastRestaurant.longitude;

    console.log(
      `📍 [SMART ROUTE] Delivery order via OSRM (starting from: ${lastRestaurant.name}):`,
    );

    while (remaining.length > 0) {
      // Get OSRM distances from current position to all remaining customers
      const distances = await Promise.all(
        remaining.map(async (pickup) => {
          const dist = await getOSRMDistance(
            currentLat,
            currentLng,
            pickup.customer.latitude,
            pickup.customer.longitude,
          );
          return dist ?? Infinity;
        }),
      );

      let nearestIdx = 0;
      let nearestDist = distances[0];
      for (let i = 1; i < distances.length; i++) {
        if (distances[i] < nearestDist) {
          nearestDist = distances[i];
          nearestIdx = i;
        }
      }

      const nearest = remaining[nearestIdx];
      ordered.push(nearest);

      console.log(
        `📍 [SMART ROUTE]   C${ordered.length}. ${nearest.customer.name} (${(nearestDist / 1000).toFixed(2)} km from current)`,
      );

      currentLat = nearest.customer.latitude;
      currentLng = nearest.customer.longitude;
      remaining.splice(nearestIdx, 1);
    }

    return ordered;
  };

  // (Deprecated Haversine functions removed — OSRM used above)

  // State for optimized orders
  const [optimizedRestaurantOrder, setOptimizedRestaurantOrder] = useState([]);

  // Fetch directions when map loads - uses OSRM for route calculation
  const fetchDirections = useCallback(async () => {
    // Prevent duplicate fetches
    if (hasFetchedDirections.current) return;
    if (!driverLocation || pickups.length === 0) return;

    hasFetchedDirections.current = true;

    // STEP 1: Use SMART ROUTING via OSRM - Optimize based on road distances
    const optimizedRestaurants = await getOptimizedRestaurantOrderByShortest(
      pickups,
      driverLocation,
    );
    setOptimizedRestaurantOrder(optimizedRestaurants);

    // STEP 2: Optimize customer delivery order via OSRM
    const optimizedCustomers =
      await getOptimizedCustomerOrderByShortest(optimizedRestaurants);
    setOptimizedCustomerOrder(optimizedCustomers);

    console.log(`📍 [FULL ROUTE] ═══════════════════════════════════════════`);
    console.log(`📍 [FULL ROUTE] SMART ROUTE OPTIMIZED ORDER:`);
    console.log(
      `📍 [FULL ROUTE]   Restaurants: ${optimizedRestaurants.map((p) => p.restaurant.name).join(" → ")}`,
    );
    console.log(
      `📍 [FULL ROUTE]   Customers: ${optimizedCustomers.map((p) => p.customer.name).join(" → ")}`,
    );
    console.log(`📍 [FULL ROUTE] ═══════════════════════════════════════════`);

    // Build waypoints for OSRM
    const waypoints = [
      { lat: driverLocation.latitude, lng: driverLocation.longitude },
      ...optimizedRestaurants.map((p) => ({
        lat: p.restaurant.latitude,
        lng: p.restaurant.longitude,
      })),
      ...optimizedCustomers.map((p) => ({
        lat: p.customer.latitude,
        lng: p.customer.longitude,
      })),
    ];

    try {
      // SEGMENT-BY-SEGMENT ROUTE CALCULATION
      // Fetch each segment separately: D→R1, R1→R2, R2→C1, C1→C2, etc.
      console.log(
        `📍 [SEGMENT ROUTE] Starting segment-by-segment route calculation...`,
      );
      console.log(`📍 [SEGMENT ROUTE] Total waypoints: ${waypoints.length}`);

      const allRouteSegments = [];
      let totalDistance = 0;
      let totalDuration = 0;
      const segmentLegs = [];

      // Fetch each segment individually
      for (let i = 0; i < waypoints.length - 1; i++) {
        const from = waypoints[i];
        const to = waypoints[i + 1];

        const segmentUrl = `https://router.project-osrm.org/route/v1/foot/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`;

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);

          const response = await fetch(segmentUrl, {
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          const data = await response.json();

          if (data.code === "Ok" && data.routes && data.routes.length > 0) {
            const route = data.routes[0];

            // Add segment path to combined route
            const segmentPath = route.geometry.coordinates.map((coord) => ({
              lat: coord[1],
              lng: coord[0],
            }));

            // For segments after the first, skip the first point to avoid duplicates
            if (allRouteSegments.length > 0 && segmentPath.length > 0) {
              allRouteSegments.push(...segmentPath.slice(1));
            } else {
              allRouteSegments.push(...segmentPath);
            }

            totalDistance += route.distance;
            totalDuration += route.duration;

            // Store leg info
            const leg = route.legs?.[0];
            if (leg) {
              segmentLegs.push({
                distance: {
                  value: leg.distance,
                  text: `${(leg.distance / 1000).toFixed(2)} km`,
                },
                duration: {
                  value: leg.duration,
                  text: `${Math.ceil(leg.duration / 60)} min`,
                },
                steps:
                  leg.steps?.map((step) => ({
                    path:
                      step.geometry?.coordinates?.map((c) => ({
                        lat: c[1],
                        lng: c[0],
                      })) || [],
                  })) || [],
              });
            }

            console.log(
              `📍 [SEGMENT ${i + 1}/${waypoints.length - 1}] ✓ ${(route.distance / 1000).toFixed(2)} km, ${Math.ceil(route.duration / 60)} min`,
            );
          } else {
            console.warn(
              `📍 [SEGMENT ${i + 1}] Failed to get route, using straight line`,
            );
            // Fallback: add straight line segment
            allRouteSegments.push({ lat: from.lat, lng: from.lng });
            allRouteSegments.push({ lat: to.lat, lng: to.lng });
          }

          // Small delay between requests to avoid rate limiting
          if (i < waypoints.length - 2) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        } catch (segmentError) {
          if (segmentError.name === "AbortError") {
            console.warn(`📍 [SEGMENT ${i + 1}] Request timed out`);
          } else {
            console.error(`📍 [SEGMENT ${i + 1}] Error:`, segmentError.message);
          }
          // Add straight line as fallback
          allRouteSegments.push({ lat: from.lat, lng: from.lng });
          allRouteSegments.push({ lat: to.lat, lng: to.lng });
        }
      }

      // Create combined directions object
      if (allRouteSegments.length > 0) {
        setDirections({
          routes: [
            {
              overview_path: allRouteSegments,
              legs: segmentLegs,
            },
          ],
        });

        setRouteInfo({
          totalDistance: (totalDistance / 1000).toFixed(2),
          totalDuration: Math.ceil(totalDuration / 60),
          legs: segmentLegs,
          optimizedRestaurants: optimizedRestaurants,
          optimizedCustomers: optimizedCustomers,
          selectedMode: "OSRM_FOOT_SEGMENTS",
        });

        console.log(
          "📍 [SEGMENT ROUTE] ═══════════════════════════════════════════",
        );
        console.log("📍 [SEGMENT ROUTE] Route calculation complete:");
        console.log(
          `📍 [SEGMENT ROUTE]   Total segments: ${waypoints.length - 1}`,
        );
        console.log(
          `📍 [SEGMENT ROUTE]   Total distance: ${(totalDistance / 1000).toFixed(2)} km`,
        );
        console.log(
          `📍 [SEGMENT ROUTE]   Total duration: ${Math.ceil(totalDuration / 60)} min`,
        );
        console.log(
          `📍 [SEGMENT ROUTE]   Path points: ${allRouteSegments.length}`,
        );
        console.log(
          "📍 [SEGMENT ROUTE] ═══════════════════════════════════════════",
        );
      }
    } catch (error) {
      console.error("Failed to fetch segment routes:", error);
    }
  }, [driverLocation, pickups]);

  // Reset hasFetchedDirections when pickups change
  useEffect(() => {
    hasFetchedDirections.current = false;
  }, [pickups.length]);

  // Trigger fetchDirections when map is ready and data is available
  useEffect(() => {
    if (
      mapRef &&
      driverLocation &&
      pickups.length > 0 &&
      !hasFetchedDirections.current
    ) {
      fetchDirections();
    }
  }, [mapRef, driverLocation, pickups, fetchDirections]);

  // Marker colors
  const markerColors = {
    driver: "#10b981", // Green
    restaurant: "#ef4444", // Red
    customer: "#3b82f6", // Blue
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border-2 border-green-500 overflow-hidden mb-6">
      {/* Map */}
      <div className="h-96 relative">
        {isLoaded ? (
          <MapContainer
            center={[mapCenter.lat, mapCenter.lng]}
            zoom={12}
            style={mapContainerStyle}
            zoomControl={true}
            attributionControl={false}
            ref={(map) => {
              if (map && !mapRef) {
                setMapRef(map);
              }
            }}
          >
            <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />

            {/* Driver Marker */}
            {driverLocation && (
              <Marker
                position={[driverLocation.latitude, driverLocation.longitude]}
                icon={createLabeledIcon(markerColors.driver, "D")}
                eventHandlers={{
                  click: () => setSelectedMarker("driver"),
                }}
              >
                {selectedMarker === "driver" && (
                  <Popup onClose={() => setSelectedMarker(null)}>
                    <div className="p-2">
                      <p className="font-bold text-green-600">
                        📍 Driver Location
                      </p>
                      <p className="text-xs text-gray-600">Starting Point</p>
                    </div>
                  </Popup>
                )}
              </Marker>
            )}

            {/* Restaurant Markers - Use optimized order */}
            {(optimizedRestaurantOrder.length > 0
              ? optimizedRestaurantOrder
              : pickups
            ).map((pickup, idx) => (
              <Marker
                key={`restaurant-${pickup.delivery_id}`}
                position={[
                  pickup.restaurant.latitude,
                  pickup.restaurant.longitude,
                ]}
                icon={createLabeledIcon(markerColors.restaurant, `R${idx + 1}`)}
                eventHandlers={{
                  click: () => setSelectedMarker(`restaurant-${idx}`),
                }}
              >
                {selectedMarker === `restaurant-${idx}` && (
                  <Popup onClose={() => setSelectedMarker(null)}>
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
                  </Popup>
                )}
              </Marker>
            ))}

            {/* Customer Markers - Use optimized order for numbering */}
            {(optimizedCustomerOrder.length > 0
              ? optimizedCustomerOrder
              : pickups
            ).map((pickup, idx) => (
              <Marker
                key={`customer-${pickup.delivery_id}`}
                position={[pickup.customer.latitude, pickup.customer.longitude]}
                icon={createLabeledIcon(markerColors.customer, `C${idx + 1}`)}
                eventHandlers={{
                  click: () => setSelectedMarker(`customer-${idx}`),
                }}
              >
                {selectedMarker === `customer-${idx}` && (
                  <Popup onClose={() => setSelectedMarker(null)}>
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
                  </Popup>
                )}
              </Marker>
            ))}

            {/* Route Polyline - Shows the full route */}
            {directions && directions.routes && directions.routes[0] && (
              <>
                {/* Shadow layer for better road visibility */}
                <Polyline
                  positions={
                    directions.routes[0].overview_path?.map((p) => [
                      p.lat,
                      p.lng,
                    ]) ||
                    directions.routes[0].legs?.flatMap(
                      (leg) =>
                        leg.steps?.flatMap(
                          (step) => step.path?.map((p) => [p.lat, p.lng]) || [],
                        ) || [],
                    ) ||
                    []
                  }
                  pathOptions={{
                    color: "#ffffff",
                    opacity: 0.4,
                    weight: 8,
                  }}
                />
                {/* Main route polyline */}
                <Polyline
                  positions={
                    directions.routes[0].overview_path?.map((p) => [
                      p.lat,
                      p.lng,
                    ]) ||
                    directions.routes[0].legs?.flatMap(
                      (leg) =>
                        leg.steps?.flatMap(
                          (step) => step.path?.map((p) => [p.lat, p.lng]) || [],
                        ) || [],
                    ) ||
                    []
                  }
                  pathOptions={{
                    color: "#8b5cf6",
                    opacity: 0.9,
                    weight: 6,
                  }}
                />
              </>
            )}
          </MapContainer>
        ) : (
          <div className="h-full w-full bg-gray-200 flex items-center justify-center">
            <p className="text-gray-500">Loading map...</p>
          </div>
        )}
      </div>

      {/* Ordered Stops List */}
      {routeInfo &&
        routeInfo.optimizedRestaurants &&
        routeInfo.optimizedCustomers && (
          <div className="px-4 py-4 border-t bg-white">
            <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
              <svg
                className="w-5 h-5 text-green-600"
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
              Ordered Stops
            </h4>
            <div className="space-y-2">
              {/* Driver Starting Point */}
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  D
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800 text-sm">
                    Your Location (Starting Point)
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Driver Position
                  </p>
                </div>
              </div>

              {/* Restaurant Pickups */}
              {routeInfo.optimizedRestaurants.map((pickup, idx) => (
                <div
                  key={`stop-r-${idx}`}
                  className="flex items-center gap-3 p-3 bg-red-50 rounded-lg border border-red-200"
                >
                  <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    R{idx + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800 text-sm">
                      🍽️ {pickup.restaurant.name}
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {pickup.restaurant.address}
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      Order #{pickup.order_number}
                    </p>
                  </div>
                </div>
              ))}

              {/* Customer Deliveries */}
              {routeInfo.optimizedCustomers.map((pickup, idx) => (
                <div
                  key={`stop-c-${idx}`}
                  className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    C{idx + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800 text-sm">
                      👤 {pickup.customer.name}
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {pickup.customer.address}
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      Order #{pickup.order_number}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
        <div className="relative w-full h-[40vh] min-h-[220px]">
          {customer && isLoaded ? (
            <MapContainer
              center={[mapCenter.lat, mapCenter.lng]}
              zoom={13}
              style={mapContainerStyle}
              zoomControl={false}
              attributionControl={false}
            >
              <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />

              {/* Driver Marker */}
              {driverLocation && (
                <Marker
                  position={[driverLocation.latitude, driverLocation.longitude]}
                  icon={createCircleIcon("#13ec37")}
                  eventHandlers={{
                    click: () => setSelectedMarker("driver"),
                  }}
                >
                  {selectedMarker === "driver" && (
                    <Popup onClose={() => setSelectedMarker(null)}>
                      <div className="text-center p-1">
                        <p className="font-bold text-green-600 text-sm">
                          📍 You
                        </p>
                      </div>
                    </Popup>
                  )}
                </Marker>
              )}

              {/* Customer Marker */}
              <Marker
                position={[customer.latitude, customer.longitude]}
                icon={createCircleIcon("#111812")}
                eventHandlers={{
                  click: () => setSelectedMarker("customer"),
                }}
              >
                {selectedMarker === "customer" && (
                  <Popup onClose={() => setSelectedMarker(null)}>
                    <div className="p-1">
                      <p className="font-bold text-sm">📍 {customer.name}</p>
                    </div>
                  </Popup>
                )}
              </Marker>

              {/* Route from Driver to Customer */}
              {routePath.length > 0 && (
                <Polyline
                  positions={routePath.map((p) => [p.lat, p.lng])}
                  pathOptions={{
                    color: "#2563eb",
                    opacity: 0.9,
                    weight: 6,
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
        </div>
      )}

      {/* Content Card - Slides over map */}
      <div className="bg-white rounded-t-[28px] -mt-7 relative z-10 px-5 pt-6 pb-5">
        {/* Order Badge */}
        {isFirst && (
          <div className="absolute -top-3 right-5 bg-green-600 px-4 py-1 rounded-full shadow-lg">
            <p className="text-xs font-bold text-white">NEXT DELIVERY</p>
          </div>
        )}

        {/* Order Number */}
        <div className="mb-4">
          <p className="text-sm text-blue-600 font-medium">
            Order #{order_number}
          </p>
        </div>

        {/* Distance and Time Stats */}
        <div className="flex items-center gap-4 mb-4 pb-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-green-600"
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
            <span className="font-semibold text-gray-700">
              {distance_km} km
            </span>
          </div>
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-green-600"
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
            <span className="font-semibold text-gray-700">
              {estimated_time_minutes} min
            </span>
          </div>
        </div>

        {/* Customer Info */}
        <div>
          <p className="text-xs text-gray-500 uppercase font-semibold mb-2">
            👤 Customer
          </p>
          <p className="font-bold text-gray-800 text-lg">
            {customer?.name || "Customer"}
          </p>
          <p className="text-sm text-gray-600 mt-1">{customer?.address}</p>
          {customer?.phone && (
            <a
              href={`tel:${customer.phone}`}
              className="inline-flex items-center gap-2 mt-2 text-green-600 hover:text-green-700 font-semibold text-sm"
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
  );
}
