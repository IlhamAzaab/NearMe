import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import AdminLayout from "../../components/AdminLayout";

// Fix Leaflet default marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Component to handle map clicks for location selection
function LocationMarker({ position, setPosition, isEditing }) {
  useMapEvents({
    click(e) {
      if (isEditing) {
        setPosition([e.latlng.lat, e.latlng.lng]);
      }
    },
  });

  return position ? (
    <Marker position={position}>
      <Popup>
        <div className="text-center">
          <p className="font-semibold">Restaurant Location</p>
          <p className="text-xs text-gray-600">
            {position[0].toFixed(6)}, {position[1].toFixed(6)}
          </p>
        </div>
      </Popup>
    </Marker>
  ) : null;
}

// Component to recenter map when position changes
function MapController({ center }) {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.setView(center, 15);
    }
  }, [center, map]);

  return null;
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState("restaurant");
  const [profileData, setProfileData] = useState({
    full_name: "",
    email: "",
    phone: "",
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  // Restaurant Details State (from RestaurantDetail.jsx)
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingRestaurant, setEditingRestaurant] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [restaurantFormData, setRestaurantFormData] = useState({
    restaurant_name: "",
    address: "",
    city: "",
    postal_code: "",
    opening_time: "",
    close_time: "",
    logo_url: "",
    cover_image_url: "",
    latitude: null,
    longitude: null,
  });
  const [mapPosition, setMapPosition] = useState(null);
  const [locating, setLocating] = useState(false);

  const token = localStorage.getItem("token");

  // Fetch restaurant data
  useEffect(() => {
    if (activeTab === "restaurant") {
      fetchRestaurant();
    }
  }, [activeTab]);

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
      setRestaurantFormData({
        restaurant_name: data.restaurant.restaurant_name || "",
        address: data.restaurant.address || "",
        city: data.restaurant.city || "",
        postal_code: data.restaurant.postal_code || "",
        opening_time: data.restaurant.opening_time || "",
        close_time: data.restaurant.close_time || "",
        logo_url: data.restaurant.logo_url || "",
        cover_image_url: data.restaurant.cover_image_url || "",
        latitude: data.restaurant.latitude || null,
        longitude: data.restaurant.longitude || null,
      });
      // Set map position
      if (data.restaurant.latitude && data.restaurant.longitude) {
        setMapPosition([
          Number(data.restaurant.latitude),
          Number(data.restaurant.longitude),
        ]);
      }
      setLoading(false);
    } catch (err) {
      console.error("Error fetching restaurant:", err);
      setError("Network error while loading restaurant");
      setLoading(false);
    }
  };

  const handleRestaurantInputChange = (e) => {
    setRestaurantFormData({
      ...restaurantFormData,
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
          setRestaurantFormData({
            ...restaurantFormData,
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

  const handleRestaurantSave = async () => {
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
        body: JSON.stringify(restaurantFormData),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.message || "Failed to update restaurant");
        return;
      }

      setRestaurant(data.restaurant);
      setEditingRestaurant(false);
      setError(null);
    } catch (err) {
      console.error("Error updating restaurant:", err);
      setError("Network error while updating restaurant");
    }
  };

  const handleProfileUpdate = (e) => {
    e.preventDefault();
    // TODO: Update profile via API
    console.log("Update profile:", profileData);
  };

  const handlePasswordChange = (e) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert("Passwords do not match!");
      return;
    }
    // TODO: Change password via API
    console.log("Change password");
  };

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6 animate-fadeIn">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-green-600 via-green-500 to-green-600 bg-clip-text text-transparent">Settings</h1>
          <p className="text-gray-700 mt-2 font-medium text-sm sm:text-base">
            Manage your account and restaurant settings.
          </p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-md border border-green-100 hover:shadow-xl transition-shadow duration-300">
          <div className="border-b border-green-100">
            <div className="flex overflow-x-auto scrollbar-hide">
              <button
                onClick={() => setActiveTab("restaurant")}
                className={`px-4 sm:px-6 py-3 sm:py-4 font-semibold transition-all duration-300 whitespace-nowrap text-sm sm:text-base ${
                  activeTab === "restaurant"
                    ? "text-green-600 border-b-3 border-green-600 bg-green-50/50"
                    : "text-gray-600 hover:text-gray-800 hover:bg-green-50/30"
                }`}
              >
                Restaurant Details
              </button>
              <button
                onClick={() => setActiveTab("profile")}
                className={`px-4 sm:px-6 py-3 sm:py-4 font-semibold transition-all duration-300 whitespace-nowrap text-sm sm:text-base ${
                  activeTab === "profile"
                    ? "text-green-600 border-b-3 border-green-600 bg-green-50/50"
                    : "text-gray-600 hover:text-gray-800 hover:bg-green-50/30"
                }`}
              >
                Profile
              </button>
              <button
                onClick={() => setActiveTab("password")}
                className={`px-4 sm:px-6 py-3 sm:py-4 font-semibold transition-all duration-300 whitespace-nowrap text-sm sm:text-base ${
                  activeTab === "password"
                    ? "text-green-600 border-b-3 border-green-600 bg-green-50/50"
                    : "text-gray-600 hover:text-gray-800 hover:bg-green-50/30"
                }`}
              >
                Password
              </button>
              <button
                onClick={() => setActiveTab("notifications")}
                className={`px-4 sm:px-6 py-3 sm:py-4 font-semibold transition-all duration-300 whitespace-nowrap text-sm sm:text-base ${
                  activeTab === "notifications"
                    ? "text-green-600 border-b-3 border-green-600 bg-green-50/50"
                    : "text-gray-600 hover:text-gray-800 hover:bg-green-50/30"
                }`}
              >
                Notifications
              </button>
            </div>
          </div>

          <div className="p-6">
            {/* Restaurant Details Tab */}
            {activeTab === "restaurant" && (
              <div className="space-y-6">
                {loading ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 sm:h-14 w-12 sm:w-14 border-b-4 border-green-500 mx-auto"></div>
                      <p className="text-gray-700 mt-4 font-medium text-sm sm:text-base">Loading restaurant details...</p>
                    </div>
                  </div>
                ) : error && !restaurant ? (
                  <div className="bg-red-50 border-2 border-red-200 text-red-700 p-4 rounded-xl font-medium shadow-sm">
                    {error}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-xl font-bold text-gray-800">Restaurant Information</h2>
                        <p className="text-gray-600 mt-1">
                          Manage your restaurant details and location.
                        </p>
                      </div>
                      {!editingRestaurant ? (
                        <button
                          onClick={() => setEditingRestaurant(true)}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                        >
                          Edit Restaurant
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingRestaurant(false);
                              setRestaurantFormData({
                                restaurant_name: restaurant.restaurant_name || "",
                                address: restaurant.address || "",
                                city: restaurant.city || "",
                                postal_code: restaurant.postal_code || "",
                                opening_time: restaurant.opening_time || "",
                                close_time: restaurant.close_time || "",
                                logo_url: restaurant.logo_url || "",
                                cover_image_url: restaurant.cover_image_url || "",
                                latitude: restaurant.latitude || null,
                                longitude: restaurant.longitude || null,
                              });
                              if (restaurant.latitude && restaurant.longitude) {
                                setMapPosition([
                                  Number(restaurant.latitude),
                                  Number(restaurant.longitude),
                                ]);
                              }
                            }}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleRestaurantSave}
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
                      <div className="bg-gray-50 rounded-lg p-6 space-y-6">
                        {/* Logo Section */}
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Restaurant Logo
                          </label>
                          <div className="flex items-center gap-4">
                            <div className="w-32 h-32 bg-gray-200 rounded-lg flex items-center justify-center overflow-hidden">
                              {restaurantFormData.logo_url ? (
                                <img
                                  src={restaurantFormData.logo_url}
                                  alt="Logo"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-gray-400 text-xs text-center">
                                  No logo uploaded
                                </span>
                              )}
                            </div>
                            {editingRestaurant && (
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
                              {restaurantFormData.cover_image_url ? (
                                <img
                                  src={restaurantFormData.cover_image_url}
                                  alt="Cover"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-gray-400">
                                  No cover image uploaded
                                </span>
                              )}
                            </div>
                            {editingRestaurant && (
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
                              value={restaurantFormData.restaurant_name}
                              onChange={handleRestaurantInputChange}
                              disabled={!editingRestaurant}
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
                              value={restaurantFormData.city}
                              onChange={handleRestaurantInputChange}
                              disabled={!editingRestaurant}
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
                              value={restaurantFormData.address}
                              onChange={handleRestaurantInputChange}
                              disabled={!editingRestaurant}
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
                              value={restaurantFormData.postal_code}
                              onChange={handleRestaurantInputChange}
                              disabled={!editingRestaurant}
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
                              value={restaurantFormData.opening_time}
                              onChange={handleRestaurantInputChange}
                              disabled={!editingRestaurant}
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
                              value={restaurantFormData.close_time}
                              onChange={handleRestaurantInputChange}
                              disabled={!editingRestaurant}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 disabled:bg-gray-100 disabled:cursor-not-allowed"
                            />
                          </div>
                        </div>

                        {/* Restaurant Location Map */}
                        <div className="mt-6">
                          <h3 className="text-lg font-semibold text-gray-800 mb-4">
                            Restaurant Location
                            {editingRestaurant && (
                              <span className="text-sm font-normal text-indigo-600 ml-2">
                                (Click on map to change location)
                              </span>
                            )}
                          </h3>
                          <div className="mb-3">
                            <p className="text-sm text-gray-600">
                              <span className="font-medium">Address: </span>
                              {restaurantFormData.address || "N/A"}
                              {restaurantFormData.city && `, ${restaurantFormData.city}`}
                            </p>
                            {mapPosition && (
                              <p className="text-xs text-gray-500 mt-1">
                                Coordinates: {mapPosition[0].toFixed(6)},{" "}
                                {mapPosition[1].toFixed(6)}
                              </p>
                            )}
                          </div>

                          {/* Use My Location Button - Only when editing */}
                          {editingRestaurant && (
                            <button
                              type="button"
                              onClick={() => {
                                if (!navigator.geolocation) {
                                  setError("Geolocation is not supported by your browser");
                                  return;
                                }
                                setLocating(true);
                                navigator.geolocation.getCurrentPosition(
                                  (pos) => {
                                    const { latitude, longitude } = pos.coords;
                                    setMapPosition([latitude, longitude]);
                                    setRestaurantFormData((prev) => ({
                                      ...prev,
                                      latitude: latitude,
                                      longitude: longitude,
                                    }));
                                    setLocating(false);
                                  },
                                  (err) => {
                                    console.error("Geolocation error:", err);
                                    setError(
                                      "Unable to get your location. Please select manually on the map."
                                    );
                                    setLocating(false);
                                  },
                                  { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                                );
                              }}
                              disabled={locating}
                              className="mb-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
                            >
                              {locating
                                ? "Getting location..."
                                : "📍 Use My Current Location"}
                            </button>
                          )}

                          <div
                            className={`rounded-lg overflow-hidden border ${
                              editingRestaurant ? "border-indigo-400 border-2" : "border-gray-300"
                            }`}
                          >
                            <MapContainer
                              center={mapPosition || [7.8731, 80.7718]}
                              zoom={15}
                              style={{ height: "350px", width: "100%" }}
                              scrollWheelZoom={editingRestaurant}
                            >
                              <TileLayer
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                              />
                              <LocationMarker
                                position={mapPosition}
                                setPosition={(pos) => {
                                  setMapPosition(pos);
                                  setRestaurantFormData((prev) => ({
                                    ...prev,
                                    latitude: pos[0],
                                    longitude: pos[1],
                                  }));
                                }}
                                isEditing={editingRestaurant}
                              />
                              <MapController center={mapPosition} />
                            </MapContainer>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Profile Tab (existing code) */}
            {activeTab === "profile" && (
              <form onSubmit={handleProfileUpdate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={profileData.full_name}
                    onChange={(e) =>
                      setProfileData({
                        ...profileData,
                        full_name: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={profileData.email}
                    onChange={(e) =>
                      setProfileData({ ...profileData, email: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={profileData.phone}
                    onChange={(e) =>
                      setProfileData({ ...profileData, phone: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>

                <button
                  type="submit"
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Update Profile
                </button>
              </form>
            )}

            {/* Password Tab (existing code) */}
            {activeTab === "password" && (
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={(e) =>
                      setPasswordData({
                        ...passwordData,
                        currentPassword: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) =>
                      setPasswordData({
                        ...passwordData,
                        newPassword: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) =>
                      setPasswordData({
                        ...passwordData,
                        confirmPassword: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>

                <button
                  type="submit"
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Change Password
                </button>
              </form>
            )}

            {/* Notifications Tab (existing code) */}
            {activeTab === "notifications" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-gray-900">
                      Order Notifications
                    </p>
                    <p className="text-sm text-gray-500">
                      Receive alerts for new orders
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-600"
                    defaultChecked
                  />
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-gray-900">
                      Email Notifications
                    </p>
                    <p className="text-sm text-gray-500">
                      Receive order updates via email
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-600"
                    defaultChecked
                  />
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-gray-900">
                      SMS Notifications
                    </p>
                    <p className="text-sm text-gray-500">
                      Receive order updates via SMS
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-600"
                  />
                </div>

                <button className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 mt-4">
                  Save Preferences
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}