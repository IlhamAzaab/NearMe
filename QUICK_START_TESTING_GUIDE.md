# 🚀 Driver Tracking System - Quick Start Guide

## Prerequisites Checklist

### Backend

- [x] Node.js 18+ installed
- [x] Express.js configured
- [x] Supabase project created
- [x] Authentication middleware working
- [x] Environment variables set (.env)

### Frontend

- [x] React 19 installed
- [x] Leaflet installed (`leaflet`, `react-leaflet`)
- [x] React Router DOM installed
- [x] Vite configured
- [x] Tailwind CSS configured

### Database

- [ ] **ACTION REQUIRED**: Run database migration
- [ ] **ACTION REQUIRED**: Verify deliveries table exists
- [ ] **ACTION REQUIRED**: Check orders table has coordinate columns

---

## 🎯 Installation Steps (DO THIS NOW)

### Step 1: Run Database Migration

**Option A - Supabase Dashboard**:

1. Open Supabase Dashboard
2. Go to "SQL Editor"
3. Copy contents of `database/delivery_tracking_schema.sql`
4. Paste and click "Run"

**Option B - Command Line**:

```bash
psql -h your-supabase-host -U postgres -d postgres -f database/delivery_tracking_schema.sql
```

**Verify Migration**:

```sql
-- Run this query in Supabase SQL Editor
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'deliveries'
  AND column_name IN (
    'accepted_at',
    'heading_to_restaurant_at',
    'current_latitude',
    'current_longitude'
  );
```

Expected output: Should show all 4 columns.

---

### Step 2: Start Backend

```bash
cd backend
npm start
```

Expected output:

```
Server running on port 3000
```

**Test Backend**:

```bash
# Test if server is running
curl http://localhost:3000/health

# Test driver endpoints (replace TOKEN)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/driver/deliveries/active
```

---

### Step 3: Start Frontend

```bash
cd frontend
npm install  # If not done already
npm run dev
```

Expected output:

```
VITE ready in XXX ms
Local: http://localhost:5173
```

**Verify Frontend**:

1. Open http://localhost:5173 in browser
2. Should see login page
3. No console errors

---

### Step 4: Create Test Data (Optional)

If you don't have deliveries to test with:

```sql
-- 1. Create or use existing order with coordinates
UPDATE orders
SET
  restaurant_latitude = 40.7580,
  restaurant_longitude = -73.9855,
  delivery_latitude = 40.7489,
  delivery_longitude = -73.9680,
  restaurant_name = 'Test Restaurant',
  restaurant_address = '123 Restaurant St, New York',
  delivery_address = '456 Customer Ave, New York',
  customer_name = 'Test Customer',
  customer_phone = '+1234567890'
WHERE id = 'YOUR_ORDER_ID';

-- 2. Create delivery for the order
INSERT INTO deliveries (
  id,
  order_id,
  driver_id,
  status,
  assigned_at,
  accepted_at,
  current_latitude,
  current_longitude
) VALUES (
  gen_random_uuid(),
  'YOUR_ORDER_ID',
  'YOUR_DRIVER_ID',
  'accepted',
  NOW(),
  NOW(),
  40.7128,  -- Starting position
  -74.0060
);
```

---

## 🧪 Testing the System

### Test 1: View Active Deliveries

1. **Login as driver**

   - Go to http://localhost:5173/login
   - Enter driver credentials
   - Should redirect to driver dashboard

2. **Navigate to Active Deliveries**
   - Click "Active Deliveries" in sidebar
   - OR go to http://localhost:5173/driver/deliveries/active
   - Should see list of active deliveries

**Expected Result**:

- ✅ Page loads without errors
- ✅ Shows delivery cards with restaurant and customer info
- ✅ "Find Route" button visible on each card

**Troubleshooting**:

- If empty, check database for deliveries with your driver_id
- If error, check browser console and backend logs
- Verify token is valid and user role is "driver"

---

### Test 2: Open Map View

1. **Click "Find Route & Start Delivery" button**

   - Should navigate to `/driver/delivery/active/:deliveryId/map`

2. **Verify Map Loads**
   - Map should appear with tiles
   - Three markers should be visible:
     - Blue (driver)
     - Orange (restaurant)
     - Green (customer)

**Expected Result**:

