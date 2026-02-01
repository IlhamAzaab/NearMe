import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./OrderOnTheWay.css";
import "./DriverAccepted.css";

// Fix Leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Custom marker icons
const createCustomIcon = (color) =>
  new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

const driverIcon = createCustomIcon("blue");
const customerIcon = createCustomIcon("green");

// Component to auto-fit map bounds
function MapBounds({ positions }) {
  const map = useMap();

  useEffect(() => {
    if (positions && positions.length >= 2) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [positions, map]);

  return null;
}

const OrderOnTheWay = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { orderId: paramOrderId } = useParams();

  // Get order data from navigation state
  const orderData = location.state || {};
  const {
    orderId: stateOrderId,
    address = "Loading...",
    driver,
  } = orderData;

  const orderId = paramOrderId || stateOrderId;
  const [deliveryStatus, setDeliveryStatus] = useState("on_the_way");
  const [driverInfo, setDriverInfo] = useState(driver || null);
  const [estimatedTime, setEstimatedTime] = useState("10-15 min");
  const [driverLocation, setDriverLocation] = useState(null);
  const [customerLocation, setCustomerLocation] = useState(null);
  const [routePath, setRoutePath] = useState([]);
  const [mapReady, setMapReady] = useState(false);

  // Get customer location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCustomerLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.error("Error getting location:", error);
          // Default location if geolocation fails
          setCustomerLocation({ lat: 6.9271, lng: 79.8612 });
        }
      );
    } else {
      // Default location
      setCustomerLocation({ lat: 6.9271, lng: 79.8612 });
    }
  }, []);

  // Poll for status updates and driver location
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
            
            // Update driver location if available
            if (data.driver.current_lat && data.driver.current_lng) {
              setDriverLocation({
                lat: parseFloat(data.driver.current_lat),
                lng: parseFloat(data.driver.current_lng),
              });
            } else if (data.driver.latitude && data.driver.longitude) {
              setDriverLocation({
                lat: parseFloat(data.driver.latitude),
                lng: parseFloat(data.driver.longitude),
              });
            }
          }

          // Update driver location from separate field if available
          if (data.driverLocation) {
            setDriverLocation({
              lat: parseFloat(data.driverLocation.lat || data.driverLocation.latitude),
              lng: parseFloat(data.driverLocation.lng || data.driverLocation.longitude),
            });
          }

          if (data.estimated_time) {
            setEstimatedTime(data.estimated_time);
          }

          if (newStatus && newStatus !== deliveryStatus) {
            setDeliveryStatus(newStatus);

            // Navigate to delivered screen
            if (newStatus === "delivered") {
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

    const interval = setInterval(pollStatus, 3000); // Poll every 3 seconds for smoother tracking
    pollStatus();

    return () => clearInterval(interval);
  }, [orderId, deliveryStatus, navigate, orderData]);

  // Update route when driver or customer location changes
  useEffect(() => {
    if (driverLocation && customerLocation) {
      setRoutePath([
        [driverLocation.lat, driverLocation.lng],
        [customerLocation.lat, customerLocation.lng],
      ]);
      setMapReady(true);
    }
  }, [driverLocation, customerLocation]);

  // Handle copy phone number
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

  // Handle back navigation
  const handleBack = () => {
    navigate("/home");
  };

  // Default center for map
  const defaultCenter = customerLocation || { lat: 6.9271, lng: 79.8612 };

  // Get all positions for bounds
  const allPositions = [];
  if (driverLocation) allPositions.push([driverLocation.lat, driverLocation.lng]);
  if (customerLocation) allPositions.push([customerLocation.lat, customerLocation.lng]);

  return (
    <div className="order-on-the-way-screen">
      {/* ===== Live Map Background ===== */}
      <div className="live-map-container">
        {customerLocation && (
          <MapContainer
            center={[defaultCenter.lat, defaultCenter.lng]}
            zoom={14}
            style={{ height: "100%", width: "100%" }}
            zoomControl={false}
            attributionControl={false}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />

            {/* Auto-fit bounds when both markers are available */}
            {allPositions.length >= 2 && <MapBounds positions={allPositions} />}

            {/* Driver marker */}
            {driverLocation && (
              <Marker position={[driverLocation.lat, driverLocation.lng]} icon={driverIcon} />
            )}

            {/* Customer marker */}
            {customerLocation && (
              <Marker position={[customerLocation.lat, customerLocation.lng]} icon={customerIcon} />
            )}

            {/* Route line between driver and customer */}
            {routePath.length >= 2 && (
              <Polyline
                positions={routePath}
                color="#22c55e"
                weight={4}
                opacity={0.8}
                dashArray="10, 10"
              />
            )}
          </MapContainer>
        )}

        {/* Loading overlay while map loads */}
        {!mapReady && (
          <div className="map-loading-overlay">
            <div className="map-loading-spinner"></div>
            <p>Loading live tracking...</p>
          </div>
        )}
      </div>

      {/* Back button */}
      <button className="map-back-btn" onClick={handleBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* ===== Bottom Sheet ===== */}
      <div className="tracking-bottom-sheet">
        {/* Drag Handle */}
        <div className="sheet-handle"></div>

        {/* Status Header */}
        <div className="tracking-header">
          <div className="tracking-status-badge">
            <span className="status-dot pulsing"></span>
            <span>Live Tracking</span>
          </div>
          <h1 className="tracking-title">On The Way</h1>
          <p className="tracking-subtitle">Your driver is heading to your location</p>
        </div>

        {/* ETA Card */}
        <div className="eta-card-tracking">
          <div className="eta-icon-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <div className="eta-info">
            <span className="eta-label">Estimated arrival</span>
            <span className="eta-value">{estimatedTime}</span>
          </div>
        </div>

        {/* Driver Card */}
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
            <h3 className="driver-name">{driverInfo?.full_name || "Driver"}</h3>
            {(driverInfo?.vehicle_number || driverInfo?.license_plate) && (
              <div className="driver-vehicle-number">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="5.5" cy="17.5" r="2.5" />
                  <circle cx="18.5" cy="17.5" r="2.5" />
                  <path d="M15 6h4l3 4v7h-3M2 17h3V9.5L7 6h6v11" />
                </svg>
                <span>{driverInfo?.vehicle_number || driverInfo?.license_plate}</span>
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

        {/* Delivery Address */}
        <div className="delivery-address-card">
          <div className="address-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <div className="address-info">
            <span className="address-label">Delivering to</span>
            <span className="address-text">{address}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderOnTheWay;
