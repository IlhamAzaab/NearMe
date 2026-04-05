import React, { useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import "./PlacingOrder.css";
import { API_URL } from "../config";

// Progress steps for the order journey - all completed
const PROGRESS_STEPS = [
  { key: "placed", label: "Order placed" },
  { key: "pending", label: "Order received" },
  { key: "accepted", label: "Driver accepted" },
  { key: "picked_up", label: "Picked up" },
  { key: "delivered", label: "Delivered" },
];

const OrderDelivered = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { orderId: paramOrderId } = useParams();

  // Get order data from navigation state
  const orderData = location.state || {};
  const {
    orderId: stateOrderId,
    restaurantName = "Restaurant",
    items = [],
    totalAmount,
    address = "Loading...",
    orderNumber,
    order,
  } = orderData;

  const orderId = paramOrderId || stateOrderId;
  const [showDetails, setShowDetails] = useState(false);
  const [rating, setRating] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  // All steps are completed
  const currentStepIndex = 5;

  // Handle view order details
  const handleViewDetails = () => {
    setShowDetails(!showDetails);
  };

  // Handle rating
  const handleRating = (value) => {
    setRating(value);
  };

  // Handle submit review
  const handleSubmitReview = async () => {
    if (rating > 0) {
      try {
        const token = localStorage.getItem("token");
        await fetch(`${API_URL}/orders/${orderId}/rate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ rating }),
        });
        setSubmitted(true);
      } catch (err) {
        console.error("Error submitting rating:", err);
        setSubmitted(true); // Still show success for UX
      }
    }
  };

  // Navigate to home
  const handleGoHome = () => {
    navigate("/");
  };

  // Navigate to order again
  const handleOrderAgain = () => {
    navigate("/");
  };

  return (
    <div className="placing-order-screen delivered">
      {/* ===== Background Image Area ===== */}
      <div className="background-area delivered-bg">
        <div className="bg-gradient-overlay success"></div>

        {/* Celebration icons */}
        <div className="floating-icons celebration">
          <span className="floating-icon">🎉</span>
          <span className="floating-icon">✨</span>
          <span className="floating-icon">🍽️</span>
          <span className="floating-icon">⭐</span>
          <span className="floating-icon">🎊</span>
          <span className="floating-icon">👍</span>
        </div>

        {/* Success animation */}
        <div className="status-animation-container success">
          <div className="success-ring"></div>
          <div className="status-icon-main success">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
        </div>
      </div>

      {/* ===== Bottom Sheet ===== */}
      <div className="bottom-sheet-modal delivered">
        {/* Drag Handle */}
        <div className="drag-handle-bar"></div>

        {/* Progress Indicator - All Complete */}
        <div className="progress-indicator">
          <div className="progress-track">
            {PROGRESS_STEPS.map((step, index) => {
              return (
                <React.Fragment key={step.key}>
                  <div className={`progress-dot completed`}>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>

                  {index < PROGRESS_STEPS.length - 1 && (
                    <div className="progress-line completed" />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          <div className="progress-labels">
            {PROGRESS_STEPS.map((step) => (
              <span key={step.key} className="progress-label completed">
                {step.label}
              </span>
            ))}
          </div>
        </div>

        {/* Status Content */}
        <div className="status-content">
          <h1 className="status-title success">Order Delivered!</h1>
          <p className="status-subtitle">
            Enjoy your meal! Thank you for ordering with Meezo.
          </p>
        </div>

        {/* Rating Section */}
        {!submitted ? (
          <div className="rating-section">
            <p className="rating-label">How was your experience?</p>
            <div className="star-rating">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  className={`star-btn ${rating >= star ? "active" : ""}`}
                  onClick={() => handleRating(star)}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill={rating >= star ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </button>
              ))}
            </div>
            {rating > 0 && (
              <button
                className="submit-rating-btn"
                onClick={handleSubmitReview}
              >
                Submit Review
              </button>
            )}
          </div>
        ) : (
          <div className="rating-success">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <span>Thanks for your feedback!</span>
          </div>
        )}

        {/* Order Details Button */}
        <button className="order-details-btn" onClick={handleViewDetails}>
          <div className="btn-left">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M9 12h6M9 16h6M17 21H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Order details</span>
          </div>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`chevron-icon ${showDetails ? "expanded" : ""}`}
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
              <span className="detail-label">Delivered to</span>
              <span className="detail-value">{address}</span>
            </div>
            {items.length > 0 && (
              <div className="items-section">
                <span className="detail-label">Items</span>
                {items.map((item, idx) => (
                  <div key={idx} className="item-row">
                    <span>
                      {item.quantity}× {item.name}
                    </span>
                    <span>Rs. {(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
            {order?.total_amount ? (
              <div className="total-row">
                <span>Total Paid</span>
                <span className="total-amount">
                  Rs. {parseFloat(order.total_amount).toFixed(2)}
                </span>
              </div>
            ) : (
              <div className="total-row">
                <span>Total Paid</span>
                <span className="total-amount">Awaiting confirmation</span>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="action-buttons">
          <button className="order-again-btn" onClick={handleOrderAgain}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M1 4v6h6M23 20v-6h-6" />
              <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
            </svg>
            Order Again
          </button>
          <button className="go-home-btn" onClick={handleGoHome}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <path d="M9 22V12h6v10" />
            </svg>
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderDelivered;
