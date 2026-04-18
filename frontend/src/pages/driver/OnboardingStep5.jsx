import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import { API_URL } from "../../config";
import OnboardingStepProgress from "../../components/driver/OnboardingStepProgress";
import meezoLogo from "../../assets/NearMeLogoArtboard5.svg";

export default function OnboardingStep5() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [contractAccepted, setContractAccepted] = useState(false);

  const contractVersion = "1.0.0";

  const contractHtml = `
    <h2>Meezo Delivery Partner Terms and Conditions</h2>
    <p><strong>Version ${contractVersion}</strong> - Effective Date: ${new Date().toLocaleDateString()}</p>

    <h3>1. Service Scope</h3>
    <p>This agreement is between Meezo Platform ("Manager") and you ("Delivery Partner"). Meezo is a food delivery service platform. By accepting these terms, you agree to provide food pickup and delivery services through Meezo.</p>

    <h3>2. Pickup Distance and Earnings (Partner to Restaurant)</h3>
    <ul>
      <li>You will receive upto LKR 30 for travel from your location to the restaurant, up to 1 km.</li>
      <li>If this pickup distance exceeds 1 km, no additional pickup earning is paid for the excess distance.</li>
      <li>You can accept such orders if you want.</li>
    </ul>

    <h3>3. Delivery Distance Earnings (Restaurant to Customer)</h3>
    <ul>
      <li>You will receive full earnings based on total delivery distance from restaurant to customer.</li>
      <li>Meezo pays LKR 35-50 per km depending on operating conditions; default base rate is LKR 40 per km.</li>
    </ul>

    <h3>4. Multi-Order Trip Bonuses</h3>
    <ul>
      <li>Meezo will pay a bonus for you when accepting additional deliveries in the same trip.</li>
      <li>Second accepted delivery bonus: LKR 10-20.</li>
      <li>Third and more accepted deliveries bonus: LKR 15-30 each.</li>
      <li>You can accept up to 5 active deliveries in one trip.</li>
    </ul>

    <h3>5. Active Delivery Commitment</h3>
    <ul>
      <li>Once you start delivering food to customers, you must complete all active deliveries in that trip.</li>
      <li>New order notifications are sent after all active deliveries are completed.</li>
    </ul>

    <h3>6. Order Collection and Responsibility</h3>
    <ul>
      <li>At the restaurant, request each order using the order number shown in the app.</li>
      <li>You must verify all listed food items are packed correctly before pickup.</li>
      <li>After pickup, you are responsible for the order and associated cash-handling obligations.</li>
    </ul>

    <h3>7. Cash on Delivery and Settlement Rules</h3>
    <ul>
      <li>All payments are handled as Cash on Delivery (COD).</li>
      <li>You must collect the exact payable amount from the customer as shown in the delivery page .</li>
      <li>You must settle the full collected amount to Meezo daily, either by bank transfer or direct payment to a manager.</li>
      <li>Daily settlement must be completed before 12:00 AM (midnight).</li>
    </ul>

    <h3>8. Tips and Priority Orders</h3>
    <ul>
      <li>Platform tip amounts may be added to delivery details based on order conditions.</li>
      <li>If a tip appears in the delivery details, the order should be treated as priority.</li>
      <li>You may also receive additional direct tips from customers.</li>
      <li>Platform tip range is LKR 20-200, including weight-based allocations where applicable.</li>
    </ul>

    <h3>9. Fair Earnings for Extra Active Deliveries</h3>
    <ul>
      <li>For extra active deliveries in the same trip, base delivery earnings will pay based on the additional travel-time factors to maintain fairness.</li>
    </ul>

    <h3>10. Restaurant Queue Priority</h3>
    <ul>
      <li>Delivery partners are assigned a dedicated service queue and are not required to wait in the regular customer queue.</li>
    </ul>

    <h3>11. Compliance and Conduct</h3>
    <ul>
      <li>You must follow applicable traffic, safety, and platform rules while delivering.</li>
      <li>Repeated violations, settlement delays, misconduct, or fraudulent behavior may result in account suspension or termination.</li>
    </ul>

    <h3>12. Updates to Terms</h3>
    <p>Meezo may update these terms when required for operations, legal compliance, or safety. Continued use of the platform after updates constitutes acceptance of revised terms.</p>

    <h3>13. Acceptance</h3>
    <p>By selecting the acceptance option below, you confirm that you have read, understood, and accepted these Meezo Delivery Partner Terms and Conditions.</p>
  `;

  const sanitizedContractHtml = useMemo(
    () => DOMPurify.sanitize(contractHtml),
    [contractHtml],
  );

  const submitMutation = useMutation({
    mutationFn: async ({ contractAcceptedValue }) => {
      if (!contractAcceptedValue) {
        throw new Error("Please read and accept the terms and conditions");
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
    });
  };

  const handleBack = () => {
    navigate("/driver/onboarding/step-4");
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
      <div className="relative w-full max-w-150 px-4 py-8 z-10">
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
          <OnboardingStepProgress currentStep={5} />

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-12 w-12 bg-[#dcfce7] rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-[#1db95b] text-2xl">
                description
              </span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Delivery Partner Contract
              </h1>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Scrollable Contract */}
            <div className="border border-gray-200 rounded-xl p-5 h-72 overflow-y-auto bg-gray-50">
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizedContractHtml }}
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
                  id="contractAccepted"
                  checked={contractAccepted}
                  onChange={(e) => setContractAccepted(e.target.checked)}
                  className="mt-1 mr-3 h-5 w-5 text-[#1db95b] focus:ring-[#1db95b] border-gray-300 rounded cursor-pointer accent-[#1db95b]"
                />
                <label
                  htmlFor="contractAccepted"
                  className="text-sm text-[#854d0e] cursor-pointer"
                >
                  I have read, understood, and accept Meezo Delivery Partner
                  Terms and Conditions.
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
                <li>Contract version: {contractVersion}</li>
              </ul>
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
                disabled={loading || !contractAccepted}
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
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined">
                      check_circle
                    </span>
                    <span>Complete </span>
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
