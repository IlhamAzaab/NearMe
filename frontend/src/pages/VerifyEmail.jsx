import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";

function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("verifying"); // verifying, success, error
  const [message, setMessage] = useState("Verifying your email...");

  useEffect(() => {
    const verifyEmail = async () => {
      try {
        console.log("=== EMAIL VERIFICATION PAGE LOADED ===");
        console.log("Full URL:", window.location.href);
        console.log("Search params:", window.location.search);
        console.log("Hash:", window.location.hash);

        // Get access_token and refresh_token from URL hash (Supabase redirects with tokens in hash)
        const hashParams = new URLSearchParams(
          window.location.hash.substring(1)
        );
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const error = hashParams.get("error");
        const errorDescription = hashParams.get("error_description");

        console.log("Access Token:", accessToken ? "Present" : "Missing");
        console.log("Refresh Token:", refreshToken ? "Present" : "Missing");
        console.log("Error:", error);
        console.log("Error Description:", errorDescription);

        // Check for errors in the URL
        if (error) {
          setStatus("error");
          setMessage(
            errorDescription ||
              "Verification failed. The link may have expired."
          );
          return;
        }

        // Check if we have the access token
        if (accessToken) {
          console.log("✅ Access token found - verifying with backend...");

          // Email verification successful - verify token with backend
          const response = await fetch(
            "http://localhost:5000/auth/verify-token",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ token: accessToken }),
            }
          );

          const data = await response.json();
          console.log("Backend verification response:", data);

          if (response.ok && data.userId) {
            console.log("✅ Email verified successfully!");
            setStatus("success");
            setMessage("Email verified successfully!");

            // Redirect to complete profile after 2 seconds
            setTimeout(() => {
              navigate(`/auth/complete-profile?userId=${data.userId}`);
            }, 2000);
          } else {
            console.error("❌ Backend verification failed:", data);
            setStatus("error");
            setMessage(
              data.message || "Failed to verify email. Please try again."
            );
          }
        } else {
          console.error("❌ No access token in URL hash");
          setStatus("error");
          setMessage(
            "Invalid verification link. Please check your email and try again."
          );
        }
      } catch (error) {
        console.error("❌ Verification error:", error);
        setStatus("error");
        setMessage("An error occurred during verification. Please try again.");
      }
    };

    verifyEmail();
  }, [searchParams, navigate]);

  return (
    <>
      <SiteHeader />
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          {status === "verifying" && (
            <>
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-orange-500 mx-auto mb-4"></div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                Verifying Email
              </h2>
              <p className="text-gray-600">{message}</p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                Email Verified!
              </h2>
              <p className="text-gray-600 mb-4">{message}</p>
              <p className="text-sm text-gray-500">
                Redirecting to complete your profile...
              </p>
            </>
          )}

          {status === "error" && (
            <>
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                Verification Failed
              </h2>
              <p className="text-gray-600 mb-6">{message}</p>
              <button
                onClick={() => navigate("/signup")}
                className="w-full bg-orange-500 text-white py-3 px-4 rounded-lg hover:bg-orange-600 transition-colors font-medium"
              >
                Back to Signup
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default VerifyEmail;
