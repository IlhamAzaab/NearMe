/**
 * Admin Socket Connector
 *
 * Automatically connects the restaurant admin to the WebSocket server
 * when they are logged in with the "admin" role.
 * This component should be rendered at the App root level
 * so notifications work across ALL admin pages.
 *
 * Renders the AdminNotificationBanner for real-time new order alerts.
 */

import { useEffect, useRef } from "react";
import { useSocket } from "../context/SocketContext";
import AdminNotificationBanner from "./AdminNotificationBanner";
import { useLocation } from "react-router-dom";

export default function AdminSocketConnector() {
  const {
    connectAsAdmin,
    disconnect,
    isConnected,
    adminNotifications,
    dismissAdminNotification,
  } = useSocket();
  const hasConnected = useRef(false);
  const location = useLocation();

  // Auto-connect when admin is logged in
  useEffect(() => {
    const role = localStorage.getItem("role");
    const token = localStorage.getItem("token");
    const userId = localStorage.getItem("userId");

    // Only connect if user is a logged-in admin and not yet connected
    if (
      role === "admin" &&
      token &&
      userId &&
      !hasConnected.current &&
      !isConnected
    ) {
      console.log("[AdminSocket] Auto-connecting admin:", userId);
      connectAsAdmin(userId);
      hasConnected.current = true;
    }

    // If user logged out or changed role, disconnect
    if (hasConnected.current && (!token || role !== "admin")) {
      console.log("[AdminSocket] User no longer an admin, disconnecting");
      disconnect();
      hasConnected.current = false;
    }
  }, [connectAsAdmin, disconnect, location.pathname, isConnected]);

  // Listen for auth changes via storage events (login/logout in another tab)
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === "token" || e.key === "role") {
        const role = localStorage.getItem("role");
        const token = localStorage.getItem("token");
        const userId = localStorage.getItem("userId");

        if (
          role === "admin" &&
          token &&
          userId &&
          !isConnected &&
          !hasConnected.current
        ) {
          console.log(
            "[AdminSocket] Storage change - connecting admin:",
            userId,
          );
          connectAsAdmin(userId);
          hasConnected.current = true;
        } else if ((role !== "admin" || !token) && hasConnected.current) {
          console.log("[AdminSocket] Storage change - disconnecting admin");
          disconnect();
          hasConnected.current = false;
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [connectAsAdmin, disconnect, isConnected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hasConnected.current) {
        console.log(
          "[AdminSocket] Component unmounting, cleaning up connection",
        );
        disconnect();
        hasConnected.current = false;
      }
    };
  }, [disconnect]);

  // Only render for admins
  const role = localStorage.getItem("role");
  if (role !== "admin") return null;

  return (
    <AdminNotificationBanner
      notifications={adminNotifications}
      onDismiss={dismissAdminNotification}
      onAccepted={(orderId) => {
        console.log("[AdminSocket] Order accepted:", orderId);
      }}
    />
  );
}
