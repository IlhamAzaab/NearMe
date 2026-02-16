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

  // Loading skeleton
  if (loading) {
    return (
      <AdminLayout>
        <div className="min-h-screen bg-gradient-to-br from-green-50 via-green-50 to-green-100 p-4 sm:p-6 md:p-8 space-y-6">
          {/* Header skeleton */}
          <div className="animate-pulse flex items-center gap-4">
            <div className="w-14 h-14 bg-gray-200 rounded-2xl" />
            <div className="space-y-2">
              <div className="h-7 w-48 bg-gray-200 rounded" />
              <div className="h-4 w-32 bg-gray-200 rounded" />
            </div>
          </div>
          {/* Toggle skeleton */}
          <div className="animate-pulse">
            <div className="h-12 w-56 bg-gray-200 rounded-2xl" />
          </div>
          {/* Today performance skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-6 border border-gray-100 animate-pulse"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="h-3 w-24 bg-gray-200 rounded" />
                  <div className="w-10 h-10 bg-gray-200 rounded-xl" />
                </div>
                <div className="h-8 w-28 bg-gray-200 rounded mb-2" />
                <div className="h-3 w-20 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
          {/* Lifetime skeleton */}
          <div className="grid grid-cols-2 gap-4">
            {[...Array(2)].map((_, i) => (
              <div
                key={i}
                className="h-28 bg-gray-200 rounded-2xl animate-pulse"
              />
            ))}
          </div>
          {/* Chart skeleton */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 animate-pulse">
            <div className="h-5 w-40 bg-gray-200 rounded mb-6" />
            <div className="h-64 bg-gray-100 rounded-xl" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div
        className={`min-h-screen bg-gradient-to-br from-green-50 via-green-50 to-green-100 transition-all duration-500 ease-in-out ${slideIn ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"}`}
      >
        <div className="space-y-6 sm:space-y-8 p-4 sm:p-6 md:p-8">
          {/* ═══════════ Block 1: Restaurant Header Card ═══════════ */}
          <div className="bg-white rounded-2xl shadow-md border border-green-100 p-6 animate-slideDown">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              {/* Restaurant Info */}
              <div className="flex items-center gap-4">
                {restaurant?.logo_url ? (
                  <img
                    src={restaurant.logo_url}
                    alt={restaurant.restaurant_name}
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover shadow-md border-2 border-green-200"
                  />
                ) : (
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-2xl font-bold shadow-md">
                    {restaurant?.restaurant_name?.charAt(0) || "R"}
                  </div>
                )}
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-green-600 via-green-500 to-green-600 bg-clip-text text-transparent drop-shadow-sm">
                    {restaurant?.restaurant_name || "Dashboard"}
                  </h1>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Dashboard Overview •{" "}
                    {new Date().toLocaleDateString("en-IN", {
                      weekday: "long",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>

              {/* Open/Close Toggle */}
              <button
                onClick={toggleRestaurantOpen}
                disabled={toggling}
                className={`flex items-center gap-3 px-5 py-3 rounded-2xl border-2 transition-all duration-300 shadow-sm hover:shadow-md ${
                  restaurant?.is_open
                    ? "border-green-300 bg-green-50 hover:bg-green-100"
                    : "border-red-300 bg-red-50 hover:bg-red-100"
                }`}
              >
                <div
                  className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${
                    restaurant?.is_open ? "bg-green-500" : "bg-red-400"
                  }`}
                >
                  <div
                    className={`absolute top-[3px] left-[3px] w-[18px] h-[18px] bg-white rounded-full shadow transition-transform duration-300 ${
                      restaurant?.is_open ? "translate-x-6" : "translate-x-0"
                    }`}
                  />
                </div>
                <span
                  className={`text-sm font-bold ${restaurant?.is_open ? "text-green-700" : "text-red-600"}`}
                >
                  Restaurant is {restaurant?.is_open ? "Open" : "Closed"}
                </span>
                {restaurant?.is_manually_overridden && (
                  <span className="text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                    Manual
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* ═══════════ Block 2: Today Performance — Combined Box ═══════════ */}
          <div className="bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-500 p-6 border border-green-100 animate-fadeInUp">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
              <span className="w-1 h-6 bg-gradient-to-b from-green-500 to-green-600 rounded-full"></span>
              Today's Performance
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {/* Today Sales */}
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-green-100 to-green-50 shadow-sm">
                  <svg
                    className="w-6 h-6 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
                    Today Sales
                  </p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(dashboardData?.today?.sales)}
                  </p>
                  <div className="mt-1">
                    <ChangeIndicator
                      value={dashboardData?.changes?.salesChange}
                    />
                  </div>
                </div>
              </div>

              {/* Today Orders */}
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 shadow-sm">
                  <svg
                    className="w-6 h-6 text-blue-600"
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
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
                    Today Orders
                  </p>
                  <p className="text-2xl font-bold text-blue-600">
                    {dashboardData?.today?.orders || 0}
                  </p>
                  <div className="mt-1">
                    <ChangeIndicator
                      value={dashboardData?.changes?.ordersChange}
                    />
                  </div>
                </div>
              </div>

              {/* Avg Order Value */}
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-purple-100 to-purple-50 shadow-sm">
                  <svg
                    className="w-6 h-6 text-purple-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
                    Avg Order Value
                  </p>
                  <p className="text-2xl font-bold text-purple-600">
                    {formatCurrency(dashboardData?.today?.avgOrderValue)}
                  </p>
                  <div className="mt-1">
                    <ChangeIndicator value={dashboardData?.changes?.avgChange} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════ Block 4: Lifetime — Total Revenue + Total Orders ═══════════ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div
              className="bg-gradient-to-br from-green-500 via-green-600 to-green-700 text-white rounded-2xl p-5 sm:p-6 shadow-lg hover:shadow-2xl hover:scale-[1.02] transition-all duration-500 animate-fadeInUp"
              style={{ animationDelay: "0.25s" }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wider opacity-90">
                    Total Revenue
                  </p>
                  <p className="text-3xl sm:text-4xl font-bold mt-2 drop-shadow-md">
                    {formatCurrency(dashboardData?.lifetime?.totalRevenue)}
                  </p>
                  <p className="text-xs opacity-80 mt-1.5">
                    Lifetime admin earnings
                  </p>
                </div>
                <div className="text-5xl opacity-80">💰</div>
              </div>
            </div>
            <div
              className="bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white rounded-2xl p-5 sm:p-6 shadow-lg hover:shadow-2xl hover:scale-[1.02] transition-all duration-500 animate-fadeInUp"
              style={{ animationDelay: "0.3s" }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wider opacity-90">
                    Total Orders
                  </p>
                  <p className="text-3xl sm:text-4xl font-bold mt-2 drop-shadow-md">
                    {(
                      dashboardData?.lifetime?.totalOrders || 0
                    ).toLocaleString()}
                  </p>
                  <p className="text-xs opacity-80 mt-1.5">
                    All time orders fulfilled
                  </p>
                </div>
                <div className="text-5xl opacity-80">📦</div>
              </div>
            </div>
          </div>

          {/* ═══════════ Block 5: Sales Performance Graph ═══════════ */}
          <div
            className="bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-500 p-4 sm:p-6 border border-green-100 animate-fadeInUp"
            style={{ animationDelay: "0.35s" }}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
              <h3 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center gap-2">
                <span className="w-1 h-6 bg-gradient-to-b from-green-500 to-green-600 rounded-full"></span>
                Sales Performance
              </h3>
              <div className="flex gap-2">
                {["week", "month", "year"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setChartPeriod(p)}
                    className={`px-4 py-1.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                      chartPeriod === p
                        ? "bg-gradient-to-r from-green-500 to-green-600 text-white shadow-md"
                        : "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                    }`}
                  >
                    {p === "week"
                      ? "Weekly"
                      : p === "month"
                        ? "Monthly"
                        : "Yearly"}
                  </button>
                ))}
              </div>
            </div>

            {dashboardData?.chartData?.length > 0 ? (
              <div className="h-64 sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={dashboardData.chartData}
                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="colorAmount"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#22c55e"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#22c55e"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12, fill: "#6b7280" }}
                      tickFormatter={(val) => {
                        if (chartPeriod === "year") {
                          const [y, m] = val.split("-");
                          const months = [
                            "Jan",
                            "Feb",
                            "Mar",
                            "Apr",
                            "May",
                            "Jun",
                            "Jul",
                            "Aug",
                            "Sep",
                            "Oct",
                            "Nov",
                            "Dec",
                          ];
                          return months[parseInt(m) - 1] || val;
                        }
                        const d = new Date(val);
                        return `${d.getDate()}/${d.getMonth() + 1}`;
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: "#6b7280" }}
                      tickFormatter={(val) => `Rs.${val}`}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "12px",
                        border: "1px solid #dcfce7",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                      }}
                      formatter={(value) => [
                        `Rs. ${value.toLocaleString()}`,
                        "Earnings",
                      ]}
                      labelFormatter={(label) => {
                        if (chartPeriod === "year") return label;
                        return new Date(label).toLocaleDateString("en-IN", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        });
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      stroke="#22c55e"
                      strokeWidth={2.5}
                      fill="url(#colorAmount)"
                      dot={{ r: 3, fill: "#22c55e" }}
                      activeDot={{ r: 6, fill: "#16a34a" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 sm:h-80 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <svg
                    className="w-12 h-12 mx-auto mb-3 text-gray-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                  <p className="text-sm font-medium">
                    No sales data for this period
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ═══════════ Block 6: Restaurant Food Info ═══════════ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div
              className="bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-500 p-5 sm:p-6 border border-green-100 animate-fadeInUp"
              style={{ animationDelay: "0.4s" }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 font-semibold uppercase tracking-wide">
                    Total Products
                  </p>
                  <p className="text-3xl font-bold text-orange-600 mt-2">
                    {dashboardData?.products?.total || 0}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">All menu items</p>
                </div>
                <div className="p-3 rounded-xl bg-gradient-to-br from-orange-100 to-orange-50 text-3xl shadow-sm">
                  🍽️
                </div>
              </div>
            </div>
            <div
              className="bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-500 p-5 sm:p-6 border border-green-100 animate-fadeInUp"
              style={{ animationDelay: "0.45s" }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 font-semibold uppercase tracking-wide">
                    Available Products
                  </p>
                  <p className="text-3xl font-bold text-green-600 mt-2">
                    {dashboardData?.products?.available || 0}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Currently active</p>
                </div>
                <div className="p-3 rounded-xl bg-gradient-to-br from-green-100 to-green-50 text-3xl shadow-sm">
                  ✅
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════ Block 7: Recent Orders ═══════════ */}
          <div
            className="bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-500 p-4 sm:p-6 border border-green-100 animate-fadeInUp"
            style={{ animationDelay: "0.5s" }}
          >
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center gap-2">
                  <span className="w-1 h-6 bg-gradient-to-b from-green-500 to-green-600 rounded-full"></span>
                  Recent Orders
                </h3>
                <p className="text-gray-500 text-xs sm:text-sm mt-1 ml-3">
                  Latest customer orders
                </p>
              </div>
            </div>

            {recentOrders.length === 0 ? (
              <div className="text-center py-12 sm:py-16 text-gray-500">
                <div className="w-16 sm:w-20 h-16 sm:h-20 mx-auto mb-4 bg-gradient-to-br from-green-100 to-green-200 rounded-2xl flex items-center justify-center">
                  <svg
                    className="w-8 sm:w-10 h-8 sm:h-10 text-green-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                    />
                  </svg>
                </div>
                <p className="text-lg font-semibold text-gray-700">
                  No orders yet
                </p>
                <p className="text-sm mt-2 text-gray-500">
                  Orders will appear here once customers start ordering
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <div className="inline-block min-w-full align-middle">
                  <div className="overflow-hidden">
                    <table className="min-w-full">
                      <thead>
                        <tr className="border-b-2 border-green-100">
                          <th className="text-left py-3 sm:py-4 px-3 sm:px-0 text-gray-700 font-bold text-xs uppercase tracking-wider">
                            Customer
                          </th>
                          <th className="text-left py-3 sm:py-4 px-3 sm:px-0 text-gray-700 font-bold text-xs uppercase tracking-wider hidden sm:table-cell">
                            Items
                          </th>
                          <th className="text-left py-3 sm:py-4 px-3 sm:px-0 text-gray-700 font-bold text-xs uppercase tracking-wider">
                            Amount
                          </th>
                          <th className="text-left py-3 sm:py-4 px-3 sm:px-0 text-gray-700 font-bold text-xs uppercase tracking-wider hidden md:table-cell">
                            Time
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentOrders.map((order, index) => (
                          <tr
                            key={order.id}
                            className="border-b border-green-50 hover:bg-green-50/50 transition-all duration-300 group"
                            style={{ animationDelay: `${index * 50}ms` }}
                          >
                            <td className="py-4 sm:py-5 px-3 sm:px-0">
                              <div className="flex items-center">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-green-400 to-green-500 flex items-center justify-center text-white text-xs sm:text-sm font-bold mr-2 sm:mr-3 shadow-sm">
                                  {order.customer.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <span className="font-medium text-gray-700 text-sm block">
                                    {order.customer}
                                  </span>
                                  <span className="text-xs text-green-600 font-semibold">
                                    #{order.order_number}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 sm:py-5 px-3 sm:px-0 text-xs sm:text-sm text-gray-600 hidden sm:table-cell">
                              <div className="max-w-xs truncate">
                                {order.items}
                              </div>
                            </td>
                            <td className="py-4 sm:py-5 px-3 sm:px-0 font-bold text-green-600 text-sm">
                              Rs. {order.amount.toLocaleString()}
                            </td>
                            <td className="py-4 sm:py-5 px-3 sm:px-0 text-gray-500 text-xs sm:text-sm hidden md:table-cell">
                              {order.time}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
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
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.8s ease-out; }
        .animate-fadeInUp { animation: fadeInUp 0.8s ease-out forwards; }
        .animate-slideDown { animation: slideDown 0.6s ease-out; }
      `}</style>
    </AdminLayout>
  );
}