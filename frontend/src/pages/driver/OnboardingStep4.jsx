import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SiteHeader from "../../components/SiteHeader";

export default function OnboardingStep4() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    accountHolderName: "",
    bankName: "",
    branch: "",
    accountNumber: "",
    confirmAccountNumber: "",
  });

  const userEmail = localStorage.getItem("userEmail");
  const userName =
    localStorage.getItem("userName") || userEmail?.split("@")[0] || "Driver";

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validate account number match
    if (formData.accountNumber !== formData.confirmAccountNumber) {
      setError("Account numbers do not match");
      return;
    }

    setLoading(true);

    const token = localStorage.getItem("token");

    try {
      const { confirmAccountNumber, ...submitData } = formData;

      const res = await fetch("http://localhost:5000/onboarding/step-4", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(submitData),
      });

      const data = await res.json();

      if (res.ok) {
        navigate("/driver/onboarding/step-5");
      } else {
        setError(data.message || "Failed to save bank details");
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
    navigate("/driver/onboarding/step-3");
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
              Step 4 of 5
            </span>
            <span className="text-sm text-gray-500">Bank Details</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full"
              style={{ width: "80%" }}
            ></div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Bank Account Details
          </h1>
          <p className="text-gray-600 mb-6">
            Enter your bank account details for earnings payments. All fields
            are required.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Holder Name *
              </label>
              <input
                name="accountHolderName"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="Name as per bank account"
                value={formData.accountHolderName}
                onChange={handleChange}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter the name exactly as it appears on your bank account
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bank Name *
              </label>
              <select
                name="bankName"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                value={formData.bankName}
                onChange={handleChange}
                required
              >
                <option value="">Select your bank</option>
                {sriLankanBanks.map((bank) => (
                  <option key={bank} value={bank}>
                    {bank}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Branch Name *
              </label>
              <input
                name="branch"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="e.g., Colombo Fort, Kandy City"
                value={formData.branch}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Number *
              </label>
              <input
                name="accountNumber"
                type="text"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="Enter your account number"
                value={formData.accountNumber}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Account Number *
              </label>
              <input
                name="confirmAccountNumber"
                type="text"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="Re-enter your account number"
                value={formData.confirmAccountNumber}
                onChange={handleChange}
                required
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-800 font-semibold mb-2">
                💰 Payment Information:
              </p>
              <ul className="text-sm text-green-700 space-y-1 ml-4 list-disc">
                <li>Weekly earnings will be transferred to this account</li>
                <li>Processing time: 2-3 business days</li>
                <li>Ensure account details are accurate to avoid delays</li>
                <li>You can update bank details later from your profile</li>
              </ul>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                🔒 <strong>Security:</strong> Your bank details are encrypted
                and stored securely. We never share your information with third
                parties.
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
                {loading ? "Saving..." : "Continue to Contract"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
