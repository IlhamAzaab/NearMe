import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Beef,
  Drumstick,
  Fish,
  Flame,
  Grip,
  Sandwich,
  Soup,
  UtensilsCrossed,
  Wheat,
} from "lucide-react";
import BottomNavbar from "../components/BottomNavbar";
import {
  useAcknowledgeLaunchPromotionMutation,
  useCustomerCartCount,
  useCustomerUnreadNotificationsCount,
  useLaunchPromotionStatusQuery,
  usePublicFoodsQuery,
  usePublicRestaurantsQuery,
} from "../hooks/useCustomerNotifications";
import {
  calculateRestaurantDistances,
  formatDistance,
  hasCustomerDeliveryLocation,
} from "../services/restaurantDistanceService";
import { formatRestaurantHours } from "../utils/locationUtils";

const CATEGORY_ORDER = [
  "Koththu",
  "Fried Rice",
  "Biriyani",
  "BBQ",
  "parotta",
  "rice and curry",
  "curry",
  "short eats",
  "dolphin",
  "sea food",
  "others",
];

const CATEGORY_LABEL_LOOKUP = new Map(
  CATEGORY_ORDER.map((label) => [label.toLowerCase(), label]),
);

const CATEGORY_ICON_BY_KEY = {
  koththu: UtensilsCrossed,
  "fried rice": Wheat,
  biriyani: Drumstick,
  bbq: Flame,
  parotta: Sandwich,
  "rice and curry": Soup,
  curry: Beef,
  "short eats": Grip,
  dolphin: Fish,
  "sea food": Fish,
  others: UtensilsCrossed,
};

function normalizeCategoryLabel(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  return CATEGORY_LABEL_LOOKUP.get(key) || "others";
}

function CategoryIcon({ category }) {
  const key = normalizeCategoryLabel(category).toLowerCase();
  const Icon = CATEGORY_ICON_BY_KEY[key] || UtensilsCrossed;
  return (
    <div className="w-14 h-14 rounded-full bg-green-100 border border-green-200 flex items-center justify-center">
      <Icon className="w-7 h-7 text-[#06C168]" strokeWidth={2.2} />
    </div>
  );
}

