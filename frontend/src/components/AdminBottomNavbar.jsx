import React, { useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL } from "../config";

const AdminBottomNavbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const token = localStorage.getItem("token");
  const ORDERS_QUERY_KEY = ["admin", "orders"];

  const { data: orders = [] } = useQuery({
    queryKey: ORDERS_QUERY_KEY,
    enabled: !!token,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    initialData: queryClient.getQueryData(ORDERS_QUERY_KEY) || undefined,
    queryFn: async () => {
      const response = await fetch(`${API_URL}/orders/restaurant/orders`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Failed to fetch orders");
      }

      const data = await response.json();
      return data.orders || [];
    },
  });

  const newOrdersCount = useMemo(() => {
    const normalizeDeliveries = (deliveries) => {
      if (!deliveries) return [];
      return Array.isArray(deliveries) ? deliveries : [deliveries];
    };

    const getDeliveryStatus = (order) => {
      const deliveries = normalizeDeliveries(order?.deliveries);
      return deliveries[0]?.status || order?.delivery_status || order?.status || "placed";
    };

    return (orders || []).filter((order) => getDeliveryStatus(order) === "placed")
      .length;
  }, [orders]);

  // Determine active nav based on current path
  const getActiveNav = () => {
    const path = location.pathname;
    if (path === "/admin/dashboard" || path === "/admin") return "home";
    if (path === "/admin/products" || path === "/admin/categories")
      return "products";
    if (path === "/admin/orders") return "orders";
    if (path === "/admin/earnings") return "earnings";
    if (
      path === "/admin/profile" ||
      path === "/admin/settings" ||
      path === "/admin/account"
    )
      return "account";
    return null;
  };

  const activeNav = getActiveNav();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 py-2 px-2 shadow-2xl z-50">
      <div className="flex justify-around items-center max-w-lg mx-auto">
        {/* Home */}
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
          onClick={() => navigate("/admin/dashboard")}
        />

        {/* Products */}
        <NavItem
          icon={
            <svg
              className="w-6 h-6"
              fill={activeNav === "products" ? "currentColor" : "none"}
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
          }
          label="Products"
          active={activeNav === "products"}
          onClick={() => navigate("/admin/products")}
        />

        {/* Orders */}
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
          badge={newOrdersCount > 0 ? newOrdersCount : null}
          onClick={() => navigate("/admin/orders")}
        />

        {/* Earnings */}
        <NavItem
          icon={
            <svg
              className="w-6 h-6"
              fill={activeNav === "earnings" ? "currentColor" : "none"}
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
          label="Earnings"
          active={activeNav === "earnings"}
          onClick={() => navigate("/admin/earnings")}
        />

        {/* Account */}
        <NavItem
          icon={
            <svg
              className="w-6 h-6"
              fill={activeNav === "account" ? "currentColor" : "none"}
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
          label="Account"
          active={activeNav === "account"}
          onClick={() => navigate("/admin/account")}
        />
      </div>
    </nav>
  );
};

const NavItem = ({ icon, label, active, onClick, badge }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center gap-0.5 py-1.5 px-3 transition-all duration-200 rounded-xl ${
      active
        ? "text-green-600 bg-green-50"
        : "text-gray-400 hover:text-green-400"
    }`}
  >
    <div className="relative">
      {icon}
      {badge && (
        <span className="absolute -top-2 -right-2 w-5 h-5 bg-green-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
          {badge}
        </span>
      )}
    </div>
    <span className={`text-xs ${active ? "font-semibold" : "font-medium"}`}>
      {label}
    </span>
  </button>
);

export default AdminBottomNavbar;
