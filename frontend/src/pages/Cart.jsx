import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

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
  const [activeNav, setActiveNav] = useState("cart");

  // Calculate total cart count for badge
  const cartCount = carts.reduce((sum, cart) => {
    return sum + (cart.items || []).reduce((itemSum, item) => itemSum + item.quantity, 0);
  }, 0);

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
    <div className="min-h-screen bg-gray-50 font-poppins pb-24">
      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-white px-4 py-3 shadow-sm">
        <div className="max-w-6xl mx-auto">
          {/* Logo and Title Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#FF7A00] rounded-xl flex items-center justify-center shadow-lg shadow-orange-200">
                <span className="text-white text-lg font-bold">N</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Shopping Cart</h1>
                <p className="text-xs text-gray-500">Review your items and proceed to checkout</p>
              </div>
            </div>
            
            {/* Cart Icon with Badge */}
            <div className="relative p-2.5 bg-orange-50 rounded-full">
              <svg className="w-5 h-5 text-[#FF7A00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
              </svg>
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-[#FF7A00] text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Success/Error Message */}
      {message && (
        <div className="fixed top-20 right-4 z-50 animate-fade-in">
          <div
            className={`px-5 py-3 rounded-2xl shadow-lg ${
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
      <main className="px-4 py-5 max-w-6xl mx-auto">
        {!isLoggedIn ? (
          <div className="text-center py-20">
            <div className="w-24 h-24 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
              <svg
                className="w-12 h-12 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">
              Please login to view your cart
            </h3>
            <p className="text-gray-500 text-sm mb-6">
              Sign in to add items and checkout
            </p>
            <button
              onClick={() => navigate("/login")}
              className="px-8 py-3.5 bg-[#FF7A00] text-white font-semibold rounded-full hover:bg-orange-600 transition-all shadow-lg shadow-orange-200"
            >
              Login
            </button>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-orange-100 rounded-full"></div>
              <div className="absolute top-0 left-0 w-16 h-16 border-4 border-[#FF7A00] border-t-transparent rounded-full animate-spin"></div>
            </div>
            <p className="mt-4 text-gray-500 text-sm font-medium">Loading your cart...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-100 text-red-600 px-5 py-4 rounded-2xl max-w-2xl">
            <p className="font-semibold">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        ) : carts.length === 0 ? (
          /* Empty Cart State */
          <div className="flex flex-col items-center justify-center py-16 px-4">
            {/* Friendly Illustration */}
            <div className="relative mb-8">
              {/* Background circle */}
              <div className="w-48 h-48 bg-orange-50 rounded-full flex items-center justify-center">
                {/* Shopping bag with food illustration */}
                <svg viewBox="0 0 120 120" className="w-32 h-32">
                  {/* Shopping bag */}
                  <path d="M30 45 L30 95 C30 100 35 105 40 105 L80 105 C85 105 90 100 90 95 L90 45 Z" fill="#FFEDD5" stroke="#FF7A00" strokeWidth="2"/>
                  
                  {/* Bag handles */}
                  <path d="M45 45 L45 35 C45 25 55 20 60 20 C65 20 75 25 75 35 L75 45" fill="none" stroke="#FF7A00" strokeWidth="3" strokeLinecap="round"/>
                  
                  {/* Food items peeking out */}
                  {/* Bread/Baguette */}
                  <ellipse cx="50" cy="50" rx="8" ry="15" fill="#F59E0B" transform="rotate(-15 50 50)"/>
                  <ellipse cx="50" cy="48" rx="6" ry="12" fill="#FBBF24" transform="rotate(-15 50 50)"/>
                  
                  {/* Apple */}
                  <circle cx="70" cy="55" r="10" fill="#EF4444"/>
                  <circle cx="68" cy="52" r="3" fill="#FCA5A5" opacity="0.6"/>
                  <path d="M70 45 L72 40" stroke="#22C55E" strokeWidth="2" strokeLinecap="round"/>
                  <ellipse cx="74" cy="42" rx="3" ry="2" fill="#22C55E"/>
                  
                  {/* Carrot */}
                  <path d="M38 55 L45 75" stroke="#F97316" strokeWidth="6" strokeLinecap="round"/>
                  <path d="M38 55 L35 48" stroke="#22C55E" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M38 55 L40 47" stroke="#22C55E" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M38 55 L37 46" stroke="#22C55E" strokeWidth="2" strokeLinecap="round"/>
                  
                  {/* Decorative dots on bag */}
                  <circle cx="50" cy="85" r="3" fill="#FDBA74"/>
                  <circle cx="60" cy="88" r="2" fill="#FDBA74"/>
                  <circle cx="70" cy="85" r="3" fill="#FDBA74"/>
                </svg>
              </div>
              
              {/* Decorative floating elements */}
              <div className="absolute -top-2 -right-2 w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center animate-bounce" style={{animationDelay: '0s', animationDuration: '2s'}}>
                <span className="text-lg">🍕</span>
              </div>
              <div className="absolute -bottom-1 -left-3 w-7 h-7 bg-orange-100 rounded-full flex items-center justify-center animate-bounce" style={{animationDelay: '0.5s', animationDuration: '2.5s'}}>
                <span className="text-sm">🍔</span>
              </div>
              <div className="absolute top-1/2 -right-4 w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center animate-bounce" style={{animationDelay: '1s', animationDuration: '3s'}}>
                <span className="text-xs">🌮</span>
              </div>
            </div>

            {/* Text Content */}
            <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">
              Your Cart is Empty
            </h2>
            <p className="text-gray-500 text-center mb-8 max-w-xs">
              Looks like you haven't added anything yet. Let's find something delicious!
            </p>

            {/* Primary Action Button */}
            <button
              onClick={() => navigate("/home")}
              className="px-8 py-3.5 bg-[#FF7A00] text-white font-semibold rounded-full hover:bg-orange-600 transition-all shadow-lg shadow-orange-200 flex items-center gap-2 mb-4"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              Browse Restaurants
            </button>

            {/* Secondary Action */}
            <button
              onClick={() => navigate("/home")}
              className="text-[#FF7A00] font-medium hover:text-orange-600 transition-colors flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
              </svg>
              Go to Home
            </button>
          </div>
        ) : selectedCart ? (
          /* Selected Cart Detail View */
          <div className="space-y-5">
            {/* Back Button */}
            <button
              onClick={() => setSelectedCartId(null)}
              className="inline-flex items-center gap-2 text-[#FF7A00] font-semibold hover:text-orange-600 transition-colors"
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
              Back to restaurants
            </button>

            {/* Restaurant Header Card */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-[#FF7A00] to-orange-500 p-5 text-white">
                <div className="flex items-center gap-4">
                  {selectedCart.restaurant.logo_url ? (
                    <img
                      src={selectedCart.restaurant.logo_url}
                      alt={selectedCart.restaurant.restaurant_name}
                      className="w-16 h-16 rounded-xl object-cover border-2 border-white/30"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-white/20 flex items-center justify-center">
                      <span className="text-2xl font-bold">
                        {selectedCart.restaurant.restaurant_name.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div className="flex-1">
                    <h2 className="text-xl font-bold">
                      {selectedCart.restaurant.restaurant_name}
                    </h2>
                    <p className="text-white/80 text-sm">
                      {selectedCart.restaurant.city} • {selectedCart.item_count} item
                      {selectedCart.item_count !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-white/70">Total</p>
                    <p className="text-2xl font-bold">
                      {formatPrice(selectedCart.cart_total)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Cart Items */}
              <div className="p-4 space-y-3">
                {selectedCart.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl"
                  >
                    {/* Food Image */}
                    <div className="w-20 h-20 flex-shrink-0">
                      {item.food_image_url ? (
                        <img
                          src={item.food_image_url}
                          alt={item.food_name}
                          className="w-full h-full object-cover rounded-xl"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-orange-400 to-orange-500 rounded-xl flex items-center justify-center">
                          <svg
                            className="w-8 h-8 text-white opacity-60"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M8.1 13.34l2.83-2.83L3.91 3.5a4.008 4.008 0 000 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Item Details */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {item.food_name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 bg-orange-100 text-[#FF7A00] text-xs font-medium rounded-lg">
                          {item.size.charAt(0).toUpperCase() + item.size.slice(1)}
                        </span>
                        {!item.is_available && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-medium rounded-lg">
                            Unavailable
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[#FF7A00] font-semibold mt-1">
                        {formatPrice(item.unit_price)}
                      </p>
                    </div>

                    {/* Quantity Controls */}
                    <div className="flex items-center gap-2 bg-white rounded-full px-2 py-1 border border-gray-200">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        disabled={updatingItem === item.id || item.quantity <= 1}
                        className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition"
                      >
                        <svg className="w-3 h-3 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
                        </svg>
                      </button>
                      <span className="text-sm font-bold text-gray-800 min-w-[1.5rem] text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        disabled={updatingItem === item.id}
                        className="w-7 h-7 rounded-full bg-[#FF7A00] hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition"
                      >
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>

                    {/* Remove Button */}
                    <button
                      onClick={() => removeItem(item.id)}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              {/* Cart Summary & Actions */}
              <div className="p-4 border-t border-gray-100">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <p className="text-gray-600 text-sm">
                      Total Items: {selectedCart.total_items}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Cart Total</p>
                    <p className="text-2xl font-bold text-[#FF7A00]">
                      {formatPrice(selectedCart.cart_total)}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => navigate(`/restaurant/${selectedCart.restaurant_id}/foods`)}
                    className="flex-1 px-5 py-3.5 border-2 border-[#FF7A00] text-[#FF7A00] font-semibold rounded-full hover:bg-orange-50 transition"
                  >
                    Add More Items
                  </button>
                  <button
                    onClick={() => handleCheckout(selectedCart.id)}
                    className="flex-1 px-5 py-3.5 bg-[#FF7A00] text-white font-semibold rounded-full hover:bg-orange-600 transition shadow-lg shadow-orange-200 flex items-center justify-center gap-2"
                  >
                    Checkout
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>

                <button
                  onClick={() => removeCart(selectedCart.id)}
                  className="w-full mt-3 py-2.5 text-red-500 text-sm font-medium hover:bg-red-50 rounded-xl transition"
                >
                  Clear this cart
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Restaurant Carts List */
          <div className="space-y-5">
            <h2 className="text-lg font-bold text-gray-900">Active Restaurants</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {carts.map((cart) => (
                <div
                  key={cart.id}
                  className="bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition-all cursor-pointer"
                >
                  {/* Restaurant Info */}
                  <div className="p-4 flex items-center gap-3">
                    {cart.restaurant.logo_url ? (
                      <img
                        src={cart.restaurant.logo_url}
                        alt={cart.restaurant.restaurant_name}
                        className="w-14 h-14 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-orange-50 text-[#FF7A00] font-bold text-xl flex items-center justify-center">
                        {cart.restaurant.restaurant_name.charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-gray-900 truncate">
                          {cart.restaurant.restaurant_name}
                        </p>
                        <span className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                          </svg>
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">
                        {cart.restaurant.city}
                      </p>
                      <p className="text-sm font-semibold text-[#FF7A00]">
                        {cart.item_count} item{cart.item_count !== 1 ? "s" : ""} • {formatPrice(cart.cart_total)}
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="px-4 pb-4 flex gap-2">
                    <button
                      onClick={() => setSelectedCartId(cart.id)}
                      className="flex-1 px-4 py-2.5 bg-[#FF7A00] text-white font-semibold rounded-full hover:bg-orange-600 transition shadow-md shadow-orange-200"
                    >
                      View items
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCart(cart.id);
                      }}
                      className="px-4 py-2.5 text-[#FF7A00] border-2 border-[#FF7A00] rounded-full hover:bg-orange-50 transition font-medium"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 py-2 px-4 shadow-2xl z-50">
        <div className="flex justify-around items-center max-w-lg mx-auto">
          <NavItem
            icon={
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill={activeNav === "home" ? "currentColor" : "none"} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeNav === "home" ? 0 : 1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
              </svg>
            }
            label="Home"
            active={activeNav === "home"}
            onClick={() => {
              setActiveNav("home");
              navigate("/home");
            }}
          />
          <NavItem
            icon={
              <svg className="w-6 h-6" fill={activeNav === "cart" ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
              </svg>
            }
            label="Cart"
            active={activeNav === "cart"}
            onClick={() => setActiveNav("cart")}
            badge={cartCount > 0 ? cartCount : null}
          />
          <NavItem
            icon={
              <svg className="w-6 h-6" fill={activeNav === "orders" ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
              </svg>
            }
            label="Orders"
            active={activeNav === "orders"}
            onClick={() => {
              setActiveNav("orders");
              navigate("/orders");
            }}
          />
          <NavItem
            icon={
              <svg className="w-6 h-6" fill={activeNav === "profile" ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
            }
            label="Profile"
            active={activeNav === "profile"}
            onClick={() => {
              setActiveNav("profile");
              navigate("/profile");
            }}
          />
        </div>
      </nav>

      {/* Custom Styles */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

const NavItem = ({ icon, label, active, onClick, badge }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center gap-0.5 py-1.5 px-4 transition-all duration-200 rounded-xl ${
      active ? "text-[#FF7A00] bg-orange-50" : "text-gray-400 hover:text-orange-300"
    }`}
  >
    <div className="relative">
      {icon}
      {badge && (
        <span className="absolute -top-2 -right-2 w-5 h-5 bg-[#FF7A00] text-white text-xs font-bold rounded-full flex items-center justify-center">
          {badge}
        </span>
      )}
    </div>
    <span className={`text-xs ${active ? "font-semibold" : "font-medium"}`}>
      {label}
    </span>
  </button>
);

export default Cart;
