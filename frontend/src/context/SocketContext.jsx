/**
 * Real-time Delivery Socket Context
 *
 * Purpose: Connect drivers to WebSocket server for instant delivery notifications
 * All online drivers receive new delivery alerts at EXACTLY the same time
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

const SOCKET_URL = "http://localhost:5000";

// Default context value to prevent null errors
const defaultContextValue = {
  socket: null,
  isConnected: false,
  connectAsDriver: () => {},
  disconnect: () => {},
  newDeliveryAlert: null,
  clearNewDeliveryAlert: () => {},
  takenDeliveries: new Set(),
  clearTakenDelivery: () => {},
  clearAllTakenDeliveries: () => {},
};

const SocketContext = createContext(defaultContextValue);

export function useSocket() {
  const context = useContext(SocketContext);
  // Return default if context is null (shouldn't happen if Provider is used correctly)
  return context || defaultContextValue;
}

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [newDeliveryAlert, setNewDeliveryAlert] = useState(null);
  const [takenDeliveries, setTakenDeliveries] = useState(new Set());
  const reconnectAttempts = useRef(0);
  const socketRef = useRef(null);
  const maxReconnectAttempts = 5;

  // Initialize socket connection for drivers
  const connectAsDriver = useCallback(
    (driverId) => {
      if (!driverId) {
        console.warn("[Socket] No driverId provided");
        return;
      }

      // Disconnect existing socket if any
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      console.log(`[Socket] Connecting as driver: ${driverId}`);

      const newSocket = io(SOCKET_URL, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
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
    [], // No dependencies - we use ref instead
  );

  // Disconnect socket
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      const driverId = localStorage.getItem("driverId");
      if (driverId) {
        socketRef.current.emit("driver:offline", driverId);
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
    disconnect,
    newDeliveryAlert,
    clearNewDeliveryAlert,
    takenDeliveries,
    clearTakenDelivery,
    clearAllTakenDeliveries,
  };

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
}

export default SocketProvider;
