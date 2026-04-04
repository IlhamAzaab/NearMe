/**
 * Driver Delivery Notification Context
 *
 * Manages delivery notification popups for drivers:
 * - Listens for WebSocket `delivery:new` and `delivery:tip_updated` events
 * - Shows stacking notification popups with alert sound
 * - Sound loops until driver accepts or declines
 * - Works across all pages (global provider)
 * - Triggers browser Push Notifications for background/closed tab
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { useSocket } from "./SocketContext";
import { API_URL } from "../config";
import { readAvailableDeliveriesCache } from "../utils/availableDeliveriesCache";

const DriverDeliveryNotificationContext = createContext(null);

export const useDriverDeliveryNotifications = () => {
  const ctx = useContext(DriverDeliveryNotificationContext);
  return (
    ctx || {
      notifications: [],
      acceptDelivery: () => {},
      declineDelivery: () => {},
      navigateToDelivery: () => {},
      setDriverOnline: () => {},
      isDriverOnline: false,
    }
  );
};

// Generate alert sound using Web Audio API (loops until stopped)
function createAlertSound() {
  let audioContext = null;
  let isPlaying = false;
  let audioElement = null;

  const play = () => {
    if (isPlaying) return;
    isPlaying = true;

    try {
      // Use HTML Audio element with loop for reliable looping
      audioElement = new Audio("/driver-alert-tone.wav");
      audioElement.loop = true;
      audioElement.volume = 0.7;
      audioElement.play().catch((err) => {
        console.warn("[Alert Sound] Cannot play audio:", err.message);
        // Try with AudioContext as fallback
        tryWebAudioFallback();
      });
    } catch (e) {
      console.warn("[Alert Sound] Audio creation error:", e);
      tryWebAudioFallback();
    }
  };

  const tryWebAudioFallback = () => {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      playTone();
    } catch (e) {
      console.warn("[Alert Sound] Web Audio fallback failed:", e);
    }
  };

  let toneInterval = null;
  const playTone = () => {
    if (!audioContext || !isPlaying) return;

    const playBeep = () => {
      if (!isPlaying || !audioContext) return;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.connect(gain);
      gain.connect(audioContext.destination);

      osc.frequency.setValueAtTime(880, audioContext.currentTime);
      osc.frequency.setValueAtTime(1100, audioContext.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.3,
      );

      osc.start(audioContext.currentTime);
      osc.stop(audioContext.currentTime + 0.3);
    };

    playBeep();
    toneInterval = setInterval(playBeep, 500);
  };

  const stop = () => {
    isPlaying = false;
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
      audioElement = null;
    }
    if (toneInterval) {
      clearInterval(toneInterval);
      toneInterval = null;
    }
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
  };

  return { play, stop, isPlaying: () => isPlaying };
}

export function DriverDeliveryNotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  // Default to true if logged in as driver — driver is always online unless
  // explicitly offline (manual toggle, working hours, or admin closed)
  const [isDriverOnline, setIsDriverOnline] = useState(() => {
    const role = localStorage.getItem("role");
    const token = localStorage.getItem("token");
    return role === "driver" && !!token;
  });
  const { socket, isConnected } = useSocket();
  const alertSoundRef = useRef(null);
  const navigateRef = useRef(null); // Will be set by the notification overlay component
  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;
  const isDriverOnlineRef = useRef(isDriverOnline);
  isDriverOnlineRef.current = isDriverOnline;

  // Set navigate function from the overlay component
  const setNavigate = useCallback((nav) => {
    navigateRef.current = nav;
  }, []);

  // Update driver online status (called from Dashboard when status changes)
  const setDriverOnline = useCallback((online) => {
    setIsDriverOnline(online);
    // If driver goes offline, clear all pending notifications
    if (!online) {
      setNotifications([]);
      if (alertSoundRef.current) {
        alertSoundRef.current.stop();
      }
    }
  }, []);

  // Initialize alert sound
  useEffect(() => {
    alertSoundRef.current = createAlertSound();
    return () => {
      if (alertSoundRef.current) {
        alertSoundRef.current.stop();
      }
    };
  }, []);

  // Manage sound based on notification count
  useEffect(() => {
    if (notifications.length > 0) {
      if (alertSoundRef.current && !alertSoundRef.current.isPlaying()) {
        alertSoundRef.current.play();
      }
    } else {
      if (alertSoundRef.current) {
        alertSoundRef.current.stop();
      }
    }
  }, [notifications.length]);

  // Add a new delivery notification
  const enrichWithCachedAvailableDelivery = useCallback((deliveryData) => {
    try {
      const userId = localStorage.getItem("userId") || "default";
      const snapshot = readAvailableDeliveriesCache(userId, 5 * 60 * 1000);
      const available = snapshot?.deliveries || [];
      const match = available.find(
        (d) => String(d?.delivery_id) === String(deliveryData?.delivery_id),
      );

      if (!match) return deliveryData;

      const routeImpact = match.route_impact || {};
      const pricing = match.pricing || {};
      const activeDeliveries = Number(
        snapshot?.currentRoute?.active_deliveries || 0,
      );
      const hasRouteExtraSignals =
        Number(routeImpact.extra_distance_km || 0) > 0 ||
        Number(routeImpact.extra_time_minutes || 0) > 0 ||
        Number(routeImpact.extra_earnings || 0) > 0 ||
        Number(routeImpact.bonus_amount || 0) > 0;

      const stackedByContext =
        routeImpact.is_first_delivery === false ||
        hasRouteExtraSignals ||
        activeDeliveries > 0;

      const inferredSequence =
        Number(routeImpact.delivery_sequence || 0) ||
        (stackedByContext
          ? activeDeliveries + 1 || 2
          : Number(deliveryData?.delivery_sequence || 0) || 1);

      return {
        ...deliveryData,
        delivery_sequence: inferredSequence,
        driver_earnings:
          Number(deliveryData?.driver_earnings || 0) ||
          Number(pricing.total_trip_earnings || 0) ||
          Number(routeImpact.total_trip_earnings || 0),
        total_trip_earnings:
          Number(deliveryData?.total_trip_earnings || 0) ||
          Number(pricing.total_trip_earnings || 0) ||
          Number(routeImpact.total_trip_earnings || 0),
        base_amount:
          Number(deliveryData?.base_amount || 0) ||
          Number(routeImpact.base_amount || 0) ||
          Number(pricing.total_trip_earnings || 0),
        extra_earnings:
          Number(deliveryData?.extra_earnings || 0) ||
          Number(routeImpact.extra_earnings || 0),
        bonus_amount:
          Number(deliveryData?.bonus_amount || 0) ||
          Number(routeImpact.bonus_amount || 0),
        tip_amount:
          Number(deliveryData?.tip_amount || 0) ||
          Number(pricing.tip_amount || 0),
        total_distance_km:
          Number(deliveryData?.total_distance_km || 0) ||
          Number(match.total_delivery_distance_km || 0) ||
          Number(routeImpact.r1_distance_km || 0),
        distance_km:
          Number(deliveryData?.distance_km || 0) ||
          Number(match.total_delivery_distance_km || 0),
        estimated_time:
          Number(deliveryData?.estimated_time || 0) ||
          Number(match.estimated_time_minutes || 0),
        extra_distance_km:
          Number(deliveryData?.extra_distance_km || 0) ||
          Number(routeImpact.extra_distance_km || 0),
        extra_time_minutes:
          Number(deliveryData?.extra_time_minutes || 0) ||
          Number(routeImpact.extra_time_minutes || 0),
      };
    } catch {
      return deliveryData;
    }
  }, []);

  const addNotification = useCallback(
    (deliveryData) => {
      const enriched = enrichWithCachedAvailableDelivery(deliveryData);

      setNotifications((prev) => {
        // Prevent duplicates
        if (prev.some((n) => n.delivery_id === enriched.delivery_id)) {
          // If it's a tip update, update the existing notification
          if (enriched.type === "tip_update") {
            return prev.map((n) =>
              n.delivery_id === enriched.delivery_id
                ? {
                    ...n,
                    ...enriched,
                    type: "tip_update",
                    updatedAt: Date.now(),
                  }
                : n,
            );
          }
          return prev;
        }
        // New notifications go on top (stack)
        return [{ ...enriched, notifiedAt: Date.now() }, ...prev];
      });

      // Request browser notification permission and show
      showBrowserNotification(enriched);
    },
    [enrichWithCachedAvailableDelivery],
  );

  // Remove notification (decline) - stop sound immediately
  const declineDelivery = useCallback((deliveryId) => {
    // Stop sound IMMEDIATELY on click (before state update)
    const remaining = notificationsRef.current.filter(
      (n) => n.delivery_id !== deliveryId,
    );
    if (remaining.length === 0 && alertSoundRef.current) {
      alertSoundRef.current.stop();
    }
    setNotifications(remaining);
  }, []);

  // Accept a delivery - stop sound immediately on click
  const acceptDelivery = useCallback(async (deliveryId, driverLocation) => {
    // IMMEDIATELY stop sound and remove notification on click
    if (alertSoundRef.current) {
      alertSoundRef.current.stop();
    }
    // Remove notification instantly from UI
    const remaining = notificationsRef.current.filter(
      (n) => n.delivery_id !== deliveryId,
    );
    setNotifications(remaining);

    const notification = notificationsRef.current.find(
      (n) => n.delivery_id === deliveryId,
    );
    if (!notification)
      return { success: false, message: "Notification not found" };

    try {
      const token = localStorage.getItem("token");

      const body = {
        driver_latitude: driverLocation?.latitude,
        driver_longitude: driverLocation?.longitude,
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
        // Restart sound if there are still other notifications pending
        if (remaining.length > 0 && alertSoundRef.current) {
          alertSoundRef.current.play();
        }
        return { success: true, data };
      } else {
        // Restart sound if there are still other notifications pending
        if (remaining.length > 0 && alertSoundRef.current) {
          alertSoundRef.current.play();
        }
        return {
          success: false,
          message: data.message || "Failed to accept delivery",
        };
      }
    } catch (e) {
      console.error("[Accept Delivery] Error:", e);
      // Restart sound if there are still other notifications pending
      if (remaining.length > 0 && alertSoundRef.current) {
        alertSoundRef.current.play();
      }
      return {
        success: false,
        message: "Network error - could not accept delivery",
      };
    }
  }, []);

  // Navigate to delivery details
  const navigateToDelivery = useCallback((deliveryId) => {
    if (navigateRef.current) {
      navigateRef.current(`/driver/deliveries`, {
        state: { highlightDelivery: deliveryId },
      });
    }
  }, []);

  // Show browser push notification (works when tab is in background or minimized)
  const showBrowserNotification = useCallback((deliveryData) => {
    if (!("Notification" in window)) return;

    const showNotif = () => {
      const isStacked =
        Number(deliveryData.delivery_sequence || 1) > 1 ||
        parseFloat(deliveryData.extra_distance_km || 0) > 0 ||
        parseFloat(deliveryData.extra_time_minutes || 0) > 0 ||
        parseFloat(deliveryData.extra_earnings || 0) > 0 ||
        parseFloat(deliveryData.bonus_amount || 0) > 0;
      const baseAmount = parseFloat(
        deliveryData.base_amount ||
          deliveryData.driver_earnings ||
          deliveryData.total_trip_earnings ||
          0,
      );
      const deliveryComponent = isStacked
        ? parseFloat(deliveryData.extra_earnings || 0)
        : baseAmount;
      const bonusComponent = parseFloat(deliveryData.bonus_amount || 0);
      const tipComponent = parseFloat(deliveryData.tip_amount || 0);
      const totalDisplay = deliveryComponent + bonusComponent + tipComponent;

      const earnings = `Rs.${totalDisplay.toFixed(2)} (${[
        `Delivery Rs.${deliveryComponent.toFixed(0)}`,
        bonusComponent > 0 ? `Bonus Rs.${bonusComponent.toFixed(0)}` : null,
        tipComponent > 0 ? `Tip Rs.${tipComponent.toFixed(0)}` : null,
      ]
        .filter(Boolean)
        .join(" + ")})`;

      const title =
        deliveryData.type === "tip_update"
          ? "💰 Tip Added to Delivery!"
          : "🚨 New Delivery Available!";

      const distKm = isStacked
        ? parseFloat(deliveryData.extra_distance_km || 0)
        : parseFloat(
            deliveryData.total_distance_km || deliveryData.distance_km || 0,
          );
      const estTime = isStacked
        ? parseFloat(deliveryData.extra_time_minutes || 0)
        : parseFloat(deliveryData.estimated_time || 0);
      const body =
        `${earnings} - ${deliveryData.restaurant_name || "Restaurant"}\n${distKm > 0 ? distKm.toFixed(1) + " km" : ""} ${estTime > 0 ? Math.round(estTime) + " mins" : ""}`.trim();

      try {
        // Try service worker notification first (survives tab close)
        if (navigator.serviceWorker?.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: "SHOW_NOTIFICATION",
            title,
            body,
            tag: `delivery-${deliveryData.delivery_id}`,
            data: deliveryData,
          });
        } else {
          // Fallback to Notification API
          const notification = new Notification(title, {
            body,
            icon: "/delivery-icon.png",
            badge: "/delivery-icon.png",
            tag: `delivery-${deliveryData.delivery_id}`,
            requireInteraction: true,
            vibrate: [200, 100, 200, 100, 200],
          });

          notification.onclick = () => {
            window.focus();
            if (navigateRef.current) {
              navigateRef.current(`/driver/deliveries`);
            }
            notification.close();
          };
        }
      } catch (e) {
        console.warn("[Browser Notification] Error:", e);
      }
    };

    if (Notification.permission === "granted") {
      showNotif();
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") showNotif();
      });
    }
  }, []);

  // Listen for WebSocket events
  useEffect(() => {
    if (!socket) return;

    const role = localStorage.getItem("role");
    if (role !== "driver") return;

    const handleNewDelivery = (data) => {
      console.log("[DeliveryNotification] 🚨 New delivery received:", data);

      // Only show notifications if driver is online
      if (!isDriverOnlineRef.current) {
        console.log(
          "[DeliveryNotification] Driver is offline, ignoring notification",
        );
        return;
      }

      addNotification({
        delivery_id: data.delivery_id,
        order_id: data.order_id,
        order_number: data.order_number,
        type: "new_delivery",
        restaurant_name: data.restaurant?.name || "Restaurant",
        restaurant_address: data.restaurant?.address || "",
        restaurant_latitude: data.restaurant?.latitude,
        restaurant_longitude: data.restaurant?.longitude,
        customer_address: data.customer?.address || "",
        customer_city: data.customer?.city || "",
        customer_latitude: data.customer?.latitude,
        customer_longitude: data.customer?.longitude,
        total_amount: data.total_amount || 0,
        distance_km: data.distance_km || null,
        estimated_time: data.estimated_time || null,
        driver_earnings: data.driver_earnings || 0,
        total_trip_earnings: data.total_trip_earnings || 0,
        extra_earnings: data.extra_earnings || 0,
        bonus_amount: data.bonus_amount || 0,
        tip_amount: data.tip_amount || 0,
        delivery_sequence: data.delivery_sequence || 1,
        earnings_data: data.earnings_data || null,
      });
    };

    const handleTipUpdate = (data) => {
      console.log("[DeliveryNotification] 💰 Tip update received:", data);

      // Only show notifications if driver is online
      if (!isDriverOnlineRef.current) {
        console.log(
          "[DeliveryNotification] Driver is offline, ignoring tip update",
        );
        return;
      }

      addNotification({
        delivery_id: data.delivery_id,
        order_id: data.order_id,
        order_number: data.order_number,
        type: "tip_update",
        restaurant_name: data.restaurant_name || "Restaurant",
        restaurant_address: data.restaurant_address || "",
        customer_address: data.customer_address || "",
        distance_km: data.distance_km || null,
        estimated_time: data.estimated_time || null,
        driver_earnings: data.driver_earnings || 0,
        total_trip_earnings: data.total_trip_earnings || 0,
        extra_earnings: data.extra_earnings || 0,
        bonus_amount: data.bonus_amount || 0,
        tip_amount: data.tip_amount || 0,
        delivery_sequence: data.delivery_sequence || 1,
        earnings_data: data.earnings_data || null,
      });
    };

    // Also remove notification when delivery is taken by another driver
    const handleDeliveryTaken = (data) => {
      console.log("[DeliveryNotification] Delivery taken:", data.delivery_id);
      setNotifications((prev) =>
        prev.filter((n) => n.delivery_id !== data.delivery_id),
      );
    };

    // Driver daily delivery milestone (every 10 deliveries today)
    const handleDriverMilestone = (data) => {
      console.log("[DeliveryNotification] 🎉 Driver milestone:", data);

      // Only show milestone notifications if driver is online
      if (!isDriverOnlineRef.current) {
        console.log(
          "[DeliveryNotification] Driver is offline, ignoring milestone",
        );
        return;
      }

      // Play success sound
      try {
        const audio = new Audio("/success-alert.wav");
        audio.volume = 0.6;
        audio.play().catch(() => {});
      } catch {}
      // Show browser notification
      if (Notification.permission === "granted") {
        try {
          new Notification("🎉 Delivery Milestone!", {
            body:
              data.message ||
              `You completed ${data.milestone} deliveries today!`,
            icon: "/icon-192.png",
            tag: `driver-milestone-${data.milestone}`,
          });
        } catch {}
      }
      // Add as a milestone-type notification to the stack
      addNotification({
        delivery_id: `milestone-${Date.now()}`,
        type: "delivery_milestone",
        milestone: data.milestone,
        today_deliveries: data.today_deliveries,
        message: data.message,
      });
    };

    socket.on("delivery:new", handleNewDelivery);
    socket.on("delivery:tip_updated", handleTipUpdate);
    socket.on("delivery:taken", handleDeliveryTaken);
    socket.on("driver:delivery_milestone", handleDriverMilestone);

    return () => {
      socket.off("delivery:new", handleNewDelivery);
      socket.off("delivery:tip_updated", handleTipUpdate);
      socket.off("delivery:taken", handleDeliveryTaken);
      socket.off("driver:delivery_milestone", handleDriverMilestone);
    };
  }, [socket, addNotification]);

  // Request notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    // Register service worker for background notifications
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/delivery-sw.js")
        .then((reg) => {
          console.log(
            "[SW] Service worker registered for delivery notifications",
          );
        })
        .catch((err) => {
          console.warn("[SW] Service worker registration failed:", err);
        });
    }
  }, []);

  const value = {
    notifications,
    addNotification,
    declineDelivery,
    acceptDelivery,
    navigateToDelivery,
    setNavigate,
    setDriverOnline,
    isDriverOnline,
  };

  return (
    <DriverDeliveryNotificationContext.Provider value={value}>
      {children}
    </DriverDeliveryNotificationContext.Provider>
  );
}

export default DriverDeliveryNotificationProvider;
