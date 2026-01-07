import React, { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import AdminLayout from "../../components/AdminLayout";

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
    latitude: null,
    longitude: null,
  });
  const [mapPosition, setMapPosition] = useState(null);
  const [locating, setLocating] = useState(false);

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
                    latitude: restaurant.latitude || null,
                    longitude: restaurant.longitude || null,
                  });
                  // Reset map position
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

        {/* Restaurant Location Map */}
        {restaurant && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Restaurant Location
              {editing && (
                <span className="text-sm font-normal text-indigo-600 ml-2">
                  (Click on map to change location)
                </span>
              )}
            </h2>
            <div className="mb-3">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Address: </span>
                {formData.address || "N/A"}
                {formData.city && `, ${formData.city}`}
              </p>
              {mapPosition && (
                <p className="text-xs text-gray-500 mt-1">
                  Coordinates: {mapPosition[0].toFixed(6)},{" "}
                  {mapPosition[1].toFixed(6)}
                </p>
              )}
            </div>

            {/* Use My Location Button - Only when editing */}
            {editing && (
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
                      setFormData((prev) => ({
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
                editing ? "border-indigo-400 border-2" : "border-gray-300"
              }`}
            >
              <MapContainer
                center={mapPosition || [7.8731, 80.7718]}
                zoom={15}
                style={{ height: "350px", width: "100%" }}
                scrollWheelZoom={editing}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LocationMarker
                  position={mapPosition}
                  setPosition={(pos) => {
                    setMapPosition(pos);
                    setFormData((prev) => ({
                      ...prev,
                      latitude: pos[0],
                      longitude: pos[1],
                    }));
                  }}
                  isEditing={editing}
                />
                <MapController center={mapPosition} />
              </MapContainer>
            </div>

            {/* Coordinate Display */}
            {mapPosition && (
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Latitude
                  </label>
                  <input
                    type="text"
                    className="w-full border rounded-lg p-2 bg-gray-100 text-sm"
                    value={mapPosition[0].toFixed(6)}
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Longitude
                  </label>
                  <input
                    type="text"
                    className="w-full border rounded-lg p-2 bg-gray-100 text-sm"
                    value={mapPosition[1].toFixed(6)}
                    readOnly
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
