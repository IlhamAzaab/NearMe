import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import DriverLayout from "../../components/DriverLayout";
import { API_URL } from "../../config";

export default function DeliveryHistory() {
  const navigate = useNavigate();
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalDeliveries: 0,
    totalEarnings: 0,
    averageRating: 0,
  });
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "driver") {
      navigate("/login");
    }
    fetchHistory();
  }, [navigate]);

  const fetchHistory = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${API_URL}/driver/deliveries/history`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const data = await response.json();
      if (response.ok) {
        setDeliveries(data.deliveries || []);

        const completed = data.deliveries || [];
        const totalEarnings = completed.reduce(
          (sum, d) => sum + (parseFloat(d.driver_earnings) || 0),
          0,
        );

        setStats({
          totalDeliveries: completed.length,
          totalEarnings: totalEarnings.toFixed(2),
          averageRating: 4.8,
        });
      }
    } catch (error) {
      console.error("Fetch history error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredDeliveries =
    filterStatus === "all"
      ? deliveries
      : deliveries.filter((d) => d.status === filterStatus);

  if (loading) {
    return (
      <DriverLayout>
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-emerald-600"></div>
            <p className="mt-4 text-gray-600 font-semibold">
              Loading your history...
            </p>
          </div>
        </div>
      </DriverLayout>
    );
  }

  return (
    <DriverLayout>
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50">
        {/* Premium Header */}
        <div className="relative overflow-hidden bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 text-white px-4 lg:px-8 py-12 shadow-xl">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-0 -right-40 w-80 h-80 bg-white rounded-full animate-blob"></div>
            <div
              className="absolute -bottom-8 -left-40 w-80 h-80 bg-white rounded-full animate-blob"
              style={{ animationDelay: "2s" }}
            ></div>
          </div>

          <div className="max-w-5xl mx-auto relative z-10">
            <div className="flex items-center justify-between">
              <div className="animate-fade-in">
                <p className="text-emerald-100 text-sm font-semibold tracking-widest uppercase">
                  📊 Your Performance
                </p>
                <h1 className="text-4xl font-black mt-2">Delivery History</h1>
                <p className="text-emerald-100 mt-2 text-lg">
                  Track your completed deliveries and earnings
                </p>
              </div>
              <div className="text-6xl animate-bounce hidden sm:block">🏆</div>
            </div>
          </div>

          <style>{`
            @keyframes blob {
              0%, 100% { transform: translate(0, 0) scale(1); }
              33% { transform: translate(30px, -50px) scale(1.1); }
              66% { transform: translate(-20px, 20px) scale(0.9); }
            }
            .animate-blob { animation: blob 7s infinite; }
            @keyframes fade-in {
              from { opacity: 0; transform: translateY(10px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .animate-fade-in { animation: fade-in 0.6s ease-out; }
            @keyframes slide-in {
              from { opacity: 0; transform: translateX(-20px); }
              to { opacity: 1; transform: translateX(0); }
            }
            .animate-slide-in { animation: slide-in 0.5s ease-out forwards; }
            .history-item-delay-0 { animation-delay: 0.1s; }
            .history-item-delay-1 { animation-delay: 0.2s; }
            .history-item-delay-2 { animation-delay: 0.3s; }
            .history-item-delay-3 { animation-delay: 0.4s; }
            .history-item-delay-4 { animation-delay: 0.5s; }
          `}</style>
        </div>

        {/* Content */}
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="group relative bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 p-6 border-2 border-transparent hover:border-emerald-400 transform hover:-translate-y-1 animate-fade-in">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-transparent opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity"></div>
              <div className="relative z-10">
                <div className="inline-block p-3 bg-emerald-100 rounded-xl text-2xl">
                  🚚
                </div>
                <p className="text-sm text-gray-600 font-semibold mt-3">
                  Total Deliveries
                </p>
                <p className="text-4xl font-black text-emerald-600 mt-2">
                  {stats.totalDeliveries}
                </p>
                <p className="text-xs text-emerald-500 mt-2 font-semibold">
                  Completed
                </p>
              </div>
            </div>

            <div
              className="group relative bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 p-6 border-2 border-transparent hover:border-green-400 transform hover:-translate-y-1 animate-fade-in"
              style={{ animationDelay: "0.1s" }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-green-50 to-transparent opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity"></div>
              <div className="relative z-10">
                <div className="inline-block p-3 bg-green-100 rounded-xl text-2xl">
                  💰
                </div>
                <p className="text-sm text-gray-600 font-semibold mt-3">
                  Total Earnings
                </p>
                <p className="text-4xl font-black text-green-600 mt-2">
                  Rs. {stats.totalEarnings}
                </p>
                <p className="text-xs text-green-500 mt-2 font-semibold">
                  Your commission
                </p>
              </div>
            </div>

            <div
              className="group relative bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 p-6 border-2 border-transparent hover:border-teal-400 transform hover:-translate-y-1 animate-fade-in"
              style={{ animationDelay: "0.2s" }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-teal-50 to-transparent opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity"></div>
              <div className="relative z-10">
                <div className="inline-block p-3 bg-teal-100 rounded-xl text-2xl">
                  ⭐
                </div>
                <p className="text-sm text-gray-600 font-semibold mt-3">
                  Avg. Rating
                </p>
                <p className="text-4xl font-black text-teal-600 mt-2">
                  {stats.averageRating}
                </p>
                <p className="text-xs text-teal-500 mt-2 font-semibold">
                  Great job!
                </p>
              </div>
            </div>
          </div>

          {/* Filter Buttons */}
          <div className="flex gap-3 mb-6 overflow-x-auto pb-2">
            <button
              onClick={() => setFilterStatus("all")}
              className={`px-6 py-2 rounded-full font-bold whitespace-nowrap transition-all duration-300 ${
                filterStatus === "all"
                  ? "bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-lg"
                  : "bg-white text-gray-700 border-2 border-gray-200 hover:border-emerald-400"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterStatus("delivered")}
              className={`px-6 py-2 rounded-full font-bold whitespace-nowrap transition-all duration-300 ${
                filterStatus === "delivered"
                  ? "bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-lg"
                  : "bg-white text-gray-700 border-2 border-gray-200 hover:border-emerald-400"
              }`}
            >
              ✅ Delivered
            </button>
            <button
              onClick={() => setFilterStatus("cancelled")}
              className={`px-6 py-2 rounded-full font-bold whitespace-nowrap transition-all duration-300 ${
                filterStatus === "cancelled"
                  ? "bg-gradient-to-r from-red-600 to-pink-600 text-white shadow-lg"
                  : "bg-white text-gray-700 border-2 border-gray-200 hover:border-red-400"
              }`}
            >
              ❌ Cancelled
            </button>
          </div>

          {/* Delivery List */}
          {filteredDeliveries.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl shadow-md">
              <div className="text-6xl mb-4">📭</div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">
                No Deliveries
              </h3>
              <p className="text-gray-500 text-lg">
                Start accepting deliveries to see your history
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredDeliveries.map((delivery, idx) => (
                <HistoryCard
                  key={delivery.id}
                  delivery={delivery}
                  animationDelay={idx}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </DriverLayout>
  );
}

function HistoryCard({ delivery, animationDelay }) {
  const {
    id,
    order_id,
    status,
    delivered_at,
    orders,
    driver_earnings = 0,
  } = delivery;

  const formatDate = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "delivered":
        return {
          bg: "bg-emerald-50",
          border: "border-emerald-300",
          text: "text-emerald-700",
          icon: "✅",
        };
      case "cancelled":
        return {
          bg: "bg-red-50",
          border: "border-red-300",
          text: "text-red-700",
          icon: "❌",
        };
      default:
        return {
          bg: "bg-gray-50",
          border: "border-gray-300",
          text: "text-gray-700",
          icon: "⏳",
        };
    }
  };

  const statusColor = getStatusColor(status);

  return (
    <div
      className={`bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 border-2 border-gray-100 hover:border-emerald-300 p-6 animate-slide-in history-item-delay-${animationDelay % 5}`}
      style={{ opacity: 0 }}
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Left Side - Order Info */}
        <div className="flex-1">
          <div className="flex items-start gap-4">
            <div
              className={`px-4 py-3 rounded-xl ${statusColor.bg} border-2 ${statusColor.border}`}
            >
              <span className="text-2xl">{statusColor.icon}</span>
            </div>
            <div>
              <h3 className="font-black text-lg text-gray-800">
                Order #{orders?.order_number || id}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                📍 {orders?.restaurant_name || "Restaurant"}
              </p>
              <p className="text-sm text-gray-600">
                👤 {orders?.customer_name || "Customer"}
              </p>
              <p className={`text-xs font-bold mt-2 ${statusColor.text}`}>
                {status === "delivered"
                  ? `Delivered on ${formatDate(delivered_at)}`
                  : `${status.charAt(0).toUpperCase() + status.slice(1)}`}
              </p>
            </div>
          </div>
        </div>

        {/* Right Side - Earnings & Action */}
        <div className="flex items-center justify-between md:flex-col md:text-right gap-4 md:gap-2">
          <div>
            <p className="text-sm text-gray-600 font-semibold">Your Earning</p>
            <p className="text-3xl font-black text-emerald-600">
              Rs. {driver_earnings}
            </p>
          </div>
          <button
            onClick={() => {
              // Could navigate to order details
            }}
            className="px-6 py-2 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-lg font-bold hover:shadow-lg transition-all duration-300 whitespace-nowrap"
          >
            View Details
          </button>
        </div>
      </div>
    </div>
  );
}
