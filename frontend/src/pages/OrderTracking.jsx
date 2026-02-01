import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import OrderStatusLayout from "../components/OrderStatusLayout";
import { getStatusConfig, ORDER_STATUSES } from "../config/orderStatusConfig";
import "./PlacingOrder.css";

/**
 * OrderTracking Component
 * Manages order status transitions with overlapping page animations
 * Renders the appropriate status screen based on currentStatus
 */
const OrderTracking = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { orderId } = useParams();

  // State management
  const [currentStatus, setCurrentStatus] = useState(
    location.state?.deliveryStatus || ORDER_STATUSES.PLACED
  );
  const [prevStatus, setPrevStatus] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [orderData, setOrderData] = useState(location.state || {});
  const [showDetails, setShowDetails] = useState(false);
  const [restaurantLogo, setRestaurantLogo] = useState(
    location.state?.restaurantLogo || null
  );
  const [imageError, setImageError] = useState(false);

  // Get configuration for current status
  const statusConfig = getStatusConfig(currentStatus);

  // Handle status change with transition
  const handleStatusChange = useCallback((newStatus) => {
    if (newStatus === currentStatus) return;

    setIsTransitioning(true);
    setPrevStatus(currentStatus);
    
    // Short delay to trigger exit animation
    setTimeout(() => {
      setCurrentStatus(newStatus);
      
      // Reset transition after animation completes
      setTimeout(() => {
        setIsTransitioning(false);
        setPrevStatus(null);
      }, 500); // Match CSS animation duration
    }, 50);
  }, [currentStatus]);

  // Poll for delivery status changes
  useEffect(() => {
    if (!orderId) return;

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
          
          // Update restaurant logo if available
          if (data.restaurantLogo && !restaurantLogo) {
            setRestaurantLogo(data.restaurantLogo);
            setImageError(false);
          }
          
          // Trigger status change with animation
          if (newStatus && newStatus !== currentStatus) {
            handleStatusChange(newStatus);
          }
        }
      } catch (err) {
        console.error("Error polling status:", err);
      }
    };

    // Poll every 2 seconds
    const interval = setInterval(pollStatus, 2000);
    pollStatus(); // Initial poll

    return () => clearInterval(interval);
  }, [orderId, currentStatus, restaurantLogo, handleStatusChange]);

  // Handle toggle details
  const handleToggleDetails = () => {
    setShowDetails(!showDetails);
  };

  // Handle image error
  const handleImageError = () => {
    setImageError(true);
  };

  // Render status page with transition classes
  const renderStatusPage = (status, isExiting = false) => {
    const config = getStatusConfig(status);
    const transitionClass = isExiting 
      ? 'exiting' 
      : isTransitioning && status === currentStatus 
        ? 'entering' 
        : 'active';

    return (
      <div 
        key={status}
        className={`order-status-page ${transitionClass}`}
      >
        <OrderStatusLayout
          statusKey={config.statusKey}
          title={config.title}
          subtitle={config.subtitle}
          etaText={config.etaText}
          messageText={config.messageText}
          currentStepIndex={config.stepIndex}
          showDetails={showDetails}
          onToggleDetails={handleToggleDetails}
          orderData={orderData}
          restaurantLogo={restaurantLogo}
          imageError={imageError}
          onImageError={handleImageError}
        />
      </div>
    );
  };

  return (
    <div className="order-status-container">
      {/* Render exiting page if transitioning */}
      {isTransitioning && prevStatus && renderStatusPage(prevStatus, true)}
      
      {/* Render current page */}
      {renderStatusPage(currentStatus, false)}

      {/* Development controls (optional - remove in production) */}
      {process.env.NODE_ENV === 'development' && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '20px',
          zIndex: 9999,
          background: 'rgba(0,0,0,0.8)',
          padding: '10px',
          borderRadius: '8px',
          display: 'flex',
          gap: '5px',
          flexWrap: 'wrap',
          maxWidth: '300px'
        }}>
          <div style={{ width: '100%', color: 'white', fontSize: '12px', marginBottom: '5px' }}>
            Status Controls:
          </div>
          {Object.values(ORDER_STATUSES).map((status) => (
            <button
              key={status}
              onClick={() => handleStatusChange(status)}
              style={{
                padding: '5px 10px',
                fontSize: '11px',
                background: currentStatus === status ? '#22C55E' : '#374151',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              {status}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default OrderTracking;
