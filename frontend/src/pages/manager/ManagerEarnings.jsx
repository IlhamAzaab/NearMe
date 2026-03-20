import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL } from "../../config";
import ManagerPageLayout from "../../components/ManagerPageLayout";
import AdminSkeleton from "../../components/AdminSkeleton";
import PageWrapper from "../../components/PageWrapper";

const ManagerEarnings = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [summary, setSummary] = useState(null);
  const [orders, setOrders] = useState([]);
  const [period, setPeriod] = useState("daily");
  const [expandedOrder, setExpandedOrder] = useState(null);
  const token = localStorage.getItem("token");

  const getPeriodParams = () => {
    const now = new Date();
    let from, to;

    if (period === "daily") {
      from = new Date(now);
      from.setHours(0, 0, 0, 0);
      to = new Date(now);
      to.setHours(23, 59, 59, 999);
    } else if (period === "yesterday") {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      from = new Date(yesterday);
      from.setHours(0, 0, 0, 0);
      to = new Date(yesterday);
      to.setHours(23, 59, 59, 999);
    } else if (period === "weekly") {
      from = new Date(now);
      from.setDate(now.getDate() - 7);
      from.setHours(0, 0, 0, 0);
      to = new Date(now);
    } else if (period === "monthly") {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    } else if (period === "all") {
      return "limit=100";
    }

    return `from=${from.toISOString()}&to=${to.toISOString()}`;
  };

  const periodParams = useMemo(() => getPeriodParams(), [period]);

  const summaryQuery = useQuery({
    queryKey: ["manager", "earnings", "summary", period],
    enabled: !!token,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await fetch(
        `${API_URL}/manager/earnings/summary?period=${period}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to fetch earnings summary");
      }
      return data.summary || null;
    },
  });

  const ordersQuery = useQuery({
    queryKey: ["manager", "earnings", "orders", period],
    enabled: !!token,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await fetch(
        `${API_URL}/manager/earnings/orders?${periodParams}&limit=100`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to fetch earnings orders");
      }
      return data.orders || [];
    },
  });

  useEffect(() => {
    if (summaryQuery.data) setSummary(summaryQuery.data);
  }, [summaryQuery.data]);

  useEffect(() => {
    if (ordersQuery.data) setOrders(ordersQuery.data);
  }, [ordersQuery.data]);

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
    if (isToday) return `Today, ${timeStr}`;
    return (
      date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      `, ${timeStr}`
    );
  };

  const periodLabels = {
    daily: "Today",
    yesterday: "Yesterday",
    weekly: "This Week",
    monthly: "This Month",
    all: "All Time",
  };

  const loading = summaryQuery.isLoading && !summary && orders.length === 0;
  const refreshing =
    !loading && (summaryQuery.isFetching || ordersQuery.isFetching);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["manager", "earnings"] });
  };

  return (
    <ManagerPageLayout
      title="Manager Earnings"
      onRefresh={handleRefresh}
      refreshing={refreshing}
      hideSidebar
    >
      {/* Period Selector */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4 hide-scrollbar">
        {["daily", "yesterday", "weekly", "monthly", "all"].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
              period === p
                ? "bg-[#13ecb9] text-[#111816] shadow-md"
                : "bg-white text-[#618980] border border-[#dbe6e3]"
            }`}
          >
            {periodLabels[p]}
          </button>
        ))}
      </div>

      {loading ? (
        <AdminSkeleton type="deposits" />
      ) : (
        <PageWrapper
          isFetching={refreshing}
          dataKey={`${period}-${summaryQuery.dataUpdatedAt}-${ordersQuery.dataUpdatedAt}`}
        >
          {/* Earnings Hero Card */}
          <div className="bg-white rounded-2xl shadow-lg p-5 mb-4 border border-gray-100">
            <div className="text-center mb-4">
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">
                {periodLabels[period]} Earnings
              </p>
              <p className="text-4xl font-extrabold text-[#065f46]">
                Rs.
                {(summary?.total_earning || 0).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>

            {/* Quick Stats Row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
                <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">
                  Total Deliveries
                </p>
                <p className="text-2xl font-extrabold text-emerald-700 mt-1">
                  {summary?.total_orders || 0}
                </p>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
                <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">
                  Delivered
                </p>
                <p className="text-2xl font-extrabold text-blue-700 mt-1">
                  {summary?.delivered_orders || 0}
                </p>
              </div>
            </div>
          </div>

          {/* Breakdown Cards */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {/* Total Collected */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-purple-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                </div>
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                  Collected
                </span>
              </div>
              <p className="text-lg font-bold text-gray-800">
                Rs.{(summary?.total_collected || 0).toFixed(0)}
              </p>
            </div>

            {/* Restaurant Payouts */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-amber-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                </div>
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                  Restaurants
                </span>
              </div>
              <p className="text-lg font-bold text-gray-800">
                Rs.{(summary?.admin_total || 0).toFixed(0)}
              </p>
            </div>

            {/* Driver Earnings */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-sky-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                  Drivers
                </span>
              </div>
              <p className="text-lg font-bold text-gray-800">
                Rs.{(summary?.total_driver_earnings || 0).toFixed(0)}
              </p>
            </div>

            {/* Commission */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-emerald-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                  Commission
                </span>
              </div>
              <p className="text-lg font-bold text-gray-800">
                Rs.{(summary?.food_commission || 0).toFixed(0)}
              </p>
            </div>
          </div>

          {/* Earnings Formula Card */}
          <div className="bg-gradient-to-r from-[#064e3b] to-[#065f46] rounded-2xl p-4 mb-4 shadow-md">
            <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-3">
              Earnings Breakdown
            </p>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-white/80 text-sm">Total Collected</span>
                <span className="text-white font-bold">
                  Rs.{(summary?.total_collected || 0).toFixed(0)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-red-300 text-sm">
                  − Restaurant Payments
                </span>
                <span className="text-red-300 font-bold">
                  Rs.{(summary?.admin_total || 0).toFixed(0)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-red-300 text-sm">− Driver Earnings</span>
                <span className="text-red-300 font-bold">
                  Rs.{(summary?.total_driver_earnings || 0).toFixed(0)}
                </span>
              </div>
              <div className="h-px bg-white/20 my-1"></div>
              <div className="flex justify-between items-center">
                <span className="text-[#13ec80] font-bold text-sm">
                  = Your Earnings
                </span>
                <span className="text-[#13ec80] text-xl font-extrabold">
                  Rs.
                  {(summary?.total_earning || 0).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Per-Delivery Earnings List */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-800">
                Delivery Earnings
              </h2>
              <span className="text-xs text-gray-500 font-semibold bg-gray-100 px-2.5 py-1 rounded-full">
                {orders.length} orders
              </span>
            </div>

            {orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 bg-white rounded-2xl border border-gray-100">
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
                <p className="text-gray-500 font-medium">No deliveries found</p>
                <p className="text-gray-400 text-sm mt-1">
                  for {periodLabels[period].toLowerCase()}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {orders.map((order) => {
                  const isExpanded = expandedOrder === order.id;
                  const managerEarning = order.manager_earning || 0;
                  const isPositive = managerEarning > 0;

                  return (
                    <div
                      key={order.id}
                      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
                    >
                      {/* Order Row */}
                      <button
                        onClick={() =>
                          setExpandedOrder(isExpanded ? null : order.id)
                        }
                        className="w-full p-4 flex items-center justify-between text-left"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isPositive ? "bg-emerald-100" : "bg-red-100"}`}
                          >
                            <svg
                              className={`w-5 h-5 ${isPositive ? "text-emerald-600" : "text-red-600"}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d={
                                  isPositive
                                    ? "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                                    : "M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"
                                }
                              />
                            </svg>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-gray-800 truncate">
                                #{order.order_number}
                              </p>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                  order.status === "delivered"
                                    ? "bg-green-100 text-green-700"
                                    : order.status === "cancelled" ||
                                        order.status === "rejected"
                                      ? "bg-red-100 text-red-700"
                                      : "bg-blue-100 text-blue-700"
                                }`}
                              >
                                {order.status?.replace(/_/g, " ") || "unknown"}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 truncate mt-0.5">
                              {order.restaurant_name} •{" "}
                              {formatTime(order.placed_at)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0">
                          {/* Total Amount of the delivery */}
                          <div className="text-right">
                            <p className="text-[10px] text-gray-400 font-medium">
                              Total
                            </p>
                            <p className="text-xs font-bold text-gray-600">
                              Rs.
                              {parseFloat(order.total_amount || 0).toFixed(0)}
                            </p>
                          </div>

                          {/* Divider */}
                          <div className="h-8 w-px bg-gray-200"></div>

                          {/* Manager Earning */}
                          <div className="text-right">
                            <p className="text-[10px] text-gray-400 font-medium">
                              Earning
                            </p>
                            <p
                              className={`text-sm font-extrabold ${isPositive ? "text-emerald-600" : "text-red-600"}`}
                            >
                              Rs.{managerEarning.toFixed(0)}
                            </p>
                          </div>

                          {/* Chevron */}
                          <svg
                            className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </div>
                      </button>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 px-4 pb-4 pt-3 bg-gray-50/50">
                          {/* Customer & Restaurant */}
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">
                                Customer
                              </p>
                              <p className="text-sm font-semibold text-gray-800">
                                {order.customer_name || "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">
                                Restaurant
                              </p>
                              <p className="text-sm font-semibold text-gray-800">
                                {order.restaurant_name || "—"}
                              </p>
                            </div>
                          </div>

                          {/* Driver Info */}
                          {order.driver_name && (
                            <div className="flex items-center gap-2 mb-3 bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">
                              <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                {order.driver_name
                                  ?.split(" ")
                                  .map((n) => n[0])
                                  .join("")
                                  .slice(0, 2) || "D"}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-800 truncate">
                                  {order.driver_name}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {order.driver_phone || "No phone"}
                                </p>
                              </div>
                              {order.driver_phone && (
                                <a
                                  href={`tel:${order.driver_phone}`}
                                  className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0"
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
                                      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                                    />
                                  </svg>
                                </a>
                              )}
                            </div>
                          )}

                          {/* Financial Breakdown */}
                          <div className="bg-white rounded-xl p-3 border border-gray-200 space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">
                                Food Subtotal
                              </span>
                              <span className="font-medium text-gray-800">
                                Rs.
                                {parseFloat(order.subtotal || 0).toFixed(0)}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">
                                Delivery Fee
                              </span>
                              <span className="font-medium text-gray-800">
                                Rs.
                                {parseFloat(order.delivery_fee || 0).toFixed(0)}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">Service Fee</span>
                              <span className="font-medium text-gray-800">
                                Rs.
                                {parseFloat(order.service_fee || 0).toFixed(0)}
                              </span>
                            </div>
                            <div className="h-px bg-gray-200"></div>
                            <div className="flex justify-between text-sm">
                              <span className="font-bold text-gray-800">
                                Total Collected
                              </span>
                              <span className="font-bold text-gray-800">
                                Rs.
                                {parseFloat(order.total_amount || 0).toFixed(0)}
                              </span>
                            </div>
                            <div className="h-px bg-gray-200"></div>
                            <div className="flex justify-between text-sm">
                              <span className="text-amber-600">
                                Restaurant Pay
                              </span>
                              <span className="font-medium text-amber-600">
                                − Rs.
                                {parseFloat(
                                  order.restaurant_payout || 0,
                                ).toFixed(0)}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-sky-600">Driver Pay</span>
                              <span className="font-medium text-sky-600">
                                − Rs.
                                {parseFloat(order.driver_earning || 0).toFixed(
                                  0,
                                )}
                              </span>
                            </div>
                            <div className="h-px bg-gray-200"></div>
                            <div className="flex justify-between">
                              <span className="font-bold text-emerald-700">
                                Your Earning
                              </span>
                              <span className="font-extrabold text-emerald-700 text-base">
                                Rs.
                                {(order.manager_earning || 0).toFixed(0)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* End indicator */}
                <div className="flex flex-col items-center justify-center py-6 opacity-40">
                  <svg
                    className="w-8 h-8 text-gray-400 mb-1"
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
                    End of list
                  </p>
                </div>
              </div>
            )}
          </div>
        </PageWrapper>
      )}

      {/* Scrollbar hide */}
      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </ManagerPageLayout>
  );
};

export default ManagerEarnings;
