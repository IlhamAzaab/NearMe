import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import AnimatedAlert, { useAlert } from "../components/AnimatedAlert";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./OrderOnTheWay.css";
import "./DriverAccepted.css";

// Fix Leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Custom SVG icons for driver (motorcycle) and customer (home)
const driverIcon = L.divIcon({
  className: "custom-driver-icon",
  html: `<div style="background: white; border-radius: 50%; padding: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="5" cy="17" r="2"/>
      <circle cx="19" cy="17" r="2"/>
      <path d="M12 17h5l2-6H9l-2 2"/>
      <path d="M9 9l3-3 3 3"/>
      <path d="M12 6v6"/>
    </svg>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const customerIcon = L.divIcon({
  className: "custom-customer-icon",
  html: `<div style="background: white; border-radius: 50%; padding: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

// Component to auto-fit map bounds
function MapBounds({ positions }) {
  const map = useMap();
  const lastBoundsRef = useRef(null);

  useEffect(() => {
    if (positions && positions.length >= 2) {
      const boundsStr = JSON.stringify(positions);
      // Only fit bounds if they've changed significantly
      if (lastBoundsRef.current !== boundsStr) {
        lastBoundsRef.current = boundsStr;
        const bounds = L.latLngBounds(positions);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      }
    }
  }, [positions, map]);

  return null;
}

// Decode polyline from OSRM
function decodePolyline(encoded) {
  const coordinates = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push([lat / 1e5, lng / 1e5]);
  }
  return coordinates;
}

const OrderOnTheWay = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { orderId: paramOrderId } = useParams();

  // Get order data from navigation state
  const orderData = location.state || {};
  const { orderId: stateOrderId, address = "Loading...", driver } = orderData;

  const orderId = paramOrderId || stateOrderId;
  const [deliveryStatus, setDeliveryStatus] = useState("on_the_way");
  const [driverInfo, setDriverInfo] = useState(driver || null);
  const [estimatedTime, setEstimatedTime] = useState("10-15 min");
  const [driverLocation, setDriverLocation] = useState(null);
  const [deliveryAddress, setDeliveryAddress] = useState(null); // Customer's delivery address (not live location)
  const [deliveryAddressText, setDeliveryAddressText] = useState(address);
  const [routePath, setRoutePath] = useState([]);
  const [mapReady, setMapReady] = useState(false);
  const { alert, visible, showSuccess } = useAlert();
  const prevDriverLocRef = useRef(null);

  // Fetch route from OSRM
  const fetchRoute = useCallback(async (driverLoc, customerLoc) => {
    if (!driverLoc || !customerLoc) return;

    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${driverLoc.lng},${driverLoc.lat};${customerLoc.lng},${customerLoc.lat}?overview=full&geometries=polyline`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.code === "Ok" && data.routes?.[0]?.geometry) {
        const decoded = decodePolyline(data.routes[0].geometry);
        setRoutePath(decoded);

        // Update estimated time based on OSRM duration
        if (data.routes[0].duration) {
          const minutes = Math.ceil(data.routes[0].duration / 60);
          if (minutes <= 1) {
            setEstimatedTime("< 1 min");
          } else if (minutes <= 3) {
            setEstimatedTime("1-3 min");
          } else if (minutes <= 5) {
            setEstimatedTime("3-5 min");
          } else if (minutes <= 10) {
            setEstimatedTime("5-10 min");
          } else if (minutes <= 15) {
            setEstimatedTime("10-15 min");
          } else if (minutes <= 20) {
            setEstimatedTime("15-20 min");
          } else {
            setEstimatedTime(`~${minutes} min`);
          }
        }
      } else {
        // Fallback to straight line
        setRoutePath([
          [driverLoc.lat, driverLoc.lng],
          [customerLoc.lat, customerLoc.lng],
        ]);
      }
    } catch (err) {
      console.error("Error fetching route:", err);
      // Fallback to straight line
      setRoutePath([
        [driverLoc.lat, driverLoc.lng],
        [customerLoc.lat, customerLoc.lng],
      ]);
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
          },
        );

        if (response.ok) {
          const data = await response.json();
          const newStatus = data.status;

          // Update driver info
          if (data.driver) {
            setDriverInfo(data.driver);
          }

          // Update driver's live location
          if (data.driverLocation?.latitude && data.driverLocation?.longitude) {
            const newDriverLoc = {
              lat: parseFloat(data.driverLocation.latitude),
              lng: parseFloat(data.driverLocation.longitude),
            };
            setDriverLocation(newDriverLoc);

            // Check if driver moved significantly (10m) to refetch route
            const prevLoc = prevDriverLocRef.current;
            if (
              !prevLoc ||
              Math.abs(prevLoc.lat - newDriverLoc.lat) > 0.0001 ||
              Math.abs(prevLoc.lng - newDriverLoc.lng) > 0.0001
            ) {
              prevDriverLocRef.current = newDriverLoc;
            }
          }

          // Update customer's DELIVERY ADDRESS (not live location)
          if (
            data.customerLocation?.latitude &&
            data.customerLocation?.longitude
          ) {
            setDeliveryAddress({
              lat: parseFloat(data.customerLocation.latitude),
              lng: parseFloat(data.customerLocation.longitude),
            });
            if (data.customerLocation.address) {
              setDeliveryAddressText(data.customerLocation.address);
            }
          }

          if (data.estimatedDuration) {
            setEstimatedTime(`${data.estimatedDuration} min`);
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

  // Fetch route when driver or delivery address changes
  useEffect(() => {
    if (driverLocation && deliveryAddress) {
      fetchRoute(driverLocation, deliveryAddress);
      setMapReady(true);
    }
  }, [driverLocation, deliveryAddress, fetchRoute]);

  // Handle copy phone number
  const handleCopyPhone = async () => {
    if (driverInfo?.phone) {
      try {
        await navigator.clipboard.writeText(driverInfo.phone);
        showSuccess("Phone number copied to clipboard!");
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    }
  };

  // Handle back navigation
  const handleBack = () => {
    navigate("/");
  };

  // Default center for map (prefer delivery address, then driver, then default)
  const defaultCenter = deliveryAddress ||
    driverLocation || { lat: 6.9271, lng: 79.8612 };

  // Get all positions for bounds
  const allPositions = [];
  if (driverLocation)
    allPositions.push([driverLocation.lat, driverLocation.lng]);
  if (deliveryAddress)
    allPositions.push([deliveryAddress.lat, deliveryAddress.lng]);

  return (
    <div className="order-on-the-way-screen">
      <AnimatedAlert alert={alert} visible={visible} />
      {/* ===== Live Map Background ===== */}
      <div className="live-map-container">
        {(deliveryAddress || driverLocation) && (
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

            {/* Driver marker with live location */}
            {driverLocation && (
              <Marker
                position={[driverLocation.lat, driverLocation.lng]}
                icon={driverIcon}
              />
            )}

            {/* Customer DELIVERY ADDRESS marker (not live location) */}
            {deliveryAddress && (
              <Marker
                position={[deliveryAddress.lat, deliveryAddress.lng]}
                icon={customerIcon}
              />
            )}

            {/* Route polyline between driver and delivery address */}
            {routePath.length >= 2 && (
              <Polyline
                positions={routePath}
                color="#3b82f6"
                weight={5}
                opacity={0.9}
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
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            d="M19 12H5M12 19l-7-7 7-7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
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
          <p className="tracking-subtitle">
            Your driver is heading to your location
          </p>
        </div>

        {/* ETA Card */}
        <div className="eta-card-tracking">
          <div className="eta-icon-wrapper">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
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
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
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
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="5.5" cy="17.5" r="2.5" />
                  <circle cx="18.5" cy="17.5" r="2.5" />
                  <path d="M15 6h4l3 4v7h-3M2 17h3V9.5L7 6h6v11" />
                </svg>
                <span>
                  {driverInfo?.vehicle_number || driverInfo?.license_plate}
                </span>
              </div>
            )}
            {driverInfo?.phone && (
              <div className="driver-phone">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                </svg>
                <span>{driverInfo.phone}</span>
              </div>
            )}
          </div>

          {/* Copy Phone Button */}
          {driverInfo?.phone && (
            <button
              className="copy-phone-btn"
              onClick={handleCopyPhone}
              title="Copy phone number"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            </button>
          )}
        </div>

        {/* Delivery Address */}
        <div className="delivery-address-card">
          <div className="address-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <div className="address-info">
            <span className="address-label">Delivering to</span>
            <span className="address-text">{deliveryAddressText}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderOnTheWay;
