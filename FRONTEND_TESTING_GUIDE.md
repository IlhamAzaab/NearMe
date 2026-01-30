# 🎯 Frontend Testing Guide - Route-Based Delivery System

## Overview

This guide walks you through testing the complete route-based delivery system from the **frontend perspective**. You'll test both Available Deliveries and Active Deliveries pages to see the route-extension logic in action.

---

## 📋 Prerequisites

### 1. Database Setup ✅

```sql
-- Run this in Supabase SQL Editor
-- File: database/delivery_stops_table.sql
```

**Status Check:**

```sql
SELECT COUNT(*) FROM delivery_stops;
-- Should return 0 (table exists but empty)
```

### 2. Backend Running ✅

```bash
cd backend
npm start
```

**Expected Output:**

```
Server running on port 5000
Connected to Supabase
```

### 3. Frontend Running ✅

```bash
cd frontend
npm run dev
```

**Expected Output:**

```
  VITE v4.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

---

## 🧪 Test Scenario 1: First Delivery (Empty Route)

### Setup

- Driver has NO active deliveries
- Driver's route is empty (0 stops)
- New order comes in

### Steps

#### 1️⃣ Navigate to Available Deliveries

```
URL: http://localhost:5173/driver/deliveries
```

**What You Should See:**

- Available deliveries list
- Each delivery card shows:
  - 📍 Map with driver → restaurant → customer route
  - 💰 Driver earnings
  - 📏 Total distance (from driver to restaurant + restaurant to customer)
  - ⏱️ Estimated time
  - ✅ "ACCEPT DELIVERY" button (green)

**Console Output (Browser DevTools):**

```
🔍 [FRONTEND] Fetching available deliveries with route context...
✅ [FRONTEND] Received route-based deliveries: {total_available: 3, ...}
📊 [FRONTEND] Total available: 3
🚗 [FRONTEND] Current route stops: 0
```

**Backend Console Output:**

```
==========================================
🟢 [AVAILABLE DELIVERIES] Step 1/4: Get route context
==========================================
  Driver ID: abc-123
  Driver Location: (8.5017, 81.186)

[ROUTE CONTEXT] Step 1/4: Getting driver's current location...
[ROUTE CONTEXT] Step 2/4: Querying delivery_stops table...
[ROUTE CONTEXT] Step 3/4: Found 0 stops in route
[ROUTE CONTEXT] ✅ Route context ready:
  - Total stops: 0
  - Next stop order: 1
  - Driver has empty route

==========================================
🟢 [AVAILABLE DELIVERIES] Step 2/4: Fetch pending deliveries
==========================================
  Found 3 pending deliveries

==========================================
🟢 [AVAILABLE DELIVERIES] Step 3/4: Evaluate each delivery as route extension
==========================================

--- [EVALUATE] Delivery #1 (Order #12345) ---
  Check 1/5: Active delivery count = 0 (threshold: 3) ✅
  Check 2/5: Building current route...
    → Driver at (8.5017, 81.186)
    → No existing stops (empty route)
  Check 3/5: Simulating route WITH this delivery...
    → Would add: Restaurant (8.5100, 81.1900) → Customer (8.5200, 81.2000)
    → Waypoints: [(8.5017,81.186), (8.5100,81.1900), (8.5200,81.2000)]

[MULTI-STOP ROUTE] Calling OSRM with 3 waypoints...
[MULTI-STOP ROUTE] ✅ OSRM returned: 2.5 km, 8 min

  Check 4/5: Calculate extra distance/time...
    → Current route: 0 km, 0 min (empty)
    → New route: 2.5 km, 8 min
    → EXTRA: +2.5 km, +8 min
  Check 5/5: Threshold check...
    → Extra time: 8 min (threshold: 10 min) ✅
    → Extra distance: 2.5 km (threshold: 3 km) ✅

  ✅ CAN ACCEPT
  Extra earnings: Rs. 50.00

--- [EVALUATE] Delivery #2 (Order #12346) ---
...similar output...

==========================================
🟢 [AVAILABLE DELIVERIES] Step 4/4: Return filtered results
==========================================
  Deliveries that CAN be accepted: 3
  Deliveries that CANNOT be accepted: 0
