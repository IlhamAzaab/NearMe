import React from "react";
import { NavLink, useNavigate } from "react-router-dom";

export default function DriverSidebar({ mobileOpen, setMobileOpen }) {
  const navigate = useNavigate();

  const baseItem =
    "flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl hover:bg-blue-50 transition-all duration-300 hover:scale-[1.02]";

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  const SidebarContent = (
    <div className="h-full flex flex-col bg-white border-r border-blue-100 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-blue-100 bg-gradient-to-r from-blue-50 to-blue-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md">
            <span className="text-white text-xl">🛵</span>
          </div>
          <span className="font-bold text-gray-800 text-lg">Driver Panel</span>
        </div>
        <button
          className="lg:hidden p-2 rounded-lg hover:bg-blue-100 transition-colors"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <svg
            className="w-5 h-5 text-gray-700"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        <NavLink
          to="/driver/dashboard"
          className={({ isActive }) =>
            `${baseItem} ${
              isActive
                ? "bg-gradient-to-r from-blue-100 to-blue-50 text-blue-700 font-semibold shadow-sm"
                : "text-gray-700"
            }`
          }
        >
          <svg
            className="w-5 h-5"
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
          <span className="font-medium">Dashboard</span>
        </NavLink>

        <NavLink
          to="/driver/deliveries"
          className={({ isActive }) =>
            `${baseItem} ${
              isActive
                ? "bg-gradient-to-r from-blue-100 to-blue-50 text-blue-700 font-semibold shadow-sm"
                : "text-gray-700"
            }`
          }
        >
          <svg
            className="w-5 h-5"
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
          <span className="font-medium">Available Deliveries</span>
        </NavLink>

        <NavLink
          to="/driver/deliveries/active"
          className={({ isActive }) =>
            `${baseItem} ${
              isActive
                ? "bg-gradient-to-r from-blue-100 to-blue-50 text-blue-700 font-semibold shadow-sm"
                : "text-gray-700"
            }`
          }
        >
          <svg
            className="w-5 h-5"
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
          <span className="font-medium">Active Delivery</span>
        </NavLink>

        <NavLink
          to="/driver/notifications"
          className={({ isActive }) =>
            `${baseItem} ${
              isActive
                ? "bg-gradient-to-r from-blue-100 to-blue-50 text-blue-700 font-semibold shadow-sm"
                : "text-gray-700"
            }`
          }
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          <span className="font-medium">Notifications</span>
        </NavLink>

        <NavLink
          to="/driver/history"
          className={({ isActive }) =>
            `${baseItem} ${
              isActive
                ? "bg-gradient-to-r from-blue-100 to-blue-50 text-blue-700 font-semibold shadow-sm"
                : "text-gray-700"
            }`
          }
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="font-medium">Delivery History</span>
        </NavLink>

        <NavLink
          to="/driver/profile"
          className={({ isActive }) =>
            `${baseItem} ${
              isActive
                ? "bg-gradient-to-r from-blue-100 to-blue-50 text-blue-700 font-semibold shadow-sm"
                : "text-gray-700"
            }`
          }
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
          <span className="font-medium">Profile</span>
        </NavLink>
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-blue-100 bg-gradient-to-r from-blue-50/50 to-transparent">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 transition-all duration-300"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          <span className="font-medium">Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 fixed left-0 top-0 h-screen z-40">
        {SidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`lg:hidden fixed left-0 top-0 h-screen w-72 z-50 transform transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {SidebarContent}
      </aside>
    </>
  );
}
