import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    totalProducts: 0,
    availableProducts: 0,
    activeCustomers: 0,
    todayOrders: 0,
    todayRevenue: 0,
    avgOrderValue: 0,
  });
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState("");
  const [slideIn, setSlideIn] = useState(false);
  const navigate = useNavigate();

  const token = localStorage.getItem("token");

  useEffect(() => {
    // Trigger slide-in animation
    setTimeout(() => setSlideIn(true), 50);

    // Set greeting based on time
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good Morning ☀️");
    else if (hour < 17) setGreeting("Good Afternoon 🌤️");
    else setGreeting("Good Evening 🌙");

    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    if (!token) return;

    setLoading(true);
    try {
      // Fetch stats
      const statsRes = await fetch("http://localhost:5000/admin/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const statsData = await statsRes.json();
      
      if (statsRes.ok && statsData.stats) {
        setStats(statsData.stats);
      }

      // Fetch recent orders
      const ordersRes = await fetch("http://localhost:5000/admin/orders?limit=5", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const ordersData = await ordersRes.json();
      
      if (ordersRes.ok && ordersData.orders) {
        setRecentOrders(ordersData.orders);
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ title, value, change, icon, color, delay }) => (
    <div 
      className={`bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-500 transform hover:-translate-y-2 hover:scale-105 p-4 sm:p-6 relative overflow-hidden group border border-green-100 ${delay ? `animate-fadeInUp` : ''}`}
      style={{ animationDelay: delay }}
    >
      {/* Animated background */}
      <div className={`absolute top-0 right-0 w-32 h-32 rounded-full bg-gradient-to-br from-green-50 to-green-100 opacity-50 -translate-y-16 translate-x-16 group-hover:scale-125 group-hover:opacity-70 transition-all duration-500`}></div>
      
      <div className="relative z-10">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm text-gray-600 font-semibold uppercase tracking-wide">{title}</p>
            <p className={`text-3xl font-bold mt-3 ${color} drop-shadow-sm`}>
              {title.includes("Revenue") || title.includes("Avg") ? "Rs. " : ""}{value.toLocaleString()}
            </p>
            {change !== 0 && (
              <p className="text-xs mt-2 flex items-center">
                <span className={`${change > 0 ? 'text-green-600' : 'text-red-600'} font-semibold`}>
                  {change > 0 ? '↗' : '↘'} {Math.abs(change)}%
                </span>
                <span className="text-gray-500 ml-2">vs last period</span>
              </p>
            )}
          </div>
          <div className={`p-4 rounded-xl bg-gradient-to-br ${color.replace('text-', 'from-').replace('-500', '-100')} to-orange-50 shadow-sm group-hover:scale-110 group-hover:shadow-md transition-all duration-500`}>
            {icon}
          </div>
        </div>
      </div>
    </div>
  );

  const StatusBadge = ({ status }) => {
    const colors = {
      Delivered: "bg-green-100 text-green-800",
      Preparing: "bg-blue-100 text-blue-800",
      Pending: "bg-yellow-100 text-yellow-800",
      "On the way": "bg-purple-100 text-purple-800",
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="min-h-screen bg-gradient-to-br from-green-50 via-green-50 to-green-100 animate-fadeIn">
          <div className="animate-pulse space-y-6 p-4 sm:p-6">
            <div className="h-8 bg-green-200/50 rounded w-1/2 sm:w-1/4"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-white/80 rounded-2xl shadow-sm"></div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="h-80 bg-white/80 rounded-2xl shadow-sm"></div>
              <div className="h-80 bg-white/80 rounded-2xl shadow-sm"></div>
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className={`min-h-screen bg-gradient-to-br from-green-50 via-green-50 to-green-100 transition-all duration-500 ease-in-out ${slideIn ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}>
        <div className="space-y-6 sm:space-y-8 p-4 sm:p-6 md:p-8">
          {/* Header with greeting */}
          <div className="flex flex-col gap-4 sm:gap-4 animate-slideDown">
            <div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold bg-gradient-to-r from-green-600 via-green-500 to-green-600 bg-clip-text text-transparent drop-shadow-sm">
                Dashboard
              </h1>
              <div className="flex items-center gap-2 sm:gap-3 mt-3">
                <p className="text-gray-700 text-lg font-medium">{greeting}</p>
                <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-lg shadow-green-500/50"></div>
                <p className="text-sm text-gray-600 font-medium">Restaurant is open</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
              <div className="px-4 sm:px-5 py-2.5 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-300 text-center">
                Today: {stats.todayOrders} orders
              </div>
              <button className="px-4 sm:px-5 py-2.5 bg-white border-2 border-green-200 text-gray-700 rounded-xl hover:bg-green-50 hover:border-green-300 transition-all duration-300 shadow-sm text-center">
                📅 {new Date().toLocaleDateString('en-IN')}
              </button>
            </div>
          </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Total Orders"
            value={stats.totalOrders}
            change={0}
            color="text-blue-500"
            delay="0s"
            icon={
              <svg className="w-7 h-7 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            }
          />
          <StatCard
            title="Total Revenue"
            value={stats.totalRevenue}
            change={0}
            color="text-green-500"
            delay="0.1s"
            icon={
              <svg className="w-7 h-7 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            title="Active Customers"
            value={stats.activeCustomers}
            change={0}
            color="text-purple-500"
            delay="0.2s"
            icon={
              <svg className="w-7 h-7 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5 1.5c0 .276-.224.5-.5.5s-.5-.224-.5-.5.224-.5.5-.5.5.224.5.5z" />
              </svg>
            }
          />
          <StatCard
            title="Avg Order Value"
            value={stats.avgOrderValue}
            change={0}
            color="text-green-500"
            delay="0.3s"
            icon={
              <svg className="w-7 h-7 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
        </div>

        {/* Quick Stats & Recent Orders */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Today's Performance */}
          <div className="bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-500 p-4 sm:p-6 border border-green-100 animate-fadeInUp">
            <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center gap-2">
              <span className="w-1 h-6 bg-gradient-to-b from-green-500 to-green-600 rounded-full"></span>
              Today's Performance
            </h3>
            <div className="space-y-3 sm:space-y-4">
              <div className="flex justify-between items-center p-5 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl hover:shadow-md transition-all duration-300 border border-blue-100">
                <div>
                  <p className="text-sm text-gray-600 font-semibold uppercase tracking-wide">Today's Orders</p>
                  <p className="text-3xl font-bold text-blue-600 mt-1">{stats.todayOrders}</p>
                </div>
                <div className="text-4xl">📦</div>
              </div>
              <div className="flex justify-between items-center p-5 bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl hover:shadow-md transition-all duration-300 border border-green-100">
                <div>
                  <p className="text-sm text-gray-600 font-semibold uppercase tracking-wide">Today's Revenue</p>
                  <p className="text-3xl font-bold text-green-600 mt-1">Rs. {stats.todayRevenue.toLocaleString()}</p>
                </div>
                <div className="text-4xl">💰</div>
              </div>
            </div>
          </div>

          {/* Restaurant Info */}
          <div className="bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-500 p-4 sm:p-6 border border-green-100 animate-fadeInUp" style={{animationDelay: '0.1s'}}>
            <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center gap-2">
              <span className="w-1 h-6 bg-gradient-to-b from-green-500 to-green-600 rounded-full"></span>
              Restaurant Info
            </h3>
            <div className="space-y-3 sm:space-y-4">
              <div className="flex justify-between items-center p-4 sm:p-5 bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl hover:shadow-md transition-all duration-300 border border-green-100">
                <div>
                  <p className="text-sm text-gray-600 font-semibold uppercase tracking-wide">Total Products</p>
                  <p className="text-3xl font-bold text-orange-600 mt-1">{stats.totalProducts}</p>
                </div>
                <div className="text-4xl">🍽️</div>
              </div>
              <div className="flex justify-between items-center p-5 bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-xl hover:shadow-md transition-all duration-300 border border-purple-100">
                <div>
                  <p className="text-sm text-gray-600 font-semibold uppercase tracking-wide">Available Now</p>
                  <p className="text-3xl font-bold text-purple-600 mt-1">{stats.availableProducts}</p>
                </div>
                <div className="text-4xl">✅</div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Orders & Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Recent Orders */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-500 p-4 sm:p-6 border border-green-100 animate-fadeInUp" style={{animationDelay: '0.2s'}}>
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-gray-800 flex items-center gap-2">
                  <span className="w-1 h-6 bg-gradient-to-b from-green-500 to-green-600 rounded-full"></span>
                  Recent Orders
                </h3>
                <p className="text-gray-600 text-xs sm:text-sm mt-1 ml-3">Latest customer orders</p>
              </div>
            </div>
            {recentOrders.length === 0 ? (
              <div className="text-center py-12 sm:py-16 text-gray-500">
                <div className="w-16 sm:w-20 h-16 sm:h-20 mx-auto mb-4 bg-gradient-to-br from-green-100 to-green-200 rounded-2xl flex items-center justify-center">
                  <svg className="w-8 sm:w-10 h-8 sm:h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
                <p className="text-lg font-semibold text-gray-700">No orders yet</p>
                <p className="text-sm mt-2 text-gray-500">Orders will appear here once customers start ordering</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <div className="inline-block min-w-full align-middle">
                  <div className="overflow-hidden">
                    <table className="min-w-full">
                      <thead>
                        <tr className="border-b-2 border-green-100">
                          <th className="text-left py-3 sm:py-4 px-3 sm:px-0 text-gray-700 font-bold text-xs uppercase tracking-wider">Order ID</th>
                          <th className="text-left py-3 sm:py-4 px-3 sm:px-0 text-gray-700 font-bold text-xs uppercase tracking-wider">Customer</th>
                          <th className="text-left py-3 sm:py-4 px-3 sm:px-0 text-gray-700 font-bold text-xs uppercase tracking-wider hidden sm:table-cell">Items</th>
                          <th className="text-left py-3 sm:py-4 px-3 sm:px-0 text-gray-700 font-bold text-xs uppercase tracking-wider">Amount</th>
                          <th className="text-left py-3 sm:py-4 px-3 sm:px-0 text-gray-700 font-bold text-xs uppercase tracking-wider hidden md:table-cell">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentOrders.map((order, index) => (
                          <tr 
                            key={order.id} 
                            className="border-b border-green-50 hover:bg-green-50/50 transition-all duration-300 group"
                            style={{ animationDelay: `${index * 50}ms` }}
                          >
                            <td className="py-4 sm:py-5 px-3 sm:px-0">
                              <div className="font-bold text-green-600 text-sm">#{order.id.slice(0, 8)}</div>
                            </td>
                            <td className="py-4 sm:py-5 px-3 sm:px-0">
                              <div className="flex items-center">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-green-400 to-green-500 flex items-center justify-center text-white text-xs sm:text-sm font-bold mr-2 sm:mr-3 shadow-sm">
                                  {order.customer.charAt(0).toUpperCase()}
                                </div>
                                <span className="font-medium text-gray-700 text-sm">{order.customer}</span>
                              </div>
                            </td>
                            <td className="py-4 sm:py-5 px-3 sm:px-0 text-xs sm:text-sm text-gray-600 hidden sm:table-cell">
                              <div className="max-w-xs truncate">{order.items}</div>
                            </td>
                            <td className="py-4 sm:py-5 px-3 sm:px-0 font-bold text-green-600 text-sm">Rs. {order.amount.toLocaleString()}</td>
                            <td className="py-4 sm:py-5 px-3 sm:px-0 text-gray-500 text-xs sm:text-sm hidden md:table-cell">{order.time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
            )}
          </div>

          {/* Quick Actions & Info */}
          <div className="space-y-4 sm:space-y-6">
            {/* Quick Actions */}
            <div className="bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-500 p-4 sm:p-6 border border-green-100 animate-fadeInUp" style={{animationDelay: '0.3s'}}>
              <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-5 flex items-center gap-2">
                <span className="w-1 h-6 bg-gradient-to-b from-green-500 to-green-600 rounded-full"></span>
                Quick Actions
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <button 
                  onClick={() => navigate('/admin/products')}
                  className="p-4 bg-gradient-to-br from-blue-50 to-blue-100/50 hover:from-blue-100 hover:to-blue-200/50 rounded-xl transition-all duration-300 group hover:scale-105 hover:shadow-md border border-blue-100"
                >
                  <div className="text-blue-600 mb-2 group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-center text-gray-700">Add Product</p>
                </button>
                <button 
                  onClick={() => navigate('/admin/products')}
                  className="p-4 bg-gradient-to-br from-green-50 to-green-100/50 hover:from-green-100 hover:to-green-200/50 rounded-xl transition-all duration-300 group hover:scale-105 hover:shadow-md border border-green-100"
                >
                  <div className="text-green-600 mb-2 group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-center text-gray-700">Manage Menu</p>
                </button>
                <button 
                  onClick={() => navigate('/admin/restaurant-detail')}
                  className="p-3 sm:p-4 bg-gradient-to-br from-green-50 to-green-100/50 hover:from-green-100 hover:to-green-200/50 rounded-xl transition-all duration-300 group hover:scale-105 hover:shadow-md border border-green-100"
                >
                  <div className="text-green-600 mb-1 sm:mb-2 group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-center text-gray-700">Restaurant Info</p>
                </button>
                <button 
                  onClick={() => navigate('/admin/profile')}
                  className="p-4 bg-gradient-to-br from-purple-50 to-purple-100/50 hover:from-purple-100 hover:to-purple-200/50 rounded-xl transition-all duration-300 group hover:scale-105 hover:shadow-md border border-purple-100"
                >
                  <div className="text-purple-600 mb-2 group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-center text-gray-700">My Profile</p>
                </button>
              </div>
            </div>

            {/* Business Status */}
            <div className="bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-500 p-4 sm:p-6 border border-green-100 animate-fadeInUp" style={{animationDelay: '0.4s'}}>
              <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-5 flex items-center gap-2">
                <span className="w-1 h-6 bg-gradient-to-b from-green-500 to-green-600 rounded-full"></span>
                Business Status
              </h3>
              <div className="space-y-2 sm:space-y-3">
                <div className="flex items-center justify-between p-4 bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl border border-green-100 hover:shadow-md transition-all duration-300">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-lg shadow-green-500/50"></div>
                    <p className="text-sm font-semibold text-gray-700">Restaurant Open</p>
                  </div>
                  <span className="text-xs text-green-700 font-bold uppercase tracking-wider">Active</span>
                </div>
                <div className="flex items-center justify-between p-4 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl border border-blue-100 hover:shadow-md transition-all duration-300">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 bg-blue-500 rounded-full shadow-md shadow-blue-500/50"></div>
                    <p className="text-sm font-semibold text-gray-700">Menu Available</p>
                  </div>
                  <span className="text-xs text-blue-700 font-bold">{stats.availableProducts} items</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 pb-4 sm:pb-6">
          <div className="bg-gradient-to-br from-green-500 via-green-600 to-green-700 text-white rounded-2xl p-4 sm:p-6 shadow-lg hover:shadow-2xl hover:scale-105 transition-all duration-500 animate-fadeInUp" style={{animationDelay: '0.5s'}}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider opacity-90">Total Revenue</p>
                <p className="text-3xl font-bold mt-3 drop-shadow-md">Rs. {stats.totalRevenue.toLocaleString()}</p>
                <p className="text-xs opacity-80 mt-2">All time earnings</p>
              </div>
              <div className="text-5xl opacity-90">💰</div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white rounded-2xl p-6 shadow-lg hover:shadow-2xl hover:scale-105 transition-all duration-500 animate-fadeInUp" style={{animationDelay: '0.6s'}}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider opacity-90">Total Customers</p>
                <p className="text-3xl font-bold mt-3 drop-shadow-md">{stats.activeCustomers}</p>
                <p className="text-xs opacity-80 mt-2">Customers who ordered</p>
              </div>
              <div className="text-5xl opacity-90">👥</div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Add animations to global CSS */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.8s ease-out;
        }
        .animate-fadeInUp {
          animation: fadeInUp 0.8s ease-out forwards;
        }
        .animate-slideDown {
          animation: slideDown 0.6s ease-out;
        }
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .animate-spin-slow {
          animation: spin-slow 2s linear infinite;
        }
      `}</style>
    </AdminLayout>
  );
}
