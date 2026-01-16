import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const navigate = useNavigate();

  async function handleLogin() {
    if (!email || !password) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("http://localhost:5000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      // Check if email verification is required (403 response)
      if (res.status === 403) {
        setIsLoading(false);
        setShake(true);
        setTimeout(() => setShake(false), 500);
        alert(data.message || "Please verify your email before logging in");
        return;
      }

      if (!res.ok) {
        setIsLoading(false);
        setShake(true);
        setTimeout(() => setShake(false), 500);
        alert(data.message || "Login failed");
        return;
      }

      if (data.token) {
        localStorage.setItem("token", data.token);
      }
      localStorage.setItem("role", data.role);
      localStorage.setItem("userEmail", email);

      setIsLoading(false);
      setIsTransitioning(true);

      setTimeout(() => {
        if (data.role === "customer" && !data.profileCompleted) {
          localStorage.setItem("userId", data.userId);
          navigate("/auth/complete-profile");
          return;
        }

        if (data.role === "customer") {
          navigate("/");
        } else if (data.role === "admin") {
          navigate("/admin/dashboard");
        } else if (data.role === "driver") {
          navigate("/driver/dashboard");
        } else if (data.role === "manager") {
          navigate("/manager/dashboard");
        } else {
          navigate("/");
        }
      }, 1800);
    } catch (error) {
      console.error("Login error:", error);
      alert("Network error. Please try again.");
      setIsLoading(false);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-orange-900 to-slate-900 p-4 overflow-hidden relative">
      {/* Animated background blobs */}
      <div className="absolute top-0 left-0 w-98 h-98 bg-orange-700 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
      <div className="absolute top-0 right-0 w-96 h-96 bg-red-700 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-96 h-96 bg-yellow-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>

      {/* Success transition overlay */}
      {isTransitioning && (
        <div className="fixed inset-0 z-50 bg-gradient-to-br from-orange-600 to-red-600">
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
            <h2 className="text-4xl font-bold text-white animate-fade-in-up">Login Successful!</h2>
            <p className="text-white/80 mt-2 animate-fade-in-up animation-delay-200">Redirecting...</p>
          </div>
        </div>
      )}

      {/* Main login form - Glassmorphism style */}
      <div className={`w-full max-w-md backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl p-8 transform transition-all duration-500 ${shake ? 'animate-shake' : ''} animate-fade-in-down z-10`}>
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-block mb-6 p-3 bg-gradient-to-br from-orange-400 to-red-500 rounded-2xl shadow-lg">
            <svg
              className="w-8 h-8 text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-400 via-red-400 to-orange-400 bg-clip-text text-transparent mb-2 animate-fade-in tracking-tight">
            Near Me
          </h1>
          <p className="text-white/40 text-sm animate-fade-in animation-delay-100">
            Fastest delivery at your doorstep
          </p>
        </div>

        {/* Login Form */}
        <form className="space-y-5">
          {/* Email Input */}
          <div className="relative group">
            <label className="text-sm font-medium text-white/80 mb-2 block animate-fade-in animation-delay-200">
              Email Address
            </label>
            <div className="relative">
              <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-orange-400 transition-colors duration-300 group-focus-within:text-orange-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <input
                type="email"
                placeholder="you@example.com"
                className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-orange-400/50 focus:bg-white/10 text-white placeholder-white/40 transition-all duration-300 backdrop-blur-sm animate-fade-in animation-delay-200"
                onChange={(e) => setEmail(e.target.value)}
                value={email}
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="relative group">
            <label className="text-sm font-medium text-white/80 mb-2 block animate-fade-in animation-delay-300">
              Password
            </label>
            <div className="relative">
              <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-orange-400 transition-colors duration-300 group-focus-within:text-orange-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-orange-400/50 focus:bg-white/10 text-white placeholder-white/40 transition-all duration-300 backdrop-blur-sm animate-fade-in animation-delay-300"
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
            className="w-full mt-8 px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-bold rounded-xl transition-all duration-300 shadow-lg hover:shadow-2xl hover:scale-105 active:scale-95 disabled:opacity-75 flex items-center justify-center gap-2 animate-fade-in animation-delay-400 group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-white/20 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
            {isLoading ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign in</span>
                <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </>
            )}
          </button>

          {/* Forgot Password & Sign Up */}
          <div className="mt-8 pt-6 border-t border-white/10 space-y-3 text-center">
            <p className="text-white/60 text-sm animate-fade-in animation-delay-500">
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => navigate("/signup")}
                className="text-orange-400 hover:text-orange-300 font-semibold transition-colors duration-300 relative group"
              >
                Sign up here
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-orange-400 group-hover:w-full transition-all duration-300"></span>
              </button>
            </p>
            <button
              type="button"
              className="text-white/50 hover:text-orange-400 text-sm transition-colors duration-300 w-full"
            >
              Forgot password?
            </button>
          </div>
        </form>
      </div>

      {/* Floating accent elements */}
      <div className="fixed top-6 right-6 w-2 h-2 bg-orange-400 rounded-full animate-float" style={{ animationDelay: '0s' }}></div>
      <div className="fixed bottom-6 left-6 w-2 h-2 bg-red-400 rounded-full animate-float" style={{ animationDelay: '1s' }}></div>

      {/* Custom animations */}
      <style jsx>{`
        @keyframes blob {
          0%, 100% {
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
          0%, 100% {
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
          0%, 100% {
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