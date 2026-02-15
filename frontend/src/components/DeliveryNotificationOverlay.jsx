/**
 * Delivery Notification Overlay
 *
 * Renders stacking delivery notification popups that match the design:
 * - Green header with delivery icon
 * - Earnings display (driver_earnings + tip if available)
 * - Restaurant name with distance & time
 * - Drop-off address
 * - Accept & Decline buttons
 *
 * Features:
 * - Stacks on top of each other (newest on top)
 * - Clicking anywhere (except buttons) navigates to available deliveries
 * - Sound loops until all notifications are handled
 * - Works on any page
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDriverDeliveryNotifications } from "../context/DriverDeliveryNotificationContext";

// Pulsing animation keyframes (injected once)
const styleId = "delivery-notification-styles";
if (typeof document !== "undefined" && !document.getElementById(styleId)) {
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    @keyframes deliveryNotifSlideIn {
      from { transform: translateY(-30px) scale(0.95); opacity: 0; }
      to { transform: translateY(0) scale(1); opacity: 1; }
    }
    @keyframes deliveryNotifPulse {
      0%, 100% { box-shadow: 0 8px 32px rgba(0,0,0,0.18); }
      50% { box-shadow: 0 8px 40px rgba(34,197,94,0.35); }
    }
    @keyframes deliveryNotifBell {
      0%, 100% { transform: rotate(0deg); }
      15% { transform: rotate(14deg); }
      30% { transform: rotate(-14deg); }
      45% { transform: rotate(10deg); }
      60% { transform: rotate(-10deg); }
      75% { transform: rotate(4deg); }
    }
    .delivery-notif-card {
      animation: deliveryNotifSlideIn 0.35s ease-out, deliveryNotifPulse 2s ease-in-out infinite;
    }
    .delivery-notif-bell {
      animation: deliveryNotifBell 1s ease-in-out infinite;
      display: inline-block;
    }
  `;
  document.head.appendChild(style);
}

export default function DeliveryNotificationOverlay() {
  const navigate = useNavigate();
  const { notifications, acceptDelivery, declineDelivery, setNavigate } =
    useDriverDeliveryNotifications();
  const [acceptingId, setAcceptingId] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);

  // Pass navigate function to context
  useEffect(() => {
    setNavigate(navigate);
  }, [navigate, setNavigate]);

  // Get driver location for accept
  useEffect(() => {
    if (notifications.length > 0 && !driverLocation) {
      navigator.geolocation?.getCurrentPosition(
        (pos) => {
          setDriverLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        },
        () => {
          // Fallback: use stored location
          const lat = localStorage.getItem("driverLatitude");
          const lng = localStorage.getItem("driverLongitude");
          if (lat && lng) {
            setDriverLocation({
              latitude: parseFloat(lat),
              longitude: parseFloat(lng),
            });
          }
        },
        { enableHighAccuracy: true, timeout: 5000 },
      );
    }
  }, [notifications.length, driverLocation]);

  const handleAccept = async (e, deliveryId) => {
    e.stopPropagation();
    if (acceptingId) return;
    setAcceptingId(deliveryId);

    const result = await acceptDelivery(deliveryId, driverLocation);
    if (result.success) {
      // Navigate to active deliveries or refresh available deliveries page
      navigate("/driver/deliveries");
    } else {
      alert(result.message || "Failed to accept delivery");
    }
    setAcceptingId(null);
  };

  const handleDecline = (e, deliveryId) => {
    e.stopPropagation();
    declineDelivery(deliveryId);
  };

  const handleCardClick = (e, deliveryId) => {
    // Don't navigate if clicking buttons
    if (e.target.closest("button")) return;
    navigate("/driver/deliveries", {
      state: { highlightDelivery: deliveryId },
    });
  };

  const handleClose = (e, deliveryId) => {
    e.stopPropagation();
    declineDelivery(deliveryId);
  };

  if (notifications.length === 0) return null;

  const role = localStorage.getItem("role");
  if (role !== "driver") return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        pointerEvents: "none",
      }}
    >
      {/* Semi-transparent backdrop */}
      {notifications.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.3)",
            pointerEvents: "auto",
          }}
        />
      )}

      {/* Notification stack */}
      <div
        style={{
          position: "absolute",
          top: "12px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(400px, calc(100vw - 24px))",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          pointerEvents: "auto",
          maxHeight: "calc(100vh - 24px)",
          overflowY: "auto",
          padding: "4px",
        }}
      >
        {notifications.map((notif, index) =>
          notif.type === "delivery_milestone" ? (
            <MilestoneCard
              key={notif.delivery_id}
              notification={notif}
              index={index}
              onClose={handleClose}
            />
          ) : (
            <NotificationCard
              key={notif.delivery_id}
              notification={notif}
              index={index}
              onAccept={handleAccept}
              onDecline={handleDecline}
              onClose={handleClose}
              onClick={handleCardClick}
              isAccepting={acceptingId === notif.delivery_id}
            />
          ),
        )}
      </div>
    </div>
  );
}

