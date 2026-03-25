import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { persistAuthSession } from "../auth/tokenStorage";
import { API_URL } from "../config";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("verifying");
  const [message, setMessage] = useState("Verifying your email...");

  useEffect(() => {
    const run = async () => {
      const token = String(searchParams.get("token") || "").trim();
      if (!token) {
        setStatus("error");
        setMessage("Invalid verification link.");
        return;
      }

      try {
        const response = await fetch(`${API_URL}/auth/verify-email`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          setStatus("error");
          setMessage(data?.message || "Verification failed. Please request a new email.");
          return;
        }

        await persistAuthSession(data);
        if (data?.email) {
          localStorage.setItem("userEmail", data.email);
        }

        localStorage.setItem("nm_email_verified", String(Date.now()));
        setStatus("success");
        setMessage("Email verified. Signing you in...");

        const nextUserId = data?.userId || localStorage.getItem("userId") || "";
        const profileDone = !!data?.profileCompleted;

        setTimeout(() => {
          if (data?.role === "customer" && !profileDone) {
            navigate(`/auth/complete-profile?userId=${encodeURIComponent(nextUserId)}`);
            return;
          }

          if (data?.role === "customer") {
            navigate("/");
            return;
          }

          navigate("/login");
        }, 800);
      } catch (error) {
        console.error("Verify email error:", error);
        setStatus("error");
        setMessage("Network error during verification.");
      }
    };

    run();
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-green-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          {status === "verifying" ? "Verifying email" : status === "success" ? "Verified" : "Verification failed"}
        </h1>
        <p className="text-sm text-gray-600 mb-6">{message}</p>

        {status === "error" ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => navigate("/signup")}
              className="w-full py-3 rounded-xl bg-green-600 text-white font-semibold"
            >
              Back to signup
            </button>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="w-full py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold"
            >
              Go to login
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
