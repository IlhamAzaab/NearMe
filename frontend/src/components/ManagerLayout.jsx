import React, { useEffect, useState } from "react";
import ManagerHeader from "./ManagerHeader";
import ManagerSidebar from "./ManagerSidebar";

export default function ManagerLayout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const email = localStorage.getItem("userEmail") || "";
    setUserEmail(email);
    if (email) {
      const name = email.split("@")[0];
      setUserName(name.charAt(0).toUpperCase() + name.slice(1));
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <ManagerHeader userEmail={userEmail} userName={userName} />

      {/* Toggle button for mobile */}
      <div className="lg:hidden px-4 py-2 bg-white border-b sticky top-16 z-40 flex items-center justify-between">
        <button
          onClick={() => setMobileOpen(true)}
          className="px-3 py-2 border rounded-lg text-sm"
        >
          Menu
        </button>
      </div>

      {/* Sidebar */}
      <ManagerSidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      {/* Main content */}
      <main className="pt-4 lg:pt-6 lg:pl-64 px-4 sm:px-6">{children}</main>
    </div>
  );
}
