import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import AnimatedAlert, { useAlert } from "../components/AnimatedAlert";
import SiteHeader from "../components/SiteHeader";
import {
  completeProfile,
  getPostAuthRoute,
  persistSession,
} from "../services/authService";

const DEFAULT_POSITION = [6.9271, 79.8612]; // Colombo
let leafletIconPatched = false;

if (!leafletIconPatched) {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
    iconUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
    shadowUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  });
  leafletIconPatched = true;
}

function LocationMarker({ position, onPositionChange }) {
  useMapEvents({
    click(event) {
      onPositionChange([event.latlng.lat, event.latlng.lng]);
    },
  });

  if (!position) {
    return null;
  }

  return <Marker position={position} />;
}

function RecenterOnPosition({ position }) {
  const map = useMap();

  useEffect(() => {
    if (position) {
      map.setView(position, 16);
    }
  }, [position, map]);

  return null;
}

export default function CompleteProfile() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { alert, visible, showError, showSuccess } = useAlert();

  const [email, setEmail] = useState(
    searchParams.get("email") || localStorage.getItem("userEmail") || "",
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [address, setAddress] = useState("");
  const [position, setPosition] = useState(DEFAULT_POSITION);
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    if (!token || role !== "customer") {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email.trim()) {
      showError("Email is required");
      return;
    }

    if (!address.trim()) {
      showError("Address is required");
      return;
    }

    if (!password || password.length < 6) {
      showError("Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      showError("Password and confirm password must match");
      return;
    }

    if (!position || !Number.isFinite(position[0]) || !Number.isFinite(position[1])) {
      showError("Please pin your delivery location on the map");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      showError("Session expired. Please login again.");
      navigate("/login", { replace: true });
      return;
    }

    setLoading(true);

    try {
      const updatedUser = await completeProfile({
        email,
        password,
        address,
        latitude: position[0],
        longitude: position[1],
        token,
      });

      const nextToken = updatedUser?.token || token;

      persistSession({
        token: nextToken,
        user: updatedUser,
      });

      showSuccess("Profile completed successfully");
      setLoading(false);
      navigate(getPostAuthRoute(updatedUser), { replace: true });
    } catch (error) {
      console.error("Complete profile error:", error);
      const detailedMessage =
        error?.details?.dbMessage ||
        error?.details?.providerMessage ||
        error?.details?.dbDetails ||
        error?.details?.message ||
        error?.code ||
        error?.message;
      showError(detailedMessage || "Network error. Please try again.");
      setLoading(false);
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      showError("Geolocation is not supported in this browser");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (geo) => {
        setPosition([geo.coords.latitude, geo.coords.longitude]);
        setLocating(false);
      },
      () => {
        showError("Unable to get your current location. Please tap on map to pin.");
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />
      <AnimatedAlert alert={alert} visible={visible} />

      <div className="max-w-xl mx-auto px-4 py-10">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Complete Profile</h1>
          <p className="text-sm text-gray-600 mb-6">
            Add your email, password, delivery address, and map pin to continue.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                autoComplete="new-password"
                required
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                autoComplete="new-password"
                required
              />
            </div>

            <div>
              <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
                Address
              </label>
              <textarea
                id="address"
                rows={4}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="No 10, Main Street, Colombo"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">Pin Delivery Location</label>
                <button
                  type="button"
                  onClick={useCurrentLocation}
                  className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  {locating ? "Locating..." : "Use current location"}
                </button>
              </div>

              <div className="w-full h-72 rounded-xl overflow-hidden border border-gray-300">
                <MapContainer
                  center={position}
                  zoom={15}
                  style={{ width: "100%", height: "100%" }}
                  scrollWheelZoom={true}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <LocationMarker position={position} onPositionChange={setPosition} />
                  <RecenterOnPosition position={position} />
                </MapContainer>
              </div>

              <p className="text-xs text-gray-600">
                Tap map to pin exact location. Current pin: {position[0].toFixed(6)}, {position[1].toFixed(6)}
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-6 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold rounded-xl transition-all duration-300 disabled:opacity-70"
            >
              {loading ? "Saving..." : "Save & Continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
