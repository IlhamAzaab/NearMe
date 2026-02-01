import React from "react";
import { PROGRESS_STEPS, STATUS_ICONS, getEtaDisplayText } from "../config/orderStatusConfig";
import "../pages/PlacingOrder.css";

/**
 * Reusable Order Status Layout Component
 * Used by all order status pages to maintain consistent UI with overlapping transitions
 * 
 * @param {Object} props
 * @param {string} props.statusKey - Current status key (placed, pending, accepted, picked_up, on_the_way, delivered)
 * @param {string} props.title - Main title text
 * @param {string} props.subtitle - Subtitle text
 * @param {string} props.etaText - Estimated time text (or use estimatedMinutes for auto-calc)
 * @param {number} props.estimatedMinutes - Minutes until arrival (optional, for auto-calc ETA)
 * @param {string} props.messageText - Bottom message text
 * @param {number} props.currentStepIndex - Current step index for progress bar
 * @param {boolean} props.showDetails - Whether order details are expanded
 * @param {Function} props.onToggleDetails - Handler for toggling order details
 * @param {Object} props.orderData - Order data object
 * @param {string} props.restaurantLogo - Restaurant logo URL
 * @param {boolean} props.imageError - Image error state
 * @param {Function} props.onImageError - Handler for image error
 * @param {Object} props.driverInfo - Driver information object
 * @param {boolean} props.showDriverInfo - Whether to show driver card
 * @param {boolean} props.showTrackButton - Whether to show track order button
 * @param {Function} props.onTrackOrder - Handler for track order button
 * @param {boolean} props.showRating - Whether to show rating section
 * @param {React.ReactNode} props.customContent - Optional custom content to add
 * @param {Array} props.floatingIcons - Array of emoji icons for background
 */
