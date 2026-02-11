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

const REVENUE_COLORS = ["#13ecb9", "#3b82f6", "#8b5cf6"];
const EXPENSE_COLORS = ["#f59e0b", "#06b6d4", "#ec4899"];

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
            {formatCurrency(entry.value)}
          </span>
        </p>
      ))}
    </div>
  );
}

export default function FinancialReports() {
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
        `${API_URL}/manager/reports/financial?period=${period}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Financial report fetch error:", err);
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
      title="Financial Reports"
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
              {periodLabels[period]} Net Earnings
            </p>
            <p className="text-4xl font-extrabold text-[#065f46]">
              {formatCurrency(s.manager_earnings)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
              <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">
                Revenue
              </p>
              <p className="text-xl font-extrabold text-emerald-700 mt-1">
                {formatCurrency(s.total_revenue)}
              </p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
              <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">
                Margin
              </p>
              <p className="text-xl font-extrabold text-blue-700 mt-1">
                {s.total_revenue > 0
                  ? ((s.manager_earnings / s.total_revenue) * 100).toFixed(1)
                  : 0}
                %
              </p>
            </div>
          </div>
        </div>

        {/* Revenue vs Profit Trend */}
        {data?.trend?.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-500 text-lg">
                area_chart
              </span>
              Revenue vs Profit Trend
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={data.trend}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#13ecb9" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#13ecb9" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
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
                  tickFormatter={(v) =>
                    v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v
                  }
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "11px" }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="#13ecb9"
                  fill="url(#colorRevenue)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="profit"
                  name="Profit"
                  stroke="#3b82f6"
                  fill="url(#colorProfit)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Earnings Breakdown */}
        <div className="bg-gradient-to-r from-[#064e3b] to-[#065f46] rounded-2xl p-5 shadow-md">
          <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-4">
            Complete Financial Breakdown
          </p>
          <div className="space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-white/80 text-sm">
                Total Revenue (Collected)
              </span>
              <span className="text-white font-bold">
                {formatCurrency(s.total_revenue)}
              </span>
            </div>
            <div className="h-px bg-white/10"></div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span className="text-white/70 text-sm">
                  Restaurant Payouts
                </span>
              </div>
              <span className="text-amber-300 font-bold">
                − {formatCurrency(s.total_restaurant_payout)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                <span className="text-white/70 text-sm">Driver Earnings</span>
              </div>
              <span className="text-cyan-300 font-bold">
                − {formatCurrency(s.total_driver_earnings)}
              </span>
            </div>
            <div className="h-px bg-white/10"></div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span className="text-white/70 text-sm">Food Commission</span>
              </div>
              <span className="text-emerald-300 font-semibold">
                {formatCurrency(s.total_commission)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                <span className="text-white/70 text-sm">Service Fees</span>
              </div>
              <span className="text-blue-300 font-semibold">
                {formatCurrency(s.total_service_fees)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                <span className="text-white/70 text-sm">Delivery Fees</span>
              </div>
              <span className="text-purple-300 font-semibold">
                {formatCurrency(s.total_delivery_fees)}
              </span>
            </div>
            <div className="h-px bg-white/20 my-1"></div>
            <div className="flex justify-between items-center">
              <span className="text-[#13ec80] font-bold text-sm">
                = Your Net Earnings
              </span>
              <span className="text-[#13ec80] text-xl font-extrabold">
                {formatCurrency(s.manager_earnings)}
              </span>
            </div>
          </div>
        </div>

        {/* Pie Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Revenue Sources */}
          {data?.revenue_breakdown?.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-500 text-lg">
                  pie_chart
                </span>
                Revenue Sources
              </h3>
              <div className="flex justify-center">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={data.revenue_breakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={45}
                      paddingAngle={3}
                    >
                      {data.revenue_breakdown.map((_, i) => (
                        <Cell
                          key={i}
                          fill={REVENUE_COLORS[i % REVENUE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(v)} />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: "11px" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-2">
                {data.revenue_breakdown.map((item, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{
                          backgroundColor:
                            REVENUE_COLORS[i % REVENUE_COLORS.length],
                        }}
                      />
                      <span className="text-gray-600">{item.name}</span>
                    </div>
                    <span className="font-bold text-gray-800">
                      {formatCurrency(item.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expense Breakdown */}
          {data?.expense_breakdown?.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-red-500 text-lg">
                  account_balance
                </span>
                Expense Breakdown
              </h3>
              <div className="flex justify-center">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={data.expense_breakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={45}
                      paddingAngle={3}
                    >
                      {data.expense_breakdown.map((_, i) => (
                        <Cell
                          key={i}
                          fill={EXPENSE_COLORS[i % EXPENSE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(v)} />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: "11px" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-2">
                {data.expense_breakdown.map((item, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{
                          backgroundColor:
                            EXPENSE_COLORS[i % EXPENSE_COLORS.length],
                        }}
                      />
                      <span className="text-gray-600">{item.name}</span>
                    </div>
                    <span className="font-bold text-gray-800">
                      {formatCurrency(item.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Cash Flow Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-green-600 text-lg">
                  savings
                </span>
              </div>
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                Cash
              </span>
            </div>
            <p className="text-lg font-bold text-gray-800">
              {formatCurrency(s.cash_collected)}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-blue-600 text-lg">
                  credit_card
                </span>
              </div>
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                Online
              </span>
            </div>
            <p className="text-lg font-bold text-gray-800">
              {formatCurrency(s.online_collected)}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-amber-600 text-lg">
                  account_balance_wallet
                </span>
              </div>
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                Deposited
              </span>
            </div>
            <p className="text-lg font-bold text-gray-800">
              {formatCurrency(s.total_deposited)}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-purple-600 text-lg">
                  send_money
                </span>
              </div>
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                Paid Out
              </span>
            </div>
            <p className="text-lg font-bold text-gray-800">
              {formatCurrency(s.total_paid_to_drivers)}
            </p>
          </div>
        </div>

        {/* Cost Breakdown Bar Chart */}
        {data?.trend?.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-purple-500 text-lg">
                stacked_bar_chart
              </span>
              Daily Cost Breakdown
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
                <YAxis
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickFormatter={(v) =>
                    v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v
                  }
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "11px" }}
                />
                <Bar
                  dataKey="restaurant_payout"
                  name="Restaurant"
                  fill="#f59e0b"
                  stackId="a"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="driver_earnings"
                  name="Drivers"
                  fill="#06b6d4"
                  stackId="a"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="profit"
                  name="Profit"
                  fill="#13ecb9"
                  stackId="a"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Tips Info */}
        {s.total_tips > 0 && (
          <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-amber-600 text-xl">
                  volunteer_activism
                </span>
              </div>
              <div>
                <p className="text-sm font-bold text-amber-800">
                  Tips Collected
                </p>
                <p className="text-xs text-amber-600">
                  {formatCurrency(s.total_tips)} in tips were allocated from
                  manager earnings to incentivize drivers
                </p>
              </div>
            </div>
          </div>
        )}

        {/* No data state */}
        {(!data?.trend || data.trend.length === 0) && (
          <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-gray-100">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-3xl text-gray-400">
                payments
              </span>
            </div>
            <p className="text-gray-500 font-medium">No financial data yet</p>
            <p className="text-gray-400 text-sm mt-1">
              Financial reports will appear once transactions are made
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
