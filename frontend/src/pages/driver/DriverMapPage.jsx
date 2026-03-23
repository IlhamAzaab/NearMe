import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { X, Phone, ChevronDown, Navigation } from "lucide-react";
import AnimatedAlert, { useAlert } from "../../components/AnimatedAlert";
import SwipeToDeliver from "../../components/SwipeToDeliver";
import StatusTransitionOverlay from "../../components/StatusTransitionOverlay";
import DeliveryProofUpload from "../../components/DeliveryProofUpload";
import { MapBoundsFitter } from "../../components/DraggableMap";
import { API_URL } from "../../config";
import { cacheDriverActiveDeliveryId } from "../../utils/driverActiveDelivery";

// Open Google Maps for navigation (works on both web and mobile apps)
function openGoogleMapsNavigation(destLat, destLng, destLabel = "Destination") {
  // google.navigation intent works on Android Google Maps app
  // On iOS it opens Google Maps app if installed, otherwise web
  // On web it opens Google Maps in browser
  const isAndroid = /android/i.test(navigator.userAgent);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (isAndroid) {
    // Android: use google.navigation intent (opens Google Maps app directly in navigation mode)
    window.location.href = `google.navigation:q=${destLat},${destLng}&mode=d`;
    // Fallback to web after a short delay if the app doesn't open
    setTimeout(() => {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`,
        "_blank",
      );
    }, 1500);
  } else if (isIOS) {
    // iOS: try Google Maps app first, fallback to Apple Maps
    window.location.href = `comgooglemaps://?daddr=${destLat},${destLng}&directionsmode=driving`;
    setTimeout(() => {
      window.open(
        `https://maps.apple.com/?daddr=${destLat},${destLng}&dirflg=d`,
        "_blank",
      );
    }, 1500);
  } else {
    // Web: open Google Maps in new tab
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`,
      "_blank",
    );
  }
}

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

// ============================================================================
// NAVIGATION ARROW ICON - Driver marker with heading direction
// ============================================================================
const createNavigationArrowIcon = (heading = 0) => {
  // SVG navigation arrow that rotates based on heading
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
// BACKGROUNDLESS CIRCLE ICONS - Clean style for restaurant/customer
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

// Static icons for restaurant and customer
const restaurantIcon = createCleanCircleIcon("#ef4444", "🍽️", 40);
const customerIcon = createCleanCircleIcon("#10b981", "📍", 40);

// Component to handle map bounds - only fits bounds on initial load or when user requests recenter
function MapBounds({
  positions,
  shouldFitBounds,
  onBoundsFitted,
  onUserInteraction,
}) {
  const map = useMap();
  const hasInitiallyFitted = useRef(false);

  // Listen for user interactions (zoom, drag, etc.)
  useMapEvents({
    zoomstart: () => {
      // Only mark as user interaction if we've already done initial fit
      if (hasInitiallyFitted.current) {
        onUserInteraction();
      }
    },
    dragstart: () => {
      if (hasInitiallyFitted.current) {
        onUserInteraction();
      }
    },
  });

  useEffect(() => {
    // Only fit bounds on initial load OR when explicitly requested via recenter button
    if (positions && positions.length > 0 && shouldFitBounds) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [50, 50] });
      hasInitiallyFitted.current = true;
      onBoundsFitted();
    }
  }, [positions, map, shouldFitBounds, onBoundsFitted]);

  return null;
}

// Minimum distance (meters) the driver must move before we consider it a real movement
const MOVEMENT_THRESHOLD_METERS = 10;
const FETCH_MOVEMENT_THRESHOLD_METERS = 100; // Only re-fetch OSRM/data when moved 100m+

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

export default function DriverMapPage() {
  const { deliveryId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const watchIdRef = useRef(null);
  const userId = localStorage.getItem("userId") || "default";
  const mapSnapshotKey = useMemo(
    () => ["driver", "map-page", userId, deliveryId || "current"],
    [deliveryId, userId],
  );
  const cachedSnapshot = queryClient.getQueryData(mapSnapshotKey);
  const hasCachedSnapshot = !!cachedSnapshot;

  const [mode, setMode] = useState(cachedSnapshot?.mode || "pickup"); // "pickup" or "delivery"
  const [pickups, setPickups] = useState(cachedSnapshot?.pickups || []);
  const [deliveries, setDeliveries] = useState(
    cachedSnapshot?.deliveries || [],
  );
  const [currentTarget, setCurrentTarget] = useState(
    cachedSnapshot?.currentTarget || null,
  );
  const [driverLocation, setDriverLocation] = useState(
    cachedSnapshot?.driverLocation || null,
  );
  const [loading, setLoading] = useState(() => !cachedSnapshot);
  const [updating, setUpdating] = useState(false);
  const [isTracking, setIsTracking] = useState(false);

  // Refs for movement-based logic
  const lastLocationRef = useRef(null);
  const lastBackendLocationRef = useRef(null);

  // New state for controlling map auto-fit behavior
  const [shouldFitBounds, setShouldFitBounds] = useState(true);
  const [userHasInteracted, setUserHasInteracted] = useState(false);
  const {
    alert: alertState,
    visible: alertVisible,
    showSuccess,
    showError,
  } = useAlert();

  // Status transition overlay state
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayStatus, setOverlayStatus] = useState("processing");
  const [overlayActionType, setOverlayActionType] = useState("pickup");
  const [overlayErrorMsg, setOverlayErrorMsg] = useState("");
  const overlayCallbackRef = useRef(null);

  useEffect(() => {
    if (!deliveryId && currentTarget?.delivery_id) {
      navigate(`/driver/delivery/active/${currentTarget.delivery_id}/map`, {
        replace: true,
      });
    }
  }, [deliveryId, currentTarget, navigate]);

  useEffect(() => {
    if (!currentTarget?.delivery_id) return;
    cacheDriverActiveDeliveryId(queryClient, {
      userId,
      deliveryId: currentTarget.delivery_id,
    });
  }, [currentTarget, queryClient, userId]);

  useQuery({
    queryKey: mapSnapshotKey,
    staleTime: 60 * 1000,
    queryFn: async () => queryClient.getQueryData(mapSnapshotKey) || null,
  });

  useEffect(() => {
    const latest = queryClient.getQueryData(mapSnapshotKey);
    if (!latest) return;
    setMode(latest.mode || "pickup");
    setPickups(latest.pickups || []);
    setDeliveries(latest.deliveries || []);
    setCurrentTarget(latest.currentTarget || null);
    setDriverLocation(latest.driverLocation || null);
    setLoading(false);
  }, [mapSnapshotKey, queryClient]);

  useEffect(() => {
    if (loading) return;
    queryClient.setQueryData(mapSnapshotKey, {
      mode,
      pickups,
      deliveries,
      currentTarget,
      driverLocation,
    });
  }, [
    loading,
    mode,
    pickups,
    deliveries,
    currentTarget,
    driverLocation,
    mapSnapshotKey,
    queryClient,
  ]);

  // Callbacks for map interaction
  const handleBoundsFitted = useCallback(() => {
    setShouldFitBounds(false);
  }, []);

  const handleUserInteraction = useCallback(() => {
    setUserHasInteracted(true);
    setShouldFitBounds(false);
  }, []);

  // Function to recenter map (user can click this button to re-fit bounds)
  const handleRecenterMap = useCallback(() => {
    setUserHasInteracted(false);
    setShouldFitBounds(true);
  }, []);

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

  // Fetch data only on initial mount (once we have a location)
  const hasFetchedRef = useRef(false);
  useEffect(() => {
    if (driverLocation && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchPickupsAndDeliveries();
    }
  }, [driverLocation]);

  // NO periodic polling — data is refreshed only on driver movement or explicit actions

  const startLocationTracking = () => {
    if (!navigator.geolocation) {
      showError("Geolocation not supported");
      return;
    }

    setIsTracking(true);
    console.log("[LOCATION] Starting watchPosition (event-driven, no polling)");

    // watchPosition fires ONLY when the device detects actual movement
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const newLoc = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          // Capture heading from device compass (for navigation arrow rotation)
          heading: position.coords.heading || 0,
          // Speed can be used for ETA adjustments
          speed: position.coords.speed || 0,
        };

        const prev = lastLocationRef.current;

        // First location — always accept
        if (!prev) {
          console.log(
            `[LOCATION] Initial: (${newLoc.latitude.toFixed(6)}, ${newLoc.longitude.toFixed(6)}) heading: ${newLoc.heading}°`,
          );
          lastLocationRef.current = newLoc;
          lastBackendLocationRef.current = newLoc;
          setDriverLocation(newLoc);
          updateLocationOnBackend(deliveryId, newLoc);
          return;
        }

        // Only update state if the driver actually moved beyond threshold
        const moved = getDistanceMeters(
          prev.latitude,
          prev.longitude,
          newLoc.latitude,
          newLoc.longitude,
        );

        if (moved >= MOVEMENT_THRESHOLD_METERS) {
          console.log(
            `[LOCATION] Moved ${moved.toFixed(0)}m → updating, heading: ${newLoc.heading}°`,
          );
          lastLocationRef.current = newLoc;
          setDriverLocation(newLoc);

          // Send to backend & refresh data when driver moves significantly (>100m since last backend update)
          const movedSinceBackend = lastBackendLocationRef.current
            ? getDistanceMeters(
                lastBackendLocationRef.current.latitude,
                lastBackendLocationRef.current.longitude,
                newLoc.latitude,
                newLoc.longitude,
              )
            : Infinity;

          if (movedSinceBackend >= FETCH_MOVEMENT_THRESHOLD_METERS) {
            lastBackendLocationRef.current = newLoc;
            updateLocationOnBackend(deliveryId, newLoc);
            // Refresh delivery data when driver has moved significantly
            fetchPickupsAndDeliveries();
          }
        }
        // else: no significant movement — do nothing (no re-render, no requests)
      },
      (error) => {
        console.error("Location watch error:", error);
        setIsTracking(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  };

  const stopLocationTracking = () => {
    setIsTracking(false);
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  const updateLocationOnBackend = async (delivId, location) => {
    try {
      const token = localStorage.getItem("token");
      await fetch(`${API_URL}/driver/deliveries/${delivId}/location`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          latitude: location.latitude,
          longitude: location.longitude,
        }),
      });
    } catch (e) {
      console.error("Location update error:", e);
    }
  };

  const fetchPickupsAndDeliveries = async () => {
    try {
      const token = localStorage.getItem("token");

      // Fetch pickups (accepted status)
      const pickupsUrl = `${API_URL}/driver/deliveries/pickups?driver_latitude=${driverLocation.latitude}&driver_longitude=${driverLocation.longitude}`;
      const pickupsRes = await fetch(pickupsUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const pickupsData = await pickupsRes.json();

      // Fetch deliveries (picked_up, on_the_way, at_customer)
      const deliveriesUrl = `${API_URL}/driver/deliveries/deliveries-route?driver_latitude=${driverLocation.latitude}&driver_longitude=${driverLocation.longitude}`;
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

      // If both endpoints returned empty, do a fallback check
      // using the simpler /active endpoint (no coordinates needed)
      const hasPickups = pickupsData.pickups && pickupsData.pickups.length > 0;
      const hasDeliveries =
        deliveriesData.deliveries && deliveriesData.deliveries.length > 0;

      if (!hasPickups && !hasDeliveries) {
        console.log(
          "[DRIVER MAP] Both endpoints empty, checking fallback /active endpoint...",
        );
        try {
          const fallbackRes = await fetch(
            `${API_URL}/driver/deliveries/active`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            const activeList = fallbackData.deliveries || [];
            if (activeList.length > 0) {
              console.log(
                `[DRIVER MAP] Fallback found ${activeList.length} active deliveries`,
              );
              // Build minimal delivery objects from the active endpoint data
              const fallbackDeliveries = activeList.map((d) => ({
                delivery_id: d.id,
                order_id: d.order_id,
                order_number: d.order?.order_number || "N/A",
                status: d.status,
                restaurant: d.order?.restaurant || {
                  name: "Restaurant",
                  address: "",
                  latitude: 0,
                  longitude: 0,
                },
                customer: {
                  name: d.order?.customer?.name || "Customer",
                  phone: d.order?.customer?.phone || "",
                  address: d.order?.delivery?.address || "",
                  latitude: d.order?.delivery?.latitude || 0,
                  longitude: d.order?.delivery?.longitude || 0,
                },
                distance_meters: d.total_distance || 0,
                distance_km: ((d.total_distance || 0) / 1000).toFixed(2),
                estimated_time_minutes: 0,
              }));

              const acceptedOnes = fallbackDeliveries.filter(
                (d) => d.status === "accepted",
              );
              const inProgressOnes = fallbackDeliveries.filter(
                (d) => d.status !== "accepted",
              );

              if (acceptedOnes.length > 0) {
                setPickups(acceptedOnes);
                setMode("pickup");
                setCurrentTarget(acceptedOnes[0]);
              } else if (inProgressOnes.length > 0) {
                setDeliveries(inProgressOnes);
                setMode("delivery");
                setCurrentTarget(inProgressOnes[0]);
              }
            }
          }
        } catch (fallbackErr) {
          console.error("[DRIVER MAP] Fallback check error:", fallbackErr);
        }
      }

      queryClient.setQueryData(mapSnapshotKey, {
        mode,
        pickups: pickupsData.pickups || [],
        deliveries: deliveriesData.deliveries || [],
        currentTarget,
        driverLocation,
      });
    } catch (e) {
      console.error("Fetch error:", e);
      // On error, try the fallback endpoint
      try {
        const token = localStorage.getItem("token");
        const fallbackRes = await fetch(`${API_URL}/driver/deliveries/active`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          const activeList = fallbackData.deliveries || [];
          if (activeList.length > 0) {
            const first = activeList[0];
            const target = {
              delivery_id: first.id,
              order_id: first.order_id,
              order_number: first.order?.order_number || "N/A",
              status: first.status,
              restaurant: first.order?.restaurant || {
                name: "Restaurant",
                address: "",
                latitude: 0,
                longitude: 0,
              },
              customer: {
                name: first.order?.customer?.name || "Customer",
                phone: first.order?.customer?.phone || "",
                address: first.order?.delivery?.address || "",
                latitude: first.order?.delivery?.latitude || 0,
                longitude: first.order?.delivery?.longitude || 0,
              },
              distance_meters: first.total_distance || 0,
              distance_km: ((first.total_distance || 0) / 1000).toFixed(2),
              estimated_time_minutes: 0,
            };
            setMode(first.status === "accepted" ? "pickup" : "delivery");
            setCurrentTarget(target);
          }
        }
      } catch (fallbackErr) {
        console.error("[DRIVER MAP] Error fallback also failed:", fallbackErr);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePickedUp = async () => {
    if (!currentTarget) return;

    // Show overlay IMMEDIATELY on swipe
    setOverlayActionType("pickup");
    setOverlayStatus("processing");
    setOverlayVisible(true);
    setUpdating(true);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_URL}/driver/deliveries/${currentTarget.delivery_id}/status`,
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
        },
      );

      if (res.ok) {
        const data = await res.json();

        // Show success overlay
        setOverlayStatus("success");
        overlayCallbackRef.current = async () => {
          const updatedPickups = pickups.filter(
            (p) => p.delivery_id !== currentTarget.delivery_id,
          );
          setPickups(updatedPickups);

          // Handle auto-promoted delivery if backend promoted one
          let updatedDeliveries = deliveries;
          if (data.promotedDelivery) {
            const promotedIndex = updatedDeliveries.findIndex(
              (d) => d.delivery_id === data.promotedDelivery.id,
            );
            if (promotedIndex !== -1) {
              updatedDeliveries = [...updatedDeliveries];
              updatedDeliveries[promotedIndex].status = "on_the_way";
              setDeliveries(updatedDeliveries);
            }
          }

          if (updatedPickups.length > 0) {
            setCurrentTarget(updatedPickups[0]);
          } else if (updatedDeliveries.length > 0) {
            // No more pickups, switch to delivery mode with the first delivery
            setMode("delivery");
            setCurrentTarget(updatedDeliveries[0]);
          } else {
            // Fallback: refresh data from backend
            await fetchPickupsAndDeliveries();
          }
          setUpdating(false);
        };
      } else {
        const data = await res.json();
        setOverlayErrorMsg(data.message || "Failed to update status");
        setOverlayStatus("error");
        overlayCallbackRef.current = () => setUpdating(false);
      }
    } catch (e) {
      console.error("Update error:", e);
      setOverlayErrorMsg("Failed to update status");
      setOverlayStatus("error");
      overlayCallbackRef.current = () => setUpdating(false);
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

    // Show overlay IMMEDIATELY on swipe
    setOverlayActionType("deliver");
    setOverlayStatus("processing");
    setOverlayVisible(true);
    setUpdating(true);

    try {
      const token = localStorage.getItem("token");

      // First update to on_the_way if not already
      if (currentTarget.status === "picked_up") {
        await fetch(
          `${API_URL}/driver/deliveries/${currentTarget.delivery_id}/status`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ status: "on_the_way" }),
          },
        );
      }

      // Then to at_customer if not already
      if (
        currentTarget.status === "picked_up" ||
        currentTarget.status === "on_the_way"
      ) {
        await fetch(
          `${API_URL}/driver/deliveries/${currentTarget.delivery_id}/status`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ status: "at_customer" }),
          },
        );
      }

      // Finally mark as delivered
      const res = await fetch(
        `${API_URL}/driver/deliveries/${currentTarget.delivery_id}/status`,
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
        },
      );

      if (res.ok) {
        const data = await res.json();
        const updatedDeliveries = deliveries.filter(
          (d) => d.delivery_id !== currentTarget.delivery_id,
        );

        // If a delivery was auto-promoted to on_the_way, update it in the list
        if (data.promotedDelivery && updatedDeliveries.length > 0) {
          const promotedIndex = updatedDeliveries.findIndex(
            (d) => d.delivery_id === data.promotedDelivery.id,
          );
          if (promotedIndex !== -1) {
            updatedDeliveries[promotedIndex].status = "on_the_way";
          }
        }

        setDeliveries(updatedDeliveries);

        // Show success overlay
        setOverlayStatus("success");
        overlayCallbackRef.current = () => {
          if (updatedDeliveries.length > 0) {
            setCurrentTarget(updatedDeliveries[0]);
          } else {
            navigate("/driver/delivery/active/map");
          }
          setUpdating(false);
        };
      } else {
        const data = await res.json();
        setOverlayErrorMsg(data.message || "Failed to update status");
        setOverlayStatus("error");
        overlayCallbackRef.current = () => setUpdating(false);
      }
    } catch (e) {
      console.error("Delivery error:", e);
      setOverlayErrorMsg("Failed to mark as delivered");
      setOverlayStatus("error");
      overlayCallbackRef.current = () => setUpdating(false);
    }
  };

  if (loading && !hasCachedSnapshot) {
    return <DriverMapSkeleton />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (!currentTarget) {
    return (
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

  const mapCenter = mapPositions.length > 0 ? mapPositions[0] : [0, 0];

  return (
    <>
      <AnimatedAlert alert={alertState} visible={alertVisible} />
      {/* Status Transition Overlay */}
      <StatusTransitionOverlay
        visible={overlayVisible}
        status={overlayStatus}
        actionType={overlayActionType}
        errorMessage={overlayErrorMsg}
        onComplete={() => {
          setOverlayVisible(false);
          setOverlayStatus("processing");
          setOverlayErrorMsg("");
          overlayCallbackRef.current?.();
          overlayCallbackRef.current = null;
        }}
      />
      <div className="h-screen w-screen relative bg-gray-50">
        {/* Fullscreen Map */}
        <div className="absolute inset-0">
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

              <MapBounds
                positions={mapPositions}
                shouldFitBounds={shouldFitBounds}
                onBoundsFitted={handleBoundsFitted}
                onUserInteraction={handleUserInteraction}
              />

              {/* Driver Marker - Navigation Arrow with heading direction */}
              <Marker
                position={[driverLocation.latitude, driverLocation.longitude]}
                icon={createNavigationArrowIcon(driverLocation.heading || 0)}
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
                          (coord) => [coord[1], coord[0]],
                        )}
                        color="#2563eb"
                        weight={6}
                        opacity={0.9}
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
                          (coord) => [coord[1], coord[0]],
                        )}
                        color="#2563eb"
                        weight={6}
                        opacity={0.9}
                      />
                    )}
                </>
              )}
            </MapContainer>
          )}

          {/* Back Button - Top Left */}
          <button
            onClick={() => navigate("/driver/active")}
            className="absolute top-6 left-6 z-[1000] bg-white rounded-full w-10 h-10 flex items-center justify-center shadow-lg hover:bg-gray-100 transition-colors"
            title="Go Back"
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
                strokeWidth={2.5}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>

          {/* Recenter Button - Shows when user has zoomed/panned */}
          {userHasInteracted && (
            <button
              onClick={handleRecenterMap}
              className="absolute top-6 right-6 bg-white p-3 rounded-full shadow-lg hover:bg-gray-50 transition-all duration-200 z-[1000]"
              title="Recenter map to show full route"
            >
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
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Delivery Details Card - Overlapping the map */}
        <div className="absolute bottom-0 left-0 right-0 z-[999] bg-white rounded-t-3xl shadow-2xl max-h-[50vh] overflow-y-auto">
          {/* Drag Handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
          </div>
          <div className="px-6 pb-6">
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
                pickups
                  .slice(1)
                  .map((pickup, index) => (
                    <UpcomingPickupCard
                      key={pickup.delivery_id}
                      pickup={pickup}
                      index={index + 2}
                    />
                  ))}

              {mode === "delivery" &&
                deliveries
                  .slice(1)
                  .map((delivery, index) => (
                    <UpcomingDeliveryCard
                      key={delivery.delivery_id}
                      delivery={delivery}
                      index={index + 2}
                    />
                  ))}
            </div>

            {/* Start Delivery Button */}
            {mode === "pickup" &&
              pickups.length === 0 &&
              deliveries.length > 0 && (
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
    </>
  );
}

function DriverMapSkeleton() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-gray-100">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-200 animate-pulse" />
      <div className="absolute top-6 left-6 h-10 w-10 rounded-full bg-white/80" />
      <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-white px-6 pt-5 pb-8 shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-gray-200" />
        <div className="mb-3 h-4 w-24 rounded bg-gray-200" />
        <div className="mb-4 h-8 w-44 rounded bg-gray-200" />
        <div className="mb-3 h-14 w-full rounded-xl bg-gray-100" />
        <div className="mb-3 h-14 w-full rounded-xl bg-gray-100" />
        <div className="h-12 w-full rounded-full bg-green-100" />
      </div>
    </div>
  );
}

