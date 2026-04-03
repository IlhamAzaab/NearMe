import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { API_URL } from "../../config";
import OnboardingStepProgress from "../../components/driver/OnboardingStepProgress";
import FloatingField from "../../components/driver/FloatingField";
import meezoLogo from "../../assets/NearMeLogoArtboard5.svg";

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
    const { name, value } = e.target;
    const normalizedValue =
      name === "vehicleNumber" ? value.toUpperCase() : value;
    setFormData({ ...formData, [name]: normalizedValue });
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
            className="w-50 sm:w-40 h-auto object-contain"
          />
        </div>

        {/* White card */}
        <div className="bg-white rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] p-8">
          {/* Step Progress */}
          <OnboardingStepProgress currentStep={2} />

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-12 w-12 bg-[#dcfce7] rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-[#1db95b] text-2xl">
                two_wheeler
              </span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Vehicle & License
              </h1>
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
                <FloatingField
                  as="input"
                  label="Vehicle Registration Number"
                  name="vehicleNumber"
                  className="uppercase"
                  placeholder="Eg; BEO-5678"
                  value={formData.vehicleNumber}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* Vehicle Type */}
              <div className="mb-4">
                <FloatingField
                  as="select"
                  label="Vehicle Type"
                  name="vehicleType"
                  value={formData.vehicleType}
                  onChange={handleChange}
                  required
                  options={[
                    { value: "", label: "Select vehicle type" },
                    { value: "bike", label: "Bike" },
                    { value: "auto", label: "Auto" },
                  ]}
                />
              </div>

              {/* Vehicle Model */}
              <div className="mb-4">
                <FloatingField
                  as="input"
                  label="Vehicle Model"
                  name="vehicleModel"
                  placeholder="Eg; Pulsur 150 or Hero Honda"
                  value={formData.vehicleModel}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* Date fields grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FloatingField
                    as="input"
                    label="Insurance Expiry"
                    name="insuranceExpiry"
                    type="date"
                    value={formData.insuranceExpiry}
                    onChange={handleChange}
                    min={new Date().toISOString().split("T")[0]}
                    required
                  />
                </div>
                <div>
                  <FloatingField
                    as="input"
                    label="Vehicle-License Expiry"
                    name="vehicleLicenseExpiry"
                    type="date"
                    value={formData.vehicleLicenseExpiry}
                    onChange={handleChange}
                    min={new Date().toISOString().split("T")[0]}
                    required
                  />
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
                <FloatingField
                  as="input"
                  label="Driving License Number"
                  name="drivingLicenseNumber"
                  className="uppercase"
                  placeholder="Eg; B1234567"
                  value={formData.drivingLicenseNumber}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* License Expiry */}
              <div>
                <FloatingField
                  as="input"
                  label="Driving-License Expiry"
                  name="licenseExpiryDate"
                  type="date"
                  value={formData.licenseExpiryDate}
                  onChange={handleChange}
                  min={new Date().toISOString().split("T")[0]}
                  required
                />
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
                className="flex-1 h-14 bg-gray-100 text-gray-700 font-bold rounded-full hover:bg-gray-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined">arrow_back</span>
                <span>Back</span>
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 h-14 bg-[#1db95b] text-white font-bold rounded-full hover:bg-[#18a34a] active:scale-[0.98] transition-all shadow-lg shadow-[#1db95b]/30 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
