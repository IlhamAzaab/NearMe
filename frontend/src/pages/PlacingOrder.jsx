import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./PlacingOrder.css";

const PlacingOrder = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState("placed");

  // Get order data passed from checkout
  const orderData = location.state || {};
  const {
    address = "123 Main Street, City",
    city = "",
    deliveryMethod = "meet_at_door",
    deliveryOption = "standard",
    restaurantName = "Restaurant",
    items = [],
    paymentMethod = "cash",
    totalAmount = 0,
    orderPlaced = false,
    orderId = null,
    orderNumber = null,
    order = null,
  } = orderData;

  // Poll for delivery status changes
  useEffect(() => {
    if (!orderId || !orderPlaced) return;

    const pollStatus = async () => {
      const token = localStorage.getItem("token");
      try {
        const response = await fetch(
          `http://localhost:5000/orders/${orderId}/delivery-status`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (response.ok) {
          const data = await response.json();
          const newStatus = data.status;
          
          console.log("Delivery status:", newStatus);
          
          if (newStatus !== deliveryStatus) {
            setDeliveryStatus(newStatus);
            
            // Navigate to Order Received when status becomes 'pending' (restaurant accepted)
            if (newStatus === "pending") {
              navigate(`/order-received/${orderId}`, { 
                state: { ...orderData, deliveryStatus: newStatus },
                replace: true 
              });
            }
          }
        }
      } catch (err) {
        console.error("Error polling status:", err);
      }
    };

    // Poll every 2 seconds for quick response
    const interval = setInterval(pollStatus, 2000);
    pollStatus(); // Initial poll

    return () => clearInterval(interval);
  }, [orderId, orderPlaced, deliveryStatus, navigate, orderData]);

  // Calculate delivery time window
  const getDeliveryTimeWindow = () => {
    const now = new Date();
    // Use estimated duration from order if available, otherwise default
    const estimatedDuration = order?.estimated_duration_min || 30;
    const baseTime = Math.ceil(estimatedDuration) + 15;
    const startMinutes = deliveryOption === "priority" ? baseTime : baseTime + 5;
    const endMinutes = deliveryOption === "priority" ? baseTime + 10 : baseTime + 15;
    
    const startTime = new Date(now.getTime() + startMinutes * 60000);
    const endTime = new Date(now.getTime() + endMinutes * 60000);
    
    const formatTime = (date) =>
      date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    
    return `${formatTime(startTime)}–${formatTime(endTime)}`;
  };

  // Handle cancel button click - show confirmation
  const handleCancelClick = () => {
    setShowCancelConfirm(true);
  };

  // Confirm cancellation
  const handleConfirmCancel = () => {
    console.log("Order cancelled by user");
    navigate(-1);
  };

  // Dismiss cancel confirmation
  const handleDismissCancel = () => {
    setShowCancelConfirm(false);
  };

  // Go back
  const handleGoBack = () => {
    navigate(-1);
  };

  // Navigate to track order
  const handleTrackOrder = () => {
    if (orderId) {
      navigate(`/orders/${orderId}`);
    } else {
      navigate("/orders");
    }
  };

  // Navigate to home
  const handleBackToHome = () => {
    navigate("/home");
  };

  // Format price
  const formatPrice = (price) => {
    return price ? `Rs. ${parseFloat(price).toFixed(2)}` : "Rs. 0.00";
  };

  return (
    <div className={`placing-order-container ${orderPlaced ? 'order-success' : ''}`}>
      {/* Floating food icons */}
      <div className="floating-icons">
        <span className="floating-icon">🍔</span>
        <span className="floating-icon">🍕</span>
        <span className="floating-icon">🛵</span>
        <span className="floating-icon">🥡</span>
        <span className="floating-icon">🍜</span>
        <span className="floating-icon">🍗</span>
      </div>

      {/* Bottom Sheet Card */}
      <div className="bottom-sheet">
        <div className="sheet-content">
          {/* Drag Handle */}
          <div className="drag-handle"></div>

          {/* Title */}
          <div className="title-section">
            {orderPlaced ? (
              <div className="success-icon-container">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : (
              <div className="spinner-container">
                <div className="spinner"></div>
              </div>
            )}
            <div>
              <h1 className="title-text">{orderPlaced ? 'Order Placed!' : 'Placing order…'}</h1>
              {orderPlaced && orderNumber && (
                <p className="order-number">Order #{orderNumber}</p>
              )}
            </div>
          </div>

          {/* Order Details */}
          <div className="order-details">
            {/* Location */}
            <div className="detail-row">
              <div className="icon-box">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
              <div className="detail-content">
                <p className="detail-title">Home</p>
                <p className="detail-subtitle">
                  {deliveryMethod === "meet_at_door"
                    ? "Meet at my door"
                    : "Leave at my door"}
                </p>
                <p className="detail-address">{address}</p>
              </div>
            </div>

            {/* Delivery Time */}
            <div className="detail-row">
              <div className="icon-box">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="detail-content">
                <p className="detail-title">
                  {deliveryOption === "priority" ? "Priority" : "Standard"}{" "}
                  delivery: {getDeliveryTimeWindow()}
                </p>
              </div>
            </div>

            {/* Restaurant */}
            <div className="detail-row">
              <div className="icon-box">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </div>
              <div className="detail-content">
                <p className="detail-title">{restaurantName}</p>
              </div>
            </div>

            {/* Ordered Items */}
            <div className="detail-row">
              <div className="icon-box">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                  />
                </svg>
              </div>
              <div className="detail-content">
                {items.length > 0 ? (
                  items.map((item, idx) => (
                    <p key={idx} className="detail-title" style={{ marginBottom: idx < items.length - 1 ? '0.25rem' : 0 }}>
                      {item.quantity}× {item.name}
                    </p>
                  ))
                ) : (
                  <p className="detail-title">1× Chicken Kottu 🍗</p>
                )}
              </div>
            </div>

            {/* Payment Method */}
            <div className="detail-row">
              <div className="icon-box">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                  />
                </svg>
              </div>
              <div className="detail-content">
                <p className="detail-title">
                  {paymentMethod === "cash"
                    ? "Cash on Delivery"
                    : "Personal: Mastercard ••••0673"}
                </p>
              </div>
            </div>
          </div>

          {/* Total */}
          <div className="total-section">
            <p className="total-label">Total</p>
            <p className="total-amount">{formatPrice(order?.total_amount || totalAmount)}</p>
          </div>

          {/* Actions - Different for placed vs placing */}
          <div className="actions">
            {orderPlaced ? (
              <>
                <button
                  className="btn-primary btn-success"
                  onClick={handleTrackOrder}
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  Track Order
                </button>
                <button
                  className="btn-secondary"
                  onClick={handleBackToHome}
                >
                  Back to Home
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn-primary"
                  onClick={handleCancelClick}
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  Cancel order
                </button>
                <button
                  className="btn-secondary"
                  onClick={handleGoBack}
                >
                  Go back
                </button>
              </>
            )}
          </div>

          {/* Cancel Confirmation Modal */}
          {showCancelConfirm && (
            <div className="cancel-modal-overlay">
              <div className="cancel-modal">
                <div className="cancel-modal-icon">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <h3 className="cancel-modal-title">Cancel Order?</h3>
                <p className="cancel-modal-text">Are you sure you want to cancel this order?</p>
                <div className="cancel-modal-actions">
                  <button className="cancel-modal-btn cancel-modal-btn-secondary" onClick={handleDismissCancel}>
                    No, keep it
                  </button>
                  <button className="cancel-modal-btn cancel-modal-btn-primary" onClick={handleConfirmCancel}>
                    Yes, cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlacingOrder;
