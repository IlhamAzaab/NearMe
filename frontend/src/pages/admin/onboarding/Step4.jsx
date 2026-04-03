import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AnimatedAlert, { useAlert } from "../../../components/AnimatedAlert";
import { API_URL } from "../../../config";
import meezoLogo from "../../../assets/SvgArtboard8.svg";

const CONTRACT_HTML = `
<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <h2>Meezo Restaurant Partner Terms & Conditions (v1.1.0)</h2>
  
  <h3>1. Partnership Agreement</h3>
  <p>By accepting these terms, you agree to become an authorized Meezo restaurant partner. Your restaurant will be listed on the Meezo platform and made available to customers for food delivery and pickup services.</p>
  
  <h3>2. Daily Settlement Schedule</h3>
  <p>Meezo will process settlement of each day's completed sales at daily midnight. If settlement is not reflected by 2:00 AM local time, you may contact the assigned manager directly at 0759587979 for escalation and support.</p>
  
  <h3>3. Halal Compliance</h3>
  <p>All food sold through Meezo must comply with halal requirements. You are solely responsible for obtaining, maintaining, and presenting a valid halal certificate and for any legal, regulatory, or customer consequences arising from non-compliance.</p>
  
  <h3>4. Order Preparation and Handover Priority</h3>
  <p>Once an order is accepted, your kitchen must start preparing it immediately in the live queue sequence. For example, if two in-store manual orders are already waiting, an accepted Meezo order must be treated as the third order in sequence and must not be skipped ahead or delayed behind later walk-in orders.</p>
  <p>When a Meezo delivery partner arrives for pickup, handover must be done at a separate designated pickup point. Delivery partners must not be required to wait in the in-store customer queue.</p>
  
  <h3>5. Earnings Recognition Point</h3>
  <p>The order earning is considered payable to the restaurant once the assigned delivery partner successfully picks up the order from your premises.</p>
  
  <h3>6. Bank Account and Payout Responsibility</h3>
  <p>You authorize Meezo to route all payouts to the bank account provided during onboarding. You are responsible for ensuring that bank details remain accurate and updated. Meezo is not liable for payout delays or failures caused by incorrect bank information submitted by the restaurant.</p>
  
  <h3>7. Accuracy of Information</h3>
  <p>You confirm that all submitted information, including restaurant details, owner information, bank account details, and KYC documents, is accurate and authentic. Any false, expired, or misleading information may result in suspension or account termination.</p>
  
  <h3>8. Account Verification</h3>
  <p>Your account remains in pending status until a Meezo manager reviews and verifies all submitted documents and information. Standard verification timelines are typically 2-5 business days, subject to document quality and regional review load.</p>
  
  <h3>9. Data and Privacy</h3>
  <p>Meezo may collect and store data related to your account, transactions, and customer interactions. Such data is handled according to Meezo privacy and security policies and applicable laws.</p>
  
  <h3>10. Suspension and Termination</h3>
  <p>Meezo may suspend or terminate partner access for material breach of these terms, fraudulent behavior, repeated service failures, or legal non-compliance. Suspended accounts may be restricted from receiving new orders and payouts until resolution.</p>

  <h3>11. Platform Commission</h3>
  <p>Meezo may apply a commission margin within a range of 8% to 15% (default 10%), based on city-level and country-level operating conditions unless otherwise notified in writing. This commission will not be deducted from your restaurant sales settlement. The commission is charged externally to the customer as a platform service charge.</p>
  
  <h3>12. Governing Law</h3>
  <p>These terms are governed by the laws of Sri Lanka and you agree to resolve disputes through appropriate legal channels.</p>
  
  <p style="margin-top: 20px; font-weight: bold;">Last Updated: April 2026</p>
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
      const res = await fetch(`${API_URL}/restaurant-onboarding/step-4`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          contractAccepted: true,
          contractVersion: "1.1.0",
          ipAddress: ipAddress || null,
          userAgent: navigator.userAgent,
          contractHtml: CONTRACT_HTML,
        }),
      });
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-500 via-green-600 to-green-700 p-2 md:p-3 overflow-hidden relative">
      <AnimatedAlert alert={alertState} visible={alertVisible} />
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Floating circles */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-gradient-to-r from-green-400/30 to-green-500/30 floating animate-pulse-slow"></div>
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full bg-gradient-to-r from-green-300/25 to-green-400/25 floating animate-pulse-slower"></div>
        <div className="absolute top-1/3 right-1/3 w-48 h-48 rounded-full bg-gradient-to-r from-green-200/20 to-green-300/20 floating animate-pulse-slow"></div>
        <div className="absolute top-1/2 left-1/2 w-40 h-40 rounded-full bg-gradient-to-r from-green-300/25 to-green-300/25 animate-ping-slow"></div>

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
              className="absolute h-px bg-gradient-to-r from-transparent via-green-400/20 to-transparent animate-slide-diagonal"
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

      <div className="max-w-5xl w-full mx-auto bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-5 md:p-6 relative z-10">
        {/* Meezo full logo */}
        <div className="flex justify-center mb-4">
          <img
            src={meezoLogo}
            alt="Meezo"
            className="w-44 md:w-56 h-auto drop-shadow-md meezo-logo-animated"
          />
        </div>

        <h1 className="text-3xl font-bold text-center mb-2 bg-gradient-to-r from-green-600 to-green-600 bg-clip-text text-transparent">
          Step 4: Contract Acceptance
        </h1>
        <p className="text-center text-gray-600 mb-4">
          Review and accept the partner terms to finish onboarding.
        </p>

        {/* Progress Bar */}
        <StepProgress currentStep={4} totalSteps={5} />

        {/* Contract Content */}
        <div
          className="border-2 border-gray-200 rounded-xl p-4 md:p-5 bg-gradient-to-r from-green-50 to-green-100 text-sm text-gray-700 space-y-3 max-h-96 overflow-y-auto mb-4 shadow-inner"
          dangerouslySetInnerHTML={{ __html: CONTRACT_HTML }}
        />

        <form className="mt-2 space-y-3" onSubmit={handleSubmit}>
          <label className="flex items-center gap-3 text-sm text-gray-800 bg-gradient-to-r from-green-50 to-green-100 p-4 rounded-xl border-2 border-green-200 cursor-pointer hover:border-green-500 transition-all">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="w-5 h-5 text-green-500 rounded focus:ring-green-500 cursor-pointer"
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

          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              className="px-6 py-3 bg-gray-200 text-gray-800 rounded-full hover:bg-gray-300 transition-all shadow-md hover:shadow-lg"
              onClick={() => navigate("/admin/restaurant/onboarding/step-3")}
            >
              Back
            </button>
            <button
              type="submit"
              className="px-6 py-3 bg-gradient-to-r from-green-500 to-green-500 text-white rounded-full hover:from-green-600 hover:to-green-600 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
        @keyframes meezoLogoFloat {
          0% {
            transform: translateY(0px) scale(1);
          }
          50% {
            transform: translateY(-6px) scale(1.02);
          }
          100% {
            transform: translateY(0px) scale(1);
          }
        }

        .meezo-logo-animated {
          animation: meezoLogoFloat 5.5s ease-in-out infinite;
          transform-origin: center;
        }

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
