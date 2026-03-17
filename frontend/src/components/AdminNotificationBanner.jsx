/**
 * Admin Notification Banner
 *
 * Full-screen overlay notification for restaurant admins when new orders arrive.
 * Features:
 * - Blinking border animation until interaction
 * - Alert sound that loops until Accept or Details is clicked
 * - "Accept Order" button that accepts the order via API
 * - "Details" button that navigates to admin orders page
 * - Only dismisses on explicit 'X' click (never auto-dismisses)
 * - Matches the design from the provided mockup
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../config";

// Generate a notification alert beep using Web Audio API
function createAlertSound() {
  let audioCtx = null;
  let isPlaying = false;
  let intervalId = null;

  const playBeep = () => {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }

      // Create a pleasant but attention-grabbing two-tone alert
      const playTone = (freq, startTime, duration) => {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(
          freq,
          audioCtx.currentTime + startTime,
        );
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime + startTime);
        gainNode.gain.linearRampToValueAtTime(
          0.3,
          audioCtx.currentTime + startTime + 0.05,
        );
        gainNode.gain.linearRampToValueAtTime(
          0,
          audioCtx.currentTime + startTime + duration,
        );

        oscillator.start(audioCtx.currentTime + startTime);
        oscillator.stop(audioCtx.currentTime + startTime + duration);
      };

      // Two-tone notification sound: ding-dong
      playTone(880, 0, 0.15); // A5
      playTone(1108, 0.18, 0.15); // C#6
      playTone(880, 0.4, 0.15); // A5
      playTone(1108, 0.58, 0.15); // C#6
    } catch (e) {
      // Audio not supported, continue silently
    }
  };

  return {
    start: () => {
      if (isPlaying) return;
      isPlaying = true;
      playBeep(); // Play immediately
      intervalId = setInterval(playBeep, 3000); // Repeat every 3 seconds
    },
    stop: () => {
      isPlaying = false;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
    cleanup: () => {
      isPlaying = false;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (audioCtx) {
        audioCtx.close().catch(() => {});
        audioCtx = null;
      }
    },
  };
}

export default function AdminNotificationBanner({
  notifications,
  onDismiss,
  onAccepted,
}) {
  const navigate = useNavigate();
  const [acceptingId, setAcceptingId] = useState(null);
  const [acceptedIds, setAcceptedIds] = useState(new Set());
  const alertSoundRef = useRef(null);

  // Start/stop alert sound based on active notifications
  useEffect(() => {
    const activeNotifs = notifications.filter(
      (n) => !acceptedIds.has(n.order_id) && !n.isMilestone,
    );

    if (activeNotifs.length > 0) {
      if (!alertSoundRef.current) {
        alertSoundRef.current = createAlertSound();
      }
      alertSoundRef.current.start();
    } else {
      if (alertSoundRef.current) {
        alertSoundRef.current.stop();
      }
    }

    return () => {
      if (alertSoundRef.current) {
        alertSoundRef.current.stop();
      }
    };
  }, [notifications, acceptedIds]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (alertSoundRef.current) {
        alertSoundRef.current.cleanup();
        alertSoundRef.current = null;
      }
    };
  }, []);

  const handleAcceptOrder = useCallback(
    async (notification) => {
      const orderId = notification.order_id;
      if (acceptingId || acceptedIds.has(orderId)) return;

      // IMMEDIATELY stop sound on click (before async process)
      if (alertSoundRef.current) {
        alertSoundRef.current.stop();
      }

      setAcceptingId(orderId);

      try {
        const token = localStorage.getItem("token");
        const res = await fetch(
          `${API_URL}/orders/restaurant/orders/${orderId}/status`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ status: "accepted" }),
          },
        );

        if (res.ok) {
          // Stop sound for this notification
          setAcceptedIds((prev) => new Set([...prev, orderId]));
          // Notify parent
          onAccepted?.(orderId);
          // Auto-dismiss after brief success feedback
          setTimeout(() => {
            onDismiss?.(orderId);
          }, 1500);
        } else {
          const data = await res.json().catch(() => ({}));
          console.error("Accept order failed:", data.message);
          alert(data.message || "Failed to accept order");
          // Restart sound if there are remaining unhandled notifications
          const remaining = notifications.filter(
            (n) =>
              !acceptedIds.has(n.order_id) &&
              !n.isMilestone &&
              n.order_id !== orderId,
          );
          if (remaining.length > 0 && alertSoundRef.current) {
            alertSoundRef.current.start();
          }
        }
      } catch (err) {
        console.error("Accept order error:", err);
        alert("Network error. Please try again.");
        // Restart sound if there are remaining unhandled notifications
        const remaining = notifications.filter(
          (n) =>
            !acceptedIds.has(n.order_id) &&
            !n.isMilestone &&
            n.order_id !== orderId,
        );
        if (remaining.length > 0 && alertSoundRef.current) {
          alertSoundRef.current.start();
        }
      } finally {
        setAcceptingId(null);
      }
    },
    [acceptingId, acceptedIds, notifications, onAccepted, onDismiss],
  );

  const handleViewDetails = useCallback(
    (notification) => {
      // Stop sound
      if (alertSoundRef.current) {
        alertSoundRef.current.stop();
      }
      // Navigate to admin orders page
      navigate("/admin/orders");
      // Dismiss the notification
      onDismiss?.(notification.order_id);
    },
    [navigate, onDismiss],
  );

  const handleClose = useCallback(
    (orderId) => {
      // IMMEDIATELY stop sound on dismiss
      if (alertSoundRef.current) {
        alertSoundRef.current.stop();
      }
      onDismiss?.(orderId);
    },
    [onDismiss],
  );

  const handleOpenWithdrawalPayment = useCallback(
    (notification) => {
      if (alertSoundRef.current) {
        alertSoundRef.current.stop();
      }
      navigate(
        `/admin/withdrawals${notification.payment_id ? `?paymentId=${notification.payment_id}` : ""}`,
      );
      onDismiss?.(notification.order_id);
    },
    [navigate, onDismiss],
  );

  if (!notifications || notifications.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex flex-col items-center gap-2 px-3 pt-3">
      {notifications.map((notification) => {
        const isAccepted = acceptedIds.has(notification.order_id);
        const isAccepting = acceptingId === notification.order_id;

        // Milestone notification - different UI
        if (notification.isMilestone) {
          return (
            <div
              key={notification.order_id || notification.id}
              className="w-full max-w-md transition-all duration-400 ease-out animate-slideDown"
            >
              <div
                className="rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.18)] border-2 border-green-400 overflow-hidden"
                style={{ background: "#1a1a2e" }}
              >
                {/* Header */}
                <div
                  style={{
                    background:
                      "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 13,
                      letterSpacing: 1.2,
                      textTransform: "uppercase",
                    }}
                  >
                    ✅ ORDER MILESTONE
                  </span>
                  <button
                    onClick={() => handleClose(notification.order_id)}
                    style={{
                      background: "rgba(255,255,255,0.2)",
                      border: "none",
                      color: "#fff",
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      cursor: "pointer",
                      fontSize: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    ✕
                  </button>
                </div>
                {/* Body */}
                <div style={{ padding: "14px 16px 16px" }}>
                  <p
                    style={{
                      color: "#fff",
                      fontSize: 17,
                      fontWeight: 700,
                      margin: "0 0 4px",
                    }}
                  >
                    🎉 {notification.milestone} Orders Today!
                  </p>
                  <p
                    style={{
                      color: "#9ca3af",
                      fontSize: 13,
                      margin: "0 0 14px",
                      lineHeight: 1.4,
                    }}
                  >
                    {notification.message ||
                      `Your restaurant completed ${notification.milestone} orders today!`}
                  </p>
                  <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                    <div
                      style={{
                        flex: 1,
                        background: "#16162a",
                        borderRadius: 10,
                        padding: "10px 12px",
                        border: "1px solid rgba(34,197,94,0.25)",
                        textAlign: "center",
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          fontSize: 11,
                          fontWeight: 500,
                          marginBottom: 4,
                          color: "#9ca3af",
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                        }}
                      >
                        Revenue
                      </span>
                      <span
                        style={{
                          display: "block",
                          fontSize: 17,
                          fontWeight: 800,
                          color: "#22c55e",
                        }}
                      >
                        Rs.{(notification.today_revenue || 0).toLocaleString()}
                      </span>
                    </div>
                    <div
                      style={{
                        flex: 1,
                        background: "#16162a",
                        borderRadius: 10,
                        padding: "10px 12px",
                        border: "1px solid rgba(34,197,94,0.25)",
                        textAlign: "center",
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          fontSize: 11,
                          fontWeight: 500,
                          marginBottom: 4,
                          color: "#9ca3af",
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                        }}
                      >
                        Total Orders
                      </span>
                      <span
                        style={{
                          display: "block",
                          fontSize: 17,
                          fontWeight: 800,
                          color: "#22c55e",
                        }}
                      >
                        {notification.today_orders || notification.milestone}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleClose(notification.order_id)}
                    style={{
                      width: "100%",
                      padding: "10px 0",
                      border: "none",
                      borderRadius: 10,
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: "pointer",
                      background:
                        "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
                    }}
                  >
                    Awesome! 🎉
                  </button>
                </div>
              </div>
            </div>
          );
        }

        if (notification.type === "payment_received") {
          return (
            <div
              key={notification.payment_id || notification.id}
              className="w-full max-w-md transition-all duration-400 ease-out animate-slideDown"
            >
              <div className="bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.18)] border-2 border-emerald-300 overflow-hidden">
                <div className="flex items-center justify-between px-4 pt-3 pb-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                      Payment Notification
                    </span>
                  </div>
                  <button
                    onClick={() => handleClose(notification.order_id)}
                    className="text-gray-400 hover:text-gray-600 transition-colors p-0.5"
                    aria-label="Close"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                <div className="px-4 pb-4">
                  <h3 className="text-[#111816] text-base font-bold leading-tight">
                    {notification.title || "Payment Received"}
                  </h3>
                  <p className="text-emerald-600 text-lg font-bold mt-1">
                    Rs.{Number(notification.amount || 0).toFixed(2)}
                  </p>
                  <p className="text-gray-600 text-xs mt-1">
                    Proof: {(notification.proof_type || "file").toUpperCase()}
                  </p>
                  {notification.note && (
                    <p className="text-gray-500 text-xs mt-1 line-clamp-2">
                      Note: {notification.note}
                    </p>
                  )}

                  <button
                    onClick={() => handleOpenWithdrawalPayment(notification)}
                    className="w-full mt-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm py-2.5 rounded-xl transition-all"
                  >
                    View Transaction
                  </button>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div
            key={notification.order_id || notification.id}
            className={`w-full max-w-md transition-all duration-400 ease-out animate-slideDown ${
              isAccepted ? "opacity-60" : ""
            }`}
          >
            <div
              className={`bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.18)] border-2 overflow-hidden ${
                isAccepted ? "border-green-400" : "animate-borderBlink"
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 pt-3 pb-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2.5 h-2.5 rounded-full ${
                      isAccepted ? "bg-green-400" : "bg-green-500 animate-pulse"
                    }`}
                  />
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    New Notification
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-400 font-medium">
                    just now
                  </span>
                  <button
                    onClick={() => handleClose(notification.order_id)}
                    className="text-gray-400 hover:text-gray-600 transition-colors p-0.5"
                    aria-label="Close"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="px-4 pb-3">
                <div className="flex items-start gap-3">
                  {/* Food image */}
                  <div className="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shadow-sm">
                    {notification.food_image ? (
                      <img
                        src={notification.food_image}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-100 to-orange-200">
                        <span className="material-symbols-outlined text-orange-500 text-2xl">
                          restaurant
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[#111816] text-base font-bold leading-tight">
                      {isAccepted ? "Order Accepted!" : "New Order Arrived!"}
                    </h3>
                    <p className="text-[#13ecb9] text-sm font-bold mt-0.5">
                      #{notification.order_number}
                    </p>
                    <p className="text-gray-500 text-xs mt-0.5 line-clamp-1">
                      {notification.items_summary || notification.message}
                    </p>
                  </div>
                </div>

                {/* Action buttons */}
                {!isAccepted ? (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleAcceptOrder(notification)}
                      disabled={isAccepting}
                      className="flex-1 bg-[#13ec37] hover:bg-[#10d630] active:scale-[0.97] text-white font-bold text-sm py-2.5 rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                    >
                      {isAccepting ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg
                            className="w-4 h-4 animate-spin"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                            />
                          </svg>
                          Accepting...
                        </span>
                      ) : (
                        "Accept Order"
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 mt-3 py-2 text-green-600 font-bold text-sm">
                    <span className="material-symbols-outlined text-lg">
                      check_circle
                    </span>
                    Order Accepted!
                  </div>
                )}

                {/* Secondary actions */}
                {!isAccepted && (
                  <div className="flex items-center justify-center gap-4 mt-2">
                    <button
                      onClick={() => handleViewDetails(notification)}
                      className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 text-xs font-semibold py-1.5 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">
                        receipt_long
                      </span>
                      Print Receipt
                    </button>
                    <button
                      onClick={() => handleClose(notification.order_id)}
                      className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 text-xs font-semibold py-1.5 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <style>{`
        @keyframes slideDown {
          from {
            transform: translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slideDown {
          animation: slideDown 0.4s ease-out;
        }
        @keyframes borderBlink {
          0%, 100% {
            border-color: #13ecb9;
            box-shadow: 0 0 0 0 rgba(19, 236, 185, 0);
          }
          50% {
            border-color: #10d630;
            box-shadow: 0 0 20px 4px rgba(19, 236, 55, 0.25);
          }
        }
        .animate-borderBlink {
          animation: borderBlink 1.2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
