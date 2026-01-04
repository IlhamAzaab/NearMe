import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function SiteHeader({
  isLoggedIn,
  role,
  userName,
  userEmail,
  onLogout,
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [managerUsername, setManagerUsername] = useState("");

  // When logged in as manager, fetch manager username from API
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!isLoggedIn || role !== "manager" || !token) return;
    (async () => {
      try {
        const res = await fetch("http://localhost:5000/manager/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && data?.manager?.username) {
          setManagerUsername(data.manager.username);
        }
      } catch (_) {
        // ignore
      }
    })();
  }, [isLoggedIn, role]);

  const goHome = () => navigate("/");
  const goLogin = () => navigate("/login");

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <button
            onClick={goHome}
            className="flex items-center gap-2"
            aria-label="Go to Home"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">NM</span>
            </div>
            <span className="hidden sm:block font-bold text-gray-800 text-lg">
              NearMe
            </span>
          </button>

          {/* Right: login or user menu */}
          <div className="relative">
            {!isLoggedIn ? (
              <button
                onClick={goLogin}
                className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
              >
                Login
              </button>
            ) : (
              <button
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-lg"
              >
                <div className="hidden sm:flex sm:flex-col sm:items-start">
                  <span className="text-sm font-semibold text-gray-800 truncate">
                    {managerUsername || userName || "User"}
                  </span>
                  <span className="text-xs text-gray-600 truncate">
                    {role || "role"}
                  </span>
                </div>
              </button>
            )}

            {isLoggedIn && open && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg">
                <div className="px-4 py-3 border-b border-gray-200">
                  <p className="text-xs text-gray-500 uppercase">Signed in</p>
                  <p className="text-sm font-semibold text-gray-800 truncate">
                    {managerUsername || userName}
                  </p>
                  <p className="text-xs text-gray-600 truncate">{userEmail}</p>
                  <p className="text-xs text-indigo-600 mt-1">Role: {role}</p>
                </div>
                <div className="px-2 py-2">
                  <button className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded">
                    Profile
                  </button>
                </div>
                <div className="px-2 py-2 border-t border-gray-200">
                  <button
                    onClick={onLogout}
                    className="w-full px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded"
                  >
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
