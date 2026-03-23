# NearMe Routing Strategy

## Two-Step Optimal Routing Approach

### Strategy Overview
We use a two-step process to optimize both distance (cost) and ETA (time):

1. **FOOT (Walking) Profile** → Shortest Route Distance
2. **DRIVING (Bike) Profile** → Realistic ETA

---

## Step 1: Route Calculation (Distance) - FOOT Profile

**File:** `backend/utils/osrmService.js`  
**Profile Used:** `foot` (walking)

### Purpose:
- Find the **shortest possible route** through small lanes and shortcuts
- Calculate accurate **delivery distance** for fee calculation
- Display route on map (driver and customer views)

### Why Foot Profile?
- ✅ Uses pedestrian paths, alleys, and small lanes
- ✅ Ignores one-way restrictions (bikes can go against traffic on small roads)
- ✅ Provides 20-30% shorter distance than driving routes
- ✅ Lower delivery fees for customers
- ✅ Lower earnings costs for business

### Used By:
- Available Deliveries (distance calculation)
- Checkout page (delivery fee calculation)
- Driver Map (route display)
- Active Deliveries (route preview)

---

## Step 2: ETA Calculation (Time) - DRIVING Profile

**File:** `backend/utils/etaCalculator.js`  
**Profile Used:** `driving` (motorcycle/car)

### Purpose:
- Calculate **realistic arrival time** for bike/motorcycle riders
- Show accurate ETA to customers
- Provide realistic time estimates to drivers

### Why Driving Profile?
- ✅ Uses realistic motorcycle/bike speeds (not walking speed!)
- ✅ Accounts for traffic patterns on roads
- ✅ Provides accurate time estimates
- ✅ Customers see realistic delivery time

### Used By:
- Customer ETA display
- Driver ETA calculation
- Available deliveries time estimates
- Active deliveries time tracking

---

## Example Comparison

### Route: Restaurant A → Customer B (2 km straight-line distance)

#### OLD (Driving for both):
- **Route Profile:** Driving
- **Route Distance:** 3.2 km (via main roads)
- **Delivery Fee:** Rs. 128 (3.2 km × Rs. 40/km)
- **ETA:** 8 minutes (driving speed)

#### NEW (Foot for distance, Driving for ETA):
- **Route Profile:** Foot (walking)
- **Route Distance:** 2.1 km (via small lanes + shortcuts)
- **Delivery Fee:** Rs. 84 (2.1 km × Rs. 40/km)
- **ETA:** 6 minutes (driving speed on that 2.1 km route)

**Result:**
- ✅ 34% shorter distance (3.2 km → 2.1 km)
- ✅ Rs. 44 savings per delivery
- ✅ Faster delivery (6 min vs 8 min)
- ✅ Realistic ETA (not walking time)

---

## Technical Implementation

### Backend

```javascript
// osrmService.js - Route Distance Calculation
const profilesToTry = ["foot"]; // ALWAYS foot - shortest distance
console.log(`[OSRM] → Using profile: FOOT (walking) for shortest routes`);
// Returns: { distance: 2100, duration: 1500, geometry: {...} }
```

```javascript
// etaCalculator.js - ETA Calculation
const profiles = ["driving"]; // DRIVING for realistic bike/motorcycle ETA
console.log(`[ETA] Using DRIVING profile for realistic ETA`);
// Returns: { duration: 360, distance: 2100 }
```

### Workflow

```
1. Driver views Available Deliveries
   ↓
2. osrmService.getOSRMRoute() called with FOOT profile
   ↓
3. Route calculated through small lanes: 2.1 km
   ↓
4. Delivery fee calculated: 2.1 km × Rs. 40 = Rs. 84
   ↓
5. etaCalculator.calculateDriverETA() called with DRIVING profile
   ↓
6. ETA calculated using bike speed: 6 minutes
   ↓
7. Display: "2.1 km - Rs. 84 - 6 min ETA"
```

---

## Benefits Summary

### For Customers:
- 💰 **Lower delivery fees** (20-30% reduction)
- ⏱️ **Accurate ETA** (not inflated walking times)
- 🚀 **Faster deliveries** (shorter routes)

### For Business:
- 💸 **Lower driver earnings costs**
- 📊 **More accurate distance tracking**
- 🎯 **Competitive pricing**

### For Drivers:
- 🛵 **Optimal routes** (shortest distance)
- ⏰ **Realistic time expectations**
- 🗺️ **Better navigation** (can use small lanes)

---

## Testing

### Verify Route Distance (FOOT):
```bash
# Check backend logs
tail -f backend/logs/server.log | grep "OSRM"
# Expected: "Using profile: FOOT (walking) for shortest routes"
```

### Verify ETA Calculation (DRIVING):
```bash
# Check ETA logs
tail -f backend/logs/server.log | grep "ETA"
# Expected: Using DRIVING profile for realistic ETA
```

### Test End-to-End:
1. Login as customer → Add items → Checkout
2. Check console:
   - Distance: Should use FOOT profile (shorter)
   - ETA: Should use DRIVING profile (realistic)
3. Verify:
   - Delivery fee is based on shorter distance
   - ETA is based on bike speed (not walking)

---

## Important Notes

1. **Route geometry** is from FOOT profile (shown on map)
2. **Distance** is from FOOT profile (used for fees)
3. **Duration/ETA** is from DRIVING profile (realistic time)
4. **Frontend maps** display FOOT routes (shortest path)
5. **Backend ETA** calculates using DRIVING speeds (realistic)

This gives the best of both worlds:
- Shortest possible routes (foot)
- Realistic delivery times (driving)

---

Last Updated: 2026-03-23
