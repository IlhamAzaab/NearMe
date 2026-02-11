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
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];

const STATUS_COLORS = {
  active: "#10b981",
  pending: "#f59e0b",
  suspended: "#ef4444",
  rejected: "#dc2626",
  unknown: "#9ca3af",
};

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
          <span className="font-bold text-gray-800">
            {typeof entry.value === "number" && entry.name !== "Orders"
              ? formatCurrency(entry.value)
              : entry.value}
          </span>
        </p>
      ))}
    </div>
  );
}

export default function RestaurantReports() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("monthly");
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return navigate("/login");

      const res = await fetch(
        `${API_URL}/manager/reports/restaurants?period=${period}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Restaurant report fetch error:", err);
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
  const restaurants = showAll
    ? data?.restaurant_performance || []
    : (data?.restaurant_performance || []).slice(0, 8);

  const statusPieData = data?.status_counts
    ? Object.entries(data.status_counts).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
      }))
    : [];

  return (
    <ManagerPageLayout
      title="Restaurant Reports"
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

        {/* Hero Card */}
        <div className="bg-white rounded-2xl shadow-lg p-5 border border-gray-100">
          <div className="text-center mb-4">
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">
              Total Commission Earned
            </p>
            <p className="text-4xl font-extrabold text-[#065f46]">
              {formatCurrency(s.total_commission)}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-100">
              <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">
                Total
              </p>
              <p className="text-2xl font-extrabold text-amber-700 mt-1">
                {s.total_restaurants || 0}
              </p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
              <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">
                Active
              </p>
              <p className="text-2xl font-extrabold text-emerald-700 mt-1">
                {s.active_restaurants || 0}
              </p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
              <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">
                Avg Orders
              </p>
              <p className="text-2xl font-extrabold text-blue-700 mt-1">
                {s.avg_orders_per_restaurant || 0}
              </p>
            </div>
          </div>
        </div>

        {/* Payout Summary */}
        <div className="bg-gradient-to-r from-[#064e3b] to-[#065f46] rounded-2xl p-4 shadow-md">
          <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-3">
            Financial Summary
          </p>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-white/80 text-sm">Total Commission</span>
              <span className="text-white font-bold">
                {formatCurrency(s.total_commission)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/80 text-sm">
                Total Restaurant Payout
              </span>
              <span className="text-amber-300 font-bold">
                {formatCurrency(s.total_payout)}
              </span>
            </div>
            <div className="h-px bg-white/20 my-1"></div>
            <div className="flex justify-between items-center">
              <span className="text-[#13ec80] font-bold text-sm">
                Commission Rate (avg)
              </span>
              <span className="text-[#13ec80] text-xl font-extrabold">
                {s.total_payout > 0
                  ? (
                      (s.total_commission /
                        (s.total_payout + s.total_commission)) *
                      100
                    ).toFixed(1)
                  : 0}
                %
              </span>
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Restaurant Status Pie */}
          {statusPieData.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-500 text-lg">
                  store
                </span>
                Restaurant Status
              </h3>
              <div className="flex justify-center">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={45}
                      paddingAngle={3}
                    >
                      {statusPieData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={
                            STATUS_COLORS[entry.name.toLowerCase()] ||
                            COLORS[i % COLORS.length]
                          }
                        />
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

          {/* Commission Trend */}
          {data?.trend?.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-green-500 text-lg">
                  show_chart
                </span>
                Commission Trend
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    tickFormatter={(v) => (v.length > 5 ? v.slice(5) : v)}
                  />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: "11px" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="commission"
                    name="Commission"
                    stroke="#13ecb9"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#13ecb9" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="orders"
                    name="Orders"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 2, fill: "#3b82f6" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Top Restaurants by Orders */}
        {data?.top_by_orders?.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-500 text-lg">
                bar_chart
              </span>
              Top Restaurants by Orders
            </h3>
            <ResponsiveContainer
              width="100%"
              height={Math.min(data.top_by_orders.length * 40 + 20, 350)}
            >
              <BarChart
                data={data.top_by_orders}
                layout="vertical"
                margin={{ left: 20, right: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#6b7280" }}
                  width={100}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="total_orders"
                  name="Orders"
                  fill="#3b82f6"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* All Restaurants Performance */}
        {data?.restaurant_performance?.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-500 text-lg">
                restaurant
              </span>
              Restaurant Performance
              <span className="ml-auto text-[10px] text-gray-400 font-medium bg-gray-100 px-2 py-1 rounded-full">
                {data.restaurant_performance.length} restaurants
              </span>
            </h3>

            <div className="space-y-2">
              {restaurants.map((r, i) => (
                <div
                  key={r.id}
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
                      {r.name}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {r.total_orders} orders • {r.delivered_orders} delivered
                      {r.cancelled_orders > 0 && (
                        <span className="text-red-400">
                          {" "}
                          • {r.cancelled_orders} cancelled
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-center flex-shrink-0">
                    <div>
                      <p className="text-[10px] text-gray-400">Sales</p>
                      <p className="text-xs font-bold text-gray-700">
                        {formatCurrency(r.total_sales)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400">Commission</p>
                      <p className="text-xs font-bold text-emerald-600">
                        {formatCurrency(r.commission_earned)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {data.restaurant_performance.length > 8 && (
              <button
                onClick={() => setShowAll(!showAll)}
                className="w-full mt-3 py-2.5 rounded-xl text-sm font-semibold text-[#13ecb9] bg-[#13ecb9]/10 hover:bg-[#13ecb9]/20 transition-all"
              >
                {showAll
                  ? "Show Less"
                  : `Show All ${data.restaurant_performance.length} Restaurants`}
              </button>
            )}
          </div>
        )}

        {/* No data state */}
        {(!data?.restaurant_performance ||
          data.restaurant_performance.length === 0) && (
          <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-gray-100">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-3xl text-gray-400">
                restaurant
              </span>
            </div>
            <p className="text-gray-500 font-medium">No restaurant data yet</p>
            <p className="text-gray-400 text-sm mt-1">
              Restaurant analytics will appear once orders are placed
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
