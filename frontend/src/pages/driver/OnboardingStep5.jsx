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

export default function OnboardingStep5() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [contractAccepted, setContractAccepted] = useState(false);
  const [confirmRead, setConfirmRead] = useState(false);

  const contractVersion = "1.0.0";

  const contractHtml = `
    <h2>Driver Partnership Agreement</h2>
    <p><strong>Version ${contractVersion}</strong> - Effective Date: ${new Date().toLocaleDateString()}</p>
    
    <h3>1. Introduction</h3>
    <p>This Driver Partnership Agreement ("Agreement") is entered into between NearMe Platform ("Company") and you ("Driver"). By accepting this agreement, you agree to provide transportation services through the NearMe platform.</p>
    
    <h3>2. Driver Requirements</h3>
    <ul>
      <li>Must be at least 21 years of age</li>
      <li>Possess a valid Sri Lankan driving license</li>
      <li>Maintain valid vehicle insurance and revenue license</li>
      <li>Vehicle must pass safety and quality standards</li>
      <li>Must pass background verification checks</li>
    </ul>
    
    <h3>3. Driver Responsibilities</h3>
    <ul>
      <li>Provide safe, courteous, and professional transportation services</li>
      <li>Maintain vehicle in good working condition</li>
      <li>Comply with all traffic laws and regulations</li>
      <li>Keep all documents valid and up to date</li>
      <li>Accept ride requests within reasonable timeframes</li>
      <li>Treat passengers with respect and professionalism</li>
      <li>Report any incidents or accidents immediately</li>
    </ul>
    
    <h3>4. Payment Terms</h3>
    <ul>
      <li>Company will collect payment from passengers on behalf of Driver</li>
      <li>Driver will receive weekly payment transfers to registered bank account</li>
      <li>Platform commission: 15% of total fare</li>
      <li>Driver receives 85% of total fare after commission</li>
      <li>Payment processing time: 2-3 business days</li>
      <li>Minimum payout threshold: LKR 1,000</li>
    </ul>
    
    <h3>5. Insurance and Liability</h3>
    <ul>
      <li>Driver must maintain comprehensive vehicle insurance</li>
      <li>Driver is responsible for any damages or injuries during service</li>
      <li>Company is not liable for accidents during transportation</li>
      <li>Driver must report all incidents within 24 hours</li>
    </ul>
    
    <h3>6. Data and Privacy</h3>
    <ul>
      <li>Company will collect and store Driver's personal and vehicle information</li>
      <li>Data will be used for verification, payment, and service improvement</li>
      <li>Driver information will not be shared with third parties without consent</li>
      <li>Passenger data must be kept confidential</li>
    </ul>
    
    <h3>7. Account Suspension and Termination</h3>
    <ul>
      <li>Company may suspend account for policy violations</li>
      <li>Repeated customer complaints may lead to deactivation</li>
      <li>Either party may terminate with 7 days notice</li>
      <li>Fraudulent activity results in immediate termination</li>
      <li>Outstanding payments will be settled within 30 days of termination</li>
    </ul>
    
    <h3>8. Quality Standards</h3>
    <ul>
      <li>Maintain minimum 4.0 star rating</li>
      <li>Accept at least 80% of ride requests</li>
      <li>Complete rides without cancellations</li>
      <li>Vehicle must be clean and presentable</li>
      <li>Driver must dress professionally</li>
    </ul>
    
    <h3>9. Code of Conduct</h3>
    <ul>
      <li>No discrimination based on race, religion, gender, or disability</li>
      <li>No harassment or inappropriate behavior</li>
      <li>No unauthorized use of passenger information</li>
      <li>No driving under influence of alcohol or drugs</li>
      <li>No smoking in vehicle during service</li>
    </ul>
    
    <h3>10. Dispute Resolution</h3>
    <ul>
      <li>Any disputes will first be resolved through mediation</li>
      <li>Unresolved disputes will be handled under Sri Lankan law</li>
      <li>Jurisdiction: Courts of Colombo, Sri Lanka</li>
    </ul>
    
    <h3>11. Updates to Agreement</h3>
    <p>Company reserves the right to update this agreement. Drivers will be notified of changes 30 days in advance. Continued use of the platform constitutes acceptance of updated terms.</p>
    
    <h3>12. Contact Information</h3>
    <p>For questions or concerns about this agreement:<br/>
    Email: support@nearme.lk<br/>
    Phone: +94 11 234 5678<br/>
    Address: 123 Main Street, Colombo 00100, Sri Lanka</p>
  `;

  const submitMutation = useMutation({
    mutationFn: async ({ contractAcceptedValue, confirmReadValue }) => {
      if (!contractAcceptedValue || !confirmReadValue) {
        throw new Error(
          "You must accept the contract and confirm you have read all terms",
        );
      }

      const token = localStorage.getItem("token");
      const ipResponse = await fetch("https://api.ipify.org?format=json").catch(
        () => ({
          json: () => ({ ip: "0.0.0.0" }),
        }),
      );
      const ipData = await ipResponse.json();

      const res = await fetch(`${API_URL}/onboarding/step-5`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          contractAccepted: true,
          contractVersion,
          ipAddress: ipData.ip,
          userAgent: navigator.userAgent,
          contractHtml,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to complete onboarding");
      }

      return data;
    },
    onSuccess: () => {
      navigate("/driver/pending");
    },
    onError: (err) => {
      setError(err.message || "Network error. Please try again.");
    },
  });

  const loading = submitMutation.isPending;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    await submitMutation.mutateAsync({
      contractAcceptedValue: contractAccepted,
      confirmReadValue: confirmRead,
    });
  };

  const handleBack = () => {
    navigate("/driver/onboarding/step-4");
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
      <div className="relative w-full max-w-[600px] px-4 py-8 z-10">
        {/* White card */}
        <div className="bg-white rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] p-8">
          {/* Step Progress */}
          <StepProgress currentStep={5} />

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-12 w-12 bg-[#dcfce7] rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-[#1db95b] text-2xl">
                description
              </span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Partnership Agreement
              </h1>
              <p className="text-gray-500 text-sm">Step 5 of 5 - Final Step</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Scrollable Contract */}
            <div className="border border-gray-200 rounded-xl p-5 h-72 overflow-y-auto bg-gray-50">
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: contractHtml }}
                style={{
                  fontSize: "0.8rem",
                  lineHeight: "1.6",
                }}
              />
            </div>

            {/* Acceptance Checkboxes */}
            <div className="space-y-3 p-4 bg-[#fefce8] border border-[#fef08a] rounded-xl">
              <div className="flex items-start">
                <input
                  type="checkbox"
                  id="confirmRead"
                  checked={confirmRead}
                  onChange={(e) => setConfirmRead(e.target.checked)}
                  className="mt-1 mr-3 h-5 w-5 text-[#1db95b] focus:ring-[#1db95b] border-gray-300 rounded cursor-pointer accent-[#1db95b]"
                />
                <label
                  htmlFor="confirmRead"
                  className="text-sm text-[#854d0e] cursor-pointer"
                >
                  I confirm that I have read and understood all terms and
                  conditions of this Driver Partnership Agreement
                </label>
              </div>

              <div className="flex items-start">
                <input
                  type="checkbox"
                  id="contractAccepted"
                  checked={contractAccepted}
                  onChange={(e) => setContractAccepted(e.target.checked)}
                  className="mt-1 mr-3 h-5 w-5 text-[#1db95b] focus:ring-[#1db95b] border-gray-300 rounded cursor-pointer accent-[#1db95b]"
                />
                <label
                  htmlFor="contractAccepted"
                  className="text-sm text-[#854d0e] cursor-pointer"
                >
                  I accept and agree to be bound by the terms of this agreement.
                  I understand that this is a legally binding contract.
                </label>
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

            {/* Legal Notice */}
            <div className="p-4 bg-[#dcfce7] border border-[#86efac] rounded-xl">
              <p className="text-sm font-semibold text-[#166534] mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">gavel</span>
                Legal Notice
              </p>
              <ul className="text-sm text-[#166534] space-y-1 ml-6 list-disc">
                <li>
                  Your acceptance will be recorded with timestamp and IP address
                </li>
                <li>
                  This is a legally binding agreement under Sri Lankan law
                </li>
                <li>Contract version: {contractVersion}</li>
              </ul>
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
                disabled={loading || !contractAccepted || !confirmRead}
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
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined">
                      check_circle
                    </span>
                    <span>Complete Onboarding</span>
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
