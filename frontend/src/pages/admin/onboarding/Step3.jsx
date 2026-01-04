import { useState } from "react";
import { useNavigate } from "react-router-dom";

const SRI_LANKAN_BANKS = [
  "Bank of Ceylon",
  "Commercial Bank of Ceylon",
  "Sampath Bank",
  "DFCC Bank",
  "Seylan Bank",
  "Nations Trust Bank",
  "Pan Asia Bank",
  "Hatton National Bank",
  "Indian Bank",
  "Sri Lanka Savings Bank",
  "Axis Bank",
  "ICICI Bank",
  "HSBC Bank",
  "Citibank",
  "Standard Chartered Bank",
  "Amana Bank",
  "Warehouse Finance Company",
  "ACME Capital",
  "People's Bank",
  "Cooperative Rural Bank",
];

export default function AdminOnboardingStep3() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const [form, setForm] = useState({
    accountHolderName: "",
    bankName: "",
    branch: "",
    accountNumber: "",
    accountNumberConfirm: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validate all required fields
    if (!form.accountHolderName || !form.bankName || !form.accountNumber) {
      setError("All fields are required");
      return;
    }

    // Validate account numbers match
    if (form.accountNumber !== form.accountNumberConfirm) {
      setError("Account numbers do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        "http://localhost:5000/restaurant-onboarding/step-3",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            accountHolderName: form.accountHolderName,
            bankName: form.bankName,
            branch: form.branch,
            accountNumber: form.accountNumber,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || "Failed to save bank details");
        return;
      }
      navigate("/admin/restaurant/onboarding/step-4");
    } catch (err) {
      console.error("Step3 submit error", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow p-6">
        <h1 className="text-2xl font-semibold text-gray-800 mb-4">
          Step 3: Bank Details
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Payments will be routed to this account.
        </p>
        <form
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
          onSubmit={handleSubmit}
        >
          <input
            className="border rounded-lg p-3"
            placeholder="Account Holder Name"
            value={form.accountHolderName}
            onChange={(e) => updateField("accountHolderName", e.target.value)}
            required
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Bank Name <span className="text-red-600">*</span>
            </label>
            <select
              className="w-full border rounded-lg p-3"
              value={form.bankName}
              onChange={(e) => updateField("bankName", e.target.value)}
              required
            >
              <option value="">-- Select Bank --</option>
              {SRI_LANKAN_BANKS.map((bank) => (
                <option key={bank} value={bank}>
                  {bank}
                </option>
              ))}
            </select>
          </div>
          <input
            className="border rounded-lg p-3"
            placeholder="Branch (optional)"
            value={form.branch}
            onChange={(e) => updateField("branch", e.target.value)}
          />
          <input
            className="border rounded-lg p-3"
            placeholder="Account Number"
            value={form.accountNumber}
            onChange={(e) => updateField("accountNumber", e.target.value)}
            required
          />
          <input
            className="border rounded-lg p-3"
            placeholder="Confirm Account Number"
            value={form.accountNumberConfirm}
            onChange={(e) =>
              updateField("accountNumberConfirm", e.target.value)
            }
            required
          />

          {/* Error Display */}
          {error && (
            <div className="md:col-span-2 bg-red-50 border border-red-300 text-red-700 p-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="md:col-span-2 flex justify-end gap-3 mt-2">
            <button
              type="button"
              className="px-5 py-3 bg-gray-200 text-gray-800 rounded-lg"
              onClick={() => navigate("/admin/restaurant/onboarding/step-2")}
            >
              Back
            </button>
            <button
              type="submit"
              className="px-5 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              disabled={loading}
            >
              {loading ? "Saving..." : "Save & Continue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
