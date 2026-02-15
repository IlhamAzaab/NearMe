import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AnimatedAlert, { useAlert } from "../../../components/AnimatedAlert";
import { API_URL } from "../../../config";

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
              {["Personal", "Restaurant", "Location", "Documents", "Review"][i]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminOnboardingStep1() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const [userEmail, setUserEmail] = useState("");

  // Form state
  const [form, setForm] = useState({
    fullName: "",
    nicNumber: "",
    dateOfBirth: "",
    mobileNumber: "",
    homeAddress: "",
    profilePhotoUrl: "",
    nicFrontUrl: "",
    nicBackUrl: "",
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setRawError] = useState(null);
  const { alert: alertState, visible: alertVisible, showError } = useAlert();
  const setError = (msg) => {
    setRawError(msg);
    if (msg) showError(msg);
  };
  const [uploading, setUploading] = useState({
    profilePhoto: false,
    nicFront: false,
    nicBack: false,
  });

  // Fetch user email on mount
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const res = await fetch(`${API_URL}/auth/user`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          setUserEmail(data.email || "");
        }
      } catch (err) {
        console.error("Failed to fetch user data:", err);
      }
    };
    fetchUserData();
  }, [token]);

  // Fetch saved data from backend (if exists)
  useEffect(() => {
    const fetchSavedData = async () => {
      try {
        const res = await fetch(
          `${API_URL}/restaurant-onboarding/step-1`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );
        if (res.ok) {
          const data = await res.json();
          if (data) {
            setForm({
              fullName: data.fullName || "",
              nicNumber: data.nicNumber || "",
              dateOfBirth: data.dateOfBirth || "",
              mobileNumber: data.phone || "",
              homeAddress: data.homeAddress || "",
              profilePhotoUrl: data.profilePhotoUrl || "",
              nicFrontUrl: data.nicFrontUrl || "",
              nicBackUrl: data.nicBackUrl || "",
            });
          }
        }
      } catch (err) {
        console.error("Failed to fetch saved data:", err);
      }
    };
    fetchSavedData();
  }, [token]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear error for this field when user types
    setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  // File upload handler
  const handleFileUpload = async (imageType, file) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      setError("Only JPG and PNG images are allowed");
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setError("Image size must be less than 5MB");
      return;
    }

    setUploading((prev) => ({ ...prev, [imageType]: true }));
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("imageType", imageType);

      const res = await fetch(
        `${API_URL}/restaurant-onboarding/upload-image`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        },
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.message || "Failed to upload image");
        return;
      }

      // Update form with the uploaded image URL
      const fieldMap = {
        profilePhoto: "profilePhotoUrl",
        nicFront: "nicFrontUrl",
        nicBack: "nicBackUrl",
      };
      updateField(fieldMap[imageType], data.url);
    } catch (err) {
      console.error("File upload error:", err);
      setError("Failed to upload image. Please try again.");
    } finally {
      setUploading((prev) => ({ ...prev, [imageType]: false }));
    }
  };

  // Validation functions
  const validateNIC = (nic) => {
    const oldNIC = /^[0-9]{9}[vVxX]$/; // 9 digits + V/X
    const newNIC = /^[0-9]{12}$/; // 12 digits
    return oldNIC.test(nic) || newNIC.test(nic);
  };

  const validateMobile = (mobile) => {
    // Sri Lankan mobile format: 07X XXXX XXX or +947X XXXX XXX
    const sriLankanMobile = /^(?:\+94|0)?7[0-9]{8}$/;
    return sriLankanMobile.test(mobile.replace(/\s/g, ""));
  };

  const validateForm = () => {
    const newErrors = {};

    if (!form.fullName.trim()) {
      newErrors.fullName = "Full name is required";
    } else if (form.fullName.trim().length < 3) {
      newErrors.fullName = "Full name must be at least 3 characters";
    }

    if (!form.nicNumber.trim()) {
      newErrors.nicNumber = "NIC number is required";
    } else if (!validateNIC(form.nicNumber)) {
      newErrors.nicNumber = "Invalid NIC format (10-digit old or 12-digit new)";
    }

    if (!form.dateOfBirth) {
      newErrors.dateOfBirth = "Date of birth is required";
    }

    if (!form.mobileNumber.trim()) {
      newErrors.mobileNumber = "Mobile number is required";
    } else if (!validateMobile(form.mobileNumber)) {
      newErrors.mobileNumber = "Invalid Sri Lankan mobile number";
    }

    if (!form.homeAddress.trim()) {
      newErrors.homeAddress = "Home address is required";
    } else if (form.homeAddress.trim().length < 10) {
      newErrors.homeAddress = "Address must be at least 10 characters";
    }

    if (!form.profilePhotoUrl) {
      newErrors.profilePhotoUrl = "Profile photo is required";
    }

    if (!form.nicFrontUrl) {
      newErrors.nicFrontUrl = "NIC front image is required";
    }

    if (!form.nicBackUrl) {
      newErrors.nicBackUrl = "NIC back image is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) {
      setError("Please fix the errors above");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(
        `${API_URL}/restaurant-onboarding/step-1`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            fullName: form.fullName,
            nicNumber: form.nicNumber,
            dateOfBirth: form.dateOfBirth,
            phone: form.mobileNumber,
            homeAddress: form.homeAddress,
            profilePhotoUrl: form.profilePhotoUrl,
            nicFrontUrl: form.nicFrontUrl,
            nicBackUrl: form.nicBackUrl,
          }),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || "Failed to save personal information");
        return;
      }
      navigate("/admin/restaurant/onboarding/step-2");
    } catch (err) {
      console.error("Step1 submit error", err);
      setError("Something went wrong. Please try again.");
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

        {/* Diagonal lines for extra effect */}
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
      </div>

      <div className="w-full max-w-2xl bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 transform transition-all duration-300 z-10 hover:scale-[1.01]">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-green-500 to-green-600 rounded-full mb-4 shadow-lg">
            <svg
              className="w-8 h-8 text-white"
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
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Admin Onboarding
          </h1>
          <p className="text-gray-600">
            Let's get you set up with your restaurant
          </p>
        </div>

        {/* Progress Bar */}
        <StepProgress currentStep={1} totalSteps={5} />

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Step Title */}
          <div className="border-l-4 border-green-500 pl-4 mb-6">
            <h2 className="text-2xl font-bold text-gray-800">
              Personal Information
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Basic details about you as the restaurant admin
            </p>
          </div>

          {/* Verified Email (Read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Verified Email
            </label>
            <div className="relative">
              <input
                type="email"
                value={userEmail}
                readOnly
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg bg-gray-50 text-gray-700 cursor-not-allowed focus:outline-none"
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-1 text-green-600">
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-sm font-medium">Verified</span>
              </div>
            </div>
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Full Name
            </label>
            <div className="relative">
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-green-800 via-green-400 to-green-800 animate-border-rotation p-[3px]">
                <div className="h-full w-full bg-white rounded-lg"></div>
              </div>
              <input
                type="text"
                value={form.fullName}
                onChange={(e) => updateField("fullName", e.target.value)}
                placeholder="Enter your full name"
                className="relative w-full px-4 py-3 bg-transparent rounded-lg focus:outline-none z-10"
                required
              />
            </div>
            {errors.fullName && (
              <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                {errors.fullName}
              </p>
            )}
          </div>

          {/* NIC Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              NIC Number
            </label>
            <div className="relative">
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-green-800 via-green-400 to-green-800 animate-border-rotation p-[3px]">
                <div className="h-full w-full bg-white rounded-lg"></div>
              </div>
              <input
                type="text"
                value={form.nicNumber}
                onChange={(e) => updateField("nicNumber", e.target.value)}
                placeholder="eg: 123456789V or 200012345678"
                className="relative w-full px-4 py-3 bg-transparent rounded-lg focus:outline-none z-10"
                required
              />
            </div>
            {errors.nicNumber && (
              <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                {errors.nicNumber}
              </p>
            )}
          </div>

          {/* Mobile Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mobile Number
            </label>
            <div className="relative">
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-green-800 via-green-400 to-green-800 animate-border-rotation p-[3px]">
                <div className="h-full w-full bg-white rounded-lg"></div>
              </div>
              <input
                type="tel"
                value={form.mobileNumber}
                onChange={(e) => updateField("mobileNumber", e.target.value)}
                placeholder="enter your phone number"
                className="relative w-full px-4 py-3 bg-transparent rounded-lg focus:outline-none z-10"
                required
              />
            </div>
            {errors.mobileNumber && (
              <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                {errors.mobileNumber}
              </p>
            )}
          </div>

          {/* Date of Birth */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date of Birth
            </label>
            <div className="relative">
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-green-800 via-green-400 to-green-800 animate-border-rotation p-[3px]">
                <div className="h-full w-full bg-white rounded-lg"></div>
              </div>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => updateField("dateOfBirth", e.target.value)}
                className="relative w-full px-4 py-3 bg-transparent rounded-lg focus:outline-none z-10"
                max={new Date().toISOString().split("T")[0]}
                required
              />
            </div>
            {errors.dateOfBirth && (
              <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                {errors.dateOfBirth}
              </p>
            )}
          </div>

          {/* Home Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Home Address
            </label>
            <div className="relative">
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-green-800 via-green-400 to-green-800 animate-border-rotation p-[3px]">
                <div className="h-full w-full bg-white rounded-lg"></div>
              </div>
              <textarea
                value={form.homeAddress}
                onChange={(e) => updateField("homeAddress", e.target.value)}
                placeholder="Enter your complete home address"
                className="relative w-full px-4 py-3 bg-transparent rounded-lg focus:outline-none z-10"
                rows="3"
                required
              />
            </div>
            {errors.homeAddress && (
              <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                {errors.homeAddress}
              </p>
            )}
          </div>

          {/* Profile Photo Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Profile Photo
            </label>
            <div className="relative">
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-green-800 via-green-400 to-green-800 animate-border-rotation p-[3px]">
                <div className="h-full w-full bg-white rounded-lg"></div>
              </div>
              <div className="relative flex items-center gap-3 px-4 py-3 bg-transparent rounded-lg z-10">
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png"
                  onChange={(e) =>
                    handleFileUpload("profilePhoto", e.target.files[0])
                  }
                  className="flex-1 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 text-green-700 hover:file:bg-green-100 file:cursor-pointer cursor-pointer"
                  required
                />
                {form.profilePhotoUrl && !uploading.profilePhoto && (
                  <span className="text-green-600 font-semibold">✓</span>
                )}
                {uploading.profilePhoto && (
                  <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                )}
              </div>
            </div>
            {errors.profilePhotoUrl && (
              <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                {errors.profilePhotoUrl}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500">Max 5MB</p>
          </div>

          {/* NIC Front Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              NIC Front Image
            </label>
            <div className="relative">
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-green-800  via-green-400 to-green-800 animate-border-rotation p-[3px]">
                <div className="h-full w-full bg-white rounded-lg"></div>
              </div>
              <div className="relative flex items-center gap-3 px-4 py-3 bg-transparent rounded-lg z-10">
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png"
                  onChange={(e) =>
                    handleFileUpload("nicFront", e.target.files[0])
                  }
                  className="flex-1 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 text-green-700 hover:file:bg-green-100 file:cursor-pointer cursor-pointer"
                  required
                />
                {form.nicFrontUrl && !uploading.nicFront && (
                  <span className="text-green-600 font-semibold">✓</span>
                )}
                {uploading.nicFront && (
                  <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                )}
              </div>
            </div>
            {errors.nicFrontUrl && (
              <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                {errors.nicFrontUrl}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500">Max 5MB</p>
          </div>

          {/* NIC Back Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              NIC Back Image
            </label>
            <div className="relative">
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-green-800 via-green-400 to-green-800 animate-border-rotation p-[3px]">
                <div className="h-full w-full bg-white rounded-lg"></div>
              </div>
              <div className="relative flex items-center gap-3 px-4 py-3 bg-transparent rounded-lg z-10">
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png"
                  onChange={(e) =>
                    handleFileUpload("nicBack", e.target.files[0])
                  }
                  className="flex-1 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 text-green-700 hover:file:bg-green-100 file:cursor-pointer cursor-pointer"
                  required
                />
                {form.nicBackUrl && !uploading.nicBack && (
                  <span className="text-green-600 font-semibold">✓</span>
                )}
                {uploading.nicBack && (
                  <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                )}
              </div>
            </div>
            {errors.nicBackUrl && (
              <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                {errors.nicBackUrl}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500">Max 5MB</p>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className={`px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2 ${
                loading
                  ? "opacity-70 cursor-not-allowed"
                  : "hover:from-green-600 hover:to-green-700 active:scale-95"
              }`}
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Saving...
                </>
              ) : (
                <>
                  Next Step
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        /* iOS-style select dropdowns */
        select {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23374151' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 0.5rem center;
          background-size: 12px;
          padding-right: 2rem;
        }

        select option {
          padding: 10px;
          background: white;
          color: #374151;
          font-weight: 500;
        }

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

        @keyframes pulse-slow {
          0%,
          100% {
            opacity: 0.3;
          }
          50% {
            opacity: 0.5;
          }
        }

        @keyframes pulse-slower {
          0%,
          100% {
            opacity: 0.2;
          }
          50% {
            opacity: 0.4;
          }
        }

        @keyframes ping-slow {
          0% {
            transform: scale(1);
            opacity: 0.3;
          }
          50% {
            transform: scale(1.1);
            opacity: 0.2;
          }
          100% {
            transform: scale(1);
            opacity: 0.3;
          }
        }

        @keyframes slide-down {
          0% {
            transform: translateY(-100%);
            opacity: 0;
          }
          50% {
            opacity: 0.3;
          }
          100% {
            transform: translateY(100%);
            opacity: 0;
          }
        }

        @keyframes slide-diagonal {
          0% {
            transform: translateX(-100%) translateY(-50%);
            opacity: 0;
          }
          50% {
            opacity: 0.3;
          }
          100% {
            transform: translateX(0%) translateY(50%);
            opacity: 0;
          }
        }

        .animate-pulse-slow {
          animation: pulse-slow 4s ease-in-out infinite;
        }

        .animate-pulse-slower {
          animation: pulse-slower 6s ease-in-out infinite;
        }

        .animate-ping-slow {
          animation: ping-slow 3s ease-in-out infinite;
        }

        .animate-slide-down {
          animation: slide-down linear infinite;
        }

        .animate-slide-diagonal {
          animation: slide-diagonal 4s linear infinite;
        }
      `}</style>
    </div>
  );
}
