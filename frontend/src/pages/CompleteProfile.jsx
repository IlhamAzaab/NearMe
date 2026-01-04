import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [usernameError, setUsernameError] = useState("");

  useEffect(() => {
    if (!userId) {
      navigate("/login");
    }
  }, [userId, navigate]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError("");
    if (e.target.name === "phone") setPhoneError("");
    if (e.target.name === "username") setUsernameError("");
  };

  const validatePhone = (phone) => {
    // Sri Lankan phone number validation (10 digits starting with 0)
    const phoneRegex = /^0\d{9}$/;
    return phoneRegex.test(phone);
  };

  const checkPhoneAvailability = async (phone) => {
    try {
      const response = await fetch(
        "http://localhost:5000/auth/check-availability",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        }
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
    setError("");
    setLoading(true);

    // Validation
    if (!formData.username || !formData.phone) {
      setError("Username and phone number are required");
      setLoading(false);
      return;
    }

    if (!validatePhone(formData.phone)) {
      setPhoneError("Invalid phone number format");
      setLoading(false);
      return;
    }

    // Get email from Supabase user
    try {
      // We need to get the email from the userId
      // For now, we'll make a request to get user email
      const userResponse = await fetch(
        `http://localhost:5000/auth/user-email?userId=${userId}`
      );
      const userData = await userResponse.json();

      if (!userResponse.ok) {
        setError("Failed to retrieve user information");
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
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Failed to complete profile");
        setLoading(false);
        return;
      }

      // Success - redirect to login with success message
      navigate("/login?profileCompleted=true");
    } catch (err) {
      console.error("Profile completion error:", err);
      setError("Network error. Please try again.");
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
              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  <p className="text-sm">{error}</p>
                </div>
              )}

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
