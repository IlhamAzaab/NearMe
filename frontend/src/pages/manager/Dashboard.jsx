import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ManagerPageLayout from "../../components/ManagerPageLayout";
import { ManagerPageSkeleton } from "../../components/ManagerSkeleton";
import { API_URL } from "../../config";

// Mini bar chart component
const MiniBarChart = ({ data, dataKey, color, maxHeight = 120 }) => {
  if (!data || data.length === 0) return null;
  const maxVal = Math.max(...data.map((d) => d[dataKey]), 1);
  return (
    <div
      className="flex items-end justify-between gap-1.5"
      style={{ height: maxHeight }}
    >
      {data.map((d, i) => {
        const h = Math.max((d[dataKey] / maxVal) * maxHeight, 4);
        return (
          <div key={i} className="flex flex-col items-center flex-1 gap-1">
            <span className="text-[9px] text-gray-400 font-bold">
              {d[dataKey] > 0
                ? d[dataKey] >= 1000
                  ? `${(d[dataKey] / 1000).toFixed(1)}k`
                  : Math.round(d[dataKey])
                : ""}
            </span>
            <div
              className="w-full rounded-t-md transition-all"
              style={{
                height: h,
                backgroundColor: color,
                opacity: i === data.length - 1 ? 1 : 0.6,
              }}
            />
            <span className="text-[10px] text-gray-500 font-medium">
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [userName, setUserName] = useState("");
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  const {
    data: dashboardData,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["manager", "dashboard", token],
    enabled: !!token && (role === "manager" || role === "admin"),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/manager/dashboard-stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.message || "Failed to fetch dashboard stats");
      }
      return data;
    },
  });

  const stats = {
    todayEarnings: dashboardData?.todayEarnings || 0,
    todaySales: dashboardData?.todaySales || 0,
    todayOrders: dashboardData?.todayOrders || 0,
    totalPendingFromDrivers: dashboardData?.totalPendingFromDrivers || 0,
    driverPayment: dashboardData?.driverPayment || 0,
    driverCount: dashboardData?.driverCount || 0,
    restaurantPayment: dashboardData?.restaurantPayment || 0,
    restaurantCount: dashboardData?.restaurantCount || 0,
    earningsGraph: dashboardData?.earningsGraph || [],
  };

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    const email = localStorage.getItem("userEmail");

    if (!token || (role !== "manager" && role !== "admin")) {
      navigate("/login");
      return;
    }

    if (email) {
      const name = email.split("@")[0];
      setUserName(name.charAt(0).toUpperCase() + name.slice(1));
    }
  }, [navigate, token, role]);

  const loading = isLoading && !dashboardData;
  const refreshing = isFetching && !isLoading;

  const formatCurrency = (value) =>
    `Rs.${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  // Loading skeleton
  if (loading) {
    return <ManagerPageSkeleton type="deposits" />;
  }

  return (
    <ManagerPageLayout
      title="Dashboard"
      onRefresh={handleRefresh}
      refreshing={refreshing}
      hideSidebar
    >
      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {/* ===== BLOCK 1: Today's Earnings ===== */}
        <div className="bg-gradient-to-br from-[#064e3b] to-[#065f46] rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-1">
              <p className="text-emerald-300 text-xs font-bold uppercase tracking-widest">
                Today's Earnings
              </p>
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-emerald-300"
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
            </div>
            <h2 className="text-white text-3xl font-extrabold tracking-tight">
              {formatCurrency(stats.todayEarnings)}
            </h2>
            <p className="text-emerald-200/60 text-sm mt-1">
              Welcome back, {userName || "Manager"}
            </p>
          </div>
        </div>

        {/* ===== BLOCK 2: Today's Sales & Orders ===== */}
        <div className="grid grid-cols-2 gap-3">
          {/* Today's Sales */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center">
                <svg
                  className="w-4.5 h-4.5 text-purple-600"
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
            </div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
              Today's Sales
            </p>
            <p className="text-xl font-extrabold text-gray-900">
              {formatCurrency(stats.todaySales)}
            </p>
          </div>

          {/* Today's Orders */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
                <svg
                  className="w-4.5 h-4.5 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                  />
                </svg>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
              Today's Orders
            </p>
            <p className="text-3xl font-extrabold text-gray-900">
              {stats.todayOrders}
            </p>
          </div>
        </div>

        {/* ===== BLOCK 3: Payment Overview ===== */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
              Payment Overview
            </h3>
          </div>

          {/* Pending from Drivers */}
          <div className="px-4 py-3 border-b border-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-red-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    Pending from Drivers
                  </p>
                  <p className="text-xs text-gray-400">
                    Cash collected, not deposited
                  </p>
                </div>
              </div>
              <p className="text-lg font-extrabold text-red-600">
                {formatCurrency(stats.totalPendingFromDrivers)}
              </p>
            </div>
          </div>

          {/* Driver Payment */}
          <div className="px-4 py-3 border-b border-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-sky-500"
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
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    Driver Payment
                  </p>
                  <p className="text-xs text-gray-400">
                    To pay {stats.driverCount} driver
                    {stats.driverCount !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-extrabold text-sky-600">
                  {formatCurrency(stats.driverPayment)}
                </p>
                <span className="text-[10px] bg-sky-50 text-sky-600 font-bold px-2 py-0.5 rounded-full">
                  {stats.driverCount} driver{stats.driverCount !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Restaurant Payment */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-amber-500"
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
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    Restaurant Payment
                  </p>
                  <p className="text-xs text-gray-400">
                    To pay {stats.restaurantCount} restaurant
                    {stats.restaurantCount !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-extrabold text-amber-600">
                  {formatCurrency(stats.restaurantPayment)}
                </p>
                <span className="text-[10px] bg-amber-50 text-amber-600 font-bold px-2 py-0.5 rounded-full">
                  {stats.restaurantCount} restaurant
                  {stats.restaurantCount !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ===== BLOCK 4: Earnings Graph (Last 7 Days) ===== */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-800">Earnings</h3>
              <p className="text-xs text-gray-400">Last 7 days</p>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-gray-500 font-medium">
                Earnings
              </span>
            </div>
          </div>
          {stats.earningsGraph.length > 0 ? (
            <MiniBarChart
              data={stats.earningsGraph}
              dataKey="earnings"
              color="#059669"
              maxHeight={100}
            />
          ) : (
            <div className="flex items-center justify-center h-24 text-gray-300 text-sm">
              No data yet
            </div>
          )}
        </div>

        {/* ===== BLOCK 5: Sales Graph (Last 7 Days) ===== */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-800">Sales</h3>
              <p className="text-xs text-gray-400">Last 7 days</p>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
              <span className="text-[10px] text-gray-500 font-medium">
                Sales
              </span>
            </div>
          </div>
          {stats.earningsGraph.length > 0 ? (
            <MiniBarChart
              data={stats.earningsGraph}
              dataKey="sales"
              color="#7c3aed"
              maxHeight={100}
            />
          ) : (
            <div className="flex items-center justify-center h-24 text-gray-300 text-sm">
              No data yet
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div>
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-3 px-1">
            Quick Actions
          </h3>
          <div className="space-y-2.5">
            <div
              onClick={() => navigate("/manager/deposits")}
              className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm cursor-pointer hover:shadow-md hover:border-emerald-200 transition-all active:scale-[0.99] flex items-center gap-4"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-md shadow-emerald-200">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-800 text-sm">
                  Manage Deposits
                </p>
                <p className="text-gray-400 text-xs">Review driver deposits</p>
              </div>
              <svg
                className="w-4 h-4 text-gray-300"
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
            </div>

            <div
              onClick={() => navigate("/manager/earnings")}
              className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm cursor-pointer hover:shadow-md hover:border-emerald-200 transition-all active:scale-[0.99] flex items-center gap-4"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-md shadow-blue-200">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-800 text-sm">View Earnings</p>
                <p className="text-gray-400 text-xs">
                  Detailed earnings breakdown
                </p>
              </div>
              <svg
                className="w-4 h-4 text-gray-300"
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
            </div>

            <div
              onClick={() => navigate("/manager/reports")}
              className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm cursor-pointer hover:shadow-md hover:border-emerald-200 transition-all active:scale-[0.99] flex items-center gap-4"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center shadow-md shadow-purple-200">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-800 text-sm">View Reports</p>
                <p className="text-gray-400 text-xs">Analytics & performance</p>
              </div>
              <svg
                className="w-4 h-4 text-gray-300"
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
            </div>
          </div>
        </div>
      </div>
    </ManagerPageLayout>
  );
};

export default Dashboard;
