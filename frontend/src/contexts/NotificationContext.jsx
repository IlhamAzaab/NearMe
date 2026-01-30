import React, { createContext, useContext, useState, useCallback } from "react";

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  const addNotification = useCallback(
    (message, type = "success", duration = 5000) => {
      const id = Date.now();
      const notification = {
        id,
        message,
        type, // "success", "error", "warning", "info"
        timestamp: new Date(),
      };

      setNotifications((prev) => [...prev, notification]);

      // Auto-remove notification after duration
      if (duration > 0) {
        setTimeout(() => {
          removeNotification(id);
        }, duration);
      }

      return id;
    },
    [],
  );

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return (
    <NotificationContext.Provider
      value={{ notifications, addNotification, removeNotification }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within NotificationProvider");
  }
  return context;
};