const OrderStatusLayout = ({
  statusKey = "placed",
  title = "Order Status",
  subtitle = "",
  etaText = null,
  estimatedMinutes = null,
  messageText = "",
  currentStepIndex = 0,
  showDetails = false,
  onToggleDetails = () => {},
  orderData = {},
  restaurantLogo = null,
  imageError = false,
  onImageError = () => {},
  driverInfo = null,
  showDriverInfo = false,
  showTrackButton = false,
  onTrackOrder = () => {},
  showRating = false,
  rating = 0,
  onRating = () => {},
  onSubmitRating = () => {},
  ratingSubmitted = false,
  customContent = null,
  floatingIcons = ["🍔", "🍕", "🛵", "🥡", "🍜", "🍗"],
  additionalClasses = "",
}) => {
  const {
    restaurantName = "Restaurant",
    orderNumber = null,
    address = "123 Main Street, City",
    items = [],
    totalAmount = 0,
    order = null,
  } = orderData;

  // Calculate display ETA
  const displayEta = etaText || getEtaDisplayText(statusKey, estimatedMinutes);

  // Get status icon configuration
  const iconConfig = STATUS_ICONS[statusKey] || STATUS_ICONS.placed;
  
  // Determine if this is the delivered state
  const isDelivered = statusKey === "delivered";

  // Render status icon based on config
  const renderStatusIcon = () => {
    if (iconConfig.paths) {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {iconConfig.paths.map((path, idx) => (
            <path key={idx} d={path} />
          ))}
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isDelivered ? "2.5" : "2"}>
        <path d={iconConfig.path} />
      </svg>
    );
  };

  return (
    <div className={`placing-order-screen ${isDelivered ? "delivered" : ""} ${additionalClasses}`}>
      {/* ===== Background Image Area ===== */}
      <div className={`background-area ${isDelivered ? "delivered-bg" : ""}`}>
        <div className={`bg-gradient-overlay ${isDelivered ? "success" : ""}`}></div>
        
        {/* Floating icons for visual interest */}
        <div className={`floating-icons ${isDelivered ? "celebration" : ""}`}>
          {floatingIcons.map((icon, idx) => (
            <span key={idx} className="floating-icon">{icon}</span>
          ))}
        </div>

        {/* Status animation */}
        <div className={`status-animation-container ${isDelivered ? "success" : ""}`}>
          {isDelivered ? (
            <div className="success-ring"></div>
          ) : (
            <>
              <div className="pulse-ring"></div>
              <div className="pulse-ring delay-1"></div>
              <div className="pulse-ring delay-2"></div>
            </>
          )}
          <div className={`status-icon-main ${isDelivered ? "success" : ""}`}>
            {renderStatusIcon()}
          </div>
        </div>
      </div>

      {/* ===== Bottom Sheet ===== */}
      <div className={`bottom-sheet-modal ${isDelivered ? "delivered" : ""}`}>
        {/* Drag Handle */}
        <div className="drag-handle-bar"></div>

        {/* 1) Status Header */}
        <div className="status-header">
          <h1 className={`status-title-main ${isDelivered ? "success" : ""}`}>{title}</h1>
          <p className="status-eta">{displayEta}</p>
        </div>

        {/* 2) Segmented Progress Bar */}
        <div className="segmented-progress-container">
          <div className="segmented-bar">
            {PROGRESS_STEPS.map((step, index) => {
              const isCompleted = index < currentStepIndex;
              const isCurrent = index === currentStepIndex;
              const isUpcoming = index > currentStepIndex;

              return (
                <div
                  key={step.key}
                  className={`segment ${isCompleted ? "completed" : ""} ${isCurrent ? "current" : ""} ${isUpcoming ? "upcoming" : ""}`}
                />
              );
            })}
          </div>
          <div className="segment-labels">
            {PROGRESS_STEPS.map((step, index) => (
              <span 
                key={step.key} 
                className={`segment-label ${index <= currentStepIndex ? "active" : ""}`}
              >
                {step.label}
              </span>
            ))}
          </div>
        </div>

        {/* 3) View Order Row */}
        <button className="view-order-row" onClick={onToggleDetails}>
          <span className="view-order-text">View Order</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`view-order-chevron ${showDetails ? "rotated" : ""}`}
          >
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Expanded Order Details */}
        {showDetails && (
          <div className="order-details-expanded">
            <div className="detail-row">
              <span className="detail-label">Restaurant</span>
              <span className="detail-value">{restaurantName}</span>
            </div>
            {orderNumber && (
              <div className="detail-row">
                <span className="detail-label">Order #</span>
                <span className="detail-value">{orderNumber}</span>
              </div>
            )}
            <div className="detail-row">
              <span className="detail-label">Delivery to</span>
              <span className="detail-value">{address}</span>
            </div>
            {items.length > 0 && (
              <div className="items-section">
                <span className="detail-label">Items</span>
                {items.map((item, idx) => (
                  <div key={idx} className="item-row">
                    <span>{item.quantity}× {item.name}</span>
                    <span>Rs. {(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
            {(order?.total_amount || totalAmount) && (
              <div className="total-row">
                <span>Total</span>
                <span className="total-amount">Rs. {parseFloat(order?.total_amount || totalAmount).toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        {/* 4) Restaurant Info Card */}
        <div className="restaurant-card">
          <div className="restaurant-logo">
            {restaurantLogo && !imageError ? (
              <img 
                src={restaurantLogo} 
                alt={restaurantName} 
                className="restaurant-logo-img"
                onError={onImageError}
              />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            )}
          </div>
          <div className="restaurant-info">
            <span className="restaurant-name">{restaurantName}</span>
            {subtitle && <span className="restaurant-subtitle">{subtitle}</span>}
          </div>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="restaurant-arrow"
          >
            <path d="M9 5l7 7-7 7" />
          </svg>
        </div>

        {/* 5) Driver Info Card (if applicable) */}
        {showDriverInfo && driverInfo && (
          <div className="driver-card">
            <div className="driver-avatar">
              {driverInfo.avatar ? (
                <img src={driverInfo.avatar} alt={driverInfo.name} />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                </svg>
              )}
            </div>
            <div className="driver-info">
              <span className="driver-name">{driverInfo.name || "Your Driver"}</span>
              {driverInfo.phone && (
                <span className="driver-vehicle">{driverInfo.vehicle || "Delivery Partner"}</span>
              )}
            </div>
            {driverInfo.phone && (
              <a href={`tel:${driverInfo.phone}`} className="driver-call-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                </svg>
              </a>
            )}
          </div>
        )}

        {/* 6) Track Order Button (if applicable) */}
        {showTrackButton && (
          <button className="track-order-btn" onClick={onTrackOrder}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span>Track Order on Map</span>
          </button>
        )}

        {/* 7) Rating Section (for delivered status) */}
        {showRating && !ratingSubmitted && (
          <div className="rating-section">
            <p className="rating-title">How was your order?</p>
            <div className="rating-stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  className={`rating-star ${rating >= star ? "active" : ""}`}
                  onClick={() => onRating(star)}
                >
                  <svg viewBox="0 0 24 24" fill={rating >= star ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </button>
              ))}
            </div>
            {rating > 0 && (
              <button className="submit-rating-btn" onClick={onSubmitRating}>
                Submit Review
              </button>
            )}
          </div>
        )}

        {ratingSubmitted && (
          <div className="rating-success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <span>Thank you for your feedback!</span>
          </div>
        )}

        {/* Custom content area */}
        {customContent}

        {/* 8) Informational Message */}
        {messageText && !showRating && (
          <div className="info-message-container">
            <div className="info-message animated">
              <span className="info-message-text">{messageText}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderStatusLayout;
