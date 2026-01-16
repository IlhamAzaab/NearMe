// ============================================================================
// Notification Toast Component
// Place in: frontend/src/components/NotificationToast.jsx
// ============================================================================

import React, { useState, useEffect } from "react";

export default function NotificationToast({ notification, onClose }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (notification) {
      setIsVisible(true);

      // Auto-hide after 5 seconds
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 300); // Wait for fade-out animation
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [notification, onClose]);

  if (!notification) return null;

  const getIcon = (type) => {
    switch (type) {
      case "new_order":
        return "🔔";
      case "new_delivery":
        return "📦";
      case "driver_assigned":
        return "🛵";
      case "delivery_status_update":
        return "📍";
      case "order_accepted":
        return "✅";
      case "order_rejected":
        return "❌";
      default:
        return "📢";
    }
  };

  return (
    <div
      className={`fixed top-20 right-4 z-50 transform transition-all duration-300 ease-in-out ${
        isVisible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
      }`}
    >
      <div className="bg-white rounded-lg shadow-2xl border border-gray-200 p-4 min-w-[320px] max-w-md">
        <div className="flex items-start">
          {/* Icon */}
          <div className="flex-shrink-0 text-3xl mr-3">
            {getIcon(notification.type)}
          </div>

          {/* Content */}
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-gray-900 mb-1">
              {notification.title}
            </h4>
            <p className="text-sm text-gray-600">{notification.message}</p>
            {notification.metadata?.order_number && (
              <p className="text-xs text-gray-500 mt-1">
                Order: {notification.metadata.order_number}
              </p>
            )}
          </div>

          {/* Close Button */}
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(onClose, 300);
            }}
            className="flex-shrink-0 ml-2 text-gray-400 hover:text-gray-600"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Progress Bar */}
        <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 animate-shrink"
            style={{ animation: "shrink 5s linear forwards" }}
          ></div>
        </div>
      </div>

      <style jsx>{`
        @keyframes shrink {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>
    </div>
  );
}
