import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ManagerPageLayout from "../../../components/ManagerPageLayout";
import { ManagerPageSkeleton } from "../../../components/ManagerSkeleton";
import AnimatedAlert, { useAlert } from "../../../components/AnimatedAlert";
import PageWrapper from "../../../components/PageWrapper";
import { API_URL } from "../../../config";

const statusColors = {
  active: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  suspended: "bg-orange-100 text-orange-700",
  rejected: "bg-red-100 text-red-700",
  default: "bg-gray-100 text-gray-700",
};

export default function AdminManagement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [admins, setAdmins] = useState([]);
  const [error, setRawError] = useState(null);
  const { alert: alertState, visible: alertVisible, showError } = useAlert();
  const setError = (msg) => {
    setRawError(msg);
    if (msg) showError(msg);
  };
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState("");

  const token = useMemo(() => localStorage.getItem("token"), []);

  const fetchAdmins = async (signal) => {
    if (!token) {
      navigate("/login");
      return [];
    }

    const params = new URLSearchParams();
    if (statusFilter !== "all") params.append("status", statusFilter);
    if (search.trim()) params.append("search", search.trim());

    const res = await fetch(`${API_URL}/manager/admins?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.message || "Failed to load admins");
    }
    return data.admins || [];
  };

  const {
    data: queriedAdmins = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["manager", "users", "admins", statusFilter, search],
    enabled: !!token,
    staleTime: 60 * 1000,
    queryFn: ({ signal }) => fetchAdmins(signal),
  });

  useEffect(() => {
    setAdmins(queriedAdmins);
  }, [queriedAdmins]);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ adminId, nextStatus }) => {
      const res = await fetch(`${API_URL}/manager/admins/${adminId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to update status");
      }
      return { adminId, nextStatus };
    },
    onSuccess: async ({ adminId, nextStatus }) => {
      setAdmins((prev) =>
        prev.map((admin) =>
          admin.id === adminId ? { ...admin, admin_status: nextStatus } : admin,
        ),
      );
      await queryClient.invalidateQueries({
        queryKey: ["manager", "users", "admins"],
      });
    },
  });

  const updateStatus = async (adminId, nextStatus) => {
    if (!token) {
      navigate("/login");
      return;
    }

    setActionLoading(adminId);
    setError(null);

    try {
      await updateStatusMutation.mutateAsync({ adminId, nextStatus });
    } catch (err) {
      setError(err.message || "Network error while updating status");
    } finally {
      setActionLoading("");
    }
  };

  const loading = isLoading && admins.length === 0;
  const refreshing = !loading && isFetching;

  if (loading) {
    return <ManagerPageSkeleton type="table" />;
  }

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
    <ManagerPageLayout title="Admin Management">
      <div className="p-4">
        <AnimatedAlert alert={alertState} visible={alertVisible} />
        <PageWrapper
          isFetching={refreshing}
          dataKey={`admins-${statusFilter}-${search}-${admins.length}`}
        >
          <div className="max-w-6xl mx-auto space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">
                Admin Management
              </h1>
              <p className="text-gray-600 mt-1">
                Track restaurant admins, monitor completion, and quickly suspend
                or activate accounts.
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
                    onClick={() => refetch()}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">
                        Admin
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">
                        Restaurant
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">
                        Contact
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
                    {admins.length === 0 ? (
                      <tr>
                        <td
                          colSpan="7"
                          className="px-4 py-6 text-center text-gray-500"
                        >
                          No admins found for the selected filters.
                        </td>
                      </tr>
                    ) : (
                      admins.map((admin) => (
                        <tr key={admin.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">
                              {admin.full_name || "(Not provided)"}
                            </div>
                            <div className="text-sm text-gray-600">
                              {admin.email}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {admin.restaurants ? (
                              <div className="flex items-center gap-2">
                                {admin.restaurants.logo_url && (
                                  <img
                                    src={admin.restaurants.logo_url}
                                    alt="logo"
                                    className="w-8 h-8 rounded object-cover"
                                  />
                                )}
                                <span className="text-sm font-medium text-gray-900">
                                  {admin.restaurants.restaurant_name}
                                </span>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-500">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {admin.phone || "-"}
                          </td>
                          <td className="px-4 py-3">
                            {renderStatusBadge(admin.admin_status)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {admin.profile_completed ? (
                              <span className="text-green-700">Completed</span>
                            ) : (
                              <span className="text-yellow-700">
                                Incomplete
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {formatDate(admin.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              {admin.admin_status !== "active" && (
                                <button
                                  onClick={() =>
                                    updateStatus(admin.id, "active")
                                  }
                                  disabled={actionLoading === admin.id}
                                  className="px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60"
                                >
                                  {actionLoading === admin.id
                                    ? "Saving..."
                                    : "Activate"}
                                </button>
                              )}
                              {admin.admin_status !== "suspended" && (
                                <button
                                  onClick={() =>
                                    updateStatus(admin.id, "suspended")
                                  }
                                  disabled={actionLoading === admin.id}
                                  className="px-3 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-60"
                                >
                                  {actionLoading === admin.id
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
        </PageWrapper>
      </div>
    </ManagerPageLayout>
  );
}
