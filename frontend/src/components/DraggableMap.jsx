import React, { useEffect, useMemo, useRef, useCallback } from "react";
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
export const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// Custom SVG icons for Leaflet (black, no background)
const createSvgIcon = (svgPath, size = 32, color = "#1a1a1a") => {
  return L.divIcon({
    className: "custom-svg-marker",
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">${svgPath}</svg>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
};

// Create circle icon
const createCircleIcon = (color, borderColor = "#ffffff", size = 20) => {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      width: ${size}px;
      height: ${size}px;
      background-color: ${color};
      border: 3px solid ${borderColor};
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
};

// Preset icons
export const MAP_ICONS = {
  driver: createSvgIcon(
    '<path d="M19 7c0-1.1-.9-2-2-2h-3v2h3v2.65L13.52 14H10V9H6c-2.21 0-4 1.79-4 4v3h2c0 1.66 1.34 3 3 3s3-1.34 3-3h4.48L19 10.35V7zM7 17c-.55 0-1-.45-1-1h2c0 .55-.45 1-1 1z"/><path d="M5 6h5v2H5zm14 7c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm0 4c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>',
    28,
  ),
  restaurant: createSvgIcon(
    '<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>',
    28,
  ),
  customer: createSvgIcon(
    '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>',
    28,
  ),
  driverGreen: createCircleIcon("#13ec37", "#ffffff"),
  restaurantGreen: createCircleIcon("#13ec37", "#ffffff"),
  customerBlack: createCircleIcon("#111812", "#ffffff"),
};

// Map bounds fitter component - EXPORTED for use in existing MapContainers
export function MapBoundsFitter({
  markers,
  polylines = [],
  padding = [50, 50],
  paddingTopLeft,
  paddingBottomRight,
  enabled = true,
}) {
  const map = useMap();

  useEffect(() => {
    if (!enabled) return;
    if (
      (!markers || markers.length === 0) &&
      (!polylines || polylines.length === 0)
    ) {
      return;
    }

    const validMarkers = markers.filter(
      (m) =>
        m && m.lat != null && m.lng != null && !isNaN(m.lat) && !isNaN(m.lng),
    );

    const polylinePoints = polylines.flatMap((line) => {
      if (!line || !Array.isArray(line.positions)) return [];

      return line.positions.filter(
        (pos) =>
          Array.isArray(pos) &&
          pos.length >= 2 &&
          Number.isFinite(Number(pos[0])) &&
          Number.isFinite(Number(pos[1])),
      );
    });

    const allPoints = [
      ...validMarkers.map((m) => [Number(m.lat), Number(m.lng)]),
      ...polylinePoints.map((p) => [Number(p[0]), Number(p[1])]),
    ];

    if (allPoints.length === 0) return;

    try {
      if (!map || !map._loaded) return;
      const container = map.getContainer?.();
      if (!container) return;

      const bounds = L.latLngBounds(allPoints);

      if (bounds.isValid()) {
        const fitOptions = {
          maxZoom: 16,
          animate: false,
        };

        if (paddingTopLeft || paddingBottomRight) {
          if (paddingTopLeft) fitOptions.paddingTopLeft = paddingTopLeft;
          if (paddingBottomRight)
            fitOptions.paddingBottomRight = paddingBottomRight;
        } else {
          fitOptions.padding = padding;
        }

        map.fitBounds(bounds, {
          ...fitOptions,
        });
      }
    } catch (e) {
      console.warn("Error fitting bounds:", e);
    }
  }, [
    markers,
    polylines,
    map,
    padding,
    paddingTopLeft,
    paddingBottomRight,
    enabled,
  ]);

  return null;
}

// Map controller for programmatic updates
function MapController({ center, zoom, onMapReady }) {
  const map = useMap();

  useEffect(() => {
    if (onMapReady) {
      onMapReady(map);
    }
  }, [map, onMapReady]);

  useEffect(() => {
    if (center && center.lat != null && center.lng != null) {
      map.setView([center.lat, center.lng], zoom || map.getZoom(), {
        animate: true,
      });
    }
  }, [center, zoom, map]);

  return null;
}

/**
 * DraggableMap - A reusable map component that auto-fits to markers
 *
 * Props:
 * - markers: Array of { lat, lng, icon?, popup?, id? }
 * - polylines: Array of { positions: [[lat, lng]], color?, weight?, dashArray?, opacity? }
 * - height: CSS height (default: "100%")
 * - className: Additional CSS classes
 * - draggable: Enable map dragging (default: true)
 * - zoomControl: Show zoom controls (default: false)
 * - fitBounds: Auto-fit to markers (default: true)
 * - padding: Padding for fitBounds (default: [50, 50])
 * - center: Optional center { lat, lng }
 * - zoom: Optional zoom level (default: 13)
 * - onMapReady: Callback when map is ready (receives map instance)
 * - onMarkerClick: Callback when marker is clicked (receives marker)
 * - children: Additional map children
 */
export default function DraggableMap({
  markers = [],
  polylines = [],
  height = "100%",
  className = "",
  draggable = true,
  zoomControl = false,
  fitBounds = true,
  padding = [50, 50],
  paddingTopLeft,
  paddingBottomRight,
  center,
  zoom = 13,
  onMapReady,
  onMarkerClick,
  children,
  style,
}) {
  const mapRef = useRef(null);
  const [isMapReady, setIsMapReady] = React.useState(false);

  const safeMarkers = useMemo(() => {
    return markers
      .map((marker) => {
        if (!marker) return null;
        const lat = Number(marker.lat);
        const lng = Number(marker.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return { ...marker, lat, lng };
      })
      .filter(Boolean);
  }, [markers]);

  const safePolylines = useMemo(() => {
    return polylines
      .map((line) => {
        if (!line || !Array.isArray(line.positions)) return null;
        const positions = line.positions
          .map((pos) => {
            if (!Array.isArray(pos) || pos.length < 2) return null;
            const lat = Number(pos[0]);
            const lng = Number(pos[1]);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            return [lat, lng];
          })
          .filter(Boolean);

        if (positions.length < 2) return null;
        return { ...line, positions };
      })
      .filter(Boolean);
  }, [polylines]);

  // Calculate default center from markers if not provided
  const defaultCenter = useMemo(() => {
    if (center) return center;

    const validMarkers = safeMarkers.filter(
      (m) => m && m.lat != null && m.lng != null,
    );

    if (validMarkers.length === 0) {
      return { lat: 8.5017, lng: 81.186 }; // Default: Kinniya, Sri Lanka
    }

    const avgLat =
      validMarkers.reduce((sum, m) => sum + m.lat, 0) / validMarkers.length;
    const avgLng =
      validMarkers.reduce((sum, m) => sum + m.lng, 0) / validMarkers.length;

    return { lat: avgLat, lng: avgLng };
  }, [center, safeMarkers]);

  const handleMarkerClick = useCallback(
    (marker) => {
      if (onMarkerClick) {
        onMarkerClick(marker);
      }
    },
    [onMarkerClick],
  );

  const mapStyle = useMemo(
    () => ({
      width: "100%",
      height: height,
      ...style,
    }),
    [height, style],
  );

  return (
    <MapContainer
      ref={mapRef}
      key={`map-${safeMarkers.length}-${safePolylines.length}`}
      center={[defaultCenter.lat, defaultCenter.lng]}
      zoom={zoom}
      style={mapStyle}
      className={`draggable-map ${className}`}
      zoomControl={zoomControl}
      attributionControl={false}
      dragging={draggable}
      touchZoom={draggable}
      scrollWheelZoom={draggable}
      doubleClickZoom={draggable}
      whenReady={() => setIsMapReady(true)}
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />

      {/* Map controller for center/zoom updates */}
      <MapController
        center={!fitBounds ? center : null}
        zoom={!fitBounds ? zoom : null}
        onMapReady={onMapReady}
      />

      {/* Auto-fit bounds to markers */}
      {fitBounds && (safeMarkers.length > 0 || safePolylines.length > 0) && (
        <MapBoundsFitter
          markers={safeMarkers}
          polylines={safePolylines}
          padding={padding}
          paddingTopLeft={paddingTopLeft}
          paddingBottomRight={paddingBottomRight}
          enabled={isMapReady}
        />
      )}

      {/* Render markers */}
      {safeMarkers.map((marker, index) => {
        if (!marker || marker.lat == null || marker.lng == null) return null;

        return (
          <Marker
            key={marker.id || `marker-${index}`}
            position={[marker.lat, marker.lng]}
            icon={marker.icon || MAP_ICONS.customerBlack}
            eventHandlers={{
              click: () => handleMarkerClick(marker),
            }}
          >
            {marker.popup && (
              <Popup>
                <div className="p-1 text-sm">{marker.popup}</div>
              </Popup>
            )}
          </Marker>
        );
      })}

      {/* Render polylines */}
      {safePolylines.map((line, index) => {
        if (!line || !line.positions || line.positions.length < 2) return null;

        return (
          <Polyline
            key={line.id || `polyline-${index}`}
            positions={line.positions}
            pathOptions={{
              color: line.color || "#1a1a1a",
              weight: line.weight || 4,
              opacity: line.opacity || 0.8,
              dashArray: line.dashArray || null,
              lineCap: "round",
            }}
          />
        );
      })}

      {/* Additional children */}
      {children}
    </MapContainer>
  );
}

// Export utility functions
export const decodePolyline = (encoded) => {
  if (!encoded) return [];
  const poly = [];
  let index = 0,
    len = encoded.length;
  let lat = 0,
    lng = 0;

  while (index < len) {
    let b,
      shift = 0,
      result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    poly.push([lat / 1e5, lng / 1e5]);
  }

  return poly;
};

// Generate curved path for visual appeal
export const generateCurvedPath = (start, end, numPoints = 50) => {
  if (!start || !end) return [];

  const points = [];

  // Calculate midpoint
  const midLat = (start.lat + end.lat) / 2;
  const midLng = (start.lng + end.lng) / 2;

  // Calculate perpendicular offset for curve (arc height)
  const dx = end.lng - start.lng;
  const dy = end.lat - start.lat;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance === 0) return [[start.lat, start.lng]];

  // Curve offset (perpendicular to the line)
  const curveIntensity = distance * 0.15;
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

    const lat =
      oneMinusT * oneMinusT * start.lat +
      2 * oneMinusT * t * controlPoint.lat +
      t * t * end.lat;
    const lng =
      oneMinusT * oneMinusT * start.lng +
      2 * oneMinusT * t * controlPoint.lng +
      t * t * end.lng;

    points.push([lat, lng]);
  }

  return points;
};
