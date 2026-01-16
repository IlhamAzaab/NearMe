import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Signup() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [shake, setShake] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError(""); // Clear error when user types
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Validation
    if (!formData.email || !formData.password || !formData.confirmPassword) {
      setError("All fields are required");
      setLoading(false);
      triggerShake();
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters");
      setLoading(false);
      triggerShake();
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      triggerShake();
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError("Please enter a valid email address");
      setLoading(false);
      triggerShake();
      return;
    }

    try {
      // Check if email is already registered
      const checkResponse = await fetch(
        "http://localhost:5000/auth/check-availability",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: formData.email }),
        }
      );

      const checkData = await checkResponse.json();

      if (!checkData.emailAvailable) {
        setError(checkData.message);
        setLoading(false);
        triggerShake();
        return;
      }

      // Proceed with signup
      const response = await fetch("http://localhost:5000/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Signup failed");
        setLoading(false);
        triggerShake();
        return;
      }

      // Success
      setSuccess(true);
      setLoading(false);
    } catch (err) {
      console.error("Signup error:", err);
      setError("Network error. Please try again.");
      setLoading(false);
      triggerShake();
    }
  };

  // Success screen with same styling
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-orange-900 to-slate-900 p-4 overflow-hidden relative">
        {/* Animated background blobs */}
        <div className="absolute top-0 left-0 w-98 h-98 bg-orange-700 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-red-700 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-96 h-96 bg-yellow-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>

        {/* Success Card */}
        <div className="w-full max-w-md backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl p-8 z-10 animate-fade-in-down">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-gradient-to-br from-green-400 to-green-600 mb-6 animate-scale-in shadow-lg">
              <svg
                className="h-10 w-10 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76"
                />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-white mb-3 animate-fade-in">
              Check Your Email!
            </h2>
            <p className="text-white/70 mb-6 animate-fade-in animation-delay-100">
              We've sent a verification link to{" "}
              <span className="font-semibold text-orange-400">{formData.email}</span>
            </p>
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6 animate-fade-in animation-delay-200">
              <p className="text-sm text-orange-400 font-semibold mb-2">
                Next steps:
              </p>
              <ol className="text-sm text-white/60 space-y-1 list-decimal list-inside text-left">
                <li>Open your email inbox</li>
                <li>Click the verification link</li>
                <li>Complete your profile</li>
                <li>Start ordering delicious food!</li>
              </ol>
            </div>
            <p className="text-xs text-white/40 mb-6 animate-fade-in animation-delay-300">
              Didn't receive the email? Check your spam folder or try again
              in a few minutes.
            </p>
            <button
              onClick={() => navigate("/login")}
              className="w-full py-3 px-6 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-bold rounded-xl transition-all duration-300 shadow-lg hover:shadow-2xl hover:scale-105 active:scale-95 flex items-center justify-center gap-2 animate-fade-in animation-delay-400 group relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-white/20 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
              <span>Go to Login</span>
              <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
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

          .animation-delay-100 {
            animation-delay: 100ms;
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

          .animate-fade-in {
            animation: fade-in 0.6s ease-out forwards;
            opacity: 0;
          }

          .animate-fade-in-down {
            animation: fade-in-down 0.6s ease-out forwards;
            opacity: 0;
          }

          .animate-scale-in {
            animation: scale-in 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            opacity: 0;
          }

          .animate-float {
            animation: float 3s ease-in-out infinite;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-orange-900 to-slate-900 p-4 overflow-hidden relative">
      {/* Animated background blobs */}
      <div className="absolute top-0 left-0 w-98 h-98 bg-orange-700 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
      <div className="absolute top-0 right-0 w-96 h-96 bg-red-700 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-96 h-96 bg-yellow-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>

      {/* Main signup form - Glassmorphism style */}
      <div className={`w-full max-w-md backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl p-8 transform transition-all duration-500 ${shake ? 'animate-shake' : ''} animate-fade-in-down z-10`}>
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-block mb-6 p-3 bg-gradient-to-br from-orange-400 to-red-500 rounded-2xl shadow-lg">
            <svg
              className="w-8 h-8 text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-400 via-red-400 to-orange-400 bg-clip-text text-transparent mb-2 animate-fade-in">
            Near Me
          </h1>
          <p className="text-white/60 text-sm animate-fade-in animation-delay-100">
            Create your account and start ordering
          </p>
        </div>

        {/* Signup Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Error Message */}
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-xl animate-fade-in">
              <p className="text-sm">{error}</p>
            </div>
          )}

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
                name="email"
                placeholder="you@example.com"
                className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-orange-400/50 focus:bg-white/10 text-white placeholder-white/40 transition-all duration-300 backdrop-blur-sm animate-fade-in animation-delay-200"
                onChange={handleChange}
                value={formData.email}
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
                name="password"
                placeholder="••••••••"
                className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-orange-400/50 focus:bg-white/10 text-white placeholder-white/40 transition-all duration-300 backdrop-blur-sm animate-fade-in animation-delay-300"
                onChange={handleChange}
                value={formData.password}
                autoComplete="new-password"
              />
            </div>
            <p className="mt-1 text-xs text-white/40">
              Must be at least 6 characters long
            </p>
          </div>

          {/* Confirm Password Input */}
          <div className="relative group">
            <label className="text-sm font-medium text-white/80 mb-2 block animate-fade-in animation-delay-400">
              Confirm Password
            </label>
            <div className="relative">
              <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-orange-400 transition-colors duration-300 group-focus-within:text-orange-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <input
                type="password"
                name="confirmPassword"
                placeholder="••••••••"
                className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-orange-400/50 focus:bg-white/10 text-white placeholder-white/40 transition-all duration-300 backdrop-blur-sm animate-fade-in animation-delay-400"
                onChange={handleChange}
                value={formData.confirmPassword}
                autoComplete="new-password"
              />
            </div>
          </div>

          {/* Terms & Conditions */}
          <div className="flex items-start animate-fade-in animation-delay-500">
            <input
              id="terms"
              name="terms"
              type="checkbox"
              required
              className="h-4 w-4 text-orange-500 focus:ring-orange-500 border-white/20 rounded mt-1 bg-white/10"
            />
            <label
              htmlFor="terms"
              className="ml-2 block text-sm text-white/60"
            >
              I agree to the{" "}
              <a href="#" className="text-orange-400 hover:text-orange-300 transition-colors">
                Terms and Conditions
              </a>{" "}
              and{" "}
              <a href="#" className="text-orange-400 hover:text-orange-300 transition-colors">
                Privacy Policy
              </a>
            </label>
          </div>

          {/* Sign up Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-bold rounded-xl transition-all duration-300 shadow-lg hover:shadow-2xl hover:scale-105 active:scale-95 disabled:opacity-75 flex items-center justify-center gap-2 animate-fade-in animation-delay-500 group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-white/20 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
            {loading ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Creating account...</span>
              </>
            ) : (
              <>
                <span>Sign Up</span>
                <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </>
            )}
          </button>

          {/* Login Link */}
          <div className="mt-6 pt-6 border-t border-white/10 text-center">
            <p className="text-white/60 text-sm animate-fade-in animation-delay-500">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="text-orange-400 hover:text-orange-300 font-semibold transition-colors duration-300 relative group"
              >
                Log in
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-orange-400 group-hover:w-full transition-all duration-300"></span>
              </button>
            </p>
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

        .animation-delay-100 {
          animation-delay: 100ms;
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
