/**
 * Manager Notification Overlay
 *
 * Renders stacking notification cards for managers.
 * Design: Dark themed cards with green accents matching the design reference:
 *  - Dark background with gradient green header
 *  - "SUCCESS MILESTONE" / "URGENT ALERT" header badges
 *  - Stats boxes (Revenue, Total Orders)
 *  - "View Details" button + "Dismiss" link
 *
 * Three notification types:
 * 1. unassigned_delivery  → ⚠️ URGENT ALERT  (continuous sound, red accent)
 * 2. order_milestone      → 🎉 SUCCESS MILESTONE (green accent)
 * 3. earnings_milestone   → 💰 SUCCESS MILESTONE (green accent)
 */

import { useManagerNotifications } from "../context/ManagerNotificationContext";
import { useNavigate } from "react-router-dom";

export default function ManagerNotificationOverlay() {
  const { notifications, dismissNotification } = useManagerNotifications();
  const navigate = useNavigate();

  if (!notifications || notifications.length === 0) return null;

  const handleViewDetails = (notification) => {
    const routes = {
      unassigned_delivery: "/manager/reports/pending-deliveries",
      order_milestone: notification.redirect || "/manager/reports/deliveries",
      earnings_milestone: notification.redirect || "/manager/earnings",
    };
    dismissNotification(notification.id);
    navigate(routes[notification.type] || "/manager");
  };

  return (
    <div style={styles.overlay}>
      {notifications.map((notification, index) => (
        <NotificationCard
          key={notification.id}
          notification={notification}
          index={index}
          onViewDetails={() => handleViewDetails(notification)}
          onDismiss={() => dismissNotification(notification.id)}
        />
      ))}
    </div>
  );
}

function NotificationCard({ notification, index, onViewDetails, onDismiss }) {
  const isAlert = notification.type === "unassigned_delivery";
  const isMilestone =
    notification.type === "order_milestone" ||
    notification.type === "earnings_milestone";

  return (
    <div
      style={{
        ...styles.card,
        animationDelay: `${index * 0.1}s`,
        borderColor: isAlert ? "#ef4444" : "#22c55e",
      }}
    >
      {/* Header gradient bar */}
      <div
        style={{
          ...styles.headerBar,
          background: isAlert
            ? "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)"
            : "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
        }}
      >
        <span style={styles.headerBadge}>
          {isAlert ? "⚠️ URGENT ALERT" : "✅ SUCCESS MILESTONE"}
        </span>
        <button onClick={onDismiss} style={styles.closeBtn}>
          ✕
        </button>
      </div>

      {/* Body */}
      <div style={styles.body}>
        {/* Title */}
        <p style={styles.title}>
          {notification.type === "unassigned_delivery"
            ? `Delivery Waiting ${notification.waiting_minutes || "10+"}min! 🚨`
            : notification.type === "order_milestone"
              ? `Daily Goal Reached! 🎉`
              : `Earnings Milestone! 💰`}
        </p>

        {/* Sub-message */}
        <p style={styles.subtitle}>
          {notification.message || "You have a new notification"}
        </p>

        {/* Stats boxes */}
        <div style={styles.statsRow}>
          {notification.type === "unassigned_delivery" ? (
            <>
              <StatBox
                label="Restaurant"
                value={notification.restaurant_name || "—"}
                accent="#ef4444"
              />
              <StatBox
                label="Waiting"
                value={`${notification.waiting_minutes || "10+"} min`}
                accent="#ef4444"
              />
            </>
          ) : notification.type === "order_milestone" ? (
            <>
              <StatBox
                label="Revenue"
                value={`Rs.${(notification.today_revenue || 0).toLocaleString()}`}
                accent="#22c55e"
              />
              <StatBox
                label="Total Orders"
                value={notification.total_orders || notification.milestone || 0}
                accent="#22c55e"
              />
            </>
          ) : (
            <>
              <StatBox
                label="Total Earnings"
                value={`Rs.${(notification.total_earnings || notification.milestone || 0).toLocaleString()}`}
                accent="#22c55e"
              />
              <StatBox
                label="Today Orders"
                value={notification.today_orders || 0}
                accent="#22c55e"
              />
            </>
          )}
        </div>

        {/* Action buttons */}
        <div style={styles.actions}>
          <button
            onClick={onViewDetails}
            style={{
              ...styles.viewBtn,
              background: isAlert
                ? "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)"
                : "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
            }}
          >
            {isAlert ? "🔍 Assign Driver" : "📊 View Details"}
          </button>
        </div>

        <button onClick={onDismiss} style={styles.dismissLink}>
          Dismiss
        </button>
      </div>

      {/* Pulsing indicator for alerts */}
      {isAlert && <div style={styles.pulseIndicator} />}
    </div>
  );
}

function StatBox({ label, value, accent }) {
  return (
    <div
      style={{
        ...styles.statBox,
        borderColor: accent + "40",
      }}
    >
      <span style={{ ...styles.statLabel, color: "#9ca3af" }}>{label}</span>
      <span style={{ ...styles.statValue, color: accent }}>{value}</span>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────
const styles = {
  overlay: {
    position: "fixed",
    top: 16,
    right: 16,
    zIndex: 99999,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    maxHeight: "90vh",
    overflowY: "auto",
    pointerEvents: "none",
  },
  card: {
    pointerEvents: "auto",
    width: 340,
    maxWidth: "calc(100vw - 32px)",
    background: "#1a1a2e",
    borderRadius: 16,
    border: "1px solid",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 20px rgba(34,197,94,0.15)",
    overflow: "hidden",
    animation: "managerNotifSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both",
    position: "relative",
  },
  headerBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
  },
  headerBadge: {
    color: "#fff",
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  closeBtn: {
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
    transition: "background 0.2s",
  },
  body: {
    padding: "14px 16px 16px",
  },
  title: {
    color: "#fff",
    fontSize: 17,
    fontWeight: 700,
    margin: "0 0 4px",
  },
  subtitle: {
    color: "#9ca3af",
    fontSize: 13,
    margin: "0 0 14px",
    lineHeight: 1.4,
  },
  statsRow: {
    display: "flex",
    gap: 10,
    marginBottom: 14,
  },
  statBox: {
    flex: 1,
    background: "#16162a",
    borderRadius: 10,
    padding: "10px 12px",
    border: "1px solid",
    textAlign: "center",
  },
  statLabel: {
    display: "block",
    fontSize: 11,
    fontWeight: 500,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statValue: {
    display: "block",
    fontSize: 17,
    fontWeight: 800,
  },
  actions: {
    display: "flex",
    gap: 8,
    marginBottom: 8,
  },
  viewBtn: {
    flex: 1,
    padding: "10px 0",
    border: "none",
    borderRadius: 10,
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    transition: "opacity 0.2s, transform 0.1s",
  },
  dismissLink: {
    background: "none",
    border: "none",
    color: "#6b7280",
    fontSize: 12,
    cursor: "pointer",
    width: "100%",
    textAlign: "center",
    padding: "4px 0 0",
    transition: "color 0.2s",
  },
  pulseIndicator: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#ef4444",
    animation: "managerPulse 1.5s ease-in-out infinite",
  },
};

// Inject keyframe animations once
if (typeof document !== "undefined") {
  const styleId = "manager-notif-keyframes";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes managerNotifSlideIn {
        from {
          opacity: 0;
          transform: translateX(100px) scale(0.9);
        }
        to {
          opacity: 1;
          transform: translateX(0) scale(1);
        }
      }
      @keyframes managerPulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.4; transform: scale(1.4); }
      }
    `;
    document.head.appendChild(style);
  }
}