- ✅ Map renders immediately (no infinite loading)
- ✅ All 3 markers visible
- ✅ Green route from driver to restaurant
- ✅ Grey dashed route from driver to customer
- ✅ "Live Tracking" indicator shows green dot
- ✅ Bottom panel shows distance and ETA

**Troubleshooting**:

- If map not loading: Check Leaflet CSS import
- If no routes: Check browser console for OSRM errors
- If no markers: Verify coordinates in database
- If blank screen: Check browser console for JavaScript errors

---

### Test 3: Live Location Tracking

**Browser will ask for location permission - ALLOW IT**

1. **Allow location access**

   - Browser popup: Click "Allow"

2. **Verify tracking started**

   - Green pulsing dot in top-right corner
   - "Live Tracking" text visible

3. **Check location updates**
   - Open browser DevTools → Network tab
   - Should see PATCH requests to `/location` every 5 seconds
   - Check backend logs for location updates

**Expected Result**:

- ✅ Location permission granted
- ✅ Blue marker moves to your actual location
- ✅ Routes recalculate from new position
- ✅ Backend receives location updates

**Troubleshooting**:

- If permission denied: Re-enable in browser settings
- If not updating: Check browser console for errors
- If 403 error: Verify JWT token is valid
- If routes disappear: OSRM might be temporarily down (this is OK)

---

### Test 4: Status Updates

1. **Click "Start Pickup" button**

   - Status should change to "heading_to_restaurant"
   - Alert: "Status updated successfully!"
   - Button changes to "Arrived at Restaurant"

2. **Continue clicking status buttons**:
   - "Arrived at Restaurant" → status: `arrived_restaurant`
   - "Mark as Picked Up" → status: `picked_up`
   - Notice: Green route now goes from driver to customer!
   - "Start Delivery" → status: `heading_to_customer`
   - "Arrived at Customer" → status: `arrived_customer`
   - "Mark as Delivered" → status: `delivered`

**Expected Result**:

- ✅ Each button click updates status
- ✅ Success alert appears
- ✅ Button text changes to next action
- ✅ After "Picked Up", green route switches to customer
- ✅ Timestamps recorded in database

**Verify Notifications Sent**:

```sql
SELECT * FROM notifications
WHERE metadata::jsonb->>'order_id' = 'YOUR_ORDER_ID'
ORDER BY created_at DESC;
```

**Troubleshooting**:

- If "Cannot transition" error: Check current status in database
- If button stuck: Check network tab for API response
- If no route switch: Refresh page after "Picked Up"

---

### Test 5: Database Verification

Check that all data was recorded:

```sql
-- Check delivery status and timestamps
SELECT
  id,
  status,
  accepted_at,
  heading_to_restaurant_at,
  arrived_restaurant_at,
  picked_up_at,
  heading_to_customer_at,
  arrived_customer_at,
  delivered_at,
  current_latitude,
  current_longitude
FROM deliveries
WHERE id = 'YOUR_DELIVERY_ID';
```

**Expected Result**:

- ✅ All status timestamps filled in
- ✅ current_latitude and current_longitude updated
- ✅ status = 'delivered'

---

## 🐛 Common Issues & Solutions

### Issue 1: Map Not Loading

**Symptoms**: White screen or "Loading..." forever

**Solutions**:

1. Check Leaflet CSS import:
   ```jsx
   import "leaflet/dist/leaflet.css";
   ```
2. Verify coordinates are valid numbers (not null or strings)
3. Check browser console for errors
4. Try hard refresh (Ctrl + Shift + R)

---

### Issue 2: Routes Not Showing

**Symptoms**: Markers visible but no lines

**Solutions**:

1. Check OSRM API is accessible:
   ```bash
   curl "https://router.project-osrm.org/route/v1/driving/-74.0060,40.7128;-73.9855,40.7580?overview=full&geometries=geojson"
   ```
2. Verify coordinates exist in database
3. Check backend logs for OSRM errors
4. Routes may be hidden if OSRM is temporarily down (code handles this)

---

### Issue 3: Location Not Updating

**Symptoms**: Blue marker doesn't move

**Solutions**:

1. Check location permission in browser:
   - Chrome: Settings → Privacy → Site Settings → Location
   - Must be "Allow" for your site
