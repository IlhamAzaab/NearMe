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

import { useEffect, useRef, useCallback } from "react";
import { useSocket } from "../context/SocketContext";
import AdminNotificationBanner from "./AdminNotificationBanner";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

export default function AdminSocketConnector() {
  const queryClient = useQueryClient();
  const {
    socket,
    connectAsAdmin,
    disconnect,
    isConnected,
    adminNotifications,
    dismissAdminNotification,
  } = useSocket();
  const hasConnected = useRef(false);
  const currentRole = useRef(null);
  const location = useLocation();

  // Check if we should connect - validates all required data
  const shouldConnect = useCallback(() => {
    const role = localStorage.getItem("role");
    const token = localStorage.getItem("token");
    const userId = localStorage.getItem("userId");

    return !!(
      role === "admin" &&
      token &&
      token !== "null" &&
      token !== "undefined" &&
      userId &&
      userId !== "null" &&
      userId !== "undefined"
    );
  }, []);

  // Auto-connect when admin is logged in
  useEffect(() => {
    const role = localStorage.getItem("role");
    const userId = localStorage.getItem("userId");

    // Track role changes to handle switching between roles
    if (currentRole.current && currentRole.current !== role) {
      console.log(
        "[AdminSocket] Role changed from",
        currentRole.current,
        "to",
        role,
      );
      if (hasConnected.current) {
        disconnect();
        hasConnected.current = false;
      }
    }
    currentRole.current = role;

    // Only connect if user is a logged-in admin and not yet connected
    if (shouldConnect() && !hasConnected.current && !isConnected) {
      console.log("[AdminSocket] Auto-connecting admin:", userId);
      connectAsAdmin(userId);
      hasConnected.current = true;
    }

    // If user logged out or changed role, disconnect
    if (hasConnected.current && !shouldConnect()) {
      console.log("[AdminSocket] User no longer an admin, disconnecting");
      disconnect();
      hasConnected.current = false;
    }
  }, [
    connectAsAdmin,
    disconnect,
    location.pathname,
    isConnected,
    shouldConnect,
  ]);

  // Listen for auth changes via storage events (login/logout in another tab)
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === "token" || e.key === "role" || e.key === "userId") {
        const userId = localStorage.getItem("userId");

        if (shouldConnect() && !isConnected && !hasConnected.current) {
          console.log(
            "[AdminSocket] Storage change - connecting admin:",
            userId,
          );
          connectAsAdmin(userId);
          hasConnected.current = true;
        } else if (!shouldConnect() && hasConnected.current) {
          console.log("[AdminSocket] Storage change - disconnecting admin");
          disconnect();
          hasConnected.current = false;
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [connectAsAdmin, disconnect, isConnected, shouldConnect]);

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

  // Keep all admin pages fresh when realtime events arrive.
  useEffect(() => {
    if (!socket) return;

    const invalidateAdminQueries = () => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) && query.queryKey[0] === "admin",
      });
    };

    socket.on("order:new_order", invalidateAdminQueries);
    socket.on("admin:order_milestone", invalidateAdminQueries);
    socket.on("admin:payment_received", invalidateAdminQueries);
    socket.on("admin:restaurant_verification", invalidateAdminQueries);

    return () => {
      socket.off("order:new_order", invalidateAdminQueries);
      socket.off("admin:order_milestone", invalidateAdminQueries);
      socket.off("admin:payment_received", invalidateAdminQueries);
      socket.off("admin:restaurant_verification", invalidateAdminQueries);
    };
  }, [queryClient, socket]);

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