function MilestoneCard({ notification, index, onClose }) {
  return (
    <div
      className="delivery-notif-card"
      style={{
        backgroundColor: "#1a1a2e",
        borderRadius: "16px",
        overflow: "hidden",
        position: "relative",
        animationDelay: `${index * 0.1}s`,
        border: "1px solid #22c55e",
      }}
    >
      {/* Green header */}
      <div
        style={{
          background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
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
          ✅ DELIVERY MILESTONE
        </span>
        <button
          onClick={(e) => onClose(e, notification.delivery_id)}
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
          🎉 {notification.milestone} Deliveries Today!
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
            `Great job! You've completed ${notification.milestone} deliveries today. Keep going!`}
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
              Today's Deliveries
            </span>
            <span
              style={{
                display: "block",
                fontSize: 17,
                fontWeight: 800,
                color: "#22c55e",
              }}
            >
              {notification.today_deliveries || notification.milestone}
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
              Milestone
            </span>
            <span
              style={{
                display: "block",
                fontSize: 17,
                fontWeight: 800,
                color: "#22c55e",
              }}
            >
              {notification.milestone} 🏆
            </span>
          </div>
        </div>
        <button
          onClick={(e) => onClose(e, notification.delivery_id)}
          style={{
            width: "100%",
            padding: "10px 0",
            border: "none",
            borderRadius: 10,
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
          }}
        >
          Awesome! 🎉
        </button>
      </div>
    </div>
  );
}

function NotificationCard({
  notification,
  index,
  onAccept,
  onDecline,
  onClose,
  onClick,
  isAccepting,
}) {
  const {
    delivery_id,
    type,
    restaurant_name,
    restaurant_address,
    customer_address,
    customer_city,
    distance_km,
    estimated_time,
    driver_earnings,
    total_trip_earnings,
    extra_earnings,
    bonus_amount,
    tip_amount,
    delivery_sequence,
    order_number,
  } = notification;

  const isFirstDelivery = (delivery_sequence || 1) === 1;
  const isTipUpdate = type === "tip_update";
  const tipValue = parseFloat(tip_amount || 0);

  // Calculate display earnings
  let mainEarnings = 0;
  let earningsLabel = "Est. Earnings";

  if (isFirstDelivery) {
    mainEarnings = parseFloat(driver_earnings || total_trip_earnings || 0);
    earningsLabel = "Base Earning";
  } else {
    mainEarnings =
      parseFloat(extra_earnings || 0) + parseFloat(bonus_amount || 0);
    earningsLabel = "Extra Earning";
  }

  // Add tip to display if available
  const totalDisplay = mainEarnings + tipValue;
  const hasEarnings = mainEarnings > 0 || tipValue > 0;

  // Title based on type
  const title = isTipUpdate
    ? "💰 Tip Added to Delivery!"
    : "🚚 New Delivery Available!";

  // Format distance
  const distanceText = distance_km
    ? `${parseFloat(distance_km).toFixed(1)} km${!isFirstDelivery ? " extra" : ""}`
    : null;

  // Format time
  const timeText = estimated_time
    ? `${Math.round(estimated_time)} min${!isFirstDelivery ? " extra" : "s"}`
    : null;

  // Drop-off text
  const dropOffText = customer_address
    ? customer_address
    : customer_city
      ? customer_city
      : "Drop-off location";

  return (
    <div
      className="delivery-notif-card"
      onClick={(e) => onClick(e, delivery_id)}
      style={{
        backgroundColor: "#fff",
        borderRadius: "16px",
        overflow: "hidden",
        cursor: "pointer",
        position: "relative",
        animationDelay: `${index * 0.1}s`,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="delivery-notif-bell" style={{ fontSize: "20px" }}>
            {isTipUpdate ? "💰" : "🚚"}
          </span>
          <span
            style={{
              fontWeight: 700,
              fontSize: "15px",
              color: "#1a1a1a",
            }}
          >
            {title}
          </span>
        </div>
        <button
          onClick={(e) => onClose(e, delivery_id)}
          style={{
            background: "none",
            border: "none",
            fontSize: "18px",
            color: "#999",
            cursor: "pointer",
            padding: "2px 6px",
            lineHeight: 1,
            borderRadius: "50%",
          }}
        >
          ×
        </button>
      </div>

      {/* Earnings */}
      <div style={{ padding: "0 16px 8px" }}>
        {hasEarnings ? (
          <>
            <div
              style={{ display: "flex", alignItems: "baseline", gap: "8px" }}
            >
              <span
                style={{
                  fontSize: "28px",
                  fontWeight: 800,
                  color: "#22c55e",
                  lineHeight: 1,
                }}
              >
                Rs.{totalDisplay.toFixed(2)}
              </span>
              <span
                style={{
                  fontSize: "13px",
                  color: "#888",
                  fontWeight: 500,
                }}
              >
                {earningsLabel}
              </span>
            </div>

            {/* Breakdown for 2nd+ delivery or tip */}
            {(!isFirstDelivery || tipValue > 0) && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "6px",
                  marginTop: "4px",
                }}
              >
                {!isFirstDelivery && parseFloat(extra_earnings || 0) > 0 && (
                  <span
                    style={{
                      fontSize: "11px",
                      backgroundColor: "#f0fdf4",
                      color: "#16a34a",
                      padding: "2px 8px",
                      borderRadius: "10px",
                      fontWeight: 600,
                    }}
                  >
                    Extra: Rs.{parseFloat(extra_earnings).toFixed(2)}
                  </span>
                )}
                {!isFirstDelivery && parseFloat(bonus_amount || 0) > 0 && (
                  <span
                    style={{
                      fontSize: "11px",
                      backgroundColor: "#fef3c7",
                      color: "#d97706",
                      padding: "2px 8px",
                      borderRadius: "10px",
                      fontWeight: 600,
                    }}
                  >
                    Bonus: Rs.{parseFloat(bonus_amount).toFixed(2)}
                  </span>
                )}
                {tipValue > 0 && (
                  <span
                    style={{
                      fontSize: "11px",
                      backgroundColor: "#ede9fe",
                      color: "#7c3aed",
                      padding: "2px 8px",
                      borderRadius: "10px",
                      fontWeight: 600,
                    }}
                  >
                    💰 Tip: Rs.{tipValue.toFixed(2)}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "#22c55e",
              }}
            >
              Tap to view earnings
            </span>
            {tipValue > 0 && (
              <span
                style={{
                  fontSize: "11px",
                  backgroundColor: "#ede9fe",
                  color: "#7c3aed",
                  padding: "2px 8px",
                  borderRadius: "10px",
                  fontWeight: 600,
                }}
              >
                💰 Tip: Rs.{tipValue.toFixed(2)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Restaurant info */}
      <div style={{ padding: "0 16px 6px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
          <span style={{ fontSize: "16px", marginTop: "1px" }}>📍</span>
          <div>
            <div
              style={{
                fontWeight: 600,
                fontSize: "14px",
                color: "#1a1a1a",
              }}
            >
              {restaurant_name || "Restaurant"}
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "#888",
                marginTop: "1px",
              }}
            >
              {[distanceText, timeText].filter(Boolean).join(" • ") ||
                restaurant_address ||
                ""}
            </div>
          </div>
        </div>
      </div>

      {/* Drop-off */}
      <div style={{ padding: "0 16px 14px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
          <span style={{ fontSize: "16px", marginTop: "1px" }}>🏠</span>
          <div
            style={{
              fontWeight: 500,
              fontSize: "13px",
              color: "#555",
            }}
          >
            Drop off: {dropOffText}
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          padding: "0 16px 16px",
        }}
      >
        <button
          onClick={(e) => onDecline(e, delivery_id)}
          style={{
            flex: "0 0 auto",
            padding: "12px 24px",
            border: "2px solid #e5e7eb",
            borderRadius: "12px",
            backgroundColor: "#fff",
            fontWeight: 700,
            fontSize: "14px",
            color: "#374151",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = "#f3f4f6";
            e.target.style.borderColor = "#d1d5db";
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = "#fff";
            e.target.style.borderColor = "#e5e7eb";
          }}
        >
          Decline
        </button>
        <button
          onClick={(e) => onAccept(e, delivery_id)}
          disabled={isAccepting}
          style={{
            flex: 1,
            padding: "12px 24px",
            border: "none",
            borderRadius: "12px",
            backgroundColor: isAccepting ? "#86efac" : "#22c55e",
            fontWeight: 700,
            fontSize: "14px",
            color: "#fff",
            cursor: isAccepting ? "wait" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            if (!isAccepting) e.target.style.backgroundColor = "#16a34a";
          }}
          onMouseLeave={(e) => {
            if (!isAccepting) e.target.style.backgroundColor = "#22c55e";
          }}
        >
          {isAccepting ? (
            <>
              <span
                style={{
                  width: "16px",
                  height: "16px",
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#fff",
                  borderRadius: "50%",
                  display: "inline-block",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              Accepting...
            </>
          ) : (
            <>✅ Accept Task</>
          )}
        </button>
      </div>

      {/* Order number badge */}
      {order_number && (
        <div
          style={{
            position: "absolute",
            top: "14px",
            right: "40px",
            fontSize: "11px",
            color: "#999",
            fontWeight: 500,
          }}
        >
          #{order_number}
        </div>
      )}
    </div>
  );
}
