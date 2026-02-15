import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import BottomNavbar from "../components/BottomNavbar";
import supabaseClient from "../supabaseClient";
import { API_URL } from "../config";

// Initialize Supabase
const supabase = supabaseClient;

export default function CustomerNotifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customerId, setCustomerId] = useState(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/customer/notifications?limit=100`, {
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

  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem("role");
    const userId = localStorage.getItem("userId");
    const token = localStorage.getItem("token");

    if (token && role === "customer") {
      setIsLoggedIn(true);
      setCustomerId(userId);
      fetchNotifications();
    } else {
      setIsLoggedIn(false);
      setLoading(false);
    }
    if (token && role === "customer") {
      setIsLoggedIn(true);
      setCustomerId(userId);
      fetchNotifications();
    } else {
      setIsLoggedIn(false);
      setLoading(false);
    }
  }, [navigate, fetchNotifications]);

  // Real-time subscription for new notifications (using broadcast channel)
  useEffect(() => {
    if (!supabase || !customerId) return;

    console.log("🔔 Setting up customer notification subscription");

    const channel = supabase
      .channel(`user:${customerId}:notifications`)
      .on("broadcast", { event: "insert" }, (payload) => {
        console.log("🆕 New customer notification received:", payload.payload);

        const newNotif = payload.payload;

        // Only add if it's for this customer
        if (newNotif.recipient_id === customerId) {
          setNotifications((prev) => [newNotif, ...prev]);
        }
      })
      .subscribe((status) => {
        console.log("📡 Customer notification subscription status:", status);
      });

    return () => {
      console.log("🔌 Unsubscribing from customer notifications");
      supabase.removeChannel(channel);
    };
  }, [customerId]);

  const getNotificationIcon = (type) => {
    switch (type) {
      case "order_accepted":
        return "✅";
      case "order_rejected":
        return "❌";
      case "driver_assigned":
        return "🛵";
      case "delivery_status_update":
        return "📍";
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
    <div className="min-h-screen bg-gray-50 font-poppins pb-24 page-slide-up">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 bg-white px-4 py-3 shadow-sm">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <svg
                  className="w-5 h-5 text-gray-700"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-[#FF7A00] rounded-xl flex items-center justify-center shadow-lg shadow-orange-200">
                  <span className="text-white text-lg font-bold">N</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">
                    Notifications
                  </h1>
                  <p className="text-xs text-gray-500">
                    {notifications.length > 0
                      ? `${notifications.length} update${notifications.length > 1 ? "s" : ""}`
                      : "Stay updated"}
                  </p>
                </div>
              </div>
            </div>

            {/* Bell Icon */}
            <div className="w-10 h-10 bg-orange-50 rounded-full flex items-center justify-center">
              <span className="text-xl">🔔</span>
            </div>
          </div>
        </div>

        {!isLoggedIn ? (
          <div className="text-center py-12 bg-white rounded-xl shadow">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-10 h-10 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <p className="text-xl font-medium text-gray-800">
              Please login to view notifications
            </p>
            <p className="text-gray-500 mt-1">
              Sign in to see your order updates
            </p>
            <button
              onClick={() => navigate("/login")}
              className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Login
            </button>
          </div>
        ) : loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-4 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-5xl">🔔</span>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              No notifications yet
            </h3>
            <p className="text-gray-500 text-sm">
              Place an order to get started
            </p>
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

              const getNotificationColor = (type) => {
                switch (type) {
                  case "order_accepted":
                    return "bg-green-500";
                  case "order_rejected":
                    return "bg-red-500";
                  case "driver_assigned":
                    return "bg-blue-500";
                  case "order_delivered":
                    return "bg-green-500";
                  default:
                    return "bg-[#FF7A00]";
                }
              };

              return (
                <div
                  key={n.id}
                  className="bg-white rounded-2xl shadow-md hover:shadow-lg transition-all p-4 border-l-4 border-[#FF7A00]"
                >
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div
                      className={`w-12 h-12 ${getNotificationColor(n.type)} rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg`}
                    >
                      <span className="text-xl">
                        {getNotificationIcon(n.type)}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-gray-900">{n.title}</p>
                          <p className="text-gray-600 text-sm mt-1">
                            {n.message}
                          </p>
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {getTimeAgo(n.created_at)}
                        </span>
                      </div>

                      {/* Driver Details for driver_assigned notifications */}
                      {n.type === "driver_assigned" && metadata.driver && (
                        <div className="mt-3 p-3 bg-orange-50 rounded-xl">
                          <p className="text-sm font-semibold text-[#FF7A00] mb-2">
                            🛵 Driver Details
                          </p>
                          <div className="space-y-1">
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">Name:</span>{" "}
                              {metadata.driver.driver_name}
                            </p>
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">Phone:</span>{" "}
                              {metadata.driver.driver_phone || "Not available"}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Metadata Tags */}
                      {metadata.order_id && (
                        <div className="mt-3">
                          <span className="px-3 py-1 bg-orange-50 rounded-full text-xs font-semibold text-[#FF7A00]">
                            Order #{metadata.order_id.substring(0, 8)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </header>

      {/* Bottom Navigation */}
      <BottomNavbar />
    </div>
  );
}