```

#### 2️⃣ Accept First Delivery

Click "ACCEPT DELIVERY" button

**What You Should See:**

- Success alert: "Delivery accepted successfully!"
- Delivery disappears from list
- Remaining deliveries stay

**Console Output (Browser):**

```
✅ Delivery accepted: {delivery_id: "xxx", message: "Delivery accepted"}
```

**Backend Console Output:**

```
==========================================
🟢 [ACCEPT DELIVERY] Step 1/4: Verify driver can accept
==========================================
  Driver ID: abc-123
  Delivery ID: xxx
  Driver status: delivering

[ACCEPT DELIVERY] ✅ Driver is in delivering mode

==========================================
🟢 [ACCEPT DELIVERY] Step 2/4: Update delivery status to 'accepted'
==========================================
  Updating delivery xxx to status: accepted
  ✅ Delivery status updated

==========================================
🟢 [ACCEPT DELIVERY] Step 3/4: Insert delivery stops into route
==========================================

[INSERT STOPS] Step 1/4: Get route context for driver abc-123...
[ROUTE CONTEXT] Step 1/4: Getting driver's current location...
[ROUTE CONTEXT] Step 2/4: Querying delivery_stops table...
[ROUTE CONTEXT] Step 3/4: Found 0 stops in route
[ROUTE CONTEXT] ✅ Route context ready:
  - Total stops: 0
  - Next stop order: 1

[INSERT STOPS] Step 2/4: Prepare stop data...
  Restaurant stop: order=1, type=restaurant, lat=8.5100, lng=81.1900
  Customer stop: order=2, type=customer, lat=8.5200, lng=81.2000

[INSERT STOPS] Step 3/4: Insert both stops atomically...
[INSERT STOPS] ✅ Successfully inserted 2 stops

[DELIVERY_STOPS] 🔔 TRIGGER: Stop inserted
  driver_id: abc-123
  delivery_id: xxx
  stop_type: restaurant
  stop_order: 1

[DELIVERY_STOPS] 🔔 TRIGGER: Stop inserted
  driver_id: abc-123
  delivery_id: xxx
  stop_type: customer
  stop_order: 2

[INSERT STOPS] Step 4/4: Verify insertion...
  ✅ 2 stops now in driver's route

==========================================
🟢 [ACCEPT DELIVERY] Step 4/4: Send notifications
==========================================
  ✅ Notification sent to customer
```

#### 3️⃣ Navigate to Active Deliveries

```
URL: http://localhost:5173/driver/deliveries/active
```

**What You Should See:**

- Active deliveries page
- **NEW: Route Visualization Section** showing:

  ```
  Your Route (2 stops)

  [1] 🍽️ Pick up - Order #12345
      Restaurant Name
      Stop 1 • restaurant
      [NEXT]

  [2] 👤 Deliver - Order #12345
      Customer Name
      Stop 2 • customer
      [UPCOMING]
  ```

- Delivery card with map
- Order details

**Console Output (Browser):**

```
🔍 [FRONTEND] Fetching active deliveries with ordered stops...
✅ [FRONTEND] Received active deliveries: {total_deliveries: 1, total_stops: 2}
📊 [FRONTEND] Total deliveries: 1
🛣️ [FRONTEND] Total stops: 2
```

**Backend Console Output:**

```
==========================================
🟢 [ACTIVE DELIVERIES V2] Fetching for driver abc-123
==========================================

[ROUTE CONTEXT] Step 1/4: Getting driver's current location...
[ROUTE CONTEXT] Step 2/4: Querying delivery_stops table...
[ROUTE CONTEXT] Step 3/4: Found 2 stops in route
  Stop 1: order=1, type=restaurant, delivery=xxx
  Stop 2: order=2, type=customer, delivery=xxx
[ROUTE CONTEXT] ✅ Route context ready:
  - Total stops: 2
  - Next stop order: 3

[DELIVERY_STOPS] Formatting active deliveries...
  ✅ Delivery xxx has 2 stops in sequence

