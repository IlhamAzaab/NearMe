# Admin Payment System - Implementation Complete

## Overview

Successfully implemented a complete admin payment system that allows managers to process payments to restaurant admins, mirroring the driver payment functionality.

## 🎯 Features Implemented

### Backend

1. **Database Schema** (`database/admin_payments_system.sql`)
   - `admin_payments` table to track all payments to restaurant admins
   - Payment proof storage (image/PDF URLs from Cloudinary)
   - Row Level Security (RLS) policies for managers and admins
   - `admin_payment_summary` view for quick analytics

2. **API Routes** (`backend/routes/adminPayments.js`)
   - `GET /manager/admin-payments/summary` - Overall payment summary
   - `GET /manager/admin-payments/restaurants` - List all restaurants with balances
   - `GET /manager/admin-payments/restaurant/:restaurantId` - Individual restaurant details
   - `GET /manager/admin-payments/restaurant/:restaurantId/history` - Payment history
   - `POST /manager/admin-payments/pay/:restaurantId` - Process payment with proof upload

### Frontend

1. **Admin Payments List** (`frontend/src/pages/manager/restaurants/AdminPayments.jsx`)
   - Summary cards showing:
     - Total amount to pay (sum of all `amount_to_pay` from `restaurant_payments`)
     - Amount paid today
     - Balance to pay (Total - Paid Today)
   - Restaurant list with withdrawal balances sorted by highest owed
   - Search functionality

2. **Process Admin Payment** (`frontend/src/pages/manager/restaurants/ProcessAdminPayment.jsx`)
   - Restaurant profile display
   - Current balance to pay
   - Amount input with "Max" button
   - File upload (PDF/Image) for payment proof
   - Optional note field
   - Payment history viewer
   - Real-time balance updates

3. **Navigation Integration**
   - Added Admin Payments link in Manager Sidebar (Restaurant section)
   - Routes configured in App.jsx
   - Sidebar visibility logic updated

## 📊 How It Works

### Payment Flow

1. Manager navigates to **Admin Payments** from sidebar
2. System displays:
   - **Total to Pay**: Sum of all restaurants' `amount_to_pay` from `restaurant_payments` view
   - **Paid Today**: Sum of payments made today
   - **Balance**: Remaining amount to pay
3. Manager clicks on a restaurant to process payment
4. Manager:
   - Enters amount (up to available balance)
   - Uploads payment receipt (image/PDF)
   - Optionally adds a note
5. System:
   - Uploads receipt to Cloudinary
   - Records payment in `admin_payments` table
   - Calculates new balance (Total Earnings - Total Paid)
   - Updates display immediately

### Balance Calculation

```
Total Earnings = SUM(amount_to_pay) from restaurant_payments view
Total Paid = SUM(amount) from admin_payments table
Withdrawal Balance = Total Earnings - Total Paid
```

## 🚀 Setup Instructions

### Step 1: Run Database Migration

Execute the SQL file to create the admin payments system:

**IMPORTANT**: This SQL file is now updated to work with your actual restaurant schema:

- Uses `restaurant_name` (not `name`)
- Uses `restaurant_status = 'active'` (not `approved = true`)
- Joins with `admins` table (not `users`) for admin emails

```sql
-- Connect to your Supabase database
psql -h [your-supabase-host] -U postgres -d postgres

-- Run the migration
\i database/admin_payments_system.sql
```

Or via Supabase Dashboard:

1. Go to SQL Editor
2. Copy contents of `database/admin_payments_system.sql`
3. Execute

### Step 2: Verify Database Setup

Check that the following were created:

```sql
-- Check table exists
SELECT * FROM admin_payments LIMIT 1;

-- Check view exists
SELECT * FROM admin_payment_summary LIMIT 5;

-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'admin_payments';
```

### Step 3: Backend Setup

The routes are already integrated into `backend/index.js`:

```javascript
import adminPaymentsRoutes from "./routes/adminPayments.js";
app.use("/manager/admin-payments", adminPaymentsRoutes);
```

No additional setup needed!

### Step 4: Frontend Setup

Routes are already configured in `frontend/src/App.jsx`:

```javascript
import AdminPayments from "./pages/manager/restaurants/AdminPayments";
import ProcessAdminPayment from "./pages/manager/restaurants/ProcessAdminPayment";

// Routes auto-configured
<Route path="/manager/admin-payments" element={<AdminPayments />} />
<Route path="/manager/admin-payments/:restaurantId" element={<ProcessAdminPayment />} />
```

