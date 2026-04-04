/**
 * Driver Socket Connector
 *
 * Automatically connects the driver to the WebSocket server
 * when they are logged in with the "driver" role.
 * This component should be rendered at the App root level
 * so delivery notifications work across ALL driver pages,
 * even when not on the Available Deliveries page.
 */

import { useEffect, useRef, useCallback } from "react";
import { useSocket } from "../context/SocketContext";
import { useLocation } from "react-router-dom";

export default function DriverSocketConnector() {
  const { connectAsDriver, disconnect, isConnected } = useSocket();
  const hasConnected = useRef(false);
  const currentRole = useRef(null);
  const location = useLocation();

  // Check if we should connect - validates all required data
  const shouldConnect = useCallback(() => {
    const role = localStorage.getItem("role");
    const token = localStorage.getItem("token");
    const userId = localStorage.getItem("userId");
    const currentPath = String(window.location?.pathname || "");
    const isDriverBlockedPage =
      currentPath.startsWith("/driver/pending") ||
      currentPath.startsWith("/driver/onboarding");

    // Validate that all required data exists and role is driver
    return !!(
      role === "driver" &&
      !isDriverBlockedPage &&
      token &&
      token !== "null" &&
      token !== "undefined" &&
      userId &&
      userId !== "null" &&
      userId !== "undefined"
    );
  }, []);

  // Auto-connect when driver is logged in
  useEffect(() => {
    const role = localStorage.getItem("role");
    const userId = localStorage.getItem("userId");

    // Track role changes to handle switching between roles
    if (currentRole.current && currentRole.current !== role) {
      console.log(
        "[DriverSocket] Role changed from",
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

    // Only connect if user is a logged-in driver and not yet connected
    if (shouldConnect() && !hasConnected.current && !isConnected) {
      console.log("[DriverSocket] Auto-connecting driver:", userId);
      connectAsDriver(userId);
      hasConnected.current = true;
    }

    // If user logged out or changed role, disconnect
    if (hasConnected.current && !shouldConnect()) {
      console.log("[DriverSocket] User no longer a driver, disconnecting");
      disconnect();
      hasConnected.current = false;
    }
  }, [
    connectAsDriver,
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
            "[DriverSocket] Storage change - connecting driver:",
            userId,
          );
          connectAsDriver(userId);
          hasConnected.current = true;
        } else if (!shouldConnect() && hasConnected.current) {
          console.log("[DriverSocket] Storage change - disconnecting driver");
          disconnect();
          hasConnected.current = false;
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [connectAsDriver, disconnect, isConnected, shouldConnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hasConnected.current) {
        console.log(
          "[DriverSocket] Component unmounting, cleaning up connection",
        );
        disconnect();
        hasConnected.current = false;
      }
    };
  }, [disconnect]);

  return null; // This component doesn't render anything
}
