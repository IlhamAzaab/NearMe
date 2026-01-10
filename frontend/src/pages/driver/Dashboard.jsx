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

      // Fetch active delivery
      const activeRes = await fetch(
        "http://localhost:5000/driver/deliveries/active",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const activeData = await activeRes.json();

      // Fetch available deliveries count
      const availableRes = await fetch(
        "http://localhost:5000/driver/deliveries/available",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const availableData = await availableRes.json();

      // Fetch history for today's stats
      const historyRes = await fetch(
        "http://localhost:5000/driver/deliveries/history",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const historyData = await historyRes.json();

      // Calculate today's completed deliveries
      const today = new Date().toDateString();
      const todayDeliveries = (historyData.deliveries || []).filter(
        (d) => new Date(d.delivered_at).toDateString() === today
      );

      const totalEarnings = todayDeliveries.reduce(
        (sum, d) => sum + (parseFloat(d.total_amount) || 0),
        0
      );

      setStats({
        activeDelivery: activeData.delivery || null,
        availableCount: (availableData.deliveries || []).length,
        completedToday: todayDeliveries.length,
        totalEarnings: totalEarnings,
      });
    } catch (error) {
      console.error("Dashboard fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <DriverLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 lg:px-8 py-8">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold">Driver Dashboard</h1>
            <p className="text-blue-100 mt-1">
              Welcome back! Here's your overview.
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-4 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-4">Loading...</p>
            </div>
          ) : (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-xl shadow-sm p-4">
                  <p className="text-sm text-gray-500">Available Orders</p>
                  <p className="text-2xl font-bold text-blue-600 mt-1">
                    {stats.availableCount}
                  </p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-4">
                  <p className="text-sm text-gray-500">Active Delivery</p>
                  <p className="text-2xl font-bold text-orange-600 mt-1">
                    {stats.activeDelivery ? "1" : "0"}
                  </p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-4">
                  <p className="text-sm text-gray-500">Completed Today</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">
                    {stats.completedToday}
                  </p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-4">
                  <p className="text-sm text-gray-500">Today's Earnings</p>
                  <p className="text-2xl font-bold text-gray-800 mt-1">
                    Rs. {stats.totalEarnings.toFixed(0)}
                  </p>
                </div>
              </div>

              {/* Active Delivery Card */}
              {stats.activeDelivery && (
                <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-4 mb-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-orange-100 text-sm">Active Delivery</p>
                      <p className="font-bold text-lg mt-1">
                        Order #{stats.activeDelivery.order_number}
                      </p>
                      <p className="text-sm text-orange-100 mt-1">
                        {stats.activeDelivery.restaurant_name}
                      </p>
                    </div>
                    <button
                      onClick={() => navigate("/driver/delivery/active")}
                      className="bg-white text-orange-600 px-4 py-2 rounded-lg font-medium"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
                <h2 className="font-semibold text-gray-800 mb-4">
                  Quick Actions
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => navigate("/driver/deliveries")}
                    className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <span className="text-xl">📦</span>
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-800">
                        Find Deliveries
                      </p>
                      <p className="text-sm text-gray-500">
                        {stats.availableCount} available
                      </p>
                    </div>
                  </button>
                  <button
                    onClick={() => navigate("/driver/notifications")}
                    className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
                  >
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                      <span className="text-xl">🔔</span>
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-800">Notifications</p>
                      <p className="text-sm text-gray-500">View updates</p>
                    </div>
                  </button>
                  <button
                    onClick={() => navigate("/driver/history")}
                    className="flex items-center gap-3 p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
                  >
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <span className="text-xl">📋</span>
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-800">History</p>
                      <p className="text-sm text-gray-500">Past deliveries</p>
                    </div>
                  </button>
                  <button
                    onClick={() => navigate("/driver/profile")}
                    className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                      <span className="text-xl">👤</span>
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-800">Profile</p>
                      <p className="text-sm text-gray-500">View settings</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Tips Section */}
              <div className="bg-blue-50 rounded-xl p-4">
                <h3 className="font-semibold text-blue-800 mb-2">💡 Tips</h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>
                    • Keep your location services enabled for accurate tracking
                  </li>
                  <li>• Update delivery status promptly for better ratings</li>
                  <li>• Check notifications for new order alerts</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </DriverLayout>
  );
}
