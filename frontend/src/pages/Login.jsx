import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AnimatedAlert, { useAlert } from "../components/AnimatedAlert";
import {
  getPostAuthRoute,
  login,
  persistSession,
} from "../services/authService";

function MeezoLogo({ size = 200 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1080 1080">
      <rect x="0" y="0" width="1080" height="1080" fill="transparent" />
      <g>
        <path
          d="m796.84,470.43c2.16-2.3,1.79-4.86-.71-4.86h-101.74c-2.52,0-5.62,2.05-6.9,4.57l-17.16,33.68c-1.29,2.53-.29,4.58,2.24,4.58h27.48c2.5,0,2.88,2.56.72,4.85l-89.65,95.15c-2.16,2.29-1.78,4.85.72,4.85h112.31c2.52,0,5.62-2.04,6.9-4.57l10.68-33.68c1.29-2.53.28-4.57-2.25-4.57h-31.76c-2.5,0-2.87-2.57-.71-4.86l89.83-95.14Z"
          fill="#000"
        />
        <path
          d="m564.84,465.48h-89.17c-2.14,0-4.76,1.74-5.85,3.88l-71.86,141.03c-1.09,2.14-.24,3.88,1.9,3.88h91.3c2.14,0,4.75-1.74,5.84-3.88l18.04-35.4c1.09-2.14.24-3.87-1.9-3.87h-36.89c-2.14,0-2.99-1.73-1.9-3.87l3.1-6.07c1.09-2.14,3.7-3.87,5.84-3.87h31.36c2.14,0,4.76-1.74,5.85-3.88l14.57-28.6c1.09-2.14.24-3.87-1.9-3.87h-31.36c-2.14,0-2.99-1.73-1.9-3.87l2.34-4.58c1.09-2.14,3.7-3.88,5.84-3.88h34.77c2.13,0,4.75-1.73,5.84-3.87l18.04-35.4c1.09-2.14.24-3.88-1.9-3.88Z"
          fill="#000"
        />
        <path
          d="m674.3,465.48h-89.17c-2.14,0-4.76,1.74-5.85,3.88l-71.86,141.03c-1.09,2.14-.24,3.88,1.9,3.88h91.3c2.14,0,4.75-1.74,5.84-3.88l18.04-35.4c1.09-2.14.24-3.87-1.9-3.87h-36.89c-2.13,0-2.99-1.73-1.9-3.87l3.1-6.07c1.09-2.14,3.7-3.87,5.84-3.87h31.37c2.13,0,4.75-1.74,5.84-3.88l14.57-28.6c1.09-2.14.24-3.87-1.9-3.87h-31.36c-2.14,0-2.99-1.73-1.9-3.87l2.34-4.58c1.09-2.14,3.71-3.88,5.84-3.88h34.77c2.14,0,4.75-1.73,5.84-3.87l18.04-35.4c1.09-2.14.24-3.88-1.9-3.88Z"
          fill="#000"
        />
        <path
          d="m455.98,475.4l-23.01,44.91c-1.96,3.83-5.1,6.86-9.03,8.71-30.64,14.45-56.96,26.84-66.45,31.3-2.31,1.09-5.25.69-7.61-1.03l-14.61-10.6-16.76-12.16-1.95-1.41c-4.49-3.26-10.24-2.47-12.57,1.71l-30.61,56.84c-7.03,13.06-20.71,20.85-36.62,20.85h-40.32c-3.86,0-6.8-4.34-5.11-7.51l41.38-76.8,21.66-40.22,3-5.57c11.39-21.13,40.35-25.25,62.84-8.93l12.1,8.78c9.65,7,19.3,14,28.95,21,3.09,2.25,6.19,4.5,9.28,6.74l82.97-39.09c1.44-.68,3.19,1.08,2.47,2.48Z"
          fill="#000"
        />
        <g>
          <path
            d="m883.66,586.15h-68.56s.09-.07.13-.12c-1.92-.44-3.34-2.16-3.34-4.2,0-1.19.48-2.28,1.26-3.06.79-.79,1.87-1.27,3.06-1.27h60.25c1.19,0,2.27-.48,3.05-1.26.79-.78,1.27-1.86,1.27-3.06,0-2.38-1.94-4.32-4.32-4.32h-42.37s.09-.08.14-.12c-1.91-.45-3.32-2.16-3.32-4.2,0-1.19.48-2.27,1.26-3.05.79-.79,1.87-1.27,3.06-1.27h32.57c1.2,0,2.28-.48,3.06-1.26.78-.78,1.26-1.86,1.26-3.06,0-2.38-1.93-4.32-4.32-4.32h-14.84c4.43-4.21,8.72-8.5,12.77-12.92,20.38-22.25,24.31-49.41,10.74-63.1-14.41-14.57-43.15-12.8-69.81,4.29-26.28,16.84-43.27,43.87-40.63,65.46,1.87,15.19,4.5,30.02,6.94,44.95.82,5.09,1.72,10.15,2.67,15.37.6,3.31,3.07,5.55,5.92,6.22.6.15,1.21.22,1.83.22h65.52c1.19,0,2.27-.49,3.06-1.27.78-.78,1.26-1.86,1.26-3.05,0-2.39-1.93-4.32-4.32-4.32h-52.95l.02-.02c-2.2-.2-3.92-2.06-3.92-4.3,0-1.19.48-2.27,1.26-3.06.78-.78,1.86-1.26,3.06-1.26h87.28c1.2,0,2.28-.49,3.06-1.27.78-.78,1.26-1.86,1.26-3.05,0-2.39-1.93-4.32-4.32-4.32Zm-78.14-67.05c5-10.73,17.74-19.42,28.47-19.42s15.36,8.69,10.35,19.42c-4.99,10.71-17.74,19.41-28.46,19.41s-15.36-8.7-10.36-19.41Z"
            fill="#fff"
          />
          <path
            d="m783.39,612.07h-.5c-.46,0-.91-.07-1.33-.22.6.15,1.21.22,1.83.22Z"
            fill="#fff"
          />
        </g>
      </g>
    </svg>
  );
}

