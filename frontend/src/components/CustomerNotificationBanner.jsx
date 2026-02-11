/**
 * Customer Notification Banner
 *
 * iOS-style notification banner that slides down from the top of the screen.
 * Displays real-time order status updates via WebSocket.
 * Matches the design from the provided mockup.
 */

import React, { useState, useEffect, useRef } from "react";

// Notification config based on delivery status
const NOTIFICATION_CONFIG = {
  // Restaurant accepted the order (delivery created as pending)
  order_accepted: {
    icon: "restaurant",
    title: "Order Accepted!",
    bgIcon: "bg-[#13ec37]",
  },
  // Driver accepted the delivery
  driver_assigned: {
    icon: "delivery_dining",
    title: "Driver Accepted!",
    bgIcon: "bg-[#13ec37]",
  },
  // Order picked up from restaurant
  delivery_status_update: {
    icon: "delivery_dining",
    title: "Order Update",
    bgIcon: "bg-[#13ec37]",
  },
  // Driver is nearby (< 100m)
  driver_nearby: {
    icon: "delivery_dining",
    title: "Your Food is Arriving!",
    bgIcon: "bg-[#13ec37]",
  },
  // Fallback
  default: {
    icon: "notifications",
    title: "Order Update",
    bgIcon: "bg-[#13ec37]",
  },
};

// Status-specific icons
const STATUS_ICONS = {
  accepted: "check_circle",
  pending: "restaurant",
  picked_up: "takeout_dining",
  on_the_way: "delivery_dining",
  at_customer: "location_on",
  delivered: "task_alt",
  nearby: "near_me",
};

export default function CustomerNotificationBanner({
  notification,
  onClose,
  onClick,
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (notification) {
      // Reset state
      setIsExiting(false);

      // Trigger entrance animation after a brief delay
      requestAnimationFrame(() => {
        setIsVisible(true);
      });

      // Auto-dismiss after 8 seconds
      timerRef.current = setTimeout(() => {
        handleDismiss();
      }, 8000);

      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    } else {
      setIsVisible(false);
    }
  }, [notification]);

  const handleDismiss = () => {
    setIsExiting(true);
    setIsVisible(false);
    setTimeout(() => {
      onClose?.();
    }, 400);
  };

  const handleClick = () => {
    if (onClick) {
      onClick(notification);
    }
    handleDismiss();
  };

  if (!notification) return null;

  const config =
    NOTIFICATION_CONFIG[notification.type] || NOTIFICATION_CONFIG.default;
  const statusIcon = STATUS_ICONS[notification.status] || config.icon;

  // Determine the title to use
  const displayTitle = notification.title || config.title;
  const displayMessage =
    notification.message || "Your order status has been updated.";

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[9999] px-3 pt-3 transition-all duration-400 ease-out ${
        isVisible && !isExiting
          ? "translate-y-0 opacity-100"
          : "-translate-y-full opacity-0"
      }`}
      style={{ pointerEvents: isVisible ? "auto" : "none" }}
    >
      <div
        className="max-w-lg mx-auto bg-white/95 backdrop-blur-xl rounded-2xl p-4 shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-white/30 cursor-pointer active:scale-[0.98] transition-transform"
        onClick={handleClick}
      >
        <div className="flex items-start gap-3">
          {/* Green icon container */}
          <div
            className={`flex-shrink-0 ${config.bgIcon} w-10 h-10 rounded-xl flex items-center justify-center shadow-sm`}
          >
            <span className="material-symbols-outlined text-white text-[22px]">
              {statusIcon}
            </span>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center mb-0.5">
              <h3 className="text-[#111812] text-sm font-bold leading-tight">
                {displayTitle}
              </h3>
              <span className="text-xs text-[#618968] font-medium ml-2 flex-shrink-0">
                now
              </span>
            </div>
            <p className="text-[#111812] text-sm font-semibold leading-tight mb-0.5">
              {getStatusHeadline(notification)}
            </p>
            <p className="text-[#618968] text-xs leading-snug line-clamp-2">
              {displayMessage}
            </p>
          </div>

          {/* Close button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
            className="flex-shrink-0 text-[#618968] hover:text-[#111812] transition-colors p-0.5 -mt-0.5 -mr-0.5"
          >
            <svg
              className="w-4 h-4"
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

        {/* Progress bar - auto-shrink animation */}
        <div className="mt-3 h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#13ec37] rounded-full"
            style={{
              animation: "notif-shrink 8s linear forwards",
            }}
          />
        </div>
      </div>

      {/* Inline keyframe animation */}
      <style>{`
        @keyframes notif-shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}

/**
 * Returns a short headline based on the notification status
 */
function getStatusHeadline(notification) {
  const status = notification.status;
  const orderNum = notification.order_number
    ? `#${notification.order_number}`
    : "";

  switch (status) {
    case "accepted":
    case "pending":
      return `Your order ${orderNum} is being prepared!`;
    case "picked_up":
      return `Your order ${orderNum} has been picked up!`;
    case "on_the_way":
      return `Your order ${orderNum} is on the way!`;
    case "at_customer":
    case "nearby":
      return `Your food is arriving!`;
    case "delivered":
      return `Your order ${orderNum} has been delivered!`;
    default:
      return notification.title || "Order Update";
  }
}
