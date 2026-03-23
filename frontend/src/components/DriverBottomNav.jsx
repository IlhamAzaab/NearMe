import React, { useCallback } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { resolveDriverActiveMapPath } from "../utils/driverActiveDelivery";

export default function DriverBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = localStorage.getItem("userId") || "default";

  const handleOpenActiveMap = useCallback(async () => {
    const token = localStorage.getItem("token");
    const path = await resolveDriverActiveMapPath({
      queryClient,
      token,
      userId,
    });
    navigate(path);
  }, [navigate, queryClient, userId]);

  const isActiveTabSelected =
    location.pathname === "/driver/delivery/active/map" ||
    /^\/driver\/delivery\/active\/[^/]+\/map$/.test(location.pathname);

  const navItems = [
    {
      path: "/driver/dashboard",
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
          />
        </svg>
      ),
      label: "Home",
    },
    {
      path: "/driver/deliveries",
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
      ),
      label: "Available",
    },
    {
      path: "/driver/delivery/active/map",
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      ),
      label: "Active",
      onClick: handleOpenActiveMap,
      isActive: isActiveTabSelected,
    },
    {
      path: "/driver/earnings",
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
      label: "Earnings",
    },
    {
      path: "/driver/deposits",
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
          />
        </svg>
      ),
      label: "Payment",
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
      <div className="flex justify-around items-center max-w-md mx-auto">
        {navItems.map((item) => (
          item.onClick ? (
            <button
              key={item.path}
              type="button"
              onClick={item.onClick}
              className={`flex flex-col items-center justify-center py-2 px-3 min-w-[64px] transition-all duration-200 ${
                item.isActive
                  ? "text-emerald-600"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <div
                className={`${item.isActive ? "scale-110" : ""} transition-transform`}
              >
                {item.icon}
              </div>
              <span
                className={`text-xs mt-1 font-medium ${item.isActive ? "font-semibold" : ""}`}
              >
                {item.label}
              </span>
            </button>
          ) : (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-2 px-3 min-w-[64px] transition-all duration-200 ${
                  isActive
                    ? "text-emerald-600"
                    : "text-gray-400 hover:text-gray-600"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={`${isActive ? "scale-110" : ""} transition-transform`}
                  >
                    {item.icon}
                  </div>
                  <span
                    className={`text-xs mt-1 font-medium ${isActive ? "font-semibold" : ""}`}
                  >
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          )
        ))}
      </div>
    </nav>
  );
}
