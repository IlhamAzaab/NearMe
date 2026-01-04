import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const ManagerHeader = ({ userEmail, userName }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [managerInfo, setManagerInfo] = useState(null);
  const [role, setRole] = useState("");
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("role");
    navigate("/login");
  };

  const handleReports = () => {
    // Navigate to reports page (to be created)
    navigate("/manager/reports");
  };

  // Fetch manager details for accurate username/email from DB
  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedRole = localStorage.getItem("role");
    setRole(storedRole || "");
    if (!token || storedRole !== "manager") return;
    (async () => {
      try {
        const res = await fetch("http://localhost:5000/manager/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && data?.manager) setManagerInfo(data.manager);
      } catch (_) {
        // ignore network errors
      }
    })();
  }, []);

  return (
    <header className="bg-white shadow-md sticky top-0 z-50">
      <div className="max-w-full px-4 py-3 sm:px-6">
        {/* Main header container */}
        <div className="flex items-center justify-between gap-2">
          {/* Logo Section - Left */}
          <div className="flex-shrink-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg sm:text-xl">
                NM
              </span>
            </div>
          </div>

          {/* Center - App Title (hidden on very small screens) */}
          <div className="hidden xs:block flex-1">
            <h1 className="text-lg sm:text-xl font-bold text-gray-800">
              Manager
            </h1>
          </div>

          {/* Right section - Reports button and User menu */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Reports Button */}
            <button
              onClick={handleReports}
              className="hidden sm:inline-flex px-3 sm:px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Reports
            </button>

            {/* Mobile Reports Icon Button */}
            <button
              onClick={handleReports}
              className="sm:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Reports"
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
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </button>

            {/* User Dropdown Menu */}
            <div className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {/* User Avatar */}
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                  {managerInfo?.username?.charAt(0)?.toUpperCase() ||
                    userName?.charAt(0)?.toUpperCase() ||
                    "U"}
                </div>

                {/* Username and role next to avatar */}
                <div className="flex flex-col items-start">
                  <span className="text-sm font-semibold text-gray-800 truncate max-w-[100px] sm:max-w-[140px]">
                    {managerInfo?.username }
                  </span>
                  <span className="text-xs text-gray-600 truncate">
                    {role || "manager"}
                  </span>
                </div>

                {/* Dropdown Arrow - hidden on mobile */}
                <svg
                  className={`hidden sm:block w-4 h-4 text-gray-600 transition-transform ${
                    isDropdownOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 14l-7 7m0 0l-7-7m7 7V3"
                  />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 sm:w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                  {/* User Info Section */}
                  <div className="px-4 py-3 border-b border-gray-200">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">
                      User Details
                    </p>
                    <p className="text-sm font-semibold text-gray-800 mt-1 truncate">
                      {managerInfo?.username || userName || "Manager"}
                    </p>
                    <p className="text-xs text-gray-600 mt-1 break-words">
                      {managerInfo?.email || userEmail || "user@example.com"}
                    </p>
                  </div>

                  {/* Menu Items */}
                  <div className="px-2 py-2">
                    <button className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors">
                      Profile Settings
                    </button>
                    <button className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors">
                      Preferences
                    </button>
                  </div>

                  {/* Logout Button */}
                  <div className="px-2 py-2 border-t border-gray-200">
                    <button
                      onClick={handleLogout}
                      className="w-full px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile compact info - shows email if space */}
        <div className="sm:hidden mt-2 text-xs text-gray-600 truncate">
          {managerInfo?.email || userEmail}
        </div>
      </div>
    </header>
  );
};

export default ManagerHeader;
