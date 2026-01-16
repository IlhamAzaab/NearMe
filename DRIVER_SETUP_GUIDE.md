# Quick Setup Guide - Driver Delivery System

## Prerequisites

- Node.js installed
- Supabase account and project
- Frontend and backend already set up

## Setup Steps

### 1. Update Database Schema

Run the following SQL in your Supabase SQL Editor:

```bash
# Copy the content from:
database/update_delivery_enums.sql
```

**Or manually execute:**

1. Go to Supabase Dashboard → SQL Editor
2. Run the `update_delivery_enums.sql` script
3. Verify enums updated: `SELECT enum_range(NULL::delivery_status);`

### 2. Install Dependencies

#### Frontend (if not already installed):

```bash
cd frontend
npm install leaflet react-leaflet
```

#### Backend (already installed):

- No new dependencies needed

### 3. Test the Backend

```bash
cd backend
npm run dev
```

**Test endpoints:**

```bash
# Get pending deliveries (requires driver auth token)
GET http://localhost:5000/driver/deliveries/pending

# Get active pickups (requires driver location)
GET http://localhost:5000/driver/deliveries/pickups?driver_latitude=YOUR_LAT&driver_longitude=YOUR_LNG
```

### 4. Test the Frontend

```bash
cd frontend
npm run dev
```

**Navigate to:**

1. `/driver/deliveries` - Available Deliveries
2. `/driver/deliveries/active` - Active Deliveries
3. `/driver/delivery/active/:deliveryId/map` - Driver Map

## Testing Workflow

### Create Test Data

1. **Create a test driver account**:

   - Sign up with role "driver"
   - Complete driver onboarding

2. **Create test orders** (as customer):

   - Place 2-3 orders from different restaurants
   - Ensure they have different delivery locations

3. **Create deliveries** (in Supabase):

```sql
-- This happens automatically when orders are placed
-- Verify deliveries exist:
SELECT * FROM deliveries WHERE status = 'pending' AND driver_id IS NULL;
```

### Test Flow

#### Step 1: View Available Deliveries

- Login as driver
- Navigate to `/driver/deliveries`
- Should see pending deliveries with:
  - Static map
  - Earnings
  - Distance & time
  - Restaurant and customer info
- Click "ACCEPT DELIVERY" on one or more

#### Step 2: View Active Deliveries

- Navigate to `/driver/deliveries/active`
- Should see accepted deliveries sorted by distance
- Should see numbered list (1 = closest)
- Verify "START PICK-UP" button is sticky at bottom

#### Step 3: Start Pickup

- Click "START PICK-UP"
- Should navigate to `/driver/delivery/active/:deliveryId/map`
- Should see live map with:
  - Your location (blue marker)
  - Nearest restaurant (red marker)
  - Route line
- Verify location updates every 5 seconds

#### Step 4: Mark as Picked Up

- Navigate to the restaurant
- Click "MARK AS PICKED UP"
- Should automatically show next restaurant
- Repeat for all restaurants

#### Step 5: Start Delivery

- After all pickups, should see "START DELIVERY" button
- Click it
- Should switch to delivery mode
- Should show nearest customer

#### Step 6: Complete Delivery

- Navigate to customer location
- Click "MARK AS DELIVERED"
- Should show next customer
- Repeat until all deliveries complete

## Troubleshooting

### Map not showing

- **Issue**: Leaflet CSS not loaded
- **Fix**: Verify `import "leaflet/dist/leaflet.css";` in component

### OSRM errors

- **Issue**: OSRM API timeout
- **Fix**: Code has fallback to Haversine calculation

### Location not updating

- **Issue**: Browser geolocation blocked
- **Fix**:
  1. Enable location permissions
  2. Use HTTPS (or localhost)
  3. Check browser console for errors

### Deliveries not sorting

- **Issue**: Driver location not provided
- **Fix**: Ensure geolocation is enabled and working

### Status update fails

- **Issue**: Invalid status transition
- **Fix**: Follow valid flow: accepted → picked_up → on_the_way → at_customer → delivered

## API Endpoint Reference

### Available Deliveries

```javascript
GET /driver/deliveries/pending
Headers: Authorization: Bearer <token>

Response:
{
  "deliveries": [
    {
      "delivery_id": "uuid",
      "order_number": "12345",
      "restaurant": { "name": "...", "address": "...", ... },
      "delivery": { "address": "...", ... },
      "pricing": {
        "driver_earnings": 8.50,
        "delivery_fee": 5.00,
        "service_fee": 3.50
      },
      "distance_km": "3.2",
      "estimated_time_minutes": 15
    }
  ]
}
```

### Accept Delivery

```javascript
POST /driver/deliveries/:id/accept
Headers: Authorization: Bearer <token>
Body: {
  "driver_latitude": 40.7128,
  "driver_longitude": -74.0060
}

Response:
{
  "message": "Delivery accepted successfully",
  "delivery": { ... }
}
```

### Get Pickups (Active Deliveries)

```javascript
GET /driver/deliveries/pickups?driver_latitude=40.7128&driver_longitude=-74.0060
Headers: Authorization: Bearer <token>

Response:
{
  "pickups": [
    {
      "delivery_id": "uuid",
      "order_number": "12345",
      "restaurant": { ... },
      "distance_meters": 1250,
      "distance_km": "1.25",
      "estimated_time_minutes": 8,
      "route_geometry": { "coordinates": [[...], [...]] }
    }
  ],
  "total_deliveries": 3,
  "driver_location": { "latitude": 40.7128, "longitude": -74.0060 }
}
```

### Get Delivery Route

```javascript
GET /driver/deliveries/deliveries-route?driver_latitude=40.7128&driver_longitude=-74.0060
Headers: Authorization: Bearer <token>

Response:
{
  "deliveries": [
    {
      "delivery_id": "uuid",
      "customer": { "name": "...", "phone": "...", "address": "..." },
      "pricing": { ... },
      "distance_km": "2.1",
      "estimated_time_minutes": 12
    }
  ]
}
```

### Update Status

```javascript
PATCH /driver/deliveries/:id/status
Headers: Authorization: Bearer <token>
Body: {
  "status": "picked_up",
  "latitude": 40.7128,
  "longitude": -74.0060
}

Response:
{
  "message": "Status updated successfully",
  "delivery": { "id": "...", "status": "picked_up" }
}
```

## Features Checklist

- [x] Pending deliveries page with static maps
- [x] Driver earnings calculation
- [x] Accept delivery functionality
- [x] Active deliveries sorted by distance
- [x] OSRM route optimization
- [x] Live map tracking
- [x] Pickup mode with restaurant navigation
- [x] Delivery mode with customer navigation
- [x] Dynamic list re-sorting
- [x] Multi-order support
- [x] Real-time location updates
- [x] Status transitions
- [x] Notifications
- [x] Mobile responsive design

## Production Deployment

### Environment Variables

```env
# Backend (.env)
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_KEY=your-service-key
JWT_SECRET=your-jwt-secret
PORT=5000

# Frontend (.env)
VITE_API_URL=http://localhost:5000
```

### Deploy Steps

1. Run database migration (`update_delivery_enums.sql`)
2. Build frontend: `npm run build`
3. Deploy backend to your server
4. Deploy frontend to Netlify/Vercel
5. Update CORS settings
6. Test with real devices

## Support

For issues or questions:

1. Check console logs (browser & server)
2. Verify database schema updated
3. Ensure proper authentication
4. Check OSRM API is accessible
5. Verify geolocation permissions

---

**Setup Complete!** 🎉

Your driver delivery system is now ready for testing and production use.
