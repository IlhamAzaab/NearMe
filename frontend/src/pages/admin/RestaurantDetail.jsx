import React, { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";

export default function RestaurantDetail() {
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(null); // 'logo' | 'cover' | null
  const [formData, setFormData] = useState({
    restaurant_name: "",
    address: "",
    city: "",
    postal_code: "",
    opening_time: "",
    close_time: "",
    logo_url: "",
    cover_image_url: "",
  });

  const token = localStorage.getItem("token");

  useEffect(() => {
    fetchRestaurant();
  }, []);

  const fetchRestaurant = async () => {
    if (!token) {
      setError("No authentication token found");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("http://localhost:5000/admin/restaurant", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.message || "Failed to load restaurant");
        setLoading(false);
        return;
      }

      setRestaurant(data.restaurant);
      setFormData({
        restaurant_name: data.restaurant.restaurant_name || "",
        address: data.restaurant.address || "",
        city: data.restaurant.city || "",
        postal_code: data.restaurant.postal_code || "",
        opening_time: data.restaurant.opening_time || "",
        close_time: data.restaurant.close_time || "",
        logo_url: data.restaurant.logo_url || "",
        cover_image_url: data.restaurant.cover_image_url || "",
      });
      setLoading(false);
    } catch (err) {
      console.error("Error fetching restaurant:", err);
      setError("Network error while loading restaurant");
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleImageUpload = async (event, imageType) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("Image size must be less than 5MB");
      return;
    }

    try {
      setUploading(imageType);
      setError(null);

      // Read file as base64
      const reader = new FileReader();
      reader.readAsDataURL(file);

      reader.onload = async () => {
        try {
          const base64String = reader.result;

          // Upload to Cloudinary via backend
          const response = await fetch(
            "http://localhost:5000/admin/upload-image",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ imageData: base64String }),
            }
          );

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.message || "Failed to upload image");
          }

          // Update formData with the new image URL
          const fieldName =
            imageType === "logo" ? "logo_url" : "cover_image_url";
          setFormData({
            ...formData,
            [fieldName]: data.url,
          });

          setUploading(null);
        } catch (err) {
          console.error("Error uploading image:", err);
          setError(err.message || "Failed to upload image");
          setUploading(null);
        }
      };

      reader.onerror = () => {
        setError("Failed to read image file");
        setUploading(null);
      };
    } catch (err) {
      console.error("Error processing image:", err);
      setError("Failed to process image");
      setUploading(null);
    }
  };

  const handleSave = async () => {
    if (!token) {
      setError("No authentication token found");
      return;
    }

    try {
      const res = await fetch("http://localhost:5000/admin/restaurant", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.message || "Failed to update restaurant");
        return;
      }

      setRestaurant(data.restaurant);
      setEditing(false);
      setError(null);
    } catch (err) {
      console.error("Error updating restaurant:", err);
      setError("Network error while updating restaurant");
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-indigo-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading restaurant details...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error && !restaurant) {
    return (
      <AdminLayout>
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
            {error}
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">
              Restaurant Details
            </h1>
            <p className="text-gray-600 mt-1">
              Manage your restaurant information and settings.
            </p>
          </div>
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              Edit Details
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setEditing(false);
                  setFormData({
                    restaurant_name: restaurant.restaurant_name || "",
                    address: restaurant.address || "",
                    city: restaurant.city || "",
                    postal_code: restaurant.postal_code || "",
                    opening_time: restaurant.opening_time || "",
                    close_time: restaurant.close_time || "",
                    logo_url: restaurant.logo_url || "",
                    cover_image_url: restaurant.cover_image_url || "",
                  });
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={uploading !== null}
                className={`px-4 py-2 rounded-lg transition ${
                  uploading !== null
                    ? "bg-gray-400 text-white cursor-not-allowed"
                    : "bg-green-600 text-white hover:bg-green-700"
                }`}
              >
                {uploading !== null ? "Uploading..." : "Save Changes"}
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
            {error}
          </div>
        )}

        {restaurant && (
          <div className="bg-white rounded-lg shadow p-6 space-y-6">
            {/* Logo Section */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Restaurant Logo
              </label>
              <div className="flex items-center gap-4">
                <div className="w-32 h-32 bg-gray-200 rounded-lg flex items-center justify-center overflow-hidden">
                  {formData.logo_url ? (
                    <img
                      src={formData.logo_url}
                      alt="Logo"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-gray-400 text-xs text-center">
                      No logo uploaded
                    </span>
                  )}
                </div>
                {editing && (
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, "logo")}
                      disabled={uploading !== null}
                      className="hidden"
                      id="logo-upload"
                    />
                    <label
                      htmlFor="logo-upload"
                      className={`px-4 py-2 rounded-lg cursor-pointer inline-block transition ${
                        uploading === "logo"
                          ? "bg-gray-400 text-white cursor-not-allowed"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                    >
                      {uploading === "logo" ? "Uploading..." : "Change Logo"}
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Cover Image Section */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Cover Image
              </label>
              <div className="space-y-3">
                <div className="w-full h-48 bg-gray-200 rounded-lg flex items-center justify-center overflow-hidden">
                  {formData.cover_image_url ? (
                    <img
                      src={formData.cover_image_url}
                      alt="Cover"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-gray-400">
                      No cover image uploaded
                    </span>
                  )}
                </div>
                {editing && (
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, "cover")}
                      disabled={uploading !== null}
                      className="hidden"
                      id="cover-upload"
                    />
                    <label
                      htmlFor="cover-upload"
                      className={`px-4 py-2 rounded-lg cursor-pointer inline-block transition ${
                        uploading === "cover"
                          ? "bg-gray-400 text-white cursor-not-allowed"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                    >
                      {uploading === "cover"
                        ? "Uploading..."
                        : "Change Cover Image"}
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Restaurant Name
                </label>
                <input
                  type="text"
                  name="restaurant_name"
                  value={formData.restaurant_name}
                  onChange={handleInputChange}
                  disabled={!editing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  City
                </label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  disabled={!editing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address
                </label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  disabled={!editing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Postal Code
                </label>
                <input
                  type="text"
                  name="postal_code"
                  value={formData.postal_code}
                  onChange={handleInputChange}
                  disabled={!editing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Opening Time
                </label>
                <input
                  type="time"
                  name="opening_time"
                  value={formData.opening_time}
                  onChange={handleInputChange}
                  disabled={!editing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Closing Time
                </label>
                <input
                  type="time"
                  name="close_time"
                  value={formData.close_time}
                  onChange={handleInputChange}
                  disabled={!editing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
