import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import DriverLayout from "../../components/DriverLayout";

export default function DriverDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    activeDelivery: null,
    availableCount: 0,
    completedToday: 0,
    totalEarnings: 0,
  });
  const [loading, setLoading] = useState(true);

  // ============================================================================
  // AUTH CHECK
  // ============================================================================

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "driver") {
      navigate("/login");
    }
  }, [navigate]);

  // ============================================================================
  // FETCH DASHBOARD DATA
  // ============================================================================

  const fetchDashboard = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        console.error("No token found");
        setLoading(false);
        navigate("/login");
        return;
      }

      // Fetch active delivery
      const activeRes = await fetch(
        "http://localhost:5000/driver/deliveries/active",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (activeRes.status === 401 || activeRes.status === 403) {
        console.error("Authentication failed");
        localStorage.clear();
        navigate("/login");
        return;
      }

      const activeData = await activeRes.json();

      // Fetch available deliveries count
      const availableRes = await fetch(
        "http://localhost:5000/driver/deliveries/pending",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const availableData = await availableRes.json();

      // Calculate today's completed deliveries
    } catch (error) {
      console.error("Dashboard fetch error:", error);
      // Set empty stats on error so UI still renders
      setStats({
        activeDelivery: null,
        availableCount: 0,
        completedToday: 0,
        totalEarnings: 0,
      });
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <DriverLayout>
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50">
        {/* Animated Header with Gradient */}
        <div className="relative overflow-hidden bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 text-white px-4 lg:px-8 py-12 shadow-lg">
          {/* Animated background elements */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-0 -right-40 w-80 h-80 bg-white rounded-full animate-blob"></div>
            <div className="absolute -bottom-8 -left-40 w-80 h-80 bg-white rounded-full animate-blob animation-delay-2s"></div>
          </div>

          <div className="max-w-4xl mx-auto relative z-10">
            <div className="flex items-center justify-between">
              <div className="animate-fade-in">
                <p className="text-emerald-100 text-sm font-semibold tracking-widest uppercase">
                  Welcome Back
                </p>
                <h1 className="text-4xl font-black mt-2">Driver Dashboard</h1>
                <p className="text-emerald-100 mt-2 text-lg">
                  🚀 Ready to deliver great service?
                </p>
              </div>
              <div className="text-6xl animate-bounce hidden sm:block">📦</div>
            </div>
          </div>

          {/* Animated CSS */}
          <style>{`
            @keyframes blob {
              0%, 100% { transform: translate(0, 0) scale(1); }
              33% { transform: translate(30px, -50px) scale(1.1); }
              66% { transform: translate(-20px, 20px) scale(0.9); }
            }
            .animate-blob { animation: blob 7s infinite; }
            .animation-delay-2s { animation-delay: 2s; }
            @keyframes fade-in {
              from { opacity: 0; transform: translateY(10px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .animate-fade-in { animation: fade-in 0.6s ease-out; }
          `}</style>
        </div>

        {/* Content */}
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">
          {
            <>
              {/* Stats Grid with Animations */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Available Orders Card */}
                <div
                  className="group relative bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 p-6 border-2 border-transparent hover:border-emerald-400 transform hover:-translate-y-1 animate-fade-in"
                  style={{ animationDelay: "0.1s" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-transparent opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity"></div>
                  <div className="relative z-10">
                    <div className="inline-block p-3 bg-emerald-100 rounded-xl text-2xl">
                      📋
                    </div>
                    <p className="text-sm text-gray-600 font-semibold mt-3">
                      Available Orders
                    </p>
                    <p className="text-4xl font-black text-emerald-600 mt-2">
                      {stats.availableCount}
                    </p>
                    <p className="text-xs text-emerald-500 mt-2 font-semibold">
                      Ready to pick up
                    </p>
                  </div>
                </div>

                {/* Active Delivery Card */}
                <div
                  className="group relative bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 p-6 border-2 border-transparent hover:border-green-400 transform hover:-translate-y-1 animate-fade-in"
                  style={{ animationDelay: "0.2s" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-green-50 to-transparent opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity"></div>
                  <div className="relative z-10">
                    <div className="inline-block p-3 bg-green-100 rounded-xl text-2xl">
                      🚗
                    </div>
                    <p className="text-sm text-gray-600 font-semibold mt-3">
                      Active Delivery
                    </p>
                    <p className="text-4xl font-black text-green-600 mt-2">
                      {stats.activeDelivery ? "1" : "0"}
                    </p>
                    <p className="text-xs text-green-500 mt-2 font-semibold">
                      In progress
                    </p>
                  </div>
                </div>

                {/* Completed Today Card */}
                <div
                  className="group relative bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 p-6 border-2 border-transparent hover:border-teal-400 transform hover:-translate-y-1 animate-fade-in"
                  style={{ animationDelay: "0.3s" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-teal-50 to-transparent opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity"></div>
                  <div className="relative z-10">
                    <div className="inline-block p-3 bg-teal-100 rounded-xl text-2xl">
                      ✅
                    </div>
                    <p className="text-sm text-gray-600 font-semibold mt-3">
                      Completed Today
                    </p>
                    <p className="text-4xl font-black text-teal-600 mt-2">
                      {stats.completedToday}
                    </p>
                    <p className="text-xs text-teal-500 mt-2 font-semibold">
                      Great job!
                    </p>
                  </div>
                </div>

                {/* Earnings Card */}
                <div
                  className="group relative bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 p-6 border-2 border-transparent hover:border-emerald-500 transform hover:-translate-y-1 animate-fade-in"
                  style={{ animationDelay: "0.4s" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-transparent opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity"></div>
                  <div className="relative z-10">
                    <div className="inline-block p-3 bg-emerald-100 rounded-xl text-2xl">
                      💰
                    </div>
                    <p className="text-sm text-gray-600 font-semibold mt-3">
                      Today's Earnings
                    </p>
                    <p className="text-4xl font-black text-emerald-700 mt-2">
                      Rs. {stats.totalEarnings.toFixed(0)}
                    </p>
                    <p className="text-xs text-emerald-600 mt-2 font-semibold">
                      Keep it up!
                    </p>
                  </div>
                </div>
              </div>

              {/* Active Delivery Card - Premium Design */}
              {stats.activeDelivery && (
                <div
                  className="relative mb-8 overflow-hidden rounded-2xl shadow-lg animate-fade-in"
                  style={{ animationDelay: "0.5s" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600"></div>
                  <div className="absolute inset-0 opacity-10">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-white rounded-full -mr-20 -mt-20"></div>
                  </div>

                  <div className="relative p-8 text-white">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                      <div className="flex items-start gap-4">
                        <div className="text-5xl">🚀</div>
                        <div>
                          <p className="text-emerald-100 text-sm font-semibold uppercase tracking-wider">
                            Active Delivery
                          </p>
                          <p className="font-black text-2xl mt-1">
                            Order #{stats.activeDelivery.order_number}
                          </p>
                          <p className="text-emerald-100 mt-2 text-sm">
                            📍 {stats.activeDelivery.restaurant_name}
                          </p>
                          <div className="mt-3 flex gap-2">
                            <span className="inline-block px-3 py-1 bg-white bg-opacity-20 rounded-full text-xs font-semibold">
                              Status: In Progress
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => navigate("/driver/delivery/active")}
                        className="bg-white text-emerald-600 px-8 py-3 rounded-xl font-bold hover:shadow-xl hover:scale-105 transition-all duration-300 whitespace-nowrap inline-flex items-center gap-2"
                      >
                        <span>View Route</span>
                        <span className="text-lg">→</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {/* Quick Actions - Modern Cards */}
              <div className="mb-8">
                <h2 className="text-2xl font-black text-gray-800 mb-6">
                  Quick Actions
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <button
                    onClick={() => navigate("/driver/deliveries")}
                    className="group relative bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 p-6 border-2 border-transparent hover:border-emerald-400 transform hover:-translate-y-1 animate-fade-in"
                    style={{ animationDelay: "0.6s" }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-transparent opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity"></div>
                    <div className="relative z-10 text-center">
                      <div className="text-4xl mb-2">📦</div>
                      <p className="font-bold text-gray-800">Find Deliveries</p>
                      <p className="text-sm text-emerald-600 font-semibold mt-2">
                        {stats.availableCount} available
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={() => navigate("/driver/notifications")}
                    className="group relative bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 p-6 border-2 border-transparent hover:border-green-400 transform hover:-translate-y-1 animate-fade-in"
                    style={{ animationDelay: "0.7s" }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-green-50 to-transparent opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity"></div>
                    <div className="relative z-10 text-center">
                      <div className="text-4xl mb-2 animate-bounce">🔔</div>
                      <p className="font-bold text-gray-800">Notifications</p>
                      <p className="text-sm text-green-600 font-semibold mt-2">
                        Stay updated
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={() => navigate("/driver/history")}
                    className="group relative bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 p-6 border-2 border-transparent hover:border-teal-400 transform hover:-translate-y-1 animate-fade-in"
                    style={{ animationDelay: "0.8s" }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-teal-50 to-transparent opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity"></div>
                    <div className="relative z-10 text-center">
                      <div className="text-4xl mb-2">📋</div>
                      <p className="font-bold text-gray-800">History</p>
                      <p className="text-sm text-teal-600 font-semibold mt-2">
                        View past orders
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={() => navigate("/driver/profile")}
                    className="group relative bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 p-6 border-2 border-transparent hover:border-emerald-500 transform hover:-translate-y-1 animate-fade-in"
                    style={{ animationDelay: "0.9s" }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-transparent opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity"></div>
                    <div className="relative z-10 text-center">
                      <div className="text-4xl mb-2">👤</div>
                      <p className="font-bold text-gray-800">Profile</p>
                      <p className="text-sm text-emerald-600 font-semibold mt-2">
                        Your settings
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Tips Section - Beautiful Card */}
              <div
                className="relative overflow-hidden rounded-2xl shadow-md animate-fade-in"
                style={{ animationDelay: "1s" }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-90"></div>
                <div className="absolute inset-0 opacity-20">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-full -mr-16 -mt-16"></div>
                </div>
                <div className="relative p-8 text-white">
                  <div className="flex items-start gap-4">
                    <div className="text-4xl">💡</div>
                    <div>
                      <h3 className="font-black text-lg mb-3">
                        Pro Tips for Maximum Earnings
                      </h3>
                      <ul className="space-y-2 text-sm text-emerald-50">
                        <li className="flex items-center gap-2">
                          <span className="text-base">✓</span>
                          Keep location services enabled for accurate tracking
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-base">✓</span>
                          Update delivery status promptly for better ratings
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-base">✓</span>
                          Check notifications regularly for new order alerts
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </>
          }
        </div>
      </div>
    </DriverLayout>
  );
}
