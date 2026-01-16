# Driver Delivery System - Architecture Diagram

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    DRIVER DELIVERY WORKFLOW                      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────┐
│  Available          │
│  Deliveries Page    │  ← Shows pending deliveries (status='pending')
│  /driver/deliveries │
└──────────┬──────────┘
           │
           │ Accept Delivery
           │ (POST /deliveries/:id/accept)
           │ Status: pending → accepted
           ↓
┌─────────────────────────┐
│  Active Deliveries      │
│  Page                   │  ← Shows accepted deliveries
│  /driver/deliveries/    │     Sorted by shortest distance
│  active                 │     (GET /deliveries/pickups)
└──────────┬──────────────┘
           │
           │ Click "START PICK-UP"
           │
           ↓
┌────────────────────────────────────────────────────────┐
│                  DRIVER MAP PAGE                        │
│         /driver/delivery/active/:id/map                 │
├────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────────────────────────────────┐       │
│  │          🅿️ PICKUP MODE                     │       │
│  ├─────────────────────────────────────────────┤       │
│  │                                               │       │
│  │  📍 Driver → 🏪 Restaurant (sorted by dist)  │       │
│  │                                               │       │
│  │  Current Target:                              │       │
│  │  • Restaurant Name                            │       │
│  │  • Address, Phone                             │       │
│  │  • Distance, Time                             │       │
│  │  • [MARK AS PICKED UP] Button                 │       │
│  │                                               │       │
│  │  Upcoming Pickups: (numbered list)            │       │
│  │  2️⃣ Restaurant B - 2.3km - 10min              │       │
│  │  3️⃣ Restaurant C - 4.1km - 18min              │       │
│  │                                               │       │
│  └─────────────────────────────────────────────┘       │
│           │                                              │
│           │ Mark as "picked_up" (PATCH /status)          │
│           │ Auto-shows next restaurant                   │
│           │ Repeat for all pickups                       │
│           ↓                                              │
│  ┌─────────────────────────────────────────────┐       │
│  │      🚚 DELIVERY MODE                        │       │
│  ├─────────────────────────────────────────────┤       │
│  │                                               │       │
│  │  📍 Driver → 🏠 Customer (sorted by dist)     │       │
│  │                                               │       │
│  │  Current Delivery:                            │       │
│  │  • Customer Name, Phone                       │       │
│  │  • Delivery Address                           │       │
│  │  • Order Details & Pricing                    │       │
│  │  • Distance, Time                             │       │
│  │  • [MARK AS DELIVERED] Button                 │       │
│  │                                               │       │
│  │  Upcoming Deliveries: (numbered list)         │       │
│  │  2️⃣ Customer 2 - 1.8km - 8min                 │       │
│  │  3️⃣ Customer 3 - 3.2km - 14min                │       │
│  │                                               │       │
│  └─────────────────────────────────────────────┘       │
│           │                                              │
│           │ Status: picked_up → on_the_way →             │
│           │         at_customer → delivered              │
│           │ Repeat for all customers                     │
│           ↓                                              │
└────────────────────────────────────────────────────────┘
           │
           │ All deliveries complete
           ↓
┌─────────────────────┐
│  Back to Available  │
│  Deliveries         │
└─────────────────────┘
```

## Data Flow

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│   Frontend   │◄─────►│   Backend    │◄─────►│  Supabase    │
│   (React)    │       │  (Express)   │       │ (PostgreSQL) │
└──────────────┘       └──────┬───────┘       └──────────────┘
                              │
                              ↓
                     ┌──────────────────┐
                     │   OSRM API       │
                     │  (Route Engine)  │
                     └──────────────────┘
                              │
                              ↓
                     Distance & Route Data
```

## Database Schema (Deliveries Table)

```sql
deliveries
├── id (uuid, primary key)
├── order_id (uuid, foreign key → orders)
├── driver_id (uuid, foreign key → drivers, nullable)
├── status (delivery_status enum)
│   ├── pending        ← Initial state
│   ├── accepted       ← Driver accepts
│   ├── picked_up      ← Picked from restaurant
│   ├── on_the_way     ← En route to customer
│   ├── at_customer    ← Arrived at customer
│   ├── delivered      ← Final state
│   └── cancelled
├── current_latitude (decimal)
├── current_longitude (decimal)
├── assigned_at (timestamp)
├── accepted_at (timestamp)
├── picked_up_at (timestamp)
├── on_the_way_at (timestamp)
├── arrived_customer_at (timestamp)
├── delivered_at (timestamp)
└── last_location_update (timestamp)
```

## API Endpoints Map

```
Backend Routes (driverDelivery.js)
├── GET  /driver/deliveries/pending
│   └── Returns: Pending deliveries with earnings, map data
│
├── POST /driver/deliveries/:id/accept
│   └── Action: Assigns delivery to driver
│   └── Updates: status → 'accepted'
│
├── GET  /driver/deliveries/pickups
│   └── Query: ?driver_latitude=X&driver_longitude=Y
│   └── Returns: Accepted deliveries sorted by distance
│   └── Uses: OSRM for routing
│
├── GET  /driver/deliveries/deliveries-route
│   └── Query: ?driver_latitude=X&driver_longitude=Y
│   └── Returns: Picked-up deliveries sorted by distance
│   └── Uses: OSRM for routing
│
├── PATCH /driver/deliveries/:id/status
│   └── Body: { status, latitude, longitude }
│   └── Validates: State transitions
│   └── Updates: Timestamps automatically
│
└── PATCH /driver/deliveries/:id/location
    └── Body: { latitude, longitude }
    └── Updates: Driver's current position
```

