import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_URL } from "../config";

const POLL_INTERVAL_MS = 5000;

export default function VerifyPending() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") || "";
  const userId = searchParams.get("userId") || "";

  const [statusMessage, setStatusMessage] = useState(
    "Waiting for email verification...",
  );
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState("");

  const canPoll = useMemo(() => Boolean(userId), [userId]);

  useEffect(() => {
    if (!canPoll) {
      setError("Missing signup details. Please sign up again.");
      return;
    }

    const check = async () => {
      try {
        const res = await fetch(
          `${API_URL}/auth/check-email-verified?userId=${encodeURIComponent(userId)}`,
        );
        const data = await res.json().catch(() => ({}));

        if (data?.verified) {
          const token = localStorage.getItem("token");
          const role = localStorage.getItem("role");
          const authUserId = localStorage.getItem("userId") || userId;

          if (token && role === "customer") {
            navigate(
              `/auth/complete-profile?userId=${encodeURIComponent(authUserId)}`,
            );
          } else {
            setStatusMessage(
              "Email verified. Continue in the tab where verification completed, or login here.",
            );
          }
        }
      } catch {
        // Keep polling silently during transient network issues.
      }
    };

    check();
    const timer = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [canPoll, navigate, userId]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === "token" || event.key === "nm_email_verified") {
        const token = localStorage.getItem("token");
        const role = localStorage.getItem("role");
        const authUserId = localStorage.getItem("userId") || userId;

        if (token && role === "customer") {
          navigate(
            `/auth/complete-profile?userId=${encodeURIComponent(authUserId)}`,
          );
        }
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [navigate, userId]);

  const handleResend = async () => {
    setError("");
    setIsResending(true);

    try {
      const res = await fetch(`${API_URL}/auth/resend-verification-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.message || "Failed to resend verification email.");
        return;
      }

      setStatusMessage(
        data?.message || "Verification email sent. Please check your inbox.",
      );
    } catch {
      setError("Network error while resending email.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-green-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          Verify your email
        </h1>
        <p className="text-sm text-gray-600 mb-4">
          We sent a verification link to{" "}
          <span className="font-semibold">{email || "your email"}</span>.
        </p>

        <div className="rounded-xl border border-green-100 bg-green-50 p-3 mb-4">
          <p className="text-sm text-green-800">{statusMessage}</p>
        </div>

        {error ? <p className="text-sm text-red-600 mb-3">{error}</p> : null}

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleResend}
            disabled={isResending || !email}
            className="w-full py-3 rounded-xl bg-green-600 text-white font-semibold disabled:opacity-60"
          >
            {isResending ? "Resending..." : "Resend verification email"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="w-full py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold"
          >
            Back to login
          </button>
        </div>
      </div>
    </div>
  );
}
