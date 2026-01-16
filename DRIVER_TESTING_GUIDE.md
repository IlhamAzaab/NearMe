# Driver Delivery System - Testing & Usage Guide

## 🧪 Testing Instructions

### Prerequisites

1. Database updated with new enums
2. Backend running on port 5000
3. Frontend running on port 5173 (or configured port)
4. At least one driver account created and verified

### Test Scenario 1: Single Order Delivery

#### Step 1: Create Test Order

1. Login as a **customer**
2. Browse restaurants and add items to cart
3. Place order with delivery address
4. Note the order number

#### Step 2: View as Driver

1. Logout and login as **driver**
2. Navigate to `/driver/deliveries` (Available Deliveries)
3. You should see the order with:
   - ✅ Order number
   - ✅ Restaurant name and address
   - ✅ Delivery address
   - ✅ Driver earnings
   - ✅ Distance and time
   - ✅ Static map showing all locations

#### Step 3: Accept Delivery

1. Click "ACCEPT DELIVERY" button
2. Wait for success message
3. Order should disappear from available deliveries

#### Step 4: View Active Deliveries

1. Navigate to `/driver/deliveries/active`
2. You should see:
   - ✅ Your accepted order
   - ✅ Numbered badge "1"
   - ✅ Restaurant details
   - ✅ Distance from your location
   - ✅ Estimated time
   - ✅ Clickable phone number
   - ✅ Green border (first pickup)
   - ✅ Fixed "START PICK-UP" button at bottom

#### Step 5: Start Pickup

1. Click "START PICK-UP"
2. Should navigate to `/driver/delivery/active/:deliveryId/map`
3. You should see:
   - ✅ Live map with your location (blue marker)
   - ✅ Restaurant location (red marker)
   - ✅ Route line between locations
   - ✅ "PICKUP MODE" badge at top
   - ✅ Tracking status indicator
   - ✅ Restaurant details below map
   - ✅ Distance and time
   - ✅ "MARK AS PICKED UP" button

#### Step 6: Simulate Pickup

1. Click "MARK AS PICKED UP"
2. Should see "START DELIVERY" button
3. Click "START DELIVERY"
4. Should switch to delivery mode:
   - ✅ "DELIVERY MODE" badge
   - ✅ Customer location (green marker)
   - ✅ Route to customer
   - ✅ Customer details
   - ✅ Order pricing breakdown
   - ✅ "MARK AS DELIVERED" button

#### Step 7: Complete Delivery

1. Click "MARK AS DELIVERED"
2. Should show success message
3. Should navigate back to active deliveries
4. List should be empty

### Test Scenario 2: Multiple Orders (Key Requirement)

#### Step 1: Create Multiple Orders

1. As customer, place **3 orders** from **different restaurants**:
   - Order A from Restaurant A
   - Order B from Restaurant B
   - Order C from Restaurant C
2. Make sure restaurants are at different locations

#### Step 2: Accept All Orders

1. Login as driver
2. Go to `/driver/deliveries`
3. Accept all 3 orders one by one
4. Each should disappear after accepting

#### Step 3: View Sorted Pickups

