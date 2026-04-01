import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import BottomNavbar from "../components/BottomNavbar";
import AnimatedAlert, { useAlert } from "../components/AnimatedAlert";
import { API_URL } from "../config";
import {
  calculateRestaurantDistance,
  formatDistance,
  hasCustomerDeliveryLocation,
} from "../services/restaurantDistanceService";
import { formatRestaurantHours } from "../utils/locationUtils";

const RestaurantFoods = () => {
  const { restaurantId } = useParams();
  const navigate = useNavigate();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [cartCount, setCartCount] = useState(0);

  const [restaurant, setRestaurant] = useState(null);
  const [foods, setFoods] = useState([]);
  const [restaurantLoading, setRestaurantLoading] = useState(true);
  const [foodsLoading, setFoodsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [foodsError, setFoodsError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Cart state
  const [addingToCart, setAddingToCart] = useState(null);
  const { alert, visible, showSuccess, showError } = useAlert();

  // Location state for distance calculation
  const [restaurantDistance, setRestaurantDistance] = useState(null);
  const [showDistance, setShowDistance] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedRole = localStorage.getItem("role");
    const email = localStorage.getItem("userEmail");

    setIsLoggedIn(!!token);
    setRole(storedRole || "");
    setUserEmail(email || "");

    if (email) {
      const namePart = email.split("@")[0];
      setUserName(namePart.charAt(0).toUpperCase() + namePart.slice(1));
    }

    if (token && storedRole === "customer") {
      fetchCartCount();
    }

    fetchRestaurant();
  }, [restaurantId]);

  // Check if customer has delivery location and calculate distance
  useEffect(() => {
    if (isLoggedIn && restaurant) {
      checkAndCalculateDistance();
    }
  }, [isLoggedIn, restaurant]);

  const checkAndCalculateDistance = async () => {
    try {
      const hasLocation = await hasCustomerDeliveryLocation();
      if (hasLocation) {
        const distance = await calculateRestaurantDistance(restaurant);
        setRestaurantDistance(distance);
        setShowDistance(true);
      } else {
        setShowDistance(false);
      }
    } catch (error) {
      console.warn("Failed to calculate distance:", error);
      setShowDistance(false);
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

  // Fetch restaurant details once per restaurantId
  const fetchRestaurant = async () => {
    try {
      setRestaurantLoading(true);
      setError(null);

      const restaurantResponse = await fetch(
        `${API_URL}/public/restaurants/${restaurantId}`,
      );
      const restaurantData = await restaurantResponse.json();

      if (!restaurantResponse.ok) {
        throw new Error(restaurantData.message || "Restaurant not found");
      }

      setRestaurant(restaurantData.restaurant);
      // Load foods after restaurant is available
      fetchFoods(searchQuery);
    } catch (err) {
      console.error("Error fetching restaurant:", err);
      setError(err.message);
    } finally {
      setRestaurantLoading(false);
    }
  };

  // Fetch foods with optional search
  const fetchFoods = async (search = "") => {
    try {
      setFoodsLoading(true);
      setFoodsError(null);

      const foodsUrl = new URL(
        `${API_URL}/public/restaurants/${restaurantId}/foods`,
      );
      if (search) {
        foodsUrl.searchParams.append("search", search);
      }

      const foodsResponse = await fetch(foodsUrl);
      const foodsData = await foodsResponse.json();

      if (!foodsResponse.ok) {
        throw new Error(foodsData.message || "Failed to fetch foods");
      }

      setFoods(foodsData.foods || []);
    } catch (err) {
      console.error("Error fetching foods:", err);
      setFoodsError(err.message);
    } finally {
      setFoodsLoading(false);
    }
  };

  // Live-search foods with a short debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchFoods(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, restaurantId]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("userEmail");
    setIsLoggedIn(false);
    setRole("");
    setUserEmail("");
    setUserName("");
    navigate("/");
  };

  const formatPrice = (price) => {
    return price ? `Rs. ${parseFloat(price).toFixed(2)}` : "N/A";
  };

  const getAvailableTimeDisplay = (times) => {
    if (!times || times.length === 0) return "Not specified";
    return times
      .map((time) => time.charAt(0).toUpperCase() + time.slice(1))
      .join(", ");
  };

  // Handle Add to Cart button click - QUICK ADD (no modal)
  const quickAddToCart = async (food) => {
    if (!isLoggedIn) {
      showError("Please login to add items to cart");
      navigate("/login");
      return;
    }

    if (role !== "customer") {
      showError("Only customers can add items to cart");
      return;
    }

    if (!food.is_available) {
      const slots = food.available_time
        ?.map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(", ");
      showError(
        slots
          ? `${food.name} is only available during ${slots} time`
          : `${food.name} is currently not available`,
      );
      return;
    }

    if (restaurant?.is_open === false) {
      showError(
        `${restaurant?.restaurant_name || "This restaurant"} is currently closed`,
      );
      return;
    }

    try {
      setAddingToCart(food.id);

      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/cart/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          food_id: food.id,
          size: "regular",
          quantity: 1,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to add to cart");
      }

      showSuccess("Added to cart!");
      fetchCartCount();
    } catch (error) {
      console.error("Add to cart error:", error);
      showError(error.message);
    } finally {
      setAddingToCart(null);
    }
  };

  const buyNow = async (food) => {
    if (!isLoggedIn) {
      showError("Please login to continue");
      navigate("/login");
      return;
    }

    if (role !== "customer") {
      showError("Only customers can place orders");
      return;
    }

    if (!food.is_available) {
      const slots = food.available_time
        ?.map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(", ");
      showError(
        slots
          ? `${food.name} is only available during ${slots} time`
          : `${food.name} is currently not available`,
      );
      return;
    }

    if (restaurant?.is_open === false) {
      showError(
        `${restaurant?.restaurant_name || "This restaurant"} is currently closed`,
      );
      return;
    }

    try {
      setAddingToCart(food.id);

      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/cart/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          food_id: food.id,
          size: "regular",
          quantity: 1,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to add to cart");
      }

      navigate("/cart");
    } catch (error) {
      console.error("Buy now error:", error);
      showError(error.message);
    } finally {
      setAddingToCart(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-poppins pb-24 page-slide-up">
      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-white px-4 py-3 shadow-sm">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between">
            {/* Back Button & Logo */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/")}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
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
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <div className="w-10 h-10 bg-[#FF7A00] rounded-xl flex items-center justify-center shadow-lg shadow-orange-200">
                <span className="text-white text-lg font-bold">N</span>
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 line-clamp-1">
                  {restaurant?.restaurant_name || "Restaurant"}
                </h1>
                <p className="text-xs text-gray-500">
                  {restaurant?.city || "Loading..."}
                </p>
              </div>
            </div>

            {/* Cart Icon */}
            <button
              onClick={() => navigate("/cart")}
              className="relative p-2.5 bg-orange-50 rounded-full hover:bg-orange-100 transition-colors"
            >
              <svg
                className="w-5 h-5 text-[#FF7A00]"
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
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-[#FF7A00] text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <AnimatedAlert alert={alert} visible={visible} />

      {restaurantLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-orange-100 rounded-full"></div>
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-[#FF7A00] border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="mt-4 text-gray-500 text-sm font-medium">
            Loading restaurant...
          </p>
        </div>
      ) : error ? (
        <div className="px-4 py-12">
          <div className="bg-red-50 border border-red-100 text-red-700 px-6 py-5 rounded-2xl max-w-md mx-auto text-center">
            <div className="w-12 h-12 mx-auto mb-3 bg-red-100 rounded-full flex items-center justify-center">
              <svg
                className="w-6 h-6 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <p className="font-semibold text-lg mb-1">Something went wrong</p>
            <p className="text-sm text-red-600/80 mb-4">{error}</p>
            <button
              onClick={() => navigate("/")}
              className="px-6 py-2.5 bg-[#FF7A00] text-white font-semibold rounded-full hover:bg-orange-600 transition-all shadow-lg shadow-orange-200"
            >
              Back to Home
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Restaurant Hero Section */}
          {restaurant && (
            <div className="relative">
              {/* Cover Image */}
              <div className="relative h-48 sm:h-56 overflow-hidden">
                {restaurant.cover_image_url || restaurant.logo_url ? (
                  <img
                    src={restaurant.cover_image_url || restaurant.logo_url}
                    alt={restaurant.restaurant_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#FF7A00] to-orange-500"></div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
              </div>

              {/* Restaurant Info Card */}
              <div className="px-4 -mt-20 relative z-10">
                <div className="max-w-6xl mx-auto">
                  <div className="bg-white rounded-3xl shadow-lg p-5">
                    <div className="flex items-start gap-4">
                      {/* Logo */}
                      <div className="w-20 h-20 flex-shrink-0 rounded-2xl overflow-hidden shadow-md border-2 border-white">
                        {restaurant.logo_url ? (
                          <img
                            src={restaurant.logo_url}
                            alt="Logo"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-[#FF7A00] to-orange-500 flex items-center justify-center">
                            <span className="text-2xl font-bold text-white">
                              {restaurant.restaurant_name.charAt(0)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div>
                            <h2 className="text-xl font-bold text-gray-900 mb-1">
                              {restaurant.restaurant_name}
                            </h2>
                            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                              {showDistance && restaurantDistance && (
                                <span className="flex items-center gap-1 text-[#FF7A00] font-medium">
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
                                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                                    />
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                                    />
                                  </svg>
                                  {formatDistance(restaurantDistance)} away
                                </span>
                              )}
                              {restaurant.city && (
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
                                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                                    />
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                                    />
                                  </svg>
                                  {restaurant.city}
                                </span>
                              )}
                              {restaurant.opening_time &&
                                restaurant.close_time && (
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
                                    {formatRestaurantHours(
                                      restaurant.opening_time,
                                      restaurant.close_time,
                                    )}
                                  </span>
                                )}
                            </div>
                          </div>

                          {/* Rating Badge */}
                          {restaurant.rating && (
                            <div className="flex items-center gap-1 px-3 py-1.5 bg-green-600 rounded-lg text-white">
                              <span className="text-sm font-bold">
                                {restaurant.rating}
                              </span>
                              <svg
                                className="w-4 h-4"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                            </div>
                          )}
                        </div>

                        {restaurant.address && (
                          <p className="text-xs text-gray-400 mt-2 line-clamp-1">
                            {restaurant.address}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Closed Banner */}
                    {restaurant.is_open === false && (
                      <div className="mt-4 flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-100 rounded-xl">
                        <div className="w-10 h-10 flex-shrink-0 bg-red-100 rounded-full flex items-center justify-center">
                          <svg
                            className="w-5 h-5 text-red-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-red-700">
                            Restaurant is currently closed
                          </p>
                          <p className="text-xs text-red-500">
                            {restaurant.opening_time && restaurant.close_time
                              ? `Open hours: ${restaurant.opening_time} - ${restaurant.close_time}`
                              : "Check back later"}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Search and Foods Section */}
          <main className="px-4 py-6 max-w-6xl mx-auto">
            {/* Search Bar */}
            <div className="mb-6">
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
                  placeholder="Search menu items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 bg-white rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#FF7A00]/40 border border-gray-100 shadow-sm transition-all placeholder-gray-400"
                />
              </div>
            </div>

            {/* Menu Title */}
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-900">
                Menu{" "}
                {searchQuery && (
                  <span className="text-gray-400 font-normal text-sm">
                    • {foods.length} results
                  </span>
                )}
              </h3>
            </div>

            {/* Foods Grid */}
            {foodsLoading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="relative">
                  <div className="w-12 h-12 border-4 border-orange-100 rounded-full"></div>
                  <div className="absolute top-0 left-0 w-12 h-12 border-4 border-[#FF7A00] border-t-transparent rounded-full animate-spin"></div>
                </div>
                <p className="mt-3 text-gray-500 text-sm">Loading menu...</p>
              </div>
            ) : foodsError ? (
              <div className="bg-red-50 border border-red-100 text-red-700 px-5 py-4 rounded-2xl">
                <p className="font-semibold">Failed to load menu</p>
                <p className="text-sm mt-1">{foodsError}</p>
              </div>
            ) : foods.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-24 h-24 bg-orange-50 rounded-full flex items-center justify-center mb-4">
                  <svg
                    className="w-12 h-12 text-[#FF7A00]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">
                  No items found
                </h3>
                <p className="text-gray-500 text-center max-w-xs">
                  {searchQuery
                    ? "Try a different search term"
                    : "This restaurant hasn't added menu items yet"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {foods.map((food) => (
                  <div
                    key={food.id}
                    className="bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-lg transition-all duration-300 border border-gray-100/50"
                  >
                    {/* Food Image */}
                    <div className="relative h-40 overflow-hidden">
                      {food.image_url ? (
                        <img
                          src={food.image_url}
                          alt={food.name}
                          className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[#FF7A00] to-orange-400 flex items-center justify-center">
                          <svg
                            className="w-12 h-12 text-white/60"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M8.1 13.34l2.83-2.83L3.91 3.5a4.008 4.008 0 000 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z" />
                          </svg>
                        </div>
                      )}

                      {/* Rating Badge */}
                      {food.stars > 0 && (
                        <div className="absolute top-2 right-2 bg-white/95 backdrop-blur px-2 py-1 rounded-lg shadow-md flex items-center gap-1">
                          <svg
                            className="w-3.5 h-3.5 text-yellow-400"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          <span className="text-xs font-bold text-gray-800">
                            {food.stars}
                          </span>
                        </div>
                      )}

                      {/* Unavailable Overlay */}
                      {!food.is_available && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <span className="px-3 py-1 bg-red-500 text-white text-xs font-semibold rounded-full">
                            Unavailable
                          </span>
                        </div>
                      )}

                      {/* Quick Add Button (Floating) */}
                      {food.is_available && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            quickAddToCart(food);
                          }}
                          disabled={addingToCart === food.id}
                          className="absolute bottom-2 right-2 w-9 h-9 bg-[#FF7A00] text-white rounded-full shadow-lg flex items-center justify-center hover:bg-orange-600 transition-all hover:scale-110 disabled:opacity-75"
                        >
                          {addingToCart === food.id ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          ) : (
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
                                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                              />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Food Details */}
                    <div className="p-4">
                      <h4 className="font-semibold text-gray-900 mb-1 line-clamp-1">
                        {food.name}
                      </h4>

                      {food.description && (
                        <p className="text-xs text-gray-500 mb-3 line-clamp-2">
                          {food.description}
                        </p>
                      )}

                      {/* Available Time Tags */}
                      {food.available_time &&
                        food.available_time.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {food.available_time.map((time) => (
                              <span
                                key={time}
                                className="px-2 py-0.5 bg-orange-50 text-[#FF7A00] text-[10px] font-medium rounded-full"
                              >
                                {time.charAt(0).toUpperCase() + time.slice(1)}
                              </span>
                            ))}
                          </div>
                        )}

                      {/* Pricing */}
                      <div className="flex items-center justify-between">
                        <div>
                          {food.offer_price ? (
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-bold text-[#FF7A00]">
                                {formatPrice(food.offer_price)}
                              </span>
                              <span className="text-xs text-gray-400 line-through">
                                {formatPrice(food.regular_price)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-lg font-bold text-gray-900">
                              {formatPrice(food.regular_price)}
                            </span>
                          )}
                        </div>

                        <button
                          onClick={() =>
                            navigate(
                              `/restaurant/${restaurantId}/food/${food.id}`,
                            )
                          }
                          className="text-xs text-[#FF7A00] font-medium hover:underline"
                        >
                          View Details →
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
        </>
      )}

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
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
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

export default RestaurantFoods;
