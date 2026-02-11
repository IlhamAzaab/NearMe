/**
 * Customer Socket Connector
 *
 * Automatically connects the customer to the WebSocket server
 * when they are logged in with the "customer" role.
 * This component should be rendered at the App root level
 * so notifications work across ALL customer pages.
 */

import { useEffect, useRef } from "react";
import { useSocket } from "../context/SocketContext";
import CustomerNotificationBanner from "./CustomerNotificationBanner";
import { useNavigate, useLocation } from "react-router-dom";

export default function CustomerSocketConnector() {
  const {
    connectAsCustomer,
    disconnect,
    isConnected,
    customerNotification,
    clearCustomerNotification,
  } = useSocket();
  const hasConnected = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Re-check connection on every route change (catches post-login navigation)
  useEffect(() => {
    const role = localStorage.getItem("role");
    const token = localStorage.getItem("token");
    const userId = localStorage.getItem("userId");

    // Only connect if user is a logged-in customer and not yet connected
    if (
      role === "customer" &&
      token &&
      userId &&
      !hasConnected.current &&
      !isConnected
    ) {
      console.log("[CustomerSocket] Auto-connecting customer:", userId);
      connectAsCustomer(userId);
      hasConnected.current = true;
    }

    // If user logged out or changed role, disconnect
    if (hasConnected.current && (!token || role !== "customer")) {
      console.log("[CustomerSocket] User no longer a customer, disconnecting");
      disconnect();
      hasConnected.current = false;
    }
  }, [connectAsCustomer, disconnect, location.pathname, isConnected]);

  // Listen for auth changes via storage events (login/logout in another tab)
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === "token" || e.key === "role") {
        const role = localStorage.getItem("role");
        const token = localStorage.getItem("token");
        const userId = localStorage.getItem("userId");

        if (
          role === "customer" &&
          token &&
          userId &&
          !isConnected &&
          !hasConnected.current
        ) {
          console.log(
            "[CustomerSocket] Storage change - connecting customer:",
            userId,
          );
          connectAsCustomer(userId);
          hasConnected.current = true;
        } else if ((role !== "customer" || !token) && hasConnected.current) {
          console.log(
            "[CustomerSocket] Storage change - disconnecting customer",
          );
          disconnect();
          hasConnected.current = false;
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [connectAsCustomer, disconnect, isConnected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hasConnected.current) {
        console.log(
          "[CustomerSocket] Component unmounting, cleaning up connection",
        );
        disconnect();
        hasConnected.current = false;
      }
    };
  }, [disconnect]);

  const handleNotificationClick = (notification) => {
    // Navigate to the relevant order page based on status
    if (notification?.order_id) {
      const orderId = notification.order_id;
      const status = notification.status;

      switch (status) {
        case "accepted":
        case "pending":
          navigate(`/order-received/${orderId}`);
          break;
        case "picked_up":
          navigate(`/order-picked-up/${orderId}`);
          break;
        case "on_the_way":
        case "nearby":
          navigate(`/order-on-the-way/${orderId}`);
          break;
        case "delivered":
          navigate(`/order-delivered/${orderId}`);
          break;
        default:
          navigate(`/orders/${orderId}`);
      }
    }
  };

  // Only render the notification banner for customers
  const role = localStorage.getItem("role");
  if (role !== "customer") return null;

  return (
    <CustomerNotificationBanner
      notification={customerNotification}
      onClose={clearCustomerNotification}
      onClick={handleNotificationClick}
    />
  );
}
