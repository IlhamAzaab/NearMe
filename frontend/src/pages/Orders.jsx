/**
 * Customer Orders Page
 *
 * Features:
 * - View all customer orders
 * - Real-time order status updates via Supabase Realtime
 * - Toast notifications when order status changes
 * - Order details with timeline
 */

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import SiteHeader from "../components/SiteHeader";

// Initialize Supabase client for realtime
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export default function Orders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [customerId, setCustomerId] = useState(null);

  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState("");
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");

  // ============================================================================
  // AUTH CHECK
  // ============================================================================

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedRole = localStorage.getItem("role");
    const storedName = localStorage.getItem("userName");
    const storedEmail = localStorage.getItem("userEmail");
    const storedId = localStorage.getItem("userId");

    if (token && storedRole === "customer") {
      setIsLoggedIn(true);
      setRole(storedRole);
      setUserName(storedName || "");
      setUserEmail(storedEmail || "");
      setCustomerId(storedId);
    } else {
      navigate("/login");
    }
  }, [navigate]);

  // ============================================================================
  // FETCH ORDERS
  // ============================================================================

  const fetchOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("http://localhost:5000/orders/my-orders", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (response.ok) {
        setOrders(data.orders || []);
      } else {
        console.error("Failed to fetch orders:", data.message);
      }
    } catch (error) {
      console.error("Fetch orders error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      fetchOrders();
    }
  }, [isLoggedIn, fetchOrders]);

  // ============================================================================
  // SUPABASE REALTIME SUBSCRIPTION
  // ============================================================================

  useEffect(() => {
    if (!supabase || !customerId) return;

    const channel = supabase
      .channel("customer-orders")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `customer_id=eq.${customerId}`,
        },
        (payload) => {
          console.log("Order updated:", payload);
          handleOrderUpdate(payload.new, payload.old);
        }
      )
      .subscribe((status) => {
        console.log("Realtime subscription status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [customerId]);

  // ============================================================================
  // HANDLE ORDER UPDATE (REALTIME)
  // ============================================================================

  const handleOrderUpdate = (newOrder, oldOrder) => {
    // Update orders list
    setOrders((prev) =>
      prev.map((order) =>
        order.id === newOrder.id ? { ...order, ...newOrder } : order
      )
    );

    // Update selected order if viewing
    if (selectedOrder?.id === newOrder.id) {
      setSelectedOrder((prev) => ({ ...prev, ...newOrder }));
    }

    // Show notification if status changed
    if (oldOrder.status !== newOrder.status) {
      showStatusNotification(newOrder);
      playNotificationSound();
    }
  };

  // ============================================================================
  // NOTIFICATIONS
  // ============================================================================

  const showStatusNotification = (order) => {
    const statusMessages = {
      accepted: "Your order has been accepted! 🎉",
      preparing: "Your food is being prepared! 👨‍🍳",
      ready: "Your order is ready for pickup! 📦",
      picked_up: "Driver has picked up your order! 🚗",
      on_the_way: "Your order is on the way! 🛵",
      delivered: "Your order has been delivered! ✅",
      cancelled: "Your order was cancelled 😔",
      rejected: "Restaurant couldn't accept your order 😔",
    };

    const notification = {
      id: Date.now(),
      orderNumber: order.order_number,
      message: statusMessages[order.status] || `Status: ${order.status}`,
      status: order.status,
    };

    setNotifications((prev) => [notification, ...prev]);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
    }, 5000);
  };

  const playNotificationSound = () => {
    try {
      const audio = new Audio(
        "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQgAVZ/NvZdNBCeE0P/OeC4EOW+93rN8NQQ+WKrEsIsxBUpljZ+vgSwELkticp+XQRAEIThHQXJcPAQNIjk7V2NNBAwkO0FcaksEDik6P1lgSQQLJzc9WGhOBBAuP0djaE0EEy9ARGJoTQQTL0BEYmhN"
      );
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch (error) {
      console.log("Notification sound error:", error);
    }
  };

  const removeNotification = (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  // ============================================================================
  // LOGOUT
  // ============================================================================

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  // ============================================================================
  // STATUS HELPERS
  // ============================================================================

  const getStatusColor = (status) => {
    switch (status) {
      case "placed":
        return "bg-yellow-100 text-yellow-700 border-yellow-300";
      case "accepted":
        return "bg-blue-100 text-blue-700 border-blue-300";
      case "preparing":
        return "bg-purple-100 text-purple-700 border-purple-300";
      case "ready":
        return "bg-indigo-100 text-indigo-700 border-indigo-300";
      case "picked_up":
      case "on_the_way":
        return "bg-cyan-100 text-cyan-700 border-cyan-300";
      case "delivered":
        return "bg-green-100 text-green-700 border-green-300";
      case "rejected":
      case "cancelled":
        return "bg-red-100 text-red-700 border-red-300";
      default:
        return "bg-gray-100 text-gray-700 border-gray-300";
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "placed":
        return "🕐";
      case "accepted":
        return "✅";
      case "preparing":
        return "👨‍🍳";
      case "ready":
        return "📦";
      case "picked_up":
        return "🚗";
      case "on_the_way":
        return "🛵";
      case "delivered":
        return "🎉";
      case "cancelled":
      case "rejected":
        return "❌";
      default:
        return "📋";
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return "--";
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "--";
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getTimeAgo = (timestamp) => {
    if (!timestamp) return "";
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return formatDate(timestamp);
  };

  // Status timeline steps
  const statusSteps = [
    { key: "placed", label: "Placed", icon: "🕐" },
    { key: "accepted", label: "Accepted", icon: "✅" },
    { key: "preparing", label: "Preparing", icon: "👨‍🍳" },
    { key: "ready", label: "Ready", icon: "📦" },
    { key: "picked_up", label: "Picked Up", icon: "🚗" },
    { key: "on_the_way", label: "On the Way", icon: "🛵" },
    { key: "delivered", label: "Delivered", icon: "🎉" },
  ];

  const getStatusIndex = (status) => {
    return statusSteps.findIndex((s) => s.key === status);
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader
        isLoggedIn={isLoggedIn}
        role={role}
        userName={userName}
        userEmail={userEmail}
        onLogout={handleLogout}
      />

      {/* Notification Toasts */}
      <div className="fixed top-20 right-4 z-50 space-y-2">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`bg-white rounded-xl shadow-lg border-l-4 p-4 max-w-sm animate-slide-in ${
              notification.status === "delivered"
                ? "border-green-500"
                : notification.status === "cancelled" ||
                  notification.status === "rejected"
                ? "border-red-500"
                : "border-indigo-500"
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">
                {getStatusIcon(notification.status)}
              </span>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">
                  {notification.orderNumber}
                </p>
                <p className="text-sm text-gray-600">{notification.message}</p>
              </div>
              <button
                onClick={() => removeNotification(notification.id)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">My Orders</h1>
            <p className="text-gray-600 mt-1">Track your orders in real-time</p>
          </div>
          <button
            onClick={fetchOrders}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center gap-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </button>
        </div>

        {/* Orders List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-indigo-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl shadow">
            <svg
              className="w-16 h-16 mx-auto text-gray-400 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-lg font-medium text-gray-800">No orders yet</p>
            <p className="text-sm text-gray-500 mt-1">
              Your order history will appear here
            </p>
            <button
              onClick={() => navigate("/")}
              className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Browse Restaurants
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div
                key={order.id}
                className="bg-white rounded-xl shadow hover:shadow-md transition cursor-pointer"
                onClick={() => navigate(`/orders/${order.id}`)}
              >
                <div className="p-4 sm:p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">
                          {getStatusIcon(order.status)}
                        </span>
                        <div>
                          <h3 className="font-bold text-gray-900">
                            {order.order_number}
                          </h3>
                          <p className="text-sm text-gray-600">
                            {order.restaurant_name}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(
                            order.status
                          )}`}
                        >
                          {order.status.replace("_", " ").toUpperCase()}
                        </span>
                        <span className="text-sm text-gray-500">
                          {getTimeAgo(order.placed_at)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg text-gray-900">
                        Rs. {parseFloat(order.total_amount).toFixed(2)}
                      </p>
                      <p className="text-sm text-gray-500">
                        {order.order_items?.length || 0} items
                      </p>
                    </div>
                  </div>

                  {/* Progress Bar for Active Orders */}
                  {!["delivered", "cancelled", "rejected"].includes(
                    order.status
                  ) && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex items-center justify-between">
                        {statusSteps.slice(0, 5).map((step, index) => {
                          const currentIndex = getStatusIndex(order.status);
                          const isCompleted = index <= currentIndex;
                          const isCurrent = index === currentIndex;

                          return (
                            <div
                              key={step.key}
                              className="flex flex-col items-center flex-1"
                            >
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                                  isCompleted
                                    ? "bg-indigo-600 text-white"
                                    : "bg-gray-200 text-gray-500"
                                } ${isCurrent ? "ring-2 ring-indigo-300" : ""}`}
                              >
                                {step.icon}
                              </div>
                              <span
                                className={`text-xs mt-1 ${
                                  isCompleted
                                    ? "text-indigo-600 font-medium"
                                    : "text-gray-400"
                                }`}
                              >
                                {step.label}
                              </span>
                              {index < 4 && (
                                <div
                                  className={`hidden sm:block absolute h-0.5 w-full ${
                                    index < currentIndex
                                      ? "bg-indigo-600"
                                      : "bg-gray-200"
                                  }`}
                                  style={{
                                    left: "50%",
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                  }}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Order Details Modal */}
      {selectedOrder && (
        <OrderDetailsModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          statusSteps={statusSteps}
          getStatusIndex={getStatusIndex}
          getStatusColor={getStatusColor}
          formatTime={formatTime}
          formatDate={formatDate}
        />
      )}

      <style>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// ORDER DETAILS MODAL
// ============================================================================

function OrderDetailsModal({
  order,
  onClose,
  statusSteps,
  getStatusIndex,
  getStatusColor,
  formatTime,
  formatDate,
}) {
  const currentIndex = getStatusIndex(order.status);
  const isCancelledOrRejected = ["cancelled", "rejected"].includes(
    order.status
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">
              {order.order_number}
            </h2>
            <p className="text-sm text-gray-600">{order.restaurant_name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Status Timeline */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-4">Order Status</h3>
            {isCancelledOrRejected ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                <span className="text-3xl">❌</span>
                <p className="font-semibold text-red-700 mt-2">
                  Order{" "}
                  {order.status === "cancelled" ? "Cancelled" : "Rejected"}
                </p>
              </div>
            ) : (
              <div className="relative">
                {statusSteps.map((step, index) => {
                  const isCompleted = index <= currentIndex;
                  const isCurrent = index === currentIndex;

                  return (
                    <div
                      key={step.key}
                      className="flex items-start mb-4 last:mb-0"
                    >
                      <div className="flex flex-col items-center mr-4">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                            isCompleted
                              ? "bg-indigo-600 text-white"
                              : "bg-gray-200 text-gray-500"
                          } ${isCurrent ? "ring-4 ring-indigo-100" : ""}`}
                        >
                          {step.icon}
                        </div>
                        {index < statusSteps.length - 1 && (
                          <div
                            className={`w-0.5 h-8 ${
                              index < currentIndex
                                ? "bg-indigo-600"
                                : "bg-gray-200"
                            }`}
                          />
                        )}
                      </div>
                      <div className="flex-1 pt-2">
                        <p
                          className={`font-medium ${
                            isCompleted ? "text-gray-900" : "text-gray-400"
                          }`}
                        >
                          {step.label}
                        </p>
                        {isCurrent && (
                          <p className="text-sm text-indigo-600">
                            Current status
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Order Items */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3">Order Items</h3>
            <div className="space-y-2">
              {order.order_items?.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between items-center bg-gray-50 rounded-lg p-3"
                >
                  <div className="flex items-center gap-3">
                    {item.food_image_url && (
                      <img
                        src={item.food_image_url}
                        alt={item.food_name}
                        className="w-12 h-12 rounded-lg object-cover"
                      />
                    )}
                    <div>
                      <p className="font-medium text-gray-900">
                        {item.food_name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {item.size} × {item.quantity}
                      </p>
                    </div>
                  </div>
                  <p className="font-semibold text-gray-900">
                    Rs. {parseFloat(item.total_price).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Delivery Info */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3">
              Delivery Details
            </h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Address</span>
                <span className="font-medium text-right max-w-[200px]">
                  {order.delivery_address}, {order.delivery_city}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Distance</span>
                <span className="font-medium">{order.distance_km} km</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Est. Time</span>
                <span className="font-medium">
                  {order.estimated_duration_min} min
                </span>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span>Rs. {parseFloat(order.subtotal).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Delivery Fee</span>
              <span>Rs. {parseFloat(order.delivery_fee).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Service Fee</span>
              <span>Rs. {parseFloat(order.service_fee).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2">
              <span>Total</span>
              <span className="text-indigo-600">
                Rs. {parseFloat(order.total_amount).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Payment</span>
              <span className="font-medium">
                {order.payment_method === "cash"
                  ? "💵 Cash on Delivery"
                  : "💳 Card"}
              </span>
            </div>
          </div>

          {/* Order Time */}
          <div className="text-center text-sm text-gray-500 border-t pt-4">
            Ordered on {formatDate(order.placed_at)} at{" "}
            {formatTime(order.placed_at)}
          </div>
        </div>
      </div>
    </div>
  );
}
