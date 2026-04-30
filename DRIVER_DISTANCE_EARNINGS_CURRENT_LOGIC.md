# Driver Distance and Earnings - Current Logic (As-Is)

This file documents the current driver distance and earnings logic as implemented today. It covers all scenarios (no active deliveries, active deliveries, rejections) and shows where each value is calculated and consumed. This is a reference before changing the earnings model to pay only restaurant-to-customer distance.

Sources:
- backend: NearMe/backend/utils/availableDeliveriesLogic.js
- backend: NearMe/backend/routes/driverDelivery.js
- backend: NearMe/backend/routes/driver.js
- mobile: nearme-mobile/src/screens/driver/DashboardScreen.jsx
- mobile: nearme-mobile/src/screens/driver/DriverEarningsScreen.jsx

-------------------------------------------------------------------------------
## 1) Where the logic lives (high level)

1) Available deliveries (preview + route impact):
   - Calculates route impact (R0/R1), extra distance/time, and earnings preview.
   - File: NearMe/backend/utils/availableDeliveriesLogic.js

2) Accept delivery (authoritative, persisted):
   - Server re-calculates earnings and stores them on the delivery.
   - Client-sent earnings_data is logged but ignored for payouts.
   - File: NearMe/backend/routes/driverDelivery.js

3) Earnings history/summary/chart (reporting):
   - Uses stored driver_earnings or a fallback sum of components.
   - File: NearMe/backend/routes/driverDelivery.js

4) Mobile display and acceptance:
   - Available deliveries list uses route_impact fields from backend.
   - Accept API sends earnings_data but server ignores it.
   - DriverEarningsScreen sums extra_distance_km for period distance.
   - Files: nearme-mobile/src/screens/driver/DashboardScreen.jsx and DriverEarningsScreen.jsx

-------------------------------------------------------------------------------
## 2) Config values and defaults (system_config overrides)

Defaults in availableDeliveriesLogic.js:
- Thresholds:
  - MAX_EXTRA_TIME_MINUTES = 10
  - MAX_EXTRA_DISTANCE_KM = 3
  - MAX_ACTIVE_DELIVERIES = 5
- Earnings:
  - RATE_PER_KM = 40 (extra distance for subsequent deliveries)
  - RTC_RATE_BELOW_5KM = 40
  - RTC_RATE_ABOVE_5KM = 40
  - MAX_DRIVER_TO_RESTAURANT_KM = 1
  - MAX_DRIVER_TO_RESTAURANT_AMOUNT = 30 (per km for DTR leg)
  - MAX_RESTAURANT_PROXIMITY_KM = 1 (new restaurant must be within this)
  - DELIVERY_BONUS:
    - SECOND_DELIVERY = 20
    - ADDITIONAL_DELIVERY = 30

Note: All of these can be overridden by system_config values at runtime.

-------------------------------------------------------------------------------
## 3) Core distance definitions (R0 / R1)

R0: Current route distance with existing deliveries only.
R1: Combined route distance with the new delivery included.
Extra distance: max(0, R1 - R0).

Important: For multi-delivery routes, distances are computed segment-by-segment
with OSRM for each segment, not as a single combined OSRM request.

-------------------------------------------------------------------------------
## 4) Available deliveries (preview calculation)

File: NearMe/backend/utils/availableDeliveriesLogic.js

When the driver is online, the backend evaluates each candidate delivery as a
route extension and returns route_impact + pricing fields.

### 4.1 First delivery (no active deliveries)

Distance calculation (earnings fairness):
- OSRM call #1: Driver -> Restaurant (DTR)
- OSRM call #2: Restaurant -> Customer (RTC)
- Total earnings distance = DTR + RTC (NOT a combined route)

Earnings calculation:
- Paid DTR km = min(driver_to_restaurant_km, MAX_DRIVER_TO_RESTAURANT_KM)
- DTR earnings = paid DTR km * MAX_DRIVER_TO_RESTAURANT_AMOUNT
- RTC earnings = restaurant_to_customer_km * RTC_RATE (below/above 5km)
- base_amount = DTR earnings + RTC earnings
- extra_earnings = 0
- bonus_amount = 0
- total_trip_earnings = base_amount

