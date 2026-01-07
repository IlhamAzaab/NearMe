# Shopping Cart Implementation Guide

## Overview

Complete shopping cart system with the following features:

- Multiple active carts per customer (one per restaurant)
- Dynamic pricing (always fetches latest food prices)
- Size and quantity selection
- Beautiful UI/UX

## 📋 What Was Implemented

### 1. Database Schema

**File:** `database/cart_schema.sql`

#### Tables Created:

- **carts**: Stores customer carts (one active cart per restaurant)
- **cart_items**: Stores food items in each cart

#### Key Features:

- Unique constraint: Only ONE active cart per (customer_id, restaurant_id)
- Automatic price updates (always fetches current food prices)
- Cascade deletions (removing cart removes all items)
- Row Level Security (RLS) policies for customer access
- Helper view `cart_summary` for quick totals

### 2. Backend API Routes

**File:** `backend/routes/cart.js`

#### Endpoints:

- **POST /cart/add** - Add item to cart (creates cart if needed)
- **GET /cart** - Get all active carts with current prices
- **PUT /cart/item/:itemId** - Update cart item quantity
- **DELETE /cart/item/:itemId** - Remove item from cart
- **DELETE /cart/:cartId** - Remove entire cart

### 3. Frontend Pages

#### RestaurantFoods Page

**File:** `frontend/src/pages/RestaurantFoods.jsx`

**Features:**

- "Add to Cart" button on each food item
- Beautiful modal for size and quantity selection
- Real-time price calculation
- Success/error notifications
- Disabled button for unavailable items

#### Cart Page

**File:** `frontend/src/pages/Cart.jsx`

**Features:**

- Displays all active carts grouped by restaurant
- Real-time quantity updates
- Item removal functionality
- Clear entire cart option
- Dynamic price display (always current)
- Beautiful responsive design
- Empty cart state
- "Add More Items" button
- "Proceed to Checkout" button (placeholder)

#### SiteHeader Component

**File:** `frontend/src/components/SiteHeader.jsx`

**Features:**

- Cart icon with badge showing total items
- Auto-refresh cart count every 30 seconds
- Cart link in user menu
- Only visible for customer role

### 4. Routing

**File:** `frontend/src/App.jsx`

Added protected cart route:

```jsx
<Route
  path="/cart"
  element={
    <ProtectedRoute allowedRole="customer">
      <Cart />
    </ProtectedRoute>
  }
/>
```

## 🚀 Setup Instructions

### 1. Run Database Migration

In Supabase SQL Editor, run:

```sql
-- Run the cart schema
\i database/cart_schema.sql
```

### 2. Backend is Already Configured

The cart routes are automatically loaded in `backend/index.js`

### 3. Frontend is Ready

All components and routes are configured.

## 🎯 How It Works

### Customer Workflow:

1. **Browse Restaurants**

   - Customer visits home page
   - Clicks on a restaurant to view foods

2. **Add to Cart**

   - Customer clicks "Add to Cart" on any food
   - Modal appears for size and quantity selection
   - Customer confirms and item is added
   - Success message appears

3. **View Cart**

   - Click cart icon in header (shows item count badge)
   - OR click "Cart" in user menu
   - See all active carts grouped by restaurant

4. **Manage Cart**

   - Increase/decrease quantity (updates price)
   - Remove individual items
   - Clear entire cart
   - Add more items from same restaurant

5. **Checkout** (placeholder for now)
   - Click "Proceed to Checkout"
   - Will implement order creation later

### Business Logic:

#### One Cart Per Restaurant

```
Customer C1 adds 4 foods from Mansoora:
  → Creates cart #1 for Mansoora

Customer C1 adds 2 foods from Thavakkal:
  → Creates cart #2 for Thavakkal (separate cart)

Customer C1 adds 1 more food from Mansoora:
  → Uses existing cart #1 (same restaurant)
```

#### Dynamic Pricing

```
Food price when added to cart: Rs. 1000
Price changes to Rs. 1150 in foods table
When viewing cart: Shows Rs. 1150 (current price)
Total is calculated with current prices
```

#### Size Handling

- If food has both regular and large sizes: Customer chooses
- If food only has regular size: Defaults to regular
- Price adjusts based on size selection

## 📁 Files Modified/Created

### Created:

- `database/cart_schema.sql`
- `backend/routes/cart.js`
- `frontend/src/pages/Cart.jsx`

### Modified:

- `backend/index.js` - Added cart routes
- `frontend/src/App.jsx` - Added cart route
- `frontend/src/pages/RestaurantFoods.jsx` - Added cart functionality
- `frontend/src/components/SiteHeader.jsx` - Added cart icon

## 🎨 UI/UX Features

### RestaurantFoods Page:

- Beautiful modal with size selection (radio buttons)
- Quantity stepper (+/- buttons)
- Real-time total price display
- Smooth animations
- Responsive design

### Cart Page:

- Restaurant header with gradient background
- Item cards with food images
- Inline quantity controls
- Price display for each item
- Cart total with item count
- Action buttons (Add More, Checkout, Clear)
- Empty state with call-to-action

### Header:

- Cart icon with red badge showing count
- Animated badge (>99 shows "99+")
- Auto-refresh every 30 seconds
- Quick access from user menu

## 🔒 Security

- All cart routes require authentication
- Only customers can access cart endpoints
- RLS policies ensure customers only see their own carts
- JWT validation on every request
- Customer ID from token (not from request body)

## 🎉 Testing

### Test Scenarios:

1. **Add to Cart**

   - Login as customer
   - Browse a restaurant
   - Add foods with different sizes
   - Verify modal appears correctly
   - Check cart icon badge updates

2. **Multiple Carts**

   - Add items from Restaurant A
   - Add items from Restaurant B
   - View cart - should show 2 separate carts

3. **Same Restaurant**

   - Add 2 items from Restaurant A
   - Add 1 more item from Restaurant A
   - Should add to existing cart (not create new)

4. **Price Updates**

   - Add item to cart
   - Admin changes food price
   - Refresh cart page
   - Should show new price

5. **Quantity Management**

   - Increase/decrease quantity
   - Verify price updates correctly
   - Try to set quantity to 0 or negative (should not work)

6. **Item Removal**
   - Remove single item
   - Remove last item from cart (cart should be deleted)
   - Clear entire cart

## 🔮 Next Steps (Future Implementation)

1. **Checkout System**

   - Create orders table
   - Convert cart to order
   - Payment integration

2. **Order Tracking**

   - Order status updates
   - Driver assignment
   - Real-time tracking

3. **Notifications**

   - Email confirmation
   - SMS updates
   - Push notifications

4. **Features**
   - Favorites/Wishlist
   - Order history
   - Reorder previous orders
   - Promo codes/Coupons

## 🐛 Troubleshooting

### Cart not showing items:

- Check if customer is logged in
- Verify JWT token is valid
- Check browser console for errors
- Verify database schema is created

### Price not updating:

- Check if food prices changed in database
- Refresh cart page (F5)
- Verify foods table has correct prices

### Can't add to cart:

- Ensure customer role is set correctly
- Check if food is available (is_available = true)
- Verify backend server is running
- Check network tab for API errors

## 📝 Notes

- Prices are ALWAYS fetched from the foods table (dynamic)
- Cart stores snapshot of food name and image (in case food is deleted)
- But price calculation uses current food prices
- Empty carts are automatically deleted when last item is removed
- Cart badge auto-updates every 30 seconds (no page refresh needed)
