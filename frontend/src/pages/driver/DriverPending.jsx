import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SiteHeader from "../../components/SiteHeader";
import { API_URL } from "../../config";

export default function DriverPending() {
  const navigate = useNavigate();
  const [driverStatus, setDriverStatus] = useState("pending");
  const [loading, setLoading] = useState(true);

  const userEmail = localStorage.getItem("userEmail");
  const userName =
    localStorage.getItem("userName") || userEmail?.split("@")[0] || "Driver";

  useEffect(() => {
    const checkStatus = async () => {
      const token = localStorage.getItem("token");
      try {
        const res = await fetch(`${API_URL}/onboarding/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        if (res.ok && data.driver) {
          setDriverStatus(data.driver.driver_status);

          // If approved, redirect to dashboard immediately
          if (
            data.driver.driver_status === "active" &&
            data.driver.onboarding_completed
          ) {
            navigate("/driver/dashboard", { replace: true });
            return;
          }

          // If onboarding not complete, redirect back
          if (!data.driver.onboarding_completed) {
            navigate(`/driver/onboarding/step-${data.driver.onboarding_step}`, {
              replace: true,
            });
            return;
          }
        }
      } catch (e) {
        console.error("Status check error:", e);
      } finally {
        setLoading(false);
      }
    };

    checkStatus();

    // Check status every 30 seconds
    const interval = setInterval(checkStatus, 30000);

    return () => clearInterval(interval);
  }, [navigate]);

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  const getStatusInfo = () => {
    switch (driverStatus) {
      case "pending":
        return {
          icon: "⏳",
          title: "Application Under Review",
          message: "Your application is being reviewed by our team",
          color: "yellow",
          details: [
            "Our verification team is reviewing your documents",
            "This process typically takes 24-48 hours",
            "You will receive an email once your account is activated",
            "Make sure to check your spam folder",
          ],
        };
      case "rejected":
        return {
          icon: "❌",
          title: "Application Rejected",
          message: "Unfortunately, your application was not approved",
          color: "red",
          details: [
            "Please check your email for rejection reasons",
            "You can reapply after addressing the issues",
            "Contact support for more information",
          ],
        };
      case "suspended":
        return {
          icon: "⚠️",
          title: "Account Suspended",
          message: "Your driver account has been temporarily suspended",
          color: "red",
          details: [
            "Please contact support for more information",
            "Email: support@nearme.lk",
            "Phone: +94 11 234 5678",
          ],
        };
      default:
        return {
          icon: "⏳",
          title: "Verification Pending",
          message: "Please wait while we process your application",
          color: "yellow",
          details: [],
        };
    }
  };

  const statusInfo = getStatusInfo();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader
        isLoggedIn={true}
        role="driver"
        userName={userName}
        userEmail={userEmail}
        onLogout={handleLogout}
      />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          {/* Status Icon */}
          <div className="text-6xl mb-4">{statusInfo.icon}</div>

          {/* Status Title */}
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            {statusInfo.title}
          </h1>

          {/* Status Message */}
          <p className="text-lg text-gray-600 mb-8">{statusInfo.message}</p>

          {/* Status Details */}
          {statusInfo.details.length > 0 && (
            <div
              className={`bg-${statusInfo.color}-50 border border-${statusInfo.color}-200 rounded-lg p-6 text-left mb-8`}
            >
              <ul className="space-y-2">
                {statusInfo.details.map((detail, index) => (
                  <li
                    key={index}
                    className={`text-${statusInfo.color}-800 flex items-start`}
                  >
                    <span className="mr-2">•</span>
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Progress Timeline (for pending status) */}
          {driverStatus === "pending" && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-700 mb-4">
                Verification Process
              </h2>
              <div className="space-y-3">
                <div className="flex items-center text-left">
                  <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white font-bold mr-3">
                    ✓
                  </div>
                  <div>
                    <p className="font-medium text-gray-800">
                      Application Submitted
                    </p>
                    <p className="text-sm text-gray-500">
                      Your onboarding is complete
                    </p>
                  </div>
                </div>
                <div className="flex items-center text-left">
                  <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-white font-bold mr-3 animate-pulse">
                    2
                  </div>
                  <div>
                    <p className="font-medium text-gray-800">
                      Document Verification
                    </p>
                    <p className="text-sm text-gray-500">
                      Checking all submitted documents
                    </p>
                  </div>
                </div>
                <div className="flex items-center text-left">
                  <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-white font-bold mr-3">
                    3
                  </div>
                  <div>
                    <p className="font-medium text-gray-400">
                      Background Check
                    </p>
                    <p className="text-sm text-gray-400">
                      Pending document approval
                    </p>
                  </div>
                </div>
                <div className="flex items-center text-left">
                  <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-white font-bold mr-3">
                    4
                  </div>
                  <div>
                    <p className="font-medium text-gray-400">Final Approval</p>
                    <p className="text-sm text-gray-400">Account activation</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Contact Support */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-700 font-semibold mb-2">
              Need Help?
            </p>
            <p className="text-sm text-gray-600 mb-2">
              Contact our support team for assistance:
            </p>
            <div className="text-sm text-gray-700 space-y-1">
              <p>📧 Email: support@nearme.lk</p>
              <p>📞 Phone: +94 11 234 5678</p>
              <p>⏰ Hours: Monday-Friday, 9 AM - 6 PM</p>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            {driverStatus === "pending" && (
              <button
                onClick={() => window.location.reload()}
                className="w-full px-4 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition"
              >
                Refresh Status
              </button>
            )}

            {driverStatus === "rejected" && (
              <button
                onClick={() => navigate("/driver/onboarding/step-1")}
                className="w-full px-4 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition"
              >
                Update Application
              </button>
            )}

            <button
              onClick={handleLogout}
              className="w-full px-4 py-3 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>Application ID: {localStorage.getItem("userId")}</p>
          <p className="mt-1">Save this ID for reference</p>
        </div>
      </main>
    </div>
  );
}