## 🧪 Testing Guide

### 1. Test Data Setup

Ensure you have:

- Approved restaurants with admin accounts
- Delivered orders to generate `restaurant_payments` entries

### 2. Access Admin Payments

1. Login as manager
2. Click **Admin** button in top navbar
3. Click **Admin Payments** in sidebar
4. Should see summary cards and restaurant list

### 3. Test Payment Processing

1. Click on a restaurant with non-zero balance
2. Enter amount (try clicking "Max" button)
3. Upload a test image or PDF
4. Add optional note
5. Click "Process Payment"
6. Verify:
   - Success message appears
   - Balance updates immediately
   - Payment appears in history

### 4. Verify Backend

Check database after payment:

```sql
-- View payment records
SELECT * FROM admin_payments ORDER BY created_at DESC LIMIT 5;

-- Check restaurant balance
SELECT * FROM admin_payment_summary
WHERE restaurant_id = 'your-restaurant-id';
```

### 5. Test Summary Calculations

```sql
-- Total to pay (should match frontend)
SELECT SUM(amount_to_pay) as total_to_pay
FROM restaurant_payments;

-- Paid today (should match frontend)
SELECT SUM(amount) as paid_today
FROM admin_payments
WHERE created_at >= CURRENT_DATE + INTERVAL '5 hours 30 minutes';
```

## 📁 File Structure

```
backend/
├── routes/
│   └── adminPayments.js          # Admin payment API routes
└── index.js                       # Routes integrated

database/
└── admin_payments_system.sql      # Database schema & migration

frontend/src/
├── pages/manager/restaurants/
│   ├── AdminPayments.jsx          # List page with summary
│   └── ProcessAdminPayment.jsx    # Individual payment processor
├── components/
│   ├── ManagerSidebar.jsx         # Updated with Admin Payments link
│   └── ManagerLayout.jsx          # Updated sidebar visibility
└── App.jsx                        # Routes configured
```

## 🔒 Security Features

1. **Authentication**: Manager-only access via middleware
2. **RLS Policies**:
   - Managers can view/insert all payments
   - Admins can view their own restaurant's payments
3. **Validation**:
   - Amount validation (positive, within balance)
   - File type validation (JPEG, PNG, WebP, PDF)
   - File size limit (5MB)
4. **Proof Upload**: Secure upload to Cloudinary with folder organization

## 🎨 UI Features

- **Responsive Design**: Works on desktop and mobile
- **Real-time Updates**: Balance recalculates immediately after payment
- **Animated Alerts**: Success/error notifications using AnimatedAlert component
- **Search**: Filter restaurants by name, email, or phone
- **Sort**: Restaurants sorted by highest balance owed
- **History Viewer**: Collapsible payment history with proof links
- **File Preview**: Image preview before upload

## 🔗 Navigation Paths

**Manager Paths:**

- **Admin Payments List**: `/manager/admin-payments`
- **Process Payment**: `/manager/admin-payments/:restaurantId`
- **Access**: Manager Dashboard → Admin (navbar) → Admin Payments (sidebar)

**Admin Paths:**

- **Admin Withdrawals**: `/admin/withdrawals`
- **Access**: Admin Dashboard → Withdrawals (sidebar)

## 🎯 Admin Withdrawal Feature

### Overview

Admins can view their payment history and withdrawal status, similar to the driver withdrawal page.

### Backend Implementation

**Added to** `backend/routes/adminPayments.js`:

1. **GET /admin/withdrawals/admin/summary**
   - Returns financial summary for logged-in admin's restaurant
   - Response:
     ```json
     {
       "total_earnings": 5000.0,
       "total_withdrawals": 2000.0,
       "remaining_balance": 3000.0,
       "today_withdrawals": 500.0,
       "payment_count": 5
     }
     ```

2. **GET /admin/withdrawals/admin/history**
   - Returns all payments received by admin's restaurant
   - Response:
     ```json
     {
       "payments": [
         {
           "id": "uuid",
           "amount": 500.0,
           "proof_url": "https://cloudinary.com/...",
           "proof_type": "image",
           "note": "Weekly payment",
           "created_at": "2024-01-15T10:30:00Z"
         }
       ]
     }
     ```

### Frontend Implementation

**File**: `frontend/src/pages/admin/AdminWithdrawals.jsx`

**Features**:

