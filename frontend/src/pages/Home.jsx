import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNavbar from "../components/BottomNavbar";
import { API_URL } from "../config";
import {
  calculateRestaurantDistances,
  formatDistance,
  hasCustomerDeliveryLocation,
} from "../services/restaurantDistanceService";
import { formatRestaurantHours } from "../utils/locationUtils";

// Category Icons
const CategoryIcon = ({ type }) => {
  const icons = {
    pizza: (
      <svg viewBox="0 0 64 64" className="w-10 h-10">
        <path d="M32 8 L56 52 L8 52 Z" fill="#FFA726" />
        <path d="M32 12 L52 48 L12 48 Z" fill="#FFCC80" />
        <circle cx="28" cy="35" r="5" fill="#E53935" />
        <circle cx="38" cy="32" r="4" fill="#E53935" />
        <circle cx="32" cy="42" r="4" fill="#4CAF50" />
        <circle cx="24" cy="44" r="3" fill="#8D6E63" />
        <circle cx="40" cy="44" r="3" fill="#E53935" />
      </svg>
    ),
    burger: (
      <svg viewBox="0 0 64 64" className="w-10 h-10">
        <ellipse cx="32" cy="20" rx="22" ry="10" fill="#8D6E63" />
        <ellipse cx="32" cy="18" rx="20" ry="8" fill="#A1887F" />
        <rect x="10" y="28" width="44" height="6" fill="#4CAF50" />
        <rect x="10" y="34" width="44" height="8" fill="#795548" />
        <rect x="10" y="42" width="44" height="4" fill="#FFC107" />
        <rect x="10" y="46" width="44" height="4" fill="#E53935" />
        <ellipse cx="32" cy="54" rx="22" ry="6" fill="#8D6E63" />
        <circle cx="20" cy="16" r="1.5" fill="#FFF9C4" />
        <circle cx="32" cy="14" r="1.5" fill="#FFF9C4" />
        <circle cx="44" cy="16" r="1.5" fill="#FFF9C4" />
      </svg>
    ),
    biryani: (
      <svg viewBox="0 0 64 64" className="w-10 h-10">
        <ellipse cx="32" cy="48" rx="26" ry="10" fill="#5D4037" />
        <ellipse cx="32" cy="44" rx="24" ry="14" fill="#8D6E63" />
        <ellipse cx="32" cy="40" rx="22" ry="12" fill="#FFF8E1" />
        <circle cx="24" cy="38" r="3" fill="#FF7043" />
        <circle cx="36" cy="36" r="2" fill="#66BB6A" />
        <circle cx="28" cy="42" r="2" fill="#FFCA28" />
        <circle cx="40" cy="40" r="3" fill="#FF7043" />
        <circle cx="32" cy="38" r="2" fill="#66BB6A" />
        <path
          d="M26 28 Q28 22, 30 28"
          stroke="#9E9E9E"
          fill="none"
          strokeWidth="1.5"
        />
        <path
          d="M32 26 Q34 20, 36 26"
          stroke="#9E9E9E"
          fill="none"
          strokeWidth="1.5"
        />
        <path
          d="M38 28 Q40 22, 42 28"
          stroke="#9E9E9E"
          fill="none"
          strokeWidth="1.5"
        />
      </svg>
    ),
    desserts: (
      <svg viewBox="0 0 64 64" className="w-10 h-10">
        <path d="M20 56 L22 30 L42 30 L44 56 Z" fill="#FFF8E1" />
        <ellipse cx="32" cy="30" rx="12" ry="4" fill="#FFECB3" />
        <circle cx="32" cy="22" r="12" fill="#EC407A" />
        <circle cx="32" cy="20" r="10" fill="#F48FB1" />
        <circle cx="28" cy="18" r="2" fill="#FFEB3B" />
        <circle cx="36" cy="22" r="2" fill="#4CAF50" />
        <circle cx="32" cy="16" r="2" fill="#2196F3" />
        <circle cx="32" cy="10" r="3" fill="#E53935" />
        <path d="M30 8 L32 4 L34 8" fill="#4CAF50" />
      </svg>
    ),
    drinks: (
      <svg viewBox="0 0 64 64" className="w-10 h-10">
        <path d="M20 16 L24 56 L40 56 L44 16 Z" fill="#81D4FA" />
        <ellipse cx="32" cy="16" rx="12" ry="4" fill="#B3E5FC" />
        <ellipse cx="32" cy="52" rx="8" ry="3" fill="#4FC3F7" />
        <circle cx="26" cy="30" r="3" fill="#FFFFFF" opacity="0.6" />
        <circle cx="34" cy="36" r="4" fill="#FFFFFF" opacity="0.6" />
        <circle cx="28" cy="44" r="2" fill="#FFFFFF" opacity="0.6" />
        <rect x="42" y="12" width="4" height="20" fill="#FF7043" />
        <circle cx="50" cy="12" r="6" fill="#FF7043" />
        <circle cx="50" cy="12" r="4" fill="#FFAB91" />
        <path d="M44 20 L52 16" stroke="#FF7043" strokeWidth="2" />
      </svg>
    ),
  };
  return icons[type] || icons.pizza;
};

