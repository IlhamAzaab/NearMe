# Testing Guide: Two-Step Routing Strategy

## Quick Test: Verify FOOT for Distance, DRIVING for ETA

### Test 1: Check Backend Configuration

```bash
# Verify osrmService uses FOOT profile
cd c:/Users/HP/NearMe
grep "const profilesToTry" backend/utils/osrmService.js
# Expected output: const profilesToTry = ["foot"];

# Verify etaCalculator uses DRIVING profile
grep "const profiles" backend/utils/etaCalculator.js
# Expected output: const profiles = ["driving"];
```

**Status:** ✅ PASSED (if both outputs match)

---

### Test 2: Live Testing - Available Deliveries

#### Steps:
1. Start backend server:
```bash
cd c:/Users/HP/NearMe
npm run dev
```

2. Login as **Driver** (web browser)

3. Navigate to **Available Deliveries** page

4. Open **Browser Console** (F12 → Console)

5. Check logs for OSRM calls

#### Expected Console Logs:

**For Route Display (Distance):**
```
[OSRM] 🗺️ Getting route for 2 waypoints (Driver → Restaurant)
[OSRM] → Using profile: FOOT (walking) for shortest routes
[OSRM] ✅ FOOT route: 2.156 km (3 alternatives)
[OSRM] ✓ Distance: 2.156 km
```

**For ETA Calculation:**
```
[ETA] Calculating driver ETA...
[ETA] Using DRIVING profile for realistic bike speed
[ETA] Driver→Restaurant: 2.156 km, ETA: 5 mins (bike speed)
```

**Status:** ✅ PASSED (if FOOT for distance, DRIVING for ETA)

---

### Test 3: Customer Checkout - Distance vs ETA

#### Steps:
1. Login as **Customer**
2. Add items to cart
3. Go to **Checkout** page
4. Check console logs

#### Expected Behavior:

**Distance Calculation (FOOT):**
```
[Checkout] Calculating delivery distance...
[OSRM] → Using profile: FOOT (walking) for shortest routes
Distance: 2.1 km
Delivery Fee: Rs. 84 (2.1 × 40)
```

**ETA Calculation (DRIVING):**
```
[ETA] Calculating delivery ETA...
[ETA] Using DRIVING profile
ETA: 6-16 minutes (bike speed)
```

**UI Display:**
```
╔════════════════════════════════╗
║ Delivery Details               ║
║                                ║
║ Distance: 2.1 km              ║
║ Delivery Fee: Rs. 84          ║
║ Estimated Time: 6-16 min      ║
╚════════════════════════════════╝
```

**Status:** ✅ PASSED (if distance is shorter, ETA is realistic)

---

### Test 4: Backend Logs Verification

#### Monitor Real-Time Logs:

```bash
# Terminal 1: Watch OSRM route calls (distance)
cd c:/Users/HP/NearMe
tail -f backend/logs/server.log | grep "OSRM.*profile"

# Terminal 2: Watch ETA calls (time)
tail -f backend/logs/server.log | grep "ETA.*profile"
```

#### Expected Output:

**Terminal 1 (OSRM Routes):**
```
[OSRM] → Using profile: FOOT (walking) for shortest routes
[OSRM] ✅ FOOT route: 2.156 km
[OSRM] → Using profile: FOOT (walking) for shortest routes
[OSRM] ✅ FOOT route: 1.843 km
```

**Terminal 2 (ETA Calculations):**
```
[ETA] Using DRIVING profile for realistic bike speed
[ETA] Driver→Restaurant: 5 mins
[ETA] Restaurant→Customer: 4 mins
[ETA] Total ETA: 9 mins
```

**Status:** ✅ PASSED (if FOOT for routes, DRIVING for ETA)

---

### Test 5: Compare Before vs After

#### Scenario: Same route tested twice

**Before Fix (All FOOT):**
```
Route: Restaurant A → Customer B
Distance: 2.1 km (via small lanes) ✅
ETA: 25 minutes ❌ (unrealistic walking time)
```

**After Fix (FOOT distance, DRIVING ETA):**
```
Route: Restaurant A → Customer B
Distance: 2.1 km (via small lanes) ✅
ETA: 6 minutes ✅ (realistic bike time)
```

**Expected Improvement:**
- Distance: Same (2.1 km - correct)
- ETA: 76% faster (25 → 6 mins - realistic for bike)

---

## Summary Checklist

Before deploying, verify ALL of these:

- [ ] `osrmService.js` uses `["foot"]` profile
- [ ] `etaCalculator.js` uses `["driving"]` profile
- [ ] Available Deliveries shows short distances (foot routes)
- [ ] Available Deliveries shows realistic ETA (bike speed)
- [ ] Checkout shows short distances (foot routes)
- [ ] Checkout shows realistic ETA (bike speed)
- [ ] Driver Map displays foot routes (small lanes visible)
- [ ] Customer ETA updates use driving speed
- [ ] Backend logs show "FOOT" for OSRM route calls
- [ ] Backend logs show "DRIVING" for ETA calculations

---

## If Tests Fail

### Problem: Still seeing walking ETA (too slow)

**Check:**
```bash
grep "const profiles" backend/utils/etaCalculator.js
```

**Should be:**
```javascript
const profiles = ["driving"]; // DRIVING for realistic bike/motorcycle ETA
```

**Fix if wrong:**
```bash
# Restart server after fix
npm run dev
```

---

### Problem: Routes using main roads (not short)

**Check:**
```bash
grep "const profilesToTry" backend/utils/osrmService.js
```

**Should be:**
```javascript
const profilesToTry = ["foot"]; // ALWAYS foot - shortest distance
```

**Fix if wrong:**
```bash
# Restart server after fix
npm run dev
```

---

## Performance Expectations

### Distance Calculation (FOOT):
- Typical response time: 200-500ms
- Shorter distances than driving routes
- Uses small lanes, alleys, shortcuts

### ETA Calculation (DRIVING):
- Typical response time: 100-300ms
- Realistic bike/motorcycle speeds
- Accounts for road types and traffic patterns

### Combined Benefits:
- 20-30% shorter distances
- 70-80% faster ETA (vs walking)
- Lower costs + realistic times

---

Last Updated: 2026-03-23
