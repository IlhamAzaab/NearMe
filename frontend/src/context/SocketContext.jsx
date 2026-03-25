/**
 * Real-time Socket Context
 *
 * Purpose: Connect drivers AND customers to WebSocket server for instant notifications
 * - Drivers: receive new delivery alerts at EXACTLY the same time
 * - Customers: receive real-time order status updates
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { io } from "socket.io-client";
import { API_URL } from "../config";

const SOCKET_URL = API_URL || "http://localhost:5000";
const ADMIN_REMINDER_SNOOZE_KEY = "adminReminderSnoozeUntil";

// Default context value to prevent null errors
const defaultContextValue = {
  socket: null,
  isConnected: false,
  connectAsDriver: () => {},
  connectAsCustomer: () => {},
  connectAsAdmin: () => {},
  connectAsManager: () => {},
  disconnect: () => {},
  newDeliveryAlert: null,
  clearNewDeliveryAlert: () => {},
  takenDeliveries: new Set(),
  clearTakenDelivery: () => {},
  clearAllTakenDeliveries: () => {},
  customerNotification: null,
  clearCustomerNotification: () => {},
  customerNotifications: [],
  clearCustomerNotifications: () => {},
  adminNotifications: [],
  dismissAdminNotification: () => {},
  clearAllAdminNotifications: () => {},
};

const SocketContext = createContext(defaultContextValue);

// Export the hook with proper Fast Refresh compatibility
export const useSocket = () => {
  const context = useContext(SocketContext);
  // Return default if context is null (shouldn't happen if Provider is used correctly)
  return context || defaultContextValue;
};

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [newDeliveryAlert, setNewDeliveryAlert] = useState(null);
  const [takenDeliveries, setTakenDeliveries] = useState(new Set());
  const [customerNotification, setCustomerNotification] = useState(null);
  const [customerNotifications, setCustomerNotifications] = useState([]);
  const [adminNotifications, setAdminNotifications] = useState([]);
  const reconnectAttempts = useRef(0);
  const socketRef = useRef(null);
  const maxReconnectAttempts = 5;

  const hasValidAuth = useCallback((expectedRole, userId) => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    if (!token || !role || !userId) {
      console.log("[Socket] Waiting for auth...");
      return { ok: false, token: null };
    }

    if (expectedRole && role !== expectedRole) {
      console.log("[Socket] Waiting for auth...");
      return { ok: false, token: null };
    }

    return { ok: true, token };
  }, []);

  const getReminderSnoozeMap = useCallback(() => {
    try {
      const raw = localStorage.getItem(ADMIN_REMINDER_SNOOZE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }, []);

  const setReminderSnoozeMap = useCallback((map) => {
    try {
      localStorage.setItem(ADMIN_REMINDER_SNOOZE_KEY, JSON.stringify(map));
    } catch {
      // Ignore storage errors.
    }
  }, []);

  const isReminderSnoozed = useCallback(
    (orderId) => {
      const map = getReminderSnoozeMap();
      const until = Number(map[orderId] || 0);
      if (!until) return false;

      if (Date.now() >= until) {
        delete map[orderId];
        setReminderSnoozeMap(map);
        return false;
      }

      return true;
    },
    [getReminderSnoozeMap, setReminderSnoozeMap],
  );

  // Initialize socket connection for drivers
  const connectAsDriver = useCallback(
    (driverId) => {
      if (!driverId) {
        console.warn("[Socket] No driverId provided");
        return;
      }

      const auth = hasValidAuth("driver", driverId);
      if (!auth.ok) return;

      // Prevent duplicate connections
      if (socketRef.current && socketRef.current.connected) {
        console.log("[Socket] Already connected as driver");
        return socketRef.current;
      }

      // Disconnect existing socket if any
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      console.log(`[Socket] Connecting as driver: ${driverId}`);
      console.log("[Socket] Connecting with token:", auth.token);

      // Get the current JWT token for authentication
      const token = localStorage.getItem("token");

      const newSocket = io(SOCKET_URL, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        autoConnect: true,
        forceNew: true, // Force a new connection
        auth: {
          token: auth.token || token || "",
          driverId: driverId,
        },
      });

      newSocket.on("connect", () => {
        console.log(`[Socket] ✅ Connected: ${newSocket.id}`);
        setIsConnected(true);
        reconnectAttempts.current = 0;

        // Register as driver
        newSocket.emit("driver:register", driverId);
      });

      newSocket.on("driver:registered", (data) => {
        console.log(`[Socket] ✅ Registered as driver:`, data);
      });

      // 🚨 NEW DELIVERY ALERT - This fires INSTANTLY for ALL online drivers
      newSocket.on("delivery:new", (data) => {
        console.log(`[Socket] 🚨 NEW DELIVERY ALERT:`, data);
        console.log(`[Socket] ⏰ Received at: ${new Date().toISOString()}`);
        console.log(`[Socket] 📦 Delivery ID: ${data.delivery_id}`);
        console.log(`[Socket] 🧾 Order #: ${data.order_number}`);

        // Set alert to trigger UI update
        setNewDeliveryAlert({
          ...data,
          receivedAt: Date.now(),
        });

        // Clear alert after showing (for UI purposes)
        setTimeout(() => {
          setNewDeliveryAlert(null);
        }, 10000); // Alert visible for 10 seconds
      });

      // 🔴 DELIVERY TAKEN - Remove from available list
      newSocket.on("delivery:taken", (data) => {
        console.log(`[Socket] ❌ Delivery taken by another driver:`, data);
        setTakenDeliveries((prev) => new Set([...prev, data.delivery_id]));
      });

      newSocket.on("disconnect", (reason) => {
        console.log(`[Socket] ❌ Disconnected: ${reason}`);
        setIsConnected(false);
      });

      newSocket.on("connect_error", (error) => {
        console.error(`[Socket] Connection error:`, error.message);
        reconnectAttempts.current += 1;

        if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.error(`[Socket] Max reconnection attempts reached`);
        }
      });

      newSocket.on("pong", (data) => {
        // Heartbeat response
      });

      socketRef.current = newSocket;
      setSocket(newSocket);

      return newSocket;
    },
    [hasValidAuth], // No state dependencies - socket instance is tracked via ref
  );

  // Initialize socket connection for customers
  const connectAsCustomer = useCallback((customerId) => {
    if (!customerId) {
      console.warn("[Socket] No customerId provided");
      return;
    }

    const auth = hasValidAuth("customer", customerId);
    if (!auth.ok) return;

    // Prevent duplicate connections
    if (socketRef.current && socketRef.current.connected) {
      console.log("[Socket] Already connected as customer");
      return socketRef.current;
    }

    // Disconnect existing socket if any
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    console.log(`[Socket] Connecting as customer: ${customerId}`);
    console.log("[Socket] Connecting with token:", auth.token);

    // Get the current JWT token for authentication
    const token = localStorage.getItem("token");

    const newSocket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true,
      forceNew: true, // Force a new connection
      auth: {
        token: auth.token || token || "",
        customerId: customerId,
      },
    });

    newSocket.on("connect", () => {
      console.log(`[Socket] ✅ Customer connected: ${newSocket.id}`);
      setIsConnected(true);
      reconnectAttempts.current = 0;

      // Register as customer
      newSocket.emit("customer:register", customerId);
    });

    newSocket.on("customer:registered", (data) => {
      console.log(`[Socket] ✅ Registered as customer:`, data);
    });

    // 📦 ORDER STATUS UPDATE - Real-time notifications for customers
    newSocket.on("order:status_update", (data) => {
      console.log(`[Socket] 📦 ORDER STATUS UPDATE:`, data);
      console.log(`[Socket] ⏰ Received at: ${new Date().toISOString()}`);
      console.log(`[Socket] 📋 Status: ${data.status}`);
      console.log(`[Socket] 💬 Message: ${data.message}`);

      // Play notification sound (single ring)
      try {
        const audio = new Audio("/notification-tone.wav");
        audio.volume = 0.7;
        audio.play().catch(() => {});
      } catch {}

      const notification = {
        ...data,
        id: Date.now(),
        receivedAt: Date.now(),
      };

      // Set active notification (for banner display)
      setCustomerNotification(notification);

      // Add to notification queue
      setCustomerNotifications((prev) => [notification, ...prev].slice(0, 20));

      // Auto-clear the banner after 8 seconds
      setTimeout(() => {
        setCustomerNotification((curr) =>
          curr?.id === notification.id ? null : curr,
        );
      }, 8000);
    });

    newSocket.on("disconnect", (reason) => {
      console.log(`[Socket] ❌ Customer disconnected: ${reason}`);
      setIsConnected(false);
    });

    newSocket.on("connect_error", (error) => {
      console.error(`[Socket] Customer connection error:`, error.message);
      reconnectAttempts.current += 1;

      if (reconnectAttempts.current >= maxReconnectAttempts) {
        console.error(`[Socket] Max reconnection attempts reached`);
      }
    });

    newSocket.on("pong", () => {
      // Heartbeat response
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    return newSocket;
  }, [hasValidAuth]);

  // Initialize socket connection for admins (restaurant)
  const connectAsAdmin = useCallback((adminId) => {
    if (!adminId) {
      console.warn("[Socket] No adminId provided");
      return;
    }

    const auth = hasValidAuth("admin", adminId);
    if (!auth.ok) return;

    // Prevent duplicate connections
    if (socketRef.current && socketRef.current.connected) {
      console.log("[Socket] Already connected as admin");
      return socketRef.current;
    }

    // Disconnect existing socket if any
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    console.log(`[Socket] Connecting as admin: ${adminId}`);
    console.log("[Socket] Connecting with token:", auth.token);

    // Get the current JWT token for authentication
    const token = localStorage.getItem("token");

    const newSocket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true,
      forceNew: true,
      auth: {
        token: auth.token || token || "",
        adminId: adminId,
      },
    });

    newSocket.on("connect", () => {
      console.log(`[Socket] \u2705 Admin connected: ${newSocket.id}`);
      setIsConnected(true);
      reconnectAttempts.current = 0;

      // Register as admin
      newSocket.emit("admin:register", adminId);
    });

    newSocket.on("admin:registered", (data) => {
      console.log(`[Socket] \u2705 Registered as admin:`, data);
    });

    // 🚨 NEW ORDER - Real-time notification for restaurant admins
    newSocket.on("order:new_order", (data) => {
      console.log(`[Socket] \ud83d\udea8 NEW ORDER FOR ADMIN:`, data);
      console.log(`[Socket] \u23f0 Received at: ${new Date().toISOString()}`);

      if (data?.type === "order_reminder" && data?.order_id) {
        if (isReminderSnoozed(data.order_id)) {
          console.log(
            `[Socket] Reminder snoozed for order ${data.order_id}; skipping alert`,
          );
          return;
        }
      }

      // Play notification sound (single ring)
      try {
        const audio = new Audio("/notification-tone.wav");
        audio.volume = 0.7;
        audio.play().catch(() => {});
      } catch {}

      const notification = {
        ...data,
        id: Date.now(),
        receivedAt: Date.now(),
      };

      // Add/update admin notifications queue (no auto-dismiss!)
      // If the same order comes again (e.g., reminder), refresh and move to top.
      setAdminNotifications((prev) => {
        const existingIndex = prev.findIndex(
          (n) => n.order_id === data.order_id && !n.isMilestone,
        );

        if (existingIndex !== -1) {
          const next = [...prev];
          next.splice(existingIndex, 1);
          return [notification, ...next];
        }

        return [notification, ...prev];
      });
    });

    // 🎉 RESTAURANT DAILY ORDER MILESTONE (every 10 orders today)
    newSocket.on("admin:order_milestone", (data) => {
      console.log(`[Socket] 🎉 RESTAURANT ORDER MILESTONE:`, data);

      // Play success sound
      try {
        const audio = new Audio("/success-alert.wav");
        audio.volume = 0.6;
        audio.play().catch(() => {});
      } catch {}

      // Browser notification
      if (Notification.permission === "granted") {
        try {
          new Notification("🎉 Order Milestone!", {
            body: data.message || `${data.milestone} orders completed today!`,
            icon: "/icon-192.png",
            tag: `admin-milestone-${data.milestone}`,
          });
        } catch {}
      }

      const milestoneNotif = {
        ...data,
        id: Date.now(),
        order_id: `milestone-${Date.now()}`,
        receivedAt: Date.now(),
        isMilestone: true,
      };

      setAdminNotifications((prev) => [milestoneNotif, ...prev]);
    });

    // 💸 PAYMENT RECEIVED (manager -> admin)
    newSocket.on("admin:payment_received", (data) => {
      console.log(`[Socket] 💸 ADMIN PAYMENT RECEIVED:`, data);

      try {
        const audio = new Audio("/notification-tone.wav");
        audio.volume = 0.7;
        audio.play().catch(() => {});
      } catch {}

      const notification = {
        ...data,
        id: Date.now(),
        order_id: `payment-${data.payment_id || Date.now()}`,
        receivedAt: Date.now(),
      };

      setAdminNotifications((prev) => {
        if (
          data.payment_id &&
          prev.some((n) => n.payment_id === data.payment_id)
        ) {
          return prev;
        }
        return [notification, ...prev];
      });
    });

    newSocket.on("disconnect", (reason) => {
      console.log(`[Socket] \u274c Admin disconnected: ${reason}`);
      setIsConnected(false);
    });

    newSocket.on("connect_error", (error) => {
      console.error(`[Socket] Admin connection error:`, error.message);
      reconnectAttempts.current += 1;

      if (reconnectAttempts.current >= maxReconnectAttempts) {
        console.error(`[Socket] Max reconnection attempts reached`);
      }
    });

    newSocket.on("pong", () => {
      // Heartbeat response
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    return newSocket;
  }, [hasValidAuth]);

  // Initialize socket connection for managers
  const connectAsManager = useCallback((managerId) => {
    if (!managerId) {
      console.warn("[Socket] No managerId provided");
      return;
    }

    const auth = hasValidAuth("manager", managerId);
    if (!auth.ok) return;

    // Prevent duplicate connections
    if (socketRef.current && socketRef.current.connected) {
      console.log("[Socket] Already connected as manager");
      return socketRef.current;
    }

    // Disconnect existing socket if any
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    console.log(`[Socket] Connecting as manager: ${managerId}`);
    console.log("[Socket] Connecting with token:", auth.token);

    // Get the current JWT token for authentication
    const token = localStorage.getItem("token");

    const newSocket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true,
      forceNew: true,
      auth: {
        token: auth.token || token || "",
        managerId: managerId,
      },
    });

    newSocket.on("connect", () => {
      console.log(`[Socket] ✅ Manager connected: ${newSocket.id}`);
      setIsConnected(true);
      reconnectAttempts.current = 0;
      newSocket.emit("manager:register", managerId);
    });

    newSocket.on("manager:registered", (data) => {
      console.log(`[Socket] ✅ Registered as manager:`, data);
    });

    newSocket.on("disconnect", (reason) => {
      console.log(`[Socket] ❌ Manager disconnected: ${reason}`);
      setIsConnected(false);
    });

    newSocket.on("connect_error", (error) => {
      console.error(`[Socket] Manager connection error:`, error.message);
      reconnectAttempts.current += 1;
      if (reconnectAttempts.current >= maxReconnectAttempts) {
        console.error(`[Socket] Max reconnection attempts reached`);
      }
    });

    newSocket.on("pong", () => {});

    socketRef.current = newSocket;
    setSocket(newSocket);
    return newSocket;
  }, [hasValidAuth]);

  useEffect(() => {
    const reconnectAfterRefresh = () => {
      const role = localStorage.getItem("role");
      const userId = localStorage.getItem("userId");

      if (!role || !userId) {
        return;
      }

      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }

      if (role === "driver") {
        connectAsDriver(userId);
      } else if (role === "customer") {
        connectAsCustomer(userId);
      } else if (role === "admin") {
        connectAsAdmin(userId);
      } else if (role === "manager") {
        connectAsManager(userId);
      }
    };

    window.addEventListener("auth:token_refreshed", reconnectAfterRefresh);
    return () => {
      window.removeEventListener(
        "auth:token_refreshed",
        reconnectAfterRefresh,
      );
    };
  }, [connectAsAdmin, connectAsCustomer, connectAsDriver, connectAsManager]);

  // Disconnect socket
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      const driverId = localStorage.getItem("driverId");
      const customerId = localStorage.getItem("userId");
      const role = localStorage.getItem("role");

      if (driverId && role === "driver") {
        socketRef.current.emit("driver:offline", driverId);
      }
      if (customerId && role === "customer") {
        socketRef.current.emit("customer:offline", customerId);
      }
      if (customerId && role === "admin") {
        socketRef.current.emit("admin:offline", customerId);
      }
      if (customerId && role === "manager") {
        socketRef.current.emit("manager:offline", customerId);
      }
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
    }
  }, []);

  // Clear taken delivery from set (after refresh)
  const clearTakenDelivery = useCallback((deliveryId) => {
    setTakenDeliveries((prev) => {
      const newSet = new Set(prev);
      newSet.delete(deliveryId);
      return newSet;
    });
  }, []);

  // Clear all taken deliveries
  const clearAllTakenDeliveries = useCallback(() => {
    setTakenDeliveries(new Set());
  }, []);

  // Clear new delivery alert
  const clearNewDeliveryAlert = useCallback(() => {
    setNewDeliveryAlert(null);
  }, []);

  // Clear customer notification banner
  const clearCustomerNotification = useCallback(() => {
    setCustomerNotification(null);
  }, []);

  // Clear all customer notifications
  const clearCustomerNotifications = useCallback(() => {
    setCustomerNotifications([]);
  }, []);

  // Dismiss a specific admin notification by order_id
  const dismissAdminNotification = useCallback(
    (orderId) => {
      setAdminNotifications((prev) => {
        const target = prev.find((n) => n.order_id === orderId);

        // Dismissing reminder acts like a 10-minute snooze for that order.
        if (target?.type === "order_reminder" && orderId) {
          const map = getReminderSnoozeMap();
          map[orderId] = Date.now() + 10 * 60 * 1000;
          setReminderSnoozeMap(map);
        }

        return prev.filter((n) => n.order_id !== orderId);
      });
    },
    [getReminderSnoozeMap, setReminderSnoozeMap],
  );

  // Clear all admin notifications
  const clearAllAdminNotifications = useCallback(() => {
    setAdminNotifications([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  const value = {
    socket,
    isConnected,
    connectAsDriver,
    connectAsCustomer,
    connectAsAdmin,
    connectAsManager,
    disconnect,
    newDeliveryAlert,
    clearNewDeliveryAlert,
    takenDeliveries,
    clearTakenDelivery,
    clearAllTakenDeliveries,
    customerNotification,
    clearCustomerNotification,
    customerNotifications,
    clearCustomerNotifications,
    adminNotifications,
    dismissAdminNotification,
    clearAllAdminNotifications,
  };

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
}

export default SocketProvider;
