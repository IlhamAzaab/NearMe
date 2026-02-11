import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import ManagerPageLayout from "../../components/ManagerPageLayout";
import { ManagerPageSkeleton } from "../../components/ManagerSkeleton";

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [stats, setStats] = useState({
    pendingDeposits: 0,
    pendingAmount: 0,
    totalDrivers: 0,
    activeOrders: 0,
    todaySales: 0,
  });
  const [recentActivity, setRecentActivity] = useState([]);

  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    else setRefreshing(true);

    try {
      const token = localStorage.getItem("token");

      // Fetch deposit summary
      const res = await fetch(
        "http://localhost:5000/driver/deposits/manager/summary",
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json();

      if (data.success) {
        setStats({
          pendingDeposits: data.summary.pending_deposits_count || 0,
          pendingAmount: data.summary.pending || 0,
          totalDrivers: 0,
          activeOrders: 0,
          todaySales: data.summary.todays_sales || 0,
        });
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    fetchData(false);
  }, [fetchData]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const email = localStorage.getItem("userEmail");
    const role = localStorage.getItem("role");

    if (!token || (role !== "manager" && role !== "admin")) {
      navigate("/login");
      return;
    }

    setUserEmail(email || "");
    if (email) {
      const name = email.split("@")[0];
      setUserName(name.charAt(0).toUpperCase() + name.slice(1));
    }

    fetchData(true);
  }, [navigate, fetchData]);

  const formatCurrency = (value) => `Rs.${Number(value || 0).toFixed(2)}`;

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
      title="Manager Dashboard"
      onRefresh={handleRefresh}
      refreshing={refreshing}
      hideSidebar
    >
      {/* Main Content */}
      <div className="lg:grid lg:grid-cols-12 lg:gap-6 lg:p-6">
        {/* Left Column - Mobile & Desktop */}
        <div className="lg:col-span-8 space-y-4 p-4 lg:p-0">
          {/* Welcome Hero */}
          <div className="bg-gradient-to-br from-[#13ecb9] to-[#0fa883] rounded-xl p-6 shadow-lg shadow-[#13ecb9]/20 relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-10 pointer-events-none"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 2px 2px, black 1px, transparent 0)",
                backgroundSize: "24px 24px",
              }}
            ></div>
            <div className="relative z-10">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[#111816] text-sm font-semibold uppercase tracking-wider opacity-70">
                    Today's Sales
                  </p>
                  <h2 className="text-[#111816] text-4xl font-bold mt-2">
                    {formatCurrency(stats.todaySales)}
                  </h2>
                  <p className="text-[#111816] text-sm mt-2 opacity-80 lg:hidden">
                    Welcome back, {userName || "Manager"}
                  </p>
                </div>
                <div className="bg-white/30 p-3 rounded-xl">
                  <span className="material-symbols-outlined text-[#111816] text-3xl">
                    trending_up
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-3 lg:gap-4">
            <div
              onClick={() => navigate("/manager/deposits")}
              className="bg-white rounded-xl p-4 border border-[#dbe6e3] cursor-pointer hover:shadow-md hover:border-[#13ecb9] transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                  <span className="material-symbols-outlined text-amber-600 text-lg">
                    pending_actions
                  </span>
                </div>
              </div>
              <p className="text-[#618980] text-xs font-medium uppercase tracking-wider">
                Pending Deposits
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-[#111816] text-2xl font-bold">
                  {stats.pendingDeposits}
                </p>
                {stats.pendingDeposits > 0 && (
                  <span className="text-amber-600 text-xs font-medium">
                    Action needed
                  </span>
                )}
              </div>
            </div>

            <div
              onClick={() => navigate("/manager/deposits")}
              className="bg-white rounded-xl p-4 border border-[#dbe6e3] cursor-pointer hover:shadow-md hover:border-[#13ecb9] transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                  <span className="material-symbols-outlined text-red-600 text-lg">
                    account_balance_wallet
                  </span>
                </div>
              </div>
              <p className="text-[#618980] text-xs font-medium uppercase tracking-wider">
                Pending Amount
              </p>
              <p className="text-[#111816] text-xl font-bold mt-1">
                {formatCurrency(stats.pendingAmount)}
              </p>
            </div>

            <div className="bg-white rounded-xl p-4 border border-[#dbe6e3]">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-[#13ecb9]/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#13ecb9] text-lg">
                    payments
                  </span>
                </div>
              </div>
              <p className="text-[#618980] text-xs font-medium uppercase tracking-wider">
                Today's Sales
              </p>
              <p className="text-[#111816] text-xl font-bold mt-1">
                {formatCurrency(stats.todaySales)}
              </p>
            </div>

            <div className="bg-white rounded-xl p-4 border border-[#dbe6e3]">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <span className="material-symbols-outlined text-blue-600 text-lg">
                    local_shipping
                  </span>
                </div>
              </div>
              <p className="text-[#618980] text-xs font-medium uppercase tracking-wider">
                Active Orders
              </p>
              <p className="text-[#111816] text-2xl font-bold mt-1">
                {stats.activeOrders}
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mt-4">
            <h3 className="text-[#111816] text-base font-bold mb-3 px-1">
              Quick Actions
            </h3>
            <div className="space-y-3">
              <div
                onClick={() => navigate("/manager/deposits")}
                className="bg-white rounded-xl p-4 border border-[#dbe6e3] cursor-pointer hover:shadow-md hover:border-[#13ecb9] transition-all active:scale-[0.99] flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#13ecb9] to-[#0fa883] flex items-center justify-center shadow-lg shadow-[#13ecb9]/20">
                  <span className="material-symbols-outlined text-white text-2xl">
                    receipt_long
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-[#111816] font-bold">Manage Deposits</p>
                  <p className="text-[#618980] text-sm">
                    Review and approve driver deposits
                  </p>
                </div>
                <span className="material-symbols-outlined text-[#618980]">
                  chevron_right
                </span>
              </div>

              <div
                onClick={() => navigate("/manager/reports")}
                className="bg-white rounded-xl p-4 border border-[#dbe6e3] cursor-pointer hover:shadow-md hover:border-[#13ecb9] transition-all active:scale-[0.99] flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <span className="material-symbols-outlined text-white text-2xl">
                    analytics
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-[#111816] font-bold">View Reports</p>
                  <p className="text-[#618980] text-sm">
                    Analytics & performance
                  </p>
                </div>
                <span className="material-symbols-outlined text-[#618980]">
                  chevron_right
                </span>
              </div>

              <div
                onClick={() => navigate("/manager/deposits")}
                className="bg-white rounded-xl p-4 border border-[#dbe6e3] cursor-pointer hover:shadow-md hover:border-[#13ecb9] transition-all active:scale-[0.99] flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-xl bg-purple-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
                  <span className="material-symbols-outlined text-white text-2xl">
                    group
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-[#111816] font-bold">Manage Drivers</p>
                  <p className="text-[#618980] text-sm">
                    Driver management & payments
                  </p>
                </div>
                <span className="material-symbols-outlined text-[#618980]">
                  chevron_right
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Desktop Only */}
        <div className="hidden lg:block lg:col-span-4 space-y-4">
          <div className="bg-white rounded-xl border border-[#dbe6e3] p-4">
            <h3 className="text-[#111816] text-base font-bold mb-4">
              Recent Activity
            </h3>
            {recentActivity.length === 0 ? (
              <div className="py-8 text-center">
                <span className="material-symbols-outlined text-4xl text-[#dbe6e3]">
                  history
                </span>
                <p className="text-[#618980] text-sm mt-2">
                  No recent activity
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((activity, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 py-2 border-b border-[#dbe6e3] last:border-0"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#13ecb9]/10 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[#13ecb9] text-sm">
                        check_circle
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="text-[#111816] text-sm font-medium">
                        {activity.title}
                      </p>
                      <p className="text-[#618980] text-xs">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-blue-600">
                lightbulb
              </span>
              <h3 className="text-blue-800 text-base font-bold">Quick Tips</h3>
            </div>
            <ul className="space-y-2 text-sm text-blue-700">
              <li className="flex items-start gap-2">
                <span className="material-symbols-outlined text-blue-500 text-sm mt-0.5">
                  check
                </span>
                Review pending deposits daily
              </li>
              <li className="flex items-start gap-2">
                <span className="material-symbols-outlined text-blue-500 text-sm mt-0.5">
                  check
                </span>
                Verify proof images carefully
              </li>
              <li className="flex items-start gap-2">
                <span className="material-symbols-outlined text-blue-500 text-sm mt-0.5">
                  check
                </span>
                Add notes for rejected deposits
              </li>
            </ul>
          </div>
        </div>
      </div>
    </ManagerPageLayout>
  );
};

export default Dashboard;
