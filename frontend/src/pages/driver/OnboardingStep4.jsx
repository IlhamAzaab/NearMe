import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { API_URL } from "../../config";
import OnboardingStepProgress from "../../components/driver/OnboardingStepProgress";
import FloatingField from "../../components/driver/FloatingField";
import meezoLogo from "../../assets/NearMeLogoArtboard5.svg";

export default function OnboardingStep4() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    accountHolderName: "",
    bankName: "",
    branch: "",
    accountNumber: "",
    confirmAccountNumber: "",
  });

  const sriLankanBanks = [
    "Bank of Ceylon",
    "People's Bank",
    "Commercial Bank",
    "Hatton National Bank",
    "Sampath Bank",
    "Nations Trust Bank",
    "DFCC Bank",
    "Seylan Bank",
    "Union Bank",
    "Pan Asia Bank",
    "Amana Bank",
    "Cargills Bank",
    "National Development Bank",
    "Standard Chartered Bank",
    "Citibank",
    "HSBC",
    "Other",
  ];

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const submitMutation = useMutation({
    mutationFn: async (payload) => {
      if (payload.accountNumber !== payload.confirmAccountNumber) {
        throw new Error("Account numbers do not match");
      }

      const token = localStorage.getItem("token");
      const { confirmAccountNumber, ...submitData } = payload;

      const res = await fetch(`${API_URL}/onboarding/step-4`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(submitData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to save bank details");
      }

      return data;
    },
    onSuccess: () => {
      navigate("/driver/onboarding/step-5");
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
    navigate("/driver/onboarding/step-3");
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
          <OnboardingStepProgress currentStep={4} />

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-12 w-12 bg-[#dcfce7] rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-[#1db95b] text-2xl">
                account_balance
              </span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Bank Details</h1>
              <p className="text-gray-500 text-sm">Step 4 of 5</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Account Holder Name */}
            <div>
              <FloatingField
                as="input"
                label="Account Holder Name"
                name="accountHolderName"
                placeholder="Accoount holder Name"
                value={formData.accountHolderName}
                onChange={handleChange}
                required
              />
              <p className="text-xs text-gray-500 mt-1 ml-1">
                Enter the name exactly as it appears on your bank account
              </p>
            </div>

            {/* Bank Name */}
            <div>
              <FloatingField
                as="select"
                label="Bank Name"
                name="bankName"
                value={formData.bankName}
                onChange={handleChange}
                required
                options={[
                  { value: "", label: "Select your bank" },
                  ...sriLankanBanks.map((bank) => ({
                    value: bank,
                    label: bank,
                  })),
                ]}
              />
            </div>

            {/* Branch Name */}
            <div>
              <FloatingField
                as="input"
                label="Branch Name"
                name="branch"
                placeholder="Branch"
                value={formData.branch}
                onChange={handleChange}
                required
              />
            </div>

            {/* Account Number */}
            <div>
              <FloatingField
                as="input"
                label="Account Number"
                name="accountNumber"
                type="text"
                placeholder="Enter your account number"
                value={formData.accountNumber}
                onChange={handleChange}
                required
              />
            </div>

            {/* Confirm Account Number */}
            <div>
              <FloatingField
                as="input"
                label="Confirm Account Number"
                name="confirmAccountNumber"
                type="text"
                placeholder="Re-enter your account number"
                value={formData.confirmAccountNumber}
                onChange={handleChange}
                required
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

            {/* Payment Info */}
            <div className="p-4 bg-[#dcfce7] border border-[#86efac] rounded-xl">
              <p className="text-sm font-semibold text-[#166534] mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">
                  payments
                </span>
                Payment Information
              </p>
              <ul className="text-sm text-[#166534] space-y-1 ml-6 list-disc">
                <li>
                  Daily earnings will be transferred to this account before 2.00
                  a.m
                </li>
                <li>Minimum earnings should be 500 for transfer to happen</li>
                <li>Ensure account details are accurate to avoid delays</li>
              </ul>
            </div>

            {/* Security note */}
            <div className="p-4 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[#16a34a] text-lg mt-0.5">
                  lock
                </span>
                <p className="text-sm text-[#166534]">
                  <strong>Security:</strong> Your bank details are encrypted and
                  stored securely.
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