## Frontend Components

```
Pages
├── AvailableDeliveries
│   ├── Shows pending deliveries
│   ├── Static map with markers
│   ├── DeliveryCard component
│   └── Accept button
│
├── ActiveDeliveries
│   ├── Shows accepted deliveries
│   ├── Sorted by distance
│   ├── PickupCard component
│   └── "START PICK-UP" button
│
└── DriverMapPage
    ├── Live map tracking
    ├── Two modes: Pickup & Delivery
    ├── Components:
    │   ├── MapBounds (auto-fit)
    │   ├── PickupInfo
    │   ├── DeliveryInfo
    │   ├── UpcomingPickupCard
    │   └── UpcomingDeliveryCard
    └── Real-time location updates
```

## State Management

```javascript
// DriverMapPage State
{
  mode: "pickup" | "delivery",
  pickups: [...],           // Sorted by distance
  deliveries: [...],        // Sorted by distance
  currentTarget: {...},     // Active pickup/delivery
  driverLocation: {
    latitude: number,
    longitude: number
  },
  loading: boolean,
  updating: boolean,
  isTracking: boolean
}

// Location updates every 5 seconds
setInterval(() => {
  getCurrentPosition()
  updateLocationOnBackend()
  fetchPickupsAndDeliveries()  // Re-sort based on new location
}, 5000)
```

## Multi-Order Flow

```
Driver accepts 3 orders:
Order A: Restaurant A → Customer A
Order B: Restaurant B → Customer B
Order C: Restaurant C → Customer C

Initial State:
└── All in "accepted" status

Driver clicks "START PICK-UP":
├── System calculates distances from driver to each restaurant
├── Sorts: A(500m) → C(1.2km) → B(2.5km)
└── Shows Restaurant A first

Driver navigates to Restaurant A:
├── Mark as "picked_up"
├── Re-calculate distances from current location
├── New sort: C(800m) → B(1.8km)
└── Shows Restaurant C next

Driver accepts NEW Order D during pickup:
├── Restaurant D is only 400m from current location
├── System re-sorts: D(400m) → C(800m) → B(1.8km)
└── Shows Restaurant D as next pickup

After all pickups (A, D, C, B picked up):
├── Switch to DELIVERY MODE
├── Calculate distances to customers
├── Sort: Customer A(600m) → Customer D(1.1km) → Customer C(2.3km) → Customer B(3.5km)
└── Navigate in that order

During delivery, can accept new orders but:
└── Won't pickup until current deliveries complete
```

## OSRM Integration

```javascript
// Route Request
GET https://router.project-osrm.org/route/v1/driving/
    {startLng},{startLat};{endLng},{endLat}
    ?overview=full&geometries=geojson

// Response
{
  "code": "Ok",
  "routes": [{
    "distance": 1234.5,      // meters
    "duration": 123.4,       // seconds
    "geometry": {
      "coordinates": [
        [lng1, lat1],
        [lng2, lat2],
        ...
      ]
    }
  }]
}

// Fallback (if OSRM fails)
Haversine Formula:
  distance = 2 * R * asin(sqrt(sin²(Δφ/2) + cos(φ1) * cos(φ2) * sin²(Δλ/2)))
  where R = Earth radius (6371 km)
```

## Real-time Updates

```
Browser Geolocation API
        ↓
    Every 5 seconds
        ↓
Get current position (lat, lng)
        ↓
Update driverLocation state
        ↓
PATCH /deliveries/:id/location
        ↓
Fetch updated pickup/delivery lists
        ↓
Re-sort by new distances
        ↓
Update UI with new order
```

## Notifications Flow

```
Status Change Event
        ↓
Backend sends notifications to:
├── Customer
│   ├── "Driver assigned"
│   ├── "Order picked up"
│   ├── "Driver on the way"
│   ├── "Driver arrived"
│   └── "Order delivered"
│
└── Restaurant
    ├── "Driver assigned"
    ├── "Driver picked up order"
    └── "Order delivered"
```

## Key Features Summary

✅ **Smart Routing**

- OSRM-based distance calculation
- Real-time route optimization
- Dynamic re-sorting on location change

✅ **Multi-Order Support**

- Accept multiple orders
- Optimized pickup sequence
- Optimized delivery sequence

✅ **Live Tracking**

- 5-second location updates
- Visual map with markers
- Route polylines

✅ **Status Management**

- Validated state transitions
- Automatic timestamps
- Notification triggers

✅ **User Experience**

- Numbered pickup/delivery lists
- Sticky action buttons
- Real-time feedback
- Mobile-responsive

---

This architecture provides a scalable, production-ready delivery system
similar to major food delivery platforms like Uber Eats and DoorDash.
