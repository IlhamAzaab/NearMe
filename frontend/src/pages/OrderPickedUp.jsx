import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import "./OrderPickedUp.css";

const OrderPickedUp = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { orderId } = useParams();
  
  const [orderData, setOrderData] = useState(location.state || null);
  const [driverInfo, setDriverInfo] = useState(location.state?.driver || null);
  const [deliveryStatus, setDeliveryStatus] = useState("picked_up");
  const [loading, setLoading] = useState(!location.state);

  // Fetch order and driver data if not passed via state
  useEffect(() => {
    const fetchData = async () => {
      const id = orderId || orderData?.orderId;
      if (!id) return;
      
      const token = localStorage.getItem("token");
      
      try {
        const response = await fetch(`http://localhost:5000/orders/${id}/delivery-status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (response.ok) {
          const data = await response.json();
          setDeliveryStatus(data.status);
          
          if (data.driver) {
            setDriverInfo(data.driver);
          }
        }

        // Fetch full order data if not present
        if (!orderData) {
          const orderResponse = await fetch(`http://localhost:5000/orders/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (orderResponse.ok) {
            const orderResult = await orderResponse.json();
            setOrderData({
              order: orderResult.order,
              orderId: orderResult.order.id,
              orderNumber: orderResult.order.order_number,
              restaurantName: orderResult.order.restaurant_name,
              address: orderResult.order.delivery_address,
            });
          }
        }
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [orderId, orderData]);

  // Poll for status changes
  useEffect(() => {
    const id = orderId || orderData?.orderId;
    if (!id) return;

    const pollStatus = async () => {
      const token = localStorage.getItem("token");
      try {
        const response = await fetch(
          `http://localhost:5000/orders/${id}/delivery-status`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (response.ok) {
          const data = await response.json();
          const newStatus = data.status;
          
          console.log("OrderPickedUp - Current status:", newStatus, "Previous:", deliveryStatus);
          
          if (data.driver) {
            setDriverInfo(data.driver);
          }
          
          // Navigate immediately if status is on_the_way
          if (newStatus === "on_the_way") {
            console.log("Navigating to OrderOnTheWay page...");
            navigate(`/order-on-the-way/${id}`, { 
              state: { ...orderData, deliveryStatus: newStatus, driver: data.driver, driverLocation: data.driverLocation, customerLocation: data.customerLocation },
              replace: true 
            });
            return;
          }
          
          // Update status and navigate for other statuses
          if (newStatus !== deliveryStatus) {
            setDeliveryStatus(newStatus);
            
            if (newStatus === "delivered") {
              navigate(`/order-delivered/${id}`, { 
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

    const interval = setInterval(pollStatus, 2000);
    pollStatus();

    return () => clearInterval(interval);
  }, [orderId, orderData, deliveryStatus, navigate]);

  const handleClose = () => {
    navigate("/home");
  };

  const handleCallDriver = () => {
    if (driverInfo?.phone) {
      window.location.href = `tel:${driverInfo.phone}`;
    }
  };

  const handleViewOrder = () => {
    const id = orderId || orderData?.orderId;
    navigate(`/orders/${id}`);
  };

  if (loading) {
    return (
      <div className="order-pickedup-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="order-pickedup-container">
      {/* Progress bar */}
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: "70%" }}></div>
      </div>

      {/* Header */}
      <header className="pickedup-header">
        <button className="close-btn" onClick={handleClose}>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="header-actions">
          <button className="help-btn">Help</button>
        </div>
      </header>

      {/* Main Content */}
      <main className="pickedup-main">
        {/* Pickup Animation */}
        <div className="pickup-animation">
          <div className="pickup-icon">
            <div className="bag-wrapper">
              <span className="bag-emoji">🛍️</span>
              <div className="checkmark-badge">✓</div>
            </div>
          </div>
          <div className="motion-lines">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>

        {/* Title */}
        <div className="title-section">
          <h1>Order Picked Up!</h1>
          <p className="subtitle">
            Your order has been picked up by the driver from
          </p>
          <p className="restaurant-name">{orderData?.restaurantName || "Restaurant"}</p>
        </div>

        {/* Driver Card */}
        <div className="driver-card">
          <div className="driver-avatar">
            {driverInfo?.profile_photo_url ? (
              <img src={driverInfo.profile_photo_url} alt={driverInfo.full_name} />
            ) : (
              <div className="avatar-placeholder">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            )}
            <div className="online-badge"></div>
          </div>
          
          <div className="driver-info">
            <h3 className="driver-name">{driverInfo?.full_name || "Driver"}</h3>
            <p className="vehicle-info">
              {driverInfo?.vehicle_type || "Bike"} • {driverInfo?.vehicle_number || "---"}
            </p>
          </div>

          <button className="call-driver-btn" onClick={handleCallDriver}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </button>
        </div>

        {/* Delivery Info */}
        <div className="delivery-info-card">
          <div className="info-row">
            <div className="info-icon">📍</div>
            <div className="info-content">
              <span className="info-label">Delivering to</span>
              <span className="info-value">{orderData?.address || orderData?.order?.delivery_address || "Your location"}</span>
            </div>
          </div>
        </div>

        {/* Status Message */}
        <div className="status-message">
          <div className="message-icon">🚴</div>
          <p>Driver will start heading to you shortly...</p>
        </div>
      </main>

      {/* Bottom Action */}
      <div className="bottom-action">
        <button className="view-order-btn" onClick={handleViewOrder}>
          Track Order
        </button>
      </div>

      {/* Status Indicator */}
      <div className="status-indicator picked-up">
        <div className="status-dot"></div>
        <span>Order picked up from {orderData?.restaurantName || "restaurant"}</span>
      </div>
    </div>
  );
};

export default OrderPickedUp;
