import React from "react";
import { PROGRESS_STEPS } from "../config/orderStatusConfig";
import "./OrderMapLayout.css";

/**
 * Reusable Order Map Layout Component
 * Extracted from OrderReceived.jsx to maintain consistent UI across all order status pages
 * 
 * Features:
 * - Map background with building blocks
 * - Location pin marker
 * - Bottom sheet with progress bar
 * - Customizable content via props
 */
const OrderMapLayout = ({
  // Content props
  title = "Order Status",
  arrivalTimeText = null,
  stepIndex = 0,
  deliveryAddress = "Your Address",
  
  // Order details for View Order
  orderDetails = null,
  showViewOrder = false,
  viewOrderExpanded = false,
  onToggleViewOrder = () => {},
  
  // Callbacks
  onBack = () => {},
  
  // Custom content
  children = null,
  
  // Styling
  className = "",
}) => {
  // Generate building blocks for realistic map
  const mapBlocks = [
    // Top left area
    { top: "6%", left: "4%", width: "50px", height: "38px" },
    { top: "8%", left: "24%", width: "35px", height: "28px" },
    // Top right area
    { top: "4%", left: "58%", width: "42px", height: "32px" },
    { top: "10%", left: "75%", width: "48px", height: "35px" },
    { top: "5%", left: "88%", width: "30px", height: "25px" },
    // Middle left area
    { top: "24%", left: "6%", width: "38px", height: "45px" },
    { top: "26%", left: "26%", width: "32px", height: "28px" },
    // Middle right area
    { top: "22%", left: "58%", width: "45px", height: "35px" },
    { top: "28%", left: "78%", width: "40px", height: "42px" },
    // Lower area (visible above sheet)
    { top: "42%", left: "5%", width: "36px", height: "30px" },
    { top: "38%", left: "22%", width: "28px", height: "35px" },
    { top: "44%", left: "62%", width: "42px", height: "28px" },
    { top: "40%", left: "82%", width: "35px", height: "38px" },
  ];

  return (
    <div className={`order-map-layout ${className}`}>
      {/* ===== Map Background ===== */}
      <div className="map-background">
        <div className="map-blocks">
          {mapBlocks.map((block, idx) => (
            <div
              key={idx}
              className="map-block"
              style={{
                top: block.top,
                left: block.left,
                width: block.width,
                height: block.height,
              }}
            />
          ))}
        </div>
      </div>

      {/* Location Pin */}
      <div className="location-pin">
        <svg className="pin-icon" viewBox="0 0 24 24" fill="#22c55e">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
        <div className="pin-pulse"></div>
      </div>

      {/* Back Button */}
      <button className="header-back-btn" onClick={onBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* ===== Bottom Sheet Card ===== */}
      <div className="bottom-sheet-card">
        {/* Handle */}
        <div className="sheet-handle"></div>

        {/* Main Heading */}
        <h1 className="main-heading">{title}</h1>

        {/* Arrival Time */}
        {arrivalTimeText && (
          <div className="arrival-row">
            <span className="arrival-text">Arrives</span>
            <span className="arrival-time">{arrivalTimeText}</span>
            <svg className="info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
          </div>
        )}

        {/* Segmented Progress Bar - Data-driven based on PROGRESS_STEPS */}
        <div className="segmented-progress">
          {PROGRESS_STEPS.map((step, idx) => {
            let segmentClass = "progress-segment";
            if (idx < stepIndex) {
              segmentClass += " completed"; // Previous: green, fixed
            } else if (idx === stepIndex) {
              segmentClass += " current"; // Current: green with animation
            }
            // Future: default grey, no class added
            return <div key={step.key} className={segmentClass} />;
          })}
        </div>

        {/* Delivery Details Section */}
        <div className="delivery-section">
          <p className="section-title">Delivery details</p>
          <p className="delivery-address">{deliveryAddress}</p>
        </div>

        {/* View Order Button and Details */}
        {showViewOrder && orderDetails && (
          <div className="view-order-section">
            <button 
              className={`view-order-btn ${viewOrderExpanded ? 'expanded' : ''}`}
              onClick={onToggleViewOrder}
            >
              <div className="view-order-left">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>View Order</span>
              </div>
              <svg 
                className={`chevron ${viewOrderExpanded ? 'rotated' : ''}`}
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
              >
                <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {/* Expandable Order Details */}
            {viewOrderExpanded && (
              <div className="order-details-expanded">
                {/* Restaurant Info */}
                {orderDetails.restaurantName && (
                  <div className="order-detail-row">
                    <span className="detail-label-text">Restaurant</span>
                    <span className="detail-value-text">{orderDetails.restaurantName}</span>
                  </div>
                )}

                {/* Order Number */}
                {orderDetails.orderNumber && (
                  <div className="order-detail-row">
                    <span className="detail-label-text">Order #</span>
                    <span className="detail-value-text">#{orderDetails.orderNumber}</span>
                  </div>
                )}

                {/* Items */}
                {orderDetails.items && orderDetails.items.length > 0 && (
                  <div className="order-items-section">
                    <span className="detail-label-text">Items</span>
                    <div className="items-list">
                      {orderDetails.items.map((item, idx) => (
                        <div key={idx} className="item-detail-row">
                          <div className="item-left">
                            <span className="item-qty">{item.quantity}×</span>
                            <span className="item-name-text">{item.name}</span>
                          </div>
                          <span className="item-price-text">
                            LKR {(item.price * item.quantity).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Total */}
                {orderDetails.totalAmount && (
                  <div className="order-detail-row total-row">
                    <span className="detail-label-text">Total</span>
                    <span className="detail-value-text total-amount">
                      LKR {parseFloat(orderDetails.totalAmount).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Custom Children Content */}
        {children}
      </div>
    </div>
  );
};

export default OrderMapLayout;
