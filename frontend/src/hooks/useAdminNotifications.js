// ============================================================================
// Real-time Notification Hook for Admin Dashboard
// Place in: frontend/src/hooks/useAdminNotifications.js
// ============================================================================

import { useState, useEffect, useCallback } from "react";
import supabaseClient from "../supabaseClient";
import { API_URL } from "../config";

export function useAdminNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [newNotification, setNewNotification] = useState(null);
  const [loading, setLoading] = useState(true);

  const adminId = localStorage.getItem("userId");
  const role = localStorage.getItem("role");

  // Fetch initial notifications via backend API
  const fetchNotifications = useCallback(async () => {
    if (role !== "admin" || !adminId) return;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/admin/notifications?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });

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

  // Mark notification as read via backend API
  const markAsRead = useCallback(async (notificationId) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_URL}/admin/notifications/${notificationId}/read`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!res.ok) throw new Error("Failed to mark as read");

      // Update local state
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, is_read: true } : n,
        ),
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
    if (!supabaseClient || !adminId || role !== "admin") return;

    // Subscribe to role-based channel (matches your trigger setup)
    const channel = supabaseClient
      .channel("role:admin:notifications")
      .on("broadcast", { event: "insert" }, (payload) => {
        const newNotif = payload.payload;

        // Only add if it's for this admin
        if (newNotif.recipient_id === adminId) {
          setNotifications((prev) => [newNotif, ...prev]);
          setUnreadCount((prev) => prev + 1);
          setNewNotification(newNotif);
          setTimeout(() => setNewNotification(null), 100);
        }
      })
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
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
