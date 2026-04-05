import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNavbar from "../components/BottomNavbar";
import { API_URL } from "../config";
import { logout } from "../services/authService";

export default function CustomerProfile() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");
    const storedName = localStorage.getItem("userName");
    const storedEmail = localStorage.getItem("userEmail");

    if (token && role === "customer") {
      setIsLoggedIn(true);
      setUserName(storedName || "");
      setUserEmail(storedEmail || "");
      fetchProfile();
    } else {
      setIsLoggedIn(false);
      setLoading(false);
    }
  }, []);

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/customer/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setProfile(data.customer || data);
      }
    } catch (err) {
      console.error("Failed to fetch profile:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    const token = localStorage.getItem("token");
    await logout(token);
    navigate("/login");
  };

  // Not logged in view
  if (!isLoggedIn && !loading) {
    return (
      <div className="min-h-screen bg-gray-50 font-poppins pb-24 page-slide-up">
        {/* Sticky Header */}
        <header className="sticky top-0 z-50 bg-white px-4 py-3 shadow-sm">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-[#06C168] rounded-xl flex items-center justify-center shadow-lg shadow-green-200">
                <span className="text-white text-lg font-bold">N</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Profile</h1>
                <p className="text-xs text-gray-500">Welcome to Meezo</p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-12">
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-12 h-12 text-[#06C168]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Welcome to Meezo
            </h2>
            <p className="text-gray-500 mb-6">
              Sign in to access your profile and order history
            </p>
            <button
              onClick={() => navigate("/login")}
              className="w-full py-3 bg-[#06C168] text-white font-semibold rounded-full hover:bg-green-600 transition shadow-lg shadow-green-200"
            >
              Login
            </button>
            <p className="mt-4 text-sm text-gray-500">
              Don't have an account?{" "}
              <button
                onClick={() => navigate("/signup")}
                className="text-[#06C168] font-medium hover:underline"
              >
                Sign Up
              </button>
            </p>
          </div>
        </main>

        <BottomNavbar />
      </div>
    );
  }

  // Loading view
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 font-poppins flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-green-100 rounded-full"></div>
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-[#06C168] border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="mt-4 text-gray-500 text-sm font-medium">
            Loading profile...
          </p>
        </div>
      </div>
    );
  }

  // Logged in view
  return (
    <div className="min-h-screen bg-gray-50 font-poppins pb-24 page-slide-up">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 bg-white px-4 py-3 shadow-sm">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-[#06C168] rounded-xl flex items-center justify-center shadow-lg shadow-green-200">
                <span className="text-white text-lg font-bold">N</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">My Profile</h1>
                <p className="text-xs text-gray-500">Manage your account</p>
              </div>
            </div>

            {/* Settings Icon */}
            <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center">
              <svg
                className="w-5 h-5 text-[#06C168]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Profile Header Card */}
        <div className="bg-white rounded-2xl shadow-md p-6 mb-4">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 bg-gradient-to-br from-[#06C168] to-green-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-green-200">
              {userName ? userName.charAt(0).toUpperCase() : "U"}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900">
                {userName || "Customer"}
              </h2>
              <p className="text-gray-500 text-sm">{userEmail}</p>
              <span className="inline-block mt-2 px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                ✓ Verified Customer
              </span>
            </div>
          </div>
        </div>

        {/* Profile Details */}
        {profile && (
          <div className="bg-white rounded-2xl shadow-md p-5 mb-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-base">📋</span>
              </div>
              <h3 className="font-bold text-gray-900">Profile Details</h3>
            </div>
            <div className="space-y-3">
              {profile.phone && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                    <span className="text-lg">📱</span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Phone</p>
                    <p className="font-medium text-gray-900">{profile.phone}</p>
                  </div>
                </div>
              )}
              {profile.address && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                    <span className="text-lg">📍</span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Address</p>
                    <p className="font-medium text-gray-900">
                      {profile.address}
                    </p>
                  </div>
                </div>
              )}
              {profile.city && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                    <span className="text-lg">🏙️</span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">City</p>
                    <p className="font-medium text-gray-900">{profile.city}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="bg-white rounded-2xl shadow-md overflow-hidden mb-4">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-base">⚡</span>
              </div>
              <h3 className="font-bold text-gray-900">Quick Actions</h3>
            </div>
          </div>

          <button
            onClick={() => navigate("/orders")}
            className="w-full flex items-center justify-between p-4 hover:bg-green-50 transition"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#06C168] rounded-xl flex items-center justify-center shadow-md shadow-green-200">
                <span className="text-lg">📦</span>
              </div>
              <div className="text-left">
                <span className="font-semibold text-gray-900">My Orders</span>
                <p className="text-xs text-gray-500">
                  Track your order history
                </p>
              </div>
            </div>
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
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>

          <button
            onClick={() => navigate("/customer/notifications")}
            className="w-full flex items-center justify-between p-4 hover:bg-green-50 transition border-t border-gray-100"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center shadow-md shadow-blue-200">
                <span className="text-lg">🔔</span>
              </div>
              <div className="text-left">
                <span className="font-semibold text-gray-900">
                  Notifications
                </span>
                <p className="text-xs text-gray-500">View your updates</p>
              </div>
            </div>
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
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>

          <button
            onClick={() => navigate("/cart")}
            className="w-full flex items-center justify-between p-4 hover:bg-green-50 transition border-t border-gray-100"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center shadow-md shadow-green-200">
                <span className="text-lg">🛒</span>
              </div>
              <div className="text-left">
                <span className="font-semibold text-gray-900">My Cart</span>
                <p className="text-xs text-gray-500">Review your items</p>
              </div>
            </div>
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
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 p-4 bg-red-50 text-red-600 font-semibold rounded-2xl hover:bg-red-100 transition border-2 border-red-100"
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
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          Logout
        </button>
      </main>

      {/* Bottom Navigation */}
      <BottomNavbar />
    </div>
  );
}
