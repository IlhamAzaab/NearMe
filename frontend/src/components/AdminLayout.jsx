import React, { useState } from "react";
import AdminSidebar from "./AdminSidebar";
import AdminBottomNavbar from "./AdminBottomNavbar";

export default function AdminLayout({
  children,
  noPadding = false,
  animateReady = true,
  loading = false,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const shouldAnimate = animateReady === true && loading !== true;

  return (
    <div className="min-h-screen bg-white">
      {/* Sidebar - desktop only */}
      <AdminSidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      {/* Main content */}
      <main className="lg:pl-64 pb-20 lg:pb-0 min-h-screen">
        <div
          className={`${shouldAnimate ? "admin-page-enter animate-fadeIn" : ""} ${noPadding ? "" : "p-2 sm:p-3 lg:p-4"}`}
        >
          {children}
        </div>
      </main>

      {/* Bottom Navbar for mobile */}
      <AdminBottomNavbar />

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .animate-fadeIn {
          animation: fadeIn 0.6s ease-out forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .admin-page-enter {
            animation: none !important;
            transform: none !important;
            opacity: 1 !important;
          }
        }
      `}</style>
    </div>
  );
}
