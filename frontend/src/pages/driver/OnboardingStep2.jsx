import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SiteHeader from "../../components/SiteHeader";

export default function OnboardingStep2() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    vehicleNumber: "",
    vehicleType: "",
    vehicleModel: "",
    insuranceExpiry: "",
    vehicleLicenseExpiry: "",
    drivingLicenseNumber: "",
    licenseExpiryDate: "",
  });

  const userEmail = localStorage.getItem("userEmail");
  const userName =
    localStorage.getItem("userName") || "Driver";

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const token = localStorage.getItem("token");

    try {
      const res = await fetch("http://localhost:5000/onboarding/step-2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.ok) {
        navigate("/driver/onboarding/step-3");
      } else {
        setError(data.message || "Failed to save vehicle details");
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

  const handleBack = () => {
    navigate("/driver/onboarding/step-1");
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
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-indigo-600">
              Step 2 of 5
            </span>
            <span className="text-sm text-gray-500">Vehicle & License</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full"
              style={{ width: "40%" }}
            ></div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Vehicle & License Details
          </h1>
          <p className="text-gray-600 mb-6">
            Provide your vehicle and driving license information.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Vehicle Details */}
            <div className="border-b pb-4">
              <h2 className="text-lg font-semibold text-gray-700 mb-4">
                Vehicle Information
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vehicle Registration Number *
                  </label>
                  <input
                    name="vehicleNumber"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 uppercase"
                    placeholder="e.g., CAB-1234 or ABC-5678"
                    value={formData.vehicleNumber}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vehicle Type *
                  </label>
                  <select
                    name="vehicleType"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    value={formData.vehicleType}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select vehicle type</option>
                    <option value="bike">Bike/Motorcycle</option>
                    <option value="auto">Three-Wheeler/Tuk-Tuk</option>
                    <option value="car">Car</option>
                    <option value="van">Van/Mini Truck</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vehicle Model *
                  </label>
                  <input
                    name="vehicleModel"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    placeholder="e.g., Honda Civic, Bajaj RE"
                    value={formData.vehicleModel}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Insurance Expiry Date *
                    </label>
                    <input
                      name="insuranceExpiry"
                      type="date"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      value={formData.insuranceExpiry}
                      onChange={handleChange}
                      min={new Date().toISOString().split("T")[0]}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Vehicle License Expiry *
                    </label>
                    <input
                      name="vehicleLicenseExpiry"
                      type="date"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      value={formData.vehicleLicenseExpiry}
                      onChange={handleChange}
                      min={new Date().toISOString().split("T")[0]}
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Driving License Details */}
            <div>
              <h2 className="text-lg font-semibold text-gray-700 mb-4">
                Driving License Information
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Driving License Number *
                  </label>
                  <input
                    name="drivingLicenseNumber"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 uppercase"
                    placeholder="e.g., B1234567"
                    value={formData.drivingLicenseNumber}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    License Expiry Date *
                  </label>
                  <input
                    name="licenseExpiryDate"
                    type="date"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    value={formData.licenseExpiryDate}
                    onChange={handleChange}
                    min={new Date().toISOString().split("T")[0]}
                    required
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                ⚠️ <strong>Important:</strong> All documents must be valid (not
                expired). You'll upload copies in the next step.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleBack}
                className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition"
              >
                {loading ? "Saving..." : "Continue to Documents"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
