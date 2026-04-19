import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import MeezoLogo from "../assets/MeezoLogo.svg";
import { persistAuthSession } from "../auth/tokenStorage";

const API_URL = import.meta.env.VITE_API_URL || "https://api.meezo.lk";

export default function VerifyOtp() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const userId = searchParams.get("userId");
  const phone = searchParams.get("phone");
  const accessToken = searchParams.get("access_token");

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(60);
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);
  const inputRefs = useRef([]);

  // Countdown timer for resend
  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  // Auto-focus first input
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Redirect if no userId
  useEffect(() => {
    if (!userId) {
      navigate("/login");
    }
  }, [userId, navigate]);

  const handleChange = (index, value) => {
    if (!/^\d*$/.test(value)) return; // Only digits

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1); // Take last char
    setOtp(newOtp);
    setError("");

    // Auto-advance to next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasteData = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (pasteData.length === 6) {
      setOtp(pasteData.split(""));
      inputRefs.current[5]?.focus();
    }
  };

  const handleVerify = async () => {
    const otpString = otp.join("");
    if (otpString.length !== 6) {
      setError("Please enter the full 6-digit code");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/auth/verify-otp`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, otp: otpString }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Verification failed");
        setLoading(false);
        return;
      }

      // Save auth data and show success animation
      await persistAuthSession(data);

      setVerified(true);

      // Redirect after animation completes
      setTimeout(() => {
        navigate("/");
      }, 3000);
    } catch (err) {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0 || resending) return;

    setResending(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, phone }),
      });

      const data = await res.json();

      if (res.ok) {
        setResendTimer(60);
        setOtp(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      } else {
        setError(data.message || "Failed to resend OTP");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setResending(false);
    }
  };

  // Mask phone for display
  const maskedPhone = phone
    ? phone.slice(0, 3) + "****" + phone.slice(-3)
    : "your WhatsApp";

  return (
    <>
      {verified && (
        <div className="fixed inset-0 z-50 bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center p-4 overflow-hidden">
          {/* Animated background blobs */}
          <div className="absolute top-0 left-0 w-96 h-96 bg-green-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
          <div className="absolute -bottom-8 left-20 w-96 h-96 bg-teal-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>

          <div className="relative z-10 text-center">
            {/* Logo with animation */}
            <div className="mb-8 animate-fade-in-down">
              <div className="w-32 h-32 mx-auto bg-white rounded-full shadow-2xl shadow-green-200/50 p-4 flex items-center justify-center animate-scale-in">
                <img
                  src={MeezoLogo}
                  alt="Meezo"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* Success checkmark */}
            <div className="relative mb-8 animate-fade-in-down animation-delay-200">
              <div className="absolute -top-8 -right-8 w-20 h-20 bg-green-500 rounded-full shadow-lg animate-bounce-in">
                <svg
                  className="w-full h-full text-white p-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            </div>

            {/* Success text */}
            <h2 className="text-4xl font-bold text-gray-800 mb-3 animate-fade-in-down animation-delay-300">
              Verified!
            </h2>
            <p className="text-gray-600 text-lg mb-8 animate-fade-in-down animation-delay-400">
              Your phone has been verified successfully
            </p>

            {/* Loading indicator */}
            <div className="flex justify-center animate-fade-in-down animation-delay-500">
              <svg
                className="animate-spin h-8 w-8 text-green-600"
                xmlns="http://www.w3.org/2000/svg"
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
            </div>
            <p className="text-gray-500 mt-4 text-sm animate-fade-in-down animation-delay-600">
              Redirecting to home...
            </p>
          </div>

          <style jsx>{`
            @keyframes blob {
              0%,
              100% {
                transform: translate(0, 0) scale(1);
              }
              33% {
                transform: translate(30px, -50px) scale(1.1);
              }
              66% {
                transform: translate(-20px, 20px) scale(0.9);
              }
            }

            @keyframes fade-in-down {
              from {
                opacity: 0;
                transform: translateY(-20px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }

            @keyframes scale-in {
              0% {
                opacity: 0;
                transform: scale(0.5) rotate(-10deg);
              }
              50% {
                opacity: 1;
              }
              100% {
                opacity: 1;
                transform: scale(1) rotate(0deg);
              }
            }

            @keyframes bounce-in {
              0% {
                opacity: 0;
                transform: scale(0);
              }
              50% {
                opacity: 1;
              }
              100% {
                opacity: 1;
                transform: scale(1);
              }
            }

            .animate-blob {
              animation: blob 7s infinite;
            }

            .animation-delay-2000 {
              animation-delay: 2s;
            }

            .animation-delay-4000 {
              animation-delay: 4s;
            }

            .animation-delay-200 {
              animation-delay: 200ms;
            }

            .animation-delay-300 {
              animation-delay: 300ms;
            }

            .animation-delay-400 {
              animation-delay: 400ms;
            }

            .animation-delay-500 {
              animation-delay: 500ms;
            }

            .animation-delay-600 {
              animation-delay: 600ms;
            }

            .animate-fade-in-down {
              animation: fade-in-down 0.6s ease-out forwards;
              opacity: 0;
            }

            .animate-scale-in {
              animation: scale-in 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)
                forwards;
              opacity: 0;
            }

            .animate-bounce-in {
              animation: bounce-in 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)
                forwards;
              opacity: 0;
            }
          `}</style>
        </div>
      )}

      <div
        className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center p-4"
        style={{ minHeight: "100dvh" }}
      >
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            {/* WhatsApp Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-9 h-9 text-green-600"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </div>
            </div>

            <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">
              Verify Your Number
            </h2>
            <p className="text-center text-gray-500 mb-8">
              We sent a 6-digit code to{" "}
              <span className="font-semibold text-gray-700">{maskedPhone}</span>
            </p>

            {/* OTP Inputs */}
            <div
              className="flex justify-center gap-3 mb-6"
              onPaste={handlePaste}
            >
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => (inputRefs.current[index] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  className={`w-12 h-14 text-center text-xl font-bold border-2 rounded-xl outline-none transition-all duration-200
                  ${
                    digit
                      ? "border-green-500 bg-green-50 text-green-700"
                      : "border-gray-200 bg-gray-50 text-gray-800"
                  }
                  focus:border-green-500 focus:ring-2 focus:ring-green-200`}
                />
              ))}
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 text-red-600 text-sm text-center p-3 rounded-xl mb-4">
                {error}
              </div>
            )}

            {/* Verify Button */}
            <button
              onClick={handleVerify}
              disabled={loading || otp.join("").length !== 6}
              className={`w-full py-3.5 rounded-xl font-semibold text-white text-lg transition-all duration-200
              ${
                loading || otp.join("").length !== 6
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-lg hover:shadow-xl"
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Verifying...
                </span>
              ) : (
                "Verify & Continue"
              )}
            </button>

            {/* Resend */}
            <div className="mt-6 text-center">
              {resendTimer > 0 ? (
                <p className="text-gray-400 text-sm">
                  Resend code in{" "}
                  <span className="font-semibold text-gray-600">
                    {resendTimer}s
                  </span>
                </p>
              ) : (
                <button
                  onClick={handleResend}
                  disabled={resending}
                  className="text-green-600 font-semibold text-sm hover:text-green-700 hover:underline"
                >
                  {resending ? "Sending..." : "Resend Code"}
                </button>
              )}
            </div>

            {/* Info */}
            <div className="mt-6 bg-green-50 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-sm text-green-700">
                  Check your WhatsApp for the verification code. The code
                  expires in 10 minutes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
