import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AnimatedAlert, { useAlert } from "../../../components/AnimatedAlert";
import { API_URL } from "../../../config";

const CONTRACT_HTML = `
<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <h2>NearMe Restaurant Partner Terms & Conditions (v1.0.0)</h2>
  
  <h3>1. Partnership Agreement</h3>
  <p>By accepting these terms, you agree to become an authorized NearMe restaurant partner. Your restaurant will be listed on the NearMe platform and made available to customers for food delivery and pickup services.</p>
  
  <h3>2. Accuracy of Information</h3>
  <p>You confirm that all submitted information including restaurant details, owner information, bank account details, and KYC documents are accurate and authentic. Any false or misleading information may result in account termination.</p>
  
  <h3>3. Food Safety & Compliance</h3>
  <p>You agree to comply with all local food safety regulations, health codes, and hygiene standards. Your restaurant must maintain valid licenses and permits required by law.</p>
  
  <h3>4. Service Standards</h3>
  <p>You commit to maintaining timely order preparation and delivery standards, accurate menu information, and professional customer service. Failure to maintain service standards may result in warnings or account suspension.</p>
  
  <h3>5. Bank Account & Payments</h3>
  <p>You authorize NearMe to route all payments to the bank account specified in your application. You are responsible for maintaining accurate and updated bank information. Any issues with payouts due to incorrect bank details are your responsibility.</p>
  
  <h3>6. Account Verification</h3>
  <p>Your account will remain in pending status until a NearMe manager reviews and verifies all submitted documents and information. This process typically takes 2-5 business days.</p>
  
  <h3>7. Data & Privacy</h3>
  <p>NearMe may collect and store data related to your account, transactions, and customer interactions. This data will be protected according to our privacy policy and will not be shared with third parties without your consent.</p>
  
  <h3>8. Termination & Suspension</h3>
  <p>NearMe reserves the right to suspend or terminate your account if you violate these terms, engage in fraudulent activity, or fail to maintain service standards. Suspended accounts will not receive orders or payments.</p>
  
  <h3>9. Governing Law</h3>
  <p>These terms are governed by the laws of Sri Lanka and you agree to resolve disputes through appropriate legal channels.</p>
  
  <p style="margin-top: 20px; font-weight: bold;">Last Updated: January 2026</p>
</div>
`;

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

export default function AdminOnboardingStep4() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    alert: alertState,
    visible: alertVisible,
    showSuccess,
    showError,
  } = useAlert();
  const [ipAddress, setIpAddress] = useState(null);

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

  // Fetch IP address on component mount
  useEffect(() => {
    const getIpAddress = async () => {
      try {
        const res = await fetch("https://api.ipify.org?format=json");
        const data = await res.json();
        setIpAddress(data.ip);
      } catch (e) {
        console.error("Failed to fetch IP address:", e);
      }
    };
    getIpAddress();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!accepted) {
      showError("Please accept the contract to continue");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/restaurant-onboarding/step-4`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            contractAccepted: true,
            contractVersion: "1.0.0",
            ipAddress: ipAddress || null,
            userAgent: navigator.userAgent,
            contractHtml: CONTRACT_HTML,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        showError(data?.message || "Failed to submit contract");
        return;
      }
      navigate("/admin/restaurant/pending");
    } catch (err) {
      console.error("Step4 submit error", err);
      showError("Something went wrong. Please try again.");
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
        {/* Animated bike logo */}
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
          Step 4: Contract Acceptance
        </h1>
        <p className="text-center text-gray-600 mb-6">
          Review and accept the partner terms to finish onboarding.
        </p>

        {/* Progress Bar */}
        <StepProgress currentStep={4} totalSteps={5} />

        {/* Contract Content */}
        <div
          className="border-2 border-gray-200 rounded-xl p-6 bg-gradient-to-r from-green-50 to-green-100 text-sm text-gray-700 space-y-3 max-h-96 overflow-y-auto mb-6 shadow-inner"
          dangerouslySetInnerHTML={{ __html: CONTRACT_HTML }}
        />

        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <label className="flex items-center gap-3 text-sm text-gray-800 bg-gradient-to-r from-green-50 to-green-100 p-4 rounded-xl border-2 border-green-200 cursor-pointer hover:border-lime-500 transition-all">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="w-5 h-5 text-lime-500 rounded focus:ring-lime-500 cursor-pointer"
            />
            <span className="font-medium">
              I have read and accept the terms above.
            </span>
          </label>

          {ipAddress && (
            <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-xl border border-gray-200">
              Submission will be recorded with IP:{" "}
              <span className="font-mono font-semibold">{ipAddress}</span>
            </p>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              className="px-6 py-3 bg-gray-200 text-gray-800 rounded-xl hover:bg-gray-300 transition-all shadow-md hover:shadow-lg"
              onClick={() => navigate("/admin/restaurant/onboarding/step-3")}
            >
              Back
            </button>
            <button
              type="submit"
              className="px-6 py-3 bg-gradient-to-r from-lime-500 to-green-500 text-white rounded-xl hover:from-lime-600 hover:to-green-600 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              disabled={loading || !accepted}
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
              {loading ? "Submitting..." : "Accept & Finish"}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        @keyframes speedLine {
          0% {
            transform: translateX(-100%) translateY(0);
          }
          100% {
            transform: translateX(100%) translateY(0);
          }
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
