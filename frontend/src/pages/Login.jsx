import { useState } from "react";
import { useNavigate } from "react-router-dom";
import foodBg from "../assets/food-bg.jpg";
import mdImage from "../assets/md.jpg";
import AnimatedAlert, { useAlert } from "../components/AnimatedAlert";
import { API_URL } from "../config";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const navigate = useNavigate();
  const { alert, visible, showError } = useAlert();

  async function handleLogin() {
    if (!email || !password) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      // Debug login response
      if (res.ok) {
        console.log("🔐 Login response:", {
          token: data.token ? `${data.token.substring(0, 20)}...` : "NULL",
          role: data.role,
          profileCompleted: data.profileCompleted,
          userId: data.userId,
          userName: data.userName,
        });
      } else {
        console.log("🔐 Login failed:", res.status, data.message);
      }

      // Check if email verification is required (403 response)
      if (res.status === 403) {
        setIsLoading(false);
        setShake(true);
        setTimeout(() => setShake(false), 500);
        showError(data.message || "Please verify your email before logging in");
        return;
      }

      if (!res.ok) {
        setIsLoading(false);
        setShake(true);
        setTimeout(() => setShake(false), 500);
        showError(data.message || "Login failed");
        return;
      }

      if (data.token) {
        localStorage.setItem("token", data.token);
      }
      localStorage.setItem("role", data.role);
      localStorage.setItem("userEmail", email);
      if (data.userId) {
        localStorage.setItem("userId", data.userId);
      }
      if (data.userName) {
        localStorage.setItem("userName", data.userName);
      }

      setIsLoading(false);
      setIsTransitioning(true);

      setTimeout(() => {
        if (data.role === "customer" && !data.profileCompleted) {
          const params = new URLSearchParams({ userId: data.userId });
          if (data.access_token) params.set("access_token", data.access_token);
          navigate(`/auth/complete-profile?${params.toString()}`);
          return;
        }

        if (data.role === "customer") {
          navigate("/home");
        } else if (data.role === "admin") {
          navigate("/admin/dashboard");
        } else if (data.role === "driver") {
          navigate("/driver/dashboard");
        } else if (data.role === "manager") {
          navigate("/manager/dashboard");
        } else {
          navigate("/home");
        }
      }, 1800);
    } catch (error) {
      console.error("Login error:", error);
      showError("Network error. Please try again.");
      setIsLoading(false);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 overflow-hidden relative"
      style={{ backgroundColor: "#FF4B5C" }}
    >
      <AnimatedAlert alert={alert} visible={visible} />
      {/* Animated background blobs */}
      <div className="absolute top-0 left-0 w-98 h-98 bg-red-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
      <div className="absolute top-0 right-0 w-96 h-96 bg-orange-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-96 h-96 bg-red-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>

      {/* Success transition overlay */}
      {isTransitioning && (
        <div
          className="fixed inset-0 z-50"
          style={{
            background: "linear-gradient(to bottom right, #FF4B5C, #FF4B5C)",
          }}
        >
          {/* Animated success checkmark */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="relative w-32 h-32 mb-8">
              <div className="absolute inset-0 rounded-full border-4 border-white/20 animate-pulse"></div>
              <svg
                className="absolute inset-0 w-full h-full text-white animate-scale-in"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-4xl font-bold text-white animate-fade-in-up">
              Login Successful!
            </h2>
            <p className="text-white/80 mt-2 animate-fade-in-up animation-delay-200">
              Redirecting...
            </p>
          </div>
        </div>
      )}

      {/* Main login form - Light card style */}
      <div
        className={`w-full max-w-md backdrop-blur-xl bg-white/95 border border-red-100 rounded-3xl shadow-2xl shadow-red-100/50 overflow-hidden transform transition-all duration-500 ${shake ? "animate-shake" : ""} animate-fade-in-down z-10`}
      >
        {/* Top Image Section */}
        {/* Top Image Section */}
        <div
          className="h-60 w-full overflow-hidden"
          style={{
            clipPath: "ellipse(100% 50% at 0% 50%)",
          }}
        >
          <img
            src={mdImage}
            alt="Near Me Delivery"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Card Content */}
        <div className="p-8">
          {/* Header */}
          <div className="text-center mb-10">
            <h1
              className="text-4xl font-bold bg-clip-text text-transparent mb-2 animate-fade-in tracking-tight"
              style={{
                backgroundImage: "linear-gradient(to right, #FF4B5C, #FF4B5C)",
              }}
            >
              Near Me
            </h1>
          </div>

          {/* Login Form */}
          <form className="space-y-5">
            {/* Email Input */}
            <div className="relative group">
              <label className="text-sm font-medium text-gray-700 mb-2 block animate-fade-in animation-delay-200">
                Email Address
              </label>
              <div className="relative">
                <svg
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-orange-500 transition-colors duration-300 group-focus-within:text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <input
                  type="email"
                  placeholder="you@example.com"
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100 text-gray-800 placeholder-gray-400 transition-all duration-300 animate-fade-in animation-delay-200"
                  onChange={(e) => setEmail(e.target.value)}
                  value={email}
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="relative group">
              <label className="text-sm font-medium text-gray-700 mb-2 block animate-fade-in animation-delay-300">
                Password
              </label>
              <div className="relative">
                <svg
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-orange-500 transition-colors duration-300 group-focus-within:text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                <input
                  type="password"
                  placeholder="••••••••"
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100 text-gray-800 placeholder-gray-400 transition-all duration-300 animate-fade-in animation-delay-300"
                  onChange={(e) => setPassword(e.target.value)}
                  value={password}
                  autoComplete="current-password"
                />
              </div>
            </div>

            {/* Sign in Button */}
            <button
              type="button"
              onClick={handleLogin}
              disabled={isLoading}
              className="w-full mt-8 px-6 py-3 text-white font-bold rounded-xl transition-all duration-300 shadow-lg hover:shadow-2xl hover:shadow-orange-200 hover:scale-105 active:scale-95 disabled:opacity-75 flex items-center justify-center gap-2 animate-fade-in animation-delay-400 group relative overflow-hidden"
              style={{
                background: "linear-gradient(to right, #FF4B5C, #FF4B5C)",
              }}
            >
              <div className="absolute inset-0 bg-white/20 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
              {isLoading ? (
                <>
                  <svg
                    className="w-5 h-5 animate-spin"
                    fill="none"
                    stroke="currentColor"
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
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign in</span>
                  <svg
                    className="w-5 h-5 group-hover:translate-x-1 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </>
              )}
            </button>

            {/* Forgot Password & Sign Up */}
            <div className="mt-8 pt-6 border-t border-gray-200 space-y-3 text-center">
              <p className="text-gray-600 text-sm animate-fade-in animation-delay-500">
                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={() => navigate("/signup")}
                  className="font-semibold transition-colors duration-300 relative group"
                  style={{ color: "#FF4B5C" }}
                >
                  Sign up here
                  <span
                    className="absolute bottom-0 left-0 w-0 h-0.5 group-hover:w-full transition-all duration-300"
                    style={{ background: "#FF6A00" }}
                  ></span>
                </button>
              </p>
              <button
                type="button"
                className="text-gray-500 hover:text-orange-500 text-sm transition-colors duration-300 w-full"
              >
                Forgot password?
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Floating accent elements */}
      <div
        className="fixed top-6 right-6 w-2 h-2 rounded-full animate-float"
        style={{ animationDelay: "0s", background: "#FF4B5C" }}
      ></div>
      <div
        className="fixed bottom-6 left-6 w-2 h-2 rounded-full animate-float"
        style={{ animationDelay: "1s", background: "#FF6A00" }}
      ></div>

      {/* Custom animations */}
      <style>{`
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

        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
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

        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(20px);
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

        @keyframes float {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-20px);
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

        .animate-fade-in {
          animation: fade-in 0.6s ease-out forwards;
          opacity: 0;
        }

        .animate-fade-in-down {
          animation: fade-in-down 0.6s ease-out forwards;
          opacity: 0;
        }

        .animate-fade-in-up {
          animation: fade-in-up 0.8s ease-out forwards;
          opacity: 0;
        }

        .animate-scale-in {
          animation: scale-in 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          opacity: 0;
        }

        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }

        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
