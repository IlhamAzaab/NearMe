import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import OrderMapLayout from "../components/OrderMapLayout";
import { getStatusConfig } from "../config/orderStatusConfig";
import "./PlacingOrder.css";

const PlacingOrder = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showDetails, setShowDetails] = useState(false);
  const [viewOrderExpanded, setViewOrderExpanded] = useState(false);
  const [fetchedRestaurantLogo, setFetchedRestaurantLogo] = useState(null);
  const [imageError, setImageError] = useState(false);

  // Get order data passed from checkout
  const orderData = location.state || {};
  const {
    address = "123 Main Street, City",
    restaurantName = "Restaurant",
    restaurantLogo = null,
    items = [],
    totalAmount = 0,
    orderPlaced = false,
    orderId = null,
    orderNumber = null,
    order = null,
  } = orderData;

  // Get logo URL from fetched data, order data, or order object
  const logoUrl =
    fetchedRestaurantLogo ||
    restaurantLogo ||
    order?.restaurant?.logo_url ||
    order?.logo_url ||
    null;

  // Get status configuration
  const statusConfig = getStatusConfig("placed");

  // Poll for delivery status changes
  useEffect(() => {
    if (!orderId || !orderPlaced) return;

    const pollStatus = async () => {
      const token = localStorage.getItem("token");
      try {
        const response = await fetch(
          `http://localhost:5000/orders/${orderId}/delivery-status`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (response.ok) {
          const data = await response.json();
          const newStatus = data.status;

          console.log(
            "Delivery status:",
            newStatus,
            "Logo:",
            data.restaurantLogo,
          );

          // Update restaurant logo if available from API
          if (data.restaurantLogo && !fetchedRestaurantLogo) {
            setFetchedRestaurantLogo(data.restaurantLogo);
            setImageError(false);
          }

          // Navigate to the correct page based on the new status
          if (newStatus && newStatus !== "placed") {
            const stateData = {
              ...orderData,
              deliveryStatus: newStatus,
              driver: data.driver,
              restaurantLogo: data.restaurantLogo,
            };

            // Route to the dedicated page for each status
            if (newStatus === "pending" || newStatus === "received") {
              navigate(`/order-received/${orderId}`, {
                state: stateData,
                replace: true,
              });
            } else if (newStatus === "accepted") {
              navigate(`/driver-accepted/${orderId}`, {
                state: stateData,
                replace: true,
              });
            } else if (newStatus === "picked_up") {
              navigate(`/order-picked-up/${orderId}`, {
                state: stateData,
                replace: true,
              });
            } else if (newStatus === "on_the_way") {
              navigate(`/order-on-the-way/${orderId}`, {
                state: stateData,
                replace: true,
              });
            } else if (newStatus === "delivered") {
              navigate(`/order-delivered/${orderId}`, {
                state: stateData,
                replace: true,
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
  }, [orderId, orderPlaced, navigate, orderData, fetchedRestaurantLogo]);

  // Handle view order details
  const handleToggleDetails = () => {
    setShowDetails(!showDetails);
  };

  const handleToggleViewOrder = () => {
    setViewOrderExpanded(!viewOrderExpanded);
  };

  // Handle image error
  const handleImageError = () => {
    setImageError(true);
  };

  const handleBack = () => {
    navigate("/");
  };

  return (
    <OrderMapLayout
      title={statusConfig.title}
      arrivalTimeText={null}
      stepIndex={statusConfig.stepIndex}
      deliveryAddress={address}
      showViewOrder={true}
      viewOrderExpanded={viewOrderExpanded}
      onToggleViewOrder={handleToggleViewOrder}
      
      onBack={handleBack}
    >
      {/* Success Animation Banner */}
      {orderPlaced && (
        <div className="success-banner">
          <div className="success-icon-container">
            <svg className="success-checkmark" viewBox="0 0 52 52">
              <circle
                className="checkmark-circle"
                cx="26"
                cy="26"
                r="25"
                fill="none"
              />
              <path
                className="checkmark-check"
                fill="none"
                d="M14.1 27.2l7.1 7.2 16.7-16.8"
              />
            </svg>
          </div>
          <div className="success-text">
            <h3>Order Placed Successfully!</h3>
            <p>
              Your order #{orderNumber} has been sent to {restaurantName}
            </p>
          </div>
        </div>
      )}

      {/* Order Details Section - Only for PlacingOrder page */}
      <div className="order-details-section">
        {/* Restaurant Name */}
        <div className="detail-group">
          <p className="detail-label">Restaurant</p>
          <div className="restaurant-info-row">
            {logoUrl && !imageError ? (
              <img
                src={logoUrl}
                alt={restaurantName}
                className="restaurant-thumbnail"
                onError={handleImageError}
              />
            ) : (
              <div className="restaurant-thumbnail-placeholder">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
            )}
            <span className="restaurant-name-text">{restaurantName}</span>
          </div>
        </div>

        {/* Food Items */}
        {items && items.length > 0 && (
          <div className="detail-group">
            <p className="detail-label">Food Items</p>
            <div className="food-items-list">
              {items.map((item, idx) => (
                <div key={idx} className="food-item-row">
                  <div className="item-name-qty">
                    <span className="item-quantity">{item.quantity}×</span>
                    <span className="item-name">{item.name}</span>
                  </div>
                  <span className="item-price">
                    LKR {(item.price * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
              <div className="food-items-total">
                <span className="total-label">Total</span>
                <span className="total-value">
                  LKR{" "}
                  {parseFloat(order?.total_amount || totalAmount).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Instruction */}
      </div>
    </OrderMapLayout>
  );
};

export default PlacingOrder;
