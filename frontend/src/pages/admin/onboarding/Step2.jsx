import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import AnimatedAlert, { useAlert } from "../../../components/AnimatedAlert";

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

// Step Progress Bar Component
function StepProgress({ currentStep, totalSteps }) {
  return (
    <div className="w-full mb-8">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700">
          Step {currentStep} of {totalSteps}
        </span>
        <span className="text-sm font-medium text-green-600">
          {Math.round((currentStep / totalSteps) * 100)}% Complete
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className="bg-gradient-to-r from-green-500 to-green-600 h-2.5 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${(currentStep / totalSteps) * 100}%` }}
        ></div>
      </div>
      <div className="flex justify-between mt-3">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div key={i} className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                i + 1 < currentStep
                  ? "bg-green-500 text-white"
                  : i + 1 === currentStep
                    ? "bg-green-600 text-white ring-4 ring-green-200"
                    : "bg-gray-300 text-gray-600"
              }`}
            >
              {i + 1 < currentStep ? (
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span className="text-xs mt-1 text-gray-600 hidden sm:block">
              {["Personal", "Restaurant", "Bank", "Contract", "Review"][i]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminOnboardingStep2() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  // Animation for floating elements
  useEffect(() => {
    const interval = setInterval(() => {
      const elements = document.querySelectorAll(".floating");
      elements.forEach((el) => {
        el.style.transform = `translateY(${Math.sin(Date.now() / 1000 + Array.from(elements).indexOf(el)) * 5}px)`;
      });
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const [form, setForm] = useState({
    restaurantName: "",
    registrationNumber: "",
    address: "",
    city: "",
    postalCode: "",
    openingTime: "",
    closeTime: "",
  });
  const [position, setPosition] = useState(null); // [lat, lng]
  const [mapCenter, setMapCenter] = useState([8.8731, 81.7718]); // For centering map
  const [files, setFiles] = useState({
    logo: null,
    coverImage: null,
  });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState({});
  const [error, setRawError] = useState(null);
  const { alert: alertState, visible: alertVisible, showError } = useAlert();
  const setError = (msg) => {
    setRawError(msg);
    if (msg) showError(msg);
  };
  const [locating, setLocating] = useState(false);

  // Set default position (Sri Lanka center)
  useEffect(() => {
    if (!position) {
      setPosition([7.8731, 80.7718]); // Sri Lanka center
    }
  }, []);

  const updateField = (key, value) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
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
        setError(
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

  const handleFileChange = (fieldKey, e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError(`${fieldKey} must be less than 5MB`);
        return;
      }
      // Validate file type
      if (!["image/jpeg", "image/jpg", "image/png"].includes(file.type)) {
        setError(`${fieldKey} must be JPG or PNG`);
        return;
      }
      setFiles((prev) => ({ ...prev, [fieldKey]: file }));
      setError(null);
    }
  };

  const uploadToCloudinary = async (file, imageType) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("imageType", imageType);

      const response = await fetch(
        "http://localhost:5000/restaurant-onboarding/upload-image",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        },
      );

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      return data.url;
    } catch (error) {
      console.error("Upload error:", error);
      throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Check if all required text fields are filled
    if (
      !form.restaurantName ||
      !form.address ||
      !form.city ||
      !form.postalCode ||
      !form.openingTime ||
      !form.closeTime
    ) {
      setError("All required fields must be filled");
      return;
    }

    // Check if position is set
    if (!position) {
      setError("Please select restaurant location on the map");
      return;
    }

    // Check if cover image is selected
    if (!files.coverImage) {
      setError("Cover image is required");
      return;
    }

    setLoading(true);

    try {
      // Upload images to Cloudinary (logo is optional)
      const uploadPromises = [];
      let logoUrl = null;

      if (files.logo) {
        uploadPromises.push(
          (async () => {
            setUploading((prev) => ({ ...prev, logo: true }));
            const url = await uploadToCloudinary(files.logo, "logo");
            setUploading((prev) => ({ ...prev, logo: false }));
            return url;
          })(),
        );
      } else {
        uploadPromises.push(Promise.resolve(null));
      }

      uploadPromises.push(
        (async () => {
          setUploading((prev) => ({ ...prev, coverImage: true }));
          const url = await uploadToCloudinary(files.coverImage, "cover_image");
          setUploading((prev) => ({ ...prev, coverImage: false }));
          return url;
        })(),
      );

      const [uploadedLogoUrl, coverImageUrl] =
        await Promise.all(uploadPromises);
      logoUrl = uploadedLogoUrl;

      // Submit to backend with URLs and position coordinates
      const res = await fetch(
        "http://localhost:5000/restaurant-onboarding/step-2",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...form,
            latitude: position[0].toString(),
            longitude: position[1].toString(),
            logoUrl,
            coverImageUrl,
          }),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || "Failed to save step 2");
        return;
      }
      navigate("/admin/restaurant/onboarding/step-3");
    } catch (err) {
      console.error("Step2 submit error", err);
      setError("Failed to upload images. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-500 via-green-600 to-green-700 p-4 overflow-hidden relative">
      <AnimatedAlert alert={alertState} visible={alertVisible} />
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Floating circles */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-gradient-to-r from-green-400/30 to-green-500/30 floating animate-pulse-slow"></div>
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full bg-gradient-to-r from-green-300/25 to-green-400/25 floating animate-pulse-slower"></div>
        <div className="absolute top-1/3 right-1/3 w-48 h-48 rounded-full bg-gradient-to-r from-green-200/20 to-green-300/20 floating animate-pulse-slow"></div>
        <div className="absolute top-1/2 left-1/2 w-40 h-40 rounded-full bg-gradient-to-r from-lime-300/25 to-green-300/25 animate-ping-slow"></div>

        {/* Vertical animated bars */}
        <div className="absolute inset-0">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 bg-gradient-to-b from-transparent via-white/25 to-transparent animate-slide-down"
              style={{
                left: `${i * 10}%`,
                height: "100%",
                animationDelay: `${i * 0.3}s`,
                animationDuration: `${3 + i * 0.2}s`,
              }}
            ></div>
          ))}
        </div>

        {/* Diagonal lines */}
        <div className="absolute inset-0">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="absolute h-px bg-gradient-to-r from-transparent via-lime-400/20 to-transparent animate-slide-diagonal"
              style={{
                top: `${i * 20}%`,
                width: "200%",
                animationDelay: `${i * 0.5}s`,
              }}
            ></div>
          ))}
        </div>

        {/* Speed lines animation */}
        <div className="absolute inset-0">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute h-1 bg-gradient-to-r from-transparent via-white/30 to-transparent"
              style={{
                top: `${i * 12.5}%`,
                width: "200%",
                animation: `speedLine ${2 + i * 0.3}s linear infinite`,
                animationDelay: `${i * 0.2}s`,
                transform: `translateX(-100%)`,
              }}
            ></div>
          ))}
        </div>
      </div>

      <div className="max-w-4xl w-full mx-auto bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 relative z-10">
        {/* Animated restaurant logo */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="text-6xl animate-bounce text-red-600">
              <svg
                className="w-16 h-16 mx-auto"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8.1 13.34l2.83-2.83L3.91 3.5c-1.56 1.56-1.56 4.09 0 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z" />
              </svg>
            </div>
            <div className="absolute -top-2 -right-2 w-4 h-4 bg-lime-500 rounded-full animate-ping"></div>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-center mb-2 bg-gradient-to-r from-lime-600 to-green-600 bg-clip-text text-transparent">
          Restaurant Details
        </h1>
        <p className="text-center text-gray-600 mb-6">
          Provide restaurant identity and location details.
        </p>

        {/* Progress Bar */}
        <StepProgress currentStep={2} totalSteps={5} />

        <form
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
          onSubmit={handleSubmit}
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Restaurant Name
            </label>
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-green-800 via-green-400 to-green-800 animate-border-rotation p-[3px]">
                <div className="h-full w-full bg-white rounded-xl"></div>
              </div>
              <input
                className="relative w-full px-4 py-3 bg-transparent rounded-xl focus:outline-none z-10"
                placeholder="Enter restaurant name"
                value={form.restaurantName}
                onChange={(e) => updateField("restaurantName", e.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Business Registration Number
            </label>
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-green-800 via-green-400 to-green-800 animate-border-rotation p-[3px]">
                <div className="h-full w-full bg-white rounded-xl"></div>
              </div>
              <input
                className="relative w-full px-4 py-3 bg-transparent rounded-xl focus:outline-none z-10"
                placeholder="Enter registration number"
                value={form.registrationNumber}
                onChange={(e) =>
                  updateField("registrationNumber", e.target.value)
                }
                required
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Address
            </label>
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-green-800 via-green-400 to-green-800 animate-border-rotation p-[3px]">
                <div className="h-full w-full bg-white rounded-xl"></div>
              </div>
              <input
                className="relative w-full px-4 py-3 bg-transparent rounded-xl focus:outline-none z-10"
                placeholder="Enter complete address"
                value={form.address}
                onChange={(e) => updateField("address", e.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              City
            </label>
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-green-800 via-green-400 to-green-800 animate-border-rotation p-[3px]">
                <div className="h-full w-full bg-white rounded-xl"></div>
              </div>
              <input
                className="relative w-full px-4 py-3 bg-transparent rounded-xl focus:outline-none z-10"
                placeholder="Enter city"
                value={form.city}
                onChange={(e) => updateField("city", e.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Postal Code
            </label>
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-green-800 via-green-400 to-green-800 animate-border-rotation p-[3px]">
                <div className="h-full w-full bg-white rounded-xl"></div>
              </div>
              <input
                className="relative w-full px-4 py-3 bg-transparent rounded-xl focus:outline-none z-10"
                placeholder="Enter postal code"
                value={form.postalCode}
                onChange={(e) => updateField("postalCode", e.target.value)}
                required
              />
            </div>
          </div>

          {/* Map for Location Selection */}
          <div className="md:col-span-2 space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              Restaurant Location
            </label>
            <div className="relative">
              <MapContainer
                center={position || [7.8731, 80.7718]}
                zoom={13}
                style={{ height: "400px", width: "100%", borderRadius: "8px" }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LocationMarker position={position} setPosition={setPosition} />
                <MapController center={mapCenter} />
              </MapContainer>
            </div>

            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={locating}
              className="w-full bg-gradient-to-r from-lime-500 to-green-500 text-white py-2 px-4 rounded-xl hover:from-lime-600 hover:to-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
            >
              {locating ? "Getting location..." : "Find My Location"}
            </button>
            <p className="text-xs text-gray-500">
              Click on the map to pin location or use your current location
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Opening Time
            </label>
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-green-800 via-green-400 to-green-800 animate-border-rotation p-[3px]">
                <div className="h-full w-full bg-white rounded-xl"></div>
              </div>
              <div className="relative grid grid-cols-2 gap-3 px-4 py-3 bg-transparent rounded-xl z-10">
                <div className="relative group">
                  <select
                    value={
                      form.openingTime ? form.openingTime.split(":")[0] : ""
                    }
                    onChange={(e) => {
                      const hour = e.target.value;
                      const minute = form.openingTime
                        ? form.openingTime.split(":")[1]
                        : "00";
                      updateField("openingTime", `${hour}:${minute}`);
                    }}
                    className="w-full bg-gradient-to-br from-white to-green-50 border-2 border-green-100 rounded-xl px-4 py-3 text-center font-semibold text-gray-800 focus:outline-none focus:border-green-500 focus:ring-4 focus:ring-green-200 cursor-pointer appearance-none transition-all duration-300 hover:shadow-lg hover:scale-105 hover:border-green-300"
                    required
                  >
                    <option value="" className="text-gray-400">
                      Hour
                    </option>
                    {Array.from({ length: 24 }, (_, i) =>
                      String(i).padStart(2, "0"),
                    ).map((hour) => (
                      <option
                        key={hour}
                        value={hour}
                        className="text-gray-800 font-medium"
                      >
                        {hour}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg
                      className="w-5 h-5 text-green-600 transition-transform duration-300 group-hover:scale-110"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
                <div className="relative group">
                  <select
                    value={
                      form.openingTime ? form.openingTime.split(":")[1] : ""
                    }
                    onChange={(e) => {
                      const minute = e.target.value;
                      const hour = form.openingTime
                        ? form.openingTime.split(":")[0]
                        : "00";
                      updateField("openingTime", `${hour}:${minute}`);
                    }}
                    className="w-full bg-gradient-to-br from-white to-green-50 border-2 border-green-100 rounded-xl px-4 py-3 text-center font-semibold text-gray-800 focus:outline-none focus:border-green-500 focus:ring-4 focus:ring-green-200 cursor-pointer appearance-none transition-all duration-300 hover:shadow-lg hover:scale-105 hover:border-green-300"
                    required
                  >
                    <option value="" className="text-gray-400">
                      Min
                    </option>
                    {Array.from({ length: 60 }, (_, i) =>
                      String(i).padStart(2, "0"),
                    ).map((min) => (
                      <option
                        key={min}
                        value={min}
                        className="text-gray-800 font-medium"
                      >
                        {min}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg
                      className="w-5 h-5 text-green-600 transition-transform duration-300 group-hover:scale-110"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Closing Time
            </label>
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-green-800 via-green-400 to-green-800 animate-border-rotation p-[3px]">
                <div className="h-full w-full bg-white rounded-xl"></div>
              </div>
              <div className="relative grid grid-cols-2 gap-3 px-4 py-3 bg-transparent rounded-xl z-10">
                <div className="relative group">
                  <select
                    value={form.closeTime ? form.closeTime.split(":")[0] : ""}
                    onChange={(e) => {
                      const hour = e.target.value;
                      const minute = form.closeTime
                        ? form.closeTime.split(":")[1]
                        : "00";
                      updateField("closeTime", `${hour}:${minute}`);
                    }}
                    className="w-full bg-gradient-to-br from-white to-green-50 border-2 border-green-100 rounded-xl px-4 py-3 text-center font-semibold text-gray-800 focus:outline-none focus:border-green-500 focus:ring-4 focus:ring-green-200 cursor-pointer appearance-none transition-all duration-300 hover:shadow-lg hover:scale-105 hover:border-green-300"
                    required
                  >
                    <option value="" className="text-gray-400">
                      Hour
                    </option>
                    {Array.from({ length: 24 }, (_, i) =>
                      String(i).padStart(2, "0"),
                    ).map((hour) => (
                      <option
                        key={hour}
                        value={hour}
                        className="text-gray-800 font-medium"
                      >
                        {hour}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg
                      className="w-5 h-5 text-green-600 transition-transform duration-300 group-hover:scale-110"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
                <div className="relative group">
                  <select
                    value={form.closeTime ? form.closeTime.split(":")[1] : ""}
                    onChange={(e) => {
                      const minute = e.target.value;
                      const hour = form.closeTime
                        ? form.closeTime.split(":")[0]
                        : "00";
                      updateField("closeTime", `${hour}:${minute}`);
                    }}
                    className="w-full bg-gradient-to-br from-white to-green-50 border-2 border-green-100 rounded-xl px-4 py-3 text-center font-semibold text-gray-800 focus:outline-none focus:border-green-500 focus:ring-4 focus:ring-green-200 cursor-pointer appearance-none transition-all duration-300 hover:shadow-lg hover:scale-105 hover:border-green-300"
                    required
                  >
                    <option value="" className="text-gray-400">
                      Min
                    </option>
                    {Array.from({ length: 60 }, (_, i) =>
                      String(i).padStart(2, "0"),
                    ).map((min) => (
                      <option
                        key={min}
                        value={min}
                        className="text-gray-800 font-medium"
                      >
                        {min}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg
                      className="w-5 h-5 text-green-600 transition-transform duration-300 group-hover:scale-110"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Logo Upload (Optional) */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Restaurant Logo (Optional)
            </label>
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png"
              className="w-full border-2 border-gray-200 rounded-xl p-3 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-gradient-to-r file:from-lime-50 file:to-green-50 file:text-lime-700 hover:file:bg-lime-100 file:cursor-pointer cursor-pointer transition-all"
              onChange={(e) => handleFileChange("logo", e)}
            />
          </div>

          {/* Cover Image Upload (Required) */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cover Image <span className="text-red-600">*</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png"
                className="flex-1 border-2 border-gray-200 rounded-xl p-3 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-gradient-to-r file:from-lime-50 file:to-green-50 file:text-lime-700 hover:file:bg-lime-100 file:cursor-pointer cursor-pointer transition-all"
                onChange={(e) => handleFileChange("coverImage", e)}
                required
              />
              {files.coverImage && (
                <div className="text-green-600 font-semibold">✓</div>
              )}
              {uploading.coverImage && (
                <div className="text-blue-600 font-semibold">⟳</div>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">JPG or PNG, max 5MB</p>
          </div>

          {/* Error Display */}

          <div className="md:col-span-2 flex justify-end gap-3 mt-4">
            <button
              type="button"
              className="px-6 py-3 bg-gray-200 text-gray-800 rounded-xl hover:bg-gray-300 transition-all shadow-md hover:shadow-lg"
              onClick={() => navigate("/admin/restaurant/onboarding/step-1")}
            >
              Back
            </button>
            <button
              type="submit"
              className="px-6 py-3 bg-gradient-to-r from-lime-500 to-green-500 text-white rounded-xl hover:from-lime-600 hover:to-green-600 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              disabled={loading}
            >
              {loading && (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              )}
              {loading ? "Uploading..." : "Save & Continue"}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        @keyframes border-rotation {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }

        .animate-border-rotation {
          background-size: 200% 200%;
          animation: border-rotation 3s linear infinite;
        }

        @keyframes speedLine {
          0% {
            transform: translateX(-100%) translateY(0);
          }
          100% {
            transform: translateX(100%) translateY(0);
          }
        }
        .animate-spin-slow {
          animation: spin 3s linear infinite;
        }
        .animate-spin-slow-reverse {
          animation: spin 3s linear infinite reverse;
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
