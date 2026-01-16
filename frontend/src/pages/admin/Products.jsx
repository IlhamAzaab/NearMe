import React, { useState, useEffect } from "react";
import AdminLayout from "../../components/AdminLayout";

export default function Products() {
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingFood, setEditingFood] = useState(null);
  const [search, setSearch] = useState("");

  const token = localStorage.getItem("token");

  useEffect(() => {
    fetchFoods();
  }, []);

  const fetchFoods = async () => {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("http://localhost:5000/admin/foods", {
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
      const res = await fetch(`http://localhost:5000/admin/foods/${foodId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setFoods(foods.filter((f) => f.id !== foodId));
      } else {
        const data = await res.json();
        alert(data?.message || "Failed to delete product");
      }
    } catch (err) {
      alert("Error deleting product");
      console.error(err);
    }
  };

  const openEdit = (food) => {
    setEditingFood(food);
    setShowAddModal(true);
  };

  const filteredFoods = foods.filter((food) =>
    food.name.toLowerCase().includes(search.toLowerCase())
  );

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

  return (
    <AdminLayout>
      <div className="space-y-6 animate-fadeIn">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-green-600 via-green-500 to-green-600 bg-clip-text text-transparent">Products</h1>
            <p className="text-gray-700 mt-2 font-medium">
              Manage your restaurant menu items and products.
            </p>
          </div>
          <button
            onClick={() => {
              setEditingFood(null);
              setShowAddModal(true);
            }}
            className="px-4 sm:px-5 py-2.5 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl hover:from-green-600 hover:to-green-700 flex items-center gap-2 transition-all duration-300 hover:scale-105 shadow-md hover:shadow-lg font-semibold whitespace-nowrap"
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
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Product
          </button>
        </div>

        {/* Search */}
        <div className="bg-white rounded-xl shadow-md border border-green-100 p-4 sm:p-5 hover:shadow-lg transition-shadow duration-300">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products by name..."
            className="w-full px-4 py-2.5 border-2 border-green-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
          />
        </div>

        {error && (
          <div className="p-4 bg-red-50 border-2 border-red-200 text-red-700 rounded-xl font-medium shadow-sm">
            {error}
          </div>
        )}

        {/* Products List */}
        <div className="bg-white rounded-xl shadow-md border border-green-100 hover:shadow-xl transition-shadow duration-300">
          {loading ? (
            <div className="text-center py-12 sm:py-16">
              <div className="animate-spin rounded-full h-12 sm:h-14 w-12 sm:w-14 border-b-4 border-green-500 mx-auto"></div>
              <p className="text-gray-700 mt-4 font-medium">Loading products...</p>
            </div>
          ) : filteredFoods.length === 0 ? (
            <div className="text-center py-12 sm:py-16 text-gray-500">
              <div className="w-16 sm:w-20 h-16 sm:h-20 mx-auto mb-4 bg-gradient-to-br from-green-100 to-green-200 rounded-2xl flex items-center justify-center">
                <svg
                  className="w-8 sm:w-10 h-8 sm:h-10 text-green-500"
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
              <p className="text-lg font-semibold text-gray-700">No products found</p>
              <p className="text-sm mt-2 text-gray-500">
                {foods.length === 0
                  ? 'Click "Add Product" to create your first menu item.'
                  : "No products match your search."}
              </p>
            </div>
          ) : (
            <div>
              {/* Mobile cards */}
              <div className="space-y-4 md:hidden p-4 sm:p-5">
                {filteredFoods.map((food) => (
                  <div
                    key={food.id}
                    onClick={() => openEdit(food)}
                    className="rounded-xl border-2 border-green-100 bg-white p-4 sm:p-5 shadow-sm cursor-pointer hover:shadow-lg hover:border-green-200 transition-all duration-300 hover:scale-[1.02]"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openEdit(food);
                      }
                    }}
                  >
                    <div className="flex gap-3">
                      <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                        {food.image_url ? (
                          <img
                            src={food.image_url}
                            alt={food.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                            No img
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-900 line-clamp-1">
                              {food.name}
                            </p>
                            <p className="text-xs text-gray-500 line-clamp-2">
                              {food.description || "-"}
                            </p>
                          </div>
                          <span
                            className={`px-2 py-1 rounded-full text-[11px] font-medium ${
                              food.is_available
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {food.is_available ? "Available" : "Unavailable"}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">
                            Rs. {food.regular_price}
                          </span>
                          {food.offer_price ? (
                            <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">
                              Offer: Rs. {food.offer_price}
                            </span>
                          ) : null}
                          <div className="flex items-center text-xs text-gray-600">
                            {renderStars(food.stars)}
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {food.available_time?.map((time) => (
                            <span
                              key={time}
                              className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-[11px] font-medium capitalize"
                            >
                              {time}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-3 text-sm font-medium">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(food);
                        }}
                        className="text-indigo-600 hover:text-indigo-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(food.id);
                        }}
                        className="text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="overflow-x-auto hidden md:block">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600">
                        Product
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600">
                        Regular Price
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600">
                        Offer Price
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600">
                        Available Time
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600">
                        Rating
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredFoods.map((food) => (
                      <tr
                        key={food.id}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => openEdit(food)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gray-200 rounded-lg flex-shrink-0">
                              {food.image_url ? (
                                <img
                                  src={food.image_url}
                                  alt={food.name}
                                  className="w-full h-full object-cover rounded-lg"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                                  No img
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">
                                {food.name}
                              </p>
                              <p className="text-sm text-gray-500 line-clamp-1">
                                {food.description || "-"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          Rs. {food.regular_price}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-green-600">
                          {food.offer_price ? `Rs. ${food.offer_price}` : "-"}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          <div className="flex gap-1 flex-wrap">
                            {food.available_time?.map((time) => (
                              <span
                                key={time}
                                className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium"
                              >
                                {time}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4">{renderStars(food.stars)}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                              food.is_available
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {food.is_available ? "Available" : "Unavailable"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openEdit(food);
                              }}
                              className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                            >
                              Edit
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(food.id);
                              }}
                              className="text-red-600 hover:text-red-800 text-sm font-medium"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
    is_available: food?.is_available ?? true,
  });

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
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
          const res = await fetch("http://localhost:5000/admin/upload-image", {
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
        ? `http://localhost:5000/admin/foods/${food.id}`
        : "http://localhost:5000/admin/foods";

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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800">
            {food ? "Edit Product" : "Add New Product"}
          </h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
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

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Product Image */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Product Image
            </label>
            <div className="flex gap-4">
              {formData.image_url && (
                <div className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0">
                  <img
                    src={formData.image_url}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="flex-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  disabled={uploading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {uploading
                    ? "Uploading..."
                    : "Optional. Recommended size: 400x400px"}
                </p>
              </div>
            </div>
          </div>

          {/* Product Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Product Name *
            </label>
            <input
              type="text"
              name="name"
              required
              value={formData.name}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
              placeholder="e.g., Chicken Burger, Biryani"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
              placeholder="Describe your product (e.g., ingredients, specialties)..."
            />
          </div>

          {/* Available Time - Multi Select */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Available Time *
            </label>
            <div className="flex gap-4">
              {availableTimes.map((time) => (
                <label key={time} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.available_time.includes(time)}
                    onChange={() => handleTimeToggle(time)}
                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-600"
                  />
                  <span className="text-sm text-gray-700 capitalize">
                    {time}
                  </span>
                </label>
              ))}
            </div>
            {formData.available_time.length === 0 && (
              <p className="text-xs text-red-600 mt-1">
                Select at least one available time
              </p>
            )}
          </div>

          {/* Availability toggle */}
          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <p className="text-sm font-medium text-gray-800">
                Product availability
              </p>
              <p className="text-xs text-gray-500">
                Toggle off to hide from menu
              </p>
            </div>
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={!!formData.is_available}
                onChange={(e) =>
                  setFormData({ ...formData, is_available: e.target.checked })
                }
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-indigo-600 relative transition">
                <div className="absolute top-[2px] left-[2px] w-5 h-5 bg-white rounded-full transition peer-checked:translate-x-5"></div>
              </div>
            </label>
          </div>

          {/* Regular Size Section */}
          <div className="border-t pt-6">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">
              Regular Size (Required)
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Size Name
                </label>
                <input
                  type="text"
                  name="regular_size"
                  value={formData.regular_size}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="e.g., Regular, Small"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Portion
                </label>
                <input
                  type="text"
                  name="regular_portion"
                  value={formData.regular_portion}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="e.g., 500g, 1 piece"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price (Rs.) *
                </label>
                <input
                  type="number"
                  name="regular_price"
                  required
                  min="0"
                  step="0.01"
                  value={formData.regular_price}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Offer Price */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Offer Price (Rs.)
              </label>
              <input
                type="number"
                name="offer_price"
                min="0"
                step="0.01"
                value={formData.offer_price}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="Leave empty if no offer"
              />
              <p className="text-xs text-gray-500 mt-1">
                Optional. Leave empty if there's no special offer price.
              </p>
            </div>
          </div>

          {/* Extra Size Section */}
          <div className="border-t pt-6">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">
              Extra Size (Optional)
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Size Name
                </label>
                <input
                  type="text"
                  name="extra_size"
                  value={formData.extra_size}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="e.g., Large, Extra"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Portion
                </label>
                <input
                  type="text"
                  name="extra_portion"
                  value={formData.extra_portion}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="e.g., 750g, 2 pieces"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price (Rs.)
                </label>
                <input
                  type="number"
                  name="extra_price"
                  min="0"
                  step="0.01"
                  value={formData.extra_price}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || uploading}
              className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50 transition"
            >
              {loading ? "Saving..." : food ? "Update Product" : "Add Product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

