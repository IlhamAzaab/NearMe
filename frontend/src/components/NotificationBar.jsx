import React from "react";
import { useNotification } from "../contexts/NotificationContext";

const NotificationBar = () => {
  const { notifications, removeNotification } = useNotification();

  const getBackgroundColor = (type) => {
    switch (type) {
      case "success":
        return "bg-green-50 border-green-200";
      case "error":
        return "bg-red-50 border-red-200";
      case "warning":
        return "bg-yellow-50 border-yellow-200";
      case "info":
        return "bg-blue-50 border-blue-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  const getTextColor = (type) => {
    switch (type) {
      case "success":
        return "text-green-800";
      case "error":
        return "text-red-800";
      case "warning":
        return "text-yellow-800";
      case "info":
        return "text-blue-800";
      default:
        return "text-gray-800";
    }
  };

  const getBorderColor = (type) => {
    switch (type) {
      case "success":
        return "border-l-4 border-l-green-600";
      case "error":
        return "border-l-4 border-l-red-600";
      case "warning":
        return "border-l-4 border-l-yellow-600";
      case "info":
        return "border-l-4 border-l-blue-600";
      default:
        return "border-l-4 border-l-gray-600";
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case "success":
        return "✓";
      case "error":
        return "✕";
      case "warning":
        return "⚠";
      case "info":
        return "ℹ";
      default:
        return "•";
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none">
      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-3">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`${getBackgroundColor(notification.type)} ${getBorderColor(notification.type)} rounded-lg p-4 shadow-lg animate-slide-down pointer-events-auto`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div
                  className={`text-xl font-bold ${getTextColor(notification.type)}`}
                >
                  {getIcon(notification.type)}
                </div>
                <div className="flex-1">
                  <p
                    className={`font-semibold ${getTextColor(notification.type)}`}
                  >
                    {notification.message}
                  </p>
                  <p className="text-xs opacity-75 mt-1">
                    {notification.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => removeNotification(notification.id)}
                className={`flex-shrink-0 text-lg font-bold hover:opacity-70 transition-opacity ${getTextColor(notification.type)}`}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NotificationBar;
