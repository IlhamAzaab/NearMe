/**
 * Leaflet Delivery Map Component
 * Renders the map with driver, restaurant, and customer markers
 * Displays optimized route polyline with live updates
 */
import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

// OpenStreetMap tile URL
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// Map container style
const mapContainerStyle = {
  width: "100%",
  height: "100%",
};

// Default center (Colombo, Sri Lanka)
const defaultCenter = [6.9271, 79.8612];

// Custom marker icon using SVG with emoji
const createMarkerIcon = (emoji, bgColor) => {
  return L.divIcon({
    className: "custom-emoji-marker",
    html: `<div style="
      width: 44px;
      height: 44px;
      background-color: ${bgColor};
      border: 3px solid white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    ">${emoji}</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
  });
};

// Pre-created icons
const driverIcon = createMarkerIcon("🚗", "#3B82F6");
const restaurantIcon = createMarkerIcon("🍽️", "#EF4444");
const customerIcon = createMarkerIcon("🏠", "#10B981");
const pickupMarkerIcon = createMarkerIcon("🍽️", "#FCA5A5");
const deliveryMarkerIcon = createMarkerIcon("🏠", "#6EE7B7");

// Component to handle map bounds fitting
function FitBoundsHandler({
  driverLocation,
  currentTarget,
  mode,
  additionalMarkers,
  hasInitiallyFitted,
  setHasInitiallyFitted,
  userHasInteracted,
}) {
  const map = useMap();

  useEffect(() => {
    if (!driverLocation || hasInitiallyFitted || userHasInteracted) return;

    const bounds = L.latLngBounds([]);

    // Add driver location
    bounds.extend([driverLocation.lat, driverLocation.lng]);

    // Add current target based on mode
    if (mode === "pickup" && currentTarget?.restaurant) {
      bounds.extend([
        currentTarget.restaurant.latitude,
        currentTarget.restaurant.longitude,
      ]);
    } else if (mode === "delivery" && currentTarget?.customer) {
      bounds.extend([
        currentTarget.customer.latitude,
        currentTarget.customer.longitude,
      ]);
    }

    // Add additional markers
    additionalMarkers.forEach((marker) => {
      if (marker.lat && marker.lng) {
        bounds.extend([marker.lat, marker.lng]);
      }
    });

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [60, 60] });
      setHasInitiallyFitted(true);
    }
  }, [
    driverLocation,
    currentTarget,
    mode,
    additionalMarkers,
    hasInitiallyFitted,
    setHasInitiallyFitted,
    userHasInteracted,
    map,
  ]);

  return null;
}

function GoogleDeliveryMap({
  driverLocation,
  currentTarget,
  mode, // 'pickup' or 'delivery'
  directionsResult,
  onMapLoad,
  userHasInteracted,
  onUserInteraction,
  setRecenterFn,
  additionalMarkers = [], // For multi-delivery display
}) {
  const mapRef = useRef(null);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [hasInitiallyFitted, setHasInitiallyFitted] = useState(false);

  // Get route path from directions result
  const routePath =
    directionsResult?.routes?.[0]?.overview_path?.map((p) => [p.lat, p.lng]) ||
    directionsResult?.routes?.[0]?.legs?.flatMap(
      (leg) =>
        leg.steps?.flatMap(
          (step) => step.path?.map((p) => [p.lat, p.lng]) || [],
        ) || [],
    ) ||
    [];

  // Get restaurant position
  const restaurantPosition =
    mode === "pickup" && currentTarget?.restaurant
      ? [currentTarget.restaurant.latitude, currentTarget.restaurant.longitude]
      : null;

  // Get customer position
  const customerPosition =
    mode === "delivery" && currentTarget?.customer
      ? [currentTarget.customer.latitude, currentTarget.customer.longitude]
      : null;

  // Route polyline color based on mode
  const routeColor = mode === "pickup" ? "#EF4444" : "#10B981";

  // Expose recenter function to parent
  useEffect(() => {
    if (setRecenterFn && mapRef.current) {
      setRecenterFn(() => {
        const map = mapRef.current;
        if (!map) return;

        const bounds = L.latLngBounds([]);
        if (driverLocation)
          bounds.extend([driverLocation.lat, driverLocation.lng]);
        if (restaurantPosition) bounds.extend(restaurantPosition);
        if (customerPosition) bounds.extend(customerPosition);
        additionalMarkers.forEach((m) => {
          if (m.lat && m.lng) bounds.extend([m.lat, m.lng]);
        });
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [60, 60] });
        }
      });
    }
  }, [
    setRecenterFn,
    driverLocation,
    restaurantPosition,
    customerPosition,
    additionalMarkers,
  ]);

  return (
    <MapContainer
      center={
        driverLocation
          ? [driverLocation.lat, driverLocation.lng]
          : defaultCenter
      }
      zoom={14}
      style={mapContainerStyle}
      zoomControl={true}
      attributionControl={false}
      ref={mapRef}
      whenReady={() => onMapLoad?.(mapRef.current)}
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />

      <FitBoundsHandler
        driverLocation={driverLocation}
        currentTarget={currentTarget}
        mode={mode}
        additionalMarkers={additionalMarkers}
        hasInitiallyFitted={hasInitiallyFitted}
        setHasInitiallyFitted={setHasInitiallyFitted}
        userHasInteracted={userHasInteracted}
      />

      {/* Driver Marker - Updates every 3 seconds */}
      {driverLocation && (
        <Marker
          position={[driverLocation.lat, driverLocation.lng]}
          icon={driverIcon}
          eventHandlers={{
            click: () => setSelectedMarker("driver"),
          }}
        >
          {selectedMarker === "driver" && (
            <Popup onClose={() => setSelectedMarker(null)}>
              <div className="p-2">
                <p className="font-bold text-gray-800">📍 Your Location</p>
                <p className="text-sm text-gray-600">Live tracking active</p>
              </div>
            </Popup>
          )}
        </Marker>
      )}

      {/* Restaurant Marker (Pickup Mode) */}
      {restaurantPosition && (
        <Marker
          position={restaurantPosition}
          icon={restaurantIcon}
          eventHandlers={{
            click: () => setSelectedMarker("restaurant"),
          }}
        >
          {selectedMarker === "restaurant" && (
            <Popup onClose={() => setSelectedMarker(null)}>
              <div className="p-2 min-w-[150px]">
                <p className="font-bold text-red-600">🍽️ Restaurant</p>
                <p className="font-semibold text-gray-800 mt-1">
                  {currentTarget.restaurant.name}
                </p>
                {currentTarget.restaurant.address && (
                  <p className="text-sm text-gray-600 mt-1">
                    {currentTarget.restaurant.address}
                  </p>
                )}
              </div>
            </Popup>
          )}
        </Marker>
      )}

      {/* Customer Marker (Delivery Mode) */}
      {customerPosition && (
        <Marker
          position={customerPosition}
          icon={customerIcon}
          eventHandlers={{
            click: () => setSelectedMarker("customer"),
          }}
        >
          {selectedMarker === "customer" && (
            <Popup onClose={() => setSelectedMarker(null)}>
              <div className="p-2 min-w-[150px]">
                <p className="font-bold text-green-600">🏠 Customer</p>
                <p className="font-semibold text-gray-800 mt-1">
                  {currentTarget.customer?.name || "Customer"}
                </p>
                {currentTarget.customer?.address && (
                  <p className="text-sm text-gray-600 mt-1">
                    {currentTarget.customer.address}
                  </p>
                )}
              </div>
            </Popup>
          )}
        </Marker>
      )}

      {/* Additional Markers for Multi-Delivery */}
      {additionalMarkers.map((marker, index) => (
        <Marker
          key={marker.id || index}
          position={[marker.lat, marker.lng]}
          icon={
            marker.type === "pickup" ? pickupMarkerIcon : deliveryMarkerIcon
          }
          opacity={0.7}
        />
      ))}

      {/* Route Polyline */}
      {routePath.length > 0 && (
        <Polyline
          positions={routePath}
          pathOptions={{
            color: routeColor,
            weight: 5,
            opacity: 0.8,
          }}
        />
      )}
    </MapContainer>
  );
}

export default memo(GoogleDeliveryMap);
