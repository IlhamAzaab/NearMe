import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import supabaseClient from "../../supabaseClient";
import AdminLayout from "../../components/AdminLayout";
import { API_URL } from "../../config";

// Initialize Supabase
const supabase = supabaseClient;

export default function AdminNotifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adminId, setAdminId] = useState(null);
  const [filter, setFilter] = useState("all");

  const fetchNotifications = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/admin/notifications?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch (e) {
      console.error("Fetch error:", e);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
          table: "notification_log",
          filter: `user_id=eq.${adminId}`,
        },
        (payload) => {
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
  }, [adminId]);

  const getNotificationConfig = (type) => {
    switch (type) {
      case "new_delivery":
        return {
          icon: (
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
          ),
          bg: "bg-green-100",
          color: "text-green-600",
          label: "Order Received",
          milestone: true,
        };
      case "driver_assigned":
        return {
          icon: (
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"
              />
            </svg>
          ),
          bg: "bg-purple-100",
          color: "text-purple-600",
          label: "Driver",
        };
      case "delivery_status_update":
        return {
          icon: (
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          ),
          bg: "bg-sky-100",
          color: "text-sky-600",
          label: "Update",
        };
      case "order_accepted":
        return {
          icon: (
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ),
          bg: "bg-emerald-100",
          color: "text-emerald-600",
          label: "Accepted",
        };
      case "order_rejected":
        return {
          icon: (
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ),
          bg: "bg-red-100",
          color: "text-red-600",
          label: "Rejected",
        };
      default:
        return {
          icon: (
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
          ),
          bg: "bg-gray-100",
          color: "text-gray-600",
          label: "General",
        };
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
    return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const handleNotificationClick = (n) => {
    const metadata =
      (typeof n.data === "string" ? JSON.parse(n.data) : n.data) || {};
    if (metadata.order_id) {
      navigate(`/admin/orders?orderId=${metadata.order_id}`);
    }
  };

  const renderNotification = (n) => {
    const metadata =
      (typeof n.data === "string" ? JSON.parse(n.data) : n.data) || {};
    const notifType = metadata.type || null;
    const config = getNotificationConfig(notifType);
    const isClickable = !!metadata.order_id;

    return (
      <div
        key={n.id}
        onClick={() => isClickable && handleNotificationClick(n)}
        className={`bg-white rounded-2xl p-4 border border-gray-100 shadow-sm transition-all ${
          config.milestone ? "border-l-4 border-l-green-500 bg-green-50/30" : ""
        } ${
          isClickable
            ? "cursor-pointer active:scale-[0.98] hover:border-gray-200 hover:shadow-md"
            : ""
        }`}
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className={`w-10 h-10 rounded-xl ${config.bg} ${config.color} flex items-center justify-center shrink-0`}
          >
            {config.icon}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900 text-sm truncate">
                    {n.title}
                  </p>
                  <span
                    className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${config.bg} ${config.color}`}
                  >
                    {config.label}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
                  {n.body}
                </p>
              </div>
              <span className="text-[10px] text-gray-400 font-medium shrink-0 mt-0.5">
                {getTimeAgo(n.created_at)}
              </span>
            </div>

            {/* Tags */}
            {metadata.order_id && (
              <div className="mt-2 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-50 border border-gray-100 rounded-lg text-[10px] font-semibold text-gray-500">
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
                    />
                  </svg>
                  {metadata.order_id.substring(0, 8)}
                </span>
                {metadata.status && (
                  <span className="px-2 py-0.5 bg-amber-50 border border-amber-100 rounded-lg text-[10px] font-semibold text-amber-600">
                    {metadata.status}
                  </span>
                )}
                {isClickable && (
                  <svg
                    className="w-3.5 h-3.5 text-gray-300 ml-auto"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const filteredNotifications =
    filter === "all"
      ? notifications
      : notifications.filter((n) => {
          const metadata =
            (typeof n.data === "string" ? JSON.parse(n.data) : n.data) || {};
          return metadata.type === filter;
        });

  return (
    <AdminLayout noPadding>
      {/* White header */}
      <div className="bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Back */}
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 flex items-center justify-center"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="#06C168"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>

          {/* Title */}
          <h1 className="text-lg font-bold text-gray-900">Notifications</h1>

          {/* Refresh */}
          <button
            onClick={fetchNotifications}
            className="w-10 h-10 flex items-center justify-center"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="#06C168"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-100" />

        {/* Tabs */}
        <div className="flex gap-6 px-4 pt-2">
          {[
            { key: "all", label: "All" },
            { key: "new_delivery", label: "Orders" },
            { key: "delivery_status_update", label: "Delivery" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`pb-2.5 text-sm font-semibold border-b-[2.5px] transition-colors ${
                filter === tab.key
                  ? "text-[#06C168] border-[#06C168]"
                  : "text-gray-400 border-transparent"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Bottom border */}
        <div className="h-px bg-gray-100" />
      </div>

      {/* Notification list */}
      <div className="px-4 py-4 pb-8">
        {loading ? (
          <div className="space-y-2.5">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-4 border border-gray-100 skeleton-fade"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-xl shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-1/3 bg-gray-100 rounded" />
                      <div className="h-4 w-12 bg-gray-100 rounded" />
                    </div>
                    <div className="h-3 w-3/4 bg-gray-100 rounded" />
                    <div className="flex gap-2">
                      <div className="h-5 w-20 bg-gray-100 rounded-lg" />
                      <div className="h-5 w-16 bg-gray-100 rounded-lg" />
                    </div>
                  </div>
                  <div className="h-3 w-12 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4">
                <svg
                  className="w-8 h-8 text-gray-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
              </div>
              <p className="text-gray-800 font-semibold">
                No notifications yet
              </p>
              <p className="text-sm text-gray-400 mt-1 text-center">
                {filter === "all"
                  ? "When you receive orders or updates, they'll appear here"
                  : "No notifications match this filter"}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredNotifications.map(renderNotification)}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