const Home = () => {
  const navigate = useNavigate();
  const [restaurants, setRestaurants] = useState([]);
  const [allFoods, setAllFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeTab, setActiveTab] = useState("restaurant");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLaunchPromoModal, setShowLaunchPromoModal] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState(null);
  const [restaurantsWithDistances, setRestaurantsWithDistances] = useState([]);
  const [showDistances, setShowDistances] = useState(false);

  const restaurantsQuery = usePublicRestaurantsQuery(debouncedSearch, {
    enabled: activeTab === "restaurant",
    refetchInterval: 90 * 1000,
  });

  const foodsQuery = usePublicFoodsQuery("", {
    enabled: true,
    refetchInterval: 90 * 1000,
  });

  const notificationsCountQuery = useCustomerUnreadNotificationsCount({
    enabled: isLoggedIn,
  });
  const cartCountQuery = useCustomerCartCount({ enabled: isLoggedIn });
  const launchPromoQuery = useLaunchPromotionStatusQuery({ enabled: isLoggedIn });
  const acknowledgePromoMutation = useAcknowledgeLaunchPromotionMutation();

  const unreadCount = notificationsCountQuery.data || 0;
  const cartCount = cartCountQuery.data || 0;
  const launchPromo = launchPromoQuery.data || null;
  const acknowledgingPromo = acknowledgePromoMutation.isPending;

  // Check auth and fetch notifications/cart count
  useEffect(() => {
    const delay = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(delay);
  }, [searchQuery]);

  useEffect(() => {
    setRestaurants(restaurantsQuery.data || []);
  }, [restaurantsQuery.data]);

  useEffect(() => {
    setAllFoods(foodsQuery.data || []);
  }, [foodsQuery.data]);

  const categories = useMemo(() => {
    const categorySet = new Set();
    for (const food of allFoods) {
      categorySet.add(normalizeCategoryLabel(food?.category));
    }

    return Array.from(categorySet)
      .sort((a, b) => {
        const aIndex = CATEGORY_ORDER.indexOf(a);
        const bIndex = CATEGORY_ORDER.indexOf(b);
        const safeA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
        const safeB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
        if (safeA !== safeB) return safeA - safeB;
        return a.localeCompare(b);
      })
      .map((name, index) => ({ id: index + 1, name }));
  }, [allFoods]);

  const filteredFoods = useMemo(() => {
    const normalizedSelectedCategory = selectedCategory
      ? normalizeCategoryLabel(selectedCategory)
      : null;
    const safeSearch = searchQuery.trim().toLowerCase();

    return allFoods.filter((food) => {
      const normalizedFoodCategory = normalizeCategoryLabel(food?.category);

      if (
        normalizedSelectedCategory &&
        normalizedFoodCategory !== normalizedSelectedCategory
      ) {
        return false;
      }

      if (!safeSearch) return true;

      const searchableText = [
        food?.name,
        food?.description,
        normalizedFoodCategory,
        food?.restaurants?.restaurant_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(safeSearch);
    });
  }, [allFoods, searchQuery, selectedCategory]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    if (token && role === "customer") {
      setIsLoggedIn(true);
      checkCustomerLocation();
    }
  }, []);

  useEffect(() => {
    setShowLaunchPromoModal(Boolean(launchPromo?.should_show_popup));
  }, [launchPromo?.should_show_popup]);

  const handleLaunchPromoOk = async () => {
    try {
      await acknowledgePromoMutation.mutateAsync();
      setShowLaunchPromoModal(false);
    } catch (error) {
      console.error("Launch promotion acknowledge error:", error);
    }
  };

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

  useEffect(() => {
    if (activeTab === "restaurant") {
      setLoading(restaurantsQuery.isLoading && !restaurants.length);
    } else {
      setLoading(foodsQuery.isLoading && !allFoods.length);
    }
  }, [
    activeTab,
    restaurantsQuery.isLoading,
    foodsQuery.isLoading,
    restaurants.length,
    allFoods.length,
  ]);

  const featuredRestaurant = restaurants[0];

  return (
    <div className="min-h-screen bg-gray-50 font-poppins pb-24 page-slide-up">
      {showLaunchPromoModal && launchPromo?.promotion && (
        <div className="fixed inset-0 z-70 bg-black/50 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="bg-linear-to-r from-[#06C168] to-[#059B52] p-5 text-white">
              <p className="text-xs font-semibold uppercase tracking-wider opacity-90">
                Launch Offer
              </p>
              <h3 className="text-xl font-bold mt-1">Welcome to Meezo</h3>
              <p className="text-sm mt-2 opacity-95">
                Your first delivery gets a special fee discount.
              </p>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-green-50 border border-green-100 rounded-xl p-3">
                <p className="text-sm text-gray-700">
                  Rs. {launchPromo.promotion.first_km_rate} per 1km up to {" "}
                  {launchPromo.promotion.max_km}km
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Beyond {launchPromo.promotion.max_km}km: Rs. {" "}
                  {launchPromo.promotion.beyond_km_rate} per 1km
                </p>
              </div>
              <p className="text-xs text-gray-500">
                This offer applies only to your first order for this account.
              </p>
              <button
                onClick={handleLaunchPromoOk}
                disabled={acknowledgingPromo}
                className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${
                  acknowledgingPromo
                    ? "bg-gray-200 text-gray-500"
                    : "bg-[#06C168] text-white hover:bg-green-600"
                }`}
              >
                {acknowledgingPromo ? "Saving..." : "OK"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-white px-4 py-3 shadow-sm">
        <div className="max-w-6xl mx-auto">
          {/* Logo and Location Row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-[#06C168] rounded-xl flex items-center justify-center shadow-lg shadow-green-200">
                <span className="text-white text-lg font-bold">N</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Meezo</h1>
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
            <button className="text-[#06C168] text-sm font-medium hover:text-green-600 transition-colors">
              See All
            </button>
          </div>

          {/* Horizontal Scrollable Categories */}
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => {
                      setSelectedCategory(category.name);
                  setActiveTab("food");
                  setSearchQuery(category.name);
                      setDebouncedSearch(category.name);
                }}
                className={`flex-shrink-0 flex flex-col items-center gap-2 p-4 rounded-2xl transition-all hover:-translate-y-1 min-w-[90px] ${
                      selectedCategory === category.name
                    ? "bg-[#06C168] shadow-lg shadow-green-200"
                    : "bg-green-50 hover:shadow-md"
                }`}
              >
                <div className="w-14 h-14 flex items-center justify-center">
                      <CategoryIcon category={category.name} />
                </div>
                <span
                      className={`text-sm font-medium ${selectedCategory === category.name ? "text-white" : "text-[#06C168]"}`}
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
            onClick={() => {
              setActiveTab("restaurant");
              setSelectedCategory(null);
            }}
            className={`flex-1 py-3.5 px-6 rounded-full font-semibold text-sm transition-all duration-300 ${
              activeTab === "restaurant"
                ? "bg-[#06C168] text-white shadow-lg shadow-green-300/40"
                : "bg-white text-[#06C168] border-2 border-[#06C168] hover:bg-green-50"
            }`}
          >
            Restaurants
          </button>
          <button
            onClick={() => setActiveTab("food")}
            className={`flex-1 py-3.5 px-6 rounded-full font-semibold text-sm transition-all duration-300 ${
              activeTab === "food"
                ? "bg-[#06C168] text-white shadow-lg shadow-green-300/40"
                : "bg-white text-[#06C168] border-2 border-[#06C168] hover:bg-green-50"
            }`}
          >
            Food Items
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-green-100 rounded-full"></div>
              <div className="absolute top-0 left-0 w-16 h-16 border-4 border-[#06C168] border-t-transparent rounded-full animate-spin"></div>
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
                      featuredRestaurant.cover_image_url ||
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
                      <span>{featuredRestaurant.city || "Unknown City"}</span>
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
                  <div className="absolute top-4 right-4 px-4 py-1.5 bg-[#06C168] rounded-full text-xs font-semibold text-white shadow-lg">
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
                <button className="text-[#06C168] text-sm font-medium hover:text-green-600 transition-colors">
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
                          r.cover_image_url ||
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
                      {/* Logo avatar overlapping banner */}
                      <div className="absolute -bottom-5 left-3 w-10 h-10 rounded-full border-2 border-white shadow-md bg-white overflow-hidden flex-shrink-0">
                        {r.logo_url ? (
                          <img
                            src={r.logo_url}
                            alt={`${r.restaurant_name} logo`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-green-100 flex items-center justify-center">
                            <span className="text-green-500 text-xs font-bold">
                              {r.restaurant_name?.charAt(0) || "R"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="p-3 pt-4 pl-16">
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
                        {r.city || "Unknown City"}
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
                          r.cover_image_url ||
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
                          {r.city || "Unknown City"}
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
              {filteredFoods.map((food) => (
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

                    {/* Unavailable Overlay */}
                    {!food.is_available && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <span className="px-3 py-1 bg-red-500 text-white text-xs font-semibold rounded-full shadow-lg">
                          Not Available
                        </span>
                      </div>
                    )}

                    {food.is_available && (
                      <button
                        className="absolute bottom-2 right-2 w-9 h-9 bg-white text-[#06C168] rounded-full flex items-center justify-center shadow-lg hover:bg-[#06C168] hover:text-white transition-colors"
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
                    )}
                  </div>
                  <div className="p-3">
                    <h4 className="font-semibold text-gray-900 text-sm truncate mb-1">
                      {food.name}
                    </h4>
                    <p className="text-xs text-teal-500 truncate mb-2">
                      {food.restaurants?.restaurant_name || "Restaurant"}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#06C168]">
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
          (activeTab === "food" ? filteredFoods : restaurants).length === 0 && (
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
          className="fixed bottom-24 right-4 bg-[#06C168] text-white px-5 py-3 rounded-full shadow-xl shadow-green-300/40 flex items-center gap-2 hover:bg-green-600 transition-all z-50 hover:-translate-y-1"
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
