/**
 * Track Order Page
 *
 * Real-time order tracking with:
 * - Live status updates via Supabase Realtime
 * - Visual timeline progress
 * - Order details and items
 * - Delivery information
 * - Driver tracking when assigned
 */

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import supabaseClient from "../supabaseClient";
import SiteHeader from "../components/SiteHeader";

// Shared Supabase client (singleton)
const supabase = supabaseClient;

export default function TrackOrder() {
  const navigate = useNavigate();
  const { orderId } = useParams();

  // Order state
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState("");
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");

  // Notification state
  const [notification, setNotification] = useState(null);

  // Status timeline steps
  const statusSteps = [
    {
      key: "placed",
      label: "Order Placed",
      icon: "🕐",
      description: "Waiting for restaurant to accept",
    },
    {
      key: "accepted",
      label: "Accepted",
      icon: "✅",
      description: "Restaurant accepted your order",
    },
    {
      key: "preparing",
      label: "Preparing",
      icon: "👨‍🍳",
      description: "Your food is being prepared",
    },
    {
      key: "ready",
      label: "Ready",
      icon: "📦",
      description: "Order is ready for pickup",
    },
    {
      key: "picked_up",
      label: "Picked Up",
      icon: "🚗",
      description: "Driver picked up your order",
    },
    {
      key: "on_the_way",
      label: "On the Way",
      icon: "🛵",
      description: "Driver is on the way to you",
    },
    {
      key: "delivered",
      label: "Delivered",
      icon: "🎉",
      description: "Enjoy your meal!",
    },
  ];

  // ============================================================================
  // AUTH CHECK
  // ============================================================================

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedRole = localStorage.getItem("role");
    const storedName = localStorage.getItem("userName");
    const storedEmail = localStorage.getItem("userEmail");

    if (token && storedRole === "customer") {
      setIsLoggedIn(true);
      setRole(storedRole);
      setUserName(storedName || "");
      setUserEmail(storedEmail || "");
    } else {
      navigate("/login");
    }
  }, [navigate]);

  // ============================================================================
  // FETCH ORDER
  // ============================================================================

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`http://localhost:5000/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (response.ok) {
        setOrder(data.order);
      } else {
        setError(data.message || "Failed to fetch order");
      }
    } catch (err) {
      console.error("Fetch order error:", err);
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (isLoggedIn && orderId) {
      fetchOrder();
    }
  }, [isLoggedIn, orderId, fetchOrder]);

  // Helper to get delivery status from order
  const getEffectiveStatus = (orderData) => {
    const delivery = orderData?.deliveries?.[0] || orderData?.deliveries;
    return (
      delivery?.status ||
      orderData?.delivery_status ||
      orderData?.status ||
      "placed"
    );
  };

  // ============================================================================
  // SUPABASE REALTIME SUBSCRIPTION
  // ============================================================================

  useEffect(() => {
    if (!supabase || !orderId) return;

    // Subscribe to deliveries table updates for this order
    const channel = supabase
      .channel(`track-delivery-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "deliveries",
          filter: `order_id=eq.${orderId}`,
        },
        (payload) => {
          console.log("Delivery updated:", payload.new?.status);
          const newDeliveryStatus = payload.new?.status;
          if (newDeliveryStatus) {
            setOrder((prev) => {
              if (!prev) return prev;
              const updatedDeliveries = (prev.deliveries || []).map((d) =>
                d.id === payload.new.id ? { ...d, ...payload.new } : d,
              );
              // If no matching delivery found, add it
              if (!updatedDeliveries.some((d) => d.id === payload.new.id)) {
                updatedDeliveries.push(payload.new);
              }
              return { ...prev, deliveries: updatedDeliveries };
            });
            showStatusNotification(newDeliveryStatus);
            playNotificationSound();
          }
        },
      )
      .subscribe((status) => {
        console.log("Realtime subscription status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  // ============================================================================
  // STATUS NOTIFICATIONS
  // ============================================================================

  const showStatusNotification = (status) => {
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

    setNotification({
      message: statusMessages[status] || `Status updated: ${status}`,
      status,
    });

    // Auto-remove after 5 seconds
    setTimeout(() => {
      setNotification(null);
    }, 5000);
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

  // ============================================================================
  // HELPERS
  // ============================================================================

  const getStatusIndex = (status) => {
    return statusSteps.findIndex((s) => s.key === status);
  };

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
    const step = statusSteps.find((s) => s.key === status);
    if (step) return step.icon;
    if (status === "cancelled" || status === "rejected") return "❌";
    return "📋";
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
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatPrice = (amount) => {
    return `Rs. ${parseFloat(amount || 0).toFixed(2)}`;
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <SiteHeader
          isLoggedIn={isLoggedIn}
          role={role}
          userName={userName}
          userEmail={userEmail}
          onLogout={handleLogout}
        />
        <div className="flex justify-center items-center py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-indigo-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading order details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50">
        <SiteHeader
          isLoggedIn={isLoggedIn}
          role={role}
          userName={userName}
          userEmail={userEmail}
          onLogout={handleLogout}
        />
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-md mx-auto bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Order Not Found
            </h2>
            <p className="text-gray-600 mb-6">
              {error || "The order you're looking for doesn't exist."}
            </p>
            <button
              onClick={() => navigate("/orders")}
              className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition"
            >
              View All Orders
            </button>
          </div>
        </div>
      </div>
    );
  }

  const effectiveStatus = getEffectiveStatus(order);
  const currentIndex = getStatusIndex(effectiveStatus);
  const isCancelledOrRejected = ["cancelled", "rejected"].includes(
    effectiveStatus,
  );
  const isDelivered = effectiveStatus === "delivered";

  return (
    <div className="min-h-screen bg-gray-50 page-slide-up">
      <SiteHeader
        isLoggedIn={isLoggedIn}
        role={role}
        userName={userName}
        userEmail={userEmail}
        onLogout={handleLogout}
      />

      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-20 right-4 z-50">
          <div
            className={`bg-white rounded-xl shadow-lg border-l-4 p-4 max-w-sm animate-slide-in ${
              notification.status === "delivered"
                ? "border-green-500"
                : notification.status === "cancelled" ||
                    notification.status === "rejected"
                  ? "border-red-500"
                  : "border-indigo-500"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {getStatusIcon(notification.status)}
              </span>
              <p className="text-sm font-medium text-gray-800">
                {notification.message}
              </p>
              <button
                onClick={() => setNotification(null)}
                className="text-gray-400 hover:text-gray-600 ml-auto"
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
        </div>
      )}

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Back Button */}
        <button
          onClick={() => navigate("/orders")}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition"
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
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Orders
        </button>

        {/* Order Header */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">{order.order_number}</h1>
                <p className="text-indigo-100 mt-1">{order.restaurant_name}</p>
              </div>
              <div className="text-right">
                <span
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${
                    isDelivered
                      ? "bg-green-500 text-white"
                      : isCancelledOrRejected
                        ? "bg-red-500 text-white"
                        : "bg-white/20 text-white backdrop-blur"
                  }`}
                >
                  <span className="text-lg">
                    {getStatusIcon(effectiveStatus)}
                  </span>
                  {effectiveStatus.replace("_", " ").toUpperCase()}
                </span>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-6 text-sm text-indigo-100">
              <div className="flex items-center gap-2">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                {formatDate(order.placed_at)}
              </div>
              <div className="flex items-center gap-2">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {formatTime(order.placed_at)}
              </div>
            </div>
          </div>

          {/* Estimated Delivery */}
          {!isDelivered && !isCancelledOrRejected && (
            <div className="bg-indigo-50 px-6 py-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-indigo-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Estimated Delivery</p>
                  <p className="font-semibold text-gray-900">
                    ~{order.estimated_duration_min} minutes
                  </p>
                </div>
              </div>
              <button
                onClick={fetchOrder}
                className="px-4 py-2 text-indigo-600 hover:bg-indigo-100 rounded-lg transition flex items-center gap-2"
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
          )}
        </div>

        {/* Status Timeline */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-indigo-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            Order Progress
          </h2>

          {isCancelledOrRejected ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
              <span className="text-5xl">❌</span>
              <p className="font-bold text-red-700 mt-4 text-lg">
                Order{" "}
                {effectiveStatus === "cancelled" ? "Cancelled" : "Rejected"}
              </p>
              <p className="text-red-600 mt-2">
                {effectiveStatus === "rejected"
                  ? "The restaurant couldn't accept your order at this time."
                  : "This order has been cancelled."}
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
                    className="flex items-start mb-6 last:mb-0"
                  >
                    <div className="flex flex-col items-center mr-4">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all ${
                          isCompleted
                            ? "bg-indigo-600 text-white shadow-lg"
                            : "bg-gray-100 text-gray-400"
                        } ${
                          isCurrent ? "ring-4 ring-indigo-200 scale-110" : ""
                        }`}
                      >
                        {step.icon}
                      </div>
                      {index < statusSteps.length - 1 && (
                        <div
                          className={`w-1 h-12 transition-colors ${
                            index < currentIndex
                              ? "bg-indigo-600"
                              : "bg-gray-200"
                          }`}
                        />
                      )}
                    </div>
                    <div className="flex-1 pt-2">
                      <p
                        className={`font-semibold text-lg ${
                          isCompleted ? "text-gray-900" : "text-gray-400"
                        }`}
                      >
                        {step.label}
                      </p>
                      <p
                        className={`text-sm mt-0.5 ${
                          isCompleted ? "text-gray-600" : "text-gray-400"
                        }`}
                      >
                        {step.description}
                      </p>
                      {isCurrent && !isDelivered && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse"></div>
                          <span className="text-sm text-indigo-600 font-medium">
                            Current status
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Order Items */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-indigo-600"
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
            Order Items
          </h2>
          <div className="space-y-3">
            {order.order_items?.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 bg-gray-50 rounded-xl p-4"
              >
                {item.food_image_url && (
                  <img
                    src={item.food_image_url}
                    alt={item.food_name}
                    className="w-16 h-16 rounded-lg object-cover"
                  />
                )}
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">
                    {item.food_name}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                      {item.size}
                    </span>
                    <span className="text-sm text-gray-500">
                      × {item.quantity}
                    </span>
                  </div>
                </div>
                <p className="font-bold text-gray-900">
                  {formatPrice(item.total_price)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Delivery Details */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-indigo-600"
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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Delivery Details
          </h2>
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-4 h-4 text-indigo-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-500">Delivery Address</p>
                <p className="font-medium text-gray-900">
                  {order.delivery_address}
                </p>
                <p className="text-gray-600">{order.delivery_city}</p>
              </div>
            </div>
            <div className="border-t pt-3 grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Distance</p>
                <p className="font-medium text-gray-900">
                  {order.distance_km} km
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Est. Time</p>
                <p className="font-medium text-gray-900">
                  {order.estimated_duration_min} min
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Summary */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-indigo-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            Payment Summary
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span className="font-medium text-gray-900">
                {formatPrice(order.subtotal)}
              </span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Delivery Fee</span>
              <span className="font-medium text-gray-900">
                {formatPrice(order.delivery_fee)}
              </span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Service Fee</span>
              <span className="font-medium text-gray-900">
                {formatPrice(order.service_fee)}
              </span>
            </div>
            <div className="border-t pt-3 flex justify-between">
              <span className="font-bold text-gray-900 text-lg">Total</span>
              <span className="font-bold text-indigo-600 text-xl">
                {formatPrice(order.total_amount)}
              </span>
            </div>
            <div className="flex justify-between items-center bg-gray-50 rounded-lg p-3 mt-2">
              <span className="text-gray-600">Payment Method</span>
              <span className="font-semibold text-gray-900 flex items-center gap-2">
                {order.payment_method === "cash" ? "💵" : "💳"}
                {order.payment_method === "cash"
                  ? "Cash on Delivery"
                  : "Card Payment"}
              </span>
            </div>
          </div>
        </div>

        {/* Help Section */}
        <div className="mt-6 bg-indigo-50 rounded-2xl p-6 text-center">
          <p className="text-gray-700 mb-3">Need help with your order?</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={() => navigate("/orders")}
              className="px-5 py-2 bg-white text-indigo-600 font-semibold rounded-lg border border-indigo-200 hover:bg-indigo-100 transition"
            >
              View All Orders
            </button>
            <button
              onClick={() => navigate("/home")}
              className="px-5 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition"
            >
              Order Again
            </button>
          </div>
        </div>
      </main>

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