export default function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const navigate = useNavigate();
  const { alert, visible, showError } = useAlert();

  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }

  async function handleLogin() {
    if (!identifier || !password) {
      triggerShake();
      return;
    }

    setIsLoading(true);

    try {
      const data = await login({ identifier, password });
      const user = data?.user || null;

      if (!user || !data?.token) {
        throw new Error("Login failed. Missing session data.");
      }

      persistSession({ token: data.token, user });

      setIsLoading(false);
      setIsTransitioning(true);

      setTimeout(() => {
        const destination =
          data.nextStep === "complete_profile"
            ? "/auth/complete-profile"
            : getPostAuthRoute(user);
        navigate(destination);
      }, 1800);
    } catch (error) {
      console.error("Login error:", error);
      showError(error.message || "Network error. Please try again.");
      setIsLoading(false);
      triggerShake();
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 overflow-hidden relative"
      style={{
        minHeight: "100dvh",
        background:
          "linear-gradient(155deg, #04753E 0%, #059B52 55%, #06C168 100%)",
      }}
    >
      <AnimatedAlert alert={alert} visible={visible} />
      <div className="absolute -top-20 -right-12 w-72 h-72 bg-white/20 rounded-full blur-3xl animate-blob"></div>
      <div className="absolute -bottom-24 -left-16 w-80 h-80 bg-emerald-300/35 rounded-full blur-3xl animate-blob animation-delay-2000"></div>

      {/* Success transition overlay */}
      {isTransitioning && (
        <div
          className="fixed inset-0 z-50"
          style={{ background: "rgba(0,0,0,0.55)" }}
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

      {/* Main login form */}
      <div
        className={`w-full max-w-md md:max-w-lg bg-white/95 border border-emerald-100 rounded-3xl shadow-2xl shadow-emerald-900/25 overflow-hidden transform transition-all duration-500 ${shake ? "animate-shake" : ""} animate-fade-in-down z-10`}
      >
        {/* Green top section */}
        <div
          className="relative px-6 pt-8 pb-5 text-center overflow-hidden"
          style={{
            background:
              "linear-gradient(180deg, #04753E 0%, #059B52 55%, #06C168 100%)",
          }}
        >
          <div className="absolute -top-16 -right-10 w-48 h-48 rounded-full bg-white/10" />
          <div className="absolute -bottom-12 -left-12 w-44 h-44 rounded-full bg-white/10" />
          <div className="relative z-10 flex flex-col items-center">
            <div style={{ transform: "scale(2)", transformOrigin: "center" }}>
              <MeezoLogo size={148} />
            </div>
            <p className="text-white/85 text-sm font-medium tracking-wide -mt-1">
              Your favorite food, fast.
            </p>
          </div>
        </div>

        {/* Wave separator */}
        <div className="bg-white -mt-px">
          <svg
            viewBox="0 0 500 48"
            preserveAspectRatio="none"
            className="w-full h-10"
          >
            <path d="M0 0 C120 60 380 -30 500 18 L500 0 Z" fill="#06C168" />
          </svg>
        </div>

        {/* Card content */}
        <div className="px-6 md:px-8 pb-8 bg-white">
          <div className="text-center mb-8">
            <p className="text-sm text-gray-500 animate-fade-in animation-delay-200">
              Please sign in to continue
            </p>
          </div>

          {/* Login Form */}
          <form className="space-y-4">
            {/* Email Input */}
            <div className="relative group">
              <label className="text-sm font-medium text-gray-700 mb-2 block animate-fade-in animation-delay-200">
                Email
              </label>
              <div className="relative">
                <svg
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-emerald-500 transition-colors duration-300 group-focus-within:text-emerald-700"
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
                  type="text"
                  placeholder="you@example.com"
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100 text-gray-800 placeholder-gray-400 transition-all duration-300 animate-fade-in animation-delay-200"
                  onChange={(e) => setIdentifier(e.target.value)}
                  value={identifier}
                  autoComplete="username"
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
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-emerald-500 transition-colors duration-300 group-focus-within:text-emerald-700"
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
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100 text-gray-800 placeholder-gray-400 transition-all duration-300 animate-fade-in animation-delay-300"
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
              className="w-full mt-6 px-6 py-3 text-white font-bold rounded-xl transition-all duration-300 shadow-lg hover:shadow-2xl hover:shadow-emerald-300/50 hover:scale-[1.02] active:scale-95 disabled:opacity-75 flex items-center justify-center gap-2 animate-fade-in animation-delay-400 group relative overflow-hidden"
              style={{
                background:
                  "linear-gradient(to right, #06C168, #059B52, #04753E)",
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
                  style={{ color: "#059B52" }}
                >
                  Sign up here
                  <span
                    className="absolute bottom-0 left-0 w-0 h-0.5 group-hover:w-full transition-all duration-300"
                    style={{ background: "#06C168" }}
                  ></span>
                </button>
              </p>
              <button
                type="button"
                className="text-gray-500 hover:text-emerald-600 text-sm transition-colors duration-300 w-full"
              >
                Forgot password?
              </button>
            </div>
          </form>
        </div>
      </div>

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
      `}</style>
    </div>
  );
}
