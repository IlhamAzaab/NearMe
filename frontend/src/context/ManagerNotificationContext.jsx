/**
 * Manager Notification Context
 *
 * Manages manager notification popups:
 * 1. Unassigned delivery alerts  → continuous alert sound until clicked
 * 2. Order milestones (every 10) → success chime plays once, stays until dismissed
 * 3. Earnings milestones (Rs.2000)→ success chime plays once, stays until dismissed
 *
 * Works across all pages (global provider in App.jsx).
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

const ManagerNotificationContext = createContext(null);

export const useManagerNotifications = () => {
  const ctx = useContext(ManagerNotificationContext);
  return (
    ctx || {
      notifications: [],
      dismissNotification: () => {},
      dismissAll: () => {},
    }
  );
};

// ── Alert Sound (continuous loop for unassigned deliveries) ──────────────
function createAlertSound() {
  let audioElement = null;
  let isPlaying = false;
  let webAudioCtx = null;
  let toneInterval = null;

  const play = () => {
    if (isPlaying) return;
    isPlaying = true;

    try {
      audioElement = new Audio("/delivery-alert.wav");
      audioElement.loop = true;
      audioElement.volume = 0.7;
      audioElement.play().catch(() => tryWebAudioFallback());
    } catch {
      tryWebAudioFallback();
    }
  };

  const tryWebAudioFallback = () => {
    try {
      webAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const playBeep = () => {
        if (!isPlaying || !webAudioCtx) return;
        const osc = webAudioCtx.createOscillator();
        const gain = webAudioCtx.createGain();
        osc.connect(gain);
        gain.connect(webAudioCtx.destination);
        osc.frequency.value = 880;
        gain.gain.value = 0.3;
        osc.start();
        osc.stop(webAudioCtx.currentTime + 0.15);
      };
      playBeep();
      toneInterval = setInterval(playBeep, 800);
    } catch {
      /* silent */
    }
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
    if (webAudioCtx) {
      webAudioCtx.close().catch(() => {});
      webAudioCtx = null;
    }
  };

  return { play, stop, isPlaying: () => isPlaying };
}

// ── Success Sound (single chime for milestones) ─────────────────────────
function playSuccessChime() {
  try {
    const audio = new Audio("/success-alert.wav");
    audio.volume = 0.6;
    audio.play().catch(() => {
      // Web Audio fallback: play a quick ascending tone
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        [523, 659, 784].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = freq;
          gain.gain.value = 0.2;
          osc.start(ctx.currentTime + i * 0.12);
          osc.stop(ctx.currentTime + i * 0.12 + 0.15);
        });
      } catch {
        /* silent */
      }
    });
  } catch {
    /* silent */
  }
}

// ── Provider ────────────────────────────────────────────────────────────
export function ManagerNotificationProvider({ children }) {
  const { socket } = useSocket();
  const [notifications, setNotifications] = useState([]);
  const notificationsRef = useRef([]);
  const alertSoundRef = useRef(null);

  // Keep ref in sync
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  // Lazy-init alert sound
  const getAlertSound = useCallback(() => {
    if (!alertSoundRef.current) {
      alertSoundRef.current = createAlertSound();
    }
    return alertSoundRef.current;
  }, []);

  // Manage alert sound: play when any unassigned delivery notification exists
  useEffect(() => {
    const hasUnassigned = notifications.some(
      (n) => n.type === "unassigned_delivery",
    );
    const sound = getAlertSound();
    if (hasUnassigned) {
      sound.play();
    } else {
      sound.stop();
    }
  }, [notifications, getAlertSound]);

  // Cleanup sound on unmount
  useEffect(() => {
    return () => {
      if (alertSoundRef.current) {
        alertSoundRef.current.stop();
      }
    };
  }, []);

  // Add a notification
  const addNotification = useCallback((data) => {
    const id = `${data.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const notification = { id, timestamp: Date.now(), ...data };

    setNotifications((prev) => {
      // For unassigned deliveries, deduplicate by delivery_id
      if (data.type === "unassigned_delivery") {
        const exists = prev.some(
          (n) =>
            n.type === "unassigned_delivery" &&
            n.delivery_id === data.delivery_id,
        );
        if (exists) {
          // Update existing instead of adding duplicate
          return prev.map((n) =>
            n.type === "unassigned_delivery" &&
            n.delivery_id === data.delivery_id
              ? { ...n, ...data, timestamp: Date.now() }
              : n,
          );
        }
      }
      return [...prev, notification];
    });

    // For milestones, play success chime once
    if (data.type === "order_milestone" || data.type === "earnings_milestone") {
      playSuccessChime();
    }

    // Browser push notification
    if (Notification.permission === "granted") {
      try {
        const titles = {
          unassigned_delivery: "⚠️ Unassigned Delivery Alert",
          order_milestone: "🎉 Order Milestone!",
          earnings_milestone: "💰 Earnings Milestone!",
        };
        new Notification(titles[data.type] || "Manager Notification", {
          body: data.message || "You have a new notification",
          icon: "/icon-192.png",
          tag:
            data.type === "unassigned_delivery"
              ? `unassigned-${data.delivery_id}`
              : id,
          requireInteraction: data.type === "unassigned_delivery",
        });
      } catch {
        /* silent */
      }
    }
  }, []);

  // Dismiss a single notification
  const dismissNotification = useCallback((notificationId) => {
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
  }, []);

  // Dismiss all notifications
  const dismissAll = useCallback(() => {
    setNotifications([]);
  }, []);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    const handleUnassigned = (data) => {
      console.log("[ManagerNotif] 📦 Unassigned delivery alert:", data);
      addNotification({ ...data, type: "unassigned_delivery" });
    };

    const handleOrderMilestone = (data) => {
      console.log("[ManagerNotif] 🎉 Order milestone:", data);
      addNotification({ ...data, type: "order_milestone" });
    };

    const handleEarningsMilestone = (data) => {
      console.log("[ManagerNotif] 💰 Earnings milestone:", data);
      addNotification({ ...data, type: "earnings_milestone" });
    };

    // Also clear unassigned alert when delivery gets taken
    const handleDeliveryTaken = (data) => {
      console.log("[ManagerNotif] ✅ Delivery taken, clearing alert:", data);
      setNotifications((prev) =>
        prev.filter(
          (n) =>
            !(
              n.type === "unassigned_delivery" &&
              n.delivery_id === data.delivery_id
            ),
        ),
      );
    };

    socket.on("manager:unassigned_delivery", handleUnassigned);
    socket.on("manager:order_milestone", handleOrderMilestone);
    socket.on("manager:earnings_milestone", handleEarningsMilestone);
    socket.on("delivery:taken", handleDeliveryTaken);

    return () => {
      socket.off("manager:unassigned_delivery", handleUnassigned);
      socket.off("manager:order_milestone", handleOrderMilestone);
      socket.off("manager:earnings_milestone", handleEarningsMilestone);
      socket.off("delivery:taken", handleDeliveryTaken);
    };
  }, [socket, addNotification]);

  // Request notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const value = {
    notifications,
    dismissNotification,
    dismissAll,
  };

  return (
    <ManagerNotificationContext.Provider value={value}>
      {children}
    </ManagerNotificationContext.Provider>
  );
}

export default ManagerNotificationContext;
