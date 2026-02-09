import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import AnimatedAlert, { useAlert } from "../components/AnimatedAlert";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

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

// Component to handle map clicks
function LocationMarker({ position, setPosition }) {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });

  return position === null ? null : <Marker position={position}></Marker>;
}

// Component to handle map centering
function MapController({ center }) {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.setView(center, 15);
    }
  }, [center, map]);

  return null;
}

export default function CompleteProfile() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = searchParams.get("userId");

  const [formData, setFormData] = useState({
    username: "",
    phone: "",
    nic_number: "",
    address: "",
    city: "",
  });
  const [position, setPosition] = useState(null); // [lat, lng]
  const [mapCenter, setMapCenter] = useState([7.8731, 80.7718]); // For centering map
  const [loading, setLoading] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [locating, setLocating] = useState(false);
  const { alert, visible, showError } = useAlert();

  useEffect(() => {
    if (!userId) {
      navigate("/login");
    }
    // Set default position (Sri Lanka center)
    if (!position) {
      setPosition([7.8731, 80.7718]); // Sri Lanka center
    }
  }, [userId, navigate]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    if (e.target.name === "phone") setPhoneError("");
    if (e.target.name === "username") setUsernameError("");
  };

  const validatePhone = (phone) => {
    // Sri Lankan phone number validation (10 digits starting with 0)
    const phoneRegex = /^0\d{9}$/;
    return phoneRegex.test(phone);
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      showError("Geolocation is not supported by your browser");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setPosition([latitude, longitude]);
        setMapCenter([latitude, longitude]); // This will trigger MapController to center the map
        setLocating(false);
      },
      (err) => {
        console.error("Geolocation error:", err);
        showError(
          "Unable to get your location. Please select manually on the map.",
        );
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  };

  const checkPhoneAvailability = async (phone) => {
    try {
      const response = await fetch(
        "http://localhost:5000/auth/check-availability",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        },
      );
      const data = await response.json();
      return data.phoneAvailable;
    } catch (err) {
      console.error("Phone check error:", err);
      return true;
    }
  };

  const handlePhoneBlur = async () => {
    if (formData.phone) {
      if (!validatePhone(formData.phone)) {
        setPhoneError("Invalid phone number format (e.g., 0771234567)");
        return;
      }

      const available = await checkPhoneAvailability(formData.phone);
      if (!available) {
        setPhoneError("This phone number is already registered");
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Validation
    if (!formData.username || !formData.phone) {
      showError("Username and phone number are required");
      setLoading(false);
      return;
    }

    if (!validatePhone(formData.phone)) {
      setPhoneError("Invalid phone number format");
      setLoading(false);
      return;
    }

    // Check if position is set
    if (!position) {
      showError("Please select your location on the map");
      setLoading(false);
      return;
    }

    // Get email from Supabase user
    try {
      // We need to get the email from the userId
      // For now, we'll make a request to get user email
      const userResponse = await fetch(
        `http://localhost:5000/auth/user-email?userId=${userId}`,
      );
      const userData = await userResponse.json();

      if (!userResponse.ok) {
        showError("Failed to retrieve user information");
        setLoading(false);
        return;
      }

      const response = await fetch(
        "http://localhost:5000/auth/complete-profile",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            username: formData.username,
            email: userData.email,
            phone: formData.phone,
            nic_number: formData.nic_number || null,
            address: formData.address || null,
            city: formData.city || null,
            latitude: position[0].toString(),
            longitude: position[1].toString(),
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        showError(data.message || "Failed to complete profile");
        setLoading(false);
        return;
      }

      // Success - save token and user data, then redirect to home
      console.log(
        "✅ Profile completed, saving token:",
        data.token ? `${data.token.substring(0, 20)}...` : "NULL",
      );

      if (data.token) {
        localStorage.setItem("token", data.token);
      }
      localStorage.setItem("role", data.role || "customer");
      localStorage.setItem("userEmail", userData.email);
      if (data.userId) {
        localStorage.setItem("userId", data.userId);
      }
      if (data.userName) {
        localStorage.setItem("userName", data.userName);
      }

      // Navigate directly to home (logged in)
      navigate("/home");
    } catch (err) {
      console.error("Profile completion error:", err);
      showError("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />

      <div className="flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl w-full space-y-8">
          {/* Header */}
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
              <svg
                className="h-10 w-10 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="text-3xl font-extrabold text-gray-900">
              Email Verified!
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Complete your profile to start ordering
            </p>
          </div>

          {/* Form */}
          <div className="bg-white rounded-lg shadow-lg p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <AnimatedAlert alert={alert} visible={visible} />

              {/* Two Column Layout for Desktop */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Username */}
                <div>
                  <label
                    htmlFor="username"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Username <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    value={formData.username}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
                    placeholder="Choose a username"
                  />
                  {usernameError && (
                    <p className="mt-1 text-xs text-red-600">{usernameError}</p>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label
                    htmlFor="phone"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={handleChange}
                    onBlur={handlePhoneBlur}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
                    placeholder="0771234567"
                  />
                  {phoneError && (
                    <p className="mt-1 text-xs text-red-600">{phoneError}</p>
                  )}
                </div>

                {/* NIC Number */}
                <div>
                  <label
                    htmlFor="nic_number"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    NIC Number (Optional)
                  </label>
                  <input
                    id="nic_number"
                    name="nic_number"
                    type="text"
                    value={formData.nic_number}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
                    placeholder="123456789V or 201234567890"
                  />
                </div>

                {/* City */}
                <div>
                  <label
                    htmlFor="city"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    City (Optional)
                  </label>
                  <input
                    id="city"
                    name="city"
                    type="text"
                    value={formData.city}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
                    placeholder="Colombo"
                  />
                </div>
              </div>

              {/* Address (Full Width) */}
              <div>
                <label
                  htmlFor="address"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Address (Optional)
                </label>
                <textarea
                  id="address"
                  name="address"
                  rows="3"
                  value={formData.address}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
                  placeholder="123 Main Street, Apartment 4B"
                />
              </div>

              {/* Map for Location Selection */}
              <div className="md:col-span-2 space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  Delivery Location <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <MapContainer
                    center={position || [7.8731, 80.7718]}
                    zoom={13}
                    style={{
                      height: "400px",
                      width: "100%",
                      borderRadius: "8px",
                    }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <LocationMarker
                      position={position}
                      setPosition={setPosition}
                    />
                    <MapController center={mapCenter} />
                  </MapContainer>
                </div>

                {position && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Latitude
                      </label>
                      <input
                        type="text"
                        className="w-full border rounded-lg p-2 bg-gray-100 text-sm"
                        value={position[0].toFixed(6)}
                        readOnly
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Longitude
                      </label>
                      <input
                        type="text"
                        className="w-full border rounded-lg p-2 bg-gray-100 text-sm"
                        value={position[1].toFixed(6)}
                        readOnly
                      />
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleUseMyLocation}
                  disabled={locating}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {locating
                    ? "Getting location..."
                    : "📍 Use My Current Location"}
                </button>
                <p className="text-xs text-gray-500">
                  Click on the map to pin location or use your current location
                </p>
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> Your phone number will be used for
                  order updates and delivery coordination. Make sure it's
                  correct!
                </p>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || phoneError}
                className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition ${
                  loading || phoneError
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg
                      className="animate-spin h-5 w-5 mr-2"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Completing profile...
                  </span>
                ) : (
                  "Complete Profile & Start Ordering"
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
