import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import BottomNavbar from "../components/BottomNavbar";
import AnimatedAlert, { useAlert } from "../components/AnimatedAlert";
import { API_URL } from "../config";

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
  const { alert, visible, showSuccess, showError } = useAlert();

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
        `${API_URL}/public/restaurants/${restaurantId}`,
      );
      const restaurantData = await restaurantRes.json();

      if (!restaurantRes.ok) {
        throw new Error(restaurantData.message || "Restaurant not found");
      }

      setRestaurant(restaurantData.restaurant);

      // Fetch food
      const foodRes = await fetch(
        `${API_URL}/public/restaurants/${restaurantId}/foods/${foodId}`,
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
      const currentToken = localStorage.getItem("token");
      const currentRole = localStorage.getItem("role");

      // Check real-time token instead of state
      if (
        !currentToken ||
        currentToken === "null" ||
        currentToken === "undefined"
      ) {
        showError("Please login to add items to cart");
        navigate("/login");
        return;
      }

      if (currentRole !== "customer") {
        showError("Only customers can add items to cart");
        return;
      }

      if (restaurant?.is_open === false) {
        showError(
          `${restaurant?.restaurant_name || "This restaurant"} is currently closed`,
        );
        return;
      }

      setAddingToCart(true);

      const token = currentToken;
      const response = await fetch(`${API_URL}/cart/add`, {
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
        // Navigate to cart with restaurantId to auto-select this restaurant's cart
        navigate(`/cart?restaurantId=${restaurantId}`);
        return;
      }

      showSuccess("Item added to cart successfully!");

      setTimeout(() => {
        navigate(`/restaurant/${restaurantId}/foods`);
      }, 2000);
    } catch (error) {
      console.error("Add to cart error:", error);
      showError(error.message);
    } finally {
      setAddingToCart(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-poppins pb-24 page-slide-up">
      {/* Sticky Header */}

      <AnimatedAlert alert={alert} visible={visible} />

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-orange-100 rounded-full"></div>
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-[#FF7A00] border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="mt-4 text-gray-500 text-sm font-medium">
            Loading delicious details...
          </p>
        </div>
      ) : error ? (
        <div className="px-4 py-12 max-w-lg mx-auto">
          <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-3xl text-center">
            <span className="text-4xl mb-4 block"></span>
            <p className="font-semibold text-lg mb-2">
              Oops! Something went wrong
            </p>
            <p className="text-sm mb-4">{error}</p>
            <button
              onClick={() => navigate(-1)}
              className="px-6 py-3 bg-[#FF7A00] text-white font-semibold rounded-full hover:bg-orange-600 transition-all shadow-lg shadow-orange-200"
            >
              Go Back
            </button>
          </div>
        </div>
      ) : food ? (
        <main className="px-3 py-4 max-w-4xl mx-auto">
          {/* Food Hero Card */}
          <div className="bg-white rounded-2xl shadow-md overflow-hidden mb-4">
            {/* Food Image */}
            <div className="relative h-56 sm:h-64 bg-gradient-to-br from-orange-100 to-orange-50">
              {food.image_url ? (
                <img
                  src={food.image_url}
                  alt={food.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-8xl"></span>
                </div>
              )}

              {/* Rating Badge */}
              {food.stars > 0 && (
                <div className="absolute top-3 right-3 bg-green-600 text-white px-2 py-1 rounded-full shadow-md flex items-center gap-1 text-sm">
                  <span>★</span>
                  <span className="font-semibold">{food.stars}</span>
                </div>
              )}

              {/* Restaurant Badge */}
              <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-xl shadow-md">
                <p className="text-[#FF7A00] font-semibold text-xs">
                  {restaurant?.restaurant_name}
                </p>
              </div>
            </div>

            {/* Food Info */}
            <div className="p-4">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">
                {food.name}
              </h1>

              {food.description && (
                <p className="text-gray-500 text-xs leading-relaxed">
                  {food.description}
                </p>
              )}
            </div>
          </div>

          {/* Size Selection Card */}
          <div className="bg-white rounded-2xl shadow-md p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="font-bold text-gray-900 text-sm">Choose Size</h3>
            </div>

            <div className="space-y-2">
              {/* Regular Size */}
              <div
                onClick={() => setSelectedSize("regular")}
                className={`p-3 rounded-xl cursor-pointer transition-all ${
                  selectedSize === "regular"
                    ? "bg-orange-50 border-2 border-[#FF7A00] shadow-sm"
                    : "bg-gray-50 border-2 border-transparent hover:border-orange-200"
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        selectedSize === "regular"
                          ? "border-[#FF7A00] bg-[#FF7A00]"
                          : "border-gray-300"
                      }`}
                    >
                      {selectedSize === "regular" && (
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
                      )}
                    </div>
                    <div>
                      <span className="font-semibold text-gray-900 text-sm">
                        {food.regular_size || "Regular"}
                      </span>
                      {food.regular_portion && (
                        <p className="text-xs text-gray-500">
                          {food.regular_portion}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {food.offer_price ? (
                      <div>
                        <span className="text-xs text-gray-400 line-through">
                          {formatPrice(food.regular_price)}
                        </span>
                        <div className="text-lg font-bold text-green-600">
                          {formatPrice(food.offer_price)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-lg font-bold text-[#FF7A00]">
                        {formatPrice(food.regular_price)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Large Size */}
              {food.extra_price && (
                <div
                  onClick={() => setSelectedSize("large")}
                  className={`p-3 rounded-xl cursor-pointer transition-all ${
                    selectedSize === "large"
                      ? "bg-orange-50 border-2 border-[#FF7A00] shadow-sm"
                      : "bg-gray-50 border-2 border-transparent hover:border-orange-200"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          selectedSize === "large"
                            ? "border-[#FF7A00] bg-[#FF7A00]"
                            : "border-gray-300"
                        }`}
                      >
                        {selectedSize === "large" && (
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
                        )}
                      </div>
                      <div>
                        <span className="font-semibold text-gray-900 text-sm">
                          {food.extra_size || "Large"}
                        </span>
                        {food.extra_portion && (
                          <p className="text-xs text-gray-500">
                            {food.extra_portion}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {food.extra_offer_price ? (
                        <div>
                          <span className="text-xs text-gray-400 line-through">
                            {formatPrice(food.extra_price)}
                          </span>
                          <div className="text-lg font-bold text-green-600">
                            {formatPrice(food.extra_offer_price)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-lg font-bold text-[#FF7A00]">
                          {formatPrice(food.extra_price)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quantity Card */}
          <div className="bg-white rounded-2xl shadow-md p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-900 text-sm">Quantity</h3>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-orange-50 flex items-center justify-center transition-all font-bold text-lg text-gray-700 hover:text-[#FF7A00]"
                >
                  −
                </button>
                <span className="text-2xl font-bold text-[#FF7A00] min-w-[40px] text-center">
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-10 rounded-xl bg-[#FF7A00] hover:bg-orange-600 flex items-center justify-center transition-all font-bold text-lg text-white shadow-md shadow-orange-200"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Total & Actions Card */}
          <div className="bg-white rounded-2xl shadow-md overflow-hidden">
            {/* Total Price */}
            <div className="p-4 bg-gradient-to-r from-orange-50 to-orange-100/50 border-b border-orange-100">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-gray-500 text-xs">Total Price</span>
                  <p className="text-xs text-gray-400">{quantity} item(s)</p>
                </div>
                <span className="text-2xl font-bold text-[#FF7A00]">
                  {formatPrice(
                    (selectedSize === "large" && food.extra_price
                      ? food.extra_offer_price || food.extra_price
                      : food.offer_price || food.regular_price) * quantity,
                  )}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="p-4 space-y-2">
              <button
                onClick={() => addToCart()}
                disabled={addingToCart}
                className="w-full py-3 bg-[#FF7A00] text-white font-bold rounded-xl hover:bg-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base shadow-md shadow-orange-200 hover:-translate-y-0.5"
              >
                {addingToCart ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Adding...
                  </>
                ) : (
                  <>
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
                    Add to Cart
                  </>
                )}
              </button>

              <button
                onClick={() => addToCart({ goToCheckout: true })}
                disabled={addingToCart}
                className="w-full py-3 bg-white text-[#FF7A00] font-bold rounded-xl border-2 border-[#FF7A00] hover:bg-orange-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base"
              >
                {addingToCart ? (
                  <>
                    <div className="w-5 h-5 border-2 border-[#FF7A00] border-t-transparent rounded-full animate-spin"></div>
                    Processing...
                  </>
                ) : (
                  <>
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
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    Buy Now
                  </>
                )}
              </button>
            </div>
          </div>
        </main>
      ) : null}

      {/* Bottom Navigation */}
      <BottomNavbar />
    </div>
  );
};

export default FoodDetail;
