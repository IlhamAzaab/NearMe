# Commission System Implementation Guide

## Overview

The commission system charges customers a 10% commission on food prices, which goes to the manager (system). This document explains the commission calculation logic and how it's implemented across the application.

## Commission Calculation Rules

| Price Range      | Commission                     | Example                     |
| ---------------- | ------------------------------ | --------------------------- |
| ≤ Rs. 50         | Rs. 5 (flat)                   | Rs. 30 → Rs. 35             |
| Rs. 51 - Rs. 100 | Rs. 10 (flat)                  | Rs. 70 → Rs. 80             |
| > Rs. 100        | 10% (rounded up to nearest 10) | Rs. 370 → Rs. 410 (37 → 40) |

## Price Examples

### Regular Size Examples:

- **Paratha**: Admin price Rs. 30 → Customer sees Rs. 35 (Rs. 5 commission)
- **Rice**: Admin price Rs. 70 → Customer sees Rs. 80 (Rs. 10 commission)
- **Biryani**: Admin price Rs. 370 → Customer sees Rs. 410 (Rs. 40 commission)
- **Special Meal**: Admin price Rs. 1000 → Customer sees Rs. 1100 (Rs. 100 commission)

### With Offer Price:

- Admin sets: Regular Rs. 600, Offer Rs. 500
- Customer sees: ~~Rs. 660~~ Rs. 550 (offer price with commission)
- Manager earns: Rs. 50 commission from this item

## Database Changes

Run the migration script: `database/commission_system_migration.sql`

### New Columns Added:

**cart_items table:**

- `admin_unit_price` - Original price set by restaurant
- `admin_total_price` - Total admin price (admin_unit_price × quantity)
- `commission_per_item` - Commission charged per item

**order_items table:**

- `admin_unit_price` - Original price set by restaurant
- `admin_total_price` - Total admin price (admin_unit_price × quantity)
- `commission_per_item` - Commission per item

**orders table:**

- `admin_subtotal` - Total amount to pay to restaurant
- `commission_total` - Total commission earned by manager

### Views Created:

- `manager_earnings_summary` - Daily earnings summary
- `restaurant_payments` - Amount to pay each restaurant
- `order_financial_details` - Per-order financial breakdown

## API Endpoints

### Public Routes (Customer)

Foods returned to customers include commission in prices:

- `GET /public/foods` - All foods with customer prices
- `GET /public/restaurants/:id/foods` - Restaurant foods with customer prices
- `GET /public/restaurants/:id/foods/:foodId` - Single food with customer prices

### Cart Routes

- Cart items store both admin and customer prices
- Cart totals include `admin_total` and `commission_total`

### Order Routes

- Orders store `admin_subtotal` and `commission_total`
- Order items store admin prices for payout calculation

### Manager Earnings Routes

```
GET /manager/earnings/summary?period=daily|weekly|monthly&from=DATE&to=DATE
GET /manager/earnings/orders?from=DATE&to=DATE&restaurant_id=UUID&status=STATUS
GET /manager/restaurant-payouts?from=DATE&to=DATE
```

## Financial Flow

### When Customer Orders:

1. Customer pays: **Total Amount** = Subtotal (with commission) + Delivery Fee + Service Fee
2. Subtotal includes 10% commission on each food item
3. Order stores both customer price and admin (restaurant) price

### After Delivery:

1. **Manager earns**:
   - Food commission (10% of food prices)
   - Service fee (goes to system)
2. **Restaurant receives**:
   - Original food prices (admin_subtotal)
3. **Driver earns**:
   - Delivery fee portion (as per existing driver payment rules)

## Example Order Breakdown

**Customer orders:**

- Biryani (Rs. 370 admin price) × 2 = Rs. 820 with commission (Rs. 410 × 2)
- Rice (Rs. 70 admin price) × 1 = Rs. 80 with commission

**Order totals:**
| Item | Amount |
|------|--------|
| Customer Subtotal | Rs. 900 |
| Admin Subtotal | Rs. 810 |
| Commission Total | Rs. 90 |
| Service Fee | Rs. 31 |
| Delivery Fee | Rs. 80 |
| **Customer Total** | **Rs. 1,011** |

**Payout breakdown:**

- Restaurant receives: Rs. 810
- Manager earns: Rs. 90 (commission) + Rs. 31 (service fee) = Rs. 121
- Driver earns: From delivery fee as per existing rules

## Testing

### Test Commission Calculation:

```javascript
// In backend/utils/commission.js
import {
  calculateCommission,
  calculateCustomerPrice,
  getFoodPricing,
} from "./utils/commission.js";

// Test cases
console.log(calculateCommission(30)); // Should be 5
console.log(calculateCommission(70)); // Should be 10
console.log(calculateCommission(370)); // Should be 40
console.log(calculateCommission(1000)); // Should be 100

console.log(calculateCustomerPrice(30)); // Should be 35
console.log(calculateCustomerPrice(70)); // Should be 80
console.log(calculateCustomerPrice(370)); // Should be 410
console.log(calculateCustomerPrice(1000)); // Should be 1100
```

### Verify in Frontend:

1. Browse foods - prices should include commission
2. Add to cart - cart total should reflect commission prices
3. Checkout - subtotal includes commission
4. Manager dashboard - view earnings breakdown

## Files Modified

### Backend:

- `backend/utils/commission.js` - Commission calculation utilities (NEW)
- `backend/routes/public.js` - Add commission to food prices
- `backend/routes/cart.js` - Store admin and customer prices
- `backend/routes/orders.js` - Calculate and store commission totals
- `backend/routes/manager.js` - Earnings endpoints

### Database:

- `database/commission_system_migration.sql` - Schema changes (NEW)

### Frontend:

- `frontend/src/pages/FoodDetail.jsx` - Display extra_offer_price
- `frontend/src/pages/Checkout.jsx` - Track commission totals

## Notes

1. **Commission rounds up** for prices > Rs. 100 (e.g., 37 → 40, not 37)
2. **Offer prices** also have commission applied
3. **All prices shown to customers** already include commission
4. **Restaurant admin** sees original prices they set
5. **Manager dashboard** shows full earnings breakdown
