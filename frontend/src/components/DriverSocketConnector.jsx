/**
 * Driver Socket Connector
 *
 * Automatically connects the driver to the WebSocket server
 * when they are logged in with the "driver" role.
 * This component should be rendered at the App root level
 * so delivery notifications work across ALL driver pages,
 * even when not on the Available Deliveries page.
 */

import { useEffect, useRef } from "react";
import { useSocket } from "../context/SocketContext";

export default function DriverSocketConnector() {
  const { connectAsDriver, disconnect, isConnected } = useSocket();
  const hasConnected = useRef(false);

  useEffect(() => {
    const role = localStorage.getItem("role");
    const token = localStorage.getItem("token");
    const userId = localStorage.getItem("userId");

    // Only connect if user is a logged-in driver and not yet connected
    if (
      role === "driver" &&
      token &&
      userId &&
      !hasConnected.current &&
      !isConnected
    ) {
      console.log("[DriverSocket] Auto-connecting driver:", userId);
      connectAsDriver(userId);
      hasConnected.current = true;
    }

    // If user logged out or changed role, disconnect
    if (hasConnected.current && (!token || role !== "driver")) {
      console.log("[DriverSocket] User no longer a driver, disconnecting");
      disconnect();
      hasConnected.current = false;
    }
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hasConnected.current) {
        // Don't disconnect on unmount - let the socket persist
        // The socket will disconnect on logout via the SocketContext
      }
    };
  }, []);

  return null; // This component doesn't render anything
}
