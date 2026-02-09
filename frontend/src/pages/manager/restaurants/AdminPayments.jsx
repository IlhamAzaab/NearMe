import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

export default function AdminPayments() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restaurants, setRestaurants] = useState([]);
  const [summary, setSummary] = useState({
    total_to_pay: 0,
    paid_today: 0,
    restaurant_count: 0,
  });
  const [searchQuery, setSearchQuery] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };

      const [summaryRes, restaurantsRes] = await Promise.all([
        fetch("http://localhost:5000/manager/admin-payments/summary", {
          headers,
        }),
        fetch("http://localhost:5000/manager/admin-payments/restaurants", {
          headers,
        }),
      ]);

      const summaryData = await summaryRes.json();
      const restaurantsData = await restaurantsRes.json();

      if (summaryData.success) setSummary(summaryData.summary);
      if (restaurantsData.success) setRestaurants(restaurantsData.restaurants);
    } catch (error) {
      console.error("Failed to fetch admin payments data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const filteredRestaurants = restaurants.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (r.name || "").toLowerCase().includes(q) ||
      (r.admin_email || "").toLowerCase().includes(q) ||
      (r.phone || "").includes(q)
    );
  });

  // Skeleton loader
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-64"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="h-32 bg-gray-200 rounded-xl"></div>
              <div className="h-32 bg-gray-200 rounded-xl"></div>
              <div className="h-32 bg-gray-200 rounded-xl"></div>
            </div>
            <div className="h-12 bg-gray-200 rounded-xl"></div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Admin Payments</h1>
          <button
            onClick={handleRefresh}
            className={`p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all ${refreshing ? "animate-spin" : ""}`}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Total to Pay */}
          <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-6 border border-red-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-red-500 rounded-lg">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
              <span className="text-sm font-medium text-red-600">
                Total to Pay
              </span>
            </div>
            <p className="text-3xl font-bold text-red-700">
              Rs.{summary.total_to_pay?.toFixed(2)}
            </p>
            <p className="text-xs text-red-500 mt-2">
              {summary.restaurant_count} restaurant
              {summary.restaurant_count !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Paid Today */}
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-500 rounded-lg">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <span className="text-sm font-medium text-green-600">
                Paid Today
              </span>
            </div>
            <p className="text-3xl font-bold text-green-700">
              Rs.{summary.paid_today?.toFixed(2)}
            </p>
            <p className="text-xs text-green-500 mt-2">
              Transfers completed today
            </p>
          </div>

          {/* Balance */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-500 rounded-lg">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <span className="text-sm font-medium text-blue-600">
                Balance to Pay
              </span>
            </div>
            <p className="text-3xl font-bold text-blue-700">
              Rs.{summary.total_to_pay?.toFixed(2)}
            </p>
            <p className="text-xs text-blue-500 mt-2">
              Remaining balance (Total - Total Paid)
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search restaurants..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Restaurant List */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-800">
              Restaurants ({filteredRestaurants.length})
            </h2>
          </div>

          {filteredRestaurants.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </div>
              <p className="text-gray-600">
                {searchQuery
                  ? "No restaurants match your search"
                  : "No restaurants found"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredRestaurants.map((restaurant) => (
                <button
                  key={restaurant.id}
                  onClick={() =>
                    navigate(`/manager/admin-payments/${restaurant.id}`)
                  }
                  className="w-full px-6 py-4 hover:bg-gray-50 transition-colors text-left flex items-center gap-4"
                >
                  {/* Restaurant Logo */}
                  <div className="flex-shrink-0">
                    {restaurant.logo_url ? (
                      <img
                        src={restaurant.logo_url}
                        alt={restaurant.name}
                        className="w-14 h-14 rounded-full object-cover border-2 border-gray-200"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center border-2 border-gray-200">
                        <span className="text-xl font-bold text-blue-600">
                          {restaurant.name?.charAt(0)?.toUpperCase() || "R"}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Restaurant Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-800 truncate">
                      {restaurant.name}
                    </h3>
                    <p className="text-sm text-gray-600 truncate">
                      {restaurant.admin_email || "No admin email"}
                    </p>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-xs text-gray-500">
                        {restaurant.order_count || 0} orders
                      </span>
                      <span className="text-xs text-gray-500">
                        Earned: Rs.{restaurant.total_earnings?.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Withdrawal Balance */}
                  <div className="flex-shrink-0 text-right">
                    <div
                      className={`text-lg font-bold ${
                        restaurant.withdrawal_balance > 0
                          ? "text-red-600"
                          : "text-green-600"
                      }`}
                    >
                      Rs.{restaurant.withdrawal_balance?.toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500">Balance</div>
                  </div>

                  {/* Arrow */}
                  <svg
                    className="w-5 h-5 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
