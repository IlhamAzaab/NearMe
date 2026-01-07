import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";

const RestaurantFoods = () => {
  const { restaurantId } = useParams();
  const navigate = useNavigate();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");

  const [restaurant, setRestaurant] = useState(null);
  const [foods, setFoods] = useState([]);
  const [restaurantLoading, setRestaurantLoading] = useState(true);
  const [foodsLoading, setFoodsLoading] = useState(true);
  const [error, setError] = useState(null); // restaurant load errors
  const [foodsError, setFoodsError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Cart state
  const [addingToCart, setAddingToCart] = useState(null); // stores food id of item being added
  const [cartMessage, setCartMessage] = useState(null);

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

    fetchRestaurant();
  }, [restaurantId]);

  // Fetch restaurant details once per restaurantId
  const fetchRestaurant = async () => {
    try {
      setRestaurantLoading(true);
      setError(null);

      const restaurantResponse = await fetch(
        `http://localhost:5000/public/restaurants/${restaurantId}`
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
        `http://localhost:5000/public/restaurants/${restaurantId}/foods`
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
      alert("Please login to add items to cart");
      navigate("/login");
      return;
    }

    if (role !== "customer") {
      alert("Only customers can add items to cart");
      return;
    }

    try {
      setAddingToCart(food.id);

      const token = localStorage.getItem("token");
      const response = await fetch("http://localhost:5000/cart/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          food_id: food.id,
          size: "regular", // Default size
          quantity: 1, // Default quantity
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to add to cart");
      }

      setCartMessage({ type: "success", text: "Item added to cart!" });

      // Clear message after 3 seconds
      setTimeout(() => setCartMessage(null), 3000);
    } catch (error) {
      console.error("Add to cart error:", error);
      setCartMessage({ type: "error", text: error.message });
    } finally {
      setAddingToCart(null);
    }
  };

  const buyNow = async (food) => {
    if (!isLoggedIn) {
      alert("Please login to continue");
      navigate("/login");
      return;
    }

    if (role !== "customer") {
      alert("Only customers can place orders");
      return;
    }

    try {
      setAddingToCart(food.id);

      const token = localStorage.getItem("token");
      const response = await fetch("http://localhost:5000/cart/add", {
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
      setCartMessage({ type: "error", text: error.message });
    } finally {
      setAddingToCart(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <SiteHeader
        isLoggedIn={isLoggedIn}
        role={role}
        userName={userName}
        userEmail={userEmail}
        onLogout={handleLogout}
      />

      {/* Success/Error Message */}
      {cartMessage && (
        <div className="fixed top-20 right-4 z-50 animate-fade-in">
          <div
            className={`px-6 py-3 rounded-lg shadow-lg ${
              cartMessage.type === "success"
                ? "bg-green-500 text-white"
                : "bg-red-500 text-white"
            }`}
          >
            {cartMessage.text}
          </div>
        </div>
      )}

      {restaurantLoading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      ) : error ? (
        <div className="container mx-auto px-4 py-12">
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg max-w-2xl mx-auto">
            <p className="font-semibold">Error</p>
            <p>{error}</p>
            <button
              onClick={() => navigate("/")}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
            >
              Back to Home
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Restaurant Header */}
          {restaurant && (
            <div className="bg-white shadow-md">
              <div className="relative h-64 bg-gradient-to-br from-indigo-500 to-purple-600 overflow-hidden">
                {restaurant.cover_image_url ? (
                  <img
                    src={restaurant.cover_image_url}
                    alt={restaurant.restaurant_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg
                      className="w-24 h-24 text-white opacity-50"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
                    </svg>
                  </div>
                )}
              </div>

              <div className="container mx-auto px-4">
                <div className="flex items-end gap-6 -mt-16 pb-6">
                  {/* Logo */}
                  <div className="w-32 h-32 bg-white rounded-xl shadow-lg overflow-hidden border-4 border-white flex-shrink-0">
                    {restaurant.logo_url ? (
                      <img
                        src={restaurant.logo_url}
                        alt="Logo"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
                        <span className="text-4xl font-bold text-white">
                          {restaurant.restaurant_name.charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Restaurant Info */}
                  <div className="flex-1 mt-16">
                    <div className="flex items-start justify-between">
                      <div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">
                          {restaurant.restaurant_name}
                        </h1>
                        <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                          {restaurant.city && (
                            <div className="flex items-center gap-2">
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
                                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                                />
                              </svg>
                              <span>{restaurant.city}</span>
                            </div>
                          )}
                          {(restaurant.opening_time ||
                            restaurant.close_time) && (
                            <div className="flex items-center gap-2">
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
                                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                              <span>
                                {restaurant.opening_time || "N/A"} -{" "}
                                {restaurant.close_time || "N/A"}
                              </span>
                            </div>
                          )}
                        </div>
                        {restaurant.address && (
                          <p className="text-sm text-gray-600 mt-2">
                            {restaurant.address}
                          </p>
                        )}
                      </div>

                      <button
                        onClick={() => navigate("/")}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition flex items-center gap-2"
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
                            d="M15 19l-7-7 7-7"
                          />
                        </svg>
                        Back
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Search and Foods Section */}
          <div className="container mx-auto px-4 py-8">
            {/* Search Bar */}
            <div className="mb-8">
              <div className="flex gap-2 max-w-2xl">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Search for foods..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                  <svg
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
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
              </div>
            </div>

            {/* Foods Grid */}
            {foodsLoading ? (
              <div className="flex justify-center items-center py-10">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
              </div>
            ) : foodsError ? (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg max-w-2xl">
                <p className="font-semibold">Failed to load foods</p>
                <p className="text-sm">{foodsError}</p>
              </div>
            ) : foods.length === 0 ? (
              <div className="text-center py-20">
                <svg
                  className="mx-auto h-16 w-16 text-gray-400 mb-4"
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
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  No foods available
                </h3>
                <p className="text-gray-500">
                  {searchQuery
                    ? "Try adjusting your search query"
                    : "This restaurant hasn't added any menu items yet"}
                </p>
              </div>
            ) : (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-800">
                    Menu Items{" "}
                    {searchQuery && `- Search Results (${foods.length})`}
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {foods.map((food) => (
                    <div
                      key={food.id}
                      className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-xl transition-shadow duration-300"
                    >
                      {/* Food Image */}
                      <div className="relative h-48 bg-gradient-to-br from-orange-400 to-pink-500 overflow-hidden">
                        {food.image_url ? (
                          <img
                            src={food.image_url}
                            alt={food.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg
                              className="w-16 h-16 text-white opacity-50"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M8.1 13.34l2.83-2.83L3.91 3.5a4.008 4.008 0 000 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z" />
                            </svg>
                          </div>
                        )}

                        {/* Rating Badge */}
                        {food.stars > 0 && (
                          <div className="absolute top-3 right-3 bg-white px-2 py-1 rounded-lg shadow-lg flex items-center gap-1">
                            <svg
                              className="w-4 h-4 text-yellow-400"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            <span className="text-sm font-semibold text-gray-800">
                              {food.stars}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Food Details */}
                      <div className="p-4">
                        <h3 className="text-lg font-bold text-gray-800 mb-2 line-clamp-1">
                          {food.name}
                        </h3>

                        {food.description && (
                          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                            {food.description}
                          </p>
                        )}

                        {/* Available Time */}
                        <div className="mb-3">
                          <div className="flex flex-wrap gap-1">
                            {food.available_time &&
                              food.available_time.map((time) => (
                                <span
                                  key={time}
                                  className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded"
                                >
                                  {time.charAt(0).toUpperCase() + time.slice(1)}
                                </span>
                              ))}
                          </div>
                        </div>

                        {/* Pricing */}
                        <div className="space-y-2 border-t border-gray-100 pt-3">
                          {/* Regular Size */}
                          <div className="flex justify-between items-center">
                            <div>
                              <span className="text-sm text-gray-600">
                                {food.regular_size || "Regular"}
                              </span>
                              {food.regular_portion && (
                                <span className="text-xs text-gray-500 ml-1">
                                  ({food.regular_portion})
                                </span>
                              )}
                            </div>
                            <div className="text-right">
                              {food.offer_price ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-gray-400 line-through">
                                    {formatPrice(food.regular_price)}
                                  </span>
                                  <span className="text-lg font-bold text-green-600">
                                    {formatPrice(food.offer_price)}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-lg font-bold text-gray-800">
                                  {formatPrice(food.regular_price)}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Extra Size */}
                          {food.extra_price && (
                            <div className="flex justify-between items-center">
                              <div>
                                <span className="text-sm text-gray-600">
                                  {food.extra_size || "Extra"}
                                </span>
                                {food.extra_portion && (
                                  <span className="text-xs text-gray-500 ml-1">
                                    ({food.extra_portion})
                                  </span>
                                )}
                              </div>
                              <span className="text-lg font-bold text-gray-800">
                                {formatPrice(food.extra_price)}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Buttons */}
                        <div className="flex flex-col gap-2 mt-4">
                          {/* View Details Button */}
                          <button
                            onClick={() =>
                              navigate(
                                `/restaurant/${restaurantId}/food/${food.id}`
                              )
                            }
                            disabled={!food.is_available}
                            className={`w-full py-2 px-4 font-semibold rounded-lg transition-colors border-2 ${
                              food.is_available
                                ? "border-indigo-600 text-indigo-600 hover:bg-indigo-50"
                                : "border-gray-300 text-gray-500 cursor-not-allowed"
                            }`}
                          >
                            Details
                          </button>

                          {/* Quick Add to Cart Button */}
                          <button
                            onClick={() => quickAddToCart(food)}
                            disabled={
                              !food.is_available || addingToCart === food.id
                            }
                            className={`w-full py-2 px-4 font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                              food.is_available
                                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                                : "bg-gray-300 text-gray-500 cursor-not-allowed"
                            } ${addingToCart === food.id ? "opacity-75" : ""}`}
                          >
                            {addingToCart === food.id ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                <span className="text-sm">Adding...</span>
                              </>
                            ) : (
                              <>
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
                                    d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                                  />
                                </svg>
                                Add to Cart
                              </>
                            )}
                          </button>

                          {/* Buy Now Button */}
                          <button
                            onClick={() => buyNow(food)}
                            disabled={
                              !food.is_available || addingToCart === food.id
                            }
                            className={`w-full py-2 px-4 font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 ${
                              food.is_available
                                ? "bg-amber-500 text-white hover:bg-amber-600"
                                : "bg-gray-300 text-gray-500 cursor-not-allowed"
                            } ${addingToCart === food.id ? "opacity-75" : ""}`}
                          >
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
                                d="M13 7H7m0 0V1m0 6l5.5-5.5M11 17h6m0 0v6m0-6l-5.5 5.5"
                              />
                            </svg>
                            Buy Now
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default RestaurantFoods;
