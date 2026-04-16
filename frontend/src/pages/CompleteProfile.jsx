import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import AnimatedAlert, { useAlert } from "../components/AnimatedAlert";
import SiteHeader from "../components/SiteHeader";
import meezoLogo from "../assets/MeezoLogo.svg";
import { completeProfile, persistSession } from "../services/authService";

const DEFAULT_POSITION = [6.9271, 79.8612];
const CITY_OPTIONS = [
  "Colombo",
  "Gampaha",
  "Kandy",
  "Galle",
  "Matara",
  "Jaffna",
  "Batticaloa",
  "Trincomalee",
  "Kurunegala",
  "Anuradhapura",
];
const TERMS_AND_CONDITIONS_URL = "https://lucent-bombolone-2fa396.netlify.app";

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

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(
    searchParams.get("email") || localStorage.getItem("userEmail") || "",
  );
  const [password, setPassword] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [position, setPosition] = useState(DEFAULT_POSITION);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const stepProgress = useMemo(() => (step === 1 ? 50 : 100), [step]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    if (!token || role !== "customer") {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (
      !position ||
      !Number.isFinite(position[0]) ||
      !Number.isFinite(position[1])
    ) {
      return;
    }

    let active = true;

    const resolveAddress = async () => {
      setResolvingAddress(true);
      try {
        const lat = Number(position[0]).toFixed(6);
        const lng = Number(position[1]).toFixed(6);
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
          {
            headers: {
              Accept: "application/json",
            },
          },
        );

        if (!response.ok) {
          throw new Error("Failed to resolve address");
        }

        const data = await response.json();
        const displayName = String(data?.display_name || "").trim();

        if (active && displayName) {
          setAddress(displayName);
        }
      } catch {
        // Keep manual fallback if reverse geocode fails.
      } finally {
        if (active) {
          setResolvingAddress(false);
        }
      }
    };

    resolveAddress();

    return () => {
      active = false;
    };
  }, [position]);

  const handleContinueToMap = (e) => {
    e.preventDefault();

    if (!name.trim()) {
      showError("Name is required");
      return;
    }

    if (!email.trim()) {
      showError("Email is required");
      return;
    }

    if (!city.trim()) {
      showError("City is required");
      return;
    }

    if (!password || password.length < 6) {
      showError("Password must be at least 6 characters");
      return;
    }

    setStep(2);
  };

  const handleSubmitProfile = async () => {
    if (!termsAccepted) {
      showError("Please accept Terms & Conditions to continue");
      return;
    }

    if (!address.trim()) {
      showError("Pin your location to auto-fill address");
      return;
    }

    if (
      !position ||
      !Number.isFinite(position[0]) ||
      !Number.isFinite(position[1])
    ) {
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
        name,
        email,
        password,
        city,
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
      setIsTransitioning(true);
      setTimeout(() => {
        navigate("/", { replace: true });
      }, 1800);
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
        showError(
          "Unable to get your current location. Please tap on map to pin.",
        );
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    );
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_20%,#ffd9de_0%,transparent_35%),radial-gradient(circle_at_80%_0%,#ffe6cb_0%,transparent_32%),#fff7f4]">
      <SiteHeader />
      <AnimatedAlert alert={alert} visible={visible} />

      {isTransitioning && (
        <div className="fixed inset-0 z-50 bg-linear-to-br from-emerald-600 via-red-500 to-green-500">
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <div className="w-28 h-28 rounded-3xl bg-white/90 p-4 shadow-2xl mb-6 animate-pulse">
              <img
                src={meezoLogo}
                alt="Meezo"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="relative w-20 h-20 mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-white/25"></div>
              <svg
                className="absolute inset-0 w-full h-full text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-3xl font-extrabold text-white">
              Profile Completed
            </h2>
            <p className="text-white/90 mt-2">
              Taking you to your home page...
            </p>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="bg-white/90 backdrop-blur-md border border-emerald-100 rounded-3xl shadow-[0_20px_70px_-30px_rgba(255,75,92,0.6)] p-6 sm:p-8">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-600 font-semibold mb-2">
              Customer Onboarding
            </p>
            <h1 className="text-3xl font-extrabold text-gray-900 mb-2">
              Complete Your Profile
            </h1>
            <p className="text-sm text-gray-600">
              Step {step} of 2 -{" "}
              {step === 1 ? "Basic details" : "Pin your delivery location"}
            </p>
            <div className="mt-4 w-full bg-emerald-100 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-linear-to-r from-emerald-600 to-green-500 transition-all duration-500"
                style={{ width: `${stepProgress}%` }}
              />
            </div>
          </div>

          {step === 1 ? (
            <form onSubmit={handleContinueToMap} className="space-y-5">
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-semibold text-gray-700 mb-1"
                >
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-4 py-3 border border-emerald-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-semibold text-gray-700 mb-1"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 border border-emerald-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-semibold text-gray-700 mb-1"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full px-4 py-3 border border-emerald-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  autoComplete="new-password"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="city"
                  className="block text-sm font-semibold text-gray-700 mb-1"
                >
                  City
                </label>
                <input
                  id="city"
                  list="city-list"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Start typing your city"
                  className="w-full px-4 py-3 border border-emerald-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  required
                />
                <datalist id="city-list">
                  {CITY_OPTIONS.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </div>

              <button
                type="submit"
                className="w-full py-3 px-6 bg-linear-to-r from-emerald-600 to-green-500 hover:from-rose-600 hover:to-green-600 text-white font-semibold rounded-xl transition-all duration-300"
              >
                Continue to Map
              </button>
            </form>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3 p-4 rounded-2xl bg-rose-50 border border-emerald-100">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{name}</p>
                  <p className="text-xs text-gray-600">{email}</p>
                  <p className="text-xs text-gray-600">{city}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                >
                  Edit details
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-semibold text-gray-700">
                    Pin Delivery Location
                  </label>
                  <button
                    type="button"
                    onClick={useCurrentLocation}
                    className="text-sm text-rose-600 hover:text-rose-700 font-medium"
                  >
                    {locating ? "Locating..." : "Use current location"}
                  </button>
                </div>

                <div className="w-full h-80 rounded-2xl overflow-hidden border border-emerald-200 shadow-sm">
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
                    <LocationMarker
                      position={position}
                      onPositionChange={setPosition}
                    />
                    <RecenterOnPosition position={position} />
                  </MapContainer>
                </div>

                <div className="p-4 rounded-2xl bg-green-50 border border-green-100 space-y-1">
                  <p className="text-xs uppercase tracking-wide text-green-700 font-semibold">
                    Pinned Coordinates
                  </p>
                  <p className="text-sm text-gray-700">
                    {position[0].toFixed(6)}, {position[1].toFixed(6)}
                  </p>
                  <p className="text-sm text-gray-700">
                    {resolvingAddress
                      ? "Resolving address from pin..."
                      : address || "Tap map to generate address"}
                  </p>
                </div>
              </div>

              <label className="flex items-start gap-3 p-3 rounded-xl border border-emerald-100 bg-emerald-50/60">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm text-gray-700">
                  I accept the{" "}
                  <a
                    href={TERMS_AND_CONDITIONS_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-emerald-700 underline hover:text-rose-600"
                  >
                    Terms & Conditions
                  </a>
                  .
                </span>
              </label>

              <button
                type="button"
                onClick={handleSubmitProfile}
                disabled={loading || resolvingAddress || !termsAccepted}
                className="w-full py-3 px-6 bg-linear-to-r from-emerald-600 to-green-500 hover:from-rose-600 hover:to-green-600 text-white font-semibold rounded-xl transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? "Saving..." : "Finish Profile"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
