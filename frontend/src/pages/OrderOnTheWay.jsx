import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./OrderOnTheWay.css";

// Fix Leaflet default marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const OrderOnTheWay = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { orderId } = useParams();
  
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const routeLayerRef = useRef(null);
  const markersRef = useRef({});
  
  const [orderData, setOrderData] = useState(location.state || null);
  const [driverInfo, setDriverInfo] = useState(location.state?.driver || null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [customerLocation, setCustomerLocation] = useState(null);
  const [deliveryStatus, setDeliveryStatus] = useState("on_the_way");
  const [routeInfo, setRouteInfo] = useState({ distance: null, duration: null });
  const [loading, setLoading] = useState(true);
  const [eta, setEta] = useState(null);

  // Fetch initial data
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
          
          if (data.driverLocation) {
            setDriverLocation(data.driverLocation);
          }
          
          if (data.customerLocation) {
            setCustomerLocation(data.customerLocation);
          }
          
          if (data.estimatedDuration) {
            setEta(data.estimatedDuration);
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

  // Poll for status and location updates
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
          
          if (data.driver) {
            setDriverInfo(data.driver);
          }
          
          // Update driver location for live tracking
          if (data.driverLocation) {
            setDriverLocation(data.driverLocation);
          }
          
          if (newStatus !== deliveryStatus) {
            setDeliveryStatus(newStatus);
            
            // Navigate when delivered
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

    // Poll every 3 seconds for live tracking
    const interval = setInterval(pollStatus, 3000);
    pollStatus();

    return () => clearInterval(interval);
  }, [orderId, orderData, deliveryStatus, navigate]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || loading) return;

    // Initialize map if not already done
    if (!mapInstanceRef.current) {
      // Default center (will be updated when locations are available)
      mapInstanceRef.current = L.map(mapRef.current).setView([30.2, 71.5], 14);
      
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(mapInstanceRef.current);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [loading]);

  // Draw route using OSRM
  const drawRoute = useCallback(async () => {
    if (!mapInstanceRef.current || !driverLocation || !customerLocation) return;
    
    const map = mapInstanceRef.current;
    
    // Remove old route
    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
    }
    
    // Remove old markers
    Object.values(markersRef.current).forEach((marker) => {
      if (marker) map.removeLayer(marker);
    });
    markersRef.current = {};

    try {
      // Fetch route from OSRM
      const routeUrl = `https://router.project-osrm.org/route/v1/driving/${driverLocation.longitude},${driverLocation.latitude};${customerLocation.longitude},${customerLocation.latitude}?geometries=geojson&overview=full`;
      const response = await fetch(routeUrl);
      const data = await response.json();

      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const coordinates = route.geometry.coordinates.map((c) => [c[1], c[0]]);

        // Draw route polyline
        routeLayerRef.current = L.polyline(coordinates, {
          color: "#FF7A00",
          weight: 5,
          opacity: 0.9,
        }).addTo(map);

        // Update route info
        const distanceKm = (route.distance / 1000).toFixed(1);
        const durationMin = Math.ceil(route.duration / 60);
        setRouteInfo({ distance: distanceKm, duration: durationMin });
        setEta(durationMin);
      }

      // Add driver marker (moving)
      const driverIcon = L.divIcon({
        className: 'driver-marker',
        html: `<div class="driver-marker-inner">🛵</div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });
      
      markersRef.current.driver = L.marker(
        [driverLocation.latitude, driverLocation.longitude],
        { icon: driverIcon }
      )
        .addTo(map)
        .bindPopup(`<strong>${driverInfo?.full_name || "Driver"}</strong><br>On the way to you`);

      // Add customer marker (destination)
      const customerIcon = L.divIcon({
        className: 'customer-marker',
        html: `<div class="customer-marker-inner">🏠</div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 40],
      });
      
      markersRef.current.customer = L.marker(
        [customerLocation.latitude, customerLocation.longitude],
        { icon: customerIcon }
      )
        .addTo(map)
        .bindPopup(`<strong>Your Location</strong><br>${customerLocation.address || "Delivery address"}`);

      // Fit bounds to show both markers
      const group = new L.featureGroup([
        markersRef.current.driver,
        markersRef.current.customer,
      ]);
      map.fitBounds(group.getBounds().pad(0.2));

    } catch (error) {
      console.error("Route drawing error:", error);
    }
  }, [driverLocation, customerLocation, driverInfo]);

  // Update map when locations change
  useEffect(() => {
    if (driverLocation && customerLocation && mapInstanceRef.current) {
      drawRoute();
    }
  }, [driverLocation, customerLocation, drawRoute]);

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
      <div className="order-ontheway-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading tracking...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="order-ontheway-container">
      {/* Map Container */}
      <div className="map-section">
        <div ref={mapRef} className="map-container"></div>
        
        {/* Map Overlay Header */}
        <div className="map-header">
          <button className="close-btn" onClick={handleClose}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <button className="help-btn">Help</button>
        </div>

        {/* ETA Badge */}
        {eta && (
          <div className="eta-badge">
            <span className="eta-time">{eta}</span>
            <span className="eta-label">min</span>
          </div>
        )}
      </div>

      {/* Bottom Sheet */}
      <div className="bottom-sheet">
        <div className="sheet-handle"></div>
        
        {/* Status Header */}
        <div className="status-header">
          <div className="status-icon">🛵</div>
          <div className="status-text">
            <h2>On the way!</h2>
            <p>Your driver is heading to you</p>
          </div>
        </div>

        {/* Route Info */}
        {routeInfo.distance && (
          <div className="route-info">
            <div className="route-item">
              <span className="route-value">{routeInfo.distance}</span>
              <span className="route-label">km away</span>
            </div>
            <div className="route-divider"></div>
            <div className="route-item">
              <span className="route-value">{routeInfo.duration}</span>
              <span className="route-label">min ETA</span>
            </div>
          </div>
        )}

        {/* Driver Card */}
        <div className="driver-card">
          <div className="driver-avatar">
            {driverInfo?.profile_photo_url ? (
              <img src={driverInfo.profile_photo_url} alt={driverInfo.full_name} />
            ) : (
              <div className="avatar-placeholder">
                <span>🧑</span>
              </div>
            )}
          </div>
          
          <div className="driver-info">
            <h3 className="driver-name">{driverInfo?.full_name || "Driver"}</h3>
            <p className="vehicle-info">
              {driverInfo?.vehicle_type || "Bike"} • {driverInfo?.vehicle_number || "---"}
            </p>
          </div>

          <button className="call-btn" onClick={handleCallDriver}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </button>
        </div>

        {/* Delivery Details */}
        <div className="delivery-details">
          <div className="detail-row">
            <span className="detail-icon">🍽️</span>
            <div className="detail-content">
              <span className="detail-label">From</span>
              <span className="detail-value">{orderData?.restaurantName || "Restaurant"}</span>
            </div>
          </div>
          <div className="detail-row">
            <span className="detail-icon">📍</span>
            <div className="detail-content">
              <span className="detail-label">Delivering to</span>
              <span className="detail-value">{customerLocation?.address || orderData?.address || "Your location"}</span>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button className="action-btn" onClick={handleViewOrder}>
          View Order Details
        </button>
      </div>
    </div>
  );
};

export default OrderOnTheWay;
