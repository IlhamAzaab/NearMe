# 🐛 BUG FIX: Customer Not Receiving Order Acceptance Notifications

## Problem Description

When admin/restaurant accepts an order, the delivery status changes from `placed` to `pending`, but customers were NOT receiving socket notifications.

## Root Cause Analysis

### The Bug (Line 1478 in orders.js)

```javascript
// ❌ WRONG - Used targetDeliveryStatus ("pending")
if (notificationTypes[targetDeliveryStatus]) {
  notifyCustomer(...);
}
```

### What Was Happening:

1. **Admin sends:** `status = "accepted"` (user-friendly status)
2. **Backend converts:** `targetDeliveryStatus = "pending"` (internal delivery status)
3. **Notification maps defined:**
   ```javascript
   notificationTypes = {
     accepted: "order_accepted",  // ✅ Has "accepted"
     failed: "order_rejected",
     preparing: "order_preparing",
     ready: "order_ready",
     cancelled: "order_cancelled"
     // ❌ NO "pending" key!
   }
   ```
4. **Condition check:** `notificationTypes["pending"]` = `undefined` ❌
5. **Result:** Condition fails, notification NEVER sent!

### Why This Happened:

There's a **status name mismatch** between:
- **User-facing status names:** "accepted", "rejected", "preparing"
- **Database delivery status:** "pending", "failed", "accepted", "picked_up"

The code incorrectly used the database status for notification lookup instead of the user-facing status.

## The Fix

### Changed Code (Line 1478-1507)

```javascript
// ✅ FIXED - Use original 'status' parameter ("accepted")
if (notificationTypes[status]) {
  notifyCustomer(order.customer_id, "order:status_update", {
    type: notificationTypes[status],       // Now uses "accepted"
    title: notificationTitles[status],     // Now uses "accepted"
    message: notificationMessages[status], // Now uses "accepted"
    order_id: orderId,
    order_number: order.order_number,
    status: targetDeliveryStatus,          // Still sends "pending" for info
    originalStatus: status,                // Added for clarity
  });
}
```

### Key Changes:

1. ✅ Use `status` (original request parameter) for notification lookup
2. ✅ Keep `targetDeliveryStatus` for database status tracking
3. ✅ Include both statuses in payload for transparency
4. ✅ Updated console log for better debugging

## Testing Guide

### Test 1: Quick Verification

**Before Fix:**
```bash
# Admin accepts order
# Console shows: (no WebSocket notification)
✅ Delivery abc123 status updated: placed → pending
# Customer sees: (nothing)
```

**After Fix:**
```bash
# Admin accepts order
# Console shows:
✅ Delivery abc123 status updated: placed → pending
📡 WebSocket: Customer cust456 notified of accepted (delivery status: pending)
# Customer sees: "Order Accepted! 🎉"
```

### Test 2: End-to-End Customer Notification Test

#### Setup:
1. **Browser 1:** Login as Customer
2. **Browser 2:** Login as Admin/Restaurant
3. **Both:** Open DevTools Console (F12)

#### Steps:

1. **Customer:** Place an order
   - Note the order number

2. **Customer Browser Console:** Watch for socket events
   ```javascript
   // Should see connection:
   [CustomerSocket] Registered listeners for order:status_update
   ```

3. **Admin:** View pending orders
   - Find the customer's order
   - Click "Accept Order"

4. **Customer Browser Console:** Watch for notification
   ```javascript
   // ✅ EXPECTED (After Fix):
   [CustomerSocket] Received order:status_update: {
     type: "order_accepted",
     title: "Order Accepted",
     message: "Your order has been accepted by the restaurant...",
     order_id: "...",
     order_number: "...",
     status: "pending",
     originalStatus: "accepted"
   }
   ```

5. **Customer UI:** Should see notification banner
   - Title: "Order Accepted"
   - Message: "Your order has been accepted by the restaurant and is being prepared."

### Test 3: Backend Logs Verification

```bash
# Terminal: Monitor backend logs
cd c:/Users/HP/NearMe
npm run dev

# Watch logs when admin accepts order:
tail -f logs/server.log | grep -E "status updated|WebSocket: Customer"
```

**Expected Output:**
```
✅ Delivery abc123 status updated: placed → pending
📡 WebSocket: Customer cust456 notified of accepted (delivery status: pending)
```

### Test 4: Mobile App Test (Optional)

1. **Mobile:** Login as customer, place order
2. **Desktop:** Login as admin, accept order
3. **Mobile:** Should receive push notification
   - Title: "Order Accepted"
   - Body: "Your order has been accepted..."

## Status Name Mapping Reference

### User-Facing Status (status parameter)
- `"accepted"` - Admin/restaurant accepted order
- `"rejected"` - Admin/restaurant rejected order
- `"preparing"` - Food is being prepared
- `"ready"` - Food ready for pickup
- `"cancelled"` - Order cancelled

### Database Delivery Status (targetDeliveryStatus)
- `"placed"` - Order just placed
- `"pending"` - Accepted by restaurant, waiting for driver
- `"accepted"` - Driver accepted delivery
- `"picked_up"` - Driver picked up from restaurant
- `"on_the_way"` - Driver delivering to customer
- `"delivered"` - Completed
- `"failed"` - Rejected by restaurant
- `"cancelled"` - Cancelled

### Notification Mapping Flow

```
Admin Action    →  status param    →  Delivery DB Status  →  Customer Notification
─────────────────────────────────────────────────────────────────────────────────
Accept Order    →  "accepted"      →  "pending"           →  "Order Accepted"
Reject Order    →  "rejected"      →  "failed"            →  "Order Rejected"
Mark Preparing  →  "preparing"     →  "pending"           →  "Order Being Prepared"
Mark Ready      →  "ready"         →  "pending"           →  "Order Ready"
```

## Common Issues & Debugging

### Issue 1: Still Not Receiving Notifications

**Check:**
```bash
# Verify customer socket is connected
# Browser Console:
[SocketContext] ✅ Connected to socket server
[CustomerSocket] Registered listeners for order:status_update

# If NOT connected, check:
# 1. SocketContext properly initialized with userId and authToken
# 2. Backend socket server is running
# 3. No CORS errors in network tab
```

### Issue 2: Notification Received But Wrong Message

**Check:**
```javascript
// Verify notificationMessages map in orders.js
const notificationMessages = {
  accepted: `Your order has been accepted by the restaurant and is being prepared.`,
  failed: `Your order ${order.order_number} was rejected. ${reason || ""}`,
  // ... etc
};
```

### Issue 3: Push Notification Not Received

**Check:**
```bash
# Backend logs:
tail -f logs/server.log | grep "Push"

# Expected:
📱 Push notification sent to customer cust456

# If missing, check:
# 1. Customer has valid push token in push_tokens table
# 2. sendOrderStatusNotification is not throwing errors
```

## Files Modified

1. `backend/routes/orders.js` (Line 1478-1507)
   - Fixed notification lookup to use original `status` parameter
   - Added `originalStatus` to payload for debugging
   - Updated console logs

## Related Documentation

- `ROUTING_STRATEGY.md` - Routing implementation details
- `test-routing-strategy.md` - Routing testing guide
- Requirement 2 from main implementation - Customer realtime notifications

---

**Status:** ✅ FIXED  
**Date:** 2026-03-23  
**Impact:** Critical - Customers now receive real-time order acceptance notifications

---
