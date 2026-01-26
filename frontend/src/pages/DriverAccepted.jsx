import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import "./DriverAccepted.css";

const DriverAccepted = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { orderId } = useParams();
  
  const [orderData, setOrderData] = useState(location.state || null);
  const [driverInfo, setDriverInfo] = useState(null);
  const [deliveryStatus, setDeliveryStatus] = useState("accepted");
  const [loading, setLoading] = useState(true);

  // Fetch order and driver data
  useEffect(() => {
    const fetchData = async () => {
      const id = orderId || orderData?.orderId;
      if (!id) return;
      
      const token = localStorage.getItem("token");
      
      try {
        // Fetch delivery status with driver info
        const response = await fetch(`http://localhost:5000/orders/${id}/delivery-status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (response.ok) {
          const data = await response.json();
          setDeliveryStatus(data.status);
          
          if (data.driver) {
            setDriverInfo(data.driver);
          }
          
          // Also update order data if not present
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
              });
            }
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
          
          // Update driver info if available
          if (data.driver) {
            setDriverInfo(data.driver);
          }
          
          if (newStatus !== deliveryStatus) {
            setDeliveryStatus(newStatus);
            
            // Navigate based on status
            if (newStatus === "picked_up") {
              navigate(`/order-picked-up/${id}`, { 
                state: { ...orderData, deliveryStatus: newStatus, driver: data.driver },
                replace: true 
              });
            } else if (newStatus === "on_the_way") {
              navigate(`/order-on-the-way/${id}`, { 
                state: { ...orderData, deliveryStatus: newStatus, driver: data.driver },
                replace: true 
              });
            } else if (newStatus === "delivered") {
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

    // Poll every 3 seconds
    const interval = setInterval(pollStatus, 3000);
    pollStatus(); // Initial poll

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
      <div className="driver-accepted-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading driver details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="driver-accepted-container">
      {/* Progress bar at top */}
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: "50%" }}></div>
      </div>

      {/* Header */}
      <header className="driver-header">
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
      <main className="driver-main">
        {/* Success Animation */}
        <div className="success-animation">
          <div className="check-circle">
            <svg viewBox="0 0 52 52">
              <circle className="check-circle-bg" cx="26" cy="26" r="25" fill="none"/>
              <path className="check-mark" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
            </svg>
          </div>
        </div>

        {/* Title */}
        <div className="title-section">
          <h1>Driver accepted your order!</h1>
          <p className="subtitle">Your delivery partner is on the way to the restaurant</p>
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
          </div>
          
          <div className="driver-details">
            <h2 className="driver-name">{driverInfo?.full_name || "Driver"}</h2>
            <div className="driver-rating">
              <span className="star">★</span>
              <span>4.9</span>
            </div>
          </div>
        </div>

        {/* Driver Info List */}
        <div className="info-list">
          {/* Phone */}
          <div className="info-item">
            <div className="info-icon phone-icon">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <div className="info-content">
              <span className="info-label">Phone</span>
              <span className="info-value">{driverInfo?.phone || "Not available"}</span>
            </div>
            {driverInfo?.phone && (
              <button className="call-btn" onClick={handleCallDriver}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </button>
            )}
          </div>

          {/* Vehicle Number */}
          <div className="info-item">
            <div className="info-icon vehicle-icon">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
              </svg>
            </div>
            <div className="info-content">
              <span className="info-label">Vehicle Number</span>
              <span className="info-value vehicle-number">{driverInfo?.vehicle_number || "Not available"}</span>
            </div>
          </div>

          {/* Vehicle Type */}
          <div className="info-item">
            <div className="info-icon type-icon">
              🏍️
            </div>
            <div className="info-content">
              <span className="info-label">Vehicle Type</span>
              <span className="info-value">{driverInfo?.vehicle_type || driverInfo?.driver_type || "Bike"}</span>
            </div>
          </div>
        </div>

        {/* Restaurant Info */}
        <div className="restaurant-info">
          <div className="restaurant-icon">🍽️</div>
          <div className="restaurant-text">
            <span className="heading-to">Heading to</span>
            <span className="restaurant-name">{orderData?.restaurantName || "Restaurant"}</span>
          </div>
        </div>
      </main>

      {/* Bottom Action */}
      <div className="bottom-action">
        <button className="view-order-btn" onClick={handleViewOrder}>
          View Order Details
        </button>
      </div>

      {/* Status Indicator */}
      <div className="status-indicator accepted">
        <div className="status-dot"></div>
        <span>Driver is heading to pick up your order</span>
      </div>
    </div>
  );
};

export default DriverAccepted;
