import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import AdminLayout from "../../components/AdminLayout";
import { API_URL } from "../../config";
import { useAdminData, CACHE_KEYS } from "../../context/AdminCacheContext";

// Custom draggable marker icon
const createCustomIcon = (isDragging = false) => {
  return L.divIcon({
    className: "custom-marker",
    html: `
      <div class="marker-container ${isDragging ? "dragging" : ""}">
        <div class="marker-pin">
          <div class="marker-inner"></div>
        </div>
        <div class="marker-shadow"></div>
      </div>
    `,
    iconSize: [40, 50],
    iconAnchor: [20, 50],
  });
};

// Component for draggable marker
function DraggableMarker({ position, setPosition, isEditing }) {
  const [dragging, setDragging] = useState(false);
  const markerRef = useRef(null);

  const eventHandlers = useMemo(
    () => ({
      dragstart() {
        setDragging(true);
      },
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const latlng = marker.getLatLng();
          setPosition([latlng.lat, latlng.lng]);
        }
        setDragging(false);
      },
    }),
    [setPosition]
  );

  const icon = useMemo(() => createCustomIcon(dragging), [dragging]);

  useMapEvents({
    click(e) {
      if (isEditing) {
        setPosition([e.latlng.lat, e.latlng.lng]);
      }
    },
  });

  return position ? (
    <Marker
      draggable={isEditing}
      eventHandlers={eventHandlers}
      position={position}
      ref={markerRef}
      icon={icon}
    />
  ) : null;
}

