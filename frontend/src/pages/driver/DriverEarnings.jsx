import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DriverLayout from "../../components/DriverLayout";
import { API_URL } from "../../config";

const PERIODS = ["all", "today", "week", "month"];

export default function DriverEarnings() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState("all"); // Default to "all" for total earnings
  const [summary, setSummary] = useState(null);
  const [todayPerformance, setTodayPerformance] = useState(null); // Today's stats
  const [earnings, setEarnings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "driver") {
      navigate("/login");
      return;
    }
    fetchData();
  }, [navigate, period]);

  const fetchData = async () => {
    setLoading(true);
    const token = localStorage.getItem("token");

    try {
      const summaryRes = await fetch(
        `${API_URL}/driver/earnings/summary?period=${period}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const summaryData = await summaryRes.json();
      if (summaryData.success) {
        setSummary(summaryData.summary);
        setTodayPerformance(summaryData.today); // Always get today's performance
      }

      const historyRes = await fetch(
        `${API_URL}/driver/earnings/history?limit=50`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const historyData = await historyRes.json();
      if (historyData.success) setEarnings(historyData.earnings);
    } catch (error) {
      console.error("Failed to fetch earnings:", error);
    } finally {
      setLoading(false);
    }
  };

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
    const now = new Date();
    if (period === "all") {
      return "Total Earnings";
    }
    if (period === "today") {
      return "Today's Earnings";
    }
    if (period === "month") {
      return now.toLocaleDateString("en-IN", {
        month: "long",
        year: "numeric",
      });
    }
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    const startLabel = start.toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
    });
    const endLabel = now.toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
    });
    return `This Week (${startLabel} - ${endLabel})`;
  }, [period]);

  const weeklyChart = useMemo(() => {
    const now = new Date();
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(now.getDate() - (6 - i));
      return d;
    });

    const totals = days.map((d) => {
      const key = d.toISOString().split("T")[0];
      const dayTotal = earnings
        .filter((e) => (e.delivered_at || e.accepted_at || "").startsWith(key))
        .reduce((sum, e) => sum + getEarningsAmount(e), 0);
      return dayTotal;
    });

    const max = Math.max(...totals, 1);
    const labels = ["S", "M", "T", "W", "T", "F", "S"];

    return totals.map((value, idx) => ({
      label: labels[days[idx].getDay() % 7],
      height: Math.max(10, Math.round((value / max) * 100)),
      isPeak: value === max && max > 0,
    }));
  }, [earnings]);

  const dailyAvg = useMemo(() => {
    if (!summary) return 0;
    const days =
      period === "today"
        ? 1
        : period === "week"
          ? 7
          : period === "month"
            ? 30
            : Math.max(earnings.length, 1);
    return Number(summary.total_earnings || 0) / Math.max(days, 1);
  }, [summary, period, earnings.length]);

  const recentActivities = earnings.slice(0, 4);

  const cyclePeriod = () => {
    const currentIndex = PERIODS.indexOf(period);
    const nextIndex = (currentIndex + 1) % PERIODS.length;
    setPeriod(PERIODS[nextIndex]);
  };

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
          <button
            onClick={cyclePeriod}
            className="flex size-12 shrink-0 items-center justify-end"
            aria-label="Change period"
          >
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
                d="M8 7V3m8 4V3M3 11h18M5 7h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2z"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pb-24 hide-scrollbar">
          <div className="p-4">
            <div className="relative overflow-hidden rounded-xl bg-[#18db9d] p-6 shadow-lg shadow-[#13ec37]/20">
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
              </div>
              <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-white/20 rounded-full blur-2xl"></div>
            </div>
          </div>

          {/* Withdrawals Quick Link */}
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

          {/* Today's Performance Section */}
          <div className="px-4 py-2">
            <div className="bg-white rounded-xl border border-[#dbe6dd] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[#111812] text-base font-bold flex items-center gap-2">
                  Today's Performance
                </h3>
                <span className="text-xs text-[#618968] font-medium">
                  {new Date().toLocaleDateString("en-IN", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center gap-1 p-3 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-100">
                  <div className="text-2xl">💰</div>
                  <p className="text-[#111812] tracking-tight text-lg font-bold">
                    {loading
                      ? "—"
                      : formatCurrency(todayPerformance?.earnings || 0)}
                  </p>
                  <p className="text-[#618968] text-[10px] font-medium uppercase">
                    Earnings
                  </p>
                </div>
                <div className="flex flex-col items-center gap-1 p-3 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border border-blue-100">
                  <div className="text-2xl">🛵</div>
                  <p className="text-[#111812] tracking-tight text-lg font-bold">
                    {loading
                      ? "—"
                      : `${Number(todayPerformance?.distance_km || 0).toFixed(2)} km`}
                  </p>
                  <p className="text-[#618968] text-[10px] font-medium uppercase">
                    Distance
                  </p>
                </div>
                <div className="flex flex-col items-center gap-1 p-3 bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border border-orange-100">
                  <div className="text-2xl">📦</div>
                  <p className="text-[#111812] tracking-tight text-lg font-bold">
                    {loading ? "—" : todayPerformance?.deliveries || 0}
                  </p>
                  <p className="text-[#618968] text-[10px] font-medium uppercase">
                    Deliveries
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Period Stats - Summary for selected period */}
          <div className="flex flex-wrap gap-3 p-4">
            <div className="flex min-w-[100px] flex-1 flex-col gap-1 rounded-xl p-4 border border-[#dbe6dd] bg-white">
              <p className="text-[#618968] text-xs font-medium uppercase">
                {period === "all" ? "Lifetime Avg" : "Daily Avg"}
              </p>
              <p className="text-[#111812] tracking-tight text-xl font-bold">
                {loading ? "—" : formatCurrency(dailyAvg)}
              </p>
            </div>
            <div className="flex min-w-[100px] flex-1 flex-col gap-1 rounded-xl p-4 border border-[#dbe6dd] bg-white">
              <p className="text-[#618968] text-xs font-medium uppercase">
                {period === "all" ? "Total KM" : `${period} Distance`}
              </p>
              <p className="text-[#111812] tracking-tight text-xl font-bold">
                {loading
                  ? "—"
                  : `${Number(summary?.total_distance_km || 0).toFixed(1)} km`}
              </p>
            </div>
            <div className="flex min-w-[100px] flex-1 flex-col gap-1 rounded-xl p-4 border border-[#dbe6dd] bg-white">
              <p className="text-[#618968] text-xs font-medium uppercase">
                {period === "all" ? "All Deliveries" : `${period} Deliveries`}
              </p>
              <p className="text-[#111812] tracking-tight text-xl font-bold">
                {loading ? "—" : summary?.total_deliveries || 0}
              </p>
            </div>
          </div>

          <div className="px-4 py-2">
            <div className="bg-white rounded-xl border border-[#dbe6dd] p-5">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-[#111812] text-base font-bold">
                  Weekly Performance
                </h3>
                <span className="text-xs text-[#13ec37] font-bold">
                  Last 7 Days
                </span>
              </div>
              <div className="grid grid-cols-7 gap-3 items-end h-[160px] px-2">
                {weeklyChart.map((bar, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col items-center gap-2 h-full justify-end"
                  >
                    <div
                      className={`${bar.isPeak ? "bg-[#13ec37] shadow-lg shadow-[#13ec37]/20" : "bg-[#13ec37]/20"} w-full rounded-t-sm border-t-2 border-[#13ec37]`}
                      style={{ height: `${bar.height}%` }}
                    ></div>
                    <span
                      className={`text-[11px] font-bold ${bar.isPeak ? "text-[#13ec37]" : "text-[#618968]"}`}
                    >
                      {bar.label}
                    </span>
                  </div>
                ))}
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
                onClick={() => setPeriod("all")}
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
                      {Number(item.bonus_amount || 0) > 0 && (
                        <p className="text-[15px] text-[#05d027] font-bold">
                          Bonus +{formatCurrency(item.bonus_amount)}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 w-full bg-white border-t border-[#dbe6dd] pb-6 pt-3 px-6 flex justify-between items-center z-20">
          <button
            className="flex flex-col items-center gap-1 opacity-50"
            onClick={() => navigate("/driver/dashboard")}
          >
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
                d="M3 12l9-9 9 9v9H3z"
              />
            </svg>
            <span className="text-[10px] font-bold">Home</span>
          </button>
          <button
            className="flex flex-col items-center gap-1 opacity-50"
            onClick={() => navigate("/driver/deliveries")}
          >
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
            <span className="text-[10px] font-bold">Deliveries</span>
          </button>
          <div className="flex flex-col items-center gap-1 text-[#13ec37]">
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
                d="M12 8c-2 0-3 1-3 2s1 2 3 2 3 1 3 2-1 2-3 2m0-8V6m0 10v2"
              />
              <circle cx="12" cy="12" r="9" />
            </svg>
            <span className="text-[10px] font-bold">Earnings</span>
          </div>
          <button
            className="flex flex-col items-center gap-1 opacity-50"
            onClick={() => navigate("/driver/profile")}
          >
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
                d="M12 12a4 4 0 100-8 4 4 0 000 8zm6 8a6 6 0 00-12 0"
              />
            </svg>
            <span className="text-[10px] font-bold">Profile</span>
          </button>
        </div>
      </div>
    </DriverLayout>
  );
}
