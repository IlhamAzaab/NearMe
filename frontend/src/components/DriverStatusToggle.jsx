import { useState, useEffect } from "react";
import { API_URL } from "../config";

/**
 * Driver Status Toggle Component
 * Allows drivers to manually toggle between active/inactive status
 * Respects working_time schedules and prevents activation outside working hours
 */
const DriverStatusToggle = () => {
  const [statusInfo, setStatusInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Fetch status info on mount and every 30 seconds
  useEffect(() => {
    fetchStatusInfo();
    const interval = setInterval(fetchStatusInfo, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchStatusInfo = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/driver/status-info`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch status info");
      }

      const data = await response.json();
      setStatusInfo(data);
      setLoading(false);
    } catch (err) {
      console.error("Error fetching status info:", err);
      setError("Failed to load status information");
      setLoading(false);
    }
  };

  const handleToggleStatus = async () => {
    const newStatus =
      statusInfo.currentStatus === "active" ? "inactive" : "active";

    setToggling(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/driver/status`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to update status");
      }

      setSuccessMessage(`Status updated to ${newStatus}`);
      await fetchStatusInfo(); // Refresh status info

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error("Error toggling status:", err);
      setError(err.message);
    } finally {
      setToggling(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "active":
        return "bg-green-500";
      case "inactive":
        return "bg-gray-500";
      default:
        return "bg-yellow-500";
    }
  };

  const getStatusTextColor = (status) => {
    switch (status) {
      case "active":
        return "text-green-700";
      case "inactive":
        return "text-gray-700";
      default:
        return "text-yellow-700";
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!statusInfo) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Failed to load driver status</p>
      </div>
    );
  }

  const canToggle =
    statusInfo.currentStatus === "active"
      ? statusInfo.canToggleToInactive
      : statusInfo.canToggleToActive;

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Your Status</h3>
          <p className="text-sm text-gray-600 mt-1">
            {statusInfo.workingTimeDescription}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <div
            className={`h-3 w-3 rounded-full ${getStatusColor(statusInfo.currentStatus)} ${statusInfo.isActive ? "animate-pulse" : ""}`}
          ></div>
          <span
            className={`text-sm font-medium uppercase ${getStatusTextColor(statusInfo.currentStatus)}`}
          >
            {statusInfo.currentStatus}
          </span>
        </div>
      </div>

      {/* Status Messages */}
      {!statusInfo.shouldBeActive && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-sm text-yellow-800">
            ⏰ You are currently outside your working hours. You'll be able to
            accept deliveries during your scheduled time.
          </p>
        </div>
      )}

      {statusInfo.shouldBeActive && statusInfo.currentStatus === "inactive" && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-800">
            💡 You're within your working hours. Activate your status to start
            receiving delivery requests.
          </p>
        </div>
      )}

      {statusInfo.isActive && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-sm text-green-800">
            ✅ You are active and can receive delivery requests!
          </p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-sm text-green-800">✓ {successMessage}</p>
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={handleToggleStatus}
        disabled={!canToggle || toggling}
        className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-colors ${
          canToggle && !toggling
            ? statusInfo.currentStatus === "active"
              ? "bg-gray-600 hover:bg-gray-700"
              : "bg-green-600 hover:bg-green-700"
            : "bg-gray-300 cursor-not-allowed"
        }`}
      >
        {toggling ? (
          <span className="flex items-center justify-center">
            <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Updating...
          </span>
        ) : statusInfo.currentStatus === "active" ? (
          "Go Inactive"
        ) : (
          "Go Active"
        )}
      </button>

      {/* Additional Info */}
      {statusInfo.nextStatusChange && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-600">
            Next automatic status change:{" "}
            {new Date(statusInfo.nextStatusChange).toLocaleTimeString()}
          </p>
        </div>
      )}

      <div className="mt-2 text-xs text-gray-500 text-center">
        Status updates automatically every 30 seconds
      </div>
    </div>
  );
};

export default DriverStatusToggle;
