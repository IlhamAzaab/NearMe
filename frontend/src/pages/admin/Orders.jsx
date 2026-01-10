/**
 * Restaurant Admin Orders Page
 *
 * Features:
 * - Real-time order notifications via Supabase Realtime
 * - Order status management
 * - Toast notifications for new orders
 * - Sound alerts for new orders
 * - Order details modal with status update actions
 */

import React, { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import AdminLayout from "../../components/AdminLayout";

// Initialize Supabase client for realtime
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [counts, setCounts] = useState({});
  const [restaurantId, setRestaurantId] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [updating, setUpdating] = useState(false);

  // ============================================================================
  // FETCH ORDERS
  // ============================================================================

  const fetchOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:5000/orders/restaurant/orders?status=${statusFilter}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await response.json();
      if (response.ok) {
        setOrders(data.orders || []);
        setCounts(data.counts || {});
        setRestaurantId(data.restaurant_id);
      } else {
        console.error("Failed to fetch orders:", data.message);
      }
    } catch (error) {
      console.error("Fetch orders error:", error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // ============================================================================
  // SUPABASE REALTIME SUBSCRIPTION
  // ============================================================================

  useEffect(() => {
    if (!supabase || !restaurantId) return;

    const channel = supabase
      .channel("restaurant-orders")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          console.log("New order received:", payload);
          handleNewOrder(payload.new);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          console.log("Order updated:", payload);
          handleOrderUpdate(payload.new);
        }
      )
      .subscribe((status) => {
        console.log("Realtime subscription status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  // ============================================================================
  // HANDLE NEW ORDER (REALTIME)
  // ============================================================================

  const handleNewOrder = (newOrder) => {
    // Add to orders list
    setOrders((prev) => [newOrder, ...prev]);

    // Update counts
    setCounts((prev) => ({
      ...prev,
      all: (prev.all || 0) + 1,
      placed: (prev.placed || 0) + 1,
    }));

    // Show notification
    showNotification({
      id: Date.now(),
      type: "new_order",
      orderNumber: newOrder.order_number,
      customerName: newOrder.customer_name,
      totalAmount: newOrder.total_amount,
    });

    // Play sound
    playNotificationSound();
  };

  const handleOrderUpdate = (updatedOrder) => {
    setOrders((prev) =>
      prev.map((order) =>
        order.id === updatedOrder.id ? { ...order, ...updatedOrder } : order
      )
    );

    // Update selected order if viewing
    if (selectedOrder?.id === updatedOrder.id) {
      setSelectedOrder((prev) => ({ ...prev, ...updatedOrder }));
    }
  };

  // ============================================================================
  // NOTIFICATIONS
  // ============================================================================

  const showNotification = (notification) => {
    setNotifications((prev) => [notification, ...prev]);

    // Auto-remove after 10 seconds
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
    }, 10000);
  };

  const removeNotification = (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const playNotificationSound = () => {
    try {
      // Create a more noticeable notification sound
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = "sine";
      gainNode.gain.value = 0.3;

      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.2);

      // Second beep
      setTimeout(() => {
        const osc2 = audioContext.createOscillator();
        const gain2 = audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(audioContext.destination);
        osc2.frequency.value = 1000;
        osc2.type = "sine";
        gain2.gain.value = 0.3;
        osc2.start();
        osc2.stop(audioContext.currentTime + 0.2);
      }, 250);
    } catch (error) {
      console.log("Sound error:", error);
    }
  };

  // ============================================================================
  // UPDATE ORDER STATUS
  // ============================================================================

  const updateOrderStatus = async (orderId, newStatus, reason = null) => {
    setUpdating(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:5000/orders/restaurant/orders/${orderId}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: newStatus, reason }),
        }
      );

      const data = await response.json();
      if (response.ok) {
        // Update local state
        setOrders((prev) =>
          prev.map((order) =>
            order.id === orderId ? { ...order, status: newStatus } : order
          )
        );

        if (selectedOrder?.id === orderId) {
          setSelectedOrder((prev) => ({ ...prev, status: newStatus }));
        }

        // Refetch to get updated counts
        fetchOrders();
      } else {
        alert(data.message || "Failed to update status");
      }
    } catch (error) {
      console.error("Update status error:", error);
      alert("Failed to update order status");
    } finally {
      setUpdating(false);
    }
  };

  // ============================================================================
  // HELPERS
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

  const formatPrice = (amount) => {
    return `Rs. ${parseFloat(amount || 0).toFixed(2)}`;
  };

  const filteredOrders = orders.filter((order) => {
    return statusFilter === "all" || order.status === statusFilter;
  });

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <AdminLayout>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-green-600 via-green-500 to-green-600 bg-clip-text text-transparent">
              Orders
            </h1>
            <p className="text-gray-600 mt-1 text-sm sm:text-base">
              Manage and track customer orders in real-time.
            </p>
          </div>
          <button
            onClick={fetchOrders}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center gap-2"
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

        {/* New Order Notifications */}
        {notifications.length > 0 && (
          <div className="fixed top-4 right-4 z-50 space-y-2">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className="bg-white rounded-xl shadow-2xl border-l-4 border-green-500 p-4 max-w-sm animate-slide-in"
              >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-2xl">🛒</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-gray-900">New Order!</p>
                    <p className="text-sm text-gray-600">
                      {notification.orderNumber}
                    </p>
                    <p className="text-sm text-gray-500">
                      {notification.customerName}
                    </p>
                    <p className="font-semibold text-green-600">
                      {formatPrice(notification.totalAmount)}
                    </p>
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
        )}

        {/* Status Filters */}
        <div className="bg-white rounded-xl shadow border border-green-100 p-3 sm:p-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition text-sm sm:text-base flex items-center gap-2 ${
                statusFilter === "all"
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              All
              {counts.all > 0 && (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs ${
                    statusFilter === "all" ? "bg-white/20" : "bg-gray-200"
                  }`}
                >
                  {counts.all}
                </span>
              )}
            </button>
            <button
              onClick={() => setStatusFilter("placed")}
              className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition text-sm sm:text-base flex items-center gap-2 ${
                statusFilter === "placed"
                  ? "bg-yellow-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              🕐 New
              {counts.placed > 0 && (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs ${
                    statusFilter === "placed"
                      ? "bg-white/20"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {counts.placed}
                </span>
              )}
            </button>
            <button
              onClick={() => setStatusFilter("accepted")}
              className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition text-sm sm:text-base flex items-center gap-2 ${
                statusFilter === "accepted"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              ✅ Accepted
              {counts.accepted > 0 && (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs ${
                    statusFilter === "accepted" ? "bg-white/20" : "bg-gray-200"
                  }`}
                >
                  {counts.accepted}
                </span>
              )}
            </button>
            <button
              onClick={() => setStatusFilter("preparing")}
              className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition text-sm sm:text-base flex items-center gap-2 ${
                statusFilter === "preparing"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              👨‍🍳 Preparing
              {counts.preparing > 0 && (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs ${
                    statusFilter === "preparing" ? "bg-white/20" : "bg-gray-200"
                  }`}
                >
                  {counts.preparing}
                </span>
              )}
            </button>
            <button
              onClick={() => setStatusFilter("ready")}
              className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition text-sm sm:text-base flex items-center gap-2 ${
                statusFilter === "ready"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              📦 Ready
              {counts.ready > 0 && (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs ${
                    statusFilter === "ready" ? "bg-white/20" : "bg-gray-200"
                  }`}
                >
                  {counts.ready}
                </span>
              )}
            </button>
            <button
              onClick={() => setStatusFilter("delivered")}
              className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition text-sm sm:text-base flex items-center gap-2 ${
                statusFilter === "delivered"
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              🎉 Delivered
              {counts.delivered > 0 && (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs ${
                    statusFilter === "delivered" ? "bg-white/20" : "bg-gray-200"
                  }`}
                >
                  {counts.delivered}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Orders List */}
        <div className="bg-white rounded-xl shadow border border-green-100">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-10 sm:h-12 w-10 sm:w-12 border-b-4 border-green-600 mx-auto"></div>
              <p className="text-gray-600 mt-4 text-sm sm:text-base">
                Loading orders...
              </p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
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
              <p className="text-lg font-medium">No orders found</p>
              <p className="text-sm mt-1">
                {statusFilter === "all"
                  ? "No orders have been placed yet."
                  : `No ${statusFilter} orders at this time.`}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredOrders.map((order) => (
                <div
                  key={order.id}
                  className="p-4 sm:p-6 hover:bg-gray-50 cursor-pointer transition"
                  onClick={() => setSelectedOrder(order)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-2xl">
                        {getStatusIcon(order.status)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-gray-900">
                            {order.order_number}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${getStatusColor(
                              order.status
                            )}`}
                          >
                            {order.status.replace("_", " ").toUpperCase()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">
                          {order.customer_name}
                        </p>
                        <p className="text-sm text-gray-500">
                          {order.customer_phone}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {order.order_items?.length || 0} items •{" "}
                          {getTimeAgo(order.placed_at)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg text-gray-900">
                        {formatPrice(order.total_amount)}
                      </p>
                      <p className="text-sm text-gray-500">
                        {order.payment_method === "cash" ? "💵 COD" : "💳 Card"}
                      </p>
                    </div>
                  </div>

                  {/* Quick Actions for New Orders */}
                  {order.status === "placed" && (
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateOrderStatus(order.id, "accepted");
                        }}
                        disabled={updating}
                        className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm"
                      >
                        ✅ Accept Order
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            confirm(
                              "Are you sure you want to reject this order?"
                            )
                          ) {
                            const reason = prompt(
                              "Reason for rejection (optional):"
                            );
                            updateOrderStatus(order.id, "rejected", reason);
                          }
                        }}
                        disabled={updating}
                        className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium text-sm"
                      >
                        ❌ Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <OrderDetailsModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdateStatus={updateOrderStatus}
          updating={updating}
          getStatusColor={getStatusColor}
          getStatusIcon={getStatusIcon}
          formatPrice={formatPrice}
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
    </AdminLayout>
  );
}

