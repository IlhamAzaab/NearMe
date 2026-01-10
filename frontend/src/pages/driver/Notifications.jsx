/**
 * Driver Notifications Page
 *
 * Features:
 * - Real-time notifications via Supabase
 * - New delivery alerts
 * - Status update notifications
 * - Mark as read functionality
 * - Quick actions on notifications
 */

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import DriverLayout from "../../components/DriverLayout";

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export default function DriverNotifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all, unread, new_order, status
  const [driverId, setDriverId] = useState(null);

  // ============================================================================
  // AUTH CHECK
  // ============================================================================

  useEffect(() => {
    const role = localStorage.getItem("role");
    const userId = localStorage.getItem("userId");

    if (role !== "driver") {
      navigate("/login");
      return;
    }

    setDriverId(userId);
  }, [navigate]);

  // ============================================================================
  // FETCH NOTIFICATIONS
  // ============================================================================

  const fetchNotifications = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:5000/driver/notifications?limit=100`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await response.json();
      if (response.ok) {
        setNotifications(data.notifications || []);
      } else {
        console.error("Failed to fetch notifications:", data.message);
      }
    } catch (error) {
      console.error("Fetch notifications error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (driverId) {
      fetchNotifications();
    }
  }, [driverId, fetchNotifications]);

  // ============================================================================
  // REAL-TIME SUBSCRIPTION
  // ============================================================================

  useEffect(() => {
    if (!supabase || !driverId) return;

    const channel = supabase
      .channel("driver-notifications-page")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${driverId}`,
        },
        (payload) => {
          console.log("New notification received:", payload);
          // Add to list
          setNotifications((prev) => [payload.new, ...prev]);
          // Play sound
          playNotificationSound();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [driverId]);

  const playNotificationSound = () => {
    try {
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 880;
      oscillator.type = "sine";
      gainNode.gain.value = 0.3;

      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.15);

      setTimeout(() => {
        const osc2 = audioContext.createOscillator();
        const gain2 = audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(audioContext.destination);
        osc2.frequency.value = 1100;
        osc2.type = "sine";
        gain2.gain.value = 0.3;
        osc2.start();
        osc2.stop(audioContext.currentTime + 0.15);
      }, 200);
    } catch (error) {
      console.log("Sound error:", error);
    }
  };

  // ============================================================================
  // MARK AS READ
  // ============================================================================

  const markAsRead = async (notificationId) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:5000/driver/notifications/${notificationId}/read`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId
              ? { ...n, is_read: true, read_at: new Date().toISOString() }
              : n
          )
        );
      }
    } catch (error) {
      console.error("Mark as read error:", error);
    }
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    for (const id of unreadIds) {
      await markAsRead(id);
    }
  };

  // ============================================================================
  // NOTIFICATION ACTIONS
  // ============================================================================

  const handleNotificationClick = (notification) => {
    // Mark as read
    if (!notification.is_read) {
      markAsRead(notification.id);
    }

    // Navigate based on type
    switch (notification.type) {
      case "new_order":
        navigate("/driver/deliveries");
        break;
      case "driver_assigned":
      case "order_picked_up":
      case "order_on_the_way":
        navigate("/driver/delivery/active");
        break;
      default:
        break;
    }
  };

  // ============================================================================
  // HELPERS
  // ============================================================================

  const getNotificationIcon = (type) => {
    switch (type) {
      case "new_order":
        return { icon: "🛵", bg: "bg-green-100", text: "text-green-600" };
      case "driver_assigned":
        return { icon: "✅", bg: "bg-blue-100", text: "text-blue-600" };
      case "order_picked_up":
        return { icon: "📦", bg: "bg-purple-100", text: "text-purple-600" };
      case "order_on_the_way":
        return { icon: "🚗", bg: "bg-orange-100", text: "text-orange-600" };
      case "order_delivered":
        return { icon: "🎉", bg: "bg-green-100", text: "text-green-600" };
      default:
        return { icon: "📢", bg: "bg-gray-100", text: "text-gray-600" };
    }
  };

  const getTimeAgo = (timestamp) => {
    if (!timestamp) return "";
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return then.toLocaleDateString();
  };

  const filteredNotifications = notifications.filter((n) => {
    if (filter === "all") return true;
    if (filter === "unread") return !n.is_read;
    if (filter === "new_order") return n.type === "new_order";
    if (filter === "status")
      return n.type !== "new_order" && n.type !== "driver_assigned";
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <DriverLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 lg:px-8 py-6">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Notifications
                </h1>
                <p className="text-gray-500 mt-1">
                  {unreadCount > 0
                    ? `${unreadCount} unread notification${
                        unreadCount > 1 ? "s" : ""
                      }`
                    : "All caught up!"}
                </p>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  Mark all as read
                </button>
              )}
            </div>

            {/* Filters */}
            <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
              {[
                { key: "all", label: "All" },
                { key: "unread", label: "Unread" },
                { key: "new_order", label: "New Orders" },
                { key: "status", label: "Status Updates" },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    filter === f.key
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {f.label}
                  {f.key === "unread" && unreadCount > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-white/20 rounded-full">
                      {unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Notifications List */}
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-4 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-4">Loading notifications...</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">🔔</span>
              </div>
              <p className="text-xl font-medium text-gray-800">
                No notifications
              </p>
              <p className="text-gray-500 mt-1">
                {filter === "all"
                  ? "You're all caught up!"
                  : `No ${filter.replace("_", " ")} notifications`}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotifications.map((notification) => {
                const iconStyle = getNotificationIcon(notification.type);

                return (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`bg-white rounded-xl border transition-all cursor-pointer hover:shadow-md ${
                      notification.is_read
                        ? "border-gray-100"
                        : "border-blue-200 bg-blue-50/30"
                    }`}
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-4">
                        {/* Icon */}
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center ${iconStyle.bg}`}
                        >
                          <span className="text-2xl">{iconStyle.icon}</span>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p
                                className={`font-semibold ${
                                  notification.is_read
                                    ? "text-gray-700"
                                    : "text-gray-900"
                                }`}
                              >
                                {notification.title}
                              </p>
                              <p
                                className={`mt-1 ${
                                  notification.is_read
                                    ? "text-gray-500"
                                    : "text-gray-700"
                                }`}
                              >
                                {notification.message}
                              </p>
                            </div>
                            {!notification.is_read && (
                              <div className="w-2.5 h-2.5 bg-blue-500 rounded-full flex-shrink-0 mt-2"></div>
                            )}
                          </div>

                          {/* Metadata */}
                          {notification.metadata && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {notification.metadata.order_number && (
                                <span className="px-2 py-1 bg-gray-100 rounded-md text-xs font-medium text-gray-600">
                                  #{notification.metadata.order_number}
                                </span>
                              )}
                              {notification.metadata.restaurant_name && (
                                <span className="px-2 py-1 bg-orange-100 rounded-md text-xs font-medium text-orange-600">
                                  🍽️ {notification.metadata.restaurant_name}
                                </span>
                              )}
                              {notification.metadata.total_amount && (
                                <span className="px-2 py-1 bg-green-100 rounded-md text-xs font-medium text-green-600">
                                  Rs.{" "}
                                  {parseFloat(
                                    notification.metadata.total_amount
                                  ).toFixed(0)}
                                </span>
                              )}
                              {notification.metadata.distance_km && (
                                <span className="px-2 py-1 bg-blue-100 rounded-md text-xs font-medium text-blue-600">
                                  📍{" "}
                                  {parseFloat(
                                    notification.metadata.distance_km
                                  ).toFixed(1)}{" "}
                                  km
                                </span>
                              )}
                            </div>
                          )}

                          {/* Time */}
                          <p className="text-xs text-gray-400 mt-2">
                            {getTimeAgo(notification.created_at)}
                          </p>
                        </div>

                        {/* Action Arrow */}
                        <svg
                          className="w-5 h-5 text-gray-400 flex-shrink-0"
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
                      </div>
                    </div>

                    {/* Quick Actions for new_order */}
                    {notification.type === "new_order" &&
                      !notification.is_read && (
                        <div className="px-4 pb-4 pt-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate("/driver/deliveries");
                            }}
                            className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                          >
                            View & Accept Delivery
                          </button>
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DriverLayout>
  );
}
