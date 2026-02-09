import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import ManagerHeader from "./ManagerHeader";
import ManagerSidebar from "./ManagerSidebar";

export default function ManagerLayout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const location = useLocation();

  useEffect(() => {
    const email = localStorage.getItem("userEmail") || "";
    setUserEmail(email);
    if (email) {
      const name = email.split("@")[0];
      setUserName(name.charAt(0).toUpperCase() + name.slice(1));
    }
  }, []);

  // Determine if sidebar should be shown based on current route
  const showSidebar =
    location.pathname.startsWith("/manager/drivers") ||
    location.pathname === "/manager/deposits" ||
    location.pathname.startsWith("/manager/restaurants") ||
    location.pathname.startsWith("/manager/admin-payments") ||
    location.pathname.startsWith("/manager/reports");

  return (
    <div className="min-h-screen bg-gray-50">
      <ManagerHeader userEmail={userEmail} userName={userName} />

      {/* Toggle button for mobile - only show when sidebar is visible */}
      {showSidebar && (
        <div className="lg:hidden px-4 py-2 bg-white border-b sticky top-16 z-40 flex items-center justify-between">
          <button
            onClick={() => setMobileOpen(true)}
            className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-2">
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
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
              Menu
            </div>
          </button>
        </div>
      )}

      {/* Sidebar - only render when needed */}
      {showSidebar && (
        <ManagerSidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      )}

      {/* Main content - adjust padding based on sidebar visibility */}
      <main
        className={`pt-4 lg:pt-6 ${showSidebar ? "lg:pl-64" : ""} px-4 sm:px-6`}
      >
        {children}
      </main>
    </div>
  );
}