const Home = () => {
  const navigate = useNavigate();
  const [restaurants, setRestaurants] = useState([]);
  const [allFoods, setAllFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("restaurant");
  const [unreadCount, setUnreadCount] = useState(0);
  const [cartCount, setCartCount] = useState(0);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Food categories
  const categories = [
    { id: 1, name: "Pizza", type: "pizza" },
    { id: 2, name: "Burger", type: "burger" },
    { id: 3, name: "Biryani", type: "biryani" },
    { id: 4, name: "Desserts", type: "desserts" },
    { id: 5, name: "Drinks", type: "drinks" },
  ];

  const [selectedCategory, setSelectedCategory] = useState(null);
  const [restaurantsWithDistances, setRestaurantsWithDistances] = useState([]);
  const [showDistances, setShowDistances] = useState(false);

  // Check auth and fetch notifications/cart count
  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    if (token && role === "customer") {
      setIsLoggedIn(true);
      fetchNotificationCount();
      fetchCartCount();
      checkCustomerLocation();
    }
  }, []);

  // Check if customer has delivery location for distance calculations
  const checkCustomerLocation = async () => {
    try {
      const hasLocation = await hasCustomerDeliveryLocation();
      setShowDistances(hasLocation);
    } catch (error) {
      console.warn("Could not check customer location:", error);
      setShowDistances(false);
    }
  };

  // Calculate distances when restaurants are loaded and customer is logged in
  useEffect(() => {
    if (restaurants.length > 0 && showDistances) {
      calculateDistances();
    }
  }, [restaurants, showDistances]);

  const calculateDistances = async () => {
    try {
      const restaurantsWithDist =
        await calculateRestaurantDistances(restaurants);
      setRestaurantsWithDistances(restaurantsWithDist);
    } catch (error) {
      console.error("Failed to calculate distances:", error);
      setRestaurantsWithDistances(
        restaurants.map((r) => ({ ...r, distance: null })),
      );
    }
  };

  // Helper function to get restaurant with distance
  const getRestaurantWithDistance = (restaurantId) => {
    return (
      restaurantsWithDistances.find((r) => r.id === restaurantId) ||
      restaurants.find((r) => r.id === restaurantId)
    );
  };

  const fetchNotificationCount = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/customer/notifications?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const unread = (data.notifications || []).filter(
        (n) => !n.is_read,
      ).length;
      setUnreadCount(unread);
    } catch (err) {
      console.error("Fetch notifications error:", err);
    }
  };

  const fetchCartCount = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/cart`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const totalItems = (data.carts || []).reduce((sum, cart) => {
        return (
          sum +
          (cart.items || []).reduce(
            (itemSum, item) => itemSum + item.quantity,
            0,
          )
        );
      }, 0);
      setCartCount(totalItems);
    } catch (err) {
      console.error("Fetch cart error:", err);
    }
  };

  const fetchRestaurants = async (search = "") => {
    try {
      setLoading(true);
      const url = new URL(`${API_URL}/public/restaurants`);
      if (search) url.searchParams.append("search", search);

      const res = await fetch(url);
      const data = await res.json();
      setRestaurants(data.restaurants || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllFoods = async (search = "") => {
    try {
      setLoading(true);
      const url = new URL(`${API_URL}/public/foods`);
      if (search) url.searchParams.append("search", search);

      const res = await fetch(url);
      const data = await res.json();
      setAllFoods(data.foods || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delay = setTimeout(() => {
      if (activeTab === "food") {
        fetchAllFoods(searchQuery);
      } else {
        fetchRestaurants(searchQuery);
      }
    }, 300);
    return () => clearTimeout(delay);
  }, [searchQuery, activeTab]);

  const featuredRestaurant = restaurants[0];

  return (
    <div className="min-h-screen bg-gray-50 font-poppins pb-24 page-slide-up">
      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-white px-4 py-3 shadow-sm">
        <div className="max-w-6xl mx-auto">
          {/* Logo and Location Row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-[#FF7A00] rounded-xl flex items-center justify-center shadow-lg shadow-orange-200">
                <span className="text-white text-lg font-bold">N</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Near Me</h1>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <svg
                    className="w-3 h-3"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  ></svg>
                </div>
              </div>
            </div>

            {/* Notification Bell */}
            <button
              onClick={() => navigate("/notifications")}
              className="relative p-2.5 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
            >
              <svg
                className="w-5 h-5 text-gray-700"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <svg
                className="w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search restaurants or dishes near you"
              className="w-full pl-12 pr-4 py-3.5 bg-gray-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:bg-white border border-transparent focus:border-primary-300 transition-all placeholder-gray-400"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 py-5 max-w-6xl mx-auto">
        {/* Promotional Banner */}
        <div className="relative overflow-hidden rounded-3xl mb-8 shadow-lg">
          {/* Background Image */}
          <img
            src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&q=80"
            alt="Delicious food spread"
            className="w-full h-48 sm:h-56 object-cover"
          />

          {/* Content Overlay */}
          <div className="absolute inset-0 flex flex-col justify-center p-6">
            <h2
              className="text-2xl sm:text-3xl font-bold text-white mb-2 leading-tight max-w-[280px] sm:max-w-md"
              style={{ textShadow: "0 4px 8px rgba(0,0,0,0.5)" }}
            >
              Get Up To 20% Discount On Your First Order
            </h2>
            <p
              className="text-white text-sm mb-5 max-w-[260px] sm:max-w-sm"
              style={{ textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}
            >
              Enjoy delicious meals from nearby restaurants
            </p>
          </div>
        </div>

        {/* Category Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">Category</h3>
            <button className="text-[#FF7A00] text-sm font-medium hover:text-orange-600 transition-colors">
              See All
            </button>
          </div>

          {/* Horizontal Scrollable Categories */}
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => {
                  setSelectedCategory(category.id);
                  setActiveTab("food");
                  setSearchQuery(category.name);
                }}
                className={`flex-shrink-0 flex flex-col items-center gap-2 p-4 rounded-2xl transition-all hover:-translate-y-1 min-w-[90px] ${
                  selectedCategory === category.id
                    ? "bg-[#FF7A00] shadow-lg shadow-orange-200"
                    : "bg-orange-50 hover:shadow-md"
                }`}
              >
                <div className="w-14 h-14 flex items-center justify-center">
                  <CategoryIcon type={category.type} />
                </div>
                <span
                  className={`text-sm font-medium ${selectedCategory === category.id ? "text-white" : "text-[#FF7A00]"}`}
                >
                  {category.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Category Toggle */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setActiveTab("restaurant")}
            className={`flex-1 py-3.5 px-6 rounded-full font-semibold text-sm transition-all duration-300 ${
              activeTab === "restaurant"
                ? "bg-[#FF7A00] text-white shadow-lg shadow-orange-300/40"
                : "bg-white text-[#FF7A00] border-2 border-[#FF7A00] hover:bg-orange-50"
            }`}
          >
            Restaurants
          </button>
          <button
            onClick={() => setActiveTab("food")}
            className={`flex-1 py-3.5 px-6 rounded-full font-semibold text-sm transition-all duration-300 ${
              activeTab === "food"
                ? "bg-[#FF7A00] text-white shadow-lg shadow-orange-300/40"
                : "bg-white text-[#FF7A00] border-2 border-[#FF7A00] hover:bg-orange-50"
            }`}
          >
            Food Items
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-orange-100 rounded-full"></div>
              <div className="absolute top-0 left-0 w-16 h-16 border-4 border-[#FF7A00] border-t-transparent rounded-full animate-spin"></div>
            </div>
            <p className="mt-4 text-gray-500 text-sm font-medium">
              Finding delicious options...
            </p>
          </div>
        ) : activeTab === "restaurant" ? (
          /* Restaurant Section */
          <div>
            {/* Featured Restaurant Card */}
            {featuredRestaurant && (
              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">
                  Featured Restaurant
                </h3>
                <div
                  onClick={() =>
                    navigate(`/restaurant/${featuredRestaurant.id}/foods`)
                  }
                  className="relative overflow-hidden rounded-3xl cursor-pointer group"
                >
                  <img
                    src={
                      featuredRestaurant.logo_url ||
                      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800"
                    }
                    alt={featuredRestaurant.restaurant_name}
                    className="w-full h-56 object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
                  <div className="absolute bottom-0 left-0 right-0 p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-2xl font-bold text-white">
                        {featuredRestaurant.restaurant_name}
                      </h3>
                      {featuredRestaurant.is_open === false ? (
                        <span className="px-2 py-0.5 bg-red-500 text-white rounded text-xs font-semibold">
                          Closed
                        </span>
                      ) : (
                        <span className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                          <svg
                            className="w-3 h-3 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-white/90 text-sm">
                      {featuredRestaurant.rating && (
                        <>
                          <span className="flex items-center gap-1 bg-green-600 px-2 py-0.5 rounded">
                            <span>★</span>
                            {featuredRestaurant.rating}
                          </span>
                        </>
                      )}
                      <span>
                        {featuredRestaurant.cuisine || "Multi-cuisine"}
                      </span>
                      {featuredRestaurant.delivery_time && (
                        <>
                          <span>•</span>
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
                            {featuredRestaurant.delivery_time}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="absolute top-4 right-4 px-4 py-1.5 bg-[#FF7A00] rounded-full text-xs font-semibold text-white shadow-lg">
                    ⭐ Featured
                  </div>
                </div>
              </div>
            )}

            {/* Nearby Restaurants */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">
                  Nearby Restaurants
                </h3>
                <button className="text-[#FF7A00] text-sm font-medium hover:text-orange-600 transition-colors">
                  See All
                </button>
              </div>

              {/* Horizontal Scroll on Mobile, Grid on Desktop */}
              <div className="flex lg:grid lg:grid-cols-4 gap-4 overflow-x-auto lg:overflow-x-visible pb-4 lg:pb-0 -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-hide">
                {restaurants.slice(1, 9).map((r) => (
                  <div
                    key={r.id}
                    onClick={() => navigate(`/restaurant/${r.id}/foods`)}
                    className="flex-shrink-0 w-48 lg:w-full bg-white rounded-2xl shadow-sm overflow-hidden cursor-pointer hover:shadow-lg transition-all hover:-translate-y-1"
                  >
                    <div className="relative">
                      <img
                        src={
                          r.logo_url ||
                          "https://images.unsplash.com/photo-1552566626-52f8b828add9?w=400"
                        }
                        alt={r.restaurant_name}
                        className="w-full h-32 object-cover"
                      />
                      {r.rating && (
                        <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-green-600 rounded text-xs font-semibold text-white flex items-center gap-1">
                          <span>★</span>
                          <span>{r.rating}</span>
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <h4 className="font-semibold text-gray-900 text-sm truncate">
                          {r.restaurant_name}
                        </h4>
                        {r.is_open === false ? (
                          <span className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-[10px] font-semibold flex-shrink-0">
                            Closed
                          </span>
                        ) : (
                          <span className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                            <svg
                              className="w-2.5 h-2.5 text-white"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate mb-2">
                        {r.cuisine || "Multi-cuisine"}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                        {showDistances &&
                          getRestaurantWithDistance(r.id)?.distance && (
                            <span className="flex items-center gap-1">
                              <svg
                                className="w-3 h-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                              </svg>
                              {formatDistance(
                                getRestaurantWithDistance(r.id).distance,
                              )}
                            </span>
                          )}
                        {r.opening_time && r.close_time && (
                          <span className="flex items-center gap-1">
                            <svg
                              className="w-3 h-3"
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
                            {formatRestaurantHours(
                              r.opening_time,
                              r.close_time,
                            )}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        {r.delivery_time && (
                          <span className="flex items-center gap-1">
                            <svg
                              className="w-3 h-3"
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
                            {r.delivery_time}
                          </span>
                        )}
                        {r.delivery_fee === 0 && (
                          <span className="text-green-600 font-medium">
                            Free delivery
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* All Restaurants List */}
            {restaurants.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-900">
                    All Restaurants
                  </h3>
                </div>
                <div className="space-y-4">
                  {restaurants.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => navigate(`/restaurant/${r.id}/foods`)}
                      className="bg-white rounded-2xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all flex gap-4"
                    >
                      <img
                        src={
                          r.logo_url ||
                          "https://images.unsplash.com/photo-1552566626-52f8b828add9?w=400"
                        }
                        alt={r.restaurant_name}
                        className="w-24 h-24 rounded-xl object-cover flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0 py-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-bold text-gray-900 truncate">
                            {r.restaurant_name}
                          </h4>
                          {r.is_open === false ? (
                            <span className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-[10px] font-semibold flex-shrink-0">
                              Closed
                            </span>
                          ) : (
                            <span className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                              <svg
                                className="w-2.5 h-2.5 text-white"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mb-2 truncate">
                          {r.cuisine || "Multi-cuisine"}
                        </p>
                        <div className="flex items-center gap-3 text-sm mb-1">
                          {showDistances &&
                            getRestaurantWithDistance(r.id)?.distance && (
                              <span className="text-gray-400 flex items-center gap-1 text-xs">
                                <svg
                                  className="w-3.5 h-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                                  />
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                                  />
                                </svg>
                                {formatDistance(
                                  getRestaurantWithDistance(r.id).distance,
                                )}
                              </span>
                            )}
                          {r.opening_time && r.close_time && (
                            <span className="text-gray-400 flex items-center gap-1 text-xs">
                              <svg
                                className="w-3.5 h-3.5"
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
                              {formatRestaurantHours(
                                r.opening_time,
                                r.close_time,
                              )}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          {r.rating && (
                            <span className="flex items-center gap-1 bg-green-600 text-white px-2 py-0.5 rounded text-xs font-medium">
                              <span>★</span>
                              {r.rating}
                            </span>
                          )}
                          {r.delivery_time && (
                            <span className="text-gray-400 flex items-center gap-1 text-xs">
                              <svg
                                className="w-3.5 h-3.5"
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
                              {r.delivery_time}
                            </span>
                          )}
                          {r.delivery_fee === 0 ? (
                            <span className="text-green-600 font-medium text-xs">
                              Free delivery
                            </span>
                          ) : r.delivery_fee > 0 ? (
                            <span className="text-gray-400 text-xs">
                              Rs. {r.delivery_fee} delivery
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Food Section */
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Popular Dishes
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {allFoods.map((food) => (
                <div
                  key={food.id}
                  onClick={() =>
                    navigate(
                      `/restaurant/${food.restaurant_id}/food/${food.id}`,
                    )
                  }
                  className="bg-white rounded-2xl shadow-sm overflow-hidden cursor-pointer hover:shadow-lg transition-all hover:-translate-y-1"
                >
                  <div className="relative">
                    <img
                      src={
                        food.image_url ||
                        "https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=400"
                      }
                      alt={food.name}
                      className="w-full h-36 object-cover"
                    />
                   
                    <button
                      className="absolute bottom-2 right-2 w-9 h-9 bg-white text-[#FF7A00] rounded-full flex items-center justify-center shadow-lg hover:bg-[#FF7A00] hover:text-white transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Add to cart logic
                      }}
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                    </button>
                  </div>
                  <div className="p-3">
                    <h4 className="font-semibold text-gray-900 text-sm truncate mb-1">
                      {food.name}
                    </h4>
                    <p className="text-xs text-teal-500 truncate mb-2">
                      {food.restaurants?.restaurant_name || "Restaurant"}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#FF7A00]">
                        Rs. {food.price}
                      </span>
                      {food.prep_time && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <svg
                            className="w-3 h-3"
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
                          {food.prep_time}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading &&
          (activeTab === "food" ? allFoods : restaurants).length === 0 && (
            <div className="text-center py-20">
              <div className="w-24 h-24 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                <span className="text-5xl">🔍</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                No results found
              </h3>
              <p className="text-gray-500 text-sm">
                Try adjusting your search or browse categories
              </p>
            </div>
          )}
      </main>

      {/* Bottom Navigation Bar */}
      <BottomNavbar cartCount={cartCount} />

      {/* Floating Cart Button */}
      {cartCount > 0 && (
        <button
          onClick={() => navigate("/cart")}
          className="fixed bottom-24 right-4 bg-[#FF7A00] text-white px-5 py-3 rounded-full shadow-xl shadow-orange-300/40 flex items-center gap-2 hover:bg-orange-600 transition-all z-50 hover:-translate-y-1"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <span className="font-semibold">{cartCount} items</span>
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
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      )}

      {/* Custom Styles */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};

export default Home;
