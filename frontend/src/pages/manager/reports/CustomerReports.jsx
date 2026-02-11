import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../../../config";
import ManagerPageLayout from "../../../components/ManagerPageLayout";
import { ManagerPageSkeleton } from "../../../components/ManagerSkeleton";
import {
  AreaChart,
  Area,
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

const CHART_COLORS = ["#13ecb9", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899"];

const periodLabels = {
  daily: "Today",
  weekly: "This Week",
  monthly: "This Month",
  all: "All Time",
};

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

export default function CustomerReports() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("monthly");
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllCustomers, setShowAllCustomers] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return navigate("/login");

      const res = await fetch(
        `${API_URL}/manager/reports/customers?period=${period}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Customer report fetch error:", err);
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
  const topCustomers = data?.top_customers || [];
  const displayCustomers = showAllCustomers
    ? topCustomers
    : topCustomers.slice(0, 5);

  return (
    <ManagerPageLayout
      title="Customer Reports"
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
        <div className="bg-white rounded-2xl shadow-lg p-5 border border-gray-100 text-center">
          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">
            Total Customers
          </p>
          <p className="text-4xl font-extrabold text-[#065f46]">
            {s.total_customers || 0}
          </p>
          <p className="text-sm text-gray-500 mt-2">
            {s.new_customers || 0} new {periodLabels[period]?.toLowerCase()}
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-emerald-600 text-lg">
                  shopping_bag
                </span>
              </div>
            </div>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
              Avg Orders
            </p>
            <p className="text-lg font-bold text-gray-800 mt-1">
              {parseFloat(s.avg_orders_per_customer || 0).toFixed(1)}
            </p>
            <p className="text-[10px] text-gray-400">per customer</p>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-blue-600 text-lg">
                  receipt_long
                </span>
              </div>
            </div>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
              Avg Spend
            </p>
            <p className="text-lg font-bold text-gray-800 mt-1">
              Rs.{parseFloat(s.avg_spend_per_customer || 0).toFixed(0)}
            </p>
            <p className="text-[10px] text-gray-400">per customer</p>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-purple-600 text-lg">
                  repeat
                </span>
              </div>
            </div>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
              Repeat Rate
            </p>
            <p className="text-lg font-bold text-gray-800 mt-1">
              {s.total_customers > 0
                ? ((s.repeat_customers / s.total_customers) * 100).toFixed(1)
                : 0}
              %
            </p>
            <p className="text-[10px] text-gray-400">2+ orders</p>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-amber-600 text-lg">
                  star
                </span>
              </div>
            </div>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
              Loyal Customers
            </p>
            <p className="text-lg font-bold text-gray-800 mt-1">
              {s.loyal_customers || 0}
            </p>
            <p className="text-[10px] text-gray-400">5+ orders</p>
          </div>
        </div>

        {/* Registration Trend */}
        {data?.registration_trend?.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-500 text-lg">
                person_add
              </span>
              Customer Registration Trend
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.registration_trend}>
                <defs>
                  <linearGradient
                    id="colorRegistrations"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#13ecb9" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#13ecb9" stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="registrations"
                  name="Registrations"
                  stroke="#13ecb9"
                  fill="url(#colorRegistrations)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Order Frequency Distribution */}
        {data?.order_frequency?.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-500 text-lg">
                bar_chart
              </span>
              Order Frequency Distribution
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.order_frequency}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="range"
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Customers" radius={[8, 8, 0, 0]}>
                  {data.order_frequency.map((_, i) => (
                    <Cell
                      key={i}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* City Breakdown */}
        {data?.city_breakdown?.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-purple-500 text-lg">
                location_city
              </span>
              Customers by City
            </h3>
            <div className="flex justify-center">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={data.city_breakdown}
                    dataKey="count"
                    nameKey="city"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={45}
                    paddingAngle={3}
                  >
                    {data.city_breakdown.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
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

        {/* Top Customers */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 pt-5 pb-3">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-500 text-lg">
                workspace_premium
              </span>
              Top Customers
            </h3>
          </div>
          {topCustomers.length > 0 ? (
            <>
              <div className="divide-y divide-gray-50">
                {displayCustomers.map((customer, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        i === 0
                          ? "bg-amber-100 text-amber-700"
                          : i === 1
                            ? "bg-gray-200 text-gray-600"
                            : i === 2
                              ? "bg-orange-100 text-orange-700"
                              : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {i < 3 ? (
                        <span className="material-symbols-outlined text-sm">
                          {i === 0
                            ? "looks_one"
                            : i === 1
                              ? "looks_two"
                              : "looks_3"}
                        </span>
                      ) : (
                        `#${i + 1}`
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 truncate">
                        {customer.name || "Unknown"}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {customer.city || "N/A"} · {customer.order_count || 0}{" "}
                        orders
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-[#065f46]">
                        Rs.{parseFloat(customer.total_spent || 0).toFixed(0)}
                      </p>
                      <p className="text-[10px] text-gray-400">total spent</p>
                    </div>
                  </div>
                ))}
              </div>
              {topCustomers.length > 5 && (
                <div className="px-5 py-3 border-t border-gray-50">
                  <button
                    onClick={() => setShowAllCustomers(!showAllCustomers)}
                    className="text-[#0fa883] text-sm font-semibold hover:underline"
                  >
                    {showAllCustomers
                      ? "Show Less"
                      : `Show All (${topCustomers.length})`}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="px-5 pb-5 text-center text-gray-400 text-sm py-8">
              No customer data available
            </div>
          )}
        </div>

        {/* Favorite Restaurants */}
        {data?.favorite_restaurants?.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-rose-500 text-lg">
                favorite
              </span>
              Most Popular Restaurants
            </h3>
            <div className="space-y-2">
              {data.favorite_restaurants.slice(0, 5).map((r, i) => {
                const maxOrders =
                  data.favorite_restaurants[0]?.order_count || 1;
                return (
                  <div key={i} className="group">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-gray-700 truncate">
                        {r.restaurant_name}
                      </span>
                      <span className="text-xs font-bold text-gray-500 flex-shrink-0 ml-2">
                        {r.order_count} orders
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-rose-400 to-rose-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${(r.order_count / maxOrders) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* No data state */}
        {(!data?.top_customers || data.top_customers.length === 0) &&
          (!data?.registration_trend ||
            data.registration_trend.length === 0) && (
            <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-gray-100">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-3xl text-gray-400">
                  people
                </span>
              </div>
              <p className="text-gray-500 font-medium">No customer data yet</p>
              <p className="text-gray-400 text-sm mt-1">
                Customer insights will appear once customers start ordering
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
