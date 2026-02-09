import React, { useState } from "react";
import DriverBottomNav from "./DriverBottomNav";

export default function DriverLayout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Page Content */}
      <main>{children}</main>

      {/* Bottom Navigation */}
      <DriverBottomNav />
    </div>
  );
}
