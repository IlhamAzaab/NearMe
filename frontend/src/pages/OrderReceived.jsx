import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import OrderMapLayout from "../components/OrderMapLayout";
import "./OrderReceived.css";

const OrderReceived = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { orderId: paramOrderId } = useParams();

  // Get order data from navigation state
  const orderData = location.state || {};
  const {
    orderId: stateOrderId,
    restaurantName = "Restaurant",
    restaurantLogo = null,
    items = [],
    totalAmount,
    address = "Old Dartiains board house",
    orderNumber,
    order,
  } = orderData;

  // Get logo URL from order data or order object
  const logoUrl = restaurantLogo || order?.restaurant?.logo_url || order?.logo_url || null;

  const orderId = paramOrderId || stateOrderId;
  const [deliveryStatus, setDeliveryStatus] = useState("pending");
  const [loading, setLoading] = useState(false);
  const [viewOrderExpanded, setViewOrderExpanded] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  // Current step index for progress bar (0-indexed)
  // "pending" status = step 1 (0=placed, 1=preparing, 2=driver accepted)
  const stepIndex = 1;

  // Calculate total for cash badge
  const displayTotal = order?.total_amount || totalAmount || 1599;

  // Calculate arrival time (30-45 mins from now)
  const getArrivalTimeRange = () => {
    const now = new Date();
    const start = new Date(now.getTime() + 30 * 60000);
    const end = new Date(now.getTime() + 45 * 60000);
    const format = (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: false });
    return `${format(start)} – ${format(end)}`;
  };


  // Poll for status updates
  useEffect(() => {
    if (!orderId) return;

    const pollStatus = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(
          `http://localhost:5000/orders/${orderId}/delivery-status`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const newStatus = data.status;

          if (newStatus && newStatus !== deliveryStatus) {
            setDeliveryStatus(newStatus);

            // Navigate to appropriate screen based on status
            if (newStatus === "accepted") {
              navigate(`/driver-accepted/${orderId}`, {
                state: { ...orderData, deliveryStatus: newStatus, driver: data.driver },
                replace: true,
              });
            } else if (newStatus === "picked_up") {
              navigate(`/order-picked-up/${orderId}`, {
                state: { ...orderData, deliveryStatus: newStatus, driver: data.driver },
                replace: true,
              });
            } else if (newStatus === "on_the_way") {
              navigate(`/order-on-the-way/${orderId}`, {
                state: { ...orderData, deliveryStatus: newStatus, driver: data.driver },
                replace: true,
              });
            } else if (newStatus === "delivered") {
              navigate(`/order-delivered/${orderId}`, {
                state: { ...orderData, deliveryStatus: newStatus },
                replace: true,
              });
            }
          }
        }
      } catch (err) {
        console.error("Error polling status:", err);
      }
    };

    const interval = setInterval(pollStatus, 2000);
    pollStatus();

    return () => clearInterval(interval);
  }, [orderId, deliveryStatus, navigate, orderData]);

  const handleBack = () => {
    navigate("/home");
  };

  const handleToggleViewOrder = () => {
    setViewOrderExpanded(!viewOrderExpanded);
  };

  const handleImageError = () => {
    setImageError(true);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading order details...</p>
      </div>
    );
  }

  return (
    <OrderMapLayout
      title="Preparing your order…"
      arrivalTimeText={getArrivalTimeRange()}
      stepIndex={stepIndex}
      deliveryAddress={address}
      showViewOrder={true}
      viewOrderExpanded={viewOrderExpanded}
      onToggleViewOrder={handleToggleViewOrder}
      orderDetails={{
        restaurantName,
        orderNumber,
        items,
        totalAmount: displayTotal,
      }}
      onBack={handleBack}
    >
      {/* Order Details Section */}
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
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
                  LKR {parseFloat(displayTotal).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </OrderMapLayout>
  );
};

export default OrderReceived;
