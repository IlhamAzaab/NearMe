import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "../../components/AdminLayout";
import { API_URL } from "../../config";
import { useAdminCache, CACHE_KEYS } from "../../context/AdminCacheContext";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// Cache key helper for dashboard with period
const getDashboardCacheKey = (period) => `${CACHE_KEYS.DASHBOARD}_${period}`;

export default function AdminDashboard() {
  const { getCache, setCache } = useAdminCache();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  // Initialize state from cache for instant display
  const [chartPeriod, setChartPeriod] = useState("week");
  const [dashboardData, setDashboardData] = useState(() =>
    getCache(getDashboardCacheKey("week")),
  );
  const [recentOrders, setRecentOrders] = useState(
    () => getCache("admin_recent_orders") || [],
  );
  const [restaurant, setRestaurant] = useState(() =>
    getCache(CACHE_KEYS.RESTAURANT),
  );
  const [loading, setLoading] = useState(
    !getCache(getDashboardCacheKey("week")),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const dashboardQuery = useQuery({
    queryKey: ["admin", "dashboard", chartPeriod],
    enabled: !!token,
    staleTime: 15 * 1000,
    refetchOnMount: "always",
    refetchInterval: 20 * 1000,
    refetchIntervalInBackground: true,
    initialData: getCache(getDashboardCacheKey(chartPeriod)) || undefined,
    queryFn: async () => {
      const res = await fetch(
        `${API_URL}/admin/dashboard-stats?chartPeriod=${chartPeriod}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to fetch dashboard stats");
      }
      setCache(getDashboardCacheKey(chartPeriod), data);
      return data;
    },
  });

  const recentOrdersQuery = useQuery({
    queryKey: ["admin", "recent-orders"],
    enabled: !!token,
    staleTime: 15 * 1000,
    refetchOnMount: "always",
    refetchInterval: 20 * 1000,
    refetchIntervalInBackground: true,
    initialData: getCache("admin_recent_orders") || undefined,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/admin/orders?limit=5`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to fetch recent orders");
      }
      const orders = data?.orders || [];
      setCache("admin_recent_orders", orders);
      return orders;
    },
  });

  const restaurantQuery = useQuery({
    queryKey: ["admin", "restaurant"],
    enabled: !!token,
    staleTime: 30 * 1000,
    refetchOnMount: "always",
    refetchInterval: 30 * 1000,
    refetchIntervalInBackground: true,
    initialData: getCache(CACHE_KEYS.RESTAURANT) || undefined,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/admin/restaurant`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("role");
        navigate("/login");
        throw new Error("Unauthorized");
      }

      const data = await res.json();
      if (!data?.restaurant) {
        throw new Error(data?.message || "Failed to fetch restaurant");
      }
      setCache(CACHE_KEYS.RESTAURANT, data.restaurant);
      return data.restaurant;
    },
  });

  useEffect(() => {
    if (!token) {
      navigate("/login");
    }
  }, [navigate, token]);

  useEffect(() => {
    if (dashboardQuery.data) {
      setDashboardData(dashboardQuery.data);
    }
  }, [dashboardQuery.data]);

  useEffect(() => {
    if (recentOrdersQuery.data) {
      setRecentOrders(recentOrdersQuery.data);
    }
  }, [recentOrdersQuery.data]);

  useEffect(() => {
    if (restaurantQuery.data) {
      setRestaurant(restaurantQuery.data);
    }
  }, [restaurantQuery.data]);

  useEffect(() => {
    const hasData = !!dashboardData || !!restaurant || recentOrders.length > 0;
    const initialLoading =
      (dashboardQuery.isLoading && !dashboardData) ||
      (restaurantQuery.isLoading && !restaurant) ||
      (recentOrdersQuery.isLoading && recentOrders.length === 0 && !hasData);

    setLoading(initialLoading);
    setRefreshing(
      !initialLoading &&
        (dashboardQuery.isFetching ||
          restaurantQuery.isFetching ||
          recentOrdersQuery.isFetching),
    );
  }, [
    dashboardData,
    dashboardQuery.isFetching,
    dashboardQuery.isLoading,
    recentOrders.length,
    recentOrdersQuery.isFetching,
    recentOrdersQuery.isLoading,
    restaurant,
    restaurantQuery.isFetching,
    restaurantQuery.isLoading,
  ]);

  const toggleRestaurantMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_URL}/admin/restaurant/toggle-open`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("role");
        navigate("/login");
        throw new Error(data?.message || "Unauthorized");
      }
      if (!res.ok || !data?.restaurant) {
        throw new Error(data?.message || "Failed to toggle restaurant");
      }
      return data.restaurant;
    },
    onSuccess: (nextRestaurant) => {
      setRestaurant(nextRestaurant);
      setCache(CACHE_KEYS.RESTAURANT, nextRestaurant);
      queryClient.setQueryData(["admin", "restaurant"], nextRestaurant);
    },
  });

  const toggleRestaurantOpen = async () => {
    if (toggling) return;

    // Check if token exists before making request
    if (!token) {
      console.error("No auth token found. Redirecting to login.");
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      navigate("/login");
      return;
    }

    setToggling(true);
    const previousRestaurant = restaurant;
    const optimisticRestaurant = previousRestaurant
      ? { ...previousRestaurant, is_open: !previousRestaurant.is_open }
      : previousRestaurant;
    setRestaurant(optimisticRestaurant);
    if (optimisticRestaurant) {
      queryClient.setQueryData(["admin", "restaurant"], optimisticRestaurant);
    }
    try {
      await toggleRestaurantMutation.mutateAsync();
    } catch (err) {
      console.error("Toggle restaurant error:", err);
      setRestaurant(previousRestaurant);
      if (previousRestaurant) {
        queryClient.setQueryData(["admin", "restaurant"], previousRestaurant);
      }
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
    if (["picked_up", "on_the_way", "at_customer", "delivered"].includes(ds))
      return "delivered";
    return "all";
  };

  // Helper: get display status badge
  const getStatusBadge = (order) => {
    const ds = order.delivery_status || order.status;
    const map = {
      placed: { label: "New", bg: "bg-amber-100", text: "text-amber-700" },
      pending: {
        label: "Accepted",
        bg: "bg-green-100",
        text: "text-green-700",
      },
      accepted: {
        label: "Accepted",
        bg: "bg-green-100",
        text: "text-green-700",
      },
      picked_up: {
        label: "Picked Up",
        bg: "bg-blue-100",
        text: "text-blue-700",
      },
      on_the_way: {
        label: "On the Way",
        bg: "bg-blue-100",
        text: "text-blue-700",
      },
      at_customer: {
        label: "Arriving",
        bg: "bg-indigo-100",
        text: "text-indigo-700",
      },
      delivered: {
        label: "Delivered",
        bg: "bg-emerald-100",
        text: "text-emerald-700",
      },
      rejected: { label: "Rejected", bg: "bg-red-100", text: "text-red-600" },
      cancelled: {
        label: "Cancelled",
        bg: "bg-gray-100",
        text: "text-gray-600",
      },
    };
    const s = map[ds] || {
      label: ds || "Unknown",
      bg: "bg-gray-100",
      text: "text-gray-600",
    };
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.bg} ${s.text}`}
      >
        {s.label}
      </span>
    );
  };

  // Format date/time for recent orders
  const formatOrderDateTime = (dateStr) => {
    if (!dateStr) return { date: "", time: "" };
    const d = new Date(dateStr);
    return {
      date: d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      time: d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }),
    };
  };

  // Loading skeleton - only show on initial load with no cached data
  if (loading && !dashboardData && !restaurant) {
    return (
      <AdminLayout loading={loading}>
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-gray-100 p-4 skeleton-fade">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gray-100 rounded-xl animate-pulse" />
                <div className="space-y-2">
                  <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
                  <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
                </div>
              </div>
              <div className="w-8 h-8 bg-gray-100 rounded-full animate-pulse" />
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
              <div className="h-4 w-28 bg-gray-100 rounded animate-pulse" />
              <div className="w-12 h-6 bg-gray-100 rounded-full animate-pulse" />
            </div>
          </div>
          <div className="h-32 bg-gray-100 rounded-2xl skeleton-fade animate-pulse" />
          <div className="grid grid-cols-2 gap-3">
            {[...Array(2)].map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-4 border border-gray-100 skeleton-fade h-28 animate-pulse"
              />
            ))}
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100 skeleton-fade h-28 animate-pulse" />
          <div className="bg-white rounded-2xl p-4 border border-gray-100 skeleton-fade">
            <div className="h-4 w-36 bg-gray-100 rounded mb-4 animate-pulse" />
            <div className="h-56 bg-gray-50 rounded-xl animate-pulse" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  const revenueChange = dashboardData?.lifetime?.revenueChange;

  return (
    <AdminLayout loading={false}>
      {/* Refreshing indicator */}
      {refreshing && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white shadow-lg rounded-full px-4 py-2 flex items-center gap-2 animate-fadeIn">
          <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-600">Updating...</span>
        </div>
      )}

      <div
        className={`space-y-3 transition-opacity duration-300 ${refreshing ? "opacity-90" : "opacity-100"}`}
      >
        {/* ═══════════ Block 1: Restaurant Header + Store Status ═══════════ */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          {/* Top: Logo + Name + Bell */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {restaurant?.logo_url ? (
                <img
                  src={restaurant.logo_url}
                  alt={restaurant.restaurant_name}
                  className="w-12 h-12 rounded-full object-cover border-2 border-green-500 bg-green-50"
                />
              ) : (
                <div className="w-12 h-12 rounded-full flex items-center justify-center border-2 border-green-500 bg-green-500">
                  <svg
                    className="w-6 h-6 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                </div>
              )}
              <div>
                <h1 className="text-base font-bold text-gray-900 leading-tight">
                  {restaurant?.restaurant_name || "Restaurant"}
                </h1>
                <span
                  className="text-xs font-bold"
                  style={{ color: "#06C168" }}
                >
                  PREMIUM PARTNER
                </span>
              </div>
            </div>
            {/* Bell icon */}
            <div
              className="relative cursor-pointer"
              onClick={() => navigate("/admin/notifications")}
            >
              <div className="w-10 h-10 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
              </div>
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500"></span>
            </div>
          </div>

          {/* Divider + Restaurant Status */}
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">
                Restaurant Status
              </p>
              <p
                className="text-xs mt-0.5 font-medium"
                style={{ color: restaurant?.is_open ? "#06C168" : "#ef4444" }}
              >
                {restaurant?.is_open ? "Currently open" : "Currently closed"}
              </p>
            </div>
            <button
              onClick={toggleRestaurantOpen}
              disabled={toggling}
              className="relative w-12 h-6 rounded-full transition-colors duration-300 shrink-0"
              style={{
                background: restaurant?.is_open ? "#06C168" : "#d1d5db",
              }}
            >
              <div
                className={`absolute top-[3px] left-[3px] w-4.5 h-4.5 bg-white rounded-full shadow transition-transform duration-300 ${restaurant?.is_open ? "translate-x-6" : "translate-x-0"}`}
              />
            </button>
          </div>
        </div>

        {/* ═══════════ Block 2: Today's Performance ═══════════ */}
        {/* Section header */}
        <div className="flex items-center gap-2 px-1">
          <h3 className="text-m font-bold text-gray-900 flex items-center gap-2">
            <span className="w-1 h-8 rounded-l-4xl bg-green-600"></span>
            Today's Performance
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Today Sales */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(6,193,104,0.12)" }}
              >
                <svg
                  className="w-5 h-5"
                  style={{ color: "#06C168" }}
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" />
                </svg>
              </div>
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{
                  background:
                    (dashboardData?.changes?.salesChange ?? 0) >= 0
                      ? "rgba(6,193,104,0.12)"
                      : "rgba(239,68,68,0.1)",
                  color:
                    (dashboardData?.changes?.salesChange ?? 0) >= 0
                      ? "#06C168"
                      : "#ef4444",
                }}
              >
                {(dashboardData?.changes?.salesChange ?? 0) >= 0 ? "+" : ""}
                {dashboardData?.changes?.salesChange ?? 0}%
              </span>
            </div>
            <p className="text-xs text-gray-800 font-medium mb-1">
              Today's Sales
            </p>
            <p className="text-xl font-bold text-gray-900">
              {formatCurrency(dashboardData?.today?.sales)}
            </p>
          </div>

          {/* Today Orders */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-[#06C168]"
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
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{
                  background:
                    (dashboardData?.changes?.ordersChange ?? 0) >= 0
                      ? "rgba(6,193,104,0.12)"
                      : "rgba(239,68,68,0.1)",
                  color:
                    (dashboardData?.changes?.ordersChange ?? 0) >= 0
                      ? "#06C168"
                      : "#ef4444",
                }}
              >
                {(dashboardData?.changes?.ordersChange ?? 0) >= 0 ? "+" : ""}
                {dashboardData?.changes?.ordersChange ?? 0}%
              </span>
            </div>
            <p className="text-xs text-gray-800 font-medium mb-1">
              Today's Orders
            </p>
            <p className="text-xl font-bold text-gray-900">
              {dashboardData?.today?.orders || 0}
            </p>
          </div>
        </div>

        {/* ═══════════ Block 3: 30-Day Performance ═══════════ */}
        {/* Section header */}
        <div className="flex items-center gap-2 px-1">
          <h3 className="text-m font-bold text-gray-900 flex items-center gap-2">
            <span className="w-1 h-8 rounded-l-4xl bg-green-600"></span>
            Last 30 Day Performance
          </h3>
        </div>

        {/* 30-Day Revenue + Orders — full-width green card */}
        <div
          className="relative rounded-2xl overflow-hidden p-5 shadow-md"
          style={{
            background:
              "linear-gradient(135deg, #06C168 0%, #04a857 60%, #038848 100%)",
          }}
        >
          {/* Faded background icon */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-[0.12] pointer-events-none">
            <svg
              className="w-32 h-32 text-white"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" />
            </svg>
          </div>
          <p className="text-white/80 text-s font-semibold mb-1">Revenue</p>
          <p className="text-white text-3xl font-bold mb-4">
            {formatCurrency(dashboardData?.lifetime?.totalRevenue)}
          </p>
          {/* Orders + Performance pill in one row */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5 bg-white/15 rounded-full px-3.5 py-1.5">
              <svg
                className="w-3.5 h-3.5 text-white/80"
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
              <span className="text-white text-xs font-semibold">
                {(dashboardData?.lifetime?.totalOrders || 0).toLocaleString()}{" "}
                Orders
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-3.5 py-1.5">
              <span className="text-white text-xs font-semibold">
                {revenueChange === undefined || revenueChange === null
                  ? "↗ No comparison data"
                  : revenueChange === 0
                    ? "→ Same as last 30 days"
                    : revenueChange > 0
                      ? `↗ Performance is up by ${Math.abs(revenueChange)}%`
                      : `↘ Performance is down by ${Math.abs(revenueChange)}%`}
              </span>
            </div>
          </div>
        </div>

        {/* ═══════════ Block 4: Menu Overview ═══════════ */}
        {/* Section header */}
        <div className="flex items-center gap-2 px-1">
          <h3 className="text-m font-bold text-gray-900 flex items-center gap-2">
            <span className="w-1 h-8 rounded-l-4xl bg-green-600"></span>
            Menu Overview
          </h3>
        </div>

        {/* Menu Overview card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="bg-gray-50 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: "#9582C1" }}
                ></span>
                <span className="text-sm text-black-900">Total Products</span>
              </div>
              <span className="text-sm font-bold text-gray-900">
                {dashboardData?.products?.total || 0}
              </span>
            </div>
            <div className="border-t border-gray-100"></div>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: "#06C168" }}
                ></span>
                <span className="text-sm text-black-900">Available Items</span>
              </div>
              <span className="text-sm font-bold text-gray-900">
                {dashboardData?.products?.available || 0}
              </span>
            </div>
          </div>
        </div>

        {/* ═══════════ Block 5: Sales Performance Chart ═══════════ */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
            <h3 className="text-m font-bold text-gray-900 flex items-center gap-2">
              <span className="w-1 h-8 rounded-l-4xl bg-green-600"></span>
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
            <div className="w-full min-w-0 h-56 sm:h-72">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                <AreaChart
                  data={dashboardData.chartData}
                  margin={{ top: 5, right: 5, left: -15, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="colorAmount"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
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
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    tickFormatter={(val) => `Rs.${val}`}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                      fontSize: "12px",
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
                <svg
                  className="w-10 h-10 mx-auto mb-2 text-gray-200"
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
                <p className="text-xs font-medium">
                  No sales data for this period
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ═══════════ Block 6: Recent Orders ═══════════ */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-m font-bold text-gray-900 flex items-center gap-2">
              <span className="w-1 h-8 rounded-l-4xl bg-green-600"></span>
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
              <div
                className="w-14 h-14 mx-auto mb-3 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(6,193,104,0.08)" }}
              >
                <svg
                  className="w-7 h-7"
                  style={{ color: "#06C168" }}
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
              <p className="text-sm font-medium text-gray-600">No orders yet</p>
              <p className="text-xs mt-1 text-gray-400">
                Orders will appear here once customers start ordering
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentOrders.map((order, index) => {
                const dt = formatOrderDateTime(order.created_at);
                return (
                  <div
                    key={order.id}
                    onClick={() =>
                      navigate(
                        `/admin/orders?status=${getOrderStatusFilter(order)}&orderId=${order.id}`,
                      )
                    }
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-all duration-200 cursor-pointer group border border-transparent hover:border-gray-100"
                    style={{ animationDelay: `${index * 40}ms` }}
                  >
                    {/* Avatar */}
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm"
                      style={{
                        background: "linear-gradient(135deg, #06C168, #05a85a)",
                      }}
                    >
                      {order.customer.charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800 text-sm truncate">
                          {order.customer}
                        </span>
                        {getStatusBadge(order)}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className="text-[11px] font-medium"
                          style={{ color: "#06C168" }}
                        >
                          #{order.order_number}
                        </span>
                        <span className="text-gray-300">·</span>
                        <span className="text-[11px] text-gray-400">
                          {order.items?.length > 40
                            ? order.items.substring(0, 40) + "..."
                            : order.items}
                        </span>
                      </div>
                    </div>

                    {/* Amount + Date/Time */}
                    <div className="text-right flex-shrink-0">
                      <p
                        className="text-sm font-bold"
                        style={{ color: "#06C168" }}
                      >
                        Rs. {order.amount.toLocaleString()}
                      </p>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        <span>{dt.date}</span>
                        <span className="mx-0.5">·</span>
                        <span>{dt.time}</span>
                      </div>
                    </div>

                    {/* Arrow */}
                    <svg
                      className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
