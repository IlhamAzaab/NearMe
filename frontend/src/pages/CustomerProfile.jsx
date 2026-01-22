import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";

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
      const res = await fetch("http://localhost:5000/customer/me", {
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

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  // Not logged in view
  if (!isLoggedIn && !loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <SiteHeader isLoggedIn={false} />
        
        <main className="max-w-lg mx-auto px-4 py-12">
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Welcome to NearMe</h2>
            <p className="text-gray-600 mb-6">Sign in to access your profile and order history</p>
            <button
              onClick={() => navigate("/login")}
              className="w-full py-3 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 transition"
            >
              Login
            </button>
            <p className="mt-4 text-sm text-gray-500">
              Don't have an account?{" "}
              <button onClick={() => navigate("/signup")} className="text-orange-500 font-medium hover:underline">
                Sign Up
              </button>
            </p>
          </div>
        </main>
      </div>
    );
  }

  // Loading view
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-orange-500"></div>
      </div>
    );
  }

  // Logged in view
  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <SiteHeader
        isLoggedIn={true}
        role="customer"
        userName={userName}
        userEmail={userEmail}
        onLogout={handleLogout}
      />

      <main className="max-w-lg mx-auto px-4 py-8">
        {/* Profile Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center text-white text-2xl font-bold">
              {userName ? userName.charAt(0).toUpperCase() : "U"}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-800">{userName || "Customer"}</h2>
              <p className="text-gray-500 text-sm">{userEmail}</p>
            </div>
          </div>
        </div>

        {/* Profile Details */}
        {profile && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Profile Details</h3>
            <div className="space-y-4">
              {profile.phone && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Phone</p>
                    <p className="font-medium text-gray-800">{profile.phone}</p>
                  </div>
                </div>
              )}
              {profile.address && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Address</p>
                    <p className="font-medium text-gray-800">{profile.address}</p>
                  </div>
                </div>
              )}
              {profile.city && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">City</p>
                    <p className="font-medium text-gray-800">{profile.city}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Menu Options */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6">
          <button
            onClick={() => navigate("/orders")}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition border-b border-gray-100"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <span className="font-medium text-gray-800">My Orders</span>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <button
            onClick={() => navigate("/customer/notifications")}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition border-b border-gray-100"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <span className="font-medium text-gray-800">Notifications</span>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <button
            onClick={() => navigate("/cart")}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <span className="font-medium text-gray-800">My Cart</span>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 p-4 bg-red-50 text-red-600 font-semibold rounded-2xl hover:bg-red-100 transition"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Logout
        </button>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 py-2 px-6 shadow-lg z-50">
        <div className="flex justify-around items-center max-w-lg mx-auto">
          <NavItem
            icon={<svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>}
            label="Home"
            onClick={() => navigate("/home")}
          />
          <NavItem
            icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>}
            label="Orders"
            onClick={() => navigate("/orders")}
          />
          <NavItem
            icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
            label="Cart"
            onClick={() => navigate("/cart")}
          />
          <NavItem
            icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
            label="Profile"
            active={true}
            onClick={() => {}}
          />
        </div>
      </nav>
    </div>
  );
}

const NavItem = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center gap-1 py-1 px-3 transition-all duration-200 ${
      active ? "text-orange-500" : "text-gray-400"
    }`}
  >
    {icon}
    <span className={`text-xs ${active ? "font-semibold" : "font-medium"}`}>{label}</span>
  </button>
);
