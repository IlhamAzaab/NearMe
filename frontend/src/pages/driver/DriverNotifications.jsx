import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../../config";
import {
  Bell,
  Package,
  Check,
  Clock,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useDriverNotifications } from "../../hooks/useDriverNotifications";

/**
 * Driver Notifications Page
 * Displays notifications for active drivers based on working_time
 * Uses Realtime subscriptions for instant updates
 */
const DriverNotifications = () => {
  const [statusInfo, setStatusInfo] = useState(null);
  const [filter, setFilter] = useState("all"); // all, unread, read
  const navigate = useNavigate();

  // Get driver ID from token
  const [driverId, setDriverId] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        // Try multiple possible ID fields in the JWT
        const userId =
          payload.sub || payload.id || payload.userId || payload.user_id;

        setDriverId(userId);

        if (!userId) {
          console.error(
            "❌ No user ID found in token. Payload keys:",
            Object.keys(payload),
          );
        }
      } catch (err) {
        console.error("❌ Error decoding token:", err);
      }
    } else {
      console.error("❌ No token found in localStorage");
    }
  }, []);

  // Use Realtime notifications hook
  const {
    notifications,
    unreadCount,
    loading,
    error: subscriptionError,
    subscriptionStatus,
    markAsRead,
  } = useDriverNotifications(driverId, {
    autoSubscribe: true,
    realtimeEnabled: true,
    onNewNotification: (newNotif) => {
      console.log("🎉 New notification callback:", newNotif);
      // Show toast or other visual feedback
    },
    filterTypes: ["new_delivery", "order_assigned", "order_ready", "reminder"],
  });

  // Fetch status info periodically
  useEffect(() => {
    const fetchStatusInfo = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(`${API_URL}/driver/status-info`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setStatusInfo(data);
        }
      } catch (err) {
        console.error("Error fetching status info:", err);
      }
    };

    fetchStatusInfo();
    const interval = setInterval(fetchStatusInfo, 30000);

    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    console.log("🔄 Manual refresh triggered");
    // Notifications will auto-update from Realtime
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case "order_assigned":
      case "new_delivery":
        return <Package className="h-5 w-5 text-blue-500" />;
      case "order_ready":
        return <Check className="h-5 w-5 text-green-500" />;
      case "reminder":
        return <Clock className="h-5 w-5 text-yellow-500" />;
      default:
        return <Bell className="h-5 w-5 text-gray-500" />;
    }
  };

  const handleNotificationClick = (notification) => {
    markAsRead(notification.id);

    // Navigate based on notification type
    try {
      const metadata = notification.metadata
        ? JSON.parse(notification.metadata)
        : {};

      if (metadata.order_id) {
        navigate("/driver/deliveries");
      } else if (metadata.delivery_id) {
        navigate("/driver/deliveries");
      }
    } catch (err) {
      console.error("Error parsing notification metadata:", err);
    }
  };

  const filteredNotifications = notifications.filter((notif) => {
    if (filter === "unread") return !notif.is_read;
    if (filter === "read") return notif.is_read;
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Notifications
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {statusInfo?.workingTime || "Loading..."}
              </p>
              {process.env.NODE_ENV === "development" && (
                <p className="text-xs text-gray-500 mt-1">
                  Realtime: {subscriptionStatus} | Driver:{" "}
                  {driverId?.slice(0, 8)}...
                </p>
              )}
            </div>
            <div className="flex items-center space-x-3">
              {unreadCount > 0 && (
                <div className="flex items-center space-x-2 bg-blue-100 px-4 py-2 rounded-full">
                  <Bell className="h-5 w-5 text-blue-600" />
                  <span className="font-semibold text-blue-600">
                    {unreadCount} New
                  </span>
                </div>
              )}
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <RefreshCw
                  className={`h-5 w-5 text-gray-600 ${loading ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Realtime Status */}
        {subscriptionError && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-400 p-4 rounded-lg">
            <p className="text-sm text-red-700">
              Realtime connection error: {subscriptionError}
            </p>
          </div>
        )}

        {/* Status Banner */}
        {statusInfo && !statusInfo.isActive && (
          <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg">
            <div className="flex items-start">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 mr-3" />
              <div>
                <h3 className="text-sm font-medium text-yellow-800">
                  {statusInfo.shouldBeActive
                    ? "You're Inactive"
                    : "Outside Working Hours"}
                </h3>
                <p className="text-sm text-yellow-700 mt-1">
                  {statusInfo.shouldBeActive
                    ? "Activate your status to receive delivery notifications."
                    : "You'll receive notifications when you're within your scheduled working time."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="mb-6 bg-white rounded-lg shadow-sm p-1 flex space-x-1">
          <button
            onClick={() => setFilter("all")}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              filter === "all"
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            All ({notifications.length})
          </button>
          <button
            onClick={() => setFilter("unread")}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              filter === "unread"
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            Unread ({notifications.filter((n) => !n.is_read).length})
          </button>
          <button
            onClick={() => setFilter("read")}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              filter === "read"
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            Read (
            {notifications.length -
              notifications.filter((n) => !n.is_read).length}
            )
          </button>
        </div>

        {/* Notifications List */}
        {filteredNotifications.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <Bell className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No Notifications
            </h3>
            <p className="text-gray-600">
              {filter === "unread"
                ? "You're all caught up! No unread notifications."
                : filter === "read"
                  ? "No read notifications yet."
                  : statusInfo?.isActive
                    ? "New notifications will appear here when you receive them."
                    : "Activate your status to start receiving notifications."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNotifications.map((notification) => {
              const isUnread = !notification.is_read;

              return (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`bg-white rounded-lg shadow-sm p-4 cursor-pointer transition-all hover:shadow-md ${
                    isUnread ? "border-l-4 border-blue-500" : ""
                  }`}
                >
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0 mt-1">
                      {getNotificationIcon(notification.type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4
                            className={`text-sm font-medium ${
                              isUnread ? "text-gray-900" : "text-gray-600"
                            }`}
                          >
                            {notification.title}
                          </h4>
                          <p
                            className={`text-sm mt-1 ${
                              isUnread ? "text-gray-700" : "text-gray-500"
                            }`}
                          >
                            {notification.message}
                          </p>
                        </div>

                        {isUnread && (
                          <div className="ml-3 flex-shrink-0">
                            <div className="h-2 w-2 bg-blue-500 rounded-full"></div>
                          </div>
                        )}
                      </div>

                      <div className="mt-2 flex items-center text-xs text-gray-500">
                        <Clock className="h-3 w-3 mr-1" />
                        {new Date(notification.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Auto-refresh indicator */}
        <div className="mt-6 text-center text-xs text-gray-500">
          Auto-refreshing every 15 seconds • Last updated:{" "}
          {new Date().toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};

export default DriverNotifications;
