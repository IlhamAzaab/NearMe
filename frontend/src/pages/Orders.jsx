/**
 * Customer Orders Page
 *
 * Features:
 * - View all customer orders (Active/Past tabs)
 * - Real-time order status updates via Supabase Realtime
 * - Toast notifications when order status changes
 * - Navigate to appropriate status page when clicking an order
 * - UI matches the design with restaurant logos and progress tracking
 * - Past orders with filter chips (Delivered, Cancelled)
 */

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import supabaseClient from "../supabaseClient";
import AnimatedAlert, { useAlert } from "../components/AnimatedAlert";
import { formatETAClockTime } from "../utils/etaFormatter";
import { API_URL } from "../config";

// Material Symbols CSS injection
const MaterialSymbolsCSS = () => (
  <link
    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
    rel="stylesheet"
  />
);

// Shared Supabase client (singleton)
const supabase = supabaseClient;

export default function Orders() {
  const navigate = useNavigate();
  const { alert: alertState, visible: alertVisible, showError } = useAlert();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [customerId, setCustomerId] = useState(null);
  const [cartCount, setCartCount] = useState(0);
  const [activeTab, setActiveTab] = useState("active"); // 'active' or 'past'
  const [pastFilter, setPastFilter] = useState("all"); // 'all', 'delivered', 'cancelled'

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
      fetchCartCount();
    } else {
      // Guest user - allow viewing but no orders
      setIsLoggedIn(false);
      setLoading(false);
    }
  }, [navigate]);

  // ============================================================================
  // FETCH CART COUNT
  // ============================================================================

  const fetchCartCount = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/cart`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const totalItems = (data.carts || []).reduce((sum, cart) => {
        return (
          sum +
          (cart.items || []).reduce(
            (itemSum, item) => itemSum + item.quantity,
            0,
          )
        );
      }, 0);
      setCartCount(totalItems);
    } catch (err) {
      console.error("Fetch cart error:", err);
    }
  };

  // ============================================================================
  // FETCH ORDERS
  // ============================================================================

  const fetchOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/orders/my-orders`, {
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
  // REALTIME ORDER STATUS UPDATES
  // ============================================================================

  useEffect(() => {
    if (!customerId) return;

    // Listen for order updates
    const ordersChannel = supabase
      .channel(`orders-${customerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `customer_id=eq.${customerId}`,
        },
        (payload) => {
          console.log("Order status update:", payload);

          if (payload.eventType === "UPDATE") {
            // Refetch orders to get proper effective_status
            fetchOrders();

            // Show notification
            const statusMessage = getStatusMessage(payload.new.status);
            if (statusMessage) {
              const notification = {
                id: Date.now(),
                orderNumber: payload.new.order_number,
                status: payload.new.status,
                message: statusMessage,
              };
              setNotifications((prev) => [...prev, notification]);
              playNotificationSound();

              // Auto-remove notification after 5 seconds
              setTimeout(() => {
                removeNotification(notification.id);
              }, 5000);
            }
          } else if (payload.eventType === "INSERT") {
            fetchOrders();
          }
        },
      )
      .subscribe();

    // Listen for delivery updates (for status changes like picked_up, on_the_way)
    const deliveriesChannel = supabase
      .channel(`deliveries-customer-${customerId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "deliveries",
        },
        (payload) => {
          console.log("Delivery status update:", payload);
          // Refetch orders to get updated effective_status
          fetchOrders();
        },
      )
      .subscribe();

    return () => {
      ordersChannel.unsubscribe();
      deliveriesChannel.unsubscribe();
    };
  }, [customerId, fetchOrders]);

  const getStatusMessage = (status) => {
    switch (status) {
      case "accepted":
        return "Your order has been accepted!";
      case "preparing":
        return "Your food is being prepared";
      case "ready":
        return "Your order is ready for pickup!";
      case "picked_up":
        return "Driver has picked up your order";
      case "on_the_way":
        return "Your order is on the way!";
      case "delivered":
        return "Order delivered! Enjoy your meal 🎉";
      case "cancelled":
        return "Your order has been cancelled";
      case "rejected":
        return "Sorry, your order was rejected";
      default:
        return null;
    }
  };

  const playNotificationSound = () => {
    try {
      const audio = new Audio(
        "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQgAVZ/NvZdNBCeE0P/OeC4EOW+93rN8NQQ+WKrEsIsxBUpljZ+vgSwELkticp+XQRAEIThHQXJcPAQNIjk7V2NNBAwkO0FcaksEDik6P1lgSQQLJzc9WGhOBBAuP0djaE0EEy9ARGJoTQQTL0BEYmhN",
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
  // STATUS HELPERS
  // ============================================================================

  const getStatusColor = (status) => {
    switch (status) {
      case "placed":
        return "bg-yellow-100 text-yellow-700";
      case "pending":
        return "bg-orange-100 text-orange-700";
      case "accepted":
      case "driver_assigned":
        return "bg-blue-100 text-blue-700";
      case "picked_up":
        return "bg-indigo-100 text-indigo-700";
      case "on_the_way":
        return "bg-green-100 text-green-700";
      case "delivered":
        return "bg-green-100 text-green-700";
      case "rejected":
      case "cancelled":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case "placed":
        return "PLACED";
      case "pending":
        return "PENDING";
      case "accepted":
      case "driver_assigned":
        return "DRIVER ASSIGNED";
      case "picked_up":
        return "PICKED UP";
      case "on_the_way":
        return "ON THE WAY";
      case "delivered":
        return "DELIVERED";
      case "cancelled":
      case "rejected":
        return "CANCELLED";
      default:
        return status.toUpperCase();
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "placed":
        return "🕐";
      case "pending":
        return "⏳";
      case "accepted":
      case "driver_assigned":
        return "🧑‍✈️";
      case "picked_up":
        return "📦";
      case "on_the_way":
        return "🛵";
      case "delivered":
        return "✅";
      case "cancelled":
      case "rejected":
        return "❌";
      default:
        return "📋";
    }
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
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const getEstimatedTime = (status, order) => {
    // Use order's estimated_duration_min if available, adjust by delivery stage
    const baseMins = order?.estimated_duration_min;
    if (baseMins && baseMins > 0) {
      let factor = 1;
      switch (status) {
        case "placed":
          factor = 1;
          break;
        case "pending":
          factor = 0.85;
          break;
        case "accepted":
        case "driver_assigned":
          factor = 0.65;
          break;
        case "picked_up":
          factor = 0.45;
          break;
        case "on_the_way":
          factor = 0.35;
          break;
        default:
          return "";
      }
      const low = Math.max(1, Math.round(baseMins * factor));
      const high = Math.max(low + 5, Math.round(baseMins * factor * 1.3));
      const isOnTheWay = status === "on_the_way";
      return formatETAClockTime(low, isOnTheWay ? low : high, { isOnTheWay });
    }
    // Fallback static estimates as clock times
    const fallbacks = {
      placed: [15, 20],
      pending: [12, 18],
      accepted: [10, 15],
      driver_assigned: [10, 15],
      picked_up: [5, 10],
      on_the_way: [5, 5],
    };
    const range = fallbacks[status];
    if (!range) return "";
    const isOnTheWay = status === "on_the_way";
    return formatETAClockTime(range[0], range[1], { isOnTheWay });
  };

  // ============================================================================
  // NAVIGATION HELPER - Redirect to appropriate status page
  // ============================================================================

  const navigateToOrderStatus = (order) => {
    const orderId = order.id;
    // Use effective_status (combines order + delivery status) for navigation
    const status = order.effective_status || order.status;

    // Common state data to pass to all pages
    const commonState = {
      orderId,
      order,
      restaurantName: order.restaurant_name,
      restaurantLogo: order.restaurant_logo,
      items: order.order_items,
      totalAmount: order.total_amount,
      address: order.delivery_address,
      orderNumber: order.order_number,
    };

    // Map order status to the appropriate page route
    switch (status) {
      case "placed":
        navigate(`/placing-order`, {
          state: commonState,
        });
        break;

      case "pending":
        // Order is pending (waiting for restaurant to accept)
        navigate(`/order-received/${orderId}`, {
          state: commonState,
        });
        break;

      case "accepted":
      case "driver_assigned":
        // Restaurant accepted, driver assigned
        navigate(`/driver-accepted/${orderId}`, {
          state: commonState,
        });
        break;

      case "picked_up":
        navigate(`/order-picked-up/${orderId}`, {
          state: commonState,
        });
        break;

      case "on_the_way":
      case "at_customer":
        navigate(`/order-on-the-way/${orderId}`, {
          state: commonState,
        });
        break;

      case "delivered":
        navigate(`/order-delivered/${orderId}`, {
          state: commonState,
        });
        break;

      case "cancelled":
      case "rejected":
        navigate(`/order-details/${orderId}`, {
          state: {
            orderId,
            order,
          },
        });
        break;

      default:
        navigate(`/orders/${orderId}`);
        break;
    }
  };

  // Filter orders based on active tab - use effective_status for proper categorization
  const activeOrders = orders.filter((order) => {
    const status = order.effective_status || order.status;
    return !["delivered", "cancelled", "rejected"].includes(status);
  });

  const pastOrders = orders.filter((order) => {
    const status = order.effective_status || order.status;
    return ["delivered", "cancelled", "rejected"].includes(status);
  });

  // Filter past orders based on selected filter
  const filteredPastOrders = pastOrders.filter((order) => {
    const status = order.effective_status || order.status;
    if (pastFilter === "all") return true;
    if (pastFilter === "delivered") return status === "delivered";
    if (pastFilter === "cancelled")
      return status === "cancelled" || status === "rejected";
    return true;
  });

  const displayedOrders =
    activeTab === "active" ? activeOrders : filteredPastOrders;

  // Format date for past orders
  const formatOrderDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Get items summary for past orders
  const getItemsSummary = (items) => {
    if (!items || items.length === 0) return "";
    return items
      .slice(0, 3)
      .map((item) => `${item.quantity}x ${item.name}`)
      .join(", ");
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-[#f6f8f6] font-['Work_Sans',sans-serif]">
      <AnimatedAlert alert={alertState} visible={alertVisible} />
      <MaterialSymbolsCSS />

      {/* Main Container */}
      <div className="relative flex h-auto min-h-screen w-full flex-col max-w-[480px] mx-auto bg-white overflow-x-hidden shadow-2xl pb-24">
        {/* Top App Bar */}
        <header className="sticky top-0 z-50 flex items-center bg-white/90 backdrop-blur-sm p-4 border-b border-gray-100 justify-between">
          <button
            onClick={() => navigate("/")}
            className="text-[#111812] flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer transition"
          >
            <span className="material-symbols-outlined">
              arrow_back_ios_new
            </span>
          </button>
          <h2 className="text-[#111812] text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center">
            {activeTab === "active" ? "My Orders" : "Past Orders"}
          </h2>
          <div className="flex w-10 items-center justify-end">
            <button className="flex cursor-pointer items-center justify-center rounded-full h-10 w-10 hover:bg-gray-100 transition-colors">
              <span className="material-symbols-outlined text-[#111812]">
                search
              </span>
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-4 bg-white">
          <button
            onClick={() => setActiveTab("active")}
            className={`flex-1 py-3 text-sm font-semibold transition relative ${
              activeTab === "active"
                ? "text-[#13ec37]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Active
            {activeTab === "active" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#13ec37] rounded-t-full"></div>
            )}
          </button>
          <button
            onClick={() => setActiveTab("past")}
            className={`flex-1 py-3 text-sm font-semibold transition relative ${
              activeTab === "past"
                ? "text-[#13ec37]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Past
            {activeTab === "past" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#13ec37] rounded-t-full"></div>
            )}
          </button>
        </div>

        {/* Filter Chips for Past Orders */}
        {activeTab === "past" && (
          <div className="flex gap-2 px-4 py-4 overflow-x-auto no-scrollbar bg-white">
            <button
              onClick={() => setPastFilter("all")}
              className={`px-4 py-1.5 text-sm font-semibold rounded-full whitespace-nowrap transition ${
                pastFilter === "all"
                  ? "bg-[#13ec37] text-[#111812]"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All Orders
            </button>
            <button
              onClick={() => setPastFilter("delivered")}
              className={`px-4 py-1.5 text-sm font-semibold rounded-full whitespace-nowrap transition ${
                pastFilter === "delivered"
                  ? "bg-[#13ec37] text-[#111812]"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Delivered
            </button>
            <button
              onClick={() => setPastFilter("cancelled")}
              className={`px-4 py-1.5 text-sm font-semibold rounded-full whitespace-nowrap transition ${
                pastFilter === "cancelled"
                  ? "bg-[#13ec37] text-[#111812]"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Cancelled
            </button>
          </div>
        )}

        {/* Notification Toasts */}
        <div className="fixed top-20 right-4 z-50 space-y-2">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`bg-white rounded-2xl shadow-lg border-l-4 p-4 max-w-sm animate-fade-in ${
                notification.status === "delivered"
                  ? "border-green-500"
                  : notification.status === "cancelled" ||
                      notification.status === "rejected"
                    ? "border-red-500"
                    : "border-[#13ec37]"
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
                  <p className="text-sm text-gray-600">
                    {notification.message}
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

        {/* Main Content */}
        <main className="flex-1 pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-[#13ec37] border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : !isLoggedIn ? (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <div className="w-32 h-32 mb-6 bg-orange-100 rounded-full flex items-center justify-center">
                <span className="text-5xl">🍽️</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Please Log In
              </h2>
              <p className="text-gray-500 text-center mb-6">
                Sign in to view your orders and track deliveries
              </p>
              <button
                onClick={() => navigate("/login")}
                className="px-8 py-3 bg-[#13ec37] text-white font-semibold rounded-full hover:bg-[#10d632] transition"
              >
                Log In
              </button>
            </div>
          ) : displayedOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-32 h-32 mb-6 bg-orange-100 rounded-full flex items-center justify-center">
                <span className="text-5xl">
                  {activeTab === "active" ? "🛵" : "📦"}
                </span>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {activeTab === "active" ? "No Active Orders" : "No Past Orders"}
              </h2>
              <p className="text-gray-500 mb-8">
                {activeTab === "active"
                  ? "You don't have any ongoing orders"
                  : "Your order history will appear here"}
              </p>
              <button
                onClick={() => navigate("/")}
                className="px-8 py-3.5 bg-[#13ec37] text-white font-semibold rounded-full hover:bg-[#10d632] transition-all shadow-lg"
              >
                Browse Restaurants
              </button>
            </div>
          ) : activeTab === "active" ? (
            /* Active Orders List */
            <div className="space-y-4 px-4 pt-4">
              {displayedOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-all duration-300 cursor-pointer border border-gray-100"
                  onClick={() => navigateToOrderStatus(order)}
                >
                  <div className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Restaurant Logo */}
                      <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {order.restaurant_logo ? (
                          <img
                            src={order.restaurant_logo}
                            alt={order.restaurant_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-2xl">
                            {getStatusIcon(
                              order.effective_status || order.status,
                            )}
                          </span>
                        )}
                      </div>

                      {/* Order Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-1">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-gray-900 truncate">
                              {order.restaurant_name}
                            </h3>
                            <p className="text-sm text-gray-500">
                              Order #{order.order_number} •{" "}
                              {order.order_items?.length || 0} items
                            </p>
                          </div>
                          <span
                            className={`ml-2 px-2.5 py-1 rounded-md text-xs font-bold whitespace-nowrap ${getStatusColor(order.effective_status || order.status)}`}
                          >
                            {getStatusLabel(
                              order.effective_status || order.status,
                            )}
                          </span>
                        </div>

                        {/* Estimated Time */}
                        <div className="mt-2">
                          {getEstimatedTime(
                            order.effective_status || order.status,
                            order,
                          ) && (
                            <p className="text-sm font-medium text-gray-900">
                              <span className="text-gray-500">
                                Est. arrival:{" "}
                              </span>
                              {getEstimatedTime(
                                order.effective_status || order.status,
                                order,
                              )}
                            </p>
                          )}
                        </div>

                        {/* Track Order Link */}
                        <button className="mt-3 text-sm font-semibold text-[#13ec37] hover:text-[#10d632] flex items-center gap-1">
                          <svg
                            className="w-4 h-4"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                            <path
                              fillRule="evenodd"
                              d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                          Track Order
                        </button>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      {(() => {
                        const effectiveStatus =
                          order.effective_status || order.status;
                        return (
                          <>
                            <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
                              <span>
                                {effectiveStatus === "placed" && "Order placed"}
                                {effectiveStatus === "pending" &&
                                  "Waiting for restaurant"}
                                {effectiveStatus === "accepted" &&
                                  "Driver assigned"}
                                {effectiveStatus === "driver_assigned" &&
                                  "Driver assigned"}
                                {effectiveStatus === "picked_up" &&
                                  "Your order picked up"}
                                {effectiveStatus === "on_the_way" &&
                                  "On the way to you"}
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-[#13ec37] to-[#10d632] rounded-full transition-all duration-500"
                                style={{
                                  width:
                                    effectiveStatus === "placed"
                                      ? "15%"
                                      : effectiveStatus === "pending"
                                        ? "35%"
                                        : effectiveStatus === "accepted"
                                          ? "55%"
                                          : effectiveStatus ===
                                              "driver_assigned"
                                            ? "55%"
                                            : effectiveStatus === "picked_up"
                                              ? "80%"
                                              : effectiveStatus === "on_the_way"
                                                ? "95%"
                                                : "100%",
                                }}
                              ></div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Past Orders List - New Design */
            <div className="space-y-4 px-4">
              {displayedOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex flex-col items-stretch justify-start rounded-xl shadow-sm border border-gray-100 bg-white overflow-hidden"
                >
                  {/* Order Card Content */}
                  <div className="p-4 flex gap-4">
                    {/* Restaurant Logo */}
                    <div
                      className="w-20 h-20 bg-center bg-no-repeat bg-cover rounded-lg shrink-0 bg-gray-100"
                      style={{
                        backgroundImage: order.restaurant_logo
                          ? `url("${order.restaurant_logo}")`
                          : "none",
                      }}
                    >
                      {!order.restaurant_logo && (
                        <div className="w-full h-full flex items-center justify-center text-3xl">
                          🍽️
                        </div>
                      )}
                    </div>

                    {/* Order Info */}
                    <div className="flex flex-col flex-1 justify-center">
                      <div className="flex justify-between items-start">
                        <p className="text-[#111812] text-lg font-bold leading-tight">
                          {order.restaurant_name}
                        </p>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                            (order.effective_status ||
                              order.delivery_status ||
                              order.status) === "delivered"
                              ? "bg-green-100 text-green-600"
                              : "bg-red-100 text-red-600"
                          }`}
                        >
                          {(order.effective_status ||
                            order.delivery_status ||
                            order.status) === "delivered"
                            ? "Delivered"
                            : "Cancelled"}
                        </span>
                      </div>
                      <p className="text-gray-500 text-sm font-normal mt-1">
                        {formatOrderDate(order.delivered_at || order.placed_at)}{" "}
                        •{" "}
                        <span className="font-semibold text-gray-900">
                          Rs. {parseFloat(order.total_amount || 0).toFixed(2)}
                        </span>
                      </p>
                      <p className="text-gray-400 text-xs font-normal mt-1 line-clamp-1 italic">
                        {getItemsSummary(order.order_items)}
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex border-t border-gray-50 p-3 gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateToOrderStatus(order);
                      }}
                      className="flex-1 flex cursor-pointer items-center justify-center rounded-lg h-10 px-4 bg-gray-100 text-[#111812] text-sm font-bold transition-all active:scale-95 hover:bg-gray-200"
                    >
                      <span className="material-symbols-outlined text-sm mr-2">
                        visibility
                      </span>
                      <span className="truncate">View Details</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Handle reorder
                        handleReorder(order);
                      }}
                      className="flex-1 flex cursor-pointer items-center justify-center rounded-lg h-10 px-4 bg-[#13ec37] text-[#111812] text-sm font-bold shadow-sm transition-all active:scale-95 hover:bg-[#10d632]"
                    >
                      <span className="material-symbols-outlined text-sm mr-2">
                        reorder
                      </span>
                      <span className="truncate">Reorder</span>
                    </button>
                  </div>
                </div>
              ))}

              {/* Footer Info */}
              {displayedOrders.length > 0 && (
                <div className="py-8 text-center">
                  <p className="text-gray-400 text-sm font-medium">
                    Showing orders from the last 6 months
                  </p>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Bottom Navigation - Styled like the design */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white/95 backdrop-blur-md border-t border-gray-100 px-6 py-3 flex items-center justify-between z-50">
          <button
            onClick={() => navigate("/")}
            className="flex flex-col items-center gap-1 text-gray-400"
          >
            <span className="material-symbols-outlined">home</span>
            <span className="text-[10px] font-bold uppercase tracking-wide">
              Home
            </span>
          </button>
          <button
            onClick={() => navigate("/cart")}
            className="flex flex-col items-center gap-1 text-gray-400 relative"
          >
            <span className="material-symbols-outlined">shopping_cart</span>
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#13ec37] text-[#111812] text-xs font-bold rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
            <span className="text-[10px] font-bold uppercase tracking-wide">
              Cart
            </span>
          </button>
          <button
            onClick={() => navigate("/orders")}
            className="flex flex-col items-center gap-1 text-[#13ec37]"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              receipt_long
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wide">
              Orders
            </span>
          </button>
          <button
            onClick={() => navigate("/customer/profile")}
            className="flex flex-col items-center gap-1 text-gray-400"
          >
            <span className="material-symbols-outlined">person</span>
            <span className="text-[10px] font-bold uppercase tracking-wide">
              Profile
            </span>
          </button>
        </nav>

        {/* iOS Home Indicator Area */}
        <div className="fixed bottom-0 left-0 right-0 h-5 bg-white/95 pointer-events-none"></div>
      </div>
    </div>
  );

  // Handle reorder function
  async function handleReorder(order) {
    try {
      const token = localStorage.getItem("token");
      const items = order?.order_items || [];

      // Add each item to cart
      for (const item of items) {
        await fetch(`${API_URL}/cart/add`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            foodId: item.food_id,
            quantity: item.quantity,
          }),
        });
      }

      navigate("/cart");
    } catch (error) {
      console.error("Reorder error:", error);
      showError("Failed to add items to cart");
    }
  }
}
