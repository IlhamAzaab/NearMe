import React, { useState, useCallback } from "react";
import useDriverNotifications from "../hooks/useDriverNotifications";
import Toast from "./Toast";

/**
 * Realtime Notifications Manager
 *
 * Wraps driver components and provides real-time notifications
 *
 * Usage:
 * <RealtimeNotificationsManager driverId={driverId}>
 *   <YourComponent />
 * </RealtimeNotificationsManager>
 */
const RealtimeNotificationsManager = ({
  driverId,
  children,
  onNotificationReceived = null,
}) => {
  const [toastNotification, setToastNotification] = useState(null);

  // Custom callback when new notification arrives
  const handleNewNotification = useCallback(
    (newNotif) => {
      // Show toast only for new_delivery notifications
      if (newNotif.type === "new_delivery") {
        setToastNotification(newNotif);

        // Optional: Play sound
        playNotificationSound();

        // Optional: Browser notification
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(newNotif.title, {
            body: newNotif.message,
            icon: "/delivery-icon.png",
          });
        }
      }

      // Call external callback if provided
      if (onNotificationReceived) {
        onNotificationReceived(newNotif);
      }
    },
    [onNotificationReceived],
  );

  const {
    notifications,
    unreadCount,
    loading,
    error,
    subscriptionStatus,
    markAsRead,
    markAllAsRead,
  } = useDriverNotifications(driverId, {
    autoSubscribe: true,
    realtimeEnabled: true,
    onNewNotification: handleNewNotification,
    filterTypes: ["new_delivery", "order_ready", "reminder"],
  });

  // Request notification permission on mount
  React.useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  return (
    <>
      {/* Render children with notification context */}
      {React.cloneElement(children, {
        notificationsContext: {
          notifications,
          unreadCount,
          loading,
          error,
          subscriptionStatus,
          markAsRead,
          markAllAsRead,
        },
      })}

      {/* Toast Notifications */}
      <Toast
        notification={toastNotification}
        onClose={() => setToastNotification(null)}
        autoCloseDuration={6000}
      />

      {/* Connection Status Indicator (Optional - for development) */}
      {process.env.NODE_ENV === "development" && (
        <div className="fixed bottom-4 right-4 text-xs text-gray-600 bg-white px-3 py-2 rounded border border-gray-200">
          <span
            className={`inline-block w-2 h-2 rounded-full mr-2 ${
              subscriptionStatus === "subscribed"
                ? "bg-green-500"
                : subscriptionStatus === "subscribing"
                  ? "bg-yellow-500"
                  : subscriptionStatus === "error"
                    ? "bg-red-500"
                    : "bg-gray-300"
            }`}
          ></span>
          Realtime: {subscriptionStatus}
        </div>
      )}
    </>
  );
};

/**
 * Play a sound when notification arrives
 * (Optional - comment out if not needed)
 */
function playNotificationSound() {
  try {
    const audio = new Audio(
      "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==",
    );
    audio.play().catch((err) => console.log("Could not play sound:", err));
  } catch (err) {
    // Silently fail - audio not critical
  }
}

export default RealtimeNotificationsManager;