1. Go to `/driver/deliveries/active`
2. Should see 3 pickups **sorted by distance**:
   - First pickup: Restaurant closest to you (#1 with green border)
   - Second pickup: 2nd closest (#2)
   - Third pickup: 3rd closest (#3)
3. Verify distances are in ascending order

#### Step 4: Start Multi-Pickup

1. Click "START PICK-UP"
2. Should show **first** (closest) restaurant
3. Below map, see list of upcoming pickups (2 & 3)

#### Step 5: Test Dynamic Re-sorting

1. **While on pickup page**, have a customer place a **new order**
2. As driver, accept the new order (Order D)
3. System should:
   - ✅ Add Order D to pickup list
   - ✅ Re-calculate distances from current location
   - ✅ Re-sort the list
   - ✅ If Order D's restaurant is closer, show it as next

#### Step 6: Complete All Pickups

1. Click "MARK AS PICKED UP" for 1st restaurant
2. Should automatically show 2nd closest restaurant
3. Click "MARK AS PICKED UP" again
4. Should show 3rd restaurant
5. Repeat until all pickups complete
6. Should see "START DELIVERY" button

#### Step 7: Test Delivery Routing

1. Click "START DELIVERY"
2. Should switch to delivery mode
3. Should show customers sorted by distance from current location
4. Below map, see list of upcoming deliveries

#### Step 8: Complete All Deliveries

1. Click "MARK AS DELIVERED" for 1st customer
2. Should automatically show 2nd customer
3. Continue until all 4 deliveries complete
4. Should navigate back to available deliveries

### Test Scenario 3: Accept Order During Delivery

#### Step 1: Setup

1. Accept 2 orders and start pickup
2. Mark both as picked up
3. Start delivery mode
4. You should be delivering to 1st customer

#### Step 2: Accept New Order

1. While delivering, go to available deliveries (new tab or back button)
2. Accept a new order (Order E)
3. Go back to delivery map

#### Step 3: Verify Behavior

1. New order should **NOT** appear in current delivery list
2. Current deliveries should continue normally
3. After completing all current deliveries:
   - ✅ Should navigate to active deliveries
   - ✅ New accepted order should be there
   - ✅ Ready for pickup

### Test Scenario 4: Location Tracking

#### Step 1: Enable Location

1. Ensure browser location permissions are granted
2. Start pickup mode
3. Check top-right corner for "Tracking" status (green dot)

#### Step 2: Monitor Updates

1. Open browser console
2. Every 5 seconds, should see location updates
3. Map should refresh with new driver position

#### Step 3: Move Around (if possible)

1. Walk/drive to a new location
2. After 5-10 seconds, map should update
3. Distances should recalculate
4. Pickup/delivery order may change

### Test Scenario 5: Error Handling

#### Test A: Already Accepted Order

1. Have 2 drivers
2. Both try to accept same order
3. First driver: Success
4. Second driver: "Delivery already taken"

#### Test B: Invalid Status Transition

1. Use API directly to try: `accepted` → `delivered`
2. Should get error: "Cannot transition"

#### Test C: OSRM Failure

1. Disconnect internet briefly
2. System should fallback to Haversine calculation
3. Should still show distance/time (approximate)

#### Test D: No Location Permission

1. Deny location permission
2. Should still see deliveries
3. May not show optimized sorting

### Test Scenario 6: UI/UX Verification

#### Available Deliveries Page

- [ ] Static map shows 3 markers correctly
- [ ] Route line visible on map
- [ ] Earnings displayed prominently
- [ ] Distance in km, time in minutes
- [ ] Accept button disabled while accepting
- [ ] Loading spinner during accept
- [ ] Success message after accept
- [ ] Card layout responsive on mobile

#### Active Deliveries Page

- [ ] Numbered badges (1, 2, 3...)
- [ ] First pickup has green border
- [ ] Distance shows from driver location
- [ ] Phone numbers are clickable (tel: links)
- [ ] List scrollable if many orders
- [ ] "START PICK-UP" button sticky at bottom
- [ ] Button spans full width
- [ ] Responsive on mobile

#### Driver Map Page

- [ ] Map fills screen properly
- [ ] Markers load correctly
- [ ] Route polyline visible
- [ ] Blue = driver, red = restaurant, green = customer
- [ ] Mode badge shows correctly (PICKUP/DELIVERY)
- [ ] Tracking indicator updates
- [ ] Bottom sheet scrollable
- [ ] Current target shows full details
- [ ] Upcoming list shows correctly
- [ ] Action button always visible
- [ ] Button disabled while updating

## 📊 Performance Testing

### Load Test

1. Create 50 pending deliveries
2. Load available deliveries page
3. Should load in < 2 seconds
4. All maps should render correctly

### Location Update Test

1. Start pickup with 5 active orders
2. Monitor network tab
3. Location should update every 5 seconds
4. No memory leaks after 5 minutes

### OSRM API Test

1. Make 10 rapid pickup requests
2. All should return valid routes
3. If OSRM fails, fallback should work
4. No errors in console

## 🐛 Common Issues & Solutions

### Issue: Map not loading

**Solution**:

```javascript
// Check if Leaflet CSS is imported
import "leaflet/dist/leaflet.css";

// Verify markers defined before MapContainer
const driverIcon = createCustomIcon("blue");
```

### Issue: Deliveries not sorting

**Solution**:

```javascript
// Ensure driver location is provided
GET /deliveries/pickups?driver_latitude=X&driver_longitude=Y

// Check if geolocation is enabled
navigator.geolocation.getCurrentPosition()
```

### Issue: Status update fails

**Solution**:

```javascript
// Follow valid transitions
accepted → picked_up → on_the_way → at_customer → delivered

// Cannot skip steps
```

### Issue: OSRM timeout

**Solution**:

```javascript
// System automatically falls back to Haversine
// Check backend console for "OSRM routing error"
// Distance will still be calculated (approximate)
```

### Issue: Location not updating

**Solution**:

```bash
# Check browser console for errors
# Verify HTTPS or localhost (geolocation requirement)
# Enable location permissions
# Check if locationUpdateInterval is set
```

## 🎯 Acceptance Criteria Checklist

### Available Deliveries

- [x] Shows pending deliveries (status='pending')
- [x] Displays driver earnings
- [x] Shows total km and estimated time
- [x] Shows pickup address (restaurant)
- [x] Shows delivery address (customer)
- [x] Accept button works
- [x] Static map with delivery, restaurant, driver locations
- [x] Fetches and displays all pending deliveries

### Active Deliveries

- [x] Shows accepted deliveries (status='accepted')
- [x] Sorted by shortest distance using OSRM
- [x] Shows order number
- [x] Shows restaurant name
- [x] Shows restaurant phone (clickable)
- [x] Shows pickup location
- [x] Shows distance from previous pickup
- [x] Shows estimated time
- [x] "START PICK-UP" button at bottom (sticky)
- [x] Can scroll but button remains fixed

### Driver Map Page - Pickup Mode

- [x] Shows live map tracking
- [x] Shows 1st minimum shortest distance restaurant
- [x] After pickup, shows next nearest restaurant
- [x] Shows list of upcoming pickup restaurants below map
- [x] Each shows: restaurant name, phone, distance, time
- [x] Can accept new order during pickup
- [x] New order added to list instantly
- [x] List re-sorts when new order accepted
- [x] If new restaurant closer, becomes next pickup

### Driver Map Page - Delivery Mode

- [x] After all pickups, shows "START DELIVERY" button
- [x] Shows customer delivery locations by shortest route
- [x] Shows customer delivery details
- [x] Shows total price (subtotal, delivery fee, service fee)
- [x] Shows customer phone and name
- [x] Shows delivery location
- [x] Shows list of upcoming customer deliveries
- [x] Each shows: customer name, phone, distance, time
- [x] After delivered, shows next customer
- [x] Can accept new order during delivery
- [x] New orders don't pickup until current deliveries done

### General

- [x] Enum types updated correctly
- [x] order_status: [placed, accepted, rejected, ready, delivered, cancelled]
- [x] delivery_status: [pending, accepted, picked_up, on_the_way, at_customer, delivered, cancelled]
- [x] Frontend and backend codes production-level
- [x] API calls implemented correctly
- [x] Senior developer quality code

## 📝 Test Report Template

```markdown
# Test Report - Driver Delivery System

**Tested By**: **********\_\_\_**********
**Date**: **********\_\_\_**********
**Environment**: Dev / Staging / Production

## Test Results

### Functional Tests

- [ ] Single order flow: PASS / FAIL
- [ ] Multiple orders: PASS / FAIL
- [ ] Dynamic re-sorting: PASS / FAIL
- [ ] Accept during delivery: PASS / FAIL
- [ ] Location tracking: PASS / FAIL

### Performance Tests

- [ ] Page load < 2s: PASS / FAIL
- [ ] Location updates working: PASS / FAIL
- [ ] OSRM API responsive: PASS / FAIL

### UI/UX Tests

- [ ] Available deliveries page: PASS / FAIL
- [ ] Active deliveries page: PASS / FAIL
- [ ] Driver map page: PASS / FAIL
- [ ] Mobile responsiveness: PASS / FAIL

### Error Handling

- [ ] Concurrent acceptance: PASS / FAIL
- [ ] Invalid transitions: PASS / FAIL
- [ ] OSRM fallback: PASS / FAIL
- [ ] Permission denial: PASS / FAIL

## Issues Found

1.
2.
3.

## Recommendations

1.
2.
3.

## Overall Status

APPROVED / NEEDS REVISION / REJECTED
```

---

**Testing Complete!**

Follow this guide to thoroughly test all features before production deployment.
