import React, { useState } from "react";
import AdminSidebar from "./AdminSidebar";
import AdminBottomNavbar from "./AdminBottomNavbar";

export default function AdminLayout({ children, noPadding = false }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      {/* Sidebar - desktop only */}
      <AdminSidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      {/* Main content */}
      <main className="lg:pl-64 pb-20 lg:pb-0 min-h-screen">
        <div className={noPadding ? "" : "p-2 sm:p-3 lg:p-4"}>{children}</div>
      </main>

      {/* Bottom Navbar for mobile */}
      <AdminBottomNavbar />
    </div>
  );
}
