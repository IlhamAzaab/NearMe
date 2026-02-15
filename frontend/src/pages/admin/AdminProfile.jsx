import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AnimatedAlert, { useAlert } from "../../components/AnimatedAlert";
import { API_URL } from "../../config";

export default function AdminProfile() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setRawError] = useState(null);
  const [success, setSuccess] = useState(false);
  const {
    alert: alertState,
    visible: alertVisible,
    showSuccess,
    showError,
  } = useAlert();
  const setError = (msg) => {
    setRawError(msg);
    if (msg) showError(msg);
  };
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    newPassword: "",
    confirmPassword: "",
  });

  // Animation for floating elements
  useEffect(() => {
    const interval = setInterval(() => {
      const elements = document.querySelectorAll(".floating");
      elements.forEach((el) => {
        const time = Date.now() / 300;
        const offset = Array.from(elements).indexOf(el);
        el.style.transform = `translateY(${Math.sin(time + offset) * 15}px) scale(${1 + Math.sin(time + offset) * 0.05})`;
      });
    }, 30);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Check if password change is required
    const checkStatus = async () => {
      const token = localStorage.getItem("token");
      try {
        const res = await fetch(`${API_URL}/admin/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && data.admin) {
          setForcePasswordChange(data.admin.force_password_change);

          // If password change not required and onboarding not complete, redirect
          if (
            !data.admin.force_password_change &&
            !data.admin.onboarding_completed
          ) {
            navigate(
              `/admin/restaurant/onboarding/step-${
                data.admin.onboarding_step || 1
              }`,
            );
          }
          // If everything complete, go to dashboard
          else if (
            !data.admin.force_password_change &&
            data.admin.onboarding_completed &&
            data.admin.admin_status === "active"
          ) {
            navigate("/admin/dashboard");
          }
        }
      } catch (e) {
        console.error("Profile check error:", e);
      }
    };
    checkStatus();
  }, [navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Validation
    if (!formData.username.trim()) {
      setError("Username is required");
      return;
    }

    if (formData.newPassword.length < 6) {
      setError("Password must be at least 6 characters long");
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    const token = localStorage.getItem("token");

    try {
      const res = await fetch(`${API_URL}/admin/change-password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: formData.username,
          newPassword: formData.newPassword,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        showSuccess("Password changed successfully! Redirecting...");
        setTimeout(() => {
          navigate("/admin/restaurant/onboarding/step-1");
        }, 1500);
      } else {
        setError(data.message || "Failed to change password");
      }
    } catch (e) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-500 via-green-600 to-green-700 p-4 overflow-hidden relative">
      <AnimatedAlert alert={alertState} visible={alertVisible} />
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Floating circles */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-gradient-to-r from-green-400/30 to-green-500/30 floating animate-pulse-slow"></div>
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full bg-gradient-to-r from-green-300/25 to-green-400/25 floating animate-pulse-slower"></div>
        <div className="absolute top-1/3 right-1/3 w-48 h-48 rounded-full bg-gradient-to-r from-green-200/20 to-green-300/20 floating animate-pulse-slow"></div>
        <div className="absolute top-1/2 left-1/2 w-40 h-40 rounded-full bg-gradient-to-r from-lime-300/25 to-green-300/25 animate-ping-slow"></div>

        {/* Vertical animated bars */}
        <div className="absolute inset-0">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 bg-gradient-to-b from-transparent via-white/20 to-transparent animate-slide-down"
              style={{
                left: `${i * 12.5}%`,
                height: "100%",
                animationDelay: `${i * 0.3}s`,
                animationDuration: `${3 + i * 0.2}s`,
              }}
            ></div>
          ))}
        </div>
      </div>

      <div className="w-full max-w-md bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 transform transition-all duration-300 z-10 hover:scale-[1.01]">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-green-500 to-green-600 rounded-full mb-4 shadow-lg">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Change Your Password
          </h1>
          {forcePasswordChange && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>⚠️ Password Change Required</strong>
                <br />
                For security reasons, you must change your temporary password
                before proceeding.
              </p>
            </div>
          )}
          <p className="text-gray-600">
            Please set a new secure password for your account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-green-800 via-green-400 to-green-800 animate-border-rotation p-[3px]">
                <div className="h-full w-full bg-white rounded-lg"></div>
              </div>
              <input
                type="text"
                name="username"
                className="relative w-full px-4 py-3 bg-transparent rounded-lg focus:outline-none z-10"
                placeholder="Choose a username"
                value={formData.username}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              New Password
            </label>
            <div className="relative">
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-green-800 via-green-400 to-green-800 animate-border-rotation p-[3px]">
                <div className="h-full w-full bg-white rounded-lg"></div>
              </div>
              <input
                type="password"
                name="newPassword"
                className="relative w-full px-4 py-3 bg-transparent rounded-lg focus:outline-none z-10"
                placeholder="Enter new password"
                value={formData.newPassword}
                onChange={handleChange}
                required
                minLength={6}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confirm Password
            </label>
            <div className="relative">
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-green-800 via-green-400 to-green-800 animate-border-rotation p-[3px]">
                <div className="h-full w-full bg-white rounded-lg"></div>
              </div>
              <input
                type="password"
                name="confirmPassword"
                className="relative w-full px-4 py-3 bg-transparent rounded-lg focus:outline-none z-10"
                placeholder="Re-enter new password"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                minLength={6}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || success}
            className={`w-full px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2 ${
              loading || success
                ? "opacity-70 cursor-not-allowed"
                : "hover:from-green-600 hover:to-green-700 active:scale-95"
            }`}
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Changing Password...
              </>
            ) : (
              "Change Password & Continue"
            )}
          </button>
        </form>
      </div>

      <style>{`
        @keyframes pulse-slow {
          0%,
          100% {
            opacity: 0.3;
          }
          50% {
            opacity: 0.5;
          }
        }

        @keyframes pulse-slower {
          0%,
          100% {
            opacity: 0.2;
          }
          50% {
            opacity: 0.4;
          }
        }

        @keyframes border-rotation {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }

        @keyframes slide-down {
          0% {
            transform: translateY(-100%);
            opacity: 0;
          }
          50% {
            opacity: 0.3;
          }
          100% {
            transform: translateY(100%);
            opacity: 0;
          }
        }

        @keyframes ping-slow {
          0% {
            transform: scale(1);
            opacity: 0.3;
          }
          50% {
            transform: scale(1.1);
            opacity: 0.2;
          }
          100% {
            transform: scale(1);
            opacity: 0.3;
          }
        }

        .animate-pulse-slow {
          animation: pulse-slow 4s ease-in-out infinite;
        }

        .animate-pulse-slower {
          animation: pulse-slower 6s ease-in-out infinite;
        }

        .animate-ping-slow {
          animation: ping-slow 3s ease-in-out infinite;
        }

        .animate-border-rotation {
          background-size: 200% 200%;
          animation: border-rotation 3s linear infinite;
        }

        .animate-slide-down {
          animation: slide-down linear infinite;
        }
      `}</style>
    </div>
  );
}
