import React, { useEffect, useState, useCallback } from "react";
import supabaseClient from "../../supabaseClient";
import AdminLayout from "../../components/AdminLayout";

// Initialize Supabase
const supabase = supabaseClient;

export default function AdminNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adminId, setAdminId] = useState(null);

  const markAllAsRead = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      await fetch("http://localhost:5000/admin/notifications/mark-all-read", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) {
      console.error("Mark all read error:", e);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        "http://localhost:5000/admin/notifications?limit=100",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await res.json();
      setNotifications(data.notifications || []);

      // Mark all as read after fetching
      await markAllAsRead();

      // Update local state to reflect read status
      setNotifications((prev) =>
        prev.map((notif) => ({
          ...notif,
          is_read: true,
          read_at: new Date().toISOString(),
        })),
      );
    } catch (e) {
      console.error("Fetch error:", e);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [markAllAsRead]);

  useEffect(() => {
    const role = localStorage.getItem("role");
    const userId = localStorage.getItem("userId");

    if (role !== "admin") {
      window.location.href = "/login";
      return;
    }

    setAdminId(userId);
    fetchNotifications();
  }, [fetchNotifications]);

  // Real-time subscription for new notifications
  useEffect(() => {
    if (!supabase || !adminId) return;

    const channel = supabase
      .channel("admin-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${adminId}`,
        },
        (payload) => {
          console.log("New notification:", payload);
          setNotifications((prev) => [payload.new, ...prev]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [adminId]);

  const getNotificationIcon = (type) => {
    switch (type) {
      case "new_delivery":
        return "📦";
      case "driver_assigned":
        return "🛵";
      case "delivery_status_update":
        return "📍";
      case "order_accepted":
        return "✅";
      case "order_rejected":
        return "❌";
      default:
        return "📢";
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
    return `${diffDays}d ago`;
  };

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Notifications</h1>
          <p className="text-gray-500 text-sm mt-1">
            {notifications.length > 0
              ? `You have ${notifications.length} notification${notifications.length > 1 ? "s" : ""}`
              : "Stay updated on all activities"}
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-xl p-4 border border-gray-100 animate-pulse"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gray-200 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/3 bg-gray-200 rounded" />
                    <div className="h-3 w-3/4 bg-gray-200 rounded" />
                    <div className="h-3 w-1/4 bg-gray-200 rounded" />
                  </div>
                </div>
              </div>
            ))}
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
              let metadata = {};
              try {
                metadata = n.metadata ? JSON.parse(n.metadata) : {};
              } catch (e) {
                metadata = {};
              }

              // Determine styling based on read status
              const isUnread = !n.is_read;
              const bgColor = isUnread ? "bg-green-50" : "bg-white";
              const borderColor = isUnread
                ? "border-green-500"
                : "border-gray-200";
              const iconBg = isUnread ? "bg-green-100" : "bg-gray-100";
              const shadowClass = isUnread ? "shadow-md" : "shadow";

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
                        {getNotificationIcon(n.type)}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <p
                              className={`font-bold ${
                                isUnread ? "text-gray-900" : "text-gray-700"
                              }`}
                            >
                              {n.title}
                            </p>
                            {isUnread && (
                              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                            )}
                          </div>
                          <p
                            className={`mt-1 ${
                              isUnread ? "text-gray-800" : "text-gray-600"
                            }`}
                          >
                            {n.message}
                          </p>
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
    </AdminLayout>
  );
}
