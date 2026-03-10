import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_URL } from "../../config";
import supabaseClient from "../../supabaseClient";
import AnimatedAlert, { useAlert } from "../../components/AnimatedAlert";
import AdminLayout from "../../components/AdminLayout";

export default function Orders() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setRawError] = useState(null);
  const [actionError, setRawActionError] = useState(null);
  const {
    alert: alertState,
    visible: alertVisible,
    showError,
    showSuccess,
  } = useAlert();
  const setError = (msg) => {
    setRawError(msg);
    if (msg) showError(msg);
  };
  const setActionError = (msg) => {
    setRawActionError(msg);
    if (msg) showError(msg);
  };
  const [statusFilter, setStatusFilter] = useState(
    searchParams.get("status") || "all",
  );
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [counts, setCounts] = useState({
    all: 0,
    pending: 0,
    accepted: 0,
    delivered: 0,
  });
  const [processingOrderId, setProcessingOrderId] = useState(null);
  const [newOrderNotification, setNewOrderNotification] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [rejectModal, setRejectModal] = useState({
    open: false,
    orderId: null,
  });
  const [rejectReason, setRejectReason] = useState("");

  // Normalize deliveries to always be an array (Supabase may return object for 1:1 relations)
  const normalizeDeliveries = (deliveries) => {
    if (!deliveries) return [];
    if (Array.isArray(deliveries)) return deliveries;
    return [deliveries]; // single object → wrap in array
  };

  const getDeliveryStatus = (order) => {
    const dels = normalizeDeliveries(order?.deliveries);
    return (
      dels[0]?.status || order?.delivery_status || order?.status || "placed"
    );
  };

  const getDriver = (order) => {
    const dels = normalizeDeliveries(order?.deliveries);
    return dels[0]?.drivers || null;
  };

  const computeCounts = (list) => {
    const allOrders = list || [];
    const pending = allOrders.filter(
      (o) => getDeliveryStatus(o) === "placed",
    ).length;
    const accepted = allOrders.filter((o) => {
      const s = getDeliveryStatus(o);
      return s === "pending" || s === "accepted";
    }).length;
    const delivered = allOrders.filter((o) => {
      const s = getDeliveryStatus(o);
      return (
        s === "picked_up" ||
        s === "on_the_way" ||
        s === "at_customer" ||
        s === "delivered"
      );
    }).length;

    return {
      all: allOrders.length,
      pending,
      accepted,
      delivered,
    };
  };

  const fetchOrders = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("Missing auth token. Please sign in again.");
        if (!silent) setLoading(false);
        return;
      }

      const response = await fetch(`${API_URL}/orders/restaurant/orders`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Failed to fetch orders");
      }

      const data = await response.json();
      setOrders(data.orders || []);
      setCounts(computeCounts(data.orders));
    } catch (err) {
      console.error("Failed to fetch orders", err);
      if (!silent) setError(err.message || "Failed to fetch orders");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Ref to always have the latest fetchOrders available in subscriptions
  const fetchOrdersRef = React.useRef(fetchOrders);
  fetchOrdersRef.current = fetchOrders;

  useEffect(() => {
    // Fetch restaurant info
    const fetchRestaurant = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_URL}/admin/restaurant`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setRestaurant(data.restaurant);
        }
      } catch (err) {
        console.error("Failed to fetch restaurant", err);
      }
    };

    fetchRestaurant();
    fetchOrders();

    // Set up real-time subscription for new deliveries
    const subscription = supabaseClient
      .channel("deliveries:new-inserts")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "deliveries",
        },
        (payload) => {
          console.log("New delivery created:", payload);
          setNewOrderNotification({
            message: "New order received! 🔔",
            timestamp: new Date(),
          });
          setTimeout(() => setNewOrderNotification(null), 5000);
          fetchOrdersRef.current?.(true);
        },
      )
      .subscribe();

    // Subscribe to delivery status changes to update revenue/counts in real-time
    const statusSubscription = supabaseClient
      .channel("deliveries:status-updates")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "deliveries",
        },
        (payload) => {
          const updatedDelivery = payload.new;
          console.log(
            "Delivery status updated:",
            updatedDelivery?.status,
            "delivery_id:",
            updatedDelivery?.id,
          );

          // Immediately update local state for instant UI feedback
          setOrders((prevOrders) => {
            const newOrders = prevOrders.map((order) => {
              const dels = normalizeDeliveries(order.deliveries);
              if (dels.some((d) => d.id === updatedDelivery.id)) {
                return {
                  ...order,
                  deliveries: dels.map((d) =>
                    d.id === updatedDelivery.id
                      ? {
                          ...d,
                          status: updatedDelivery.status,
                          driver_id: updatedDelivery.driver_id,
                        }
                      : d,
                  ),
                };
              }
              return order;
            });
            setCounts(computeCounts(newOrders));
            return newOrders;
          });

          // Also do a silent background fetch to get any additional data (driver info, etc.)
          fetchOrdersRef.current?.(true);
        },
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
      statusSubscription.unsubscribe();
    };
  }, []);

  // Auto-select order from URL params (from dashboard navigation)
  // Use a ref so this only fires once — prevents modal reopening after user closes it
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    const orderId = searchParams.get("orderId");
    if (orderId && orders.length > 0) {
      const target = orders.find((o) => o.id === orderId);
      if (target) {
        setSelectedOrder(target);
        autoOpenedRef.current = true;
      }
    }
  }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredOrders = orders.filter((order) => {
    const deliveryStatus = getDeliveryStatus(order);
    if (statusFilter === "all") return true;
    if (statusFilter === "pending") return deliveryStatus === "placed";
    if (statusFilter === "accepted")
      return deliveryStatus === "pending" || deliveryStatus === "accepted";
    if (statusFilter === "delivered")
      return (
        deliveryStatus === "picked_up" ||
        deliveryStatus === "on_the_way" ||
        deliveryStatus === "at_customer" ||
        deliveryStatus === "delivered"
      );
    return true;
  });

  const handleAcceptOrder = async (orderId) => {
    setProcessingOrderId(orderId);
    setActionError(null);

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setActionError("Missing auth token. Please sign in again.");
        return;
      }

      const response = await fetch(
        `${API_URL}/orders/restaurant/orders/${orderId}/status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "accepted" }),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Failed to accept order");
      }

      showSuccess("Order accepted!");
      fetchOrders();
    } catch (err) {
      console.error("Failed to accept order", err);
      setActionError(err.message || "Failed to accept order");
    } finally {
      setProcessingOrderId(null);
    }
  };

  const handleRejectOrder = (orderId) => {
    // Open the reject reason modal instead of rejecting immediately
    setRejectModal({ open: true, orderId });
    setRejectReason("");
  };

  const handleConfirmReject = async () => {
    const orderId = rejectModal.orderId;
    if (!orderId) return;
    if (!rejectReason.trim()) {
      setActionError("Please provide a reason for rejection");
      return;
    }

    setRejectModal({ open: false, orderId: null });
    setProcessingOrderId(orderId);
    setActionError(null);

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setActionError("Missing auth token. Please sign in again.");
        return;
      }

      const response = await fetch(
        `${API_URL}/orders/restaurant/orders/${orderId}/status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: "rejected",
            reason: rejectReason.trim(),
          }),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Failed to reject order");
      }

      showSuccess("Order rejected");
      fetchOrders();
    } catch (err) {
      console.error("Failed to reject order", err);
      setActionError(err.message || "Failed to reject order");
    } finally {
      setProcessingOrderId(null);
      setRejectReason("");
    }
  };

  const formatTime = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (isNaN(date.getTime())) return "-";

    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();

    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    if (isToday) {
      return `Today, ${timeStr}`;
    }

    return (
      date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }) + `, ${timeStr}`
    );
  };

  const getStatusConfig = (status) => {
    switch (status) {
      case "placed":
        return {
          label: "New Order",
          bg: "bg-amber-500/10",
          text: "text-amber-600",
          icon: "🆕",
        };
      case "pending":
        return {
          label: "Pending",
          bg: "bg-blue-500/10",
          text: "text-blue-600",
          icon: "⏳",
        };
      case "accepted":
        return {
          label: "Accepted",
          bg: "bg-emerald-500/10",
          text: "text-emerald-600",
          icon: "✓",
        };
      case "picked_up":
        return {
          label: "Picked Up",
          bg: "bg-purple-500/10",
          text: "text-purple-600",
          icon: "📦",
        };
      case "on_the_way":
        return {
          label: "On The Way",
          bg: "bg-sky-500/10",
          text: "text-sky-600",
          icon: "🚗",
        };
      case "at_customer":
        return {
          label: "Arriving",
          bg: "bg-indigo-500/10",
          text: "text-indigo-600",
          icon: "📍",
        };
      case "delivered":
        return {
          label: "Delivered",
          bg: "bg-green-500/10",
          text: "text-green-600",
          icon: "✅",
        };
      case "cancelled":
      case "rejected":
        return {
          label: status === "cancelled" ? "Cancelled" : "Rejected",
          bg: "bg-red-500/10",
          text: "text-red-600",
          icon: "❌",
        };
      default:
        return {
          label: status,
          bg: "bg-gray-500/10",
          text: "text-gray-600",
          icon: "•",
        };
    }
  };

  const calculateTodayRevenue = () => {
    const today = new Date().toDateString();
    // Admin earns only when driver picks up the order (delivery status >= picked_up)
    const pickedUpStatuses = [
      "picked_up",
      "on_the_way",
      "at_customer",
      "delivered",
    ];
    return orders
      .filter((o) => {
        const placedToday = new Date(o.placed_at).toDateString() === today;
        const deliveryStatus = getDeliveryStatus(o);
        return placedToday && pickedUpStatuses.includes(deliveryStatus);
      })
      .reduce((sum, o) => sum + parseFloat(o.subtotal || 0), 0);
  };

  const getTodayOrdersCount = () => {
    const today = new Date().toDateString();
    // Only count orders where driver has picked up (delivery status >= picked_up)
    const pickedUpStatuses = [
      "picked_up",
      "on_the_way",
      "at_customer",
      "delivered",
    ];
    return orders.filter((o) => {
      const placedToday = new Date(o.placed_at).toDateString() === today;
      const deliveryStatus = getDeliveryStatus(o);
      return placedToday && pickedUpStatuses.includes(deliveryStatus);
    }).length;
  };

  return (
    <AdminLayout noPadding>
      <AnimatedAlert alert={alertState} visible={alertVisible} />

      {/* Reject Reason Modal */}
      {rejectModal.open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="bg-red-50 px-5 py-4 border-b border-red-100">
              <h3 className="text-red-700 font-bold text-lg flex items-center gap-2">
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
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                Reject Order
              </h3>
              <p className="text-red-500 text-sm mt-1">
                This will notify the customer via message
              </p>
            </div>
            <div className="p-5">
              <label className="block text-gray-700 font-semibold text-sm mb-2">
                Reason for rejection <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Out of stock, Restaurant closing soon, Ingredient unavailable..."
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-300"
                rows={3}
                autoFocus
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => {
                    setRejectModal({ open: false, orderId: null });
                    setRejectReason("");
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm active:scale-[0.98] transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmReject}
                  disabled={!rejectReason.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold text-sm disabled:opacity-40 active:scale-[0.98] transition-all"
                >
                  Confirm Rejection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Header */}
      <div className="bg-gradient-to-br from-green-600 via-green-700 to-green-800 p-4 pb-20 lg:rounded-t-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-white text-xl font-bold">Orders</h1>
            <p className="text-white/70 text-xs font-medium">
              Order Management
            </p>
          </div>
          <button
            onClick={fetchOrders}
            className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white"
          >
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
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
        <div className="flex gap-3">
          <div className="flex-1 bg-white/15 backdrop-blur-sm border border-white/10 p-4 rounded-2xl">
            <span className="text-white/60 text-[10px] uppercase tracking-widest font-bold">
              Today's Orders
            </span>
            <span className="block text-white text-2xl font-bold mt-1">
              {getTodayOrdersCount()}
            </span>
          </div>
          <div className="flex-1 bg-white/15 backdrop-blur-sm border border-white/10 p-4 rounded-2xl">
            <span className="text-white/60 text-[10px] uppercase tracking-widest font-bold">
              Today's Revenue
            </span>
            <span className="block text-white text-2xl font-bold mt-1">
              Rs.{calculateTodayRevenue().toFixed(0)}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 -mt-14 pb-8">
        {/* New Order Notification */}
        {newOrderNotification && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-4 animate-pulse shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-2xl">🔔</div>
                <div>
                  <p className="font-bold text-emerald-800">
                    {newOrderNotification.message}
                  </p>
                  <p className="text-xs text-emerald-600">
                    {newOrderNotification.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setNewOrderNotification(null)}
                className="text-emerald-600 hover:text-emerald-800 p-1"
              >
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-3 hide-scrollbar mb-4">
          {[
            { key: "all", label: "All", count: counts.all },
            { key: "pending", label: "New", count: counts.pending },
            { key: "accepted", label: "Active", count: counts.accepted },
            { key: "delivered", label: "Done", count: counts.delivered },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                statusFilter === tab.key
                  ? "bg-[#065f46] text-white shadow-md"
                  : "bg-white text-gray-600 border border-gray-200"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* Orders Section Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">
            {statusFilter === "all"
              ? "Recent Orders"
              : statusFilter === "pending"
                ? "New Orders"
                : statusFilter === "accepted"
                  ? "Active Orders"
                  : "Completed Orders"}
          </h2>
        </div>

        {/* Orders List */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-4 border border-gray-100 skeleton-fade"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="space-y-2">
                    <div className="h-4 w-24 bg-gray-200 rounded" />
                    <div className="h-3 w-32 bg-gray-200 rounded" />
                  </div>
                  <div className="h-6 w-20 bg-gray-200 rounded-full" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-200 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-3/4 bg-gray-200 rounded" />
                    <div className="h-3 w-1/2 bg-gray-200 rounded" />
                  </div>
                  <div className="h-5 w-16 bg-gray-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">No orders found</p>
            <p className="text-gray-400 text-sm mt-1">
              {statusFilter === "all"
                ? "Orders will appear here"
                : `No ${statusFilter} orders`}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filteredOrders.map((order) => {
              const deliveryStatus = getDeliveryStatus(order);
              const statusConfig = getStatusConfig(deliveryStatus);
              const driver = getDriver(order);
              const items = order.order_items || [];

              return (
                <div
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-3 active:scale-[0.98] transition-transform cursor-pointer"
                >
                  {/* Order Header */}
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-800">
                          Order #{order.order_number || order.id?.slice(-6)}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full ${statusConfig.bg} ${statusConfig.text} text-[10px] font-bold uppercase tracking-wide`}
                        >
                          {statusConfig.label}
                        </span>
                      </div>
                      <p className="text-gray-500 text-[11px] font-medium mt-0.5">
                        {formatTime(order.placed_at || order.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end">
                      <p className="text-green-400 font-bold">
                        Rs.
                        {parseFloat(
                          order.subtotal || order.total_amount || 0,
                        ).toFixed(0)}
                      </p>
                    </div>
                  </div>

                  {/* Customer Info */}
                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                        <svg
                          className="w-5 h-5 text-gray-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-800 leading-none mb-0.5">
                          {order.customer_name || "Customer"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {order.customer_phone || "-"}
                        </p>
                      </div>
                    </div>
                    {order.customer_phone && (
                      <a
                        href={`tel:${order.customer_phone}`}
                        className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"
                      >
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
                            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                          />
                        </svg>
                      </a>
                    )}
                  </div>

                  {/* Food Items Preview */}
                  {items.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto hide-scrollbar -mx-1 px-1">
                      {items.slice(0, 4).map((item, idx) => (
                        <div
                          key={idx}
                          className="flex-shrink-0 flex items-center gap-2 bg-gray-50 p-1.5 pr-3 rounded-lg border border-gray-100"
                        >
                          {item.food_image_url ? (
                            <img
                              src={item.food_image_url}
                              alt={item.food_name}
                              className="w-8 h-8 rounded-md object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-md bg-gray-200 flex items-center justify-center">
                              <span className="text-xs">🍽️</span>
                            </div>
                          )}
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold text-gray-700">
                              {item.quantity}x{" "}
                              {item.food_name?.length > 12
                                ? item.food_name.slice(0, 12) + "..."
                                : item.food_name}
                            </span>
                            {item.size && (
                              <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 bg-emerald-50 rounded px-1 mt-0.5 leading-tight">
                                {item.size}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                      {items.length > 4 && (
                        <div className="flex-shrink-0 flex items-center px-3 bg-gray-50 rounded-lg border border-gray-100">
                          <span className="text-xs font-semibold text-gray-500">
                            +{items.length - 4} more
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="h-px bg-gray-100 w-full"></div>

                  {/* Driver Info or Actions */}
                  {driver ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                          Driver
                        </span>
                        <div className="flex items-center gap-1.5 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200">
                          <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-[10px] font-bold text-white">
                            {driver.full_name
                              ?.split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2) || "D"}
                          </span>
                          <span className="text-xs font-bold text-emerald-700">
                            {driver.full_name || "Driver"}
                          </span>
                        </div>
                      </div>
                      {driver.phone && (
                        <a
                          href={`tel:${driver.phone}`}
                          className="text-gray-400 hover:text-emerald-600"
                        >
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
                              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                            />
                          </svg>
                        </a>
                      )}
                    </div>
                  ) : deliveryStatus === "placed" ? (
                    <div
                      className="flex gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => handleAcceptOrder(order.id)}
                        disabled={processingOrderId === order.id}
                        className="flex-1 bg-emerald-500 text-white py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition-all"
                      >
                        {processingOrderId === order.id
                          ? "Processing..."
                          : "Accept Order"}
                      </button>
                      <button
                        onClick={() => handleRejectOrder(order.id)}
                        disabled={processingOrderId === order.id}
                        className="px-4 py-2.5 bg-red-50 text-red-600 rounded-xl font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition-all"
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                        {deliveryStatus === "pending" ||
                        deliveryStatus === "accepted"
                          ? "Waiting for driver"
                          : deliveryStatus === "delivered"
                            ? "Order completed"
                            : "In progress"}
                      </span>
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="text-emerald-600 text-sm font-semibold flex items-center gap-1"
                      >
                        View Details
                        <svg
                          className="w-4 h-4"
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
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* End of list indicator */}
            <div className="flex flex-col items-center justify-center py-8 opacity-40">
              <svg
                className="w-10 h-10 text-gray-400 mb-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm font-medium text-gray-500">
                That's all for now
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <OrderDetailsModal
          order={selectedOrder}
          onClose={() => {
            setSelectedOrder(null);
            // Clear orderId from URL so auto-open ref reset works on next navigation
            const params = new URLSearchParams(searchParams);
            if (params.has("orderId")) {
              params.delete("orderId");
              navigate(
                `/admin/orders${params.toString() ? `?${params}` : ""}`,
                { replace: true },
              );
            }
          }}
          getStatusConfig={getStatusConfig}
          getDeliveryStatus={getDeliveryStatus}
          getDriver={getDriver}
          onAccept={handleAcceptOrder}
          onReject={handleRejectOrder}
          processingOrderId={processingOrderId}
        />
      )}

      {/* Custom scrollbar hide */}
      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </AdminLayout>
  );
}

function OrderDetailsModal({
  order,
  onClose,
  getStatusConfig,
  getDeliveryStatus,
  getDriver,
  onAccept,
  onReject,
  processingOrderId,
}) {
  const deliveryStatus = getDeliveryStatus(order);
  const statusConfig = getStatusConfig(deliveryStatus);
  const driver = getDriver(order);
  const items = order.order_items || [];

  const formatDateTime = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-lg rounded-t-3xl max-h-[90vh] overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center py-3 sticky top-0 bg-white z-10">
          <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
        </div>

        {/* Header */}
        <div className="px-5 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-800">
                Order #{order.order_number || order.id?.slice(-6)}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {formatDateTime(order.placed_at || order.created_at)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`px-3 py-1 rounded-full ${statusConfig.bg} ${statusConfig.text} text-xs font-bold uppercase`}
              >
                {statusConfig.label}
              </span>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              >
                <svg
                  className="w-4 h-4 text-gray-600"
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

        <div className="p-5 space-y-5">
          {/* Customer Info */}
          <div className="bg-gray-50 rounded-2xl p-4">
            <h3 className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-3">
              Customer
            </h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-bold text-gray-800">
                    {order.customer_name || "Customer"}
                  </p>
                  <p className="text-sm text-gray-500">
                    {order.customer_phone || "-"}
                  </p>
                </div>
              </div>
              {order.customer_phone && (
                <a
                  href={`tel:${order.customer_phone}`}
                  className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30"
                >
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
                      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                    />
                  </svg>
                </a>
              )}
            </div>
            {order.delivery_address && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Delivery Address</p>
                <p className="text-sm text-gray-700 font-medium">
                  {order.delivery_address}
                </p>
              </div>
            )}
          </div>

          {/* Driver Info */}
          {driver && (
            <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
              <h3 className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider mb-3">
                Assigned Driver
              </h3>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold">
                    {driver.full_name
                      ?.split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2) || "D"}
                  </div>
                  <div>
                    <p className="font-bold text-gray-800">
                      {driver.full_name || "Driver"}
                    </p>
                    <p className="text-sm text-gray-500">
                      {driver.phone || "-"}
                    </p>
                  </div>
                </div>
                {driver.phone && (
                  <a
                    href={`tel:${driver.phone}`}
                    className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30"
                  >
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
                        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                      />
                    </svg>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Order Items */}
          <div>
            <h3 className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-3">
              Order Items ({items.length})
            </h3>
            <div className="space-y-2">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 bg-gray-50 rounded-xl p-3"
                >
                  {item.food_image_url ? (
                    <img
                      src={item.food_image_url}
                      alt={item.food_name}
                      className="w-14 h-14 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-gray-200 flex items-center justify-center">
                      <span className="text-2xl">🍽️</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 truncate">
                      {item.food_name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {item.size && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 rounded px-1.5 py-0.5">
                          {item.size}
                        </span>
                      )}
                      <span className="text-xs font-bold text-gray-500 bg-gray-200 rounded px-1.5 py-0.5">
                        x{item.quantity}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Rs.{parseFloat(item.unit_price || 0).toFixed(0)} each
                    </p>
                  </div>
                  <p className="font-bold text-gray-800 whitespace-nowrap">
                    Rs.
                    {parseFloat(
                      item.total_price || item.unit_price * item.quantity,
                    ).toFixed(0)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Order Summary */}
          <div className="bg-gray-50 rounded-2xl p-4">
            <div className="flex justify-between items-center">
              <span className="font-bold text-gray-800">Admin Total</span>
              <span className="text-2xl font-bold text-emerald-600">
                Rs.{parseFloat(order.subtotal || 0).toFixed(0)}
              </span>
            </div>
          </div>
        </div>

        {/* Accept / Reject Buttons for new orders */}
        {deliveryStatus === "placed" && (
          <div className="px-5 pb-3 flex gap-3">
            <button
              onClick={() => {
                onAccept(order.id);
                onClose();
              }}
              disabled={processingOrderId === order.id}
              className="flex-1 bg-emerald-500 text-white py-3.5 rounded-xl font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition-all shadow-lg shadow-emerald-500/20"
            >
              {processingOrderId === order.id
                ? "Processing..."
                : "Accept Order"}
            </button>
            <button
              onClick={() => {
                onReject(order.id);
                onClose();
              }}
              disabled={processingOrderId === order.id}
              className="px-6 py-3.5 bg-red-50 text-red-600 border border-red-200 rounded-xl font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              Reject
            </button>
          </div>
        )}

        {/* Close Button */}
        <div className="p-5 pt-0">
          <button
            onClick={onClose}
            className="w-full bg-gray-100 text-gray-700 py-3.5 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all"
          >
            Close
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
