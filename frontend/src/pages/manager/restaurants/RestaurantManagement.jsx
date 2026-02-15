import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ManagerPageLayout from "../../../components/ManagerPageLayout";
import { ManagerPageSkeleton } from "../../../components/ManagerSkeleton";
import AnimatedAlert, { useAlert } from "../../../components/AnimatedAlert";
import { API_URL } from "../../../config";

const statusColors = {
  active: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  suspended: "bg-orange-100 text-orange-700",
  rejected: "bg-red-100 text-red-700",
  default: "bg-gray-100 text-gray-700",
};

export default function RestaurantManagement() {
  const navigate = useNavigate();
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setRawError] = useState(null);
  const { alert: alertState, visible: alertVisible, showError } = useAlert();
  const setError = (msg) => {
    setRawError(msg);
    if (msg) showError(msg);
  };
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [showImageModal, setShowImageModal] = useState(null);

  const token = useMemo(() => localStorage.getItem("token"), []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetchRestaurants(controller.signal);
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, search]);

  const fetchRestaurants = async (signal) => {
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
        `${API_URL}/manager/restaurants?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        },
      );
      const data = await res.json();

      if (!res.ok) {
        setError(data?.message || "Failed to load restaurants");
      } else {
        setRestaurants(data.restaurants || []);
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setError("Network error while loading restaurants");
      }
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (restaurantId, nextStatus) => {
    if (!token) {
      navigate("/login");
      return;
    }

    setActionLoading(restaurantId);
    setError(null);

    try {
      const res = await fetch(
        `${API_URL}/manager/restaurants/${restaurantId}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: nextStatus }),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || "Failed to update status");
      } else {
        setRestaurants((prev) =>
          prev.map((restaurant) =>
            restaurant.id === restaurantId
              ? { ...restaurant, restaurant_status: nextStatus }
              : restaurant,
          ),
        );
        if (selectedRestaurant?.id === restaurantId) {
          setSelectedRestaurant({
            ...selectedRestaurant,
            restaurant_status: nextStatus,
          });
        }
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

  const formatTime = (value) => {
    if (!value) return "-";
    return value;
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
    <ManagerPageLayout title="Restaurant Management">
      <div className="p-4">
        <AnimatedAlert alert={alertState} visible={alertVisible} />
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">
              Restaurant Management
            </h1>
            <p className="text-gray-600 mt-1">
              Monitor restaurant portfolio, verify business compliance, and
              control platform access.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by restaurant name or city"
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
                  onClick={() => fetchRestaurants()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Restaurant Cards */}
              <div className="lg:col-span-2 space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                {loading ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-teal-400 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading restaurants...</p>
                  </div>
                ) : restaurants.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p>No restaurants found for the selected filters.</p>
                  </div>
                ) : (
                  restaurants.map((restaurant) => (
                    <div
                      key={restaurant.id}
                      onClick={() => setSelectedRestaurant(restaurant)}
                      className={`border rounded-lg p-4 cursor-pointer transition ${
                        selectedRestaurant?.id === restaurant.id
                          ? "border-indigo-600 bg-indigo-50"
                          : "border-gray-200 hover:border-indigo-300"
                      }`}
                    >
                      <div className="flex gap-4">
                        {/* Logo */}
                        <div className="flex-shrink-0">
                          {restaurant.logo_url ? (
                            <img
                              src={restaurant.logo_url}
                              alt={restaurant.restaurant_name}
                              className="w-20 h-20 rounded-lg object-cover cursor-pointer hover:opacity-80"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowImageModal({
                                  url: restaurant.logo_url,
                                  title: `${restaurant.restaurant_name} - Logo`,
                                });
                              }}
                            />
                          ) : (
                            <div className="w-20 h-20 bg-gray-200 rounded-lg flex items-center justify-center">
                              <span className="text-gray-400 text-xs">
                                No Logo
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="font-semibold text-gray-900 text-lg">
                                {restaurant.restaurant_name}
                              </h3>
                              <p className="text-sm text-gray-600 mt-1">
                                {restaurant.city || "-"} •{" "}
                                {restaurant.address || "-"}
                              </p>
                            </div>
                            {renderStatusBadge(restaurant.restaurant_status)}
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-gray-500">Admin:</span>{" "}
                              <span className="text-gray-900 font-medium">
                                {restaurant.admins?.full_name || "-"}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Contact:</span>{" "}
                              <span className="text-gray-900">
                                {restaurant.admins?.phone || "-"}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Hours:</span>{" "}
                              <span className="text-gray-900">
                                {formatTime(restaurant.opening_time)} -{" "}
                                {formatTime(restaurant.close_time)}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Created:</span>{" "}
                              <span className="text-gray-900">
                                {formatDate(restaurant.created_at)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Details Panel */}
              <div className="lg:col-span-1">
                {!selectedRestaurant ? (
                  <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500 sticky top-4">
                    <p>Select a restaurant to view details</p>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-6 space-y-4 sticky top-4 max-h-[70vh] overflow-y-auto">
                    <div>
                      <h3 className="text-lg font-bold text-gray-800 mb-4">
                        Restaurant Details
                      </h3>

                      {/* Cover Image */}
                      {selectedRestaurant.cover_image_url && (
                        <div className="mb-4">
                          <p className="text-xs font-semibold text-gray-600 mb-2">
                            COVER IMAGE
                          </p>
                          <img
                            src={selectedRestaurant.cover_image_url}
                            alt="Cover"
                            className="w-full h-32 object-cover rounded-lg cursor-pointer hover:opacity-80"
                            onClick={() =>
                              setShowImageModal({
                                url: selectedRestaurant.cover_image_url,
                                title: `${selectedRestaurant.restaurant_name} - Cover`,
                              })
                            }
                          />
                        </div>
                      )}

                      <div className="space-y-3 text-sm">
                        <div>
                          <p className="text-xs font-semibold text-gray-600">
                            BUSINESS REG. NO.
                          </p>
                          <p className="text-gray-900 mt-1">
                            {selectedRestaurant.business_registration_number ||
                              "-"}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-semibold text-gray-600">
                            FULL ADDRESS
                          </p>
                          <p className="text-gray-900 mt-1">
                            {selectedRestaurant.address || "-"}
                          </p>
                          <p className="text-gray-600">
                            {selectedRestaurant.city || "-"},{" "}
                            {selectedRestaurant.postal_code || "-"}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-semibold text-gray-600">
                            ADMIN INFO
                          </p>
                          <p className="text-gray-900 mt-1">
                            {selectedRestaurant.admins?.full_name || "-"}
                          </p>
                          <p className="text-gray-600">
                            {selectedRestaurant.admins?.email || "-"}
                          </p>
                          <p className="text-gray-600">
                            {selectedRestaurant.admins?.phone || "-"}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-semibold text-gray-600">
                            OPERATING HOURS
                          </p>
                          <p className="text-gray-900 mt-1">
                            {formatTime(selectedRestaurant.opening_time)} -{" "}
                            {formatTime(selectedRestaurant.close_time)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 space-y-2">
                        {selectedRestaurant.restaurant_status !== "active" && (
                          <button
                            onClick={() =>
                              updateStatus(selectedRestaurant.id, "active")
                            }
                            disabled={actionLoading === selectedRestaurant.id}
                            className="w-full px-4 py-2.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 font-medium"
                          >
                            {actionLoading === selectedRestaurant.id
                              ? "Updating..."
                              : "Activate"}
                          </button>
                        )}
                        {selectedRestaurant.restaurant_status !==
                          "suspended" && (
                          <button
                            onClick={() =>
                              updateStatus(selectedRestaurant.id, "suspended")
                            }
                            disabled={actionLoading === selectedRestaurant.id}
                            className="w-full px-4 py-2.5 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-60 font-medium"
                          >
                            {actionLoading === selectedRestaurant.id
                              ? "Updating..."
                              : "Suspend"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Image Modal */}
        {showImageModal && (
          <div
            className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
            onClick={() => setShowImageModal(null)}
          >
            <div className="relative max-w-4xl max-h-[90vh]">
              <button
                onClick={() => setShowImageModal(null)}
                className="absolute -top-10 right-0 text-white text-2xl hover:text-gray-300"
              >
                ✕
              </button>
              <img
                src={showImageModal.url}
                alt={showImageModal.title}
                className="max-w-full max-h-[85vh] rounded-lg"
              />
              <p className="text-white text-center mt-2">
                {showImageModal.title}
              </p>
            </div>
          </div>
        )}
      </div>
    </ManagerPageLayout>
  );
}
