import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../../../config";
import ManagerPageLayout from "../../../components/ManagerPageLayout";
import { ManagerPageSkeleton } from "../../../components/ManagerSkeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const HOUR_COLORS = {
  earlyMorning: "#94a3b8",
  morning: "#fbbf24",
  lunch: "#f97316",
  afternoon: "#06b6d4",
  dinner: "#8b5cf6",
  night: "#475569",
};

const periodLabels = {
  daily: "Today",
  weekly: "This Week",
  monthly: "This Month",
  all: "All Time",
};

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getHourColor(hour) {
  if (hour >= 5 && hour < 9) return HOUR_COLORS.earlyMorning;
  if (hour >= 9 && hour < 12) return HOUR_COLORS.morning;
  if (hour >= 12 && hour < 15) return HOUR_COLORS.lunch;
  if (hour >= 15 && hour < 18) return HOUR_COLORS.afternoon;
  if (hour >= 18 && hour < 22) return HOUR_COLORS.dinner;
  return HOUR_COLORS.night;
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

export default function TimeAnalytics() {
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
        `${API_URL}/manager/reports/analytics?period=${period}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Analytics fetch error:", err);
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

  const hourlyData = (data?.hourly_distribution || []).map((item) => ({
    ...item,
    label: `${item.hour}:00`,
    color: getHourColor(item.hour),
  }));

  const weekdayData = (data?.weekday_distribution || []).map((item) => ({
    ...item,
    label: dayNames[item.day] || `Day ${item.day}`,
  }));

  const peakHours = data?.peak_hours || [];
  const mealBreakdown = data?.meal_time_breakdown || {};

  // Calculate total orders for percentages
  const totalOrders = hourlyData.reduce((sum, h) => sum + (h.orders || 0), 0);

  return (
    <ManagerPageLayout
      title="Time-based Analytics"
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

        {/* Peak Hours Summary */}
        {peakHours.length > 0 && (
          <div className="bg-gradient-to-r from-[#064e3b] to-[#065f46] rounded-2xl p-5 shadow-lg">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[#13ecb9] text-xl">
                local_fire_department
              </span>
              <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">
                Peak Hours ({periodLabels[period]})
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {peakHours.slice(0, 3).map((p, i) => (
                <div
                  key={i}
                  className="bg-white/10 rounded-xl p-3 text-center backdrop-blur-sm"
                >
                  <div className="flex items-center justify-center gap-1 mb-1">
                    {i === 0 && (
                      <span className="material-symbols-outlined text-amber-400 text-sm">
                        emoji_events
                      </span>
                    )}
                    <span className="text-white/50 text-[10px] font-bold uppercase">
                      #{i + 1}
                    </span>
                  </div>
                  <p className="text-2xl font-extrabold text-white">
                    {p.hour}:00
                  </p>
                  <p className="text-[#13ecb9] text-xs font-bold mt-1">
                    {p.orders} orders
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Meal Time Breakdown Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              key: "breakfast",
              label: "Breakfast",
              time: "6am - 11am",
              icon: "egg_alt",
              color: "amber",
              bgColor: "bg-amber-50",
              borderColor: "border-amber-100",
              iconBg: "bg-amber-100",
              iconColor: "text-amber-600",
              textColor: "text-amber-800",
            },
            {
              key: "lunch",
              label: "Lunch",
              time: "11am - 3pm",
              icon: "lunch_dining",
              color: "orange",
              bgColor: "bg-orange-50",
              borderColor: "border-orange-100",
              iconBg: "bg-orange-100",
              iconColor: "text-orange-600",
              textColor: "text-orange-800",
            },
            {
              key: "snack",
              label: "Snack Time",
              time: "3pm - 6pm",
              icon: "bakery_dining",
              color: "cyan",
              bgColor: "bg-cyan-50",
              borderColor: "border-cyan-100",
              iconBg: "bg-cyan-100",
              iconColor: "text-cyan-600",
              textColor: "text-cyan-800",
            },
            {
              key: "dinner",
              label: "Dinner",
              time: "6pm - 11pm",
              icon: "dinner_dining",
              color: "purple",
              bgColor: "bg-purple-50",
              borderColor: "border-purple-100",
              iconBg: "bg-purple-100",
              iconColor: "text-purple-600",
              textColor: "text-purple-800",
            },
          ].map((meal) => {
            const count = mealBreakdown[meal.key] || 0;
            const pct =
              totalOrders > 0 ? ((count / totalOrders) * 100).toFixed(0) : 0;

            return (
              <div
                key={meal.key}
                className={`${meal.bgColor} rounded-2xl p-4 border ${meal.borderColor}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className={`w-8 h-8 rounded-lg ${meal.iconBg} flex items-center justify-center`}
                  >
                    <span
                      className={`material-symbols-outlined ${meal.iconColor} text-lg`}
                    >
                      {meal.icon}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                  {meal.label}
                </p>
                <p className={`text-xl font-extrabold ${meal.textColor} mt-1`}>
                  {count}
                </p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[10px] text-gray-400">{meal.time}</p>
                  <span
                    className={`text-[10px] font-bold ${meal.iconColor} bg-white px-1.5 py-0.5 rounded-full`}
                  >
                    {pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Hourly Distribution Chart */}
        {hourlyData.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-500 text-lg">
                schedule
              </span>
              Orders by Hour of Day
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: "#9ca3af" }}
                  interval={1}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="orders" name="Orders" radius={[4, 4, 0, 0]}>
                  {hourlyData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-3 justify-center">
              {[
                { label: "Early Morning", color: HOUR_COLORS.earlyMorning },
                { label: "Morning", color: HOUR_COLORS.morning },
                { label: "Lunch", color: HOUR_COLORS.lunch },
                { label: "Afternoon", color: HOUR_COLORS.afternoon },
                { label: "Dinner", color: HOUR_COLORS.dinner },
                { label: "Night", color: HOUR_COLORS.night },
              ].map((l, i) => (
                <div key={i} className="flex items-center gap-1">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: l.color }}
                  />
                  <span className="text-[10px] text-gray-500">{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weekday Distribution */}
        {weekdayData.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-500 text-lg">
                calendar_view_week
              </span>
              Orders by Day of Week
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weekdayData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="orders"
                  name="Orders"
                  fill="#3b82f6"
                  radius={[8, 8, 0, 0]}
                >
                  {weekdayData.map((entry, i) => {
                    const maxOrders = Math.max(
                      ...weekdayData.map((d) => d.orders || 0),
                    );
                    const intensity =
                      maxOrders > 0 ? (entry.orders || 0) / maxOrders : 0;
                    const hue = 220;
                    const saturation = 60 + intensity * 30;
                    const lightness = 70 - intensity * 30;
                    return (
                      <Cell
                        key={i}
                        fill={`hsl(${hue}, ${saturation}%, ${lightness}%)`}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Heatmap - Hour vs Day */}
        {data?.heatmap?.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-red-500 text-lg">
                grid_on
              </span>
              Order Heatmap (Hour × Day)
            </h3>
            <div className="overflow-x-auto">
              <div className="min-w-[500px]">
                {/* Header */}
                <div className="grid grid-cols-[60px_repeat(7,1fr)] gap-1 mb-1">
                  <div></div>
                  {dayNames.map((day) => (
                    <div
                      key={day}
                      className="text-center text-[10px] font-bold text-gray-500"
                    >
                      {day}
                    </div>
                  ))}
                </div>
                {/* Rows */}
                {(() => {
                  const heatmapGrid = {};
                  let maxVal = 1;
                  (data.heatmap || []).forEach((cell) => {
                    const key = `${cell.hour}-${cell.day}`;
                    heatmapGrid[key] = cell.orders;
                    if (cell.orders > maxVal) maxVal = cell.orders;
                  });

                  const hours = [];
                  for (let h = 6; h <= 23; h++) hours.push(h);
                  for (let h = 0; h <= 5; h++) hours.push(h);

                  return hours.map((hour) => (
                    <div
                      key={hour}
                      className="grid grid-cols-[60px_repeat(7,1fr)] gap-1 mb-1"
                    >
                      <div className="text-[10px] text-gray-400 font-medium flex items-center">
                        {hour.toString().padStart(2, "0")}:00
                      </div>
                      {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                        const val = heatmapGrid[`${hour}-${day}`] || 0;
                        const intensity = val / maxVal;
                        return (
                          <div
                            key={day}
                            className="h-6 rounded-sm flex items-center justify-center text-[9px] font-bold transition-all"
                            style={{
                              backgroundColor:
                                val > 0
                                  ? `rgba(19, 236, 185, ${0.1 + intensity * 0.8})`
                                  : "#f9fafb",
                              color:
                                intensity > 0.5
                                  ? "#064e3b"
                                  : val > 0
                                    ? "#0fa883"
                                    : "#d1d5db",
                            }}
                            title={`${dayNames[day]} ${hour}:00 - ${val} orders`}
                          >
                            {val > 0 ? val : ""}
                          </div>
                        );
                      })}
                    </div>
                  ));
                })()}
                {/* Heatmap Legend */}
                <div className="flex items-center justify-end gap-2 mt-3">
                  <span className="text-[10px] text-gray-400">Less</span>
                  {[0.1, 0.3, 0.5, 0.7, 0.9].map((intensity, i) => (
                    <div
                      key={i}
                      className="w-4 h-4 rounded-sm"
                      style={{
                        backgroundColor: `rgba(19, 236, 185, ${intensity})`,
                      }}
                    />
                  ))}
                  <span className="text-[10px] text-gray-400">More</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Insight Card */}
        {peakHours.length > 0 && (
          <div className="bg-blue-50 rounded-2xl p-4 border border-blue-200">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-blue-600 text-xl">
                  lightbulb
                </span>
              </div>
              <div>
                <p className="text-sm font-bold text-blue-800">Insight</p>
                <p className="text-xs text-blue-600 mt-0.5">
                  Your busiest hour is{" "}
                  <strong>
                    {peakHours[0]?.hour}:00 - {peakHours[0]?.hour + 1}:00
                  </strong>{" "}
                  with {peakHours[0]?.orders} orders. Consider ensuring
                  sufficient driver availability during this window for faster
                  deliveries.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* No data state */}
        {(!hourlyData || hourlyData.length === 0) &&
          (!weekdayData || weekdayData.length === 0) && (
            <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-gray-100">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-3xl text-gray-400">
                  query_stats
                </span>
              </div>
              <p className="text-gray-500 font-medium">No analytics data yet</p>
              <p className="text-gray-400 text-sm mt-1">
                Time-based patterns will emerge after more orders are placed
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