- Dark theme UI (#111816 background) matching driver withdrawal design
- Balance hero card showing remaining balance
- Stats grid displaying:
  - **Total Earned**: Sum from restaurant_payments
  - **Total Received**: Sum of admin_payments
  - **Today's Withdrawals**: Payments received today
- Progress bar showing payment completion percentage
- Payment history list with:
  - Amount and date/time
  - Click to view details modal
  - Receipt viewer (image preview or PDF link)
  - Transaction ID display
  - Note display

**UI Components**:

1. **Balance Hero Card**: Gradient card with remaining balance to receive
2. **Stats Grid**: 3 cards showing earning/withdrawal metrics
3. **Progress Bar**: Visual representation of (total_withdrawals / total_earnings)
4. **Payment History**: Scrollable list of all received payments
5. **Detail Modal**: Bottom sheet showing:
   - Amount received
   - Date and time
   - Transaction ID
   - Note (if provided)
   - Payment proof (image preview or PDF link)

### Calculations

```javascript
// Total earnings from commission system
total_earnings = SUM(restaurant_payments.amount_to_pay)

// Total withdrawals from admin payments
total_withdrawals = SUM(admin_payments.amount)

// Remaining balance (what's still owed)
remaining_balance = total_earnings - total_withdrawals

// Today's withdrawals
today_withdrawals = SUM(admin_payments.amount WHERE DATE=TODAY)
```

### Navigation Integration

- Added "Withdrawals" link in AdminSidebar.jsx (after Earnings)
- Route configured in App.jsx with AdminDashboardRoute protection
- Icon: Credit card SVG

## ✅ Completion Checklist

**Manager Features:**

- [x] Database table created (`admin_payments`)
- [x] Database view created (`admin_payment_summary`)
- [x] RLS policies configured
- [x] Backend routes implemented
- [x] Routes integrated in index.js
- [x] Frontend list page created
- [x] Frontend payment processor created
- [x] Routes configured in App.jsx
- [x] Sidebar link added
- [x] Layout logic updated
- [x] File upload with Cloudinary
- [x] Payment validation
- [x] Balance calculations
- [x] Payment history display
- [x] Animated alerts integration

**Admin Features:**

- [x] Backend withdrawal endpoints (summary & history)
- [x] Routes registered in index.js
- [x] Frontend AdminWithdrawals page created
- [x] Dark theme UI matching driver withdrawals
- [x] Balance hero card implemented
- [x] Stats grid with earnings/withdrawals
- [x] Progress bar visualization
- [x] Payment history list
- [x] Payment detail modal
- [x] Receipt viewer (image/PDF)
- [x] Route configured in App.jsx
- [x] Sidebar link added
- [x] AdminDashboardRoute protection

## 🚨 Important Notes

1. **Run SQL Migration First**: Before testing, execute `admin_payments_system.sql`
2. **Cloudinary Required**: Ensure Cloudinary credentials in `.env`
3. **Restaurant Payments View**: Depends on existing `restaurant_payments` view from commission system
4. **Same Logic as Driver Payments**: Uses identical patterns for consistency
5. **Sri Lanka Timezone**: All date calculations use UTC+5:30

## 💡 Usage Example

**Manager Scenario**: Restaurant has earned Rs.10,000 from delivered orders

1. Manager views Admin Payments page
2. Sees "Total to Pay: Rs.10,000"
3. Clicks on restaurant
4. Enters Rs.5,000
5. Uploads bank transfer receipt
6. Submits payment
7. New balance: Rs.5,000
8. Next payment: Rs.5,000 remains

**Admin Scenario**: Admin checks withdrawal status

1. Admin logs in and navigates to Withdrawals
2. Sees balance hero card: "Rs.5,000 to receive"
3. Checks stats:
   - Total Earned: Rs.10,000
   - Total Received: Rs.5,000
   - Today's Withdrawals: Rs.5,000
4. Progress bar shows 50% payment completion
5. Views payment history
6. Clicks on Rs.5,000 payment
7. Modal opens showing:
   - Amount received: Rs.5,000
   - Date and time
   - Transaction ID
   - Bank transfer receipt (with image preview)
8. Clicks image to view full size
9. Verifies payment in their bank account

## 🎉 Success!

The admin payment system is now fully functional with both manager and admin perspectives. It provides:

- **Managers**: Complete control over restaurant admin payments with full transparency and audit trails
- **Admins**: Full visibility into their earnings, withdrawals, and payment history with receipt verification

Both sides use consistent UI patterns and calculations, ensuring a seamless experience across the platform.
