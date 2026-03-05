import React, { useEffect, useState, useCallback } from "react";
import supabaseClient from "../../supabaseClient";
import DriverLayout from "../../components/DriverLayout";
import { API_URL } from "../../config";

// Initialize Supabase
const supabase = supabaseClient;

export default function DriverNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [driverId, setDriverId] = useState(null);

  // =============================================
  // FETCH NOTIFICATIONS
  // =============================================
  const fetchNotifications = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/driver/notifications?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch (e) {
      console.error("Fetch notifications error:", e);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // =============================================
  // AUTH CHECK
  // =============================================
  useEffect(() => {
    const role = localStorage.getItem("role");
    const userId = localStorage.getItem("userId");

    if (role !== "driver") {
      window.location.href = "/login";
      return;
    }

    setDriverId(userId);
    fetchNotifications();
  }, [fetchNotifications]);

  // =============================================
  // REAL-TIME SUBSCRIPTION
  // =============================================
  useEffect(() => {
    if (!supabase || !driverId) return;

    const channel = supabase
      .channel("driver-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notification_log",
          filter: `user_id=eq.${driverId}`,
        },
        (payload) => {
          console.log("New driver notification:", payload);
          const newNotif = payload.new;
          setNotifications((prev) => [
            {
              id: newNotif.id,
              title: newNotif.title,
              body: newNotif.body,
              data: newNotif.data || {},
              status: newNotif.status,
              created_at: newNotif.sent_at || newNotif.created_at,
              source: "notification_log",
            },
            ...prev,
          ]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [driverId]);

  // =============================================
  // HELPERS
  // =============================================
  const getNotificationIcon = (type) => {
    switch (type) {
      case "new_order":
        return "🛵";
      case "order_picked_up":
        return "📦";
      case "order_on_the_way":
        return "🚗";
      case "order_delivered":
        return "🎉";
      default:
        return "📢";
    }
  };

  const getTimeAgo = (timestamp) => {
    if (!timestamp) return "";
    const now = new Date();
    const then = new Date(timestamp);
    const diffMins = Math.floor((now - then) / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <DriverLayout>
      <div className="flex-1 p-4 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Notifications
            </h2>
            <p className="text-gray-500">
              {notifications.length > 0
                ? `You have ${notifications.length} notification${
                    notifications.length > 1 ? "s" : ""
                  }`
                : "Stay updated on all deliveries"}
            </p>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-4 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-4">Loading notifications...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">🔔</span>
              </div>
              <p className="text-xl font-medium text-gray-800">
                No notifications yet
              </p>
              <p className="text-gray-500 mt-1">Check back soon for updates</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((n) => {
                const metadata =
                  (typeof n.data === "string" ? JSON.parse(n.data) : n.data) ||
                  {};
                const notifType = metadata.type || null;

                // All notifications in notification_log are informational (no read status)
                const bgColor = "bg-white";
                const borderColor = "border-gray-300";
                const iconBg = "bg-gray-100";
                const shadowClass = "shadow";

                return (
                  <div
                    key={n.id}
                    className={`${bgColor} rounded-xl ${shadowClass} hover:shadow-lg transition-all p-4 border-l-4 ${borderColor}`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div
                        className={`w-12 h-12 ${iconBg} rounded-full flex items-center justify-center flex-shrink-0`}
                      >
                        <span className="text-xl">
                          {getNotificationIcon(notifType)}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-bold text-gray-900">{n.title}</p>
                            <p className="mt-1 text-gray-800">{n.body}</p>
                          </div>
                        </div>

                        {/* Metadata Tags */}
                        {metadata.order_id && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className="px-2 py-1 bg-gray-100 rounded-md text-xs font-medium text-gray-600">
                              Order #{metadata.order_id.substring(0, 8)}
                            </span>
                            {metadata.status && (
                              <span className="px-2 py-1 bg-orange-100 rounded-md text-xs font-medium text-orange-600">
                                Status: {metadata.status}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Time */}
                        <p className="text-xs text-gray-400 mt-2">
                          {getTimeAgo(n.created_at)}
                        </p>
                      </div>
                    </div>
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
