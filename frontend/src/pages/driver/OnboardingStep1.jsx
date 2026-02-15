import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
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

export default function OnboardingStep1() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    fullName: "",
    nicNumber: "",
    phoneNumber: "",
    dateOfBirth: "",
    address: "",
    city: "",
    workingTime: "",
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const token = localStorage.getItem("token");

    try {
      const res = await fetch(`${API_URL}/onboarding/step-1`, {
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-start relative font-display">
      {/* Gradient background - Green at top fading to light at bottom */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#1db95b] via-[#34d399] via-40% to-[#f0fdf4]"></div>
      
      {/* Subtle pattern overlay */}
      <div 
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{ backgroundImage: "url('https://grainy-gradients.vercel.app/noise.svg')" }}
      ></div>

      {/* Main content */}
      <div className="relative w-full max-w-[540px] px-4 py-8 z-10">
        {/* White card */}
        <div className="bg-white rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] p-8">
          {/* Step Progress */}
          <StepProgress currentStep={1} />

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-12 w-12 bg-[#dcfce7] rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-[#1db95b] text-2xl">person</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Personal Information</h1>
              <p className="text-gray-500 text-sm">Step 1 of 5</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Full Name *
              </label>
              <div className="relative">
                <input
                  name="fullName"
                  className="w-full h-12 pl-11 pr-4 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#1db95b] focus:ring-2 focus:ring-[#1db95b]/20 focus:bg-white transition-all duration-200"
                  placeholder="Enter your full name as per NIC"
                  value={formData.fullName}
                  onChange={handleChange}
                  required
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1db95b]">
                  <span className="material-symbols-outlined text-xl">badge</span>
                </div>
              </div>
            </div>

            {/* NIC Number */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                NIC Number *
              </label>
              <div className="relative">
                <input
                  name="nicNumber"
                  className="w-full h-12 pl-11 pr-4 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#1db95b] focus:ring-2 focus:ring-[#1db95b]/20 focus:bg-white transition-all duration-200"
                  placeholder="e.g., 123456789V or 199812345678"
                  value={formData.nicNumber}
                  onChange={handleChange}
                  required
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1db95b]">
                  <span className="material-symbols-outlined text-xl">id_card</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1 ml-1">
                Enter your 10-digit old NIC or 12-digit new NIC
              </p>
            </div>

            {/* Mobile Number */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Mobile Number *
              </label>
              <div className="relative">
                <input
                  name="phoneNumber"
                  type="tel"
                  className="w-full h-12 pl-11 pr-4 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#1db95b] focus:ring-2 focus:ring-[#1db95b]/20 focus:bg-white transition-all duration-200"
                    placeholder="e.g., 0771234567 or +94771234567"
                  value={formData.phoneNumber}
                  onChange={handleChange}
                  required
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1db95b]">
                  <span className="material-symbols-outlined text-xl">phone</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1 ml-1">
                Enter your mobile number in Sri Lankan format
              </p>
            </div>

            {/* Date of Birth */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Date of Birth *
              </label>
              <div className="relative">
                <input
                  name="dateOfBirth"
                  type="date"
                  className="w-full h-12 pl-11 pr-4 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:border-[#1db95b] focus:ring-2 focus:ring-[#1db95b]/20 focus:bg-white transition-all duration-200"
                  value={formData.dateOfBirth}
                  onChange={handleChange}
                  max={new Date().toISOString().split("T")[0]}
                  required
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1db95b]">
                  <span className="material-symbols-outlined text-xl">cake</span>
                </div>
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Address (as per NIC) *
              </label>
              <div className="relative">
                <textarea
                  name="address"
                  className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#1db95b] focus:ring-2 focus:ring-[#1db95b]/20 focus:bg-white transition-all duration-200"
                  placeholder="Enter your full address"
                  rows="2"
                  value={formData.address}
                  onChange={handleChange}
                  required
                />
                <div className="absolute left-4 top-4 text-[#1db95b]">
                  <span className="material-symbols-outlined text-xl">home</span>
                </div>
              </div>
            </div>

            {/* City */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                City *
              </label>
              <div className="relative">
                <input
                  name="city"
                  className="w-full h-12 pl-11 pr-4 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#1db95b] focus:ring-2 focus:ring-[#1db95b]/20 focus:bg-white transition-all duration-200"
                  placeholder="e.g., Colombo, Kandy, Galle"
                  value={formData.city}
                  onChange={handleChange}
                  required
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1db95b]">
                  <span className="material-symbols-outlined text-xl">location_city</span>
                </div>
              </div>
            </div>

            {/* Working Time */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Preferred Working Time *
              </label>
              <div className="relative">
                <select
                  name="workingTime"
                  className="w-full h-12 pl-11 pr-4 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:border-[#1db95b] focus:ring-2 focus:ring-[#1db95b]/20 focus:bg-white transition-all duration-200 appearance-none"
                  value={formData.workingTime}
                  onChange={handleChange}
                  required
                >
                  <option value="">Select working time</option>
                  <option value="full_time">Full Time (Flexible)</option>
                  <option value="morning">Day</option>
                  <option value="night">Night</option>
                </select>
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1db95b]">
                  <span className="material-symbols-outlined text-xl">schedule</span>
                </div>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <span className="material-symbols-outlined text-xl">expand_more</span>
                </div>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-start gap-2">
                <span className="material-symbols-outlined text-red-500 text-lg">error</span>
                <span>{error}</span>
              </div>
            )}

            {/* Note */}
            <div className="p-4 bg-[#dcfce7] border border-[#86efac] rounded-xl">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[#16a34a] text-lg mt-0.5">info</span>
                <p className="text-sm text-[#166534]">
                  <strong>Note:</strong> Make sure all information matches your official documents.
                </p>
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 bg-[#1db95b] text-white font-bold rounded-xl hover:bg-[#18a34a] active:scale-[0.98] transition-all shadow-lg shadow-[#1db95b]/30 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6"
            >
              {loading ? (
                <>
                  <svg className="w-5 h-5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <span>Continue to Vehicle Details</span>
                  <span className="material-symbols-outlined">arrow_forward</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}