Response:
{
  driver_location: {latitude: 8.5017, longitude: 81.186},
  active_deliveries: [
    {
      delivery_id: "xxx",
      order_number: "12345",
      status: "accepted",
      stops: [
        {stop_order: 1, stop_type: "restaurant", latitude: 8.5100, longitude: 81.1900},
        {stop_order: 2, stop_type: "customer", latitude: 8.5200, longitude: 81.2000}
      ]
    }
  ],
  total_deliveries: 1,
  total_stops: 2
}
```

---

## 🧪 Test Scenario 2: Second Delivery (Route Extension)

### Setup

- Driver has 1 active delivery (2 stops: restaurant, customer)
- New order comes in
- System should show EXTRA distance/time added to route

### Steps

#### 1️⃣ Go Back to Available Deliveries

```
URL: http://localhost:5173/driver/deliveries
```

**What You Should See:**

- Remaining deliveries
- **NEW: Route Extension Impact Badge** showing:

  ```
  Route Extension Impact

  +1.2 km added | +5 min added | +Rs. 30.00 extra

  This delivery adds 1.2 km and 5 min to your current route
  ```

**Console Output (Browser):**

```
🔍 [FRONTEND] Fetching available deliveries with route context...
✅ [FRONTEND] Received route-based deliveries: {total_available: 2, ...}
📊 [FRONTEND] Total available: 2
🚗 [FRONTEND] Current route stops: 2
```

**Backend Console Output:**

```
==========================================
🟢 [AVAILABLE DELIVERIES] Step 1/4: Get route context
==========================================

[ROUTE CONTEXT] Step 1/4: Getting driver's current location...
[ROUTE CONTEXT] Step 2/4: Querying delivery_stops table...
[ROUTE CONTEXT] Step 3/4: Found 2 stops in route
  Stop 1: order=1, type=restaurant, delivery=xxx
  Stop 2: order=2, type=customer, delivery=xxx
[ROUTE CONTEXT] ✅ Route context ready:
  - Total stops: 2
  - Next stop order: 3
  - Driver has active route

==========================================
🟢 [AVAILABLE DELIVERIES] Step 3/4: Evaluate each delivery as route extension
==========================================

--- [EVALUATE] Delivery #2 (Order #12346) ---
  Check 1/5: Active delivery count = 1 (threshold: 3) ✅
  Check 2/5: Building current route...
    → Driver at (8.5017, 81.186)
    → Existing stops:
      1. Restaurant at (8.5100, 81.1900)
      2. Customer at (8.5200, 81.2000)
    → Waypoints: [(8.5017,81.186), (8.5100,81.1900), (8.5200,81.2000)]

[MULTI-STOP ROUTE] Calling OSRM with 3 waypoints...
[MULTI-STOP ROUTE] ✅ OSRM returned: 2.5 km, 8 min

  Check 3/5: Simulating route WITH this delivery...
    → Would add: Restaurant (8.5150, 81.1950) → Customer (8.5250, 81.2050)
    → Waypoints: [
        (8.5017,81.186),
        (8.5100,81.1900),  // Stop 1
        (8.5200,81.2000),  // Stop 2
        (8.5150,81.1950),  // NEW Stop 3
        (8.5250,81.2050)   // NEW Stop 4
      ]

[MULTI-STOP ROUTE] Calling OSRM with 5 waypoints...
[MULTI-STOP ROUTE] ✅ OSRM returned: 3.7 km, 13 min

  Check 4/5: Calculate extra distance/time...
    → Current route (R0): 2.5 km, 8 min
    → New route (R1): 3.7 km, 13 min
    → EXTRA: +1.2 km, +5 min ✨ THIS IS THE MAGIC

  Check 5/5: Threshold check...
    → Extra time: 5 min (threshold: 10 min) ✅
    → Extra distance: 1.2 km (threshold: 3 km) ✅

  ✅ CAN ACCEPT
  Extra distance: 1.2 km
  Extra time: 5 min
  Extra earnings: Rs. 30.00

--- [EVALUATE] Delivery #3 (Order #12347) ---
  Check 1/5: Active delivery count = 1 (threshold: 3) ✅
  Check 2/5: Building current route...
    [same as above]
  Check 3/5: Simulating route WITH this delivery...
    → Far away restaurant at (8.6000, 81.3000)
    → Waypoints would be: [(8.5017,81.186), (8.5100,81.1900), (8.5200,81.2000), (8.6000,81.3000), (8.6100,81.3100)]

