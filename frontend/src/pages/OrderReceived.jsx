import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import "./OrderReceived.css";

const OrderReceived = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { orderId } = useParams();
  
  const [orderData, setOrderData] = useState(location.state || null);
  const [deliveryStatus, setDeliveryStatus] = useState("pending");
  const [loading, setLoading] = useState(!location.state);

  // Fetch order data if not passed via state
  useEffect(() => {
    const fetchOrderData = async () => {
      if (!orderId && !orderData?.orderId) return;
      
      const id = orderId || orderData?.orderId;
      const token = localStorage.getItem("token");
      
      try {
        const response = await fetch(`http://localhost:5000/orders/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (response.ok) {
          const data = await response.json();
          setOrderData({
            order: data.order,
            orderId: data.order.id,
            orderNumber: data.order.order_number,
            restaurantName: data.order.restaurant_name,
            items: data.order.items || [],
            totalAmount: data.order.total_amount,
          });
          setDeliveryStatus(data.order.delivery?.status || "pending");
        }
      } catch (err) {
        console.error("Error fetching order:", err);
      } finally {
        setLoading(false);
      }
    };

    if (!orderData) {
      fetchOrderData();
    } else {
      setLoading(false);
    }
  }, [orderId, orderData]);

  // Poll for status changes
  useEffect(() => {
    if (!orderData?.orderId) return;

    const pollStatus = async () => {
      const token = localStorage.getItem("token");
      try {
        const response = await fetch(
          `http://localhost:5000/orders/${orderData.orderId}/delivery-status`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (response.ok) {
          const data = await response.json();
          const newStatus = data.status;
          
          if (newStatus !== deliveryStatus) {
            setDeliveryStatus(newStatus);
            
            // Navigate based on status
            if (newStatus === "accepted") {
              // Driver accepted - go to DriverAccepted page
              navigate(`/driver-accepted/${orderData.orderId}`, { 
                state: { ...orderData, deliveryStatus: newStatus, driver: data.driver },
                replace: true 
              });
            } else if (newStatus === "picked_up") {
              navigate(`/order-picked-up/${orderData.orderId}`, { 
                state: { ...orderData, deliveryStatus: newStatus },
                replace: true 
              });
            } else if (newStatus === "on_the_way") {
              navigate(`/order-on-the-way/${orderData.orderId}`, { 
                state: { ...orderData, deliveryStatus: newStatus },
                replace: true 
              });
            } else if (newStatus === "delivered") {
              navigate(`/order-delivered/${orderData.orderId}`, { 
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
  }, [orderData?.orderId, deliveryStatus, navigate]);

  // Calculate estimated arrival time
  const getEstimatedArrival = () => {
    const now = new Date();
    const estimatedMinutes = orderData?.order?.estimated_duration_min || 30;
    const arrivalTime = new Date(now.getTime() + (estimatedMinutes + 15) * 60000);
    return arrivalTime.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const handleClose = () => {
    navigate("/home");
  };

  const handleHelp = () => {
    // Could navigate to help/support page
    alert("Help & Support - Coming Soon");
  };

  const handleViewDetails = () => {
    navigate(`/orders/${orderData?.orderId}`);
  };

  if (loading) {
    return (
      <div className="order-received-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading order details...</p>
        </div>
      </div>
    );
  }

  /* =====================================================
     UI REDESIGN: Uber Eats "Order Received" Style
     - All existing logic, state, and data unchanged
     - Only JSX structure and CSS classes modified
     ===================================================== */

  return (
    <div className="order-received-container">
      {/* ===== Progress Bar (Uber-style thin line at top) ===== */}
      <div className="progress-bar-container">
        <div className="progress-bar-track">
          <div className="progress-bar-fill" style={{ width: '25%' }}></div>
        </div>
      </div>

      {/* ===== Header with Close Button ===== */}
      <header className="order-header">
        <button className="close-btn" onClick={handleClose} aria-label="Close">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="header-actions">
          <button className="help-btn" onClick={handleHelp}>
            Help
          </button>
        </div>
      </header>

      {/* ===== Main Content Area ===== */}
      <main className="order-main">
        {/* Title Section - "Order received" + ETA */}
        <div className="order-title-section">
          <h1 className="order-title">Order received</h1>
          <p className="estimated-arrival">
            Estimated arrival <strong>{getEstimatedArrival()}</strong>
          </p>
        </div>

        {/* Center Illustration Area */}
        <div className="order-illustration">
          <div className="illustration-container">
            {/* Placeholder illustration - restaurant preparing order */}
            <svg className="illustration-svg" viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Background circle */}
              <circle cx="100" cy="80" r="70" fill="#F0FDF4" />
              {/* Shopping bag */}
              <rect x="70" y="50" width="60" height="70" rx="8" fill="#10B981" />
              <rect x="75" y="55" width="50" height="10" rx="2" fill="#059669" />
              {/* Bag handles */}
              <path d="M85 50 C85 35, 115 35, 115 50" stroke="#059669" strokeWidth="4" fill="none" />
              {/* Checkmark */}
              <circle cx="130" cy="95" r="18" fill="#FFFFFF" stroke="#10B981" strokeWidth="3" />
              <path d="M122 95 L128 101 L140 89" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {/* Small decorative dots */}
              <circle cx="55" cy="60" r="4" fill="#D1FAE5" />
              <circle cx="150" cy="50" r="3" fill="#D1FAE5" />
              <circle cx="45" cy="100" r="5" fill="#D1FAE5" />
            </svg>
          </div>
        </div>

        {/* Order Items Preview (small thumbnails) */}
        <div className="order-items-preview">
          {orderData?.items?.slice(0, 3).map((item, idx) => (
            <div key={idx} className="item-preview">
              {item.food_image_url ? (
                <img src={item.food_image_url} alt={item.food_name || item.name} />
              ) : (
                <div className="item-placeholder">
                  <span>🍽️</span>
                </div>
              )}
            </div>
          ))}
          {orderData?.items?.length > 3 && (
            <div className="more-items">+{orderData.items.length - 3}</div>
          )}
        </div>
      </main>

      {/* ===== Bottom Floating Status Card ===== */}
      <div className="bottom-status-card" onClick={handleViewDetails}>
        <div className="status-card-content">
          <div className="restaurant-avatar">
            <span>{orderData?.restaurantName?.charAt(0) || "R"}</span>
          </div>
          <div className="restaurant-info">
            <h3 className="restaurant-name">{orderData?.restaurantName || "Restaurant"}</h3>
            <p className="restaurant-status">Preparing your order...</p>
          </div>
          <div className="chevron">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderReceived;
