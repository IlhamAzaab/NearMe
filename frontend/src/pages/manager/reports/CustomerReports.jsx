import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ManagerPageLayout from "../../../components/ManagerPageLayout";
import { ManagerPageSkeleton } from "../../../components/ManagerSkeleton";
import { API_URL } from "../../../config";

export default function CustomerReports() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [search, setSearch] = useState("");
  const [orderFilter, setOrderFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [sortOrder, setSortOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      search,
      orderFilter,
      sortBy,
      sortOrder,
      page: String(page),
      limit: "20",
    });
    return params.toString();
  }, [search, orderFilter, sortBy, sortOrder, page]);

  const fetchCustomers = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }

      const response = await fetch(
        `${API_URL}/manager/reports/customers/management?${queryString}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.message || "Failed to load customers");
      }

      setResult(json);
    } catch (err) {
      console.error("Customer management load error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigate, queryString]);

  useEffect(() => {
    setLoading(true);
    fetchCustomers();
  }, [fetchCustomers]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchCustomers();
  };

  const handleSuspendToggle = async (customer) => {
    const nextSuspended = customer.status !== "suspended";
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      setActionLoading(customer.id);
      const response = await fetch(
        `${API_URL}/manager/reports/customers/${customer.id}/suspend`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            suspended: nextSuspended,
            reason: nextSuspended ? "Suspended by manager" : "",
          }),
        },
      );

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json?.message || "Failed to update customer status");
      }

      await fetchCustomers();
    } catch (err) {
      console.error("Suspend action error:", err);
      alert(err.message || "Failed to update customer status");
    } finally {
      setActionLoading("");
    }
  };

  const handleDelete = async (customer) => {
    const proceed = window.confirm(
      `Remove ${customer.username || customer.email}? This permanently deletes customer data.`,
    );
    if (!proceed) return;

    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      setActionLoading(customer.id);
      const response = await fetch(
        `${API_URL}/manager/reports/customers/${customer.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json?.message || "Failed to remove customer");
      }

      await fetchCustomers();
    } catch (err) {
      console.error("Delete action error:", err);
      alert(err.message || "Failed to remove customer");
    } finally {
      setActionLoading("");
    }
  };

  if (loading && !result) {
    return <ManagerPageSkeleton type="reports" />;
  }

  const summary = result?.summary || {};
  const pagination = result?.pagination || { page: 1, totalPages: 1 };
  const customers = result?.customers || [];

  return (
    <ManagerPageLayout
      title="Customer Management"
      onRefresh={handleRefresh}
      refreshing={refreshing}
    >
      <div className="p-4 space-y-4">
        <div className="rounded-2xl bg-linear-to-r from-[#0f766e] to-[#059669] p-5 text-white shadow-lg">
          <h2 className="text-xl font-bold">Customer Management Center</h2>
          <p className="text-sm text-emerald-50 mt-1">
            Review customer activity, filter by order behavior, suspend
            accounts, and permanently remove records.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <MetricCard label="Total" value={summary.total_customers || 0} />
          <MetricCard label="With Orders" value={summary.with_orders || 0} />
          <MetricCard label="No Orders" value={summary.without_orders || 0} />
          <MetricCard
            label="Suspended"
            value={summary.suspended_customers || 0}
          />
          <MetricCard
            label="Total Spent"
            value={`Rs.${Number(summary.total_order_value || 0).toFixed(0)}`}
          />
        </div>

        <div className="bg-white border border-[#dbe6e3] rounded-2xl p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name, email, phone, city"
              className="px-3 py-2 border border-[#dbe6e3] rounded-lg text-sm"
            />

            <select
              value={orderFilter}
              onChange={(e) => {
                setOrderFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-[#dbe6e3] rounded-lg text-sm"
            >
              <option value="all">All Customers</option>
              <option value="with_orders">At Least One Order</option>
              <option value="without_orders">No Orders</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-[#dbe6e3] rounded-lg text-sm"
            >
              <option value="recent">Recent Signups</option>
              <option value="name">Name</option>
              <option value="orders">Order Count</option>
              <option value="spend">Total Spend</option>
              <option value="last_order">Last Order</option>
            </select>

            <select
              value={sortOrder}
              onChange={(e) => {
                setSortOrder(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-[#dbe6e3] rounded-lg text-sm"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>
        </div>

        <div className="bg-white border border-[#dbe6e3] rounded-2xl overflow-x-auto">
          <table className="w-full min-w-245">
            <thead className="bg-[#f5faf8]">
              <tr className="text-left text-xs uppercase tracking-wide text-[#618980]">
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Orders</th>
                <th className="px-4 py-3">Total Spent</th>
                <th className="px-4 py-3">Last Order</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-8 text-center text-sm text-gray-500"
                  >
                    No customers found for the selected filters.
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="border-t border-[#edf4f1] text-sm text-[#111816]"
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold">
                        {customer.username || "N/A"}
                      </p>
                      <p className="text-xs text-[#618980]">
                        {customer.email || "-"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{customer.phone || "N/A"}</p>
                      <p className="text-xs text-[#618980] truncate max-w-45">
                        {customer.address || "No address"}
                      </p>
                    </td>
                    <td className="px-4 py-3">{customer.city || "N/A"}</td>
                    <td className="px-4 py-3 font-semibold">
                      {customer.order_count || 0}
                    </td>
                    <td className="px-4 py-3 font-semibold text-emerald-700">
                      Rs.{Number(customer.total_spent || 0).toFixed(0)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {customer.last_order_at
                        ? new Date(customer.last_order_at).toLocaleString()
                        : "No orders"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {customer.created_at
                        ? new Date(customer.created_at).toLocaleDateString()
                        : "N/A"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          customer.status === "suspended"
                            ? "bg-red-100 text-red-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {customer.status === "suspended"
                          ? "Suspended"
                          : "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSuspendToggle(customer)}
                          disabled={actionLoading === customer.id}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                        >
                          {customer.status === "suspended"
                            ? "Unsuspend"
                            : "Suspend"}
                        </button>
                        <button
                          onClick={() => handleDelete(customer)}
                          disabled={actionLoading === customer.id}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between bg-white rounded-xl border border-[#dbe6e3] px-4 py-3">
          <p className="text-sm text-[#618980]">
            Page {pagination.page || 1} of {pagination.totalPages || 1}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={(pagination.page || 1) <= 1}
              className="px-3 py-1.5 rounded-lg border border-[#dbe6e3] text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() =>
                setPage((prev) =>
                  Math.min(pagination.totalPages || 1, prev + 1),
                )
              }
              disabled={(pagination.page || 1) >= (pagination.totalPages || 1)}
              className="px-3 py-1.5 rounded-lg border border-[#dbe6e3] text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </ManagerPageLayout>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-[#dbe6e3] px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-[#618980] font-semibold">
        {label}
      </p>
      <p className="text-xl font-bold text-[#111816] mt-1">{value}</p>
    </div>
  );
}
