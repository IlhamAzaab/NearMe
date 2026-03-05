import React from "react";
import { NavLink, useNavigate } from "react-router-dom";

export default function AdminSidebar({ mobileOpen, setMobileOpen }) {
  const navigate = useNavigate();

  const baseItem =
    "flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl hover:bg-green-50 transition-all duration-300 hover:scale-[1.02]";

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  const SidebarContent = (
    <div className="h-full flex flex-col bg-white border-r border-green-100 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-green-100 bg-gradient-to-r from-green-50 to-green-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-md">
            <span className="text-white font-bold text-lg">A</span>
          </div>
          <span className="font-bold text-gray-800 text-lg">Admin Panel</span>
        </div>
        <button
          className="lg:hidden p-2 rounded-lg hover:bg-green-100 transition-colors"
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
          to="/admin/dashboard"
          className={({ isActive }) =>
            `${baseItem} ${
              isActive
                ? "bg-gradient-to-r from-green-100 to-green-50 text-green-700 font-semibold shadow-sm"
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
          to="/admin/products"
          className={({ isActive }) =>
            `${baseItem} ${
              isActive
                ? "bg-gradient-to-r from-green-100 to-green-50 text-green-700 font-semibold shadow-sm"
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
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
          <span className="font-medium">Products</span>
        </NavLink>

        <NavLink
          to="/admin/orders"
          className={({ isActive }) =>
            `${baseItem} ${
              isActive
                ? "bg-gradient-to-r from-green-100 to-green-50 text-green-700 font-semibold shadow-sm"
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
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <span className="font-medium">Orders</span>
        </NavLink>

        <NavLink
          to="/admin/earnings"
          className={({ isActive }) =>
            `${baseItem} ${
              isActive
                ? "bg-gradient-to-r from-green-100 to-green-50 text-green-700 font-semibold shadow-sm"
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
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="font-medium">Earnings</span>
        </NavLink>

        <NavLink
          to="/admin/withdrawals"
          className={({ isActive }) =>
            `${baseItem} ${
              isActive
                ? "bg-gradient-to-r from-green-100 to-green-50 text-green-700 font-semibold shadow-sm"
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
              d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
            />
          </svg>
          <span className="font-medium">Withdrawals</span>
        </NavLink>

        <NavLink
          to="/admin/settings"
          className={({ isActive }) =>
            `${baseItem} ${
              isActive
                ? "bg-gradient-to-r from-green-100 to-green-50 text-green-700 font-semibold shadow-sm"
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
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <span className="font-medium">Settings</span>
        </NavLink>

        <NavLink
          to="/admin/account"
          className={({ isActive }) =>
            `${baseItem} ${
              isActive
                ? "bg-gradient-to-r from-green-100 to-green-50 text-green-700 font-semibold shadow-sm"
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
          <span className="font-medium">My Account</span>
        </NavLink>
      </nav>

      {/* Logout Button */}
      <div className="p-4 border-t border-green-100 bg-gradient-to-r from-green-50/30 to-green-100/30">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl hover:bg-red-50 text-red-600 transition-all duration-300 hover:scale-[1.02] font-medium"
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
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-64 bg-white border-r z-50 transform transition-transform duration-300 ease-in-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        {SidebarContent}
      </aside>
    </>
  );
}
