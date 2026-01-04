import React, { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

export default function ManagerSidebar({ mobileOpen, setMobileOpen }) {
  const [openRestaurants, setOpenRestaurants] = useState(true);
  const [openDrivers, setOpenDrivers] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const baseItem =
    "flex items-center justify-between w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100";
  const subItem =
    "block w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-gray-100";

  const isActive = (to) => location.pathname === to;

  const SidebarContent = (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-3 border-b">
        <span className="font-semibold text-gray-800">Manager Menu</span>
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

      <nav className="p-3 space-y-2 overflow-y-auto">
        <button
          onClick={() => navigate("/manager/dashboard")}
          className={`${baseItem} ${
            isActive("/manager/dashboard") ? "bg-gray-100" : ""
          }`}
        >
          <span className="text-sm font-medium text-gray-800">Dashboard</span>
          <span />
        </button>

        {/* Restaurants */}
        <div className="space-y-1">
          <button
            onClick={() => setOpenRestaurants((v) => !v)}
            className={`${baseItem}`}
          >
            <span className="text-sm font-medium text-gray-800">
              Restaurants
            </span>
            <svg
              className={`w-4 h-4 text-gray-600 transition-transform ${
                openRestaurants ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          {openRestaurants && (
            <div className="pl-2 space-y-1">
              <NavLink
                to="/manager/restaurants/pending"
                className={({ isActive }) =>
                  `${subItem} ${isActive ? "bg-gray-100" : ""}`
                }
              >
                Pending Restaurants
              </NavLink>
              <NavLink
                to="/manager/restaurants/addadmin"
                className={({ isActive }) =>
                  `${subItem} ${isActive ? "bg-gray-100" : ""}`
                }
              >
                Add Admin
              </NavLink>
              <NavLink
                to="/manager/restaurants/admins"
                className={({ isActive }) =>
                  `${subItem} ${isActive ? "bg-gray-100" : ""}`
                }
              >
                Admin Management
              </NavLink>
              <NavLink
                to="/manager/restaurants/manage"
                className={({ isActive }) =>
                  `${subItem} ${isActive ? "bg-gray-100" : ""}`
                }
              >
                Restaurant Management
              </NavLink>
            </div>
          )}
        </div>

        {/* Drivers */}
        <div className="space-y-1">
          <button
            onClick={() => setOpenDrivers((v) => !v)}
            className={`${baseItem}`}
          >
            <span className="text-sm font-medium text-gray-800">Drivers</span>
            <svg
              className={`w-4 h-4 text-gray-600 transition-transform ${
                openDrivers ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          {openDrivers && (
            <div className="pl-2 space-y-1">
              <NavLink
                to="/manager/drivers/add"
                className={({ isActive }) =>
                  `${subItem} ${isActive ? "bg-gray-100" : ""}`
                }
              >
                Add Driver
              </NavLink>
              <NavLink
                to="/manager/drivers/manage"
                className={({ isActive }) =>
                  `${subItem} ${isActive ? "bg-gray-100" : ""}`
                }
              >
                Driver Management
              </NavLink>
              <NavLink
                to="/manager/drivers/verify"
                className={({ isActive }) =>
                  `${subItem} ${isActive ? "bg-gray-100" : ""}`
                }
              >
                Verify Drivers
              </NavLink>
            </div>
          )}
        </div>
      </nav>

      <div className="mt-auto p-3 text-xs text-gray-500">NearMe Manager</div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 h-[calc(100vh-64px)] bg-white border-r fixed top-16 left-0">
        {SidebarContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-white border-r shadow-xl">
            {SidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