// ============================================================================
// ORDER DETAILS MODAL
// ============================================================================

function OrderDetailsModal({
  order,
  onClose,
  onUpdateStatus,
  updating,
  getStatusColor,
  getStatusIcon,
  formatPrice,
  formatTime,
  formatDate,
}) {
  const getNextStatus = (currentStatus) => {
    const transitions = {
      placed: [
        {
          status: "accepted",
          label: "Accept Order",
          color: "bg-green-600 hover:bg-green-700",
          icon: "✅",
        },
        {
          status: "rejected",
          label: "Reject Order",
          color: "bg-red-600 hover:bg-red-700",
          icon: "❌",
        },
      ],
      accepted: [
        {
          status: "preparing",
          label: "Start Preparing",
          color: "bg-purple-600 hover:bg-purple-700",
          icon: "👨‍🍳",
        },
      ],
      preparing: [
        {
          status: "ready",
          label: "Mark as Ready",
          color: "bg-indigo-600 hover:bg-indigo-700",
          icon: "📦",
        },
      ],
      ready: [],
    };
    return transitions[currentStatus] || [];
  };

  const nextActions = getNextStatus(order.status);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{getStatusIcon(order.status)}</span>
            <div>
              <h2 className="text-xl font-bold text-gray-800">
                {order.order_number}
              </h2>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${getStatusColor(
                  order.status
                )}`}
              >
                {order.status.replace("_", " ").toUpperCase()}
              </span>
            </div>
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
          {/* Customer Info */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <svg
                className="w-5 h-5 text-green-600"
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
              Customer Details
            </h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Name</span>
                <span className="font-medium">{order.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Phone</span>
                <a
                  href={`tel:${order.customer_phone}`}
                  className="font-medium text-green-600 hover:underline"
                >
                  {order.customer_phone}
                </a>
              </div>
            </div>
          </div>

          {/* Delivery Info */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <svg
                className="w-5 h-5 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
              </svg>
              Delivery Address
            </h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="font-medium">{order.delivery_address}</p>
              {order.delivery_city && (
                <p className="text-gray-600">{order.delivery_city}</p>
              )}
              <div className="flex gap-4 mt-2 text-sm text-gray-500">
                <span>{order.distance_km} km away</span>
                <span>~{order.estimated_duration_min} min delivery</span>
              </div>
            </div>
          </div>

          {/* Order Items */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <svg
                className="w-5 h-5 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                />
              </svg>
              Order Items ({order.order_items?.length || 0})
            </h3>
            <div className="space-y-2">
              {order.order_items?.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 bg-gray-50 rounded-lg p-3"
                >
                  {item.food_image_url && (
                    <img
                      src={item.food_image_url}
                      alt={item.food_name}
                      className="w-14 h-14 rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">
                      {item.food_name}
                    </p>
                    <p className="text-sm text-gray-500">
                      {item.size} × {item.quantity} @{" "}
                      {formatPrice(item.unit_price)}
                    </p>
                  </div>
                  <p className="font-semibold text-gray-900">
                    {formatPrice(item.total_price)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          {order.notes && (
            <div>
              <h3 className="font-semibold text-gray-800 mb-2">
                Special Instructions
              </h3>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-yellow-800">
                {order.notes}
              </div>
            </div>
          )}

          {/* Pricing */}
          <div className="border-t pt-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span>{formatPrice(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Delivery Fee</span>
                <span>{formatPrice(order.delivery_fee)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Service Fee</span>
                <span>{formatPrice(order.service_fee)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Total</span>
                <span className="text-green-600">
                  {formatPrice(order.total_amount)}
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
          </div>

          {/* Order Time */}
          <div className="text-center text-sm text-gray-500 border-t pt-4">
            Ordered on {formatDate(order.placed_at)} at{" "}
            {formatTime(order.placed_at)}
          </div>

          {/* Status Update Actions */}
          {nextActions.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="font-semibold text-gray-800 mb-3">
                Update Status
              </h3>
              <div className="flex gap-3">
                {nextActions.map((action) => (
                  <button
                    key={action.status}
                    onClick={() => {
                      if (action.status === "rejected") {
                        const reason = prompt(
                          "Reason for rejection (optional):"
                        );
                        onUpdateStatus(order.id, action.status, reason);
                      } else {
                        onUpdateStatus(order.id, action.status);
                      }
                    }}
                    disabled={updating}
                    className={`flex-1 px-4 py-3 ${action.color} text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50`}
                  >
                    {updating ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <span>{action.icon}</span>
                        {action.label}
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
