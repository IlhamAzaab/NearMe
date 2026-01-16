// ============================================================================
// Real-time Notification Hook for Admin Dashboard
// Place in: frontend/src/hooks/useAdminNotifications.js
// ============================================================================

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export function useAdminNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [newNotification, setNewNotification] = useState(null);
  const [loading, setLoading] = useState(true);

  const adminId = localStorage.getItem("userId");
  const role = localStorage.getItem("role");

  // Fetch initial notifications
  const fetchNotifications = useCallback(async () => {
    if (role !== "admin" || !adminId) return;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        "http://localhost:5000/admin/notifications?limit=50",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) throw new Error("Failed to fetch notifications");

      const data = await res.json();
      const notifs = data.notifications || [];

      setNotifications(notifs);
      setUnreadCount(notifs.filter((n) => !n.is_read).length);
    } catch (error) {
      console.error("Fetch notifications error:", error);
    } finally {
      setLoading(false);
    }
  }, [adminId, role]);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `http://localhost:5000/admin/notifications/${notificationId}/read`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) throw new Error("Failed to mark as read");

      // Update local state
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Mark as read error:", error);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Subscribe to realtime notifications using broadcast (trigger-based)
  useEffect(() => {
    if (!supabase || !adminId || role !== "admin") return;

    console.log(
      "🔔 Setting up realtime broadcast subscription for admin:",
      adminId
    );

    // Subscribe to role-based channel (matches your trigger setup)
    const channel = supabase
      .channel("role:admin:notifications")
      .on("broadcast", { event: "insert" }, (payload) => {
        console.log("🆕 New notification broadcast received:", payload.payload);

        const newNotif = payload.payload;

        // Only add if it's for this admin
        if (newNotif.recipient_id === adminId) {
          // Add to notifications list
          setNotifications((prev) => [newNotif, ...prev]);
          setUnreadCount((prev) => prev + 1);

          // Trigger toast/sound (consumed by component)
          setNewNotification(newNotif);

          // Clear after 100ms (allows component to react)
          setTimeout(() => setNewNotification(null), 100);
        }
      })
      .subscribe((status) => {
        console.log("📡 Broadcast subscription status:", status);
      });

    return () => {
      console.log("🔌 Unsubscribing from broadcast notifications");
      supabase.removeChannel(channel);
    };
  }, [adminId, role]);

  return {
    notifications,
    unreadCount,
    newNotification,
    loading,
    markAsRead,
    refreshNotifications: fetchNotifications,
  };
}
