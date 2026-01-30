# Route-Based Delivery System - Quick Reference Card

## 🚀 Quick Start (5 Minutes)

### 1. Deploy Database

```sql
-- Copy entire content of: database/delivery_stops_table.sql
-- Paste into Supabase SQL Editor
-- Execute
```

### 2. Restart Backend

```bash
cd backend
npm start
```

### 3. Test Accept Delivery

```bash
curl -X POST http://localhost:3000/api/driver/deliveries/{id}/accept \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"driver_latitude": 8.5, "driver_longitude": 81.1}'

# Check console for logs:
# [ACCEPT DELIVERY] ✅
# [INSERT STOPS] ✓
# [DELIVERY_STOPS] ✓
```

### 4. Test Active Deliveries

```bash
curl http://localhost:3000/api/driver/deliveries/active/v2 \
  -H "Authorization: Bearer {token}"

# Should return stops with stop_order values
```

### 5. Test Available Deliveries

```bash
curl "http://localhost:3000/api/driver/deliveries/available/v2?driver_latitude=8.5&driver_longitude=81.1" \
  -H "Authorization: Bearer {token}"

# Should show extra_distance_km, extra_time_minutes
```

---

## 📊 Data Structure

### delivery_stops Table

```
driver_id        │ delivery_id      │ stop_type  │ stop_order │ latitude │ longitude
─────────────────┼──────────────────┼────────────┼────────────┼──────────┼──────────
uuid-driver-1    │ uuid-delivery-1  │ restaurant │      1     │  8.51    │  81.11
uuid-driver-1    │ uuid-delivery-1  │ customer   │      2     │  8.52    │  81.12
uuid-driver-1    │ uuid-delivery-2  │ restaurant │      3     │  8.53    │  81.13
uuid-driver-1    │ uuid-delivery-2  │ customer   │      4     │  8.54    │  81.14
```

**Key Point**: `stop_order` maintains sequence (1, 2, 3, 4...)

---

## 🔌 API Endpoints

### POST /driver/deliveries/{id}/accept

**What it does**: Driver accepts a delivery
**New behavior**: Inserts 2 stops into delivery_stops table
**Console shows**: 4-step process with detailed logs
**Response**: Delivery details with restaurant/customer info

### GET /driver/deliveries/active/v2

**What it does**: Get driver's active deliveries with stops
**Request**: No parameters (uses JWT for driver_id)
**Response**:

```json
{
  "active_deliveries": [
    {
      "delivery_id": "uuid",
      "order_number": 1001,
      "stops": [
        {
          "stop_order": 1,
          "stop_type": "restaurant",
          "latitude": 8.51,
          "longitude": 81.11
        },
        {
          "stop_order": 2,
          "stop_type": "customer",
          "latitude": 8.52,
          "longitude": 81.12
        }
      ]
    }
  ],
  "total_deliveries": 1,
  "total_stops": 2
}
```

### GET /driver/deliveries/available/v2

**What it does**: Get available deliveries as route extensions
**Request**: `?driver_latitude=8.5&driver_longitude=81.1`
**Response**:

```json
{
  "available_deliveries": [
    {
      "delivery_id": "uuid",
      "order_number": 1002,
      "route_impact": {
        "extra_distance_km": 1.42,      // ← Not total distance!
        "extra_time_minutes": 6.0,      // ← Not total time!
        "extra_earnings": 450
      },
      "restaurant": {...},
      "customer": {...},
      "pricing": {...}
    }
  ],
  "total_available": 1,
  "current_route": {
    "total_stops": 2,
    "active_deliveries": 1
  }
}
```

### GET /driver/route-context (Debug)

**What it does**: Returns raw route context
**Response**: Driver location + all stops + next stop order
**Usage**: Debugging only

---

## 🎯 Key Concepts

| Concept            | Before        | After                |
| ------------------ | ------------- | -------------------- |
| **Delivery Model** | Single trip   | Route extension      |
| **Distance Shown** | Total: 5.2 km | Extra: +1.4 km       |
| **Time Shown**     | Total: 15 min | Extra: +6 min        |
| **Route Calc**     | Independent   | vs. current route    |
| **Data Storage**   | None          | delivery_stops table |

---

## 🔍 Console Logging Guide

### When Accepting Delivery:

```
[ACCEPT DELIVERY] ✅ Accepting...
[ACCEPT DELIVERY] → Step X: ...
[ACCEPT DELIVERY]   ✓ Success detail
[ROUTE CONTEXT] 🔍 Fetching...
[INSERT STOPS] 🔄 Inserting...
[DELIVERY_STOPS] ✓ Inserted...
```

### When Getting Available Deliveries:

```
[AVAILABLE DELIVERIES] Step 1️⃣: Get route context
[AVAILABLE DELIVERIES] Step 2️⃣: Fetch candidates
[AVAILABLE DELIVERIES] Step 3️⃣: Evaluate each
[EVALUATE] 🔍 Evaluating...
[MULTI-STOP ROUTE] 🗺️  Calculating...
[EVALUATE] ✅ ACCEPTED
```

### When Getting Active Deliveries:

```
[ACTIVE DELIVERIES V2] 📦 Fetching...
[ROUTE CONTEXT] 🔍 Fetching...
[ACTIVE DELIVERIES] ✅ Formatted...
```

