import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../../config";
import ManagerPageLayout from "../../components/ManagerPageLayout";
import { ManagerPageSkeleton } from "../../components/ManagerSkeleton";

const MANAGER_COUNT = 2; // Split earnings equally between 2 managers

const periodOptions = [
  { key: "daily", label: "Today" },
  { key: "weekly", label: "This Week" },
  { key: "monthly", label: "This Month" },
  { key: "all", label: "All Time" },
];

const ManagerAccount = () => {
  const navigate = useNavigate();
  const [managerInfo, setManagerInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [earningsLoading, setEarningsLoading] = useState(true);
  const [period, setPeriod] = useState("daily");
  const [earnings, setEarnings] = useState(null);

  // Fetch manager profile
  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");
    if (!token || role !== "manager") {
      navigate("/login");
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_URL}/manager/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && data?.manager) {
          setManagerInfo(data.manager);
        }
      } catch (_) {}
      setLoading(false);
    })();
  }, [navigate]);

  // Fetch earnings summary
  const fetchEarnings = useCallback(async () => {
    setEarningsLoading(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const res = await fetch(
        `${API_URL}/manager/earnings/summary?period=${period}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (res.ok) {
        const data = await res.json();
        setEarnings(data.summary);
      }
    } catch (err) {
      console.error("Failed to fetch earnings:", err);
    } finally {
      setEarningsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchEarnings();
  }, [fetchEarnings]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("role");
    navigate("/login");
  };

  const formatCurrency = (value) =>
    `Rs.${Number(value || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const totalEarning = earnings?.total_earning || 0;
  const myEarning = totalEarning / MANAGER_COUNT;

  const periodLabel =
    periodOptions.find((p) => p.key === period)?.label || "Today";

  if (loading) {
    return <ManagerPageSkeleton type="deposits" />;
  }

  return (
    <ManagerPageLayout
      title="My Account"
      onRefresh={fetchEarnings}
      refreshing={earningsLoading}
      hideSidebar
    >
      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {/* Profile Card */}
        <div className="bg-gradient-to-br from-[#064e3b] to-[#065f46] rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/15 flex items-center justify-center text-white text-2xl font-bold shadow-inner">
              {managerInfo?.username?.charAt(0)?.toUpperCase() || "M"}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-white text-xl font-extrabold truncate">
                {managerInfo?.username || "Manager"}
              </h2>
              <p className="text-emerald-200/70 text-sm truncate">
                {managerInfo?.email || "—"}
              </p>
              {managerInfo?.mobile_number && (
                <p className="text-emerald-200/50 text-xs mt-0.5">
                  {managerInfo.mobile_number}
                </p>
              )}
              <span className="inline-block mt-2 px-2.5 py-0.5 bg-white/10 text-emerald-200 text-[10px] font-bold uppercase tracking-widest rounded-full">
                Manager
              </span>
            </div>
          </div>
        </div>

        {/* ===== My Earnings Section ===== */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
              My Earnings
            </h3>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Your share (1/{MANAGER_COUNT} of total manager earnings)
            </p>
          </div>

          {/* Period Selector */}
          <div className="px-4 pb-3">
            <div className="flex gap-2 overflow-x-auto hide-scrollbar">
              {periodOptions.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    period === p.key
                      ? "bg-[#13ecb9] text-[#111816] shadow-md"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {earningsLoading ? (
            <div className="px-4 pb-4">
              <div className="animate-pulse space-y-3">
                <div className="h-16 bg-gray-100 rounded-xl" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="h-20 bg-gray-100 rounded-xl" />
                  <div className="h-20 bg-gray-100 rounded-xl" />
                </div>
              </div>
            </div>
          ) : (
            <div className="px-4 pb-4 space-y-3">
              {/* My Earnings Hero */}
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-100">
                <div className="text-center">
                  <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest mb-1">
                    {periodLabel} — My Share
                  </p>
                  <p className="text-3xl font-extrabold text-emerald-700">
                    {formatCurrency(myEarning)}
                  </p>
                </div>
              </div>

              {/* Breakdown */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                    Total Earnings
                  </p>
                  <p className="text-lg font-extrabold text-gray-800 mt-1">
                    {formatCurrency(totalEarning)}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                    Delivered Orders
                  </p>
                  <p className="text-lg font-extrabold text-gray-800 mt-1">
                    {earnings?.delivered_orders || 0}
                  </p>
                </div>
              </div>

              {/* Formula */}
              <div className="bg-white rounded-xl p-3 border border-gray-200 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Collected</span>
                  <span className="font-medium text-gray-800">
                    {formatCurrency(earnings?.total_collected || 0)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-amber-600">− Restaurant Pay</span>
                  <span className="font-medium text-amber-600">
                    {formatCurrency(earnings?.admin_total || 0)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-sky-600">− Driver Earnings</span>
                  <span className="font-medium text-sky-600">
                    {formatCurrency(earnings?.total_driver_earnings || 0)}
                  </span>
                </div>
                <div className="h-px bg-gray-200" />
                <div className="flex justify-between text-sm">
                  <span className="font-bold text-gray-800">
                    Manager Earnings
                  </span>
                  <span className="font-bold text-gray-800">
                    {formatCurrency(totalEarning)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">
                    ÷ {MANAGER_COUNT} managers
                  </span>
                  <span className="font-extrabold text-emerald-700">
                    {formatCurrency(myEarning)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
              Quick Links
            </h3>
          </div>

          <button
            onClick={() => navigate("/manager/earnings")}
            className="w-full px-4 py-3 flex items-center justify-between border-b border-gray-50 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-blue-600 text-lg">
                  bar_chart
                </span>
              </div>
              <span className="text-sm font-semibold text-gray-800">
                Detailed Earnings
              </span>
            </div>
            <span className="material-symbols-outlined text-gray-400 text-lg">
              chevron_right
            </span>
          </button>

          <button
            onClick={() => navigate("/manager/deposits")}
            className="w-full px-4 py-3 flex items-center justify-between border-b border-gray-50 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-emerald-600 text-lg">
                  account_balance_wallet
                </span>
              </div>
              <span className="text-sm font-semibold text-gray-800">
                Manage Deposits
              </span>
            </div>
            <span className="material-symbols-outlined text-gray-400 text-lg">
              chevron_right
            </span>
          </button>

          <button
            onClick={() => navigate("/manager/reports")}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-purple-600 text-lg">
                  assessment
                </span>
              </div>
              <span className="text-sm font-semibold text-gray-800">
                View Reports
              </span>
            </div>
            <span className="material-symbols-outlined text-gray-400 text-lg">
              chevron_right
            </span>
          </button>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="w-full bg-white rounded-2xl border border-red-100 shadow-sm p-4 flex items-center justify-center gap-2 hover:bg-red-50 transition-colors"
        >
          <span className="material-symbols-outlined text-red-500 text-xl">
            logout
          </span>
          <span className="text-red-600 font-bold text-sm">Logout</span>
        </button>

        {/* Version info */}
        <p className="text-center text-[10px] text-gray-300 font-medium pb-4">
          NearMe Manager v1.0
        </p>
      </div>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </ManagerPageLayout>
  );
};

export default ManagerAccount;
