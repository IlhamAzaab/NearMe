/**
 * Google Delivery Map Component
 * Renders the map with driver, restaurant, and customer markers
 * Displays optimized route polyline with live updates
 */
import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  GoogleMap,
  Marker,
  DirectionsRenderer,
  InfoWindow,
} from "@react-google-maps/api";

// Map container style
const mapContainerStyle = {
  width: "100%",
  height: "100%",
};

// Default center (Colombo, Sri Lanka)
const defaultCenter = { lat: 6.9271, lng: 79.8612 };

// Map options
const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: true,
  gestureHandling: "greedy",
  styles: [
    // Hide POI labels for cleaner map
    {
      featureType: "poi",
      elementType: "labels",
      stylers: [{ visibility: "off" }],
    },
  ],
};

// Custom marker icon URLs using SVG data URIs
const createMarkerIcon = (emoji, bgColor) => {
  const svg = `
    <svg width="44" height="44" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
      <circle cx="22" cy="22" r="20" fill="${bgColor}" stroke="white" stroke-width="3"/>
      <text x="22" y="28" text-anchor="middle" font-size="18">${emoji}</text>
    </svg>
  `;
  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    scaledSize: window.google
      ? new window.google.maps.Size(44, 44)
      : { width: 44, height: 44 },
    anchor: window.google
      ? new window.google.maps.Point(22, 22)
      : { x: 22, y: 22 },
  };
};

// Memoized Driver Marker for smooth updates without re-rendering entire map
const DriverMarker = memo(function DriverMarker({ position, onClick }) {
  const icon = createMarkerIcon("🚗", "#3B82F6");

  return (
    <Marker
      position={position}
      icon={icon}
      onClick={onClick}
      zIndex={1000}
      title="Your Location"
    />
  );
});

// Memoized Restaurant Marker
const RestaurantMarker = memo(function RestaurantMarker({
  position,
  name,
  onClick,
}) {
  const icon = createMarkerIcon("🍽️", "#EF4444");

  return (
    <Marker
      position={position}
      icon={icon}
      onClick={onClick}
      zIndex={900}
      title={name}
    />
  );
});

