import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ManagerLayout from "../../../components/ManagerLayout";

const statusColors = {
  active: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  suspended: "bg-orange-100 text-orange-700",
  rejected: "bg-red-100 text-red-700",
  default: "bg-gray-100 text-gray-700",
};

export default function DriverManagement() {
  const navigate = useNavigate();
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState("");

  const token = useMemo(() => localStorage.getItem("token"), []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetchDrivers(controller.signal);
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, search]);

  const fetchDrivers = async (signal) => {
    if (!token) {
      navigate("/login");
      return;
    }

    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (statusFilter !== "all") params.append("status", statusFilter);
    if (search.trim()) params.append("search", search.trim());

    try {
      const res = await fetch(
        `http://localhost:5000/manager/drivers?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        }
      );
      const data = await res.json();

      if (!res.ok) {
        setError(data?.message || "Failed to load drivers");
      } else {
        setDrivers(data.drivers || []);
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setError("Network error while loading drivers");
      }
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (driverId, nextStatus) => {
    if (!token) {
      navigate("/login");
      return;
    }

    setActionLoading(driverId);
    setError(null);

    try {
      const res = await fetch(
        `http://localhost:5000/manager/drivers/${driverId}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: nextStatus }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || "Failed to update status");
      } else {
        setDrivers((prev) =>
          prev.map((driver) =>
            driver.id === driverId
              ? { ...driver, driver_status: nextStatus }
              : driver
          )
        );
      }
    } catch (err) {
      setError("Network error while updating status");
    } finally {
      setActionLoading("");
    }
  };

  const formatDate = (value) => {
    if (!value) return "-";
    return new Date(value).toLocaleDateString();
  };

  const renderStatusBadge = (status) => {
    const color = statusColors[status] || statusColors.default;
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${color}`}>
        {status || "unknown"}
      </span>
    );
  };

  return (
    <ManagerLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">
            Driver Management
          </h1>
          <p className="text-gray-600 mt-1">
            Manage the active fleet, keep compliance in check, and pause risky
            accounts fast.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email"
              className="w-full sm:w-1/2 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="suspended">Suspended</option>
                <option value="rejected">Rejected</option>
              </select>

              <button
                onClick={() => fetchDrivers()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
              >
                Refresh
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">
                    Driver
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">
                    Contact
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">
                    Segment
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">
                    Profile
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td
                      colSpan="7"
                      className="px-4 py-6 text-center text-gray-500"
                    >
                    <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-teal-400 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
                    </td>
                  </tr>
                ) : drivers.length === 0 ? (
                  <tr>
                    <td
                      colSpan="7"
                      className="px-4 py-6 text-center text-gray-500"
                    >
                      No drivers found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  drivers.map((driver) => (
                    <tr key={driver.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {driver.full_name || "(Not provided)"}
                        </div>
                        <div className="text-sm text-gray-600">
                          {driver.email}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {driver.phone || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {driver.driver_type || "-"} • {driver.city || "-"}
                      </td>
                      <td className="px-4 py-3">
                        {renderStatusBadge(driver.driver_status)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {driver.profile_completed ? (
                          <span className="text-green-700">Completed</span>
                        ) : (
                          <span className="text-yellow-700">Incomplete</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {formatDate(driver.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {driver.driver_status !== "active" && (
                            <button
                              onClick={() => updateStatus(driver.id, "active")}
                              disabled={actionLoading === driver.id}
                              className="px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60"
                            >
                              {actionLoading === driver.id
                                ? "Saving..."
                                : "Activate"}
                            </button>
                          )}
                          {driver.driver_status !== "suspended" && (
                            <button
                              onClick={() =>
                                updateStatus(driver.id, "suspended")
                              }
                              disabled={actionLoading === driver.id}
                              className="px-3 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-60"
                            >
                              {actionLoading === driver.id
                                ? "Saving..."
                                : "Suspend"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ManagerLayout>
  );
}
