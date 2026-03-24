import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import DriverLayout from "../../components/DriverLayout";
import { API_URL } from "../../config";
import { useDataPulse } from "../../hooks/useDataPulse";

const PERIOD_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "Last 7 Days" },
  { value: "last30", label: "Last 30 Days" },
];

const CHART_PERIOD_OPTIONS = [
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
];

const getSriLankaDateKey = (dateValue) => {
  if (!dateValue) return null;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-CA", {
    timeZone: "Asia/Colombo",
  });
};

export default function DriverEarnings() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const isDriver = role === "driver";

  const [period, setPeriod] = useState("last30");
  const [chartPeriod, setChartPeriod] = useState("week");

  useEffect(() => {
    if (!isDriver) {
      navigate("/login");
    }
  }, [isDriver, navigate]);

  const {
    data: summaryPayload,
    isLoading: summaryLoading,
    isFetching: summaryFetching,
    dataUpdatedAt: summaryUpdatedAt,
  } = useQuery({
    queryKey: ["driver", "earnings", "summary", period, token],
    enabled: isDriver && !!token,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    queryFn: async () => {
      const res = await fetch(
        `${API_URL}/driver/earnings/summary?period=${period}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.message || "Failed to fetch earnings summary");
      }
      return data;
    },
  });

  const { data: historyPayload, isLoading: historyLoading } = useQuery({
    queryKey: ["driver", "earnings", "history", token],
    enabled: isDriver && !!token,
    staleTime: 60 * 1000,
    refetchInterval: 90 * 1000,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/driver/earnings/history?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.message || "Failed to fetch earnings history");
      }
      return data;
    },
  });

  const {
    data: chartPayload,
    isLoading: chartInitialLoading,
    isFetching: chartFetching,
  } = useQuery({
    queryKey: ["driver", "earnings", "chart", chartPeriod, token],
    enabled: isDriver && !!token,
    staleTime: 60 * 1000,
    refetchInterval: 90 * 1000,
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      const res = await fetch(
        `${API_URL}/driver/earnings/chart?chartPeriod=${chartPeriod}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.message || "Failed to fetch earnings chart");
      }
      return data;
    },
  });

  const summary = summaryPayload?.summary || null;
  const todayPerformance = summaryPayload?.today || null;
  const earnings = historyPayload?.earnings || [];
  const chartData = chartPayload?.chartData || [];

  const loading =
    (summaryLoading && !summary) || (historyLoading && !earnings.length);
  const chartLoading = chartInitialLoading && !chartData.length;
  const summaryPulse = useDataPulse(summaryUpdatedAt, summaryFetching);

  const formatCurrency = (value) => `Rs ${Number(value || 0).toFixed(2)}`;

  const formatActivityDate = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
    });
  };

  const getEarningsAmount = (item) => Number(item?.driver_earnings || 0);

  const periodLabel = useMemo(() => {
    if (period === "today") return "Today's Earnings";
    if (period === "yesterday") return "Yesterday's Earnings";
    if (period === "week") return "Last 7 Days Earnings";
    return "Last 30 Days Earnings";
  }, [period]);

  const activeDaysCount = useMemo(() => {
    const todayKey = getSriLankaDateKey(new Date());
    const periodDays = period === "week" ? 7 : period === "last30" ? 30 : 1;
    const keysInScope = new Set();

    if (!todayKey) return 0;

    if (period === "today") {
      keysInScope.add(todayKey);
    } else if (period === "yesterday") {
      const yesterday = new Date(`${todayKey}T00:00:00+05:30`);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = getSriLankaDateKey(yesterday);
      if (yesterdayKey) keysInScope.add(yesterdayKey);
    } else {
      for (let i = 0; i < periodDays; i += 1) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = getSriLankaDateKey(d);
        if (key) keysInScope.add(key);
      }
    }

    const activeDaySet = new Set();

    earnings.forEach((item) => {
      if (Number(item?.driver_earnings || 0) <= 0) return;
      const deliveryKey = getSriLankaDateKey(item?.delivered_at);
      if (!deliveryKey) return;
      if (keysInScope.has(deliveryKey)) {
        activeDaySet.add(deliveryKey);
      }
    });

    return activeDaySet.size;
  }, [earnings, period]);

  const dailyAvg = useMemo(() => {
    if (!summary) return 0;
    return Number(summary.total_earnings || 0) / Math.max(activeDaysCount, 1);
  }, [summary, activeDaysCount]);

  const chartSubtitle =
    chartPeriod === "week"
      ? "Last 7 Days"
      : chartPeriod === "month"
        ? "Last 30 Days"
        : "Last 12 Months";

  const recentActivities = earnings.slice(0, 6);

  return (
    <DriverLayout>
      <div
        className="relative flex min-h-screen w-full flex-col max-w-md mx-auto bg-[#f6f8f6] text-[#111812]"
        style={{ fontFamily: "'Work Sans', sans-serif" }}
      >
        <div className="flex items-center bg-white p-4 pb-2 justify-between sticky top-0 z-10 border-b border-[#dbe6dd]">
          <button
            onClick={() => navigate("/driver/dashboard")}
            className="text-[#111812] flex size-12 shrink-0 items-center justify-start"
          >
            <svg
              className="w-6 h-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <h2 className="text-[#111812] text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center">
            Earnings
          </h2>
          <div className="size-12" />
        </div>

        <div className="flex-1 overflow-y-auto pb-24 hide-scrollbar">
          <div className="p-4">
            <div
              className={`relative overflow-hidden rounded-xl bg-[#18db9d] p-6 shadow-lg shadow-[#13ec37]/20 transition-all duration-500 ${summaryPulse ? "scale-[1.01]" : "scale-100"}`}
            >
              <div className="relative z-10">
                <p className="text-[#102213] text-sm font-medium opacity-80 uppercase tracking-wider">
                  {periodLabel}
                </p>
                <h1 className="text-[#102213] text-4xl font-bold mt-1 tracking-tight">
                  {loading ? "—" : formatCurrency(summary?.total_earnings)}
                </h1>
                <div className="mt-4 inline-flex items-center gap-1 px-3 py-1 bg-white/30 rounded-full">
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 17l6-6 4 4 7-7"
                    />
                  </svg>
                  <span className="text-xs font-bold">
                    {summary
                      ? `${summary.total_deliveries} deliveries`
                      : "Loading..."}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {PERIOD_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setPeriod(option.value)}
                      className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
                        period === option.value
                          ? "bg-white text-[#102213]"
                          : "bg-white/30 text-[#102213] hover:bg-white/45"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-white/20 rounded-full blur-2xl"></div>
            </div>
          </div>

          <div className="px-4 py-2">
            <button
              onClick={() => navigate("/driver/withdrawals")}
              className="w-full flex items-center justify-between bg-white rounded-xl border border-[#dbe6dd] p-4 hover:border-[#13ec37] transition-colors active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#13ec37]/10 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-[#13ec37]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 10h18M7 15l5 5 5-5M12 15V3"
                    />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-[#111812]">
                    My Withdrawals
                  </p>
                  <p className="text-xs text-[#618968]">
                    View payment history from management
                  </p>
                </div>
              </div>
              <svg
                className="w-4 h-4 text-[#618968]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>

          <div className="px-4 py-2">
            <div className="bg-white rounded-2xl border border-[#dbe6dd] p-4 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[#111812] text-base font-bold tracking-tight">
                  Today's Performance
                </h3>
                <span className="text-[11px] text-[#618968] font-semibold uppercase tracking-wide">
                  {new Date().toLocaleDateString("en-IN", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-emerald-100 bg-linear-to-br from-emerald-50 to-green-50 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                    Total Earnings
                  </p>
                  <p className="mt-2 text-xl font-extrabold tracking-tight text-[#111812]">
                    {loading
                      ? "—"
                      : formatCurrency(todayPerformance?.earnings || 0)}
                  </p>
                </div>
                <div className="rounded-xl border border-orange-100 bg-linear-to-br from-orange-50 to-amber-50 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-orange-700">
                    Deliveries
                  </p>
                  <p className="mt-2 text-xl font-extrabold tracking-tight text-[#111812]">
                    {loading ? "—" : todayPerformance?.deliveries || 0}
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded-xl border border-[#dbe6dd] bg-[#f9fbf9] px-3 py-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-[#618968] uppercase tracking-wide">
                  Avg Per Delivery
                </span>
                <span className="text-sm font-bold text-[#111812]">
                  {loading
                    ? "—"
                    : formatCurrency(
                        (todayPerformance?.deliveries || 0) > 0
                          ? Number(todayPerformance?.earnings || 0) /
                              Number(todayPerformance?.deliveries || 1)
                          : 0,
                      )}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-[#618968]">
                Daily average excludes zero-delivery days.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 p-4">
            <div className="flex min-w-25 flex-1 flex-col gap-1 rounded-xl p-4 border border-[#dbe6dd] bg-white">
              <p className="text-[#618968] text-xs font-medium uppercase">
                Daily Avg
              </p>
              <p className="text-[#111812] tracking-tight text-xl font-bold">
                {loading ? "—" : formatCurrency(dailyAvg)}
              </p>
            </div>
            <div className="flex min-w-25 flex-1 flex-col gap-1 rounded-xl p-4 border border-[#dbe6dd] bg-white">
              <p className="text-[#618968] text-xs font-medium uppercase">
                Period Distance
              </p>
              <p className="text-[#111812] tracking-tight text-xl font-bold">
                {loading
                  ? "—"
                  : `${Number(summary?.total_distance_km || 0).toFixed(1)} km`}
              </p>
            </div>
            <div className="flex min-w-25 flex-1 flex-col gap-1 rounded-xl p-4 border border-[#dbe6dd] bg-white">
              <p className="text-[#618968] text-xs font-medium uppercase">
                Period Deliveries
              </p>
              <p className="text-[#111812] tracking-tight text-xl font-bold">
                {loading ? "—" : summary?.total_deliveries || 0}
              </p>
            </div>
          </div>

          <div className="px-4 py-2">
            <div className="bg-white rounded-xl border border-[#dbe6dd] p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[#111812] text-base font-bold">
                  Earnings Performance
                </h3>
              </div>
              <div className="flex gap-1.5 mb-4">
                {CHART_PERIOD_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setChartPeriod(option.value)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200 ${
                      chartPeriod === option.value
                        ? "text-white shadow-sm"
                        : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                    }`}
                    style={
                      chartPeriod === option.value
                        ? { background: "#06C168" }
                        : {}
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#13ec37] font-bold">
                  {chartSubtitle}
                </span>
                {chartFetching && !chartLoading && (
                  <span className="text-[11px] font-semibold text-[#618968]">
                    Updating...
                  </span>
                )}
              </div>
              <div className="h-56 relative">
                {chartLoading ? (
                  <div className="h-full flex items-center justify-center text-sm text-[#618968]">
                    Loading chart...
                  </div>
                ) : (
                  <div
                    className={`h-full transition-opacity duration-300 ${
                      chartFetching ? "opacity-80" : "opacity-100"
                    }`}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chartData}
                        margin={{ top: 5, right: 5, left: -15, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="driverEarningsGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="#06C168"
                              stopOpacity={0.2}
                            />
                            <stop
                              offset="95%"
                              stopColor="#06C168"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: "#9ca3af" }}
                          tickFormatter={(val) => {
                            if (chartPeriod === "year") {
                              const [, m] = (val || "").split("-");
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
                              return months[(parseInt(m, 10) || 1) - 1] || val;
                            }
                            const d = new Date(`${val}T00:00:00`);
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
                            `Rs. ${Number(value || 0).toLocaleString()}`,
                            "Earnings",
                          ]}
                          labelFormatter={(label) => {
                            if (chartPeriod === "year") return label;
                            return new Date(
                              `${label}T00:00:00`,
                            ).toLocaleDateString("en-IN", {
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
                          fill="url(#driverEarningsGradient)"
                          dot={{ r: 2.5, fill: "#06C168" }}
                          activeDot={{ r: 5, fill: "#05a85a" }}
                          isAnimationActive
                          animationDuration={380}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="px-4 pt-6">
            <div className="flex items-center justify-between mb-4 px-1">
              <h3 className="text-[#111812] text-lg font-bold">
                Recent Activity
              </h3>
              <button
                className="text-sm font-semibold text-[#13ec37]"
                onClick={() => setPeriod("last30")}
              >
                See All
              </button>
            </div>
            <div className="space-y-3">
              {loading ? (
                <div className="p-4 bg-white rounded-xl border border-[#dbe6dd] text-sm text-[#618968]">
                  Loading activity...
                </div>
              ) : recentActivities.length === 0 ? (
                <div className="p-4 bg-white rounded-xl border border-[#dbe6dd] text-sm text-[#618968]">
                  No earnings yet
                </div>
              ) : (
                recentActivities.map((item) => (
                  <div
                    key={item.delivery_id}
                    className="flex items-center justify-between p-4 bg-white rounded-xl border border-[#dbe6dd]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-full bg-[#13ec37]/10 flex items-center justify-center text-[#13ec37]">
                        <svg
                          className="w-5 h-5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 7h11v10H3zM14 10h4l3 3v4h-7"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#111812]">
                          Order #{item.order_number || "—"}
                        </p>
                        <p className="text-[11px] text-[#618968]">
                          {formatActivityDate(item.delivered_at)} •{" "}
                          {item.restaurant_name || "Restaurant"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-bold text-[#111812]">
                        {formatCurrency(getEarningsAmount(item))}
                      </p>
                      <p className="text-[11px] text-[#618968] leading-tight">
                        Basic: {formatCurrency(item.base_amount)}
                      </p>
                      <p className="text-[11px] text-[#618968] leading-tight">
                        Extra: {formatCurrency(item.extra_earnings)}
                      </p>
                      <p className="text-[11px] text-[#618968] leading-tight">
                        Bonus: {formatCurrency(item.bonus_amount)}
                      </p>
                      <p className="text-[11px] text-[#618968] leading-tight">
                        Tip: {formatCurrency(item.tip_amount)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </DriverLayout>
  );
}
