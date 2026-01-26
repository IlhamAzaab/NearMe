import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import supabaseClient from "../supabaseClient";
import SiteHeader from "../components/SiteHeader";

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
      const res = await fetch(
        "http://localhost:5000/customer/notifications?limit=100",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
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
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Order Notifications
          </h2>
          <p className="text-gray-500">
            {notifications.length > 0
              ? `You have ${notifications.length} notification${
                  notifications.length > 1 ? "s" : ""
                }`
              : "Stay updated on your orders"}
          </p>
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
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">🔔</span>
            </div>
            <p className="text-xl font-medium text-gray-800">
              No notifications yet
            </p>
            <p className="text-gray-500 mt-1">Place an order to get started</p>
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

              return (
                <div
                  key={n.id}
                  className="bg-white rounded-xl shadow hover:shadow-md transition-shadow p-4 border-l-4 border-blue-500"
                >
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-xl">
                        {getNotificationIcon(n.type)}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-gray-900">{n.title}</p>
                          <p className="text-gray-700 mt-1">{n.message}</p>
                        </div>
                      </div>

                      {/* Driver Details for driver_assigned notifications */}
                      {n.type === "driver_assigned" && metadata.driver && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                          <p className="text-sm font-semibold text-gray-900">
                            Driver Details
                          </p>
                          <div className="mt-2 space-y-1">
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
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="px-2 py-1 bg-gray-100 rounded-md text-xs font-medium text-gray-600">
                            Order #{metadata.order_id.substring(0, 8)}
                          </span>
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
  );
}
