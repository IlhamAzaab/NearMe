import { useState, useEffect, useCallback, useRef } from "react";
import supabaseClient from "../supabaseClient";
import { API_URL } from "../config";

/**
 * Custom Hook: useDriverNotifications
 *
 * Fetches / mutates notifications via backend API (uses service_role).
 * Subscribes to real-time INSERT events via Supabase Realtime (anon key).
 *
 * SECURITY: All CRUD operations go through the backend API so the
 *           frontend never needs direct write access to the notifications table.
 *
 * Usage:
 * const {
 *   notifications,
 *   unreadCount,
 *   loading,
 *   markAsRead,
 *   markAllAsRead,
 *   subscriptionStatus,
 *   refetch,
 * } = useDriverNotifications(driverId);
 */

export const useDriverNotifications = (driverId, options = {}) => {
  const {
    autoSubscribe = true,
    realtimeEnabled = true,
    onNewNotification = null, // Callback when new notification arrives
    filterTypes = ["new_delivery"], // Types to listen for
  } = options;

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState("idle");

  const channelRef = useRef(null);

  // ──────────────────────────────────────────────
  // Fetch notifications via backend API (secure)
  // ──────────────────────────────────────────────
  const fetchInitialNotifications = useCallback(async () => {
    if (!driverId) return;

    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem("token");
      if (!token) {
        console.warn("⚠️ No auth token — cannot fetch notifications");
        setLoading(false);
        return;
      }

      const res = await fetch(`${API_URL}/driver/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch notifications: ${res.status}`);
      }

      const data = await res.json();
      const notifs = data.notifications || [];

      setNotifications(notifs);
      setUnreadCount(notifs.filter((n) => !n.is_read).length);
    } catch (err) {
      console.error("❌ Error fetching notifications:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  // ──────────────────────────────────────────────
  // Mark single notification as read (via backend API)
  // ──────────────────────────────────────────────
  const markAsRead = useCallback(
    async (notificationId) => {
      if (!driverId) return;

      try {
        const token = localStorage.getItem("token");
        if (!token) return;

        const res = await fetch(
          `${API_URL}/driver/notifications/${notificationId}/read`,
          {
            method: "PATCH",
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (!res.ok) {
          throw new Error(`Failed to mark notification read: ${res.status}`);
        }

        // Update local state
        setNotifications((prev) =>
          prev.map((notif) =>
            notif.id === notificationId ? { ...notif, is_read: true } : notif,
          ),
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (err) {
        console.error("Error marking notification as read:", err);
      }
    },
    [driverId],
  );

  // ──────────────────────────────────────────────
  // Mark ALL notifications as read (via backend API)
  // ──────────────────────────────────────────────
  const markAllAsRead = useCallback(async () => {
    if (!driverId) return;

    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const res = await fetch(
        `${API_URL}/driver/notifications/mark-all-read`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!res.ok) {
        throw new Error(`Failed to mark all as read: ${res.status}`);
      }

      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Error marking all as read:", err);
    }
  }, [driverId]);

  // ──────────────────────────────────────────────
  // Supabase Realtime subscription (INSERT only)
  // ──────────────────────────────────────────────
  const subscribeToNotifications = useCallback(() => {
    if (!realtimeEnabled || !driverId) return;

    try {
      setSubscriptionStatus("subscribing");

      const channel = supabaseClient
        .channel(`driver-notifications:${driverId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `recipient_id=eq.${driverId}`,
          },
          (payload) => {
            const newNotif = payload.new;

            if (
              newNotif.recipient_id === driverId &&
              newNotif.recipient_role === "driver" &&
              filterTypes.includes(newNotif.type)
            ) {
              setNotifications((prev) => [newNotif, ...prev]);
              setUnreadCount((prev) => prev + 1);

              if (onNewNotification) {
                onNewNotification(newNotif);
              }
            }
          },
        )
        .subscribe((status) => {
          setSubscriptionStatus(
            status === "SUBSCRIBED" ? "subscribed" : "error",
          );
        });

      channelRef.current = channel;
    } catch (err) {
      console.error("Error subscribing to notifications:", err);
      setError(err.message);
      setSubscriptionStatus("error");
    }
  }, [driverId, realtimeEnabled, filterTypes, onNewNotification]);

  // ──────────────────────────────────────────────
  // Setup & cleanup
  // ──────────────────────────────────────────────
  useEffect(() => {
    if (!autoSubscribe || !driverId) return;

    const init = async () => {
      await fetchInitialNotifications();
      subscribeToNotifications();
    };
    init();

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
    };
  }, [driverId, autoSubscribe]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    subscriptionStatus,
    markAsRead,
    markAllAsRead,
    refetch: fetchInitialNotifications,
  };
};

export default useDriverNotifications;
