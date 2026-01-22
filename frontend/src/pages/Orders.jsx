/**
 * Customer Orders Page
 *
 * Features:
 * - View all customer orders
 * - Real-time order status updates via Supabase Realtime
 * - Toast notifications when order status changes
 * - Order details with timeline
 * - Consistent UI with Home and Cart pages
 */

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";

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
  const [activeNav, setActiveNav] = useState("orders");
  const [cartCount, setCartCount] = useState(0);

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
      const res = await fetch("http://localhost:5000/cart", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const totalItems = (data.carts || []).reduce((sum, cart) => {
        return sum + (cart.items || []).reduce((itemSum, item) => itemSum + item.quantity, 0);
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
  // STATUS HELPERS
  // ============================================================================

  const getStatusColor = (status) => {
    switch (status) {
      case "placed":
        return "bg-yellow-100 text-yellow-700";
      case "accepted":
        return "bg-blue-100 text-blue-700";
      case "preparing":
        return "bg-purple-100 text-purple-700";
      case "ready":
        return "bg-indigo-100 text-indigo-700";
      case "picked_up":
      case "on_the_way":
        return "bg-cyan-100 text-cyan-700";
      case "delivered":
        return "bg-green-100 text-green-700";
      case "rejected":
      case "cancelled":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
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
    <div className="min-h-screen bg-gray-50 font-poppins pb-24">
      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-white px-4 py-3 shadow-sm">
        <div className="max-w-6xl mx-auto">
          {/* Logo and Title Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#FF7A00] rounded-xl flex items-center justify-center shadow-lg shadow-orange-200">
                <span className="text-white text-lg font-bold">N</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">My Orders</h1>
                <p className="text-xs text-gray-500">Track your orders in real-time</p>
              </div>
            </div>
            
            {/* Refresh Button */}
            <button
              onClick={fetchOrders}
              className="p-2.5 bg-orange-50 rounded-full hover:bg-orange-100 transition-colors"
            >
              <svg className="w-5 h-5 text-[#FF7A00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </button>
          </div>
        </div>
      </header>

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
                : "border-[#FF7A00]"
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

      {/* Main Content */}
      <main className="px-4 py-5 max-w-6xl mx-auto">
        {!isLoggedIn ? (
          /* Not Logged In State */
          <div className="text-center py-20">
            <div className="w-24 h-24 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
              <svg
                className="w-12 h-12 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">
              Please login to view your orders
            </h3>
            <p className="text-gray-500 text-sm mb-6">
              Sign in to track your orders and order history
            </p>
            <button
              onClick={() => navigate("/login")}
              className="px-8 py-3.5 bg-[#FF7A00] text-white font-semibold rounded-full hover:bg-orange-600 transition-all shadow-lg shadow-orange-200"
            >
              Login
            </button>
          </div>
        ) : loading ? (
          /* Loading State */
          <div className="flex flex-col items-center justify-center py-20">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-orange-100 rounded-full"></div>
              <div className="absolute top-0 left-0 w-16 h-16 border-4 border-[#FF7A00] border-t-transparent rounded-full animate-spin"></div>
            </div>
            <p className="mt-4 text-gray-500 text-sm font-medium">Loading your orders...</p>
          </div>
        ) : orders.length === 0 ? (
          /* Empty Orders State */
          <div className="flex flex-col items-center justify-center py-16 px-4">
            {/* Friendly Illustration */}
            <div className="relative mb-8">
              {/* Background circle */}
              <div className="w-48 h-48 bg-orange-50 rounded-full flex items-center justify-center">
                {/* Order/Receipt illustration */}
                <svg viewBox="0 0 120 120" className="w-32 h-32">
                  {/* Receipt/Paper */}
                  <path d="M35 25 L35 100 L40 95 L45 100 L50 95 L55 100 L60 95 L65 100 L70 95 L75 100 L80 95 L85 100 L85 25 Z" fill="#FFEDD5" stroke="#FF7A00" strokeWidth="2"/>
                  
                  {/* Lines on receipt */}
                  <line x1="45" y1="40" x2="75" y2="40" stroke="#FDBA74" strokeWidth="3" strokeLinecap="round"/>
                  <line x1="45" y1="52" x2="70" y2="52" stroke="#FDBA74" strokeWidth="3" strokeLinecap="round"/>
                  <line x1="45" y1="64" x2="72" y2="64" stroke="#FDBA74" strokeWidth="3" strokeLinecap="round"/>
                  <line x1="45" y1="76" x2="68" y2="76" stroke="#FDBA74" strokeWidth="3" strokeLinecap="round"/>
                  
                  {/* Checkmark circle */}
                  <circle cx="60" cy="55" r="20" fill="none" stroke="#FF7A00" strokeWidth="2" strokeDasharray="5,5"/>
                </svg>
              </div>
              
              {/* Decorative floating elements */}
              <div className="absolute -top-2 -right-2 w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center animate-bounce" style={{animationDelay: '0s', animationDuration: '2s'}}>
                <span className="text-lg">📦</span>
              </div>
              <div className="absolute -bottom-1 -left-3 w-7 h-7 bg-orange-100 rounded-full flex items-center justify-center animate-bounce" style={{animationDelay: '0.5s', animationDuration: '2.5s'}}>
                <span className="text-sm">🛵</span>
              </div>
              <div className="absolute top-1/2 -right-4 w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center animate-bounce" style={{animationDelay: '1s', animationDuration: '3s'}}>
                <span className="text-xs">🍕</span>
              </div>
            </div>

            {/* Text Content */}
            <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">
              No Orders Yet
            </h2>
            <p className="text-gray-500 text-center mb-8 max-w-xs">
              Your order history will appear here. Let's find something delicious!
            </p>

            {/* Primary Action Button */}
            <button
              onClick={() => navigate("/home")}
              className="px-8 py-3.5 bg-[#FF7A00] text-white font-semibold rounded-full hover:bg-orange-600 transition-all shadow-lg shadow-orange-200 flex items-center gap-2 mb-4"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              Browse Restaurants
            </button>

            {/* Secondary Action */}
            <button
              onClick={() => navigate("/home")}
              className="text-[#FF7A00] font-medium hover:text-orange-600 transition-colors flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
              </svg>
              Go to Home
            </button>
          </div>
        ) : (
          /* Orders List */
          <div className="space-y-4">
            {orders.map((order) => (
              <div
                key={order.id}
                className="bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer border border-gray-100/50 hover:border-orange-100"
                onClick={() => navigate(`/orders/${order.id}`)}
              >
                <div className="p-4 sm:p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-50 to-orange-100 flex items-center justify-center flex-shrink-0 shadow-sm">
                          <span className="text-2xl">
                            {getStatusIcon(order.status)}
                          </span>
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900">
                            {order.order_number}
                          </h3>
                          <p className="text-sm text-gray-500">
                            {order.restaurant_name}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-3 ml-15">
                        <span
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${getStatusColor(order.status)} shadow-sm`}
                        >
                          {order.status.replace("_", " ").toUpperCase()}
                        </span>
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                          </svg>
                          {getTimeAgo(order.placed_at)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg text-[#FF7A00]">
                        Rs. {parseFloat(order.total_amount).toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {order.order_items?.length || 0} items
                      </p>
                      <div className="mt-2">
                        <svg className="w-5 h-5 text-gray-300 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar for Active Orders */}
                  {!["delivered", "cancelled", "rejected"].includes(order.status) && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <div className="relative">
                        {/* Background Progress Line */}
                        <div className="absolute top-4 left-6 right-6 h-0.5 bg-gray-100 rounded-full"></div>
                        
                        {/* Active Progress Line */}
                        <div 
                          className="absolute top-4 left-6 h-0.5 bg-gradient-to-r from-[#FF7A00] to-orange-400 rounded-full transition-all duration-500"
                          style={{ 
                            width: `${Math.min((getStatusIndex(order.status) / 4) * 100, 100)}%`,
                            maxWidth: 'calc(100% - 48px)'
                          }}
                        ></div>
                        
                        {/* Status Steps */}
                        <div className="relative flex items-start justify-between">
                          {statusSteps.slice(0, 5).map((step, index) => {
                            const currentIndex = getStatusIndex(order.status);
                            const isCompleted = index < currentIndex;
                            const isCurrent = index === currentIndex;
                            const isUpcoming = index > currentIndex;

                            return (
                              <div
                                key={step.key}
                                className="flex flex-col items-center"
                                style={{ width: '20%' }}
                              >
                                {/* Step Circle */}
                                <div
                                  className={`relative w-8 h-8 rounded-full flex items-center justify-center text-xs transition-all duration-300 ${
                                    isCompleted
                                      ? "bg-[#FF7A00] text-white shadow-md"
                                      : isCurrent
                                      ? "bg-white border-2 border-[#FF7A00] text-[#FF7A00] shadow-lg shadow-orange-200/50"
                                      : "bg-gray-50 border border-gray-200 text-gray-300"
                                  }`}
                                  style={isCurrent ? { 
                                    boxShadow: '0 0 0 4px rgba(255, 122, 0, 0.1), 0 4px 12px rgba(255, 122, 0, 0.25)'
                                  } : {}}
                                >
                                  {isCompleted ? (
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                                    </svg>
                                  ) : (
                                    <span className="text-sm">{step.icon}</span>
                                  )}
                                  
                                  {/* Pulse Animation for Current */}
                                  {isCurrent && (
                                    <span className="absolute inset-0 rounded-full bg-[#FF7A00] animate-ping opacity-20"></span>
                                  )}
                                </div>
                                
                                {/* Step Label */}
                                <span
                                  className={`text-[10px] mt-2 text-center leading-tight ${
                                    isCompleted || isCurrent
                                      ? "text-gray-700 font-medium"
                                      : "text-gray-400"
                                  }`}
                                >
                                  {step.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
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

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 py-2 px-4 shadow-2xl z-50">
        <div className="flex justify-around items-center max-w-lg mx-auto">
          <NavItem
            icon={
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill={activeNav === "home" ? "currentColor" : "none"} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeNav === "home" ? 0 : 1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
              </svg>
            }
            label="Home"
            active={activeNav === "home"}
            onClick={() => {
              setActiveNav("home");
              navigate("/home");
            }}
          />
          <NavItem
            icon={
              <svg className="w-6 h-6" fill={activeNav === "cart" ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
              </svg>
            }
            label="Cart"
            active={activeNav === "cart"}
            onClick={() => {
              setActiveNav("cart");
              navigate("/cart");
            }}
            badge={cartCount > 0 ? cartCount : null}
          />
          <NavItem
            icon={
              <svg className="w-6 h-6" fill={activeNav === "orders" ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
              </svg>
            }
            label="Orders"
            active={activeNav === "orders"}
            onClick={() => setActiveNav("orders")}
          />
          <NavItem
            icon={
              <svg className="w-6 h-6" fill={activeNav === "profile" ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
            }
            label="Profile"
            active={activeNav === "profile"}
            onClick={() => {
              setActiveNav("profile");
              navigate("/profile");
            }}
          />
        </div>
      </nav>

      {/* Custom Styles */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateX(100%); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.3; }
          100% { transform: scale(1.3); opacity: 0; }
        }
        .animate-pulse-ring {
          animation: pulse-ring 1.5s ease-out infinite;
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
      <div className="bg-white rounded-3xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-[#FF7A00] to-orange-500 rounded-t-3xl px-6 py-5 flex items-center justify-between text-white">
          <div>
            <h2 className="text-xl font-bold">
              {order.order_number}
            </h2>
            <p className="text-sm text-white/80">{order.restaurant_name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition"
          >
            <svg
              className="w-5 h-5"
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
          {/* Status Timeline - Modern Horizontal Stepper */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-5">Order Status</h3>
            {isCancelledOrRejected ? (
              <div className="bg-gradient-to-br from-red-50 to-red-100/50 border border-red-100 rounded-2xl p-6 text-center">
                <div className="w-16 h-16 mx-auto mb-3 bg-red-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </div>
                <p className="font-semibold text-red-700 text-lg">
                  Order {order.status === "cancelled" ? "Cancelled" : "Rejected"}
                </p>
                <p className="text-red-500/70 text-sm mt-1">
                  {order.status === "cancelled" 
                    ? "This order has been cancelled" 
                    : "The restaurant couldn't accept this order"}
                </p>
              </div>
            ) : (
              <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-5 border border-gray-100">
                {/* Horizontal Progress Stepper */}
                <div className="relative">
                  {/* Background Line */}
                  <div className="absolute top-5 left-8 right-8 h-[2px] bg-gray-100 rounded-full"></div>
                  
                  {/* Active Progress Line */}
                  <div 
                    className="absolute top-5 left-8 h-[2px] rounded-full transition-all duration-700 ease-out"
                    style={{ 
                      width: `calc(${(currentIndex / (statusSteps.length - 1)) * 100}% - 32px)`,
                      background: 'linear-gradient(90deg, #FF7A00, #FF9A40)'
                    }}
                  ></div>
                  
                  {/* Steps Container */}
                  <div className="relative flex justify-between">
                    {statusSteps.map((step, index) => {
                      const isCompleted = index < currentIndex;
                      const isCurrent = index === currentIndex;
                      const isUpcoming = index > currentIndex;

                      return (
                        <div
                          key={step.key}
                          className="flex flex-col items-center"
                          style={{ width: `${100 / statusSteps.length}%` }}
                        >
                          {/* Step Node */}
                          <div className="relative">
                            <div
                              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                                isCompleted
                                  ? "bg-gradient-to-br from-[#FF7A00] to-orange-500 text-white shadow-md shadow-orange-200/50"
                                  : isCurrent
                                  ? "bg-white border-[3px] border-[#FF7A00] text-[#FF7A00]"
                                  : "bg-gray-50 border-2 border-gray-200 text-gray-300"
                              }`}
                              style={isCurrent ? { 
                                boxShadow: '0 0 0 6px rgba(255, 122, 0, 0.08), 0 4px 16px rgba(255, 122, 0, 0.2)'
                              } : {}}
                            >
                              {isCompleted ? (
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                                </svg>
                              ) : (
                                <span className="text-base">{step.icon}</span>
                              )}
                            </div>
                            
                            {/* Pulse Effect for Current */}
                            {isCurrent && (
                              <>
                                <span className="absolute inset-0 rounded-full border-2 border-[#FF7A00] animate-ping opacity-30"></span>
                                <span className="absolute -inset-1 rounded-full bg-orange-400/10 animate-pulse"></span>
                              </>
                            )}
                          </div>
                          
                          {/* Label */}
                          <span
                            className={`text-[11px] mt-3 text-center leading-tight max-w-[60px] ${
                              isCompleted
                                ? "text-[#FF7A00] font-semibold"
                                : isCurrent
                                ? "text-gray-900 font-semibold"
                                : "text-gray-400 font-medium"
                            }`}
                          >
                            {step.label}
                          </span>
                          
                          {/* Current Status Indicator */}
                          {isCurrent && (
                            <div className="mt-2 px-2 py-0.5 bg-orange-100 rounded-full">
                              <span className="text-[9px] text-[#FF7A00] font-bold uppercase tracking-wide">
                                Current
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                {/* Estimated Time Card */}
                {order.estimated_duration_min && currentIndex < statusSteps.length - 1 && (
                  <div className="mt-6 pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-center gap-2 text-sm">
                      <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center">
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                      </div>
                      <span className="text-gray-600">
                        Estimated delivery in <span className="font-semibold text-gray-900">{order.estimated_duration_min} mins</span>
                      </span>
                    </div>
                  </div>
                )}
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
                  className="flex justify-between items-center bg-gray-50 rounded-2xl p-3"
                >
                  <div className="flex items-center gap-3">
                    {item.food_image_url ? (
                      <img
                        src={item.food_image_url}
                        alt={item.food_name}
                        className="w-14 h-14 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-orange-50 flex items-center justify-center">
                        <span className="text-2xl">🍽️</span>
                      </div>
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
                  <p className="font-semibold text-[#FF7A00]">
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
            <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Address</span>
                <span className="font-medium text-right max-w-[200px] text-gray-900">
                  {order.delivery_address}, {order.delivery_city}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Distance</span>
                <span className="font-medium text-gray-900">{order.distance_km} km</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Est. Time</span>
                <span className="font-medium text-gray-900">
                  {order.estimated_duration_min} min
                </span>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="border-t pt-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="text-gray-900">Rs. {parseFloat(order.subtotal).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Delivery Fee</span>
              <span className="text-gray-900">Rs. {parseFloat(order.delivery_fee).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Service Fee</span>
              <span className="text-gray-900">Rs. {parseFloat(order.service_fee).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-3">
              <span className="text-gray-900">Total</span>
              <span className="text-[#FF7A00]">
                Rs. {parseFloat(order.total_amount).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Payment</span>
              <span className="font-medium text-gray-900">
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

// ============================================================================
// NAV ITEM COMPONENT
// ============================================================================

const NavItem = ({ icon, label, active, onClick, badge }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center gap-0.5 py-1.5 px-4 transition-all duration-200 rounded-xl ${
      active ? "text-[#FF7A00] bg-orange-50" : "text-gray-400 hover:text-orange-300"
    }`}
  >
    <div className="relative">
      {icon}
      {badge && (
        <span className="absolute -top-2 -right-2 w-5 h-5 bg-[#FF7A00] text-white text-xs font-bold rounded-full flex items-center justify-center">
          {badge}
        </span>
      )}
    </div>
    <span className={`text-xs ${active ? "font-semibold" : "font-medium"}`}>
      {label}
    </span>
  </button>
);
