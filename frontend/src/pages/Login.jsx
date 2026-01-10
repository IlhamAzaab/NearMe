import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const navigate = useNavigate();

  // Animation for floating elements
  useEffect(() => {
    const interval = setInterval(() => {
      const elements = document.querySelectorAll('.floating');
      elements.forEach(el => {
        el.style.transform = `translateY(${Math.sin(Date.now() / 1000 + Array.from(elements).indexOf(el)) * 5}px)`;
      });
    }, 50);
    return () => clearInterval(interval);
  }, []);

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

      if (!res.ok) {
        setIsLoading(false);
        setShake(true);
        setTimeout(() => setShake(false), 500);
        alert(data.message || "Login failed");
        return;
      }

      // Persist session info
      if (data.token) {
        localStorage.setItem("token", data.token);
      }
      localStorage.setItem("role", data.role);
      localStorage.setItem("userEmail", email);

      // Check if profile needs to be completed (for customers)
      if (data.role === "customer" && !data.profileCompleted) {
        localStorage.setItem("userId", data.userId);
        navigate("/auth/complete-profile");
        return;
      }

      // Route by role
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
    } catch (error) {
      console.error("Login error:", error);
      alert("Network error. Please try again.");
      setIsLoading(false);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-500 via-red-500 to-red-600 p-4 overflow-hidden relative">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Floating circles */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-gradient-to-r from-orange-400/20 to-red-400/20 floating"></div>
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 rounded-full bg-gradient-to-r from-orange-300/15 to-red-300/15 floating"></div>
        <div className="absolute top-1/3 right-1/3 w-32 h-32 rounded-full bg-gradient-to-r from-orange-200/10 to-red-200/10 floating"></div>
        
        {/* Speed lines animation */}
        <div className="absolute inset-0">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute h-1 bg-gradient-to-r from-transparent via-white/30 to-transparent"
              style={{
                top: `${i * 12.5}%`,
                width: '200%',
                animation: `speedLine ${2 + i * 0.3}s linear infinite`,
                animationDelay: `${i * 0.2}s`,
                transform: `translateX(-100%)`,
              }}
            ></div>
          ))}
        </div>
      </div>

      <div className={`w-full max-w-md bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 transform transition-all duration-300 ${shake ? 'animate-shake' : ''} z-10 hover:scale-[1.02] transition-transform duration-300`}>
        {/* Logo and Title */}
        <div className="text-center mb-8 floating">
          <div className="relative inline-block mb-4">
            {/* Bike Logo */}
            <div className="w-20 h-20 mx-auto relative">
              {/* Bike Frame */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-16 h-8 border-4 border-orange-500 rounded-full"></div>
              
              {/* Front Wheel */}
              <div className="absolute top-1/2 left-1/4 transform -translate-x-1/2 -translate-y-1/2 w-10 h-10 border-4 border-red-500 rounded-full animate-spin-slow">
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-red-500 rounded-full"></div>
              </div>
              
              {/* Back Wheel */}
              <div className="absolute top-1/2 right-1/4 transform -translate-x-1/2 -translate-y-1/2 w-10 h-10 border-4 border-red-500 rounded-full animate-spin-slow-reverse">
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-red-500 rounded-full"></div>
              </div>
              
              {/* Bike Seat */}
              <div className="absolute top-1/3 right-1/3 w-4 h-4 bg-orange-600 rounded-sm transform rotate-45"></div>
              
              {/* Handlebar */}
              <div className="absolute top-1/3 left-1/3 w-8 h-2 bg-orange-600 rounded-full transform rotate-12"></div>
            </div>
            
            <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent mt-4">
              Near Me
            </h1>
            <p className="text-gray-600 text-sm mt-2">Fastest delivery at your doorstep</p>
          </div>
        </div>

        {/* Login Form */}
        <div className="space-y-6">
          <div className="relative group">
            <input
              placeholder="Email"
              className="w-full p-4 pl-12 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 transition-all duration-300 group-hover:border-orange-400 bg-white/80"
              onChange={(e) => setEmail(e.target.value)}
              value={email}
            />
            <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-orange-500">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
              </svg>
            </div>
          </div>

          <div className="relative group">
            <input
              type="password"
              placeholder="Password"
              className="w-full p-4 pl-12 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 transition-all duration-300 group-hover:border-orange-400 bg-white/80"
              onChange={(e) => setPassword(e.target.value)}
              value={password}
            />
            <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-orange-500">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>

          <button
            className={`w-full px-6 py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl hover:from-orange-600 hover:to-red-600 transition-all duration-300 font-bold text-lg shadow-lg hover:shadow-xl active:scale-95 flex items-center justify-center ${isLoading ? 'opacity-90' : ''}`}
            onClick={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                Signing In...
              </>
            ) : (
              <>
                Sign In
                <svg className="w-5 h-5 ml-2 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </>
            )}
          </button>

          {/* Signup Link */}
          <div className="mt-6 text-center">
            <p className="text-gray-600">
              Don't have an account?{" "}
              <button
                onClick={() => navigate("/signup")}
                className="font-bold text-orange-600 hover:text-red-600 transition-colors duration-300 relative group"
              >
                Sign up
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-orange-600 group-hover:w-full transition-all duration-300"></span>
              </button>
            </p>
            <button className="mt-3 text-sm text-gray-500 hover:text-orange-600 transition-colors duration-300">
              Forgot password?
            </button>
          </div>
        </div>
      </div>

      {/* Custom CSS for animations */}
      <style jsx>{`
        @keyframes speedLine {
          0% {
            transform: translateX(-100%) translateY(0);
          }
          100% {
            transform: translateX(100%) translateY(0);
          }
        }
        
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
        
        .animate-spin-slow {
          animation: spin 3s linear infinite;
        }
        
        .animate-spin-slow-reverse {
          animation: spin 3s linear infinite reverse;
        }
        
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}