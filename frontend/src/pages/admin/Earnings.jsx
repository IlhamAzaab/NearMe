import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "../../components/AdminLayout";
import { API_URL } from "../../config";
import { useAdminCache, CACHE_KEYS } from "../../context/AdminCacheContext";

export default function Earnings() {
  const navigate = useNavigate();
  const { getCache, setCache } = useAdminCache();
  const token = localStorage.getItem("token");

  // Initialize from cache for instant display
  const cachedEarnings = getCache(CACHE_KEYS.EARNINGS);
  const cachedRestaurant = getCache(CACHE_KEYS.RESTAURANT);

  const [period, setPeriod] = useState("all");

  const {
    data: earnings,
    isLoading: earningsLoading,
    isFetching: earningsFetching,
  } = useQuery({
    queryKey: ["admin", "earnings", period, token],
    enabled: !!token,
    initialData: cachedEarnings || undefined,
    staleTime: 15 * 1000,
    refetchOnMount: "always",
    refetchInterval: 20 * 1000,
    refetchIntervalInBackground: true,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/admin/earnings?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to fetch earnings");
      setCache(CACHE_KEYS.EARNINGS, data.earnings);
      return data.earnings;
    },
  });

  const { data: payouts = [] } = useQuery({
    queryKey: ["admin", "payouts", token],
    enabled: !!token,
    staleTime: 20 * 1000,
    refetchOnMount: "always",
    refetchInterval: 30 * 1000,
    refetchIntervalInBackground: true,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/admin/payouts?limit=5`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to fetch payouts");
      return data.payouts || [];
    },
  });

  const { data: restaurant = cachedRestaurant || null } = useQuery({
    queryKey: ["admin", "restaurant", token],
    enabled: !!token,
    initialData: cachedRestaurant || undefined,
    staleTime: 30 * 1000,
    refetchOnMount: "always",
    refetchInterval: 30 * 1000,
    refetchIntervalInBackground: true,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/admin/restaurant`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.message || "Failed to fetch restaurant");
      setCache(CACHE_KEYS.RESTAURANT, data.restaurant);
      return data.restaurant;
    },
  });

  const loading = earningsLoading && !earnings;
  const refreshing = earningsFetching && !!earnings;

  const formatCurrency = (amount) => {
    return `Rs. ${(amount || 0).toLocaleString()}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getComparisonLabel = () => {
    switch (period) {
      case "today":
        return "vs. yesterday";
      case "week":
        return "vs. prev 7 days";
      case "month":
        return "vs. prev 30 days";
      case "year":
        return "vs. prev year";
      default:
        return null;
    }
  };

  const comparisonLabel = getComparisonLabel();
  const pct = earnings?.percentageChange || 0;
  const isUp = pct >= 0;
  const showComparison = comparisonLabel && pct !== 0;

  // Generate chart path from data
  const generateChartPath = () => {
    if (!earnings?.chartData || earnings.chartData.length === 0) {
      return { path: "", fillPath: "" };
    }

    const data = earnings.chartData;
    const maxAmount = Math.max(...data.map((d) => d.amount), 1);
    const width = 472;
    const height = 150;
    const padding = 10;

    const points = data.map((d, i) => {
      const x = (i / (data.length - 1 || 1)) * (width - padding * 2) + padding;
      const y =
        height - padding - (d.amount / maxAmount) * (height - padding * 2);
      return { x, y };
    });

    if (points.length === 0) return { path: "", fillPath: "" };

    // Create smooth curve path
    let path = `M${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      path += ` C${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
    }

    // Create fill path
    const fillPath =
      path +
      ` L${points[points.length - 1].x} ${height} L${points[0].x} ${height} Z`;

    return { path, fillPath };
  };

  const { path: chartPath, fillPath: chartFillPath } = generateChartPath();

  // Show loading skeleton only on initial load with no cached data
  if (loading && !earnings) {
    return (
      <AdminLayout loading={loading}>
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header skeleton */}
          <div className="flex items-center gap-4 animate-pulse">
            <div className="w-12 h-12 bg-gray-200 rounded-full" />
            <div className="space-y-2">
              <div className="h-3 w-32 bg-gray-200 rounded" />
              <div className="h-5 w-40 bg-gray-200 rounded" />
            </div>
          </div>
          {/* Revenue card skeleton */}
          <div className="bg-green-100 rounded-2xl p-6 animate-pulse">
            <div className="h-3 w-28 bg-green-200 rounded mb-3" />
            <div className="h-10 w-48 bg-green-200 rounded mb-2" />
            <div className="h-3 w-36 bg-green-200 rounded mb-4" />
            <div className="flex gap-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-8 w-16 bg-green-200 rounded-lg" />
              ))}
            </div>
          </div>
          {/* Metric grid skeleton */}
          <div className="grid grid-cols-2 gap-4 animate-pulse">
            <div className="bg-white rounded-xl p-5 border border-gray-200">
              <div className="h-3 w-20 bg-gray-200 rounded mb-2" />
              <div className="h-7 w-28 bg-gray-200 rounded" />
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-200">
              <div className="h-3 w-20 bg-gray-200 rounded mb-2" />
              <div className="h-7 w-28 bg-gray-200 rounded" />
            </div>
          </div>
          {/* Chart skeleton */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 animate-pulse">
            <div className="h-4 w-24 bg-gray-200 rounded mb-2" />
            <div className="h-8 w-36 bg-gray-200 rounded mb-6" />
            <div className="h-45 bg-gray-100 rounded-lg" />
          </div>
          {/* Orders skeleton */}
          <div className="space-y-3 animate-pulse">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-200 rounded-lg" />
                  <div className="space-y-2">
                    <div className="h-4 w-28 bg-gray-200 rounded" />
                    <div className="h-3 w-20 bg-gray-200 rounded" />
                  </div>
                </div>
                <div className="h-5 w-16 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout loading={false}>
      {/* Refreshing indicator */}
      {refreshing && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white shadow-lg rounded-full px-4 py-2 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-600">Updating...</span>
        </div>
      )}

      <div
        className={`max-w-4xl mx-auto space-y-6 transition-opacity duration-300 ${refreshing ? "opacity-90" : "opacity-100"}`}
      >
        {/* Header */}

        <div className="flex items-center gap-35">
          <div className="flex flex-col items-end gap-1 pt-1 px-2">
            <p className="text-3xl font-medium">Earnings</p>
            <div className="w-16 h-0.75 bg-green-600 rounded-full"></div>
          </div>
          <button
            onClick={() => navigate("/admin/withdrawals")}
            className="px-4 py-2.5 bg-linear-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold text-sm shadow-md hover:shadow-lg hover:from-green-600 hover:to-green-700 transition-all flex items-center gap-2"
          >
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
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
            Withdrawals
          </button>
        </div>

        {/* Main Revenue Card */}
        <div className="bg-linear-to-br from-green-50 to-green-100 rounded-2xl p-4 border border-green-200 shadow-sm">
          <div className="flex justify-between items-start mb-1">
            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">
              Net Revenue
            </p>
            {showComparison && (
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold shadow-sm ${
                  isUp
                    ? "bg-green-100 text-green-600"
                    : "bg-red-100 text-red-600"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full flex items-center justify-center ${isUp ? "bg-green-100" : "bg-red-100"}`}
                >
                  <svg
                    className={`w-2.5 h-2.5 ${!isUp ? "rotate-180" : ""}`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 17a.75.75 0 01-.75-.75V5.56L5.03 9.78a.75.75 0 01-1.06-1.06l5.5-5.5a.75.75 0 011.06 0l5.5 5.5a.75.75 0 01-1.06 1.06L10.75 5.56V16.25A.75.75 0 0110 17z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                {Math.abs(pct)}%
              </div>
            )}
          </div>
          <p className="text-4xl font-bold text-gray-900 tracking-tight leading-tight">
            {formatCurrency(earnings?.totalRevenue)}
          </p>

          {/* Comparison row */}
          {showComparison ? (
            <div className="flex items-center gap-2 mt-1 mb-3">
              <span
                className={`text-xs font-semibold ${isUp ? "text-black" : "text-black"}`}
              >
                {isUp ? "▲" : "▼"} {comparisonLabel}:
              </span>
              <span className="text-xs font-bold text-gray-600">
                {formatCurrency(earnings?.previousRevenue)}
              </span>
            </div>
          ) : (
            <div className="mb-3" />
          )}

          {/* Period Selector */}
          <div className="flex flex-wrap gap-2">
            {[
              { value: "today", label: "Today" },
              { value: "week", label: "7 Days" },
              { value: "month", label: "30 Days" },
              { value: "year", label: "Year" },
              { value: "all", label: "All Time" },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setPeriod(option.value)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  period === option.value
                    ? "bg-green-500 text-white shadow-md"
                    : "bg-white text-black hover:bg-green-50 border border-gray-200"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Metric Grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Today's Sales */}
          <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
            <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">
              Today's Sales
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(earnings?.todaySales)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {earnings?.todayOrderCount || 0} orders
            </p>
          </div>

          {/* This Week */}
          <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
            <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">
              This Week
            </p>
            <p className="text-2xl font-bold text-green-600 mt-1">
              {formatCurrency(earnings?.thisWeekRevenue)}
            </p>
            <p className="text-xs text-gray-400 mt-1">Last 7 days</p>
          </div>
        </div>

        {/* Chart Section */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <p className="text-gray-500 text-sm font-medium">
                Earnings Trend
              </p>
            </div>
            <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-lg text-xs font-semibold">
              Last 30 days
            </span>
          </div>

          <div className="h-45 w-full relative">
            {earnings?.chartData && earnings.chartData.length > 0 ? (
              <svg
                width="100%"
                height="100%"
                viewBox="0 0 472 150"
                preserveAspectRatio="none"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d={chartFillPath} fill="url(#chartGradient)" />
                <path
                  d={chartPath}
                  stroke="#22c55e"
                  strokeWidth="3"
                  strokeLinecap="round"
                  fill="none"
                />
                <defs>
                  <linearGradient
                    id="chartGradient"
                    x1="236"
                    y1="1"
                    x2="236"
                    y2="149"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop stopColor="#22c55e" stopOpacity="0.3" />
                    <stop offset="1" stopColor="#22c55e" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <p>No data available for chart</p>
              </div>
            )}
          </div>

          {earnings?.chartData && earnings.chartData.length > 0 && (
            <div className="flex justify-between mt-4">
              <p className="text-gray-400 text-[11px] font-bold">
                {formatDate(earnings.chartData[0]?.date)}
              </p>
              <p className="text-gray-400 text-[11px] font-bold">
                {formatDate(
                  earnings.chartData[Math.floor(earnings.chartData.length / 2)]
                    ?.date,
                )}
              </p>
              <p className="text-gray-400 text-[11px] font-bold">
                {formatDate(
                  earnings.chartData[earnings.chartData.length - 1]?.date,
                )}
              </p>
            </div>
          )}
        </div>

        {/* Payout History */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-gray-800">Recent Orders</h2>
            <button
              onClick={() => (window.location.href = "/admin/orders")}
              className="text-green-600 text-sm font-semibold hover:text-green-700"
            >
              View All
            </button>
          </div>

          <div className="space-y-3">
            {payouts.length === 0 ? (
              <div className="bg-white rounded-xl p-8 border border-gray-100 text-center">
                <p className="text-gray-400">No completed orders yet</p>
              </div>
            ) : (
              payouts.map((payout) => (
                <div
                  key={payout.id}
                  className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                      <svg
                        className="w-5 h-5 text-green-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">
                        Order #{payout.order_number || payout.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(payout.date)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">
                      {formatCurrency(payout.amount)}
                    </p>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20">
                      Completed
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Summary Stats */}
        <div className="bg-linear-to-r from-gray-800 to-gray-900 rounded-2xl p-6 text-white">
          <h3 className="text-lg font-bold mb-4">Quick Stats</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide">
                Total Orders
              </p>
              <p className="text-2xl font-bold">{earnings?.totalOrders || 0}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide">
                Avg. Order Value
              </p>
              <p className="text-2xl font-bold">
                {earnings?.totalOrders > 0
                  ? formatCurrency(
                      Math.round(earnings.totalRevenue / earnings.totalOrders),
                    )
                  : "Rs. 0"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