---

## 🐛 Quick Debugging

### Problem: No stops in database

**Check:**

```sql
SELECT * FROM delivery_stops WHERE driver_id = 'driver-uuid';
```

Should return rows after accepting delivery.

### Problem: Available deliveries empty

**Check:**

1. Does driver have 1+ accepted delivery? (needs route context)
2. Are there pending deliveries? (`status = 'pending'`)
3. Are pending deliveries within thresholds? (<10min, <3km)

### Problem: Available deliveries too many

**Thresholds:**

- Max extra time: 10 minutes
- Max extra distance: 3 km
- Max active deliveries: 3

Change in `availableDeliveriesLogic.js`:

```javascript
const AVAILABLE_DELIVERY_THRESHOLDS = {
  MAX_EXTRA_TIME_MINUTES: 10, // ← Change here
  MAX_EXTRA_DISTANCE_KM: 3, // ← Change here
  MAX_ACTIVE_DELIVERIES: 3, // ← Change here
};
```

### Problem: OSRM errors

**Check:**

```bash
curl http://localhost:5000/route/v1/driving/81.1,8.5;81.2,8.6
```

If fails, OSRM not running:

```bash
docker ps  # See if osrm container running
docker-compose up osrm  # Start if needed
```

---

## 📝 Files Overview

| File                                        | Purpose                 | Status      |
| ------------------------------------------- | ----------------------- | ----------- |
| `database/delivery_stops_table.sql`         | Create table + indexes  | ✅ Created  |
| `backend/utils/driverRouteContext.js`       | Route context functions | ✅ Created  |
| `backend/utils/availableDeliveriesLogic.js` | Route extension logic   | ✅ Created  |
| `backend/routes/driverDelivery.js`          | Endpoints (modified)    | ✅ Modified |
| `src/components/AvailableDeliveries-v2.jsx` | Frontend component      | ⏳ TODO     |
| `src/components/ActiveDeliveries-v2.jsx`    | Frontend component      | ⏳ TODO     |

---

## ✅ Success Checklist

After implementation, verify:

- [ ] Backend starts without errors
- [ ] Accept delivery endpoint shows logs
- [ ] delivery_stops table has correct data
- [ ] Active deliveries shows ordered stops (1, 2, 3, 4...)
- [ ] Available deliveries shows extra_distance_km (not total)
- [ ] Available deliveries filters by threshold
- [ ] Console output matches examples in guide

---

## 🎯 What Driver Sees

### Before (❌ WRONG):

**Available Deliveries Page:**

```
Order #1002
📍 5.2 km total  ← Shows total distance from driver to customer
💰 Rs 450       ← Just the fee

Problem: Ignores driver's current route
Result: Driver might accept, then realize it's a 20-minute detour
```

### After (✅ CORRECT):

**Available Deliveries Page:**

```
Order #1002
➕ +1.4 km added to your route
➕ +6 min added to your route
💰 +Rs 450 more
✓ Fits your current route

Benefit: Driver knows it's only a small detour
Trust increases: "This app is honest about distances"
```

---

## 🚀 Frontend Implementation

Create these components:

### AvailableDeliveries-v2.jsx

```jsx
import { getAvailableDeliveries } from "@/api/driver";

export function AvailableDeliveries() {
  const [deliveries, setDeliveries] = useState([]);

  useEffect(() => {
    getAvailableDeliveries(driverLat, driverLng).then(setDeliveries);
  }, [driverLat, driverLng]);

  return (
    <div>
      {deliveries.map((d) => (
        <div key={d.delivery_id}>
          <h3>{d.restaurant.name}</h3>
          <p>➕ {d.route_impact.extra_distance_km} km</p>
          <p>➕ {d.route_impact.extra_time_minutes} min</p>
          <p>💰 +{d.route_impact.extra_earnings}</p>
          <button>Accept</button>
        </div>
      ))}
    </div>
  );
}
```

### ActiveDeliveries-v2.jsx

```jsx
import { getActiveDeliveries } from "@/api/driver";

export function ActiveDeliveries() {
  const [data, setData] = useState(null);

  useEffect(() => {
    getActiveDeliveries().then(setData);
  }, []);

  return (
    <div>
      {data?.active_deliveries.map((delivery) => (
        <div key={delivery.delivery_id}>
          <h3>Order #{delivery.order_number}</h3>
          <div>
            {delivery.stops.map((stop) => (
              <div key={stop.stop_order}>
                Stop {stop.stop_order}: {stop.stop_type}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## 🔗 Related Files

**Documentation Files Created:**

- `ROUTE_SYSTEM_COMPLETE_DOCUMENTATION.js` - Full technical docs
- `IMPLEMENTATION_TESTING_GUIDE.md` - Step-by-step testing
- `IMPLEMENTATION_COMPLETE_SUMMARY.md` - Implementation overview

---

## 📞 Support

All console logging shows exactly what's happening. If something doesn't work:

1. Check console for error logs
2. Look for step that failed (marked with ❌)
3. Check database for correct data
4. Verify OSRM is running if multi-stop routing fails
5. Check thresholds in `availableDeliveriesLogic.js`

---

**Last Updated**: January 27, 2026  
**Status**: Backend Complete ✅ | Frontend TODO ⏳
