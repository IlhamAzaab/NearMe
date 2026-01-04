import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

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

export default function AdminOnboardingStep4() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ipAddress, setIpAddress] = useState(null);

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
      alert("Please accept the contract to continue");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        "http://localhost:5000/restaurant-onboarding/step-4",
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
        }
      );
      const data = await res.json();
      if (!res.ok) {
        alert(data?.message || "Failed to submit contract");
        return;
      }
      navigate("/admin/restaurant/pending");
    } catch (err) {
      console.error("Step4 submit error", err);
      alert("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow p-6">
        <h1 className="text-2xl font-semibold text-gray-800 mb-4">
          Step 4: Contract Acceptance
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Review and accept the partner terms to finish onboarding.
        </p>

        {/* Contract Content */}
        <div
          className="border rounded-lg p-6 bg-gray-50 text-sm text-gray-700 space-y-3 max-h-96 overflow-y-auto mb-6"
          dangerouslySetInnerHTML={{ __html: CONTRACT_HTML }}
        />

        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <label className="flex items-center gap-2 text-sm text-gray-800">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            I have read and accept the terms above.
          </label>

          {ipAddress && (
            <p className="text-xs text-gray-500">
              Submission will be recorded with IP: {ipAddress}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="px-5 py-3 bg-gray-200 text-gray-800 rounded-lg"
              onClick={() => navigate("/admin/restaurant/onboarding/step-3")}
            >
              Back
            </button>
            <button
              type="submit"
              className="px-5 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              disabled={loading || !accepted}
            >
              {loading ? "Submitting..." : "Accept & Finish"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
