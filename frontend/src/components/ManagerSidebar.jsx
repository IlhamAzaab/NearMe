import React from "react";
import { NavLink, useLocation } from "react-router-dom";

export default function ManagerSidebar({ mobileOpen, setMobileOpen }) {
  const location = useLocation();

  const subItem =
    "block w-full text-left px-4 py-3 text-sm rounded-lg hover:bg-indigo-50 transition-colors";

  const isDriverSection =
    location.pathname.startsWith("/manager/drivers") ||
    location.pathname === "/manager/deposits";
  const isRestaurantSection =
    location.pathname.startsWith("/manager/restaurants") ||
    location.pathname.startsWith("/manager/admin-payments");
  const isReportsSection = location.pathname.startsWith("/manager/reports");

  // Don't show sidebar for dashboard or if not in any specific section
  if (!isDriverSection && !isRestaurantSection && !isReportsSection) {
    return null;
  }

  const SidebarContent = (
    <div className="h-full flex flex-col bg-white">
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
        <span className="font-semibold text-gray-800">
          {isDriverSection && "Driver Management"}
          {isRestaurantSection && "Restaurant & Admin"}
          {isReportsSection && "Reports"}
        </span>
        <button
          className="lg:hidden p-2 rounded hover:bg-gray-100"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <nav className="p-4 space-y-2 overflow-y-auto flex-1">
        {isDriverSection && (
          <>
            <NavLink
              to="/manager/drivers/add"
              className={({ isActive }) =>
                `${subItem} ${isActive ? "bg-indigo-100 text-indigo-700 font-medium" : "text-gray-700"}`
              }
            >
              <div className="flex items-center gap-3">
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
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add Driver
              </div>
            </NavLink>
            <NavLink
              to="/manager/drivers/manage"
              className={({ isActive }) =>
                `${subItem} ${isActive ? "bg-indigo-100 text-indigo-700 font-medium" : "text-gray-700"}`
              }
            >
              <div className="flex items-center gap-3">
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
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
                Driver Management
              </div>
            </NavLink>
            <NavLink
              to="/manager/drivers/verify"
              className={({ isActive }) =>
                `${subItem} ${isActive ? "bg-indigo-100 text-indigo-700 font-medium" : "text-gray-700"}`
              }
            >
              <div className="flex items-center gap-3">
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
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Verify Drivers
              </div>
            </NavLink>
            <NavLink
              to="/manager/drivers/payments"
              className={({ isActive }) =>
                `${subItem} ${isActive ? "bg-indigo-100 text-indigo-700 font-medium" : "text-gray-700"}`
              }
            >
              <div className="flex items-center gap-3">
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
                    d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                Driver Payments
              </div>
            </NavLink>
            <NavLink
              to="/manager/deposits"
              className={({ isActive }) =>
                `${subItem} ${isActive ? "bg-indigo-100 text-indigo-700 font-medium" : "text-gray-700"}`
              }
            >
              <div className="flex items-center gap-3">
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
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                  />
                </svg>
                Driver Deposits
              </div>
            </NavLink>
          </>
        )}

        {isRestaurantSection && (
          <>
            <NavLink
              to="/manager/restaurants/pending"
              className={({ isActive }) =>
                `${subItem} ${isActive ? "bg-indigo-100 text-indigo-700 font-medium" : "text-gray-700"}`
              }
            >
              <div className="flex items-center gap-3">
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
                Pending Restaurants
              </div>
            </NavLink>
            <NavLink
              to="/manager/restaurants/addadmin"
              className={({ isActive }) =>
                `${subItem} ${isActive ? "bg-indigo-100 text-indigo-700 font-medium" : "text-gray-700"}`
              }
            >
              <div className="flex items-center gap-3">
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
                    d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                  />
                </svg>
                Add Admin
              </div>
            </NavLink>
            <NavLink
              to="/manager/restaurants/admins"
              className={({ isActive }) =>
                `${subItem} ${isActive ? "bg-indigo-100 text-indigo-700 font-medium" : "text-gray-700"}`
              }
            >
              <div className="flex items-center gap-3">
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
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
                Admin Management
              </div>
            </NavLink>
            <NavLink
              to="/manager/restaurants/manage"
              className={({ isActive }) =>
                `${subItem} ${isActive ? "bg-indigo-100 text-indigo-700 font-medium" : "text-gray-700"}`
              }
            >
              <div className="flex items-center gap-3">
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
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
                Restaurant Management
              </div>
            </NavLink>
            <NavLink
              to="/manager/admin-payments"
              className={({ isActive }) =>
                `${subItem} ${isActive ? "bg-indigo-100 text-indigo-700 font-medium" : "text-gray-700"}`
              }
            >
              <div className="flex items-center gap-3">
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
                    d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                Admin Payments
              </div>
            </NavLink>
          </>
        )}

        {isReportsSection && (
          <>
            <NavLink
              to="/manager/reports/overview"
              className={({ isActive }) =>
                `${subItem} ${isActive ? "bg-indigo-100 text-indigo-700 font-medium" : "text-gray-700"}`
              }
            >
              <div className="flex items-center gap-3">
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
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                Overview
              </div>
            </NavLink>
            <div className="px-4 py-2 text-xs text-gray-500">
              More reports coming soon...
            </div>
          </>
        )}
      </nav>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 h-[calc(100vh-64px)] bg-white border-r fixed top-16 left-0 z-30">
        {SidebarContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-xl">
            {SidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
