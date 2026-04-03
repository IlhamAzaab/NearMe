import React, { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import ManagerBottomNav from "./ManagerBottomNav";
import meezoLogo from "../assets/MeezoLogo.svg";

// Sidebar link items for each section
const driverSidebarLinks = [
  {
    to: "/manager/drivers/add",
    label: "Add Driver",
    icon: "person_add",
  },
  {
    to: "/manager/drivers/manage",
    label: "Driver Management",
    icon: "group",
  },
  {
    to: "/manager/drivers/verify",
    label: "Verify Drivers",
    icon: "verified_user",
  },
  {
    to: "/manager/deposits",
    label: "Driver Deposits",
    icon: "account_balance_wallet",
  },
  {
    to: "/manager/driver-payments",
    label: "Driver Payments",
    icon: "payments",
  },
];

const adminSidebarLinks = [
  {
    to: "/manager/restaurants/addadmin",
    label: "Add Admin",
    icon: "person_add",
  },
  {
    to: "/manager/restaurants/admins",
    label: "Admin Management",
    icon: "admin_panel_settings",
  },
  {
    to: "/manager/restaurants/manage",
    label: "Restaurant Management",
    icon: "storefront",
  },
  {
    to: "/manager/restaurants/pending",
    label: "Pending Restaurants",
    icon: "pending_actions",
  },
  {
    to: "/manager/admin-payments",
    label: "Admin Payments",
    icon: "payments",
  },
];

const reportsSidebarLinks = [
  {
    to: "/manager/reports",
    label: "Overview",
    icon: "bar_chart",
  },
  {
    to: "/manager/reports/sales",
    label: "Sales Reports",
    icon: "trending_up",
  },
  {
    to: "/manager/reports/deliveries",
    label: "Delivery Reports",
    icon: "local_shipping",
  },
  {
    to: "/manager/reports/restaurants",
    label: "Restaurant Reports",
    icon: "restaurant",
  },
  {
    to: "/manager/reports/financial",
    label: "Financial Reports",
    icon: "payments",
  },
  {
    to: "/manager/reports/customers",
    label: "Customer Reports",
    icon: "people",
  },
  {
    to: "/manager/reports/analytics",
    label: "Time Analytics",
    icon: "schedule",
  },
  {
    to: "/manager/reports/pending-deliveries",
    label: "Pending Deliveries",
    icon: "delivery_dining",
  },
  {
    to: "/manager/reports/operations",
    label: "Operations Config",
    icon: "tune",
  },
];

const notificationSidebarLinks = [
  {
    to: "/manager/send-notification",
    label: "Overview",
    icon: "campaign",
  },
  {
    to: "/manager/send-notification/customer",
    label: "Notify Customers",
    icon: "person",
  },
  {
    to: "/manager/send-notification/admin",
    label: "Notify Admins",
    icon: "admin_panel_settings",
  },
  {
    to: "/manager/send-notification/driver",
    label: "Notify Drivers",
    icon: "delivery_dining",
  },
];

function getSection(pathname) {
  if (
    pathname.startsWith("/manager/drivers") ||
    pathname === "/manager/deposits" ||
    pathname.startsWith("/manager/deposits/") ||
    pathname.startsWith("/manager/driver-payments")
  ) {
    return "drivers";
  }
  if (
    pathname.startsWith("/manager/restaurants") ||
    pathname.startsWith("/manager/admin-payments")
  ) {
    return "admins";
  }
  if (pathname.startsWith("/manager/send-notification")) {
    return "notifications";
  }
  if (pathname.startsWith("/manager/reports")) {
    return "reports";
  }
  return null;
}

function getSidebarConfig(section) {
  switch (section) {
    case "drivers":
      return { title: "Driver Management", links: driverSidebarLinks };
    case "admins":
      return { title: "Restaurant & Admin", links: adminSidebarLinks };
    case "reports":
      return { title: "Reports", links: reportsSidebarLinks };
    case "notifications":
      return { title: "Send Notifications", links: notificationSidebarLinks };
    default:
      return null;
  }
}

function SidebarContent({ config, onClose }) {
  if (!config) return null;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-[#dbe6e3]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#13ecb9]/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-[#13ecb9] text-lg">
              {config.links[0]?.icon || "menu"}
            </span>
          </div>
          <span className="font-bold text-[#111816] text-sm">
            {config.title}
          </span>
        </div>
        {onClose && (
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            onClick={onClose}
            aria-label="Close menu"
          >
            <span className="material-symbols-outlined text-[#618980]">
              close
            </span>
          </button>
        )}
      </div>

      {/* Nav Links */}
      <nav className="p-3 space-y-1 overflow-y-auto flex-1">
        {config.links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-[#13ecb9]/10 text-[#111816] font-bold"
                  : "text-[#618980] hover:bg-gray-50 hover:text-[#111816]"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`material-symbols-outlined text-lg ${
                    isActive ? "text-[#13ecb9]" : "text-[#618980]"
                  }`}
                  style={
                    isActive ? { fontVariationSettings: "'FILL' 1" } : undefined
                  }
                >
                  {link.icon}
                </span>
                <span>{link.label}</span>
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#13ecb9]" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/**
 * ManagerPageLayout - Unified layout for all manager pages.
 * Provides: top header, section sidebar (if applicable), bottom nav, consistent styling.
 *
 * Props:
 *   - title: page title shown in header
 *   - children: page content
 *   - onRefresh: optional refresh handler (adds refresh button)
 *   - refreshing: if refresh is in progress
 *   - hideSidebar: force hide sidebar (e.g. for dashboard)
 */
export default function ManagerPageLayout({
  title = "Manager",
  children,
  onRefresh,
  refreshing = false,
  hideSidebar = false,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const section = hideSidebar ? null : getSection(location.pathname);
  const sidebarConfig = section ? getSidebarConfig(section) : null;
  const hasSidebar = !!sidebarConfig;

  return (
    <div
      className="min-h-screen bg-[#f6f8f8] flex flex-col"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-[#dbe6e3]">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Left: Menu toggle (mobile, if sidebar) or Logo */}
          <div className="flex items-center gap-3">
            {hasSidebar && (
              <button
                onClick={() => setMobileOpen(true)}
                className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-[#618980]"
              >
                <span className="material-symbols-outlined">menu</span>
              </button>
            )}
            <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center shadow-sm border border-[#dbe6e3] p-1">
              <img
                src={meezoLogo}
                alt="Meezo"
                className="w-full h-full object-contain"
              />
            </div>
          </div>

          {/* Center: Title */}
          <h1 className="text-[#111816] text-base font-bold leading-tight tracking-tight">
            {title}
          </h1>

          {/* Right: Refresh + User */}
          <div className="flex items-center gap-1">
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={refreshing}
                className={`p-2 rounded-lg hover:bg-gray-100 transition-colors text-[#618980] ${
                  refreshing ? "animate-spin" : ""
                }`}
              >
                <span className="material-symbols-outlined text-xl">
                  refresh
                </span>
              </button>
            )}
            <button
              onClick={() => navigate("/manager/account")}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-[#618980]"
            >
              <span className="material-symbols-outlined text-xl">
                account_circle
              </span>
            </button>
          </div>
        </div>

        {/* Refreshing indicator */}
        {refreshing && (
          <div className="bg-[#13ecb9]/10 py-0.5 px-4 text-center">
            <span className="text-[10px] text-[#13ecb9] font-medium">
              Refreshing...
            </span>
          </div>
        )}
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        {hasSidebar && (
          <aside className="hidden lg:block w-56 shrink-0 bg-white border-r border-[#dbe6e3] overflow-y-auto">
            <SidebarContent config={sidebarConfig} />
          </aside>
        )}

        {/* Mobile Sidebar Drawer */}
        {hasSidebar && mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-2xl animate-slide-in-left">
              <SidebarContent
                config={sidebarConfig}
                onClose={() => setMobileOpen(false)}
              />
            </aside>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto pb-4">{children}</main>
      </div>

      {/* Bottom Navigation */}
      <ManagerBottomNav />

      {/* Slide-in animation style */}
      <style>{`
        @keyframes slideInLeft {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-left {
          animation: slideInLeft 0.25s ease-out;
        }
      `}</style>
    </div>
  );
}
