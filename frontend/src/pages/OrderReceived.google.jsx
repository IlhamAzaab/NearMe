import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { PROGRESS_STEPS } from "../config/orderStatusConfig";
import "./OrderReceived.css";

// Google Maps API key
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

// Google Maps libraries
const GOOGLE_MAPS_LIBRARIES = ["places", "geometry", "maps"];

// Map container style
const mapContainerStyle = {
  width: "100%",
  height: "100%",
};

// Map options - enable dragging for user interaction
const mapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: false,
  gestureHandling: "greedy",
};

const OrderReceived = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { orderId: paramOrderId } = useParams();

  // Get order data from navigation state
  const orderData = location.state || {};
  const {
    orderId: stateOrderId,
    restaurantName: stateRestaurantName = "Restaurant",
    restaurantLogo = null,
    items: stateItems = [],
    totalAmount: stateTotalAmount,
    address: stateAddress = "Old Dartiains board house",
    orderNumber: stateOrderNumber,
    order: stateOrder,
  } = orderData;

  // Get logo URL from order data or order object
  const logoUrl =
    restaurantLogo ||
    stateOrder?.restaurant?.logo_url ||
    stateOrder?.logo_url ||
    null;

  const orderId = paramOrderId || stateOrderId;
  const [deliveryStatus, setDeliveryStatus] = useState("pending");
  const [loading, setLoading] = useState(false);
  const [viewOrderExpanded, setViewOrderExpanded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // State for fetched order data (with coordinates)
  const [fetchedOrder, setFetchedOrder] = useState(null);

  // Use fetched order if available, otherwise fall back to state order
  const order = fetchedOrder || stateOrder;
  const restaurantName = fetchedOrder?.restaurant_name || stateRestaurantName;
  const items = fetchedOrder?.items || stateItems;
  const totalAmount = fetchedOrder?.total_amount || stateTotalAmount;
  const address = fetchedOrder?.delivery_address || stateAddress;
  const orderNumber = fetchedOrder?.order_number || stateOrderNumber;

  // Map state
  const mapRef = useRef(null);
  const curveRef = useRef(null);
  const animationRef = useRef(null);

  // Helper to check if a value is a valid finite number
  const isValidCoord = (val) =>
    val !== null &&
    val !== undefined &&
    !isNaN(parseFloat(val)) &&
    isFinite(parseFloat(val));

  // Get location data from order - with proper validation
  const restaurantLocation =
    order &&
    isValidCoord(order.restaurant_latitude) &&
    isValidCoord(order.restaurant_longitude)
      ? {
          lat: parseFloat(order.restaurant_latitude),
          lng: parseFloat(order.restaurant_longitude),
        }
      : null;

  const customerLocation =
    order &&
    isValidCoord(order.delivery_latitude) &&
    isValidCoord(order.delivery_longitude)
      ? {
          lat: parseFloat(order.delivery_latitude),
          lng: parseFloat(order.delivery_longitude),
        }
      : null;

  // Check if we have valid locations for the map
  const hasValidLocations =
    restaurantLocation !== null && customerLocation !== null;

  // Load Google Maps API
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  // Default center (Sri Lanka)
  const defaultCenter = { lat: 7.8731, lng: 80.7718 };

  // Calculate map center (midpoint between restaurant and customer)
  const getMapCenter = useCallback(() => {
    if (hasValidLocations) {
      return {
        lat: (restaurantLocation.lat + customerLocation.lat) / 2,
        lng: (restaurantLocation.lng + customerLocation.lng) / 2,
      };
    }
    return defaultCenter;
  }, [hasValidLocations, restaurantLocation, customerLocation]);

  // Calculate appropriate zoom level based on distance
  const getZoomLevel = useCallback(() => {
    if (!hasValidLocations) return 13;

    const latDiff = Math.abs(restaurantLocation.lat - customerLocation.lat);
    const lngDiff = Math.abs(restaurantLocation.lng - customerLocation.lng);
    const maxDiff = Math.max(latDiff, lngDiff);

    if (maxDiff > 0.1) return 11;
    if (maxDiff > 0.05) return 12;
    if (maxDiff > 0.02) return 13;
    if (maxDiff > 0.01) return 14;
    return 15;
  }, [hasValidLocations, restaurantLocation, customerLocation]);

  // Generate curved path points between two locations
  const generateCurvedPath = useCallback((start, end, numPoints = 50) => {
    if (!start || !end) return [];

    const points = [];

    // Calculate midpoint
    const midLat = (start.lat + end.lat) / 2;
    const midLng = (start.lng + end.lng) / 2;

    // Calculate perpendicular offset for curve (arc height)
    const dx = end.lng - start.lng;
    const dy = end.lat - start.lat;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Curve offset (perpendicular to the line) - adjust multiplier for curve intensity
    const curveIntensity = distance * 0.3;
    const perpX = (-dy / distance) * curveIntensity;
    const perpY = (dx / distance) * curveIntensity;

    // Control point for quadratic bezier curve
    const controlPoint = {
      lat: midLat + perpY,
      lng: midLng + perpX,
    };

    // Generate points along quadratic bezier curve
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const oneMinusT = 1 - t;

      // Quadratic bezier formula: B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
      const lat =
        oneMinusT * oneMinusT * start.lat +
        2 * oneMinusT * t * controlPoint.lat +
        t * t * end.lat;
      const lng =
        oneMinusT * oneMinusT * start.lng +
        2 * oneMinusT * t * controlPoint.lng +
        t * t * end.lng;

      points.push({ lat, lng });
    }

    return points;
  }, []);

  // Draw animated curved line on map
  const drawAnimatedCurve = useCallback(() => {
    if (!mapRef.current || !hasValidLocations || !window.google) return;

    // Clear existing curve
    if (curveRef.current) {
      curveRef.current.setMap(null);
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const curvedPath = generateCurvedPath(customerLocation, restaurantLocation);
    if (curvedPath.length === 0) return;

    // Create the curved polyline
    const curve = new window.google.maps.Polyline({
      path: curvedPath,
      geodesic: false,
      strokeColor: "#1a1a1a",
      strokeOpacity: 0,
      strokeWeight: 3,
      icons: [
        {
          icon: {
            path: "M 0,-1 0,1",
            strokeOpacity: 1,
            strokeColor: "#1a1a1a",
            scale: 3,
          },
          offset: "0",
          repeat: "15px",
        },
      ],
      map: mapRef.current,
    });

    curveRef.current = curve;

    // Animate the dashed line
    let offset = 0;
    const animate = () => {
      offset = (offset + 0.5) % 200;
      const icons = curve.get("icons");
      icons[0].offset = offset / 10 + "%";
      curve.set("icons", icons);
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();
  }, [
    hasValidLocations,
    restaurantLocation,
    customerLocation,
    generateCurvedPath,
  ]);

  // Handle map load
  const onMapLoad = useCallback(
    (map) => {
      mapRef.current = map;

      // Fit bounds to show both markers only if we have valid locations
      if (hasValidLocations) {
        const bounds = new window.google.maps.LatLngBounds();
        bounds.extend(restaurantLocation);
        bounds.extend(customerLocation);
        map.fitBounds(bounds, { top: 50, bottom: 200, left: 50, right: 50 });

        // Draw the animated curve after a short delay
        setTimeout(() => {
          drawAnimatedCurve();
        }, 500);
      }
    },
    [
      hasValidLocations,
      restaurantLocation,
      customerLocation,
      drawAnimatedCurve,
    ],
  );

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (curveRef.current) {
        curveRef.current.setMap(null);
      }
    };
  }, []);

  // Fetch order data with coordinates if not available from state
  useEffect(() => {
    const fetchOrderData = async () => {
      if (!orderId) return;

      // Skip if we already have valid coordinates from state
      if (
        stateOrder &&
        isValidCoord(stateOrder.restaurant_latitude) &&
        isValidCoord(stateOrder.restaurant_longitude) &&
        isValidCoord(stateOrder.delivery_latitude) &&
        isValidCoord(stateOrder.delivery_longitude)
      ) {
        console.log("Using coordinates from state:", stateOrder);
        return;
      }

      try {
        const token = localStorage.getItem("token");
        const response = await fetch(
          `http://localhost:5000/orders/${orderId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (response.ok) {
          const data = await response.json();
          if (data.order) {
            console.log("Fetched order with coordinates:", data.order);
            setFetchedOrder(data.order);
          }
        }
      } catch (err) {
        console.error("Error fetching order data:", err);
      }
    };

    fetchOrderData();
  }, [orderId, stateOrder]);

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
    const format = (d) =>
      d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: false,
      });
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
          },
        );

        if (response.ok) {
          const data = await response.json();
          const newStatus = data.status;

          if (newStatus && newStatus !== deliveryStatus) {
            setDeliveryStatus(newStatus);

            // Navigate to appropriate screen based on status
            if (newStatus === "accepted") {
              navigate(`/driver-accepted/${orderId}`, {
                state: {
                  ...orderData,
                  deliveryStatus: newStatus,
                  driver: data.driver,
                },
                replace: true,
              });
            } else if (newStatus === "picked_up") {
              navigate(`/order-picked-up/${orderId}`, {
                state: {
                  ...orderData,
                  deliveryStatus: newStatus,
                  driver: data.driver,
                },
                replace: true,
              });
            } else if (newStatus === "on_the_way") {
              navigate(`/order-on-the-way/${orderId}`, {
                state: {
                  ...orderData,
                  deliveryStatus: newStatus,
                  driver: data.driver,
                },
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
    <div className="order-received-screen">
      {/* ===== Google Map Background ===== */}
      <div className="map-container-full">
        {isLoaded && hasValidLocations ? (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={getMapCenter()}
            zoom={getZoomLevel()}
            options={mapOptions}
            onLoad={onMapLoad}
          >
            {/* Restaurant Marker - Home Icon */}
            {restaurantLocation && (
              <Marker
                position={restaurantLocation}
                icon={{
                  url:
                    "data:image/svg+xml;charset=UTF-8," +
                    encodeURIComponent(`
                    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0in the orders page for customers 0 24 24" fill="#1a1a1a">
                      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
                    </svg>
                  `),
                  scaledSize: new window.google.maps.Size(36, 36),
                  anchor: new window.google.maps.Point(18, 36),
                }}
                title={restaurantName}
              />
            )}

            {/* Customer Marker - Location Pin Icon */}
            {customerLocation && (
              <Marker
                position={customerLocation}
                icon={{
                  url:
                    "data:image/svg+xml;charset=UTF-8," +
                    encodeURIComponent(`
                    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="#1a1a1a">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                    </svg>
                  `),
                  scaledSize: new window.google.maps.Size(36, 36),
                  anchor: new window.google.maps.Point(18, 36),
                }}
                title="Your Location"
              />
            )}
          </GoogleMap>
        ) : loadError ? (
          <div className="map-error">
            <p>Failed to load map</p>
          </div>
        ) : !hasValidLocations ? (
          <div className="map-placeholder">
            <div className="map-placeholder-content">
              <svg
                className="map-placeholder-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p>Location data loading...</p>
            </div>
          </div>
        ) : (
          <div className="map-loading">
            <div className="map-spinner"></div>
          </div>
        )}
      </div>

      {/* Back Button */}
      <button className="header-back-btn" onClick={handleBack}>
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

      {/* ===== Cooking Animation Above Bottom Sheet ===== */}
      <div className="cooking-animation-container">
        <div className="cooking-scene">
          {/* Steam/Vapor */}
          <div className="steam-container">
            <div className="steam steam-1"></div>
            <div className="steam steam-2"></div>
            <div className="steam steam-3"></div>
          </div>

          {/* Pan */}
          <div className="pan-container">
            <div className="pan">
              <div className="pan-inner"></div>
            </div>
            <div className="pan-handle"></div>
          </div>

          {/* Pepper Shaker */}
          <div className="pepper-shaker">
            <div className="pepper-top"></div>
            <div className="pepper-body"></div>
            <div className="pepper-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>

          {/* Falling Pepper Particles */}
          <div className="pepper-particles">
            <span className="particle p1"></span>
            <span className="particle p2"></span>
            <span className="particle p3"></span>
            <span className="particle p4"></span>
            <span className="particle p5"></span>
          </div>
        </div>
      </div>

      {/* ===== Bottom Sheet Card ===== */}
      <div className="bottom-sheet-card">
        {/* Handle */}
        <div className="sheet-handle"></div>

        {/* Main Heading */}
        <h1 className="main-heading">Preparing your order…</h1>

        {/* Arrival Time */}
        <div className="arrival-row">
          <span className="arrival-text">Arrives</span>
          <span className="arrival-time">{getArrivalTimeRange()}</span>
          <svg
            className="info-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
        </div>

        {/* Segmented Progress Bar */}
        <div className="segmented-progress">
          {PROGRESS_STEPS.map((step, idx) => {
            let segmentClass = "progress-segment";
            if (idx < stepIndex) {
              segmentClass += " completed";
            } else if (idx === stepIndex) {
              segmentClass += " current";
            }
            return <div key={step.key} className={segmentClass} />;
          })}
        </div>

        {/* Delivery Details Section */}
        <div className="delivery-section">
          <p className="section-title">Delivery details</p>
          <p className="delivery-address">Meet at my door at {address}</p>
        </div>

        {/* View Order Button and Details */}
        <div className="view-order-section">
          <button
            className={`view-order-btn ${viewOrderExpanded ? "expanded" : ""}`}
            onClick={handleToggleViewOrder}
          >
            <div className="view-order-left">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>View Order</span>
            </div>
            <svg
              className={`chevron ${viewOrderExpanded ? "rotated" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                d="M19 9l-7 7-7-7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {/* Expandable Order Details */}
          {viewOrderExpanded && (
            <div className="order-details-expanded">
              {/* Restaurant Info */}
              <div className="order-detail-row">
                <span className="detail-label-text">Restaurant</span>
                <span className="detail-value-text">{restaurantName}</span>
              </div>

              {/* Order Number */}
              {orderNumber && (
                <div className="order-detail-row">
                  <span className="detail-label-text">Order #</span>
                  <span className="detail-value-text">#{orderNumber}</span>
                </div>
              )}

              {/* Items */}
              {items && items.length > 0 && (
                <div className="order-items-section">
                  <span className="detail-label-text">Items</span>
                  <div className="items-list">
                    {items.map((item, idx) => (
                      <div key={idx} className="item-detail-row">
                        <div className="item-left">
                          <span className="item-qty">{item.quantity}×</span>
                          <span className="item-name-text">{item.name}</span>
                        </div>
                        <span className="item-price-text">
                          LKR {(item.price * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Total */}
              <div className="order-detail-row total-row">
                <span className="detail-label-text">Total</span>
                <span className="detail-value-text total-amount">
                  LKR {parseFloat(displayTotal).toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderReceived;