// Memoized Customer Marker
const CustomerMarker = memo(function CustomerMarker({
  position,
  name,
  onClick,
}) {
  const icon = createMarkerIcon("🏠", "#10B981");

  return (
    <Marker
      position={position}
      icon={icon}
      onClick={onClick}
      zIndex={900}
      title={name}
    />
  );
});

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

  // Handle map load
  const handleMapLoad = useCallback(
    (map) => {
      mapRef.current = map;
      onMapLoad?.(map);
    },
    [onMapLoad],
  );

  // Fit bounds to show all markers
  const fitBounds = useCallback(() => {
    if (!mapRef.current || !window.google) return;

    const bounds = new window.google.maps.LatLngBounds();

    // Add driver location
    if (driverLocation) {
      bounds.extend(
        new window.google.maps.LatLng(driverLocation.lat, driverLocation.lng),
      );
    }

    // Add current target based on mode
    if (mode === "pickup" && currentTarget?.restaurant) {
      bounds.extend(
        new window.google.maps.LatLng(
          currentTarget.restaurant.latitude,
          currentTarget.restaurant.longitude,
        ),
      );
    } else if (mode === "delivery" && currentTarget?.customer) {
      bounds.extend(
        new window.google.maps.LatLng(
          currentTarget.customer.latitude,
          currentTarget.customer.longitude,
        ),
      );
    }

    // Add additional markers
    additionalMarkers.forEach((marker) => {
      if (marker.lat && marker.lng) {
        bounds.extend(new window.google.maps.LatLng(marker.lat, marker.lng));
      }
    });

    mapRef.current.fitBounds(bounds, { padding: 60 });
  }, [driverLocation, currentTarget, mode, additionalMarkers]);

  // Initial bounds fit
  useEffect(() => {
    if (!mapRef.current || !driverLocation || hasInitiallyFitted) return;
    if (userHasInteracted) return;

    fitBounds();
    setHasInitiallyFitted(true);
  }, [driverLocation, hasInitiallyFitted, userHasInteracted, fitBounds]);

  // Expose recenter function to parent
  useEffect(() => {
    if (setRecenterFn) {
      setRecenterFn(() => fitBounds);
    }
  }, [setRecenterFn, fitBounds]);

  // Handle user interaction (zoom/drag)
  const handleZoomChanged = useCallback(() => {
    if (hasInitiallyFitted && onUserInteraction) {
      onUserInteraction();
    }
  }, [hasInitiallyFitted, onUserInteraction]);

  const handleDragEnd = useCallback(() => {
    if (hasInitiallyFitted && onUserInteraction) {
      onUserInteraction();
    }
  }, [hasInitiallyFitted, onUserInteraction]);

  // Route polyline styling
  const directionsOptions = {
    suppressMarkers: true, // We render custom markers
    polylineOptions: {
      strokeColor: mode === "pickup" ? "#EF4444" : "#10B981",
      strokeWeight: 5,
      strokeOpacity: 0.8,
    },
    preserveViewport: true, // Don't auto-zoom when directions change
  };

  // Get restaurant position
  const restaurantPosition =
    mode === "pickup" && currentTarget?.restaurant
      ? {
          lat: currentTarget.restaurant.latitude,
          lng: currentTarget.restaurant.longitude,
        }
      : null;

  // Get customer position
  const customerPosition =
    mode === "delivery" && currentTarget?.customer
      ? {
          lat: currentTarget.customer.latitude,
          lng: currentTarget.customer.longitude,
        }
      : null;

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={driverLocation || defaultCenter}
      zoom={14}
      options={mapOptions}
      onLoad={handleMapLoad}
      onZoomChanged={handleZoomChanged}
      onDragEnd={handleDragEnd}
    >
      {/* Driver Marker - Updates every 3 seconds */}
      {driverLocation && (
        <DriverMarker
          position={driverLocation}
          onClick={() => setSelectedMarker("driver")}
        />
      )}

      {/* Restaurant Marker (Pickup Mode) */}
      {restaurantPosition && (
        <RestaurantMarker
          position={restaurantPosition}
          name={currentTarget.restaurant.name}
          onClick={() => setSelectedMarker("restaurant")}
        />
      )}

      {/* Customer Marker (Delivery Mode) */}
      {customerPosition && (
        <CustomerMarker
          position={customerPosition}
          name={currentTarget.customer?.name || "Customer"}
          onClick={() => setSelectedMarker("customer")}
        />
      )}

      {/* Additional Markers for Multi-Delivery */}
      {additionalMarkers.map((marker, index) => (
        <Marker
          key={marker.id || index}
          position={{ lat: marker.lat, lng: marker.lng }}
          icon={createMarkerIcon(
            marker.type === "pickup" ? "🍽️" : "🏠",
            marker.type === "pickup" ? "#FCA5A5" : "#6EE7B7",
          )}
          title={marker.name}
          opacity={0.7}
        />
      ))}

      {/* Route Polyline */}
      {directionsResult && (
        <DirectionsRenderer
          directions={directionsResult}
          options={directionsOptions}
        />
      )}

      {/* Info Windows */}
      {selectedMarker === "driver" && driverLocation && (
        <InfoWindow
          position={driverLocation}
          onCloseClick={() => setSelectedMarker(null)}
        >
          <div className="p-2">
            <p className="font-bold text-gray-800">📍 Your Location</p>
            <p className="text-sm text-gray-600">Live tracking active</p>
          </div>
        </InfoWindow>
      )}

      {selectedMarker === "restaurant" && restaurantPosition && (
        <InfoWindow
          position={restaurantPosition}
          onCloseClick={() => setSelectedMarker(null)}
        >
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
        </InfoWindow>
      )}

      {selectedMarker === "customer" && customerPosition && (
        <InfoWindow
          position={customerPosition}
          onCloseClick={() => setSelectedMarker(null)}
        >
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
        </InfoWindow>
      )}
    </GoogleMap>
  );
}

export default memo(GoogleDeliveryMap);
