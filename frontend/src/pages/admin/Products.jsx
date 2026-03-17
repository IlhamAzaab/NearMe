import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import AnimatedAlert, { useAlert } from "../../components/AnimatedAlert";
import { API_URL } from "../../config";

export default function Products() {
  const navigate = useNavigate();
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setRawError] = useState(null);
  const {
    alert: alertState,
    visible: alertVisible,
    showSuccess,
    showError,
  } = useAlert();
  const setError = (msg) => {
    setRawError(msg);
    if (msg) showError(msg);
  };
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingFood, setEditingFood] = useState(null);
  const [search, setSearch] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");

  const token = localStorage.getItem("token");

  useEffect(() => {
    fetchFoods();
  }, []);

  const fetchFoods = async () => {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/admin/foods`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.message || "Failed to load products");
      } else {
        setFoods(data.foods || []);
      }
    } catch (err) {
      setError("Network error while loading products");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (foodId) => {
    if (!window.confirm("Are you sure you want to delete this product?"))
      return;

    try {
      const res = await fetch(`${API_URL}/admin/foods/${foodId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setFoods(foods.filter((f) => f.id !== foodId));
      } else {
        const data = await res.json();
        showError(data?.message || "Failed to delete product");
      }
    } catch (err) {
      showError("Error deleting product");
      console.error(err);
    }
  };

  const openEdit = (food) => {
    setEditingFood(food);
    setShowAddModal(true);
  };

  const toggleAvailability = async (e, food) => {
    e.stopPropagation();
    const newValue = !food.is_available;
    // Optimistic update
    setFoods((prev) =>
      prev.map((f) =>
        f.id === food.id ? { ...f, is_available: newValue } : f,
      ),
    );
    try {
      const res = await fetch(`${API_URL}/admin/foods/${food.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_available: newValue }),
      });
      if (!res.ok) {
        // Revert on failure
        setFoods((prev) =>
          prev.map((f) =>
            f.id === food.id ? { ...f, is_available: !newValue } : f,
          ),
        );
        const data = await res.json();
        showError(data?.message || "Failed to update availability");
      }
    } catch {
      setFoods((prev) =>
        prev.map((f) =>
          f.id === food.id ? { ...f, is_available: !newValue } : f,
        ),
      );
      showError("Network error updating availability");
    }
  };

  const filteredFoods = foods.filter((food) => {
    const matchesSearch = food.name
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesAvailability =
      availabilityFilter === "all" ||
      (availabilityFilter === "available" && food.is_available) ||
      (availabilityFilter === "unavailable" && !food.is_available);
    return matchesSearch && matchesAvailability;
  });

  const renderStars = (rating = 0) => {
    return (
      <div className="flex items-center gap-1">
        <div className="flex">
          {[...Array(5)].map((_, i) => (
            <svg
              key={i}
              className={`w-4 h-4 ${
                i < Math.round(rating)
                  ? "text-yellow-400 fill-current"
                  : "text-gray-300"
              }`}
              viewBox="0 0 20 20"
            >
              <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
            </svg>
          ))}
        </div>
        <span className="text-sm text-gray-600">{rating.toFixed(1)}</span>
      </div>
    );
  };

  if (loading) {
    return (
      <AdminLayout loading={loading}>
        <div className="space-y-3">
          <div className="h-10 w-40 bg-gray-100 rounded-xl skeleton-fade" />
          <div className="h-12 w-full bg-gray-100 rounded-2xl skeleton-fade" />
          <div className="h-12 w-full bg-gray-100 rounded-2xl skeleton-fade" />
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 skeleton-fade"
            >
              <div className="flex gap-3">
                <div className="w-16 h-16 bg-gray-100 rounded-xl shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-4 w-1/2 bg-gray-100 rounded" />
                  <div className="h-3 w-3/4 bg-gray-100 rounded" />
                  <div className="h-4 w-16 bg-gray-100 rounded mt-2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout loading={loading}>
      <AnimatedAlert alert={alertState} visible={alertVisible} />
      <div className="space-y-3">
        {/* ── Header bar ── */}
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2.5">
            <div className="flex flex-col items-end pt-1 px-2">
              <p className="text-3xl font-medium">Products</p>
              <div className="w-18 h-0.75 bg-green-600 rounded-full"></div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Availability Filter */}
            <select
              value={availabilityFilter}
              onChange={(e) => setAvailabilityFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 transition-all cursor-pointer"
            >
              <option value="all">All Products</option>
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
            </select>
            <div
              className="relative cursor-pointer"
              onClick={() => navigate("/admin/notifications")}
            >
              <div className="w-10 h-10 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
              </div>
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500"></span>
            </div>
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer"
              style={{ background: "#06C168" }}
              onClick={() => navigate("/admin/account")}
            >
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* ── Search bar ── */}
        <div className="relative">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <svg
              className="w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search food items, categories..."
            className="w-full pl-10 pr-4 py-3 bg-gray-100 rounded-2xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 border-0"
            style={{ "--tw-ring-color": "#06C168" }}
          />
        </div>

        {/* ── Add Product button ── */}
        <button
          onClick={() => {
            setEditingFood(null);
            setShowAddModal(true);
          }}
          className="w-full py-3.5 rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-transform"
          style={{ background: "#06C168" }}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add Product
        </button>

        {/* ── Products List ── */}
        <div className="space-y-3">
          {filteredFoods.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-2xl flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                  />
                </svg>
              </div>
              <p className="text-base font-semibold text-gray-700">
                No products found
              </p>
              <p className="text-sm mt-1 text-gray-400">
                {foods.length === 0
                  ? 'Tap "Add Product" to create your first item.'
                  : "No products match your search."}
              </p>
            </div>
          ) : (
            filteredFoods.map((food) => (
              <div
                key={food.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 relative"
              >
                <div className="flex gap-3">
                  {/* Image */}
                  <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-gray-100">
                    {food.image_url ? (
                      <img
                        src={food.image_url}
                        alt={food.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <svg
                          className="w-7 h-7"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-gray-900 text-sm leading-tight">
                        {food.name}
                      </p>
                      {/* Availability Toggle — top right */}
                      <button
                        onClick={(e) => toggleAvailability(e, food)}
                        className="flex items-center gap-1.5 shrink-0"
                      >
                        <span
                          className={`text-[10px] font-bold ${food.is_available ? "text-emerald-600" : "text-gray-400"}`}
                        >
                          {food.is_available ? "Available" : "Unavailable"}
                        </span>
                        <div
                          className="relative w-10 h-5 rounded-full transition-colors duration-200"
                          style={{
                            background: food.is_available
                              ? "#06C168"
                              : "#d1d5db",
                          }}
                        >
                          <div
                            className={`absolute top-[3px] left-[3px] w-3.5 h-3.5 bg-white rounded-full shadow transition-transform duration-200 ${food.is_available ? "translate-x-5" : "translate-x-0"}`}
                          />
                        </div>
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                      {food.description || "No description"}
                    </p>

                    {/* Sizes & Prices */}
                    <div className="mt-2 space-y-1">
                      {/* Regular size */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-gray-400 uppercase w-12 shrink-0">
                          {food.regular_size || "Regular"}
                        </span>
                        <span
                          className="text-sm font-bold"
                          style={{ color: "#06C168" }}
                        >
                          Rs. {food.offer_price || food.regular_price}
                        </span>
                        {food.offer_price && (
                          <span className="text-xs text-gray-400 line-through font-normal">
                            Rs. {food.regular_price}
                          </span>
                        )}
                      </div>
                      {/* Extra size (if exists) */}
                      {food.extra_price && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-gray-400 uppercase w-12 shrink-0">
                            {food.extra_size || "Extra"}
                          </span>
                          <span
                            className="text-sm font-bold"
                            style={{ color: "#06C168" }}
                          >
                            Rs. {food.extra_offer_price || food.extra_price}
                          </span>
                          {food.extra_offer_price && (
                            <span className="text-xs text-gray-400 line-through font-normal">
                              Rs. {food.extra_price}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Edit / Delete icons — bottom right */}
                <div className="absolute bottom-4 right-4 flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(food);
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <svg
                      className="w-4 h-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(food.id);
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <svg
                      className="w-4 h-4 text-gray-400 hover:text-red-400 transition-colors"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add/Edit Product Modal */}
      {showAddModal && (
        <AddProductModal
          food={editingFood}
          onClose={() => {
            setShowAddModal(false);
            setEditingFood(null);
          }}
          onSave={() => {
            fetchFoods();
            setShowAddModal(false);
            setEditingFood(null);
          }}
        />
      )}
    </AdminLayout>
  );
}

function AddProductModal({ food, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: food?.name || "",
    description: food?.description || "",
    image_url: food?.image_url || "",
    available_time: food?.available_time || [],
    regular_size: food?.regular_size || "",
    regular_portion: food?.regular_portion || "",
    regular_price: food?.regular_price || "",
    offer_price: food?.offer_price || "",
    extra_size: food?.extra_size || "",
    extra_portion: food?.extra_portion || "",
    extra_price: food?.extra_price || "",
    extra_offer_price: food?.extra_offer_price || "",
    is_available: food?.is_available ?? true,
  });

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setRawError] = useState(null);
  const {
    alert: alertState2,
    visible: alertVisible2,
    showSuccess: showSuccess2,
    showError: showError2,
  } = useAlert();
  const setError = (msg) => {
    setRawError(msg);
    if (msg) showError2(msg);
  };
  const token = localStorage.getItem("token");

  const availableTimes = ["breakfast", "lunch", "dinner"];

  useEffect(() => {
    setFormData({
      name: food?.name || "",
      description: food?.description || "",
      image_url: food?.image_url || "",
      available_time: food?.available_time || [],
      regular_size: food?.regular_size || "",
      regular_portion: food?.regular_portion || "",
      regular_price: food?.regular_price || "",
      offer_price: food?.offer_price || "",
      extra_size: food?.extra_size || "",
      extra_portion: food?.extra_portion || "",
      extra_price: food?.extra_price || "",
      extra_offer_price: food?.extra_offer_price || "",
      is_available: food?.is_available ?? true,
    });
  }, [food]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleTimeToggle = (time) => {
    setFormData((prev) => ({
      ...prev,
      available_time: prev.available_time.includes(time)
        ? prev.available_time.filter((t) => t !== time)
        : [...prev.available_time, time],
    }));
  };

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const imageData = event.target.result;

          // Upload to Cloudinary via backend
          const res = await fetch(`${API_URL}/admin/upload-image`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ imageData }),
          });

          const data = await res.json();

          if (!res.ok) {
            setError(data?.message || "Failed to upload image");
          } else {
            setFormData({ ...formData, image_url: data.url });
          }
        } catch (err) {
          setError("Error uploading image");
          console.error(err);
        } finally {
          setUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError("Error processing image");
      setUploading(false);
      console.error(err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Validation
    if (!formData.name.trim()) {
      setError("Product name is required");
      setLoading(false);
      return;
    }

    if (!formData.regular_price) {
      setError("Regular price is required");
      setLoading(false);
      return;
    }

    if (formData.available_time.length === 0) {
      setError("Select at least one available time");
      setLoading(false);
      return;
    }

    try {
      const url = food
        ? `${API_URL}/admin/foods/${food.id}`
        : `${API_URL}/admin/foods`;

      const method = food ? "PATCH" : "POST";

      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        image_url: formData.image_url || null,
        available_time: formData.available_time,
        is_available: !!formData.is_available,
        regular_size: formData.regular_size.trim() || null,
        regular_portion: formData.regular_portion.trim() || null,
        regular_price: parseFloat(formData.regular_price),
        offer_price: formData.offer_price
          ? parseFloat(formData.offer_price)
          : null,
        extra_size: formData.extra_size.trim() || null,
        extra_portion: formData.extra_portion.trim() || null,
        extra_price: formData.extra_price
          ? parseFloat(formData.extra_price)
          : null,
        extra_offer_price: formData.extra_offer_price
          ? parseFloat(formData.extra_offer_price)
          : null,
      };

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.message || "Failed to save product");
      } else {
        onSave();
      }
    } catch (err) {
      setError("Network error while saving product");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fileInputRef = useRef(null);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-gray-50 w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl max-h-[95vh] flex flex-col shadow-2xl">
        {/* ── Header ── */}
        <div className="sticky top-0 bg-white z-10 px-4 py-3.5 flex items-center justify-between border-b border-gray-100 sm:rounded-t-2xl">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              <svg
                className="w-5 h-5 text-gray-700"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <h2 className="text-base font-bold text-gray-900">
              {food ? "Edit Product" : "Add New Product"}
            </h2>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById("product-form").requestSubmit();
            }}
            disabled={loading || uploading}
            className="px-4 py-2 rounded-xl text-white text-xs font-bold disabled:opacity-50 transition-colors"
            style={{ background: "#06C168" }}
          >
            {loading ? "Saving..." : food ? "Save" : "Save Product"}
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">
          <form
            id="product-form"
            onSubmit={handleSubmit}
            className="px-4 py-4 space-y-4"
          >
            <AnimatedAlert alert={alertState2} visible={alertVisible2} />

            {/* ── Product Media ── */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <h3 className="text-sm font-bold text-gray-900 mb-3">
                Product Image
              </h3>
              <div className="bg-green-50 border-2 border-dashed border-green-200 rounded-2xl flex flex-col items-center justify-center py-8 px-4 relative">
                {formData.image_url ? (
                  <div className="relative">
                    <img
                      src={formData.image_url}
                      alt="Preview"
                      className="w-24 h-24 rounded-xl object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({ ...formData, image_url: "" })
                      }
                      className="absolute -top-2 -right-2 w-6 h-6 bg-green-200 text-[#06C168] rounded-full flex items-center justify-center text-xs shadow"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <>
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center mb-2"
                      style={{ background: "#06C168" }}
                    >
                      <svg
                        className="w-6 h-6 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-gray-700">
                      Upload Food Image
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      JPG, PNG . Max size of 2MB
                    </p>
                  </>
                )}
                {uploading && (
                  <p
                    className="text-xs font-semibold mt-2"
                    style={{ color: "#06C168" }}
                  >
                    Uploading...
                  </p>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  disabled={uploading}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="mt-3 px-5 py-2 rounded-xl text-white text-xs font-bold disabled:opacity-50"
                  style={{ background: "#06C168" }}
                >
                  Browse Files
                </button>
              </div>
            </div>

            {/* ── Basic Information ── */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
              <h3 className="text-sm font-bold text-gray-900">
                Basic Information
              </h3>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Product Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ "--tw-ring-color": "#06C168" }}
                  placeholder="e.g. Chicken Koththu"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent resize-none"
                  style={{ "--tw-ring-color": "#06C168" }}
                  placeholder="Tell us about the ingredients and taste..."
                />
              </div>
            </div>

            {/* ── Pricing & Sizes ── */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">
                  Regular Size
                </h3>
              </div>

              {/* Regular size fields */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Size
                </label>
                <input
                  type="text"
                  name="regular_size"
                  value={formData.regular_size}
                  onChange={handleInputChange}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ "--tw-ring-color": "#06C168" }}
                  placeholder="Regular"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Portion
                </label>
                <input
                  type="text"
                  name="regular_portion"
                  value={formData.regular_portion}
                  onChange={handleInputChange}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ "--tw-ring-color": "#06C168" }}
                  placeholder="1 or 2 etc.."
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Price (Rs.) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  name="regular_price"
                  required
                  min="0"
                  step="10"
                  value={formData.regular_price}
                  onChange={handleInputChange}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ "--tw-ring-color": "#06C168" }}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Offer Price (Rs.)
                </label>
                <input
                  type="number"
                  name="offer_price"
                  min="0"
                  step="10"
                  value={formData.offer_price}
                  onChange={handleInputChange}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ "--tw-ring-color": "#06C168" }}
                  placeholder="0.00"
                />
              </div>

              {/* Extra size fields */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
                  Extra Size (If you have)
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Size
                    </label>
                    <input
                      type="text"
                      name="extra_size"
                      value={formData.extra_size}
                      onChange={handleInputChange}
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                      style={{ "--tw-ring-color": "#06C168" }}
                      placeholder="Large"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Portion
                    </label>
                    <input
                      type="text"
                      name="extra_portion"
                      value={formData.extra_portion}
                      onChange={handleInputChange}
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                      style={{ "--tw-ring-color": "#06C168" }}
                      placeholder="2 or 3 etc.."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Price (Rs.)
                    </label>
                    <input
                      type="number"
                      name="extra_price"
                      min="0"
                      step="10"
                      value={formData.extra_price}
                      onChange={handleInputChange}
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                      style={{ "--tw-ring-color": "#06C168" }}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Offer Price (Rs.)
                    </label>
                    <input
                      type="number"
                      name="extra_offer_price"
                      min="0"
                      step="10"
                      value={formData.extra_offer_price}
                      onChange={handleInputChange}
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                      style={{ "--tw-ring-color": "#06C168" }}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Product Status ── */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">
                  Product Availability
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      is_available: !formData.is_available,
                    })
                  }
                  className="relative w-12 h-6 rounded-full transition-colors duration-200"
                  style={{
                    background: formData.is_available ? "#06C168" : "#d1d5db",
                  }}
                >
                  <div
                    className={`absolute top-[3px] left-[3px] w-4.5 h-4.5 bg-white rounded-full shadow transition-transform duration-200 ${formData.is_available ? "translate-x-6" : "translate-x-0"}`}
                  />
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                To Make this food orderable by customers in the app.
              </p>
            </div>

            {/* ── Available Time ── */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <h3 className="text-sm font-bold text-gray-900 mb-3">
                Available Time <span className="text-red-500">*</span>
              </h3>
              <div className="space-y-0 divide-y divide-gray-100">
                {availableTimes.map((time) => (
                  <label
                    key={time}
                    className="flex items-center gap-3 py-3 cursor-pointer"
                  >
                    <button
                      type="button"
                      onClick={() => handleTimeToggle(time)}
                      className="w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors"
                      style={{
                        borderColor: formData.available_time.includes(time)
                          ? "#06C168"
                          : "#d1d5db",
                        background: formData.available_time.includes(time)
                          ? "#06C168"
                          : "transparent",
                      }}
                    >
                      {formData.available_time.includes(time) && (
                        <svg
                          className="w-3.5 h-3.5 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </button>
                    <span className="text-sm text-gray-700 font-medium capitalize">
                      {time}
                    </span>
                  </label>
                ))}
              </div>
              {formData.available_time.length === 0 && (
                <p className="text-xs text-red-500 mt-1">
                  Select at least one available time
                </p>
              )}
            </div>

            {/* ── Bottom actions ── */}
            <div className="pt-2 pb-4 space-y-3">
              <button
                type="submit"
                disabled={loading || uploading}
                className="w-full py-3.5 rounded-2xl text-white font-bold text-sm disabled:opacity-50 transition-colors"
                style={{ background: "#06C168" }}
              >
                {loading ? "Saving..." : food ? "Save Product" : "Save Product"}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="w-full py-3 text-sm font-semibold text-gray-700 disabled:opacity-50"
              >
                Discard
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
