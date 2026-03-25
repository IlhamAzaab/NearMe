/**
 * Manager Socket Connector
 *
 * Automatically connects the manager to the WebSocket server
 * when logged in with the "manager" role.
 * Rendered at App root level so notifications work on ALL manager pages.
 */

import { useEffect, useRef, useCallback } from "react";
import { useSocket } from "../context/SocketContext";
import { useLocation } from "react-router-dom";

export default function ManagerSocketConnector() {
  const { connectAsManager, disconnect, isConnected } = useSocket();
  const hasConnected = useRef(false);
  const currentRole = useRef(null);
  const location = useLocation();

  // Check if we should connect - validates all required data
  const shouldConnect = useCallback(() => {
    const role = localStorage.getItem("role");
    const token = localStorage.getItem("token");
    const userId = localStorage.getItem("userId");

    // Validate that all required data exists and role is manager
    return !!(
      role === "manager" &&
      token &&
      token !== "null" &&
      token !== "undefined" &&
      userId &&
      userId !== "null" &&
      userId !== "undefined"
    );
  }, []);

  // Auto-connect when manager is logged in
  useEffect(() => {
    const role = localStorage.getItem("role");
    const userId = localStorage.getItem("userId");

    // Track role changes to handle switching between roles
    if (currentRole.current && currentRole.current !== role) {
      console.log(
        "[ManagerSocket] Role changed from",
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

    // Only connect if user is a logged-in manager and not yet connected
    if (shouldConnect() && !hasConnected.current && !isConnected) {
      console.log("[ManagerSocket] Auto-connecting manager:", userId);
      connectAsManager(userId);
      hasConnected.current = true;
    }

    // If user logged out or changed role, disconnect
    if (hasConnected.current && !shouldConnect()) {
      console.log("[ManagerSocket] User no longer a manager, disconnecting");
      disconnect();
      hasConnected.current = false;
    }
  }, [
    connectAsManager,
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
            "[ManagerSocket] Storage change - connecting manager:",
            userId,
          );
          connectAsManager(userId);
          hasConnected.current = true;
        } else if (!shouldConnect() && hasConnected.current) {
          console.log("[ManagerSocket] Storage change - disconnecting manager");
          disconnect();
          hasConnected.current = false;
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [connectAsManager, disconnect, isConnected, shouldConnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hasConnected.current) {
        console.log(
          "[ManagerSocket] Component unmounting, cleaning up connection",
        );
        disconnect();
        hasConnected.current = false;
      }
    };
  }, [disconnect]);

  return null; // Invisible component
}
