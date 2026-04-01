import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AnimatedAlert, { useAlert } from "../components/AnimatedAlert";
import {
  getPostAuthRoute,
  persistSession,
  resendOtp,
  signupStart,
  verifyOtp,
} from "../services/authService";
import { normalizeSriLankaPhone } from "../utils/phone";

function maskPhone(phone) {
  if (!phone) return "";
  if (phone.length < 6) return phone;
  return `${phone.slice(0, 5)}*****${phone.slice(-2)}`;
}

export default function Signup() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    phone: "",
  });
  const [loading, setLoading] = useState(false);
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [otpContext, setOtpContext] = useState({
    phone: "",
    devOtp: null,
    expiresAt: null,
  });
  const [shake, setShake] = useState(false);
  const { alert, visible, showSuccess, showError } = useAlert();

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const validateSignupForm = () => {
    if (!formData.phone) {
      showError("Phone number is required");
      triggerShake();
      return false;
    }

    if (!normalizeSriLankaPhone(formData.phone)) {
      showError("Enter a valid Sri Lankan phone number (0771234567)");
      triggerShake();
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateSignupForm()) {
      return;
    }

    setLoading(true);

    try {
      const data = await signupStart({
        phone: formData.phone,
      });
      const normalizedPhone = data.phone || normalizeSriLankaPhone(formData.phone);

      setOtpContext({
        phone: normalizedPhone,
        devOtp: data.devOtp || null,
        expiresAt: data.expiresAt || null,
      });
      localStorage.setItem("pendingSignupPhone", normalizedPhone);
      setOtpStep(true);
      setLoading(false);
      showSuccess(data.serverMessage || "Signup started. OTP sent to your phone.");
    } catch (err) {
      console.error("Signup error:", err);
      showError(err.message || "Network error. Please try again.");
      setLoading(false);
      return;
    }

    setLoading(false);
  };

  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.trim().length < 4) {
      showError("Enter the OTP you received on your phone");
      triggerShake();
      return;
    }

    setOtpLoading(true);

    try {
      const data = await verifyOtp({
        phone: otpContext.phone,
        otp: otpCode.trim(),
      });

      const user = data.user || {};
      persistSession({ token: data.token, user });
      localStorage.removeItem("pendingSignupPhone");

      setOtpLoading(false);
      showSuccess("Phone number verified successfully");
      const destination =
        data.nextStep === "complete_profile" ? "/auth/complete-profile" : getPostAuthRoute(user);
      navigate(destination);
    } catch (err) {
      console.error("Verify OTP error:", err);
      showError(err.message || "Network error. Please try again.");
      setOtpLoading(false);
      triggerShake();
    }
  };

  const handleResendOtp = async () => {
    if (resendLoading) return;

    setResendLoading(true);
    try {
      const data = await resendOtp({
        phone: otpContext.phone,
      });

      setOtpContext((prev) => ({
        ...prev,
        devOtp: data.devOtp || null,
        expiresAt: data.expiresAt || null,
      }));
      showSuccess(data.serverMessage || "OTP resent successfully");
    } catch (err) {
      console.error("Resend OTP error:", err);
      showError(err.message || "Network error while resending OTP");
    } finally {
      setResendLoading(false);
    }
  };

  if (otpStep) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 overflow-hidden relative bg-gradient-to-br from-green-50 via-white to-emerald-50">
        <AnimatedAlert alert={alert} visible={visible} />
        <div
          className={`w-full max-w-md backdrop-blur-xl bg-white/90 border border-green-100 rounded-3xl shadow-2xl shadow-green-100/50 p-8 transform transition-all duration-500 ${shake ? "animate-shake" : ""} animate-fade-in-down z-10`}
        >
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-green-500 via-emerald-500 to-green-500 bg-clip-text text-transparent mb-2">
              Verify OTP
            </h1>
            <p className="text-gray-500 text-sm">
              Enter OTP sent to {maskPhone(otpContext.phone)}
            </p>
            {otpContext.expiresAt && (
              <p className="text-xs text-gray-400 mt-1">
                Expires at: {new Date(otpContext.expiresAt).toLocaleTimeString()}
              </p>
            )}
            {otpContext.devOtp && (
              <p className="text-xs text-emerald-600 mt-2">Dev OTP: {otpContext.devOtp}</p>
            )}
          </div>

          <div className="space-y-4">
            <div className="relative group">
              <label className="text-sm font-medium text-gray-700 mb-2 block">OTP Code</label>
              <input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-green-400 focus:bg-white focus:ring-2 focus:ring-green-100 text-gray-800 placeholder-gray-400 transition-all duration-300"
                placeholder="Enter 6-digit OTP"
              />
            </div>

            <button
              type="button"
              disabled={otpLoading}
              onClick={handleVerifyOtp}
              className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-bold rounded-xl transition-all duration-300 shadow-lg hover:shadow-2xl hover:shadow-green-200 hover:scale-105 active:scale-95 disabled:opacity-75"
            >
              {otpLoading ? "Verifying OTP..." : "Verify OTP"}
            </button>

            <button
              type="button"
              disabled={resendLoading}
              onClick={handleResendOtp}
              className="w-full px-6 py-3 bg-white border border-green-200 text-green-700 font-semibold rounded-xl transition-all duration-300 hover:bg-green-50 disabled:opacity-70"
            >
              {resendLoading ? "Resending..." : "Resend OTP"}
            </button>
          </div>
        </div>

        <style>{`
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

          @keyframes shake {
            0%,
            100% {
              transform: translateX(0);
            }
            25% {
              transform: translateX(-8px);
            }
            75% {
              transform: translateX(8px);
            }
          }

          .animate-fade-in-down {
            animation: fade-in-down 0.6s ease-out forwards;
            opacity: 0;
          }

          .animate-shake {
            animation: shake 0.5s ease-in-out;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 overflow-hidden relative bg-gradient-to-br from-green-50 via-white to-emerald-50">
      <AnimatedAlert alert={alert} visible={visible} />
      <div
        className={`w-full max-w-md backdrop-blur-xl bg-white/90 border border-green-100 rounded-3xl shadow-2xl shadow-green-100/50 p-8 transform transition-all duration-500 ${shake ? "animate-shake" : ""} animate-fade-in-down z-10`}
      >
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-green-500 via-emerald-500 to-green-500 bg-clip-text text-transparent mb-2">
            Near Me
          </h1>
          <p className="text-gray-500 text-sm">Create account and verify phone</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative group">
            <label className="text-sm font-medium text-gray-700 mb-2 block">Phone Number</label>
            <input
              type="tel"
              name="phone"
              placeholder="0771234567"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-green-400 focus:bg-white focus:ring-2 focus:ring-green-100 text-gray-800 placeholder-gray-400 transition-all duration-300"
              onChange={handleChange}
              value={formData.phone}
              autoComplete="tel"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-bold rounded-xl transition-all duration-300 shadow-lg hover:shadow-2xl hover:shadow-green-200 hover:scale-105 active:scale-95 disabled:opacity-75"
          >
            {loading ? "Sending OTP..." : "Send OTP"}
          </button>

          <div className="mt-6 pt-6 border-t border-gray-200 text-center">
            <p className="text-gray-600 text-sm">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="text-green-600 hover:text-green-500 font-semibold transition-colors duration-300"
              >
                Log in
              </button>
            </p>
          </div>
        </form>

        <button
          type="button"
          onClick={() => navigate("/login")}
          className="w-full mt-3 rounded-xl bg-gray-100 text-gray-700 py-3 font-medium"
        >
          Already have an account? Login
        </button>
      </div>

      <style>{`
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

        @keyframes shake {
          0%,
          100% {
            transform: translateX(0);
          }
          25% {
            transform: translateX(-8px);
          }
          75% {
            transform: translateX(8px);
          }
        }

        .animate-fade-in-down {
          animation: fade-in-down 0.6s ease-out forwards;
          opacity: 0;
        }

        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
}
