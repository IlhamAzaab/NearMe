import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AnimatedAlert, { useAlert } from "../../../components/AnimatedAlert";

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

// Step Progress Bar Component
function StepProgress({ currentStep, totalSteps }) {
  return (
    <div className="w-full mb-8">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700">
          Step {currentStep} of {totalSteps}
        </span>
        <span className="text-sm font-medium text-green-600">
          {Math.round((currentStep / totalSteps) * 100)}% Complete
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className="bg-gradient-to-r from-green-500 to-green-600 h-2.5 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${(currentStep / totalSteps) * 100}%` }}
        ></div>
      </div>
      <div className="flex justify-between mt-3">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div key={i} className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                i + 1 < currentStep
                  ? "bg-green-500 text-white"
                  : i + 1 === currentStep
                    ? "bg-green-600 text-white ring-4 ring-green-200"
                    : "bg-gray-300 text-gray-600"
              }`}
            >
              {i + 1 < currentStep ? (
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span className="text-xs mt-1 text-gray-600 hidden sm:block">
              {["Personal", "Restaurant", "Bank", "Contract", "Review"][i]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminOnboardingStep3() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  // Animation for floating elements
  useEffect(() => {
    const interval = setInterval(() => {
      const elements = document.querySelectorAll(".floating");
      elements.forEach((el) => {
        el.style.transform = `translateY(${Math.sin(Date.now() / 1000 + Array.from(elements).indexOf(el)) * 5}px)`;
      });
    }, 50);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest(".bank-dropdown-container")) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [form, setForm] = useState({
    accountHolderName: "",
    bankName: "",
    branch: "",
    accountNumber: "",
    accountNumberConfirm: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setRawError] = useState(null);
  const { alert: alertState, visible: alertVisible, showError } = useAlert();
  const setError = (msg) => {
    setRawError(msg);
    if (msg) showError(msg);
  };
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredBanks, setFilteredBanks] = useState(SRI_LANKAN_BANKS);

  // Filter banks based on search term
  useEffect(() => {
    if (searchTerm) {
      const filtered = SRI_LANKAN_BANKS.filter((bank) =>
        bank.toLowerCase().includes(searchTerm.toLowerCase()),
      );
      setFilteredBanks(filtered);
    } else {
      setFilteredBanks(SRI_LANKAN_BANKS);
    }
  }, [searchTerm]);

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
        },
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-500 via-green-600 to-green-700 p-4 overflow-hidden relative">
      <AnimatedAlert alert={alertState} visible={alertVisible} />
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Floating circles */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-gradient-to-r from-green-400/30 to-green-500/30 floating animate-pulse-slow"></div>
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full bg-gradient-to-r from-green-300/25 to-green-400/25 floating animate-pulse-slower"></div>
        <div className="absolute top-1/3 right-1/3 w-48 h-48 rounded-full bg-gradient-to-r from-green-200/20 to-green-300/20 floating animate-pulse-slow"></div>
        <div className="absolute top-1/2 left-1/2 w-40 h-40 rounded-full bg-gradient-to-r from-lime-300/25 to-green-300/25 animate-ping-slow"></div>

        {/* Vertical animated bars */}
        <div className="absolute inset-0">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 bg-gradient-to-b from-transparent via-white/25 to-transparent animate-slide-down"
              style={{
                left: `${i * 10}%`,
                height: "100%",
                animationDelay: `${i * 0.3}s`,
                animationDuration: `${3 + i * 0.2}s`,
              }}
            ></div>
          ))}
        </div>

        {/* Diagonal lines */}
        <div className="absolute inset-0">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="absolute h-px bg-gradient-to-r from-transparent via-lime-400/20 to-transparent animate-slide-diagonal"
              style={{
                top: `${i * 20}%`,
                width: "200%",
                animationDelay: `${i * 0.5}s`,
              }}
            ></div>
          ))}
        </div>

        {/* Speed lines animation */}
        <div className="absolute inset-0">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute h-1 bg-gradient-to-r from-transparent via-white/30 to-transparent"
              style={{
                top: `${i * 12.5}%`,
                width: "200%",
                animation: `speedLine ${2 + i * 0.3}s linear infinite`,
                animationDelay: `${i * 0.2}s`,
                transform: `translateX(-100%)`,
              }}
            ></div>
          ))}
        </div>
      </div>

      <div className="max-w-3xl w-full mx-auto bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 relative z-10">
        {/* Animated restaurant logo */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="text-6xl animate-bounce text-red-600">
              <svg
                className="w-16 h-16 mx-auto"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8.1 13.34l2.83-2.83L3.91 3.5c-1.56 1.56-1.56 4.09 0 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z" />
              </svg>
            </div>
            <div className="absolute -top-2 -right-2 w-4 h-4 bg-lime-500 rounded-full animate-ping"></div>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-center mb-2 bg-gradient-to-r from-lime-600 to-green-600 bg-clip-text text-transparent">
          Bank Details
        </h1>
        <p className="text-center text-gray-600 mb-6">
          Payments will be routed to this account.
        </p>

        {/* Progress Bar */}
        <StepProgress currentStep={3} totalSteps={5} />

        <form
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
          onSubmit={handleSubmit}
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Account Holder Name
            </label>
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-green-800 via-green-400 to-green-800 animate-border-rotation p-[3px]">
                <div className="h-full w-full bg-white rounded-xl"></div>
              </div>
              <input
                className="relative w-full px-4 py-3 bg-transparent rounded-xl focus:outline-none z-10"
                placeholder="Enter account holder name"
                value={form.accountHolderName}
                onChange={(e) =>
                  updateField("accountHolderName", e.target.value)
                }
                required
              />
            </div>
          </div>
          <div className="bank-dropdown-container">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Bank Name
            </label>
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-green-800 via-green-400 to-green-800 animate-border-rotation p-[3px]">
                <div className="h-full w-full bg-white rounded-xl"></div>
              </div>
              <div className="relative">
                <input
                  type="text"
                  className="relative w-full px-4 py-3 pr-10 bg-transparent rounded-xl focus:outline-none z-10 cursor-pointer text-gray-700 font-medium"
                  placeholder="Search or select your bank..."
                  value={form.bankName || searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    updateField("bankName", "");
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  required
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex items-center pr-4 z-20"
                  onClick={() => setShowDropdown(!showDropdown)}
                >
                  <svg
                    className="w-5 h-5 text-gray-500 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    style={{
                      transform: showDropdown
                        ? "rotate(180deg)"
                        : "rotate(0deg)",
                    }}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
              </div>
              {showDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-green-200 rounded-xl shadow-2xl max-h-64 overflow-y-auto z-50 animate-fadeIn">
                  {filteredBanks.length > 0 ? (
                    filteredBanks.map((bank) => (
                      <div
                        key={bank}
                        className="px-4 py-3 hover:bg-gradient-to-r hover:from-green-50 hover:to-lime-50 cursor-pointer transition-all border-b border-gray-100 last:border-b-0 flex items-center gap-3 group"
                        onClick={() => {
                          updateField("bankName", bank);
                          setSearchTerm("");
                          setShowDropdown(false);
                        }}
                      >
                        <svg
                          className="w-5 h-5 text-green-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                          <path
                            fillRule="evenodd"
                            d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span className="text-gray-800 font-medium">
                          {bank}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-center text-gray-500">
                      <svg
                        className="w-12 h-12 mx-auto mb-2 text-gray-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                      <p>No banks found</p>
                      <p className="text-sm">Try a different search term</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Branch Name
            </label>
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-green-800 via-green-400 to-green-800 animate-border-rotation p-[3px]">
                <div className="h-full w-full bg-white rounded-xl"></div>
              </div>
              <input
                className="relative w-full px-4 py-3 bg-transparent rounded-xl focus:outline-none z-10"
                placeholder="Enter branch name"
                value={form.branch}
                onChange={(e) => updateField("branch", e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Account Number
            </label>
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-green-800 via-green-400 to-green-800 animate-border-rotation p-[3px]">
                <div className="h-full w-full bg-white rounded-xl"></div>
              </div>
              <input
                className="relative w-full px-4 py-3 bg-transparent rounded-xl focus:outline-none z-10"
                placeholder="Enter account number"
                value={form.accountNumber}
                onChange={(e) => updateField("accountNumber", e.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confirm Account Number
            </label>
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-green-800 via-green-400 to-green-800 animate-border-rotation p-[3px]">
                <div className="h-full w-full bg-white rounded-xl"></div>
              </div>
              <input
                className="relative w-full px-4 py-3 bg-transparent rounded-xl focus:outline-none z-10"
                placeholder="Re-enter account number"
                value={form.accountNumberConfirm}
                onChange={(e) =>
                  updateField("accountNumberConfirm", e.target.value)
                }
                required
              />
            </div>
          </div>

          {/* Error Display */}

          <div className="md:col-span-2 flex justify-end gap-3 mt-4">
            <button
              type="button"
              className="px-6 py-3 bg-gray-200 text-gray-800 rounded-xl hover:bg-gray-300 transition-all shadow-md hover:shadow-lg"
              onClick={() => navigate("/admin/restaurant/onboarding/step-2")}
            >
              Back
            </button>
            <button
              type="submit"
              className="px-6 py-3 bg-gradient-to-r from-lime-500 to-green-500 text-white rounded-xl hover:from-lime-600 hover:to-green-600 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              disabled={loading}
            >
              {loading && (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              )}
              {loading ? "Saving..." : "Save & Continue"}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        @keyframes border-rotation {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }

        .animate-border-rotation {
          background-size: 200% 200%;
          animation: border-rotation 3s linear infinite;
        }

        @keyframes speedLine {
          0% {
            transform: translateX(-100%) translateY(0);
          }
          100% {
            transform: translateX(100%) translateY(0);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }

        .animate-spin-slow {
          animation: spin 3s linear infinite;
        }
        .animate-spin-slow-reverse {
          animation: spin 3s linear infinite reverse;
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
