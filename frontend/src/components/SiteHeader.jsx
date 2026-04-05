import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../config";
import { logout as logoutSession } from "../services/authService";

export default function SiteHeader({
  isLoggedIn,
  role,
  userName,
  userEmail,
  onLogout,
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [managerUsername, setManagerUsername] = useState("");
  const [cartCount, setCartCount] = useState(0);

  const handleLogoutClick = async () => {
    const token = localStorage.getItem("token");
    await logoutSession(token);

    if (typeof onLogout === "function") {
      onLogout();
      return;
    }

    navigate("/login");
  };

  // When logged in as manager, fetch manager username from API
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!isLoggedIn || role !== "manager" || !token) return;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/manager/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && data?.manager?.username) {
          setManagerUsername(data.manager.username);
        }
      } catch (_) {
        // ignore
      }
    })();
  }, [isLoggedIn, role]);

  // Fetch cart count for customers
  useEffect(() => {
    if (!isLoggedIn || role !== "customer") {
      setCartCount(0);
      return;
    }

    const fetchCartCount = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_URL}/cart`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && data.carts) {
          const totalItems = data.carts.reduce(
            (sum, cart) => sum + (cart.total_items || 0),
            0,
          );
          setCartCount(totalItems);
        }
      } catch (err) {
        console.error("Failed to fetch cart count:", err);
      }
    };

    fetchCartCount();
    // Refresh cart count every 30 seconds
    const interval = setInterval(fetchCartCount, 30000);
    return () => clearInterval(interval);
  }, [isLoggedIn, role]);

  const goHome = () => navigate("/");
  const goLogin = () => navigate("/login");

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Logo & Global Nav */}
          <div className="flex items-center gap-6">
            <button
              onClick={goHome}
              className="flex items-center gap-2"
              aria-label="Go to Home"
            >
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold">NM</span>
              </div>
              <span className="hidden sm:block font-bold text-gray-800 text-lg">
                Meezo
              </span>
            </button>

            <button
              onClick={() => navigate("/?tab=menu")}
              className="hidden md:flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-indigo-600 transition"
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
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
              Menu
            </button>
          </div>

          {/* Right: login or user menu */}
          <div className="flex items-center gap-4">
            {/* Cart Icon - Only for customers */}
            {isLoggedIn && role === "customer" && (
              <button
                onClick={() => navigate("/cart")}
                className="relative p-2 hover:bg-gray-100 rounded-lg transition"
                aria-label="View cart"
              >
                <svg
                  className="w-6 h-6 text-gray-700"
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
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                )}
              </button>
            )}

            {/* User Menu */}
            <div className="relative">
              {!isLoggedIn ? (
                <button
                  onClick={goLogin}
                  className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                >
                  Login
                </button>
              ) : (
                <button
                  onClick={() => setOpen((v) => !v)}
                  className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-lg"
                >
                  <div className="hidden sm:flex sm:flex-col sm:items-start">
                    <span className="text-sm font-semibold text-gray-800 truncate">
                      {managerUsername || userName || "User"}
                    </span>
                    <span className="text-xs text-gray-600 truncate">
                      {role || "role"}
                    </span>
                  </div>
                </button>
              )}

              {isLoggedIn && open && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg">
                  <div className="px-4 py-3 border-b border-gray-200">
                    <p className="text-xs text-gray-500 uppercase">Signed in</p>
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {managerUsername || userName}
                    </p>
                    <p className="text-xs text-gray-600 truncate">
                      {userEmail}
                    </p>
                    <p className="text-xs text-indigo-600 mt-1">Role: {role}</p>
                  </div>
                  <div className="px-2 py-2">
                    <button className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded">
                      Profile
                    </button>
                    {role === "customer" && (
                      <button
                        onClick={() => {
                          setOpen(false);
                          navigate("/cart");
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded flex items-center justify-between"
                      >
                        <span>Cart</span>
                        {cartCount > 0 && (
                          <span className="bg-indigo-100 text-indigo-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                            {cartCount}
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                  <div className="px-2 py-2 border-t border-gray-200">
                    <button
                      onClick={handleLogoutClick}
                      className="w-full px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