function PickupInfo({ pickup, onPickedUp, updating }) {
  const {
    order_number,
    restaurant,
    distance_km,
    estimated_time_minutes,
    order_items = [],
  } = pickup;

  return (
    <div className="space-y-3">
      {/* Block 1: Order ID with Distance and Time */}
      <div className="bg-white p-4 rounded-lg border border-gray-300">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold mb-1">
              ORDER ID
            </p>
            <p className="text-base font-bold text-gray-800">#{order_number}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-green-50 px-2 py-1 rounded">
              <svg
                className="w-4 h-4 text-green-600"
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
              <span className="text-sm font-bold text-green-700">
                {distance_km} km
              </span>
            </div>
            <div className="flex items-center gap-1 bg-green-50 px-2 py-1 rounded">
              <svg
                className="w-4 h-4 text-green-600"
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
              <span className="text-sm font-bold text-green-700">
                {estimated_time_minutes} min
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Block 2: Restaurant Name, Address, and Phone */}
      <div className="bg-white p-4 rounded-lg border border-gray-300">
        <div className="flex items-start justify-between mb-2">
          <h2 className="text-xl font-bold text-green-600">
            {restaurant.name}
          </h2>
          <div className="flex items-center gap-2">
            {/* Navigate to Restaurant in Google Maps */}
            <button
              onClick={() =>
                openGoogleMapsNavigation(
                  restaurant.latitude,
                  restaurant.longitude,
                  restaurant.name,
                )
              }
              className="shrink-0 w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center hover:bg-blue-600 transition-colors"
              title="Navigate in Google Maps"
            >
              <Navigation className="w-5 h-5 text-white" />
            </button>
            {restaurant.phone && (
              <a
                href={`tel:${restaurant.phone}`}
                className="shrink-0 w-10 h-10 bg-green-500 rounded-full flex items-center justify-center hover:bg-green-600 transition-colors"
              >
                <Phone className="w-5 h-5 text-white" />
              </a>
            )}
          </div>
        </div>
        <p className="text-gray-700 text-sm leading-relaxed">
          {restaurant.address}
        </p>
      </div>

      {/* Block 3: Order Items */}
      <div className="bg-white p-4 rounded-lg border border-gray-300">
        <h3 className="text-xs text-gray-500 uppercase font-semibold mb-3">
          ORDER ITEMS
        </h3>
        <div className="space-y-3">
          {order_items.length > 0 ? (
            order_items.map((item, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="shrink-0 w-8 h-8 bg-green-500 rounded flex items-center justify-center">
                  <span className="text-white font-bold text-sm">
                    {item.quantity}x
                  </span>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800 text-base">
                    {item.food_name}
                  </p>
                  {item.size && (
                    <p className="text-sm text-gray-500 mt-0.5">
                      {item.size.charAt(0).toUpperCase() + item.size.slice(1)}
                    </p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-sm">No items found</p>
          )}
        </div>
      </div>

      {/* Block 4: Swipe to Pick Up */}
      <div className="pt-2">
        <SwipeToDeliver
          onSwipe={onPickedUp}
          disabled={updating}
          buttonText="SWIPE TO PICK UP"
          resetTrigger={`${pickup.delivery_id}-${updating ? "busy" : "idle"}`}
        />
      </div>
    </div>
  );
}

function DeliveryInfo({ delivery, onDelivered, updating }) {
  const {
    order_number,
    customer,
    pricing,
    distance_km,
    estimated_time_minutes,
    items = [],
    delivery_id,
  } = delivery;

  return (
    <div className="space-y-3">
      {/* Block 1: Order ID with Distance and Time */}
      <div className="bg-white p-4 rounded-lg border border-gray-300">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold mb-1">
              ORDER ID
            </p>
            <p className="text-base font-bold text-gray-800">#{order_number}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-green-50 px-2 py-1 rounded">
              <svg
                className="w-4 h-4 text-green-600"
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
              <span className="text-sm font-bold text-green-700">
                {distance_km} km
              </span>
            </div>
            <div className="flex items-center gap-1 bg-green-50 px-2 py-1 rounded">
              <svg
                className="w-4 h-4 text-green-600"
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
              <span className="text-sm font-bold text-green-700">
                {estimated_time_minutes} min
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Block 2: Customer Name, Address, and Phone */}
      <div className="bg-white p-4 rounded-lg border border-gray-300">
        <div className="flex items-start justify-between mb-2">
          <h2 className="text-xl font-bold text-green-600">{customer.name}</h2>
          <div className="flex items-center gap-2">
            {/* Navigate to Customer in Google Maps */}
            <button
              onClick={() =>
                openGoogleMapsNavigation(
                  customer.latitude,
                  customer.longitude,
                  customer.name,
                )
              }
              className="shrink-0 w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center hover:bg-blue-600 transition-colors"
              title="Navigate in Google Maps"
            >
              <Navigation className="w-5 h-5 text-white" />
            </button>
            {customer.phone && (
              <a
                href={`tel:${customer.phone}`}
                className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center hover:bg-green-600 transition-colors"
              >
                <Phone className="w-8 h-8 text-green-500" />
              </a>
            )}
          </div>
        </div>
        <p className="text-gray-700 text-sm leading-relaxed">
          {customer.address}
          {customer.city && (
            <span className="block text-gray-500 mt-1">{customer.city}</span>
          )}
        </p>
      </div>

      {/* Block 3: Order Items */}
      <div className="bg-white p-4 rounded-lg border border-gray-300">
        <h3 className="text-xs text-gray-500 uppercase font-semibold mb-3">
          ORDER ITEMS
        </h3>
        <div className="space-y-3">
          {items.length > 0 ? (
            items.map((item, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="shrink-0 w-8 h-8 bg-green-50 rounded-xl flex items-center justify-center">
                  <span className="text-green-500 font-bold text-sm">
                    {item.quantity}x
                  </span>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800 text-base">
                    {item.food_name}
                  </p>
                  {item.size && (
                    <p className="text-sm text-gray-500 mt-0.5">
                      {item.size.charAt(0).toUpperCase() + item.size.slice(1)}
                    </p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-sm">No items found</p>
          )}
        </div>
      </div>

      {/* Block 4: Total Amount to Collect */}
      <div className="bg-white p-4 rounded-lg border border-gray-300">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold mb-1">
              TOTAL AMOUNT
            </p>
            <p className="text-2xl font-bold text-green-600">
              Rs. {pricing?.total?.toFixed(2) || "0.00"}
            </p>
          </div>
        </div>
      </div>

      {/* Block 5: Delivery Proof Photo (Optional) */}
      <DeliveryProofUpload
        deliveryId={delivery_id}
        onUploaded={(url) => console.log("Proof uploaded:", url)}
      />

      {/* Block 6: Swipe to Deliver */}
      <div className="pt-2">
        <SwipeToDeliver
          onSwipe={onDelivered}
          disabled={updating}
          buttonText="SWIPE TO DELIVER"
          resetTrigger={`${delivery_id}-${updating ? "busy" : "idle"}`}
        />
      </div>
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