Returned fields (route_impact):
- is_first_delivery = true
- driver_to_restaurant_km
- paid_driver_to_restaurant_km
- restaurant_to_customer_km
- driver_to_restaurant_earnings
- restaurant_to_customer_earnings
- r0_distance_km, r1_distance_km, extra_distance_km
- total_trip_earnings

### 4.2 Subsequent delivery (1+ active deliveries)

Eligibility checks:
- Max active deliveries: must be below MAX_ACTIVE_DELIVERIES.
- Restaurant proximity: new restaurant must be within
  MAX_RESTAURANT_PROXIMITY_KM of any existing restaurant (Haversine).
- Extra distance/time must not exceed MAX_EXTRA_DISTANCE_KM or
  MAX_EXTRA_TIME_MINUTES.

Distance calculation:
- R0: segment-by-segment route with existing deliveries.
- R1: segment-by-segment route with existing + new delivery.
- extra_distance_km = max(0, (R1 - R0) / 1000)

Earnings calculation (preview):
- base_amount:
  - Uses cumulative earnings of previous deliveries if present, else
    r0_distance_km * RATE_PER_KM.
- extra_earnings = extra_distance_km * RATE_PER_KM
- bonus_amount:
  - second delivery -> SECOND_DELIVERY bonus
  - third+ delivery -> ADDITIONAL_DELIVERY bonus
- total_trip_earnings = base + extra + bonus

Returned fields (route_impact):
- is_first_delivery = false
- r0_distance_km, r1_distance_km, extra_distance_km
- extra_time_minutes
- base_amount, extra_earnings, bonus_amount, total_trip_earnings
- total_combined_distance_km
- estimated_time_minutes

-------------------------------------------------------------------------------
## 5) Accept delivery (authoritative server calculation)

File: NearMe/backend/routes/driverDelivery.js

When the driver taps Accept, the app sends earnings_data, but the backend
explicitly ignores it for persistence and recalculates everything server-side.

### 5.1 Delivery sequence
- delivery_sequence = (count of active deliveries) + 1
- is_first_delivery = delivery_sequence === 1

### 5.2 First delivery (authoritative)

Distance calculation:
- Driver -> Restaurant OSRM
- Restaurant -> Customer OSRM

Earnings:
- paid DTR km = min(driver_to_restaurant_km, MAX_DRIVER_TO_RESTAURANT_KM)
- DTR earnings = paid DTR km * MAX_DRIVER_TO_RESTAURANT_AMOUNT
- RTC rate per km: RTC_RATE_BELOW_5KM or RTC_RATE_ABOVE_5KM
- RTC earnings = restaurant_to_customer_km * rtc_rate
- base_amount = DTR earnings + RTC earnings
- extra_earnings = 0
- bonus_amount = 0

Persisted driver_earnings (first delivery):
- driver_earnings = base_amount + tip_amount

### 5.3 Subsequent delivery (authoritative)

Distance calculation:
- R0: current route
- R1: route + new delivery
- extra_distance_km = max(0, (R1 - R0) / 1000)

Earnings:
- extra_earnings = extra_distance_km * RATE_PER_KM
- bonus_amount:
  - second delivery -> SECOND_DELIVERY
  - third+ delivery -> ADDITIONAL_DELIVERY
- base_amount = 0 for 2nd+

Persisted driver_earnings (2nd+):
- driver_earnings = extra_earnings + bonus_amount + tip_amount

### 5.4 Fallbacks when server calc fails

If server calc fails:
- First delivery fallback: estimate from order distance_km.
- Subsequent delivery fallback: at least bonus is stored.
- If server result is zero but frontend data was positive,
  the frontend values can be used to avoid zero earnings.

-------------------------------------------------------------------------------
## 6) Earnings reporting (history/summary/chart)

File: NearMe/backend/routes/driverDelivery.js

- History returns base/extra/bonus/tip + driver_earnings + distances.
- Summary and chart compute driver_earnings as:
  - if driver_earnings stored > 0, use it
  - else use base + extra + bonus + tip

Distance reporting:
- total_distance_km is used when available.
- summary falls back to extra_distance_km if total_distance_km is missing.

Mobile display note:
- DriverEarningsScreen (nearme-mobile) sums extra_distance_km for
  periodDistanceKm, so it currently represents "extra distance" rather than
  full route distance.

-------------------------------------------------------------------------------
## 7) End-to-end data flow (mobile)

1) Driver dashboard loads available deliveries:
   - Uses /driver/deliveries/available/v2 (server calculation)
   - route_impact and pricing returned from backend

