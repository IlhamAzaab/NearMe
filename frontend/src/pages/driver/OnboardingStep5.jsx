import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SiteHeader from "../../components/SiteHeader";

export default function OnboardingStep5() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [contractAccepted, setContractAccepted] = useState(false);
  const [confirmRead, setConfirmRead] = useState(false);

  const userEmail = localStorage.getItem("userEmail");
  const userName =
    localStorage.getItem("userName") || userEmail?.split("@")[0] || "Driver";
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!contractAccepted || !confirmRead) {
      setError(
        "You must accept the contract and confirm you have read all terms"
      );
      return;
    }

    setLoading(true);

    const token = localStorage.getItem("token");

    try {
      // Get IP address (in production, use a proper IP service)
      const ipResponse = await fetch("https://api.ipify.org?format=json").catch(
        () => ({
          json: () => ({ ip: "0.0.0.0" }),
        })
      );
      const ipData = await ipResponse.json();

      const res = await fetch("http://localhost:5000/onboarding/step-5", {
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

      if (res.ok) {
        navigate("/driver/pending");
      } else {
        setError(data.message || "Failed to complete onboarding");
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
    navigate("/driver/onboarding/step-4");
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

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-indigo-600">
              Step 5 of 5
            </span>
            <span className="text-sm text-gray-500">Contract Agreement</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full"
              style={{ width: "100%" }}
            ></div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Driver Partnership Agreement
          </h1>
          <p className="text-gray-600 mb-6">
            Please read the entire agreement carefully before accepting.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Scrollable Contract */}
            <div className="border border-gray-300 rounded-lg p-6 h-96 overflow-y-auto bg-gray-50">
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: contractHtml }}
                style={{
                  fontSize: "0.875rem",
                  lineHeight: "1.5",
                }}
              />
            </div>

            {/* Acceptance Checkboxes */}
            <div className="space-y-3 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start">
                <input
                  type="checkbox"
                  id="confirmRead"
                  checked={confirmRead}
                  onChange={(e) => setConfirmRead(e.target.checked)}
                  className="mt-1 mr-3 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <label
                  htmlFor="confirmRead"
                  className="text-sm text-gray-700 cursor-pointer"
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
                  className="mt-1 mr-3 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <label
                  htmlFor="contractAccepted"
                  className="text-sm text-gray-700 cursor-pointer"
                >
                  I accept and agree to be bound by the terms of this agreement.
                  I understand that this is a legally binding contract.
                </label>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800 font-semibold mb-2">
                📝 Legal Notice:
              </p>
              <ul className="text-sm text-blue-700 space-y-1 ml-4 list-disc">
                <li>
                  Your acceptance will be recorded with timestamp and IP address
                </li>
                <li>
                  This is a legally binding agreement under Sri Lankan law
                </li>
                <li>
                  You can download a copy of this agreement from your profile
                </li>
                <li>Contract version: {contractVersion}</li>
              </ul>
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
                disabled={loading || !contractAccepted || !confirmRead}
                className="flex-1 px-4 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                {loading ? "Submitting..." : "Accept & Complete Onboarding"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
