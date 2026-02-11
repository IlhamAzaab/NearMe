import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../../../config";
import ManagerPageLayout from "../../../components/ManagerPageLayout";
import { ManagerPageSkeleton } from "../../../components/ManagerSkeleton";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const COLORS = [
  "#13ecb9",
  "#3b82f6",
  "#8b5cf6",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];

const periodLabels = {
  daily: "Today",
  weekly: "This Week",
  monthly: "This Month",
  all: "All Time",
};

function formatCurrency(value) {
  return `Rs.${parseFloat(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 text-xs">
      <p className="font-bold text-gray-700 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-gray-500">{entry.name}:</span>
          <span className="font-bold text-gray-800">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

export default function DeliveryReports() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("monthly");
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllDrivers, setShowAllDrivers] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return navigate("/login");

      const res = await fetch(
        `${API_URL}/manager/reports/deliveries?period=${period}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Delivery report fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, navigate]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (loading && !data) {
    return <ManagerPageSkeleton type="reports" />;
  }

  const s = data?.summary || {};
  const statusData = data?.status_breakdown
    ? Object.entries(data.status_breakdown).map(([name, value]) => ({
        name: name.replace(/_/g, " "),
        value,
      }))
    : [];

  const driversToShow = showAllDrivers
    ? data?.driver_performance || []
    : (data?.driver_performance || []).slice(0, 5);

  return (
    <ManagerPageLayout
      title="Delivery Reports"
      onRefresh={handleRefresh}
      refreshing={refreshing}
    >
      <div className="p-4 space-y-4 max-w-2xl mx-auto lg:max-w-none">
        {/* Period Selector */}
        <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
          {["daily", "weekly", "monthly", "all"].map((p) => (
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

        {/* Hero Metrics */}
        <div className="bg-white rounded-2xl shadow-lg p-5 border border-gray-100">
          <div className="text-center mb-4">
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">
              Completion Rate
            </p>
            <p className="text-5xl font-extrabold text-[#065f46]">
              {s.completion_rate || 0}%
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-purple-50 rounded-xl p-3 text-center border border-purple-100">
              <p className="text-[10px] text-purple-600 font-bold uppercase tracking-wider">
                Total Deliveries
              </p>
              <p className="text-2xl font-extrabold text-purple-700 mt-1">
                {s.total_deliveries || 0}
              </p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
              <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">
                Completed
              </p>
              <p className="text-2xl font-extrabold text-emerald-700 mt-1">
                {s.delivered || 0}
              </p>
            </div>
          </div>
        </div>

        {/* Key Metrics Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-blue-600 text-lg">
                  timer
                </span>
              </div>
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                Avg Time
              </span>
            </div>
            <p className="text-xl font-bold text-gray-800">
              {s.avg_delivery_time || 0}
              <span className="text-sm text-gray-400 ml-1">min</span>
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-indigo-600 text-lg">
                  route
                </span>
              </div>
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                Avg Distance
              </span>
            </div>
            <p className="text-xl font-bold text-gray-800">
              {s.avg_distance || 0}
              <span className="text-sm text-gray-400 ml-1">km</span>
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-emerald-600 text-lg">
                  payments
                </span>
              </div>
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                Driver Pay
              </span>
            </div>
            <p className="text-lg font-bold text-gray-800">
              {formatCurrency(s.total_driver_earnings)}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-amber-600 text-lg">
                  volunteer_activism
                </span>
              </div>
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                Total Tips
              </span>
            </div>
            <p className="text-lg font-bold text-gray-800">
              {formatCurrency(s.total_tips)}
            </p>
          </div>
        </div>

        {/* Delivery Trend */}
        {data?.trend?.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-purple-500 text-lg">
                insights
              </span>
              Delivery Trend
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickFormatter={(v) =>
                    period === "daily"
                      ? `${v}:00`
                      : v.length > 5
                        ? v.slice(5)
                        : v
                  }
                />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "11px" }}
                />
                <Bar
                  dataKey="delivered"
                  name="Delivered"
                  fill="#13ecb9"
                  radius={[4, 4, 0, 0]}
                  stackId="a"
                />
                <Bar
                  dataKey="cancelled"
                  name="Cancelled"
                  fill="#ef4444"
                  radius={[4, 4, 0, 0]}
                  stackId="a"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Status Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {statusData.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-cyan-500 text-lg">
                  donut_large
                </span>
                Status Breakdown
              </h3>
              <div className="flex justify-center">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={45}
                      paddingAngle={3}
                    >
                      {statusData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: "11px" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Distance & Time Summary */}
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-indigo-500 text-lg">
                speed
              </span>
              Performance Metrics
            </h3>
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">
                      Total Distance Covered
                    </p>
                    <p className="text-2xl font-extrabold text-emerald-700 mt-1">
                      {(s.total_distance || 0).toFixed(1)} km
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <span className="material-symbols-outlined text-emerald-600 text-2xl">
                      directions_bike
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">
                      Pending Deliveries
                    </p>
                    <p className="text-2xl font-extrabold text-blue-700 mt-1">
                      {s.pending || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                    <span className="material-symbols-outlined text-blue-600 text-2xl">
                      hourglass_top
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-red-50 to-pink-50 rounded-xl p-4 border border-red-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-red-600 font-bold uppercase tracking-wider">
                      Cancelled
                    </p>
                    <p className="text-2xl font-extrabold text-red-700 mt-1">
                      {s.cancelled || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                    <span className="material-symbols-outlined text-red-600 text-2xl">
                      cancel
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Driver Performance Table */}
        {data?.driver_performance?.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-500 text-lg">
                leaderboard
              </span>
              Driver Performance
              <span className="ml-auto text-[10px] text-gray-400 font-medium bg-gray-100 px-2 py-1 rounded-full">
                {data.driver_performance.length} drivers
              </span>
            </h3>

            <div className="space-y-2">
              {driversToShow.map((driver, i) => (
                <div
                  key={driver.id}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 border border-gray-100 transition-all"
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                      i === 0
                        ? "bg-amber-400"
                        : i === 1
                          ? "bg-gray-400"
                          : i === 2
                            ? "bg-amber-600"
                            : "bg-gray-300"
                    }`}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">
                      {driver.name}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {driver.type} • {driver.avg_time}min avg •{" "}
                      {driver.completion_rate}% rate
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center flex-shrink-0">
                    <div>
                      <p className="text-xs text-gray-400">Delivered</p>
                      <p className="text-sm font-bold text-emerald-600">
                        {driver.delivered}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Earned</p>
                      <p className="text-sm font-bold text-blue-600">
                        {formatCurrency(driver.earnings)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {data.driver_performance.length > 5 && (
              <button
                onClick={() => setShowAllDrivers(!showAllDrivers)}
                className="w-full mt-3 py-2.5 rounded-xl text-sm font-semibold text-[#13ecb9] bg-[#13ecb9]/10 hover:bg-[#13ecb9]/20 transition-all"
              >
                {showAllDrivers
                  ? "Show Less"
                  : `Show All ${data.driver_performance.length} Drivers`}
              </button>
            )}
          </div>
        )}

        {/* No data state */}
        {(!data?.trend || data.trend.length === 0) && (
          <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-gray-100">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-3xl text-gray-400">
                local_shipping
              </span>
            </div>
            <p className="text-gray-500 font-medium">No delivery data yet</p>
            <p className="text-gray-400 text-sm mt-1">
              Delivery metrics will appear once deliveries are made
            </p>
          </div>
        )}
      </div>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </ManagerPageLayout>
  );
}