2) Accept flow:
   - Mobile sends earnings_data in request body (from route_impact)
   - Server ignores it and recalculates earnings

3) Earnings screens:
   - DriverEarningsScreen uses /driver/earnings/summary, /history, /chart

-------------------------------------------------------------------------------
## 8) Scenarios with examples

All examples below use defaults:
- RATE_PER_KM = 40
- RTC_RATE_BELOW_5KM = 40
- RTC_RATE_ABOVE_5KM = 40
- MAX_DRIVER_TO_RESTAURANT_KM = 1
- MAX_DRIVER_TO_RESTAURANT_AMOUNT = 30
- SECOND_DELIVERY = 20
- ADDITIONAL_DELIVERY = 30

### Scenario A: No active deliveries (first delivery)

Input:
- Driver -> Restaurant = 0.8 km
- Restaurant -> Customer = 4.2 km
- Tip = Rs 50

Calculation:
- paid DTR km = min(0.8, 1.0) = 0.8
- DTR earnings = 0.8 * 30 = Rs 24
- RTC earnings = 4.2 * 40 = Rs 168
- base_amount = 24 + 168 = Rs 192
- extra_earnings = 0
- bonus_amount = 0
- total_trip_earnings = Rs 192
- driver_earnings (stored) = base_amount + tip = 192 + 50 = Rs 242
- total_distance_km (display) = 0.8 + 4.2 = 5.0 km

### Scenario B: 1 active delivery (second delivery)

Input (segment-by-segment):
- R0 distance = 6.0 km
- R1 distance = 7.5 km
- extra_distance_km = 1.5 km
- Tip = Rs 0

Calculation:
- extra_earnings = 1.5 * 40 = Rs 60
- bonus_amount = 20 (second delivery)
- base_amount (stored) = 0
- driver_earnings (stored) = 60 + 20 + 0 = Rs 80
- total_distance_km = R1 = 7.5 km

### Scenario C: 2 active deliveries (third delivery)

Input:
- R0 distance = 9.2 km
- R1 distance = 10.0 km
- extra_distance_km = 0.8 km
- Tip = Rs 25

Calculation:
- extra_earnings = 0.8 * 40 = Rs 32
- bonus_amount = 30 (third+ delivery)
- driver_earnings (stored) = 32 + 30 + 25 = Rs 87

### Scenario D: Rejected because of max extra distance

Input:
- extra_distance_km = 3.4 km
- MAX_EXTRA_DISTANCE_KM = 3

Result:
- Delivery is rejected, driver never sees it in available deliveries.

### Scenario E: Rejected because restaurant too far

Input:
- Closest existing restaurant is 1.4 km away
- MAX_RESTAURANT_PROXIMITY_KM = 1

Result:
- Delivery is rejected with reason: new restaurant too far.

-------------------------------------------------------------------------------
## 9) Important field list (what the app receives)

Available deliveries (preview response) includes:
- pricing:
  - base_amount, extra_earnings, bonus_amount, total_trip_earnings
- route_impact:
  - r0_distance_km, r1_distance_km, extra_distance_km
  - extra_time_minutes
  - base_amount, extra_earnings, bonus_amount, total_trip_earnings
  - is_first_delivery
  - driver_to_restaurant_km, paid_driver_to_restaurant_km
  - restaurant_to_customer_km
  - driver_to_restaurant_earnings, restaurant_to_customer_earnings

Persisted delivery record (server authoritative):
- base_amount, extra_earnings, bonus_amount, tip_amount
- driver_earnings
- total_distance_km, extra_distance_km, r0_distance_km, r1_distance_km

-------------------------------------------------------------------------------
## 10) Key takeaways before you change the model

- First delivery pays DTR + RTC. Subsequent deliveries pay only extra distance
  + bonus (no base).
- availableDeliveriesLogic returns a preview; accept endpoint recalculates.
- driver_earnings is the final authoritative number (includes tip).
- DriverEarningsScreen sums extra_distance_km for the distance KPI.

If you plan to pay only Restaurant -> Customer distance going forward, you will
need to adjust:
- first-delivery earnings (remove DTR portion)
- fields stored in deliveries (driver_earnings, base_amount, etc.)
- any logic that uses extra_distance_km as a distance KPI
- any UI text that refers to total distance or extra distance
