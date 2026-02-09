import { useState, useCallback, useRef, useEffect } from "react";

// ===================== useAlert Hook =====================
// Usage:
//   const { alert, visible, showSuccess, showError } = useAlert();
//   Then render: <AnimatedAlert alert={alert} visible={visible} />
//
// Timing: 0.5s enter + 3s stay + 0.5s exit = 4s total

export function useAlert() {
  const [alert, setAlert] = useState(null);
  const [visible, setVisible] = useState(false);
  const enterTimer = useRef(null);
  const stayTimer = useRef(null);
  const exitTimer = useRef(null);

  const clearTimers = useCallback(() => {
    if (enterTimer.current) clearTimeout(enterTimer.current);
    if (stayTimer.current) clearTimeout(stayTimer.current);
    if (exitTimer.current) clearTimeout(exitTimer.current);
  }, []);

  const showAlert = useCallback(
    (type, message) => {
      clearTimers();
      setAlert({ type, message });
      setVisible(false);
      // Trigger enter animation after a tick
      enterTimer.current = setTimeout(() => setVisible(true), 10);
      // After 3.5s (enter 0.5s + stay 3s), start exit
      stayTimer.current = setTimeout(() => {
        setVisible(false);
        // After exit animation (0.5s), remove from DOM
        exitTimer.current = setTimeout(() => setAlert(null), 500);
      }, 3500);
    },
    [clearTimers],
  );

  const showSuccess = useCallback(
    (msg) => showAlert("success", msg),
    [showAlert],
  );
  const showError = useCallback((msg) => showAlert("error", msg), [showAlert]);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  return { alert, visible, showSuccess, showError };
}

// ===================== AnimatedAlert Component =====================
export default function AnimatedAlert({ alert, visible }) {
  if (!alert) return null;

  const isSuccess = alert.type === "success";

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[92%] max-w-md
        transition-all duration-500 ease-out
        ${
          visible
            ? "translate-y-0 opacity-100"
            : "-translate-y-5 opacity-0 pointer-events-none"
        }`}
    >
      <div
        className={`flex items-start gap-3 p-4 rounded-2xl shadow-xl border backdrop-blur-sm
        ${
          isSuccess
            ? "bg-green-50 border-green-300 shadow-green-200/50"
            : "bg-red-50 border-red-300 shadow-red-200/50"
        }`}
      >
        {/* Icon */}
        <div className="flex-shrink-0 mt-0.5">
          {isSuccess ? (
            <svg
              className="w-5 h-5 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-semibold ${
              isSuccess ? "text-green-800" : "text-red-800"
            }`}
          >
            {isSuccess ? "Success" : "Error"}
          </p>
          <p
            className={`text-sm mt-0.5 ${
              isSuccess ? "text-green-700" : "text-red-700"
            }`}
          >
            {alert.message}
          </p>
        </div>
      </div>
    </div>
  );
}