2. HTTPS required in production (use localhost for dev)
3. Check browser console for geolocation errors
4. Try clicking "Start Live Tracking" button manually

---

### Issue 4: Status Update Fails

**Symptoms**: "Cannot transition from X to Y" error

**Solution**: Check current status in database and follow correct flow:

```
accepted → heading_to_restaurant → arrived_restaurant →
picked_up → heading_to_customer → arrived_customer → delivered
```

If status is wrong, reset it:

```sql
UPDATE deliveries
SET status = 'accepted'
WHERE id = 'YOUR_DELIVERY_ID';
```

---

### Issue 5: 401 Unauthorized

**Symptoms**: API returns 401 or "Unauthorized"

**Solutions**:

1. Check token exists:
   ```javascript
   console.log(localStorage.getItem("token"));
   ```
2. Token might be expired - login again
3. Verify user role is "driver"
4. Check backend middleware is processing JWT correctly

---

## 📊 Verify Everything Works

### Backend Endpoints Checklist

- [ ] GET `/api/driver/deliveries/active` returns deliveries
- [ ] GET `/api/driver/deliveries/:id/map` returns map data with routes
- [ ] PATCH `/api/driver/deliveries/:id/location` accepts coordinates
- [ ] PATCH `/api/driver/deliveries/:id/status` updates status

### Frontend Pages Checklist

- [ ] `/driver/deliveries/active` shows delivery list
- [ ] `/driver/delivery/active/:id/map` shows map with markers
- [ ] Map markers appear (blue, orange, green)
- [ ] Routes appear (green solid, grey dashed)
- [ ] Live tracking indicator shows green dot
- [ ] Status button changes on click
- [ ] Location updates every 5 seconds

### Database Checklist

- [ ] `deliveries` table has new columns
- [ ] Status enum includes new values
- [ ] Timestamps get recorded on status change
- [ ] Location coordinates update every 5 seconds
- [ ] Notifications created on status change

---

## 🎓 Understanding the Flow

### User Journey:

```
1. Driver logs in
   ↓
2. Navigates to Active Deliveries page
   ↓
3. Clicks "Find Route" button
   ↓
4. Map page opens
   ↓
5. Location tracking starts automatically
   ↓
6. Driver sees route to restaurant (green)
   ↓
7. Clicks "Start Pickup"
   ↓
8. Drives to restaurant following green line
   ↓
9. Clicks "Arrived at Restaurant"
   ↓
10. Clicks "Mark as Picked Up"
    ↓
11. Green route switches to customer location
    ↓
12. Clicks "Start Delivery"
    ↓
13. Drives to customer following green line
    ↓
14. Clicks "Arrived at Customer"
    ↓
15. Delivers order
    ↓
16. Clicks "Mark as Delivered"
    ↓
17. Delivery complete! 🎉
```

### Technical Flow:

```
Frontend                Backend                 Database
--------                -------                 --------
Location request   →    PATCH /location    →    UPDATE deliveries
(every 5 sec)      ←    { success }        ←    SET current_lat/lng

Status button      →    PATCH /status      →    UPDATE deliveries
click              ←    { success }        ←    SET status, timestamps
                        ↓
                   Send notifications  →    INSERT notifications
                        ↓
                   Update order        →    UPDATE orders
```

---

## 🚀 You're Ready!

If all tests pass, your driver live map tracking system is fully operational!

### Next Steps:

1. ✅ Test with real driving (use mobile device)
2. ✅ Verify notifications reach customers
3. ✅ Check performance with multiple deliveries
4. ✅ Deploy to production (remember HTTPS requirement)

### Production Deployment:

- [ ] Set `VITE_API_URL` to production API URL
- [ ] Build frontend: `npm run build`
- [ ] Serve over HTTPS (required for geolocation)
- [ ] Run database migration on production database
- [ ] Test on actual mobile devices
- [ ] Monitor backend logs for errors

---

## 📞 Need Help?

1. Check `DRIVER_MAP_TRACKING_GUIDE.md` for detailed documentation
2. Review `DRIVER_TRACKING_IMPLEMENTATION_SUMMARY.md` for complete feature list
3. Check browser console (F12) for frontend errors
4. Check backend terminal for server errors
5. Verify database with SQL queries

---

**System Status**: ✅ Fully Implemented and Ready for Testing

**Last Updated**: January 13, 2026