[MULTI-STOP ROUTE] Calling OSRM with 5 waypoints...
[MULTI-STOP ROUTE] ✅ OSRM returned: 8.0 km, 22 min

  Check 4/5: Calculate extra distance/time...
    → Current route (R0): 2.5 km, 8 min
    → New route (R1): 8.0 km, 22 min
    → EXTRA: +5.5 km, +14 min

  Check 5/5: Threshold check...
    → Extra time: 14 min (threshold: 10 min) ❌ TOO MUCH
    → Extra distance: 5.5 km (threshold: 3 km) ❌ TOO MUCH

  ❌ CANNOT ACCEPT
  Reason: "Adds too much time (+14 min) and distance (+5.5 km) to your route"
```

**What You Should See on Frontend:**

- Delivery #2 shows: `+1.2 km added | +5 min added | +Rs. 30.00 extra`
- Delivery #2 has GREEN "ACCEPT DELIVERY" button
- Delivery #3 shows: **RED "CANNOT ACCEPT" button**
- Delivery #3 shows warning: "Cannot Accept: Adds too much time (+14 min) and distance (+5.5 km) to your route"

#### 2️⃣ Accept Second Delivery

Click "ACCEPT DELIVERY" on the one that CAN be accepted

**Backend Console Output:**

```
==========================================
🟢 [ACCEPT DELIVERY] Step 3/4: Insert delivery stops into route
==========================================

[INSERT STOPS] Step 1/4: Get route context...
[ROUTE CONTEXT] Step 3/4: Found 2 stops in route
[ROUTE CONTEXT] ✅ Route context ready:
  - Total stops: 2
  - Next stop order: 3  ← CONTINUES THE SEQUENCE

[INSERT STOPS] Step 2/4: Prepare stop data...
  Restaurant stop: order=3, type=restaurant  ← SEQUENTIAL
  Customer stop: order=4, type=customer      ← SEQUENTIAL

[INSERT STOPS] Step 3/4: Insert both stops atomically...
[INSERT STOPS] ✅ Successfully inserted 2 stops

[DELIVERY_STOPS] 🔔 TRIGGER: Stop inserted (stop_order=3)
[DELIVERY_STOPS] 🔔 TRIGGER: Stop inserted (stop_order=4)

[INSERT STOPS] Step 4/4: Verify insertion...
  ✅ 4 stops now in driver's route
```

#### 3️⃣ Check Active Deliveries Again

```
URL: http://localhost:5173/driver/deliveries/active
```

**What You Should See:**

```
Your Route (4 stops)

[1] 🍽️ Pick up - Order #12345
    Restaurant 1
    Stop 1 • restaurant
    [NEXT]

[2] 👤 Deliver - Order #12345
    Customer 1
    Stop 2 • customer
    [UPCOMING]

[3] 🍽️ Pick up - Order #12346
    Restaurant 2
    Stop 3 • restaurant
    [UPCOMING]

[4] 👤 Deliver - Order #12346
    Customer 2
    Stop 4 • customer
    [UPCOMING]
```

**Backend Console Output:**

```
[ROUTE CONTEXT] Step 3/4: Found 4 stops in route
  Stop 1: order=1, type=restaurant, delivery=xxx
  Stop 2: order=2, type=customer, delivery=xxx
  Stop 3: order=3, type=restaurant, delivery=yyy  ← NEW
  Stop 4: order=4, type=customer, delivery=yyy    ← NEW
[ROUTE CONTEXT] ✅ Route context ready:
  - Total stops: 4
  - Next stop order: 5

Response:
{
  total_deliveries: 2,
  total_stops: 4,
  active_deliveries: [
    {
      delivery_id: "xxx",
      stops: [{stop_order: 1, ...}, {stop_order: 2, ...}]
    },
    {
      delivery_id: "yyy",
      stops: [{stop_order: 3, ...}, {stop_order: 4, ...}]
    }
  ]
}
```

---

## 🧪 Test Scenario 3: Third Delivery (At Threshold)

### Setup

- Driver has 2 active deliveries (4 stops)
- Try to accept a 3rd delivery (at the 3-delivery limit)

### Steps

#### 1️⃣ Go to Available Deliveries

```
URL: http://localhost:5173/driver/deliveries
```

**Backend Console Output:**

```
==========================================
🟢 [AVAILABLE DELIVERIES] Step 3/4: Evaluate each delivery as route extension
==========================================