// Component to smoothly fly to position
function MapController({ center, shouldAnimate }) {
  const map = useMap();

  useEffect(() => {
    if (center) {
      if (shouldAnimate) {
        map.flyTo(center, 16, { duration: 1.5 });
      } else {
        map.setView(center, 16);
      }
    }
  }, [center, map, shouldAnimate]);

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
  const token = localStorage.getItem("token");
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
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
  const [shouldAnimateMap, setShouldAnimateMap] = useState(false);

  // Use cached data hook
  const fetchRestaurant = useCallback(async () => {
    if (!token) throw new Error("No authentication token");
    const res = await fetch(`${API_URL}/admin/restaurant`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || "Failed to load restaurant");
    return data.restaurant;
  }, [token]);

  const { data: restaurant, loading, refreshing, error, refresh } = useAdminData(
    CACHE_KEYS.RESTAURANT,
    fetchRestaurant
  );

  // Update form data when restaurant data changes
  useEffect(() => {
    if (restaurant) {
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
      if (restaurant.latitude && restaurant.longitude) {
        setMapPosition([
          Number(restaurant.latitude),
          Number(restaurant.longitude),
        ]);
      }
    }
  }, [restaurant]);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleImageUpload = async (event, imageType) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("Please select a valid image file", "error");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast("Image size must be less than 5MB", "error");
      return;
    }

    try {
      setUploading(imageType);
      const reader = new FileReader();
      reader.readAsDataURL(file);

      reader.onload = async () => {
        try {
          const response = await fetch(`${API_URL}/admin/upload-image`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ imageData: reader.result }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message);

          const fieldName = imageType === "logo" ? "logo_url" : "cover_image_url";
          setFormData({ ...formData, [fieldName]: data.url });
          showToast(`${imageType === "logo" ? "Logo" : "Cover image"} uploaded!`);
          setUploading(null);
        } catch (err) {
          showToast(err.message || "Failed to upload image", "error");
          setUploading(null);
        }
      };
    } catch (err) {
      showToast("Failed to process image", "error");
      setUploading(null);
    }
  };

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);

    try {
      const res = await fetch(`${API_URL}/admin/restaurant`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to update");

      setEditing(false);
      showToast("Restaurant details saved successfully!");
      refresh();
    } catch (err) {
      showToast(err.message || "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    if (restaurant) {
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
      if (restaurant.latitude && restaurant.longitude) {
        setMapPosition([
          Number(restaurant.latitude),
          Number(restaurant.longitude),
        ]);
      }
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      showToast("Geolocation is not supported", "error");
      return;
    }
    setLocating(true);
    setShouldAnimateMap(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setMapPosition([latitude, longitude]);
        setFormData((prev) => ({ ...prev, latitude, longitude }));
        setLocating(false);
        showToast("Location updated!");
      },
      () => {
        showToast("Unable to get your location", "error");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Show skeleton only on initial load with no cached data
  if (loading && !restaurant) {
    return (
      <AdminLayout>
        <div className="space-y-4 animate-pulse">
          <div className="h-48 bg-gray-200 rounded-2xl" />
          <div className="flex gap-4">
            <div className="w-24 h-24 bg-gray-200 rounded-xl" />
            <div className="flex-1 space-y-2">
              <div className="h-6 bg-gray-200 rounded w-1/2" />
              <div className="h-4 bg-gray-200 rounded w-1/3" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded-xl" />
            ))}
          </div>
          <div className="h-64 bg-gray-200 rounded-2xl" />
        </div>
      </AdminLayout>
    );
  }

  if (error && !restaurant) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Unable to load restaurant</h3>
          <p className="text-gray-500 mb-4">{error}</p>
          <button onClick={refresh} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
            Try Again
          </button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-slideIn ${
          toast.type === "error" ? "bg-red-500 text-white" : "bg-green-500 text-white"
        }`}>
          {toast.type === "error" ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          <span className="font-medium">{toast.message}</span>
        </div>
      )}

      {/* Refreshing indicator */}
      {refreshing && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white shadow-lg rounded-full px-4 py-2 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-600">Updating...</span>
        </div>
      )}

      <div className={`space-y-4 transition-all duration-500 ${refreshing ? "opacity-80" : "opacity-100"}`}>
        {/* Cover Image Section */}
        <div className="relative rounded-2xl overflow-hidden shadow-lg group">
          <div className="h-48 sm:h-56 bg-gradient-to-br from-green-400 to-green-600">
            {formData.cover_image_url ? (
              <img
                src={formData.cover_image_url}
                alt="Cover"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg className="w-16 h-16 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>

          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

          {/* Edit cover button */}
          {editing && (
            <label className="absolute top-4 right-4 px-3 py-2 bg-white/90 backdrop-blur rounded-lg cursor-pointer hover:bg-white transition flex items-center gap-2 text-sm font-medium text-gray-700">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {uploading === "cover" ? "Uploading..." : "Change Cover"}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleImageUpload(e, "cover")}
                disabled={uploading !== null}
                className="hidden"
              />
            </label>
          )}

          {/* Logo */}
          <div className="absolute -bottom-12 left-4 sm:left-6">
            <div className="relative">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border-4 border-white bg-white shadow-xl overflow-hidden">
                {formData.logo_url ? (
                  <img src={formData.logo_url} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
                    <span className="text-3xl font-bold text-white">
                      {formData.restaurant_name?.charAt(0) || "R"}
                    </span>
                  </div>
                )}
              </div>
              {editing && (
                <label className="absolute -bottom-1 -right-1 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-green-600 transition shadow-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, "logo")}
                    disabled={uploading !== null}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          {/* Edit/Save buttons */}
          <div className="absolute bottom-4 right-4 flex gap-2">
            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                className="px-4 py-2 bg-white text-green-600 font-semibold rounded-xl shadow-lg hover:shadow-xl transition flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Edit
              </button>
            ) : (
              <>
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 bg-white/90 text-gray-700 font-semibold rounded-xl shadow hover:bg-white transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || uploading !== null}
                  className="px-4 py-2 bg-green-500 text-white font-semibold rounded-xl shadow-lg hover:bg-green-600 transition flex items-center gap-2 disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Save
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Restaurant Info Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6 mt-14">
          {/* Name and Status */}
          <div className="mb-6">
            {editing ? (
              <input
                type="text"
                name="restaurant_name"
                value={formData.restaurant_name}
                onChange={handleInputChange}
                className="text-xl sm:text-2xl font-bold text-gray-900 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 w-full focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Restaurant Name"
              />
            ) : (
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{formData.restaurant_name || "Your Restaurant"}</h1>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse" />
                Active
              </span>
              <span className="text-sm text-gray-500">Premium Partner</span>
            </div>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Address */}
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Address
              </label>
              {editing ? (
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                  placeholder="Enter address"
                />
              ) : (
                <p className="text-gray-900 font-medium">{formData.address || "Not set"}</p>
              )}
            </div>

            {/* City */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                City
              </label>
              {editing ? (
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                  placeholder="Enter city"
                />
              ) : (
                <p className="text-gray-900 font-medium">{formData.city || "Not set"}</p>
              )}
            </div>

            {/* Postal Code */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Postal Code
              </label>
              {editing ? (
                <input
                  type="text"
                  name="postal_code"
                  value={formData.postal_code}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                  placeholder="Enter postal code"
                />
              ) : (
                <p className="text-gray-900 font-medium">{formData.postal_code || "Not set"}</p>
              )}
            </div>

            {/* Opening Time */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Opening Time
              </label>
              {editing ? (
                <input
                  type="time"
                  name="opening_time"
                  value={formData.opening_time}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                />
              ) : (
                <p className="text-gray-900 font-medium">
                  {formData.opening_time
                    ? new Date(`2000-01-01T${formData.opening_time}`).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : "Not set"}
                </p>
              )}
            </div>

            {/* Closing Time */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                Closing Time
              </label>
              {editing ? (
                <input
                  type="time"
                  name="close_time"
                  value={formData.close_time}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                />
              ) : (
                <p className="text-gray-900 font-medium">
                  {formData.close_time
                    ? new Date(`2000-01-01T${formData.close_time}`).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : "Not set"}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Location Map Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Restaurant Location
                </h2>
                {editing && (
                  <p className="text-sm text-gray-500 mt-1">Drag the pin or click on the map to set location</p>
                )}
              </div>
              {editing && (
                <button
                  onClick={handleUseCurrentLocation}
                  disabled={locating}
                  className="px-4 py-2 bg-green-50 text-green-600 font-medium rounded-xl hover:bg-green-100 transition flex items-center gap-2 disabled:opacity-50"
                >
                  {locating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                      Locating...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      </svg>
                      Use My Location
                    </>
                  )}
                </button>
              )}
            </div>

            {mapPosition && (
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg">
                  <span className="text-xs text-gray-500">Lat:</span>
                  <span className="text-sm font-mono font-medium text-gray-700">{mapPosition[0].toFixed(6)}</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg">
                  <span className="text-xs text-gray-500">Lng:</span>
                  <span className="text-sm font-mono font-medium text-gray-700">{mapPosition[1].toFixed(6)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Map */}
          <div className={`relative ${editing ? "ring-2 ring-green-500 ring-inset" : ""}`}>
            <MapContainer
              center={mapPosition || [7.8731, 80.7718]}
              zoom={16}
              style={{ height: "350px", width: "100%" }}
              scrollWheelZoom={editing}
              dragging={editing}
              doubleClickZoom={editing}
              zoomControl={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <DraggableMarker
                position={mapPosition}
                setPosition={(pos) => {
                  setMapPosition(pos);
                  setFormData((prev) => ({ ...prev, latitude: pos[0], longitude: pos[1] }));
                }}
                isEditing={editing}
              />
              <MapController center={mapPosition} shouldAnimate={shouldAnimateMap} />
            </MapContainer>

            {/* Edit mode indicator */}
            {editing && (
              <div className="absolute bottom-4 left-4 px-3 py-2 bg-green-500 text-white text-sm font-medium rounded-lg shadow-lg flex items-center gap-2">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                Edit Mode - Drag pin to move
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Custom styles for marker */}
      <style>{`
        .custom-marker {
          background: transparent;
          border: none;
        }

        .marker-container {
          position: relative;
          width: 40px;
          height: 50px;
        }

        .marker-pin {
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 30px;
          height: 40px;
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          border-radius: 50% 50% 50% 0;
          transform: translateX(-50%) rotate(-45deg);
          box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
          transition: all 0.3s ease;
        }

        .marker-inner {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(45deg);
          width: 14px;
          height: 14px;
          background: white;
          border-radius: 50%;
        }

        .marker-shadow {
          position: absolute;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 20px;
          height: 6px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 50%;
          transition: all 0.3s ease;
        }

        .marker-container.dragging .marker-pin {
          transform: translateX(-50%) rotate(-45deg) scale(1.2);
          box-shadow: 0 8px 24px rgba(34, 197, 94, 0.5);
        }

        .marker-container.dragging .marker-shadow {
          width: 16px;
          height: 4px;
          opacity: 0.6;
        }

        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        .animate-slideIn {
          animation: slideIn 0.3s ease-out forwards;
        }

        .leaflet-container {
          font-family: inherit;
        }

        .leaflet-control-zoom {
          border: none !important;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1) !important;
        }

        .leaflet-control-zoom a {
          border-radius: 8px !important;
          border: none !important;
          background: white !important;
          color: #374151 !important;
          width: 32px !important;
          height: 32px !important;
          line-height: 32px !important;
          font-size: 16px !important;
        }

        .leaflet-control-zoom a:hover {
          background: #f3f4f6 !important;
        }

        .leaflet-control-zoom-in {
          border-radius: 8px 8px 0 0 !important;
        }

        .leaflet-control-zoom-out {
          border-radius: 0 0 8px 8px !important;
        }
      `}</style>
    </AdminLayout>
  );
}
