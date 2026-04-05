import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const BottomNavbar = ({ cartCount = 0 }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Determine active nav based on current path
  const getActiveNav = () => {
    const path = location.pathname;
    if (path === "/") return "home";
    if (path === "/cart") return "cart";
    if (path === "/orders") return "orders";
    if (path === "/customer/profile" || path === "/profile") return "profile";
    return null;
  };

  const activeNav = getActiveNav();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 py-2 px-4 shadow-2xl z-50">
      <div className="flex justify-around items-center max-w-lg mx-auto">
        <NavItem
          icon={
            <svg
              className="w-6 h-6"
              viewBox="0 0 24 24"
              fill={activeNav === "home" ? "currentColor" : "none"}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={activeNav === "home" ? 0 : 1.5}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          }
          label="Home"
          active={activeNav === "home"}
          onClick={() => navigate("/")}
        />
        <NavItem
          icon={
            <svg
              className="w-6 h-6"
              fill={activeNav === "cart" ? "currentColor" : "none"}
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
          }
          label="Cart"
          active={activeNav === "cart"}
          onClick={() => navigate("/cart")}
          badge={cartCount > 0 ? cartCount : null}
        />
        <NavItem
          icon={
            <svg
              className="w-6 h-6"
              fill={activeNav === "orders" ? "currentColor" : "none"}
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
              />
            </svg>
          }
          label="Orders"
          active={activeNav === "orders"}
          onClick={() => navigate("/orders")}
        />
        <NavItem
          icon={
            <svg
              className="w-6 h-6"
              fill={activeNav === "profile" ? "currentColor" : "none"}
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
          }
          label="Profile"
          active={activeNav === "profile"}
          onClick={() => navigate("/customer/profile")}
        />
      </div>
    </nav>
  );
};

const NavItem = ({ icon, label, active, onClick, badge }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center gap-0.5 py-1.5 px-4 transition-all duration-200 rounded-xl ${
      active
        ? "text-[#06C168] bg-green-50"
        : "text-gray-400 hover:text-green-400"
    }`}
  >
    <div className="relative">
      {icon}
      {badge && (
        <span className="absolute -top-2 -right-2 w-5 h-5 bg-[#06C168] text-white text-xs font-bold rounded-full flex items-center justify-center">
          {badge}
        </span>
      )}
    </div>
    <span className={`text-xs ${active ? "font-semibold" : "font-medium"}`}>
      {label}
    </span>
  </button>
);

export default BottomNavbar;
