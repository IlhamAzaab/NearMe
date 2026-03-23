import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { API_URL } from "../../config";

// Step Progress Component with animation
const StepProgress = ({ currentStep, totalSteps = 5 }) => {
  const steps = [
    { num: 1, label: "Personal" },
    { num: 2, label: "Vehicle" },
    { num: 3, label: "Documents" },
    { num: 4, label: "Bank" },
    { num: 5, label: "Contract" },
  ];

  return (
    <div className="w-full mb-8">
      {/* Step segments */}
      <div className="flex gap-2 mb-3">
        {steps.map((step) => (
          <div key={step.num} className="flex-1 relative">
            <div
              className={`h-2 rounded-full overflow-hidden ${
                step.num === currentStep
                  ? "bg-gray-200"
                  : step.num < currentStep
                    ? "bg-[#1db95b]"
                    : "bg-gray-200"
              }`}
            >
              {step.num === currentStep && (
                <div
                  className="h-full bg-[#1db95b] rounded-full"
                  style={{
                    animation: "progressFill 2s ease-in-out infinite",
                  }}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Step labels */}
      <div className="flex justify-between">
        {steps.map((step) => (
          <div
            key={step.num}
            className={`text-xs font-medium ${
              step.num === currentStep
                ? "text-[#1db95b]"
                : step.num < currentStep
                  ? "text-[#1db95b]"
                  : "text-gray-400"
            }`}
          >
            {step.label}
          </div>
        ))}
      </div>

      {/* CSS Animation */}
      <style>{`
        @keyframes progressFill {
          0% { width: 0%; opacity: 0.6; }
          50% { width: 100%; opacity: 1; }
          100% { width: 0%; opacity: 0.6; }
        }
      `}</style>
    </div>
  );
};

export default function OnboardingStep2() {
  const navigate = useNavigate();
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

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const submitMutation = useMutation({
    mutationFn: async (payload) => {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/onboarding/step-2`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to save vehicle details");
      }

      return data;
    },
    onSuccess: () => {
      navigate("/driver/onboarding/step-3");
    },
    onError: (err) => {
      setError(err.message || "Network error. Please try again.");
    },
  });

  const loading = submitMutation.isPending;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    await submitMutation.mutateAsync(formData);
  };

  const handleBack = () => {
    navigate("/driver/onboarding/step-1");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start relative font-display">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#1db95b] via-[#34d399] via-40% to-[#f0fdf4]"></div>

      {/* Subtle pattern overlay */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            "url('https://grainy-gradients.vercel.app/noise.svg')",
        }}
      ></div>

      {/* Main content */}
      <div className="relative w-full max-w-[540px] px-4 py-8 z-10">
        {/* White card */}
        <div className="bg-white rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] p-8">
          {/* Step Progress */}
          <StepProgress currentStep={2} />

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-12 w-12 bg-[#dcfce7] rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-[#1db95b] text-2xl">
                directions_car
              </span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Vehicle & License
              </h1>
              <p className="text-gray-500 text-sm">Step 2 of 5</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Vehicle Information Section */}
            <div className="pb-4 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#1db95b] text-lg">
                  two_wheeler
                </span>
                Vehicle Information
              </h2>

              {/* Vehicle Registration Number */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Vehicle Registration Number *
                </label>
                <div className="relative">
                  <input
                    name="vehicleNumber"
                    className="w-full h-12 pl-11 pr-4 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#1db95b] focus:ring-2 focus:ring-[#1db95b]/20 focus:bg-white transition-all duration-200 uppercase"
                    placeholder="e.g., CAB-1234 or ABC-5678"
                    value={formData.vehicleNumber}
                    onChange={handleChange}
                    required
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1db95b]">
                    <span className="material-symbols-outlined text-xl">
                      pin
                    </span>
                  </div>
                </div>
              </div>

              {/* Vehicle Type */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Vehicle Type *
                </label>
                <div className="relative">
                  <select
                    name="vehicleType"
                    className="w-full h-12 pl-11 pr-10 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:border-[#1db95b] focus:ring-2 focus:ring-[#1db95b]/20 focus:bg-white transition-all duration-200 appearance-none"
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
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1db95b]">
                    <span className="material-symbols-outlined text-xl">
                      category
                    </span>
                  </div>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <span className="material-symbols-outlined text-xl">
                      expand_more
                    </span>
                  </div>
                </div>
              </div>

              {/* Vehicle Model */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Vehicle Model *
                </label>
                <div className="relative">
                  <input
                    name="vehicleModel"
                    className="w-full h-12 pl-11 pr-4 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#1db95b] focus:ring-2 focus:ring-[#1db95b]/20 focus:bg-white transition-all duration-200"
                    placeholder="e.g., Honda Civic, Bajaj RE"
                    value={formData.vehicleModel}
                    onChange={handleChange}
                    required
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1db95b]">
                    <span className="material-symbols-outlined text-xl">
                      directions_car
                    </span>
                  </div>
                </div>
              </div>

              {/* Date fields grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Insurance Expiry *
                  </label>
                  <div className="relative">
                    <input
                      name="insuranceExpiry"
                      type="date"
                      className="w-full h-12 pl-11 pr-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:border-[#1db95b] focus:ring-2 focus:ring-[#1db95b]/20 focus:bg-white transition-all duration-200"
                      value={formData.insuranceExpiry}
                      onChange={handleChange}
                      min={new Date().toISOString().split("T")[0]}
                      required
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1db95b]">
                      <span className="material-symbols-outlined text-xl">
                        verified_user
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    License Expiry *
                  </label>
                  <div className="relative">
                    <input
                      name="vehicleLicenseExpiry"
                      type="date"
                      className="w-full h-12 pl-11 pr-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:border-[#1db95b] focus:ring-2 focus:ring-[#1db95b]/20 focus:bg-white transition-all duration-200"
                      value={formData.vehicleLicenseExpiry}
                      onChange={handleChange}
                      min={new Date().toISOString().split("T")[0]}
                      required
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1db95b]">
                      <span className="material-symbols-outlined text-xl">
                        event
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Driving License Section */}
            <div>
              <h2 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#1db95b] text-lg">
                  badge
                </span>
                Driving License Information
              </h2>

              {/* License Number */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Driving License Number *
                </label>
                <div className="relative">
                  <input
                    name="drivingLicenseNumber"
                    className="w-full h-12 pl-11 pr-4 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#1db95b] focus:ring-2 focus:ring-[#1db95b]/20 focus:bg-white transition-all duration-200 uppercase"
                    placeholder="e.g., B1234567"
                    value={formData.drivingLicenseNumber}
                    onChange={handleChange}
                    required
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1db95b]">
                    <span className="material-symbols-outlined text-xl">
                      id_card
                    </span>
                  </div>
                </div>
              </div>

              {/* License Expiry */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  License Expiry Date *
                </label>
                <div className="relative">
                  <input
                    name="licenseExpiryDate"
                    type="date"
                    className="w-full h-12 pl-11 pr-4 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:border-[#1db95b] focus:ring-2 focus:ring-[#1db95b]/20 focus:bg-white transition-all duration-200"
                    value={formData.licenseExpiryDate}
                    onChange={handleChange}
                    min={new Date().toISOString().split("T")[0]}
                    required
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1db95b]">
                    <span className="material-symbols-outlined text-xl">
                      calendar_month
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-start gap-2">
                <span className="material-symbols-outlined text-red-500 text-lg">
                  error
                </span>
                <span>{error}</span>
              </div>
            )}

            {/* Warning note */}
            <div className="p-4 bg-[#fefce8] border border-[#fef08a] rounded-xl">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[#ca8a04] text-lg mt-0.5">
                  warning
                </span>
                <p className="text-sm text-[#854d0e]">
                  <strong>Important:</strong> All documents must be valid (not
                  expired). You'll upload copies in the next step.
                </p>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={handleBack}
                className="flex-1 h-14 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined">arrow_back</span>
                <span>Back</span>
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 h-14 bg-[#1db95b] text-white font-bold rounded-xl hover:bg-[#18a34a] active:scale-[0.98] transition-all shadow-lg shadow-[#1db95b]/30 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg
                      className="w-5 h-5 animate-spin text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span>Continue</span>
                    <span className="material-symbols-outlined">
                      arrow_forward
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
