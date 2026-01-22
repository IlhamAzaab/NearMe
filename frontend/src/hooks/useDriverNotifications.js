import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || "https://your-project.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || "your-anon-key";

/**
 * Custom Hook: useDriverNotifications
 *
 * Subscribes to real-time notifications for drivers using Supabase Realtime
 *
 * Features:
 * - Auto-subscribe on mount
 * - Listen for new delivery notifications
 * - Update unread count in real-time
 * - Mark notifications as read
 * - Auto-cleanup on unmount
 *
 * Usage:
 * const {
 *   notifications,
 *   unreadCount,
 *   loading,
 *   markAsRead,
 *   subscriptionStatus
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
  const [subscriptionStatus, setSubscriptionStatus] = useState("idle"); // idle, subscribing, subscribed, error

  const supabaseRef = useRef(null);
  const subscriptionRef = useRef(null);
  const channelRef = useRef(null);

  // Initialize Supabase client
  useEffect(() => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClient(supabaseUrl, supabaseAnonKey, {
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      });
    }
  }, []);

  // Fetch initial notifications
  const fetchInitialNotifications = useCallback(async () => {
    if (!driverId || !supabaseRef.current) {
      console.warn("⚠️ Cannot fetch: driverId or supabase client missing", {
        driverId,
        supabase: !!supabaseRef.current,
      });
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log(`📥 Fetching notifications for driver: ${driverId}`);

      const { data, error: fetchError } = await supabaseRef.current
        .from("notifications")
        .select("*")
        .eq("recipient_id", driverId)
        .eq("recipient_role", "driver")
        .order("created_at", { ascending: false })
        .limit(100);

      if (fetchError) {
        console.error("❌ Fetch error:", fetchError);
        console.error("   Error code:", fetchError.code);
        console.error("   Error message:", fetchError.message);
        console.error("   Error details:", fetchError.details);
        console.error("   Error hint:", fetchError.hint);
        throw fetchError;
      }

      console.log(`✅ Fetched ${data?.length || 0} notifications`);
      setNotifications(data || []);
      const unread = (data || []).filter((n) => !n.is_read).length;
      setUnreadCount(unread);
      console.log(`   Unread: ${unread}`);
    } catch (err) {
      console.error("❌ Error fetching notifications:", err);
      setError(err.message);
    } finally {
      setLoading(false);
      console.log("✅ Loading set to false");
    }
  }, [driverId]);

  // Mark notification as read
  const markAsRead = useCallback(
    async (notificationId) => {
      if (!driverId || !supabaseRef.current) return;

      try {
        const { error } = await supabaseRef.current
          .from("notifications")
          .update({
            is_read: true,
            read_at: new Date().toISOString(),
          })
          .eq("id", notificationId)
          .eq("recipient_id", driverId);

        if (error) {
          throw error;
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

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    if (!driverId || !supabaseRef.current) return;

    try {
      const { error } = await supabaseRef.current
        .from("notifications")
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq("recipient_id", driverId)
        .eq("recipient_role", "driver")
        .eq("is_read", false);

      if (error) {
        throw error;
      }

      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Error marking all as read:", err);
    }
  }, [driverId]);

  // Subscribe to real-time notifications
  const subscribeToNotifications = useCallback(() => {
    if (!realtimeEnabled || !driverId || !supabaseRef.current) {
      console.warn(
        "⚠️ Cannot subscribe: realtimeEnabled=",
        realtimeEnabled,
        "driverId=",
        driverId,
      );
      return;
    }

    try {
      setSubscriptionStatus("subscribing");
      console.log(
        `🔔 Setting up Realtime subscription for driver: ${driverId}`,
      );

      // Create a channel for this driver's notifications
      const channel = supabaseRef.current
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
            console.log("📡 Realtime event received:", payload);
            const newNotif = payload.new;

            console.log("🔍 Checking notification:", {
              recipient_id: newNotif.recipient_id,
              recipient_role: newNotif.recipient_role,
              type: newNotif.type,
              driverId,
              filterTypes,
            });

            // Only handle notifications for this driver and matching types
            if (
              newNotif.recipient_id === driverId &&
              newNotif.recipient_role === "driver" &&
              filterTypes.includes(newNotif.type)
            ) {
              console.log("✅ New notification ADDED:", newNotif);

              // Add to notifications array
              setNotifications((prev) => [newNotif, ...prev]);
              setUnreadCount((prev) => prev + 1);

              // Call callback if provided
              if (onNewNotification) {
                onNewNotification(newNotif);
              }
            } else {
              console.warn("❌ Notification filtered out:", {
                idMatch: newNotif.recipient_id === driverId,
                roleMatch: newNotif.recipient_role === "driver",
                typeMatch: filterTypes.includes(newNotif.type),
              });
            }
          },
        )
        .subscribe((status) => {
          console.log(`📊 Realtime subscription status: ${status}`);
          setSubscriptionStatus(
            status === "SUBSCRIBED" ? "subscribed" : "error",
          );

          if (status === "SUBSCRIBED") {
            console.log("✅ Successfully subscribed to notifications");
          } else if (status === "CLOSED") {
            console.warn("⚠️ Subscription closed");
          } else if (status === "CHANNEL_ERROR") {
            console.error("❌ Channel error");
          }
        });

      channelRef.current = channel;
    } catch (err) {
      console.error("Error subscribing to notifications:", err);
      setError(err.message);
      setSubscriptionStatus("error");
    }
  }, [driverId, realtimeEnabled, filterTypes, onNewNotification]);

  // Setup and cleanup
  useEffect(() => {
    if (!autoSubscribe || !driverId) {
      console.log("⏳ Waiting for driverId to be set...", {
        autoSubscribe,
        driverId,
      });
      return;
    }

    console.log(`🔄 Initializing notifications for driver: ${driverId}`);

    // Fetch initial notifications first
    const initializeFetch = async () => {
      await fetchInitialNotifications();
      // Subscribe after initial fetch completes
      subscribeToNotifications();
    };

    initializeFetch();

    // Cleanup
    return () => {
      if (channelRef.current) {
        console.log("🧹 Cleaning up Realtime subscription");
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
