import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import OrderMapLayout from "../components/OrderMapLayout";
import "./PlacingOrder.css";
import "./DriverAccepted.css";

// Progress steps for the order journey
const PROGRESS_STEPS = [
  { key: "placed", label: "Order placed" },
  { key: "pending", label: "Order received" },
  { key: "accepted", label: "Driver accepted" },
  { key: "picked_up", label: "Picked up" },
  { key: "on_the_way", label: "On the way" },
];

// Status content mapping
const STATUS_CONTENT = {
  picked_up: {
    title: "Order Picked Up",
    subtitle: "Your driver has collected your order from the restaurant.",
    icon: "package",
  },
};

const OrderPickedUp = () => {
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
    driver,
  } = orderData;

  const orderId = paramOrderId || stateOrderId;
  const [showDetails, setShowDetails] = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState("picked_up");
  const [driverInfo, setDriverInfo] = useState(driver || null);

  // Get current step index
  const getCurrentStepIndex = useCallback(() => {
    const statusMap = {
      placed: 0,
      pending: 1,
      accepted: 2,
      picked_up: 3,
      on_the_way: 4,
    };
    return statusMap[deliveryStatus] ?? 3;
  }, [deliveryStatus]);

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

          if (data.driver) {
            setDriverInfo(data.driver);
          }

          if (newStatus && newStatus !== deliveryStatus) {
            setDeliveryStatus(newStatus);

            // Navigate to appropriate screen based on status
            if (newStatus === "on_the_way") {
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

  // Handle view order details
  const handleViewDetails = () => {
    setShowDetails(!showDetails);
  };

  // Handle copy phone number to clipboard
  const handleCopyPhone = async () => {
    if (driverInfo?.phone) {
      try {
        await navigator.clipboard.writeText(driverInfo.phone);
        alert('Phone number copied to clipboard!');
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  const handleBack = () => {
    navigate("/home");
  };

  // Calculate arrival time range
  const getArrivalTimeRange = () => {
    const now = new Date();
    const start = new Date(now.getTime() + 15 * 60000);
    const end = new Date(now.getTime() + 25 * 60000);
    const format = (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: false });
    return `${format(start)} – ${format(end)}`;
  };

  const statusContent = STATUS_CONTENT.picked_up;
  const currentStepIndex = getCurrentStepIndex();

  return (
    <OrderMapLayout
      title={statusContent.title}
      arrivalTimeText={getArrivalTimeRange()}
      stepIndex={currentStepIndex}
      deliveryAddress={address}
      actionButtons={[]}
      onBack={handleBack}
    >
      {/* ===== Driver Profile Card ===== */}
      <div className="driver-card">
        {/* Driver Avatar */}
        <div className="driver-avatar">
          {driverInfo?.photo_url ? (
            <img 
              src={driverInfo.photo_url} 
              alt={driverInfo.full_name || "Driver"} 
              className="driver-avatar-img"
            />
          ) : (
            <div className="driver-avatar-default">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="8" r="4" />
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              </svg>
            </div>
          )}
        </div>

        {/* Driver Info */}
        <div className="driver-info">
          <h3 className="driver-name">
            {driverInfo?.full_name || "Driver"}
          </h3>
          {(driverInfo?. driverInfo?.license_plate) && (
            <div className="driver-vehicle-number">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="5.5" cy="17.5" r="2.5" />
                <circle cx="18.5" cy="17.5" r="2.5" />
                <path d="M15 6h4l3 4v7h-3M2 17h3V9.5L7 6h6v11" />
              </svg>
              <span>{driverInfo?.vehicle_number || driverInfo?.license_plate}</span>
            </div>
          )}
          {driverInfo?.rating && (
            <div className="driver-rating">
              <svg viewBox="0 0 24 24" fill="#FFC107" stroke="none">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <span>{parseFloat(driverInfo.rating).toFixed(1)}</span>
            </div>
          )}
          {driverInfo?.phone && (
            <div className="driver-phone">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
              </svg>
              <span>{driverInfo.phone}</span>
            </div>
          )}
        </div>

        {/* Copy Phone Button */}
        {driverInfo?.phone && (
          <button className="copy-phone-btn" onClick={handleCopyPhone} title="Copy phone number">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          </button>
        )}
      </div>

      {/* ===== Vehicle Info Card ===== */}
      <div className="vehicle-card">
        {/* Vehicle Image */}
        <div className="vehicle-image">
          {driverInfo?.vehicle_image_url ? (
            <img 
              src={driverInfo.vehicle_image_url} 
              alt="Vehicle" 
              className="vehicle-img"
            />
          ) : (
            <div className="vehicle-image-default">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="5.5" cy="17.5" r="3.5" />
                <circle cx="18.5" cy="17.5" r="3.5" />
                <path d="M15 6h4l3 5-2.5 3M7.5 17.5h7M5.5 14l1-5h5l2 5" />
                <path d="M12 9v5" />
              </svg>
            </div>
          )}
        </div>

        {/* Vehicle Details */}
        <div className="vehicle-details">
          <div className="vehicle-row">
            <span className="vehicle-label">Vehicle</span>
            <span className="vehicle-value">{driverInfo?.vehicle_type || "Motorbike"}</span>
          </div>
          <div className="vehicle-row">
            <span className="vehicle-label">Plate Number</span>
            <span className="vehicle-plate">{driverInfo?.vehicle_number || driverInfo?.license_plate || "---"}</span>
          </div>
          {driverInfo?.vehicle_color && (
            <div className="vehicle-row">
              <span className="vehicle-label">Color</span>
              <span className="vehicle-value">{driverInfo.vehicle_color}</span>
            </div>
          )}
        </div>
      </div>
    </OrderMapLayout>
  );
};

export default OrderPickedUp;
