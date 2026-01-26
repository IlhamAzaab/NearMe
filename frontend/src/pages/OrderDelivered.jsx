import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import "./OrderDelivered.css";

const OrderDelivered = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { orderId } = useParams();
  
  const [orderData, setOrderData] = useState(location.state || null);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(!location.state?.order);
  const [customerName, setCustomerName] = useState("");

  // Fetch order data if not passed via state
  useEffect(() => {
    const fetchOrderData = async () => {
      const id = orderId || orderData?.orderId;
      if (!id) return;
      
      const token = localStorage.getItem("token");
      const storedName = localStorage.getItem("userName");
      setCustomerName(storedName || "Customer");
      
      try {
        const response = await fetch(`http://localhost:5000/orders/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (response.ok) {
          const data = await response.json();
          setOrder(data.order);
          setOrderData({
            order: data.order,
            orderId: data.order.id,
            orderNumber: data.order.order_number,
            restaurantName: data.order.restaurant_name,
          });
        }
      } catch (err) {
        console.error("Error fetching order:", err);
      } finally {
        setLoading(false);
      }
    };

    if (!order) {
      fetchOrderData();
    } else {
      setLoading(false);
      const storedName = localStorage.getItem("userName");
      setCustomerName(storedName || "Customer");
    }
  }, [orderId, orderData, order]);

  const handleBack = () => {
    navigate("/orders");
  };

  const handleGoHome = () => {
    navigate("/home");
  };

  const formatPrice = (price) => {
    return `Rs. ${parseFloat(price || 0).toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="order-delivered-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading receipt...</p>
        </div>
      </div>
    );
  }

  const orderItems = order?.order_items || orderData?.order?.order_items || [];
  const totalAmount = order?.total_amount || orderData?.order?.total_amount || 0;
  const restaurantName = order?.restaurant_name || orderData?.restaurantName || "Restaurant";

  return (
    <div className="order-delivered-container">
      {/* Header */}
      <header className="delivered-header">
        <button className="back-btn" onClick={handleBack}>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="header-title">Receipt</h1>
        <div className="header-spacer"></div>
      </header>

      {/* Success Banner */}
      <div className="success-banner">
        <div className="banner-content">
          <div className="success-badge">
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="#4CAF50"/>
              <path d="M8 12l3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="success-text">Delivery Successfully Completed!</p>
        </div>
        
        <h2 className="thank-you-title">
          Thanks for ordering, {customerName}
        </h2>
        <p className="receipt-subtitle">
          Here's your receipt for {restaurantName}.
        </p>

        {/* Illustration */}
        <div className="illustration">
          <div className="bag-illustration">
            <div className="bag-body">
              <div className="bag-logo">🍜</div>
            </div>
            <div className="bowl-icon">
              <span>🍛</span>
            </div>
          </div>
        </div>
      </div>

      {/* Receipt Content */}
      <div className="receipt-content">
        {/* Total */}
        <div className="total-section">
          <span className="total-label">Total</span>
          <span className="total-amount">{formatPrice(totalAmount)}</span>
        </div>

        <div className="divider"></div>

        {/* Order Items */}
        <div className="items-list">
          {orderItems.map((item, index) => (
            <div key={item.id || index} className="item-row">
              <div className="item-quantity">
                <span>{item.quantity}</span>
              </div>
              <div className="item-name">
                {item.food_name || item.name}
                {item.size && item.size !== "regular" && (
                  <span className="item-size"> ({item.size})</span>
                )}
              </div>
              <div className="item-price">
                {formatPrice(item.total_price || item.unit_price * item.quantity)}
              </div>
            </div>
          ))}
        </div>

        {/* Order Summary */}
        <div className="order-summary">
          <div className="summary-row">
            <span>Subtotal</span>
            <span>{formatPrice(order?.subtotal || orderData?.order?.subtotal)}</span>
          </div>
          <div className="summary-row">
            <span>Delivery Fee</span>
            <span>{formatPrice(order?.delivery_fee || orderData?.order?.delivery_fee)}</span>
          </div>
          <div className="summary-row">
            <span>Service Fee</span>
            <span>{formatPrice(order?.service_fee || orderData?.order?.service_fee)}</span>
          </div>
        </div>

        {/* Order Info */}
        <div className="order-info">
          <div className="info-row">
            <span className="info-label">Order Number</span>
            <span className="info-value">#{order?.order_number || orderData?.orderNumber}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Payment Method</span>
            <span className="info-value">{order?.payment_method || "Cash on Delivery"}</span>
          </div>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="bottom-actions">
        <button className="home-btn" onClick={handleGoHome}>
          Back to Home
        </button>
        <button className="reorder-btn" onClick={() => navigate(`/restaurant/${order?.restaurant_id}/foods`)}>
          Order Again
        </button>
      </div>
    </div>
  );
};

export default OrderDelivered;
