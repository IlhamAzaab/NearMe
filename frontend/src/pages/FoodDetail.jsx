import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import BottomNavbar from "../components/BottomNavbar";
import AnimatedAlert, { useAlert } from "../components/AnimatedAlert";
import {
  useAddToCartMutation,
  usePublicFoodDetailQuery,
  usePublicRestaurantQuery,
} from "../hooks/useCustomerNotifications";

const FoodDetail = () => {
  const { restaurantId, foodId } = useParams();
  const navigate = useNavigate();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");

  // Form state
  const [selectedSize, setSelectedSize] = useState("regular");
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);
  const { alert, visible, showSuccess, showError } = useAlert();
  const addToCartMutation = useAddToCartMutation();
  const restaurantQuery = usePublicRestaurantQuery(restaurantId, {
    enabled: Boolean(restaurantId),
  });
  const foodQuery = usePublicFoodDetailQuery(restaurantId, foodId, {
    enabled: Boolean(restaurantId && foodId),
  });

  const restaurant = restaurantQuery.data;
  const food = foodQuery.data;
  const loading = restaurantQuery.isLoading || foodQuery.isLoading;
  const error = restaurantQuery.error?.message || foodQuery.error?.message || null;

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

  }, [restaurantId, foodId]);

  useEffect(() => {
    if (food) {
      setSelectedSize("regular");
    }
  }, [food]);

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

      if (!food?.is_available) {
        const slots = food?.available_time
          ?.map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join(", ");
        showError(
          slots
            ? `${food.name} is only available during ${slots} time`
            : `${food?.name || "This food"} is currently not available`,
        );
        return;
      }

      setAddingToCart(true);

      await addToCartMutation.mutateAsync({
          restaurant_id: restaurantId,
          food_id: foodId,
          size: selectedSize,
          quantity: quantity,
      });

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
            <div className="w-16 h-16 border-4 border-green-100 rounded-full"></div>
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-[#06C168] border-t-transparent rounded-full animate-spin"></div>
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
              className="px-6 py-3 bg-[#06C168] text-white font-semibold rounded-full hover:bg-green-600 transition-all shadow-lg shadow-green-200"
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
            <div className="relative h-56 sm:h-64 bg-gradient-to-br from-green-100 to-green-50">
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

              {/* Not Available Badge */}
              {!food.is_available && (
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent flex flex-col items-center justify-end pb-14">
                  <div className="bg-red-500/95 backdrop-blur-sm px-5 py-2.5 rounded-2xl shadow-xl flex items-center gap-2">
                    <svg
                      className="w-5 h-5 text-white"
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
                    <span className="text-white font-semibold text-sm">
                      Currently Not Available
                    </span>
                  </div>
                  {food.available_time?.length > 0 && (
                    <p className="text-white/90 text-xs mt-2 font-medium">
                      Available during:{" "}
                      {food.available_time
                        .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
                        .join(", ")}
                    </p>
                  )}
                </div>
              )}

              {/* Restaurant Badge */}
              <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-xl shadow-md">
                <p className="text-[#06C168] font-semibold text-xs">
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
                    ? "bg-green-50 border-2 border-[#06C168] shadow-sm"
                    : "bg-gray-50 border-2 border-transparent hover:border-green-200"
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        selectedSize === "regular"
                          ? "border-[#06C168] bg-[#06C168]"
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
                      <span className="text-lg font-bold text-[#06C168]">
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
                      ? "bg-green-50 border-2 border-[#06C168] shadow-sm"
                      : "bg-gray-50 border-2 border-transparent hover:border-green-200"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          selectedSize === "large"
                            ? "border-[#06C168] bg-[#06C168]"
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
                        <span className="text-lg font-bold text-[#06C168]">
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
                  className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-green-50 flex items-center justify-center transition-all font-bold text-lg text-gray-700 hover:text-[#06C168]"
                >
                  −
                </button>
                <span className="text-2xl font-bold text-[#06C168] min-w-[40px] text-center">
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-10 rounded-xl bg-[#06C168] hover:bg-green-600 flex items-center justify-center transition-all font-bold text-lg text-white shadow-md shadow-green-200"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Total & Actions Card */}
          <div className="bg-white rounded-2xl shadow-md overflow-hidden">
            {/* Total Price */}
            <div className="p-4 bg-gradient-to-r from-green-50 to-green-100/50 border-b border-green-100">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-gray-500 text-xs">Total Price</span>
                  <p className="text-xs text-gray-400">{quantity} item(s)</p>
                </div>
                <span className="text-2xl font-bold text-[#06C168]">
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
              {!food.is_available && (
                <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-red-500 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.072 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                  <span className="text-red-600 text-sm font-medium">
                    This item is currently not available for ordering
                  </span>
                </div>
              )}
              <button
                onClick={() => addToCart()}
                disabled={addingToCart || !food.is_available}
                className="w-full py-3 bg-[#06C168] text-white font-bold rounded-xl hover:bg-green-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base shadow-md shadow-green-200 hover:-translate-y-0.5"
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
                disabled={addingToCart || !food.is_available}
                className="w-full py-3 bg-white text-[#06C168] font-bold rounded-xl border-2 border-[#06C168] hover:bg-green-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base"
              >
                {addingToCart ? (
                  <>
                    <div className="w-5 h-5 border-2 border-[#06C168] border-t-transparent rounded-full animate-spin"></div>
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
