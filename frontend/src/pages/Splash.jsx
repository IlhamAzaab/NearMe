import React from "react";
import { useNavigate } from "react-router-dom";

const Splash = () => {
  const navigate = useNavigate();

  const handleGetStarted = () => {
    const token = localStorage.getItem("token");
    if (token) {
      navigate("/");
    } else {
      navigate("/welcome");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 overflow-hidden relative bg-gradient-to-br from-green-50 via-white to-emerald-50">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,_rgb(34_197_94_/_0.15)_1px,_transparent_0)] bg-[length:24px_24px]"></div>
      </div>

      {/* Animated background blobs */}
      <div className="absolute top-0 left-0 w-98 h-98 bg-green-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
      <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-96 h-96 bg-teal-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>

      {/* Main content - Light card style */}
      <div className="w-full max-w-md backdrop-blur-xl bg-white/90 border border-green-100 rounded-3xl shadow-2xl shadow-green-100/50 p-8 transform transition-all duration-500 animate-fade-in-down z-10">
        <div className="text-center">
          {/* Scooter Delivery Logo */}
          <div className="inline-block mb-6 p-5 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full shadow-lg">
            <svg
              className="w-16 h-16 text-white"
              fill="currentColor"
              viewBox="0 0 64 64"
            >
              {/* Scooter body */}
              <ellipse
                cx="14"
                cy="48"
                rx="8"
                ry="8"
                fill="currentColor"
                opacity="0.9"
              />
              <ellipse
                cx="50"
                cy="48"
                rx="8"
                ry="8"
                fill="currentColor"
                opacity="0.9"
              />
              <ellipse
                cx="14"
                cy="48"
                rx="4"
                ry="4"
                fill="#fff"
                opacity="0.3"
              />
              <ellipse
                cx="50"
                cy="48"
                rx="4"
                ry="4"
                fill="#fff"
                opacity="0.3"
              />
              {/* Scooter frame */}
              <path
                d="M14 48 L24 32 L44 32 L50 48"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M24 32 L28 24 L40 24 L44 32"
                fill="currentColor"
                opacity="0.8"
              />
              {/* Handlebar */}
              <path
                d="M40 24 L44 16 L52 16"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
              />
              <circle cx="52" cy="16" r="3" fill="currentColor" />
              {/* Delivery box */}
              <rect
                x="18"
                y="14"
                width="16"
                height="12"
                rx="2"
                fill="#86EFAC"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M22 20 L26 23 L32 17"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Speed lines */}
              <path
                d="M4 36 L10 36"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.6"
              />
              <path
                d="M2 42 L8 42"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.4"
              />
              <path
                d="M4 48 L9 48"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.5"
              />
            </svg>
          </div>

          <h1 className="text-5xl font-bold bg-gradient-to-r from-green-500 via-emerald-500 to-green-500 bg-clip-text text-transparent mb-4 animate-fade-in tracking-tight">
            NearMe
          </h1>
          <p className="text-gray-500 text-lg animate-fade-in animation-delay-100">
            Fastest delivery at your doorstep
          </p>

          {/* Get Started Button */}
          <button
            onClick={handleGetStarted}
            className="mt-10 w-full py-4 px-6 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white text-center font-bold rounded-xl transition-all duration-300 shadow-lg hover:shadow-green-200 active:scale-95 animate-fade-in animation-delay-200 flex items-center justify-center gap-2"
          >
            Get Started
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Splash;
