import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../../../config";
import ManagerPageLayout from "../../../components/ManagerPageLayout";
import { ManagerPageSkeleton } from "../../../components/ManagerSkeleton";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
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
  "#0fa883",
  "#3b82f6",
  "#8b5cf6",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
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

function GrowthBadge({ value }) {
  if (!value || value === 0) return null;
  const isPositive = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
        isPositive
          ? "bg-emerald-100 text-emerald-700"
          : "bg-red-100 text-red-700"
      }`}
    >
      <span className="material-symbols-outlined text-xs">
        {isPositive ? "trending_up" : "trending_down"}
      </span>
      {Math.abs(value).toFixed(1)}%
    </span>
  );
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
            {entry.name.toLowerCase().includes("order")
              ? entry.value
              : formatCurrency(entry.value)}
          </span>
        </p>
      ))}
    </div>
  );
}

export default function SalesReports() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("monthly");
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return navigate("/login");

      const res = await fetch(
        `${API_URL}/manager/reports/sales?period=${period}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Sales report fetch error:", err);
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

  return (
    <ManagerPageLayout
      title="Sales Reports"
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
              {periodLabels[period]} Total Sales
            </p>
            <p className="text-4xl font-extrabold text-[#065f46]">
              {formatCurrency(s.total_sales)}
            </p>
            <GrowthBadge value={s.sales_growth} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
              <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">
                Orders
              </p>
              <p className="text-2xl font-extrabold text-blue-700 mt-1">
                {s.total_orders || 0}
              </p>
              <GrowthBadge value={s.orders_growth} />
            </div>
            <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
              <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">
                Delivered
              </p>
              <p className="text-2xl font-extrabold text-emerald-700 mt-1">
                {s.delivered_orders || 0}
              </p>
            </div>
            <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-100">
              <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">
                Avg Value
              </p>
              <p className="text-lg font-extrabold text-amber-700 mt-1">
                {formatCurrency(s.avg_order_value)}
              </p>
              <GrowthBadge value={s.avg_growth} />
            </div>
          </div>
        </div>

        {/* Sales Trend Chart */}
        {data?.trend?.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-500 text-lg">
                show_chart
              </span>
              Sales Trend
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={data.trend}>
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
                <YAxis
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="sales"
                  name="Sales"
                  stroke="#13ecb9"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#13ecb9" }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="orders"
                  name="Orders"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 2, fill: "#3b82f6" }}
                  yAxisId="right"
                  hide
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Order Volume Bar Chart */}
        {data?.trend?.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-purple-500 text-lg">
                bar_chart
              </span>
              Order Volume
            </h3>
            <ResponsiveContainer width="100%" height={200}>
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
                <Bar
                  dataKey="orders"
                  name="Orders"
                  fill="#13ecb9"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Payment Methods & Status */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Payment Method Breakdown */}
          {data?.payment_breakdown?.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-green-500 text-lg">
                  payments
                </span>
                Payment Methods
              </h3>
              <div className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={data.payment_breakdown}
                      dataKey="total"
                      nameKey="method"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      innerRadius={40}
                      paddingAngle={3}
                    >
                      {data.payment_breakdown.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: "11px" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 space-y-2">
                {data.payment_breakdown.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      />
                      <span className="text-gray-600 capitalize">
                        {m.method}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-gray-800">
                        {formatCurrency(m.total)}
                      </span>
                      <span className="text-gray-400 text-xs ml-1">
                        ({m.count})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Order Status Breakdown */}
          {data?.status_breakdown && (
            <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-500 text-lg">
                  donut_large
                </span>
                Order Status
              </h3>
              <div className="space-y-3">
                {Object.entries(data.status_breakdown).map(
                  ([status, count], i) => {
                    const pct =
                      s.total_orders > 0
                        ? ((count / s.total_orders) * 100).toFixed(1)
                        : 0;
                    const statusColors = {
                      delivered: "bg-emerald-500",
                      pending: "bg-yellow-500",
                      accepted: "bg-blue-500",
                      preparing: "bg-purple-500",
                      ready: "bg-cyan-500",
                      picked_up: "bg-indigo-500",
                      on_the_way: "bg-orange-500",
                      cancelled: "bg-red-500",
                      rejected: "bg-red-400",
                    };
                    return (
                      <div key={status}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-semibold text-gray-600 capitalize">
                            {status.replace(/_/g, " ")}
                          </span>
                          <span className="text-xs font-bold text-gray-800">
                            {count}{" "}
                            <span className="text-gray-400">({pct}%)</span>
                          </span>
                        </div>
                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${statusColors[status] || "bg-gray-400"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </div>
          )}
        </div>

        {/* Top Restaurants */}
        {data?.top_restaurants?.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-500 text-lg">
                emoji_events
              </span>
              Top Restaurants by Sales
            </h3>

            <ResponsiveContainer
              width="100%"
              height={Math.min(data.top_restaurants.length * 40 + 20, 300)}
            >
              <BarChart
                data={data.top_restaurants}
                layout="vertical"
                margin={{ left: 20, right: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#6b7280" }}
                  width={100}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="sales"
                  name="Sales"
                  fill="#13ecb9"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-4 space-y-2">
              {data.top_restaurants.slice(0, 5).map((r, i) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50"
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold ${
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
                    <p className="text-xs text-gray-400">{r.orders} orders</p>
                  </div>
                  <p className="text-sm font-bold text-emerald-600">
                    {formatCurrency(r.sales)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No data state */}
        {(!data?.trend || data.trend.length === 0) && (
          <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-gray-100">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-3xl text-gray-400">
                trending_up
              </span>
            </div>
            <p className="text-gray-500 font-medium">No sales data yet</p>
            <p className="text-gray-400 text-sm mt-1">
              Sales will appear here once orders are placed
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
