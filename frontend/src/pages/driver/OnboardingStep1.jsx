import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { API_URL } from "../../config";
import OnboardingStepProgress from "../../components/driver/OnboardingStepProgress";
import FloatingField from "../../components/driver/FloatingField";
import meezoLogo from "../../assets/MeezoLogo.svg";

export default function OnboardingStep1() {
  const navigate = useNavigate();
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

  const submitMutation = useMutation({
    mutationFn: async (payload) => {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/onboarding/step-1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to save personal information");
      }

      return data;
    },
    onSuccess: () => {
      navigate("/driver/onboarding/step-2");
    },
    onError: (err) => {
      setError(err.message || "Network error. Please try again.");
    },
  });

  const loading = submitMutation.isPending;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      const availabilityRes = await fetch(
        `${API_URL}/auth/check-availability`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ phone: formData.phoneNumber }),
        },
      );
      const availabilityData = await availabilityRes.json().catch(() => ({}));

      if (!availabilityRes.ok) {
        setError(
          availabilityData?.message ||
            "Unable to verify phone availability. Please try again.",
        );
        return;
      }

      if (availabilityData?.phoneAvailable === false) {
        setError(
          availabilityData?.message || "Phone number already registered",
        );
        return;
      }
    } catch (_err) {
      setError("Unable to verify phone availability. Please try again.");
      return;
    }

    await submitMutation.mutateAsync(formData);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start relative font-display">
      {/* Gradient background - Green at top fading to light at bottom */}
      <div className="absolute inset-0 bg-linear-to-b from-[#1db95b] via-[#34d399] via-40% to-[#f0fdf4]"></div>

      {/* Subtle pattern overlay */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            "url('https://grainy-gradients.vercel.app/noise.svg')",
        }}
      ></div>

      {/* Main content */}
      <div className="relative w-full max-w-135 px-4 py-8 z-10">
        <div className="flex justify-center mb-5">
          <img
            src={meezoLogo}
            alt="Meezo logo"
            className="w-40 sm:w-60 h-auto object-contain"
          />
        </div>

        {/* White card */}
        <div className="bg-white rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] p-8">
          {/* Step Progress */}
          <OnboardingStepProgress currentStep={1} />

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-12 w-12 bg-[#dcfce7] rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-[#1db95b] text-2xl">
                person
              </span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Personal Information
              </h1>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name */}
            <div>
              <FloatingField
                as="input"
                label="Full Name"
                name="fullName"
                placeholder="Enter your full name"
                value={formData.fullName}
                onChange={handleChange}
                required
              />
            </div>

            {/* NIC Number */}
            <div>
              <FloatingField
                as="input"
                label="NIC Number"
                name="nicNumber"
                placeholder="Eg; 123456789V or 199812345678"
                value={formData.nicNumber}
                onChange={handleChange}
                required
              />
            </div>

            {/* Mobile Number */}
            <div>
              <FloatingField
                as="input"
                label="Phone Number"
                name="phoneNumber"
                type="tel"
                placeholder="Enter your phone number"
                value={formData.phoneNumber}
                onChange={handleChange}
                required
              />
            </div>

            {/* Date of Birth */}
            <div>
              <FloatingField
                as="input"
                label="Date of Birth"
                name="dateOfBirth"
                type="date"
                value={formData.dateOfBirth}
                onChange={handleChange}
                max={new Date().toISOString().split("T")[0]}
                required
              />
            </div>

            {/* Address */}
            <div>
              <FloatingField
                as="textarea"
                label="Address (as per NIC)"
                name="address"
                placeholder="Enter your full address"
                rows="2"
                value={formData.address}
                onChange={handleChange}
                required
              />
            </div>

            {/* City */}
            <div>
              <FloatingField
                as="input"
                label="City"
                name="city"
                placeholder="Eg; Kinniya,kuttikarachi"
                value={formData.city}
                onChange={handleChange}
                required
              />
            </div>

            {/* Working Time */}
            <div>
              <FloatingField
                as="select"
                label="Preferred Working Time"
                name="workingTime"
                value={formData.workingTime}
                onChange={handleChange}
                required
                options={[
                  { value: "", label: "Select working time" },
                  { value: "full_time", label: "Full Time (Flexible)" },
                  { value: "morning", label: "Day" },
                  { value: "night", label: "Night" },
                ]}
              />
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

            {/* Note */}
            <div className="p-4 bg-[#dcfce7] border border-[#86efac] rounded-xl">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[#16a34a] text-lg mt-0.5">
                  info
                </span>
                <p className="text-sm text-[#166534]">
                  <strong>Note:</strong> Make sure all information matches your
                  official documents.
                </p>
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 bg-[#1db95b] text-white font-bold rounded-full hover:bg-[#18a34a] active:scale-[0.98] transition-all shadow-lg shadow-[#1db95b]/30 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6"
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
                  <span>Continue to Vehicle Details</span>
                  <span className="material-symbols-outlined">
                    arrow_forward
                  </span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
