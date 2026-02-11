/**
 * Manager Socket Connector
 *
 * Automatically connects the manager to the WebSocket server
 * when logged in with the "manager" role.
 * Rendered at App root level so notifications work on ALL manager pages.
 */

import { useEffect, useRef } from "react";
import { useSocket } from "../context/SocketContext";

export default function ManagerSocketConnector() {
  const { connectAsManager, disconnect, isConnected } = useSocket();
  const hasConnected = useRef(false);

  useEffect(() => {
    const role = localStorage.getItem("role");
    const token = localStorage.getItem("token");
    const userId = localStorage.getItem("userId");

    // Only connect if user is a logged-in manager and not yet connected
    if (
      role === "manager" &&
      token &&
      userId &&
      !hasConnected.current &&
      !isConnected
    ) {
      console.log("[ManagerSocket] Auto-connecting manager:", userId);
      connectAsManager(userId);
      hasConnected.current = true;
    }

    // If user logged out or changed role, disconnect
    if (hasConnected.current && (!token || role !== "manager")) {
      console.log("[ManagerSocket] User no longer a manager, disconnecting");
      disconnect();
      hasConnected.current = false;
    }
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't disconnect on unmount - socket persists until logout
    };
  }, []);

  return null; // Invisible component
}
