import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import { API_URL } from "../../config";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function AdminDashboard() {
  const [dashboardData, setDashboardData] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [slideIn, setSlideIn] = useState(false);
  const [restaurant, setRestaurant] = useState(null);
  const [toggling, setToggling] = useState(false);
  const [chartPeriod, setChartPeriod] = useState("week");
  const navigate = useNavigate();

  const token = localStorage.getItem("token");

  // Fetch dashboard stats (can be called separately for chart period changes)
  const fetchDashboardStats = useCallback(
    async (period) => {
      if (!token) return;
      try {
        const res = await fetch(
          `${API_URL}/admin/dashboard-stats?chartPeriod=${period}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = await res.json();
        if (res.ok) setDashboardData(data);
      } catch (err) {
        console.error("Dashboard stats error:", err);
      }
    },
    [token],
  );

  useEffect(() => {
    setTimeout(() => setSlideIn(true), 50);

    const fetchAll = async () => {
      if (!token) return;
      setLoading(true);
      try {
        await Promise.all([
          fetchDashboardStats(chartPeriod),
          fetch(`${API_URL}/admin/orders?limit=5`, {
            headers: { Authorization: `Bearer ${token}` },
          })
            .then((r) => r.json())
            .then((d) => {
              if (d.orders) setRecentOrders(d.orders);
            }),
          fetch(`${API_URL}/admin/restaurant`, {
            headers: { Authorization: `Bearer ${token}` },
          })
            .then((r) => r.json())
            .then((d) => {
              if (d.restaurant) setRestaurant(d.restaurant);
            }),
        ]);
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  // Re-fetch chart data when period changes (skip initial load)
  useEffect(() => {
    if (!loading && token) {
      fetchDashboardStats(chartPeriod);
    }
  }, [chartPeriod]);

  const toggleRestaurantOpen = async () => {
    if (toggling) return;
    setToggling(true);
    setRestaurant((prev) =>
      prev ? { ...prev, is_open: !prev.is_open } : prev,
    );
    try {
      const res = await fetch(`${API_URL}/admin/restaurant/toggle-open`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.restaurant) {
        setRestaurant(data.restaurant);
      } else {
        setRestaurant((prev) =>
          prev ? { ...prev, is_open: !prev.is_open } : prev,
        );
      }
    } catch {
      setRestaurant((prev) =>
        prev ? { ...prev, is_open: !prev.is_open } : prev,
      );
    } finally {
      setToggling(false);
    }
  };

  // Helpers
  const formatCurrency = (val) => `Rs. ${(val || 0).toLocaleString()}`;

  const ChangeIndicator = ({ value }) => {
    if (value === 0 || value === undefined)
      return (
        <span className="text-xs text-gray-400 font-medium">No change</span>
      );
    const isPositive = value > 0;
    return (
      <span
        className={`text-xs font-semibold flex items-center gap-1 ${isPositive ? "text-green-600" : "text-red-500"}`}
      >
        <span
          className={`inline-flex items-center justify-center w-4 h-4 rounded-full ${isPositive ? "bg-green-100" : "bg-red-100"}`}
        >
          {isPositive ? "↗" : "↘"}
        </span>
        {Math.abs(value)}%
        <span className="text-gray-400 font-normal">vs yesterday</span>
      </span>
    );
  };

  // Helper: get order status filter tab for navigation
  const getOrderStatusFilter = (order) => {
    const ds = order.delivery_status;
    if (!ds || ds === "placed") return "pending";
    if (ds === "pending" || ds === "accepted") return "accepted";
    if (["picked_up", "on_the_way", "at_customer", "delivered"].includes(ds)) return "delivered";
    return "all";
  };

  // Helper: get display status badge
  const getStatusBadge = (order) => {
    const ds = order.delivery_status || order.status;
    const map = {
      placed: { label: "New", bg: "bg-amber-100", text: "text-amber-700" },
      pending: { label: "Accepted", bg: "bg-green-100", text: "text-green-700" },
      accepted: { label: "Accepted", bg: "bg-green-100", text: "text-green-700" },
      picked_up: { label: "Picked Up", bg: "bg-blue-100", text: "text-blue-700" },
      on_the_way: { label: "On the Way", bg: "bg-blue-100", text: "text-blue-700" },
      at_customer: { label: "Arriving", bg: "bg-indigo-100", text: "text-indigo-700" },
      delivered: { label: "Delivered", bg: "bg-emerald-100", text: "text-emerald-700" },
      rejected: { label: "Rejected", bg: "bg-red-100", text: "text-red-600" },
      cancelled: { label: "Cancelled", bg: "bg-gray-100", text: "text-gray-600" },
    };
    const s = map[ds] || { label: ds || "Unknown", bg: "bg-gray-100", text: "text-gray-600" };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    );
  };

  // Format date/time for recent orders
  const formatOrderDateTime = (dateStr) => {
    if (!dateStr) return { date: "", time: "" };
    const d = new Date(dateStr);
    return {
      date: d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
      time: d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
    };
  };

  // Loading skeleton
  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-4">
          <div className="animate-pulse flex items-center gap-3">
            <div className="w-12 h-12 bg-gray-100 rounded-xl" />
            <div className="space-y-2">
              <div className="h-6 w-44 bg-gray-100 rounded" />
              <div className="h-3 w-28 bg-gray-100 rounded" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 animate-pulse">
                <div className="h-3 w-20 bg-gray-100 rounded mb-3" />
                <div className="h-7 w-24 bg-gray-100 rounded mb-1" />
                <div className="h-3 w-16 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 animate-pulse">
            <div className="h-4 w-36 bg-gray-100 rounded mb-4" />
            <div className="h-56 bg-gray-50 rounded-lg" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div
        className={`transition-all duration-500 ease-in-out ${slideIn ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"}`}
      >
        <div className="space-y-4">
          {/* ═══════════ Block 1: Restaurant Header ═══════════ */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 animate-slideDown">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {restaurant?.logo_url ? (
                  <img
                    src={restaurant.logo_url}
                    alt={restaurant.restaurant_name}
                    className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl object-cover shadow-sm border border-gray-200"
                  />
                ) : (
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-white text-xl font-bold shadow-sm" style={{ background: "linear-gradient(135deg, #06C168, #05a85a)" }}>
                    {restaurant?.restaurant_name?.charAt(0) || "R"}
                  </div>
                )}
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                    {restaurant?.restaurant_name || "Dashboard"}
                  </h1>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date().toLocaleDateString("en-IN", {
                      weekday: "long",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>

              <button
                onClick={toggleRestaurantOpen}
                disabled={toggling}
                className={`flex items-center gap-2.5 px-4 py-2 rounded-xl border transition-all duration-300 ${
                  restaurant?.is_open
                    ? "border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                    : "border-red-200 bg-red-50 hover:bg-red-100"
                }`}
              >
                <div
                  className={`relative w-10 h-5 rounded-full transition-colors duration-300 ${
                    restaurant?.is_open ? "bg-[#06C168]" : "bg-red-400"
                  }`}
                >
                  <div
                    className={`absolute top-[2px] left-[2px] w-4 h-4 bg-white rounded-full shadow transition-transform duration-300 ${
                      restaurant?.is_open ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </div>
                <span className={`text-sm font-semibold ${restaurant?.is_open ? "text-[#06C168]" : "text-red-500"}`}>
                  {restaurant?.is_open ? "Open" : "Closed"}
                </span>
                {restaurant?.is_manually_overridden && (
                  <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full font-medium">
                    Manual
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* ═══════════ Block 2: Today's Performance ═══════════ */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 animate-fadeInUp">
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span className="w-0.5 h-4 rounded-full" style={{ background: "#06C168" }}></span>
              Today's Performance
            </h3>

            {/* Sales + Orders in same row */}
            <div className="grid grid-cols-2 gap-3">
              {/* Today Sales */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(6,193,104,0.1)" }}>
                    <svg className="w-4 h-4" style={{ color: "#06C168" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">Today Sales</p>
                </div>
                <p className="text-xl font-bold" style={{ color: "#06C168" }}>
                  {formatCurrency(dashboardData?.today?.sales)}
                </p>
                <div className="mt-1">
                  <ChangeIndicator value={dashboardData?.changes?.salesChange} />
                </div>
              </div>

              {/* Today Orders */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                  </div>
                  <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">Today Orders</p>
                </div>
                <p className="text-xl font-bold text-blue-600">
                  {dashboardData?.today?.orders || 0}
                </p>
                <div className="mt-1">
                  <ChangeIndicator value={dashboardData?.changes?.ordersChange} />
                </div>
              </div>
            </div>

            {/* Avg Order Value — small row below */}
            <div className="mt-2 bg-purple-50/50 rounded-lg px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-purple-100 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <span className="text-xs text-gray-500 font-medium">Avg Order Value</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-purple-600">{formatCurrency(dashboardData?.today?.avgOrderValue)}</span>
                <ChangeIndicator value={dashboardData?.changes?.avgChange} />
              </div>
            </div>
          </div>

          {/* ═══════════ Block 3: Last 30 Days Performance ═══════════ */}
          <div className="grid grid-cols-2 gap-3">
            <div
              className="text-white rounded-xl p-4 shadow-md hover:shadow-lg transition-all duration-300 animate-fadeInUp"
              style={{ background: "linear-gradient(135deg, #06C168, #05a85a, #048a4a)", animationDelay: "0.15s" }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider opacity-90">
                    Revenue
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold mt-1">
                    {formatCurrency(dashboardData?.lifetime?.totalRevenue)}
                  </p>
                  <p className="text-[10px] opacity-75 mt-1">Last 30 days</p>
                </div>
                <div className="text-3xl opacity-70">💰</div>
              </div>
            </div>
            <div
              className="bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white rounded-xl p-4 shadow-md hover:shadow-lg transition-all duration-300 animate-fadeInUp"
              style={{ animationDelay: "0.2s" }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider opacity-90">
                    Orders
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold mt-1">
                    {(dashboardData?.lifetime?.totalOrders || 0).toLocaleString()}
                  </p>
                  <p className="text-[10px] opacity-75 mt-1">Last 30 days</p>
                </div>
                <div className="text-3xl opacity-70">📦</div>
              </div>
            </div>
          </div>

          {/* ═══════════ Block 4: Products Info — Same Row ═══════════ */}
          <div className="grid grid-cols-2 gap-3">
            <div
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-all duration-300 animate-fadeInUp"
              style={{ animationDelay: "0.25s" }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">
                    Total Products
                  </p>
                  <p className="text-2xl font-bold text-orange-600 mt-1">
                    {dashboardData?.products?.total || 0}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">All menu items</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center text-xl">
                  🍽️
                </div>
              </div>
            </div>
            <div
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-all duration-300 animate-fadeInUp"
              style={{ animationDelay: "0.3s" }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">
                    Available
                  </p>
                  <p className="text-2xl font-bold mt-1" style={{ color: "#06C168" }}>
                    {dashboardData?.products?.available || 0}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Currently active</p>
                </div>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl" style={{ background: "rgba(6,193,104,0.08)" }}>
                  ✅
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════ Block 5: Sales Performance Chart ═══════════ */}
          <div
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 animate-fadeInUp"
            style={{ animationDelay: "0.35s" }}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <span className="w-0.5 h-4 rounded-full" style={{ background: "#06C168" }}></span>
                Sales Performance
              </h3>
              <div className="flex gap-1.5">
                {["week", "month", "year"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setChartPeriod(p)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200 ${
                      chartPeriod === p
                        ? "text-white shadow-sm"
                        : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                    }`}
                    style={chartPeriod === p ? { background: "#06C168" } : {}}
                  >
                    {p === "week" ? "Weekly" : p === "month" ? "Monthly" : "Yearly"}
                  </button>
                ))}
              </div>
            </div>

            {dashboardData?.chartData?.length > 0 ? (
              <div className="h-56 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={dashboardData.chartData}
                    margin={{ top: 5, right: 5, left: -15, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06C168" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#06C168" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "#9ca3af" }}
                      tickFormatter={(val) => {
                        if (chartPeriod === "year") {
                          const [, m] = val.split("-");
                          const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                          return months[parseInt(m) - 1] || val;
                        }
                        const d = new Date(val);
                        return `${d.getDate()}/${d.getMonth() + 1}`;
                      }}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickFormatter={(val) => `Rs.${val}`} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid #e5e7eb",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                        fontSize: "12px",
                      }}
                      formatter={(value) => [`Rs. ${value.toLocaleString()}`, "Earnings"]}
                      labelFormatter={(label) => {
                        if (chartPeriod === "year") return label;
                        return new Date(label).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      stroke="#06C168"
                      strokeWidth={2}
                      fill="url(#colorAmount)"
                      dot={{ r: 2.5, fill: "#06C168" }}
                      activeDot={{ r: 5, fill: "#05a85a" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-56 sm:h-72 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <svg className="w-10 h-10 mx-auto mb-2 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <p className="text-xs font-medium">No sales data for this period</p>
                </div>
              </div>
            )}
          </div>

          {/* ═══════════ Block 6: Recent Orders ═══════════ */}
          <div
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 animate-fadeInUp"
            style={{ animationDelay: "0.4s" }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <span className="w-0.5 h-4 rounded-full" style={{ background: "#06C168" }}></span>
                Recent Orders
              </h3>
              <button
                onClick={() => navigate("/admin/orders")}
                className="text-xs font-medium hover:underline"
                style={{ color: "#06C168" }}
              >
                View All
              </button>
            </div>

            {recentOrders.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <div className="w-14 h-14 mx-auto mb-3 rounded-xl flex items-center justify-center" style={{ background: "rgba(6,193,104,0.08)" }}>
                  <svg className="w-7 h-7" style={{ color: "#06C168" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-600">No orders yet</p>
                <p className="text-xs mt-1 text-gray-400">Orders will appear here once customers start ordering</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentOrders.map((order, index) => {
                  const dt = formatOrderDateTime(order.created_at);
                  return (
                    <div
                      key={order.id}
                      onClick={() => navigate(`/admin/orders?status=${getOrderStatusFilter(order)}&orderId=${order.id}`)}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-all duration-200 cursor-pointer group border border-transparent hover:border-gray-100"
                      style={{ animationDelay: `${index * 40}ms` }}
                    >
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm" style={{ background: "linear-gradient(135deg, #06C168, #05a85a)" }}>
                        {order.customer.charAt(0).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800 text-sm truncate">{order.customer}</span>
                          {getStatusBadge(order)}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] font-medium" style={{ color: "#06C168" }}>#{order.order_number}</span>
                          <span className="text-gray-300">·</span>
                          <span className="text-[11px] text-gray-400">{order.items?.length > 40 ? order.items.substring(0, 40) + "..." : order.items}</span>
                        </div>
                      </div>

                      {/* Amount + Date/Time */}
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold" style={{ color: "#06C168" }}>
                          Rs. {order.amount.toLocaleString()}
                        </p>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          <span>{dt.date}</span>
                          <span className="mx-0.5">·</span>
                          <span>{dt.time}</span>
                        </div>
                      </div>

                      {/* Arrow */}
                      <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-15px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.6s ease-out; }
        .animate-fadeInUp { animation: fadeInUp 0.6s ease-out forwards; }
        .animate-slideDown { animation: slideDown 0.5s ease-out; }
      `}</style>
    </AdminLayout>
  );
}