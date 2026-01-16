# Driver Live Map Tracking System - Implementation Guide

## Overview

This is a production-ready live driver tracking system for a delivery management application built with Node.js, Express, Supabase, React, and Leaflet maps.

## Features Implemented

### Backend (Node.js + Express + Supabase)

#### 1. **GET /api/driver/deliveries/active**

- Returns all active deliveries assigned to the logged-in driver
- Filters deliveries by driver_id and excludes completed/failed deliveries
- Returns complete delivery information including restaurant, customer, and order details

#### 2. **GET /api/driver/deliveries/:id/map**

- Returns comprehensive map data for a specific delivery
- **Driver Location**: Current driver coordinates
- **Restaurant Location**: Restaurant address and coordinates
- **Customer Location**: Customer delivery address and coordinates
- **Routes**:
  - Driver → Restaurant (green route using OSRM)
  - Driver → Customer (grey route using OSRM)
- **Timestamps**: All status change timestamps
- Uses **OSRM (Open Source Routing Machine)** for calculating shortest driving routes

#### 3. **PATCH /api/driver/deliveries/:id/location**

- Updates driver's current location in real-time
- Accepts latitude and longitude coordinates
- Validates coordinates before updating
- Stores last_location_update timestamp
- Designed to be called every 5 seconds by frontend

#### 4. **PATCH /api/driver/deliveries/:id/status**

- Updates delivery status with proper state machine validation
- **Status Flow**:
  1. `accepted` → `heading_to_restaurant` (Start Pickup)
  2. `heading_to_restaurant` → `arrived_restaurant` (Arrived at Restaurant)
  3. `arrived_restaurant` → `picked_up` (Picked Up)
  4. `picked_up` → `heading_to_customer` (Start Delivery)
  5. `heading_to_customer` → `arrived_customer` (Arrived at Customer)
  6. `arrived_customer` → `delivered` (Delivered)
- **Timestamps**: Automatically stores timestamps for each status change
- **Notifications**: Sends real-time notifications to customer and restaurant
- **Order Status Update**: Updates orders table when delivered

### Frontend (React + Leaflet + React Router)

#### 1. **Active Deliveries Page** (`/driver/deliveries/active`)

**Features**:

- Lists all active deliveries for the logged-in driver
- Shows delivery details: order number, restaurant, customer info, distance, amount
- Status badges with color coding
- "Find Route & Start Delivery" button for each delivery
- Navigates to map page when clicking the button
- Empty state with link to browse available deliveries
- Loading and error states

**Location**: `frontend/src/pages/driver/ActiveDeliveries.jsx`

#### 2. **Driver Map Page** (`/driver/delivery/active/:deliveryId/map`)

**Features**:

- **Leaflet Map Integration**: Full-screen interactive map
- **Live Location Tracking**:
  - Uses browser Geolocation API
  - Updates every 5 seconds automatically
  - Sends location to backend for real-time tracking
- **Custom Markers**:
  - Blue marker: Driver (current location)
  - Orange marker: Restaurant
  - Green marker: Customer
- **Route Visualization**:
  - Green solid line: Active route (current target)
  - Grey dashed line: Future route (next destination)
  - Route switches based on status
- **Status Management**:
  - Dynamic "Next Action" button based on current status
  - One-click status updates
  - Validates state transitions on backend
- **Route Information**: Shows distance and ETA
- **Live Tracking Indicator**: Visual indicator showing tracking status
- **Toggle Controls**: Can start/stop live tracking manually

**Location**: `frontend/src/pages/driver/DriverMapPage.jsx`

### Database Schema

#### New Columns Added to `deliveries` Table:

```sql
-- Status timestamp columns
accepted_at TIMESTAMPTZ
heading_to_restaurant_at TIMESTAMPTZ
arrived_restaurant_at TIMESTAMPTZ
picked_up_at TIMESTAMPTZ
heading_to_customer_at TIMESTAMPTZ
arrived_customer_at TIMESTAMPTZ
delivered_at TIMESTAMPTZ

-- Current location tracking
current_latitude NUMERIC(10, 7)
current_longitude NUMERIC(10, 7)
```

#### Updated Status Enum:

- `pending`, `accepted`, `heading_to_restaurant`, `arrived_restaurant`, `picked_up`, `heading_to_customer`, `arrived_customer`, `delivered`, `failed`, `cancelled`

**Migration File**: `database/delivery_tracking_schema.sql`

## Technical Implementation Details

### Route Calculation (OSRM)

The system uses **OSRM (Open Source Routing Machine)** API for calculating driving routes:

```javascript
// Example OSRM API call
const routeRes = await fetch(
  `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`
);
```

**Benefits**:

- Free and open-source
- Accurate road-based routing
- Returns coordinates, distance, and duration
- No API key required

### Live Location Updates

**Frontend Implementation**:

```javascript
// Update every 5 seconds
setInterval(() => {
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      updateDriverLocation(latitude, longitude);
    },
    errorHandler,
    {
      enableHighAccuracy: true,
      maximumAge: 0,
    }
  );
}, 5000);
```

**Backend Storage**:

- Stores in `deliveries.current_latitude` and `deliveries.current_longitude`
- Updates `last_location_update` timestamp
- Can be used for real-time tracking by customers (future feature)

### State Machine Validation

The backend enforces proper status transitions to prevent invalid state changes:

```javascript
const validTransitions = {
  accepted: ["heading_to_restaurant"],
  heading_to_restaurant: ["arrived_restaurant"],
  arrived_restaurant: ["picked_up"],
  picked_up: ["heading_to_customer"],
  heading_to_customer: ["arrived_customer"],
  arrived_customer: ["delivered"],
};
```

### Route Display Logic

The map displays different routes based on current status:

**Before Pickup** (`accepted` to `picked_up`):

- **Green Route**: Driver → Restaurant
- **Grey Route**: Driver → Customer (preview)

**After Pickup** (`heading_to_customer` to `delivered`):

- **Green Route**: Driver → Customer
- **Grey Route**: None

## Installation & Setup

### 1. Database Setup

Run the migration to add required columns:

```bash
# Connect to your Supabase database and run:
psql -h your-db-host -U postgres -d your-database -f database/delivery_tracking_schema.sql
```

Or run directly in Supabase SQL Editor:

- Navigate to Supabase Dashboard → SQL Editor
- Paste contents of `delivery_tracking_schema.sql`
- Click "Run"

### 2. Backend Setup

The routes are already integrated into `backend/routes/driverDelivery.js`. No additional setup needed.

### 3. Frontend Setup

Install dependencies (already in package.json):

```bash
cd frontend
npm install
```

**Dependencies**:

- `leaflet`: Map rendering
- `react-leaflet`: React bindings for Leaflet
- `react-router-dom`: Routing

### 4. Environment Variables

Ensure your frontend has the API URL configured:

```env
VITE_API_URL=http://localhost:3000
```

## Usage Flow

### Driver Workflow:

1. **Login** as driver
2. **Accept a delivery** from available deliveries
3. Navigate to **Active Deliveries** (`/driver/deliveries/active`)
4. Click **"Find Route & Start Delivery"** button
5. Map page opens with:
   - Driver's current location
   - Restaurant location (orange marker)
   - Customer location (green marker)
   - Green route to restaurant
   - Grey route to customer (preview)
6. **Live tracking starts automatically**
   - Location updates every 5 seconds
   - Routes recalculate dynamically
7. Click **"Start Pickup"** → Status changes to `heading_to_restaurant`
8. Drive to restaurant following green route
9. Click **"Arrived at Restaurant"** when reached
10. Click **"Mark as Picked Up"** after collecting order
11. Green route now shows driver → customer
12. Click **"Start Delivery"** → Status changes to `heading_to_customer`
13. Drive to customer following green route
14. Click **"Arrived at Customer"** when reached
15. Click **"Mark as Delivered"** after handover
16. Delivery complete!

### Real-time Updates:

- **Customer** receives notifications at each status change
- **Restaurant** receives notifications about pickup progress
- **Driver location** updates every 5 seconds in database
- Routes recalculate automatically as driver moves

