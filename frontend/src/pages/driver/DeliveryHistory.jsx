/**
 * Driver Delivery History Page
 *
 * Shows completed deliveries with:
 * - Order details
 * - Earnings
 * - Customer info
 * - Delivery times
 */

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import DriverLayout from "../../components/DriverLayout";

export default function DeliveryHistory() {
  const navigate = useNavigate();
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalDeliveries: 0,
    totalEarnings: 0,
    avgDeliveryTime: 0,
  });

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
  // FETCH DELIVERY HISTORY
  // ============================================================================

  const fetchHistory = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        "http://localhost:5000/driver/deliveries/history",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await response.json();
      if (response.ok) {
        setDeliveries(data.deliveries || []);

        // Calculate stats
        const completed = data.deliveries || [];
        const totalEarnings = completed.reduce(
          (sum, d) => sum + (parseFloat(d.total_amount) || 0),
          0
        );

        setStats({
          totalDeliveries: completed.length,
          totalEarnings: totalEarnings,
          avgDeliveryTime: 25, // Placeholder
        });
      }
    } catch (error) {
      console.error("Fetch history error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // ============================================================================
  // HELPERS
  // ============================================================================

  const formatDate = (timestamp) => {
    if (!timestamp) return "";
    return new Date(timestamp).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "delivered":
        return {
          label: "Delivered",
          bg: "bg-green-100",
          text: "text-green-700",
        };
      case "failed":
        return { label: "Failed", bg: "bg-red-100", text: "text-red-700" };
      default:
        return { label: status, bg: "bg-gray-100", text: "text-gray-700" };
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <DriverLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Header with Stats */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 lg:px-8 py-8">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold">Delivery History</h1>
            <p className="text-blue-100 mt-1">Your completed deliveries</p>

            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                <p className="text-blue-100 text-sm">Total Deliveries</p>
                <p className="text-2xl font-bold mt-1">
                  {stats.totalDeliveries}
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                <p className="text-blue-100 text-sm">Total Earnings</p>
                <p className="text-2xl font-bold mt-1">
                  Rs. {stats.totalEarnings.toFixed(0)}
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                <p className="text-blue-100 text-sm">Avg Time</p>
                <p className="text-2xl font-bold mt-1">
                  {stats.avgDeliveryTime} min
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Deliveries List */}
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-4 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-4">Loading history...</p>
            </div>
          ) : deliveries.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">📦</span>
              </div>
              <p className="text-xl font-medium text-gray-800">
                No deliveries yet
              </p>
              <p className="text-gray-500 mt-1">
                Complete your first delivery to see it here
              </p>
              <button
                onClick={() => navigate("/driver/deliveries")}
                className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg font-medium"
              >
                Find Deliveries
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {deliveries.map((delivery) => {
                const statusBadge = getStatusBadge(delivery.status);

                return (
                  <div
                    key={delivery.id}
                    className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
                  >
                    <div className="p-4">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-1 rounded-md text-xs font-medium ${statusBadge.bg} ${statusBadge.text}`}
                          >
                            {statusBadge.label}
                          </span>
                          <span className="text-sm text-gray-500">
                            #{delivery.order_number}
                          </span>
                        </div>
                        <span className="text-lg font-bold text-green-600">
                          Rs. {parseFloat(delivery.total_amount).toFixed(0)}
                        </span>
                      </div>

                      {/* Restaurant */}
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                          <span className="text-lg">🍽️</span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {delivery.restaurant_name}
                          </p>
                          <p className="text-sm text-gray-500">
                            {delivery.restaurant_address}
                          </p>
                        </div>
                      </div>

                      {/* Delivery Address */}
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                          <span className="text-lg">📍</span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {delivery.customer_name}
                          </p>
                          <p className="text-sm text-gray-500">
                            {delivery.delivery_address}
                          </p>
                        </div>
                      </div>

                      {/* Meta info */}
                      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            {formatDate(delivery.delivered_at)}
                          </span>
                          {delivery.distance_km && (
                            <span>
                              {parseFloat(delivery.distance_km).toFixed(1)} km
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DriverLayout>
  );
}