--- [EVALUATE] Delivery #4 (Order #12348) ---
  Check 1/5: Active delivery count = 2 (threshold: 3) ✅ STILL OK
  Check 2/5: Building current route...
    → Driver at (8.5017, 81.186)
    → Existing stops: 4 stops
    → Waypoints: [(8.5017,81.186), (8.5100,81.1900), (8.5200,81.2000), (8.5150,81.1950), (8.5250,81.2050)]

[MULTI-STOP ROUTE] Calling OSRM with 5 waypoints...
[MULTI-STOP ROUTE] ✅ OSRM returned: 3.7 km, 13 min

  Check 3/5: Simulating route WITH this delivery...
    → Waypoints: [driver, stop1, stop2, stop3, stop4, NEW_stop5, NEW_stop6]

[MULTI-STOP ROUTE] Calling OSRM with 7 waypoints...
[MULTI-STOP ROUTE] ✅ OSRM returned: 4.5 km, 16 min

  Check 4/5: Calculate extra distance/time...
    → Current route (R0): 3.7 km, 13 min
    → New route (R1): 4.5 km, 16 min
    → EXTRA: +0.8 km, +3 min

  Check 5/5: Threshold check...
    → Extra time: 3 min (threshold: 10 min) ✅
    → Extra distance: 0.8 km (threshold: 3 km) ✅

  ✅ CAN ACCEPT (3rd delivery allowed)
```

#### 2️⃣ Accept Third Delivery

Click "ACCEPT DELIVERY"

**Backend Console Output:**

```
[INSERT STOPS] Step 1/4: Get route context...
[ROUTE CONTEXT] ✅ Route context ready:
  - Total stops: 4
  - Next stop order: 5  ← CONTINUES

[INSERT STOPS] Step 2/4: Prepare stop data...
  Restaurant stop: order=5, type=restaurant
  Customer stop: order=6, type=customer

[INSERT STOPS] ✅ Successfully inserted 2 stops

[INSERT STOPS] Step 4/4: Verify insertion...
  ✅ 6 stops now in driver's route
```

#### 3️⃣ Check Active Deliveries

```
URL: http://localhost:5173/driver/deliveries/active
```

**What You Should See:**

```
Your Route (6 stops)

[1] 🍽️ Pick up - Order #12345
[2] 👤 Deliver - Order #12345
[3] 🍽️ Pick up - Order #12346
[4] 👤 Deliver - Order #12346
[5] 🍽️ Pick up - Order #12348
[6] 👤 Deliver - Order #12348
```

---

## 🧪 Test Scenario 4: Fourth Delivery (Over Limit)

### Setup

- Driver has 3 active deliveries (6 stops)
- Try to accept a 4th delivery (over the 3-delivery limit)

### Steps

#### 1️⃣ Go to Available Deliveries

```
URL: http://localhost:5173/driver/deliveries
```

**Backend Console Output:**

```
==========================================
🟢 [AVAILABLE DELIVERIES] Step 3/4: Evaluate each delivery as route extension
==========================================

--- [EVALUATE] Delivery #5 (Order #12349) ---
  Check 1/5: Active delivery count = 3 (threshold: 3) ❌ AT LIMIT

  ❌ CANNOT ACCEPT
  Reason: "You already have 3 active deliveries (maximum allowed)"

  [Skipping remaining checks - delivery already rejected]
```

**What You Should See on Frontend:**

- Delivery #5 shows: **RED "CANNOT ACCEPT" button**
- Warning message: "Cannot Accept: You already have 3 active deliveries (maximum allowed)"
- No route extension metrics shown (check 1 failed, so no routing calculation needed)

---

## 🧪 Test Scenario 5: Complete a Delivery (Route Updates)

### Setup

- Driver has 3 active deliveries (6 stops)
- Complete first delivery (remove 2 stops)
- Check that route updates and new deliveries become available

### Steps

#### 1️⃣ Complete First Delivery

(Use existing delivery completion flow - pick up, deliver, mark complete)

**Expected Database Changes:**

```sql
-- Before completion
SELECT * FROM delivery_stops WHERE driver_id = 'abc-123' ORDER BY stop_order;
-- 6 rows (orders 1,2,3,4,5,6)

