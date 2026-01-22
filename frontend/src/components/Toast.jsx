import React, { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";

/**
 * Toast Notification Component
 * Shows a floating notification when driver receives a new delivery
 */
const Toast = ({ notification, onClose, autoCloseDuration = 5000 }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, autoCloseDuration);
    return () => clearTimeout(timer);
  }, [onClose, autoCloseDuration]);

  if (!notification) return null;

  const parseMetadata = (metadata) => {
    try {
      return typeof metadata === "string" ? JSON.parse(metadata) : metadata;
    } catch {
      return {};
    }
  };

  const metadata = parseMetadata(notification.metadata);

  return (
    <div className="fixed top-4 right-4 z-50 animate-slideIn">
      <div className="bg-white rounded-lg shadow-lg border-l-4 border-green-500 p-4 max-w-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1">
            <div className="flex-shrink-0 mt-1">
              <Bell className="h-5 w-5 text-green-500 animate-pulse" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">
                {notification.title}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {notification.message}
              </p>
              {metadata.delivery_address && (
                <p className="text-xs text-gray-500 mt-2">
                  📍 {metadata.delivery_address}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Toast;
