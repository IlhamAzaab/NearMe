import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";

const Cart = () => {
  const navigate = useNavigate();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");

  const [carts, setCarts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingItem, setUpdatingItem] = useState(null);
  const [message, setMessage] = useState(null);
  const [selectedCartId, setSelectedCartId] = useState(null);
  const selectedCart = carts.find((cart) => cart.id === selectedCartId) || null;

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedRole = localStorage.getItem("role");
    const email = localStorage.getItem("userEmail");

    if (!token || storedRole !== "customer") {
      navigate("/login");
      return;
    }

    setIsLoggedIn(!!token);
    setRole(storedRole || "");
    setUserEmail(email || "");

    if (email) {
      const namePart = email.split("@")[0];
      setUserName(namePart.charAt(0).toUpperCase() + namePart.slice(1));
    }

    fetchCarts();
  }, [navigate]);

  const fetchCarts = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem("token");
      const response = await fetch("http://localhost:5000/cart", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to fetch cart");
      }

      setCarts(data.carts || []);
      setSelectedCartId((prev) =>
        data.carts && data.carts.some((cart) => cart.id === prev) ? prev : null
      );
    } catch (err) {
      console.error("Fetch cart error:", err);
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
    navigate("/");
  };

  const formatPrice = (price) => {
    return price ? `Rs. ${parseFloat(price).toFixed(2)}` : "N/A";
  };

  const updateQuantity = async (itemId, newQuantity) => {
    if (newQuantity < 1) return;

    try {
      setUpdatingItem(itemId);

      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:5000/cart/item/${itemId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ quantity: newQuantity }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to update quantity");
      }

      // Refresh cart
      await fetchCarts();
      showMessage("Quantity updated", "success");
    } catch (err) {
      console.error("Update quantity error:", err);
      showMessage(err.message, "error");
    } finally {
      setUpdatingItem(null);
    }
  };

  const removeItem = async (itemId) => {
    if (!confirm("Remove this item from cart?")) return;

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:5000/cart/item/${itemId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to remove item");
      }

      await fetchCarts();
      showMessage("Item removed from cart", "success");
    } catch (err) {
      console.error("Remove item error:", err);
      showMessage(err.message, "error");
    }
  };

  const removeCart = async (cartId) => {
    if (!confirm("Remove all items from this restaurant?")) return;

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`http://localhost:5000/cart/${cartId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to remove cart");
      }

      await fetchCarts();
      setSelectedCartId((prev) => (prev === cartId ? null : prev));
      showMessage("Cart cleared", "success");
    } catch (err) {
      console.error("Remove cart error:", err);
      showMessage(err.message, "error");
    }
  };

  const showMessage = (text, type) => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleCheckout = (cartId) => {
    navigate(`/checkout?cartId=${cartId}`);
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

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Shopping Cart
          </h1>
          <p className="text-gray-600">
            Review your items and proceed to checkout
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg max-w-2xl">
            <p className="font-semibold">Error</p>
            <p>{error}</p>
          </div>
        ) : carts.length === 0 ? (
          <div className="text-center py-20">
            <svg
              className="mx-auto h-24 w-24 text-gray-400 mb-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <h3 className="text-2xl font-semibold text-gray-700 mb-3">
              Your cart is empty
            </h3>
            <p className="text-gray-500 mb-6">
              Add some delicious food to get started!
            </p>
            <button
              onClick={() => navigate("/")}
              className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition"
            >
              Browse Restaurants
            </button>
          </div>
        ) : selectedCart ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setSelectedCartId(null)}
                className="inline-flex items-center gap-2 px-3 py-2 text-indigo-600 hover:text-indigo-800 font-semibold"
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
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Back to restaurants
              </button>
              <button
                onClick={() => removeCart(selectedCart.id)}
                className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition"
              >
                Clear this cart
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-md overflow-hidden">
              {/* Restaurant Header */}
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {selectedCart.restaurant.logo_url ? (
                      <img
                        src={selectedCart.restaurant.logo_url}
                        alt={selectedCart.restaurant.restaurant_name}
                        className="w-16 h-16 rounded-lg object-cover border-2 border-white"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-white bg-opacity-20 flex items-center justify-center">
                        <span className="text-2xl font-bold">
                          {selectedCart.restaurant.restaurant_name.charAt(0)}
                        </span>
                      </div>
                    )}
                    <div>
                      <h2 className="text-2xl font-bold">
                        {selectedCart.restaurant.restaurant_name}
                      </h2>
                      <p className="text-indigo-100 text-sm">
                        {selectedCart.restaurant.city} •{" "}
                        {selectedCart.item_count} item
                        {selectedCart.item_count !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-indigo-100">Cart Total</p>
                    <p className="text-3xl font-bold">
                      {formatPrice(selectedCart.cart_total)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Cart Items */}
              <div className="p-6">
                <div className="space-y-4">
                  {selectedCart.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:shadow-md transition"
                    >
                      {/* Food Image */}
                      <div className="w-24 h-24 flex-shrink-0">
                        {item.food_image_url ? (
                          <img
                            src={item.food_image_url}
                            alt={item.food_name}
                            className="w-full h-full object-cover rounded-lg"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-orange-400 to-pink-500 rounded-lg flex items-center justify-center">
                            <svg
                              className="w-10 h-10 text-white opacity-50"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M8.1 13.34l2.83-2.83L3.91 3.5a4.008 4.008 0 000 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Item Details */}
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-800">
                          {item.food_name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded">
                            {item.size.charAt(0).toUpperCase() +
                              item.size.slice(1)}
                          </span>
                          {!item.is_available && (
                            <span className="px-2 py-1 bg-red-50 text-red-700 text-xs font-medium rounded">
                              Currently Unavailable
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {formatPrice(item.unit_price)} each
                        </p>
                      </div>

                      {/* Quantity Controls */}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() =>
                            updateQuantity(item.id, item.quantity - 1)
                          }
                          disabled={
                            updatingItem === item.id || item.quantity <= 1
                          }
                          className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition"
                        >
                          <svg
                            className="w-4 h-4 text-gray-700"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M20 12H4"
                            />
                          </svg>
                        </button>
                        <span className="text-lg font-bold text-gray-800 min-w-[2rem] text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() =>
                            updateQuantity(item.id, item.quantity + 1)
                          }
                          disabled={updatingItem === item.id}
                          className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition"
                        >
                          <svg
                            className="w-4 h-4 text-gray-700"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 4v16m8-8H4"
                            />
                          </svg>
                        </button>
                      </div>

                      {/* Price */}
                      <div className="text-right min-w-[100px]">
                        <div className="text-xl font-bold text-gray-800">
                          {formatPrice(item.total_price)}
                        </div>
                      </div>

                      {/* Remove Button */}
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-red-500 hover:text-red-700 transition"
                      >
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
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Cart Summary */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <p className="text-gray-600">
                        Total Items: {selectedCart.total_items}
                      </p>
                      <p className="text-sm text-gray-500">
                        Prices are always up-to-date
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600 mb-1">Cart Total</p>
                      <p className="text-3xl font-bold text-indigo-600">
                        {formatPrice(selectedCart.cart_total)}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() =>
                        navigate(
                          `/restaurant/${selectedCart.restaurant_id}/foods`
                        )
                      }
                      className="flex-1 px-6 py-3 border-2 border-indigo-600 text-indigo-600 font-semibold rounded-lg hover:bg-indigo-50 transition"
                    >
                      Add More Items
                    </button>
                    <button
                      onClick={() => handleCheckout(selectedCart.id)}
                      className="flex-1 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition flex items-center justify-center gap-2"
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
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                      Proceed to Checkout
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-800">
              Active restaurants
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {carts.map((cart) => (
                <div
                  key={cart.id}
                  className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition flex flex-col gap-3"
                >
                  <div className="flex items-center gap-3">
                    {cart.restaurant.logo_url ? (
                      <img
                        src={cart.restaurant.logo_url}
                        alt={cart.restaurant.restaurant_name}
                        className="w-14 h-14 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center">
                        {cart.restaurant.restaurant_name.charAt(0)}
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">
                        {cart.restaurant.restaurant_name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {cart.restaurant.city}
                      </p>
                      <p className="text-sm text-gray-600">
                        {cart.item_count} item{cart.item_count !== 1 ? "s" : ""}{" "}
                        • {formatPrice(cart.cart_total)}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedCartId(cart.id)}
                      className="flex-1 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition"
                    >
                      View items
                    </button>
                    <button
                      onClick={() => removeCart(cart.id)}
                      className="px-4 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Cart;
