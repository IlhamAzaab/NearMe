import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SiteHeader from "../../components/SiteHeader";
import AnimatedAlert, { useAlert } from "../../components/AnimatedAlert";

export default function OnboardingStep1() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setRawError] = useState(null);
  const { alert: alertState, visible: alertVisible, showError } = useAlert();
  const setError = (msg) => {
    setRawError(msg);
    if (msg) showError(msg);
  };
  const [formData, setFormData] = useState({
    fullName: "",
    nicNumber: "",
    phoneNumber: "",
    dateOfBirth: "",
    address: "",
    city: "",
    workingTime: "",
  });

  const userEmail = localStorage.getItem("userEmail");
  const userName = localStorage.getItem("userName") || "Driver";

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const token = localStorage.getItem("token");

    try {
      const res = await fetch("http://localhost:5000/onboarding/step-1", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.ok) {
        navigate("/driver/onboarding/step-2");
      } else {
        setError(data.message || "Failed to save personal information");
      }
    } catch (e) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader
        isLoggedIn={true}
        role="driver"
        userName={userName}
        userEmail={userEmail}
        onLogout={handleLogout}
      />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Progress Indicator */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-indigo-600">
              Step 1 of 5
            </span>
            <span className="text-sm text-gray-500">Personal Information</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full"
              style={{ width: "20%" }}
            ></div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Personal Information
          </h1>
          <p className="text-gray-600 mb-6">
            Please confirm and complete your personal details. All fields are
            required.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email (verified)
              </label>
              <input
                className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50"
                value={userEmail || ""}
                disabled
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name *
              </label>
              <input
                name="fullName"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="Enter your full name as per NIC"
                value={formData.fullName}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                NIC Number *
              </label>
              <input
                name="nicNumber"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="e.g., 123456789V or 199812345678"
                value={formData.nicNumber}
                onChange={handleChange}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter your 10-digit old NIC or 12-digit new NIC
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mobile Number *
              </label>
              <input
                name="phoneNumber"
                type="tel"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="e.g., 0771234567 or +94771234567"
                value={formData.phoneNumber}
                onChange={handleChange}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter your mobile number in Sri Lankan format
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date of Birth *
              </label>
              <input
                name="dateOfBirth"
                type="date"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                value={formData.dateOfBirth}
                onChange={handleChange}
                max={new Date().toISOString().split("T")[0]}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Address (as per NIC) *
              </label>
              <textarea
                name="address"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="Enter your full address"
                rows="3"
                value={formData.address}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                City *
              </label>
              <input
                name="city"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="e.g., Colombo, Kandy, Galle"
                value={formData.city}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Preferred Working Time *
              </label>
              <select
                name="workingTime"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                value={formData.workingTime}
                onChange={handleChange}
                required
              >
                <option value="full_time">Full Time (Flexible)</option>
                <option value="morning">Day</option>
                <option value="night">Night</option>
              </select>
            </div>

            <AnimatedAlert alert={alertState} visible={alertVisible} />

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                ℹ️ <strong>Note:</strong> Make sure all information matches your
                official documents.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition"
            >
              {loading ? "Saving..." : "Continue to Vehicle Details"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