-- After completion
SELECT * FROM delivery_stops WHERE driver_id = 'abc-123' ORDER BY stop_order;
-- 4 rows (orders 3,4,5,6)  ← Stops 1,2 removed when delivery completed
```

#### 2️⃣ Go to Available Deliveries

```
URL: http://localhost:5173/driver/deliveries
```

**Backend Console Output:**

```
==========================================
🟢 [AVAILABLE DELIVERIES] Step 1/4: Get route context
==========================================

[ROUTE CONTEXT] Step 3/4: Found 4 stops in route
  Stop 1: order=3, type=restaurant, delivery=yyy  ← RENUMBERED!
  Stop 2: order=4, type=customer, delivery=yyy
  Stop 3: order=5, type=restaurant, delivery=zzz
  Stop 4: order=6, type=customer, delivery=zzz

[ROUTE CONTEXT] ✅ Route context ready:
  - Total stops: 4
  - Next stop order: 7  ← Ready for next delivery

==========================================
🟢 [AVAILABLE DELIVERIES] Step 3/4: Evaluate each delivery
==========================================

--- [EVALUATE] Delivery #5 (Order #12349) ---
  Check 1/5: Active delivery count = 2 (threshold: 3) ✅ BACK UNDER LIMIT
  Check 2/5: Building current route...
    → 4 stops (not 6)

  ✅ CAN ACCEPT NOW (space available)
```

**What You Should See on Frontend:**

- Delivery #5 NOW shows: **GREEN "ACCEPT DELIVERY" button**
- Route extension metrics shown: `+X km | +Y min | +Rs. Z`
- System adapts to driver completing deliveries

---

## 📊 Expected Console Output Summary

### Browser Console (Frontend)

```
🔍 [FRONTEND] Fetching available deliveries with route context...
✅ [FRONTEND] Received route-based deliveries: {...}
📊 [FRONTEND] Total available: X
🚗 [FRONTEND] Current route stops: Y
```

### Backend Console (Node.js)

```
==========================================
🟢 [AVAILABLE DELIVERIES] Step 1/4: Get route context
==========================================
[ROUTE CONTEXT] ✅ Route context ready: total_stops=X, next_order=Y

==========================================
🟢 [AVAILABLE DELIVERIES] Step 3/4: Evaluate each delivery as route extension
==========================================
--- [EVALUATE] Delivery #N ---
  Check 1/5: Active delivery count ✅/❌
  Check 2/5: Building current route... ✅
  Check 3/5: Simulating route WITH delivery... ✅
  Check 4/5: Calculate extra: +X km, +Y min ✅
  Check 5/5: Threshold check ✅/❌

  ✅ CAN ACCEPT / ❌ CANNOT ACCEPT

==========================================
🟢 [ACCEPT DELIVERY] Step 3/4: Insert delivery stops
==========================================
[INSERT STOPS] ✅ Successfully inserted 2 stops
[DELIVERY_STOPS] 🔔 TRIGGER: Stop inserted (stop_order=X)
[DELIVERY_STOPS] 🔔 TRIGGER: Stop inserted (stop_order=Y)

==========================================
🟢 [ACTIVE DELIVERIES V2] Fetching for driver
==========================================
[ROUTE CONTEXT] ✅ Route context ready: total_stops=X
[DELIVERY_STOPS] Formatting active deliveries...
  ✅ Delivery xxx has X stops in sequence
