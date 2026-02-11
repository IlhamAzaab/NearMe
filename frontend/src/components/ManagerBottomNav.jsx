import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API_URL } from "../config";

const navItems = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: "dashboard",
    path: "/manager/dashboard",
    match: (p) => p === "/manager/dashboard",
  },
  {
    key: "drivers",
    label: "Drivers",
    icon: "local_shipping",
    path: "/manager/deposits",
    match: (p) =>
      p.startsWith("/manager/drivers") ||
      p === "/manager/deposits" ||
      p.startsWith("/manager/deposits/") ||
      p.startsWith("/manager/driver-payments"),
  },
  {
    key: "admins",
    label: "Admins",
    icon: "store",
    path: "/manager/admin-payments",
    match: (p) =>
      p.startsWith("/manager/restaurants") ||
      p.startsWith("/manager/admin-payments"),
  },
  {
    key: "earnings",
    label: "Earnings",
    icon: "monetization_on",
    path: "/manager/earnings",
    match: (p) => p === "/manager/earnings",
  },
  {
    key: "reports",
    label: "Reports",
    icon: "assessment",
    path: "/manager/reports",
    match: (p) => p.startsWith("/manager/reports"),
  },
];

export default function ManagerBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;
        const res = await fetch(`${API_URL}/manager/pending-deliveries/count`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setPendingCount(data.count || 0);
        }
      } catch (e) {
        // silent fail
      }
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto lg:max-w-none bg-white border-t border-[#dbe6e3] z-50">
        <div className="flex items-center justify-around px-1 py-1.5">
          {navItems.map((item) => {
            const isActive = item.match(location.pathname);
            const showBadge = item.key === "reports" && pendingCount > 0;
            return (
              <button
                key={item.key}
                onClick={() => navigate(item.path)}
                className={`relative flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-lg transition-colors min-w-0 flex-1 ${
                  isActive
                    ? "text-[#13ecb9]"
                    : "text-[#618980] hover:text-[#111816]"
                }`}
              >
                <span
                  className="material-symbols-outlined text-[22px]"
                  style={
                    isActive ? { fontVariationSettings: "'FILL' 1" } : undefined
                  }
                >
                  {item.icon}
                </span>
                <span className="text-[10px] font-bold leading-tight">
                  {item.label}
                </span>
                {showBadge && (
                  <span className="absolute -top-0.5 right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center px-1 animate-pulse">
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
      {/* Spacer for bottom nav */}
      <div className="h-16" />
    </>
  );
}
