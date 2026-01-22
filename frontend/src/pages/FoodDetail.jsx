import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";

const FoodDetail = () => {
  const { restaurantId, foodId } = useParams();
  const navigate = useNavigate();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");

  const [restaurant, setRestaurant] = useState(null);
  const [food, setFood] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form state
  const [selectedSize, setSelectedSize] = useState("regular");
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);
  const [message, setMessage] = useState(null);

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

    fetchFood();
  }, [restaurantId, foodId]);

  const fetchFood = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch restaurant
      const restaurantRes = await fetch(
        `http://localhost:5000/public/restaurants/${restaurantId}`
      );
      const restaurantData = await restaurantRes.json();

      if (!restaurantRes.ok) {
        throw new Error(restaurantData.message || "Restaurant not found");
      }

      setRestaurant(restaurantData.restaurant);

      // Fetch food
      const foodRes = await fetch(
        `http://localhost:5000/public/restaurants/${restaurantId}/foods/${foodId}`
      );
      const foodData = await foodRes.json();

      if (!foodRes.ok) {
        throw new Error(foodData.message || "Food not found");
      }

      setFood(foodData.food);
      // Set default size based on what's available
      setSelectedSize(foodData.food.extra_price ? "regular" : "regular");
    } catch (err) {
      console.error("Fetch error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("userEmail");
    setIsLoggedIn(false);
    setRole("");
    setUserEmail("");
    setUserName("");
    navigate("/home");
  };

  const formatPrice = (price) => {
    return price ? `Rs. ${parseFloat(price).toFixed(2)}` : "N/A";
  };

  const addToCart = async ({ goToCheckout = false } = {}) => {
    try {
      // Debug: Check localStorage values
      const currentToken = localStorage.getItem("token");
      const currentRole = localStorage.getItem("role");
      console.log("🛒 addToCart called");
      console.log("📦 localStorage token:", currentToken ? `${currentToken.substring(0, 20)}...` : "NULL");
      console.log("📦 localStorage role:", currentRole);
      console.log("📦 isLoggedIn state:", isLoggedIn);
      console.log("📦 role state:", role);

      // Check real-time token instead of state
      if (!currentToken || currentToken === "null" || currentToken === "undefined") {
        alert("Please login to add items to cart");
        navigate("/login");
        return;
      }

      if (currentRole !== "customer") {
        alert("Only customers can add items to cart");
        return;
      }

      setAddingToCart(true);

      const token = currentToken;
      const response = await fetch("http://localhost:5000/cart/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          food_id: foodId,
          size: selectedSize,
          quantity: quantity,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to add to cart");
      }

      if (goToCheckout) {
        navigate("/cart");
        return;
      }

      setMessage({ type: "success", text: "Item added to cart successfully!" });

      setTimeout(() => {
        navigate(`/restaurant/${restaurantId}/foods`);
      }, 2000);
    } catch (error) {
      console.error("Add to cart error:", error);
      setMessage({ type: "error", text: error.message });
    } finally {
      setAddingToCart(false);
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
      {message && (
        <div className="fixed top-20 right-4 z-50 animate-fade-in">
          <div
            className={`px-6 py-3 rounded-lg shadow-lg ${
              message.type === "success"
                ? "bg-green-500 text-white"
                : "bg-red-500 text-white"
            }`}
          >
            {message.text}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-32">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      ) : error ? (
        <div className="container mx-auto px-4 py-12">
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg max-w-2xl mx-auto">
            <p className="font-semibold">Error</p>
            <p>{error}</p>
            <button
              onClick={() => navigate(-1)}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
            >
              Go Back
            </button>
          </div>
        </div>
      ) : food ? (
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            {/* Back Button */}
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-semibold mb-8"
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
              Back to Menu
            </button>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-white rounded-xl shadow-lg overflow-hidden">
              {/* Food Image */}
              <div className="relative h-96 bg-gradient-to-br from-orange-400 to-pink-500">
                {food.image_url ? (
                  <img
                    src={food.image_url}
                    alt={food.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg
                      className="w-24 h-24 text-white opacity-50"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8.1 13.34l2.83-2.83L3.91 3.5a4.008 4.008 0 000 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z" />
                    </svg>
                  </div>
                )}

                {/* Rating Badge */}
                {food.stars > 0 && (
                  <div className="absolute top-4 right-4 bg-white px-3 py-2 rounded-lg shadow-lg flex items-center gap-1">
                    <svg
                      className="w-5 h-5 text-yellow-400"
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

              {/* Food Details and Form */}
              <div className="p-8 flex flex-col justify-between">
                {/* Restaurant Info */}
                <div className="mb-6">
                  <p className="text-indigo-600 font-semibold mb-2">
                    {restaurant?.restaurant_name}
                  </p>
                  <h1 className="text-4xl font-bold text-gray-800 mb-3">
                    {food.name}
                  </h1>

                  {food.description && (
                    <p className="text-gray-600 text-base mb-4">
                      {food.description}
                    </p>
                  )}

                  {/* Available Time */}
                  {food.available_time && food.available_time.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-6">
                      {food.available_time.map((time) => (
                        <span
                          key={time}
                          className="px-3 py-1 bg-indigo-50 text-indigo-700 text-sm font-medium rounded-full"
                        >
                          {time.charAt(0).toUpperCase() + time.slice(1)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Price Section */}
                <div className="mb-8 p-6 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border-2 border-indigo-100">
                  <p className="text-gray-600 text-sm mb-3">Choose Size</p>

                  {/* Regular Size */}
                  <div
                    onClick={() => setSelectedSize("regular")}
                    className={`p-4 border-2 rounded-lg cursor-pointer transition mb-3 ${
                      selectedSize === "regular"
                        ? "border-indigo-600 bg-indigo-50"
                        : "border-gray-200 hover:border-indigo-300"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              selectedSize === "regular"
                                ? "border-indigo-600"
                                : "border-gray-300"
                            }`}
                          >
                            {selectedSize === "regular" && (
                              <div className="w-3 h-3 rounded-full bg-indigo-600"></div>
                            )}
                          </div>
                          <span className="font-semibold text-gray-800">
                            {food.regular_size || "Regular"}
                          </span>
                        </div>
                        {food.regular_portion && (
                          <p className="text-xs text-gray-500 ml-7 mt-1">
                            {food.regular_portion}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        {food.offer_price ? (
                          <div>
                            <span className="text-sm text-gray-400 line-through">
                              {formatPrice(food.regular_price)}
                            </span>
                            <div className="text-xl font-bold text-green-600">
                              {formatPrice(food.offer_price)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xl font-bold text-gray-800">
                            {formatPrice(food.regular_price)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Large Size (if available) */}
                  {food.extra_price && (
                    <div
                      onClick={() => setSelectedSize("large")}
                      className={`p-4 border-2 rounded-lg cursor-pointer transition ${
                        selectedSize === "large"
                          ? "border-indigo-600 bg-indigo-50"
                          : "border-gray-200 hover:border-indigo-300"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                selectedSize === "large"
                                  ? "border-indigo-600"
                                  : "border-gray-300"
                              }`}
                            >
                              {selectedSize === "large" && (
                                <div className="w-3 h-3 rounded-full bg-indigo-600"></div>
                              )}
                            </div>
                            <span className="font-semibold text-gray-800">
                              {food.extra_size || "Large"}
                            </span>
                          </div>
                          {food.extra_portion && (
                            <p className="text-xs text-gray-500 ml-7 mt-1">
                              {food.extra_portion}
                            </p>
                          )}
                        </div>
                        <span className="text-xl font-bold text-gray-800">
                          {formatPrice(food.extra_price)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Quantity Section */}
                <div className="mb-8">
                  <p className="text-gray-700 font-semibold mb-3">Quantity</p>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="w-12 h-12 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition font-semibold text-xl"
                    >
                      −
                    </button>
                    <span className="text-4xl font-bold text-indigo-600 min-w-[80px] text-center">
                      {quantity}
                    </span>
                    <button
                      onClick={() => setQuantity(quantity + 1)}
                      className="w-12 h-12 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition font-semibold text-xl"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Total Price */}
                <div className="mb-8 p-4 bg-gray-100 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700 font-medium">
                      Total Price
                    </span>
                    <span className="text-3xl font-bold text-indigo-600">
                      {formatPrice(
                        (selectedSize === "large" && food.extra_price
                          ? food.extra_price
                          : food.offer_price || food.regular_price) * quantity
                      )}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col md:flex-row gap-3">
                  <button
                    onClick={() => addToCart()}
                    disabled={addingToCart}
                    className="w-full py-4 px-6 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
                  >
                    {addingToCart ? (
                      <>
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                        Adding...
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-6 h-6"
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

                  <button
                    onClick={() => addToCart({ goToCheckout: true })}
                    disabled={addingToCart}
                    className="w-full py-4 px-6 bg-amber-500 text-white font-bold rounded-lg hover:bg-amber-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
                  >
                    {addingToCart ? (
                      <>
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                        Processing...
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-6 h-6"
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
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default FoodDetail;
