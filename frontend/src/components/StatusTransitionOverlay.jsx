import React, { useState, useEffect } from "react";

/**
 * StatusTransitionOverlay
 *
 * Full-screen overlay that shows:
 * 1. Processing animation (immediately on swipe)
 * 2. Success animation (1.5s) or Error message
 *
 * Props:
 * - visible: boolean - whether to show overlay
 * - status: "processing" | "success" | "error"
 * - actionType: "pickup" | "deliver" - determines messaging
 * - errorMessage: string - error message to display
 * - onComplete: () => void - called after success/error is dismissed
 */
export default function StatusTransitionOverlay({
  visible,
  status,
  actionType = "pickup",
  errorMessage = "",
  onComplete,
}) {
  const [phase, setPhase] = useState("enter"); // enter, visible, exit

  useEffect(() => {
    if (visible) {
      setPhase("enter");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPhase("visible"));
      });
    }
  }, [visible]);

  useEffect(() => {
    if (status === "success" && phase === "visible") {
      const timer = setTimeout(() => {
        setPhase("exit");
        setTimeout(() => {
          onComplete?.();
        }, 300);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [status, phase, onComplete]);

  useEffect(() => {
    if (status === "error" && phase === "visible") {
      // Error state stays visible until user clicks "Try Again"
      // No auto-dismiss
    }
  }, [status, phase]);

  if (!visible) return null;

  const messages = {
    pickup: {
      processing: "Picking up order...",
      success: "Order Picked Up!",
      error: "Pickup Failed",
    },
    deliver: {
      processing: "Completing delivery...",
      success: "Delivered Successfully!",
      error: "Delivery Failed",
    },
  };

  const msg = messages[actionType] || messages.pickup;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-all duration-300 ${
        phase === "enter"
          ? "opacity-0"
          : phase === "exit"
            ? "opacity-0 scale-95"
            : "opacity-100"
      }`}
      style={{
        backgroundColor:
          status === "error"
            ? "rgba(239, 68, 68, 0.95)"
            : status === "success"
              ? "rgba(16, 185, 129, 0.95)"
              : "rgba(17, 24, 39, 0.92)",
      }}
    >
      <div className="flex flex-col items-center justify-center px-8">
        {/* Processing State */}
        {status === "processing" && (
          <>
            <div className="relative mb-8">
              {/* Outer ring */}
              <div className="w-28 h-28 rounded-full border-4 border-white/20 flex items-center justify-center">
                {/* Spinning ring */}
                <svg
                  className="absolute w-28 h-28 animate-spin"
                  viewBox="0 0 100 100"
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="46"
                    fill="none"
                    stroke="white"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray="120 180"
                  />
                </svg>
                {/* Center icon */}
                <div className="text-5xl animate-pulse">
                  {actionType === "pickup" ? "🏪" : "📦"}
                </div>
              </div>
              {/* Floating particles */}
              <div className="absolute -top-2 -right-2 w-3 h-3 bg-white/40 rounded-full animate-ping" />
              <div
                className="absolute -bottom-1 -left-3 w-2 h-2 bg-white/30 rounded-full animate-ping"
                style={{ animationDelay: "0.5s" }}
              />
              <div
                className="absolute top-1/2 -right-4 w-2 h-2 bg-white/20 rounded-full animate-ping"
                style={{ animationDelay: "1s" }}
              />
            </div>
            <p className="text-white text-2xl font-bold mb-2 animate-pulse">
              {msg.processing}
            </p>
            <p className="text-white/70 text-sm">Please wait a moment</p>
          </>
        )}

        {/* Success State */}
        {status === "success" && (
          <>
            <div className="mb-8 relative">
              {/* Success circle with checkmark */}
              <div className="w-28 h-28 rounded-full bg-white/20 flex items-center justify-center animate-[scaleIn_0.4s_ease-out]">
                <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center">
                  <svg
                    className="w-12 h-12 text-emerald-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path
                      d="M5 13l4 4L19 7"
                      className="animate-[drawCheck_0.5s_ease-out_0.3s_forwards]"
                      style={{
                        strokeDasharray: 24,
                        strokeDashoffset: 24,
                      }}
                    />
                  </svg>
                </div>
              </div>
              {/* Celebration particles */}
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: [
                      "#fbbf24",
                      "#f87171",
                      "#60a5fa",
                      "#34d399",
                      "#a78bfa",
                      "#fb923c",
                      "#f472b6",
                      "#22d3ee",
                    ][i],
                    top: "50%",
                    left: "50%",
                    animation: `confetti_${i} 0.8s ease-out ${0.2 + i * 0.05}s forwards`,
                    opacity: 0,
                  }}
                />
              ))}
            </div>
            <p className="text-white text-3xl font-bold mb-2 animate-[fadeInUp_0.4s_ease-out]">
              {msg.success}
            </p>
            <p
              className="text-white/80 text-base animate-[fadeInUp_0.5s_ease-out_0.1s_forwards]"
              style={{ opacity: 0 }}
            >
              {actionType === "pickup"
                ? "Head to the customer now"
                : "Great job! 🎉"}
            </p>
          </>
        )}

        {/* Error State */}
        {status === "error" && (
          <>
            <div className="mb-8">
              <div className="w-28 h-28 rounded-full bg-white/20 flex items-center justify-center animate-[shake_0.5s_ease-in-out]">
                <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center">
                  <svg
                    className="w-12 h-12 text-red-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </div>
              </div>
            </div>
            <p className="text-white text-2xl font-bold mb-2">{msg.error}</p>
            <p className="text-white/80 text-sm text-center max-w-xs">
              {errorMessage || "Something went wrong. Please try again."}
            </p>
            <button
              onClick={() => {
                setPhase("exit");
                setTimeout(() => onComplete?.(), 300);
              }}
              className="mt-6 px-8 py-3 bg-white text-red-500 rounded-full font-bold text-sm active:scale-95 transition-transform"
            >
              Try Again
            </button>
          </>
        )}
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes scaleIn {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes drawCheck {
          to { stroke-dashoffset: 0; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        ${[...Array(8)]
          .map((_, i) => {
            const angle = (i * 45 * Math.PI) / 180;
            const dist = 60 + Math.random() * 20;
            const x = Math.cos(angle) * dist;
            const y = Math.sin(angle) * dist;
            return `
            @keyframes confetti_${i} {
              0% { transform: translate(0, 0) scale(0); opacity: 1; }
              100% { transform: translate(${x}px, ${y}px) scale(1); opacity: 0; }
            }
          `;
          })
          .join("")}
      `}</style>
    </div>
  );
}