## API Endpoints Summary

| Method | Endpoint                              | Description               |
| ------ | ------------------------------------- | ------------------------- |
| GET    | `/api/driver/deliveries/active`       | Get all active deliveries |
| GET    | `/api/driver/deliveries/:id/map`      | Get map data with routes  |
| PATCH  | `/api/driver/deliveries/:id/location` | Update driver location    |
| PATCH  | `/api/driver/deliveries/:id/status`   | Update delivery status    |

## Testing

### Test Backend Endpoints:

```bash
# Get active deliveries
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/driver/deliveries/active

# Get map data
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/driver/deliveries/DELIVERY_ID/map

# Update location
curl -X PATCH \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"latitude": 40.7128, "longitude": -74.0060}' \
  http://localhost:3000/api/driver/deliveries/DELIVERY_ID/location

# Update status
curl -X PATCH \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "heading_to_restaurant"}' \
  http://localhost:3000/api/driver/deliveries/DELIVERY_ID/status
```

### Test Frontend:

1. Start backend: `cd backend && npm start`
2. Start frontend: `cd frontend && npm run dev`
3. Login as driver
4. Accept a delivery
5. Navigate to Active Deliveries
6. Click "Find Route" button
7. Verify map loads with markers and routes
8. Check browser console for location updates

## Troubleshooting

### Map not loading:

- Check browser console for errors
- Verify Leaflet CSS is imported in component
- Ensure coordinates are valid numbers

### Location not updating:

- Enable location permissions in browser
- Check HTTPS (required for geolocation in production)
- Verify location update interval is running

### Routes not showing:

- Check OSRM API is accessible
- Verify coordinates are in correct format (lng, lat for OSRM)
- Check browser console for fetch errors

### Status update fails:

- Verify current status allows transition
- Check backend logs for validation errors
- Ensure driver is authenticated and owns the delivery

## Production Considerations

### 1. **HTTPS Required**

- Browser Geolocation API requires HTTPS in production
- Use SSL certificate for deployment

### 2. **OSRM Alternative**

For production, consider:

- **Self-hosted OSRM server** (better performance)
- **Mapbox Directions API** (paid, more features)
- **Google Maps Directions API** (paid, highly accurate)

### 3. **Real-time Communication**

For instant updates, consider:

- **Supabase Realtime subscriptions** (currently using polling)
- **WebSockets** for lower latency
- **Server-Sent Events (SSE)** for one-way updates

### 4. **Performance Optimization**

- Cache routes to reduce API calls
- Implement route updates only when driver moves significantly (>50 meters)
- Use map clustering for multiple deliveries

### 5. **Error Handling**

- Implement retry logic for failed location updates
- Handle offline scenarios gracefully
- Show user-friendly error messages

## Future Enhancements

1. **Customer Tracking Interface**

   - Allow customers to see driver location in real-time
   - Show ETA to customer

2. **Offline Support**

   - Cache maps for offline use
   - Queue location updates when offline

3. **Advanced Features**

   - Multi-stop routing
   - Traffic-aware routing
   - Route optimization for multiple deliveries

4. **Analytics**
   - Average delivery time by driver
   - Route efficiency metrics
   - Customer satisfaction ratings

## Files Created/Modified

### Backend:

- ✅ `backend/routes/driverDelivery.js` - Updated with new endpoints
- ✅ `database/delivery_tracking_schema.sql` - New database migration

### Frontend:

- ✅ `frontend/src/pages/driver/ActiveDeliveries.jsx` - New page
- ✅ `frontend/src/pages/driver/DriverMapPage.jsx` - New page
- ✅ `frontend/src/App.jsx` - Updated with new routes

## Support

For issues or questions:

1. Check backend logs: `backend/` console output
2. Check browser console: Developer Tools → Console
3. Verify database: Check Supabase dashboard
4. Review API responses: Network tab in Developer Tools

---

**Status**: ✅ Production Ready
**Last Updated**: January 13, 2026
**Version**: 1.0.0