```

---

## ✅ Success Criteria

### Available Deliveries Page ✅

- [x] Shows route extension impact (`+X km`, `+Y min`, `+Rs. Z`)
- [x] Green button for deliveries that CAN be accepted
- [x] Red button for deliveries that CANNOT be accepted
- [x] Warning message for rejected deliveries
- [x] Console logging shows route evaluation steps

### Active Deliveries Page ✅

- [x] Shows "Your Route (X stops)" section
- [x] Lists stops in sequential order (1, 2, 3, 4, ...)
- [x] Shows stop type (🍽️ restaurant, 👤 customer)
- [x] Shows which stop is NEXT vs UPCOMING
- [x] Console logging shows ordered stops

### Backend Logic ✅

- [x] Route context fetched correctly
- [x] Multi-stop routing called with all waypoints
- [x] EXTRA distance/time calculated (R1 - R0)
- [x] Threshold checks work (10 min, 3 km, 3 deliveries)
- [x] Stops inserted with sequential order (1,2,3,4,5,6...)
- [x] Database triggers log insertions

---

## 🐛 Troubleshooting

### Issue: "Cannot connect to server"

**Solution:**

```bash
# Check backend is running
cd backend
npm start

# Check frontend is running
cd frontend
npm run dev
```

### Issue: "Table delivery_stops does not exist"

**Solution:**

```sql
-- Run in Supabase SQL Editor
-- File: database/delivery_stops_table.sql
```

### Issue: "OSRM error: Cannot connect to routing server"

**Solution:**

```bash
# Start OSRM container
docker-compose up -d osrm

# Check OSRM is running
curl http://localhost:5000/route/v1/driving/81.186,8.5017;81.195,8.5100
```

### Issue: No route extension metrics shown

**Check:**

1. Backend returning `extra_distance_km`, `extra_time_minutes`, `extra_earnings` fields
2. Frontend logging shows these fields in console
3. Driver has active deliveries (not empty route)

### Issue: Stops not in order

**Check:**

```sql
SELECT * FROM delivery_stops
WHERE driver_id = 'YOUR_DRIVER_ID'
ORDER BY stop_order;

-- Should show: 1, 2, 3, 4, 5, 6 (not gaps)
```

---

## 🎯 What to Look For

### The Magic Moment 🪄

When you accept the **second delivery**, watch the backend console:

```
  Check 4/5: Calculate extra distance/time...
    → Current route (R0): 2.5 km, 8 min
    → New route (R1): 3.7 km, 13 min
    → EXTRA: +1.2 km, +5 min ✨ THIS IS THE DIFFERENCE
```

**This is the route-extension model in action!**

- Not showing "3.7 km total" (trip-based)
- Showing "+1.2 km added" (route-based)
- This is what Uber Eats/DoorDash does

### Frontend Shows Same Logic

```
Route Extension Impact

+1.2 km added | +5 min added | +Rs. 30.00 extra

This delivery adds 1.2 km and 5 min to your current route
```

**Driver sees:** "If I accept this, my route gets 1.2 km longer"

**Not:** "This delivery is 3.7 km from me"

---

## 📝 Test Checklist

- [ ] Database schema deployed
- [ ] Backend running with no errors
- [ ] Frontend running with no errors
- [ ] OSRM container running
- [ ] Test Scenario 1: First delivery (empty route) ✅
- [ ] Test Scenario 2: Second delivery (route extension) ✅
- [ ] Test Scenario 3: Third delivery (at limit) ✅
- [ ] Test Scenario 4: Fourth delivery (over limit) ✅
- [ ] Test Scenario 5: Complete delivery (route updates) ✅
- [ ] Console output matches expected format ✅
- [ ] Frontend displays route extension metrics ✅
- [ ] Active deliveries shows ordered stops ✅

---

## 🚀 Next Steps After Testing

1. **Tune Thresholds** (if needed)

   ```javascript
   // backend/utils/availableDeliveriesLogic.js
   const AVAILABLE_DELIVERY_THRESHOLDS = {
     MAX_EXTRA_TIME_MINUTES: 10, // Adjust this
     MAX_EXTRA_DISTANCE_KM: 3, // Adjust this
     MAX_ACTIVE_DELIVERIES: 3, // Adjust this
   };
   ```

2. **Deploy to Staging**
   - Test with real drivers
   - Collect feedback
   - Monitor console logs

3. **Production Deployment**
   - Deploy database schema
   - Deploy backend
   - Deploy frontend
   - Monitor for issues

---

**Testing Time:** ~30-45 minutes for all scenarios
**Expected Result:** Complete understanding of route-based delivery system with visual confirmation

Happy Testing! 🎉
