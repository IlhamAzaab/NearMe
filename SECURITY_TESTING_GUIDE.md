# NearMe Security Testing Guide — Complete Step-by-Step

## Table of Contents

| #   | Section                                                             | What it Tests                    |
| --- | ------------------------------------------------------------------- | -------------------------------- |
| 0   | [Prerequisites & Setup](#step-0-prerequisites--setup)               | Start backend & frontend         |
| 1   | [Run Automated Script](#step-1-run-automated-security-tests)        | 25+ automated checks             |
| 2   | [Deploy Database Migrations](#step-2-deploy-remaining-database-sql) | RLS, views, policy cleanup       |
| 3   | [Database RLS Tests](#step-3-test-database-rls)                     | Row-Level Security               |
| 4   | [CORS Restriction](#step-4-test-cors)                               | Origin whitelisting              |
| 5   | [Rate Limiting](#step-5-test-rate-limiting)                         | Auth bruteforce prevention       |
| 6   | [Account Takeover Fix](#step-6-test-account-takeover-prevention)    | complete-profile & user-email    |
| 7   | [IDOR on Orders](#step-7-test-idor-on-orders)                       | Cross-user order access          |
| 8   | [Admin Stats Scoping](#step-8-test-admin-stats-scoping)             | Multi-restaurant isolation       |
| 9   | [Filter Injection](#step-9-test-filter-injection)                   | PostgREST filter attacks         |
| 10  | [Cron Secret](#step-10-test-cron-secret-enforcement)                | Hardcoded secret removal         |
| 11  | [JWT Expiry](#step-11-test-jwt-7-day-expiry)                        | 7d instead of 1y                 |
| 12  | [Body Size Limit](#step-12-test-body-size-limit)                    | 10MB cap                         |
| 13  | [Error Handler](#step-13-test-error-handler)                        | No internal error leaks          |
| 14  | [Log Sanitization](#step-14-test-log-sanitization)                  | No passwords/tokens in logs      |
| 15  | [Role-Based Access](#step-15-full-role-based-access-tests)          | Customer, Admin, Driver, Manager |
| 16  | [Frontend Verification](#step-16-frontend-verification)             | API_URL, realtime, notifications |

---

## Step 0: Prerequisites & Setup

### 0.1 Start Backend

```powershell
cd c:\Users\HP\NearMe\backend
node index.js
```

You should see:

```
Server running on port 5000
```

### 0.2 Start Frontend (new terminal)

```powershell
cd c:\Users\HP\NearMe\frontend
npm run dev
```

You should see:

```
  VITE v...
  ➜  Local:   http://localhost:5173/
```

### 0.3 Get Test Tokens

Login with each role to get JWT tokens for testing. Replace emails/passwords with your actual test accounts.

```powershell
# CUSTOMER token
$customerResp = Invoke-RestMethod -Uri "http://localhost:5000/auth/login" -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"email":"YOUR_CUSTOMER_EMAIL","password":"YOUR_PASSWORD"}'
$CUSTOMER_TOKEN = $customerResp.token
Write-Host "Customer: $CUSTOMER_TOKEN"

# ADMIN token (restaurant owner)
$adminResp = Invoke-RestMethod -Uri "http://localhost:5000/auth/login" -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"email":"YOUR_ADMIN_EMAIL","password":"YOUR_PASSWORD"}'
$ADMIN_TOKEN = $adminResp.token
Write-Host "Admin: $ADMIN_TOKEN"

# DRIVER token
$driverResp = Invoke-RestMethod -Uri "http://localhost:5000/auth/login" -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"email":"YOUR_DRIVER_EMAIL","password":"YOUR_PASSWORD"}'
$DRIVER_TOKEN = $driverResp.token
Write-Host "Driver: $DRIVER_TOKEN"

# MANAGER token
$managerResp = Invoke-RestMethod -Uri "http://localhost:5000/auth/login" -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"email":"YOUR_MANAGER_EMAIL","password":"YOUR_PASSWORD"}'
$MANAGER_TOKEN = $managerResp.token
Write-Host "Manager: $MANAGER_TOKEN"
```

Save these in your terminal session — you'll use them in later tests.

---

## Step 1: Run Automated Security Tests

We created an automated test script that covers 25+ security checks:

```powershell
cd c:\Users\HP\NearMe\backend
powershell -ExecutionPolicy Bypass -File test-security.ps1
```

This tests: rate limiting, complete-profile protection, user-email auth, IDOR, cron secrets, body size limit, filter injection, all protected endpoints, public endpoints.

**Expected: All tests PASS (green).**

---

## Step 2: Deploy Remaining Database SQL

Two SQL files haven't been run yet. Execute them in the **Supabase Dashboard SQL Editor**:

### 2.1 Views + spatial_ref_sys

Go to: https://supabase.com/dashboard/project/kkavlrxlkvwpmujwjzxl/sql/new

Copy-paste the content of `database/security_fix_views_and_spatial.sql` and click **Run**.

### 2.2 Policy Cleanup (80+ old policies)

Copy-paste the content of `database/security_fix_policy_cleanup.sql` and click **Run**.

### 2.3 Enable Leaked Password Protection

Go to: https://supabase.com/dashboard/project/kkavlrxlkvwpmujwjzxl/settings/auth
→ Scroll to **Leaked Password Protection** → Toggle ON → Save.

### 2.4 Verify

After running both SQLs, run this verification query:

```sql
-- Check RLS is enabled on all user tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- All should show rowsecurity = true

-- Check remaining policies (should be minimal)
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Check views are security_invoker
SELECT table_name, is_insertable_into
FROM information_schema.views
WHERE table_schema = 'public';
```

---

## Step 3: Test Database RLS

After deploying the SQL, verify the anon key can't read sensitive data.

### 3.1 Test from browser console (F12)

Open http://localhost:5173 → F12 → Console:

```javascript
// This uses the anon key from your Supabase client
const { data, error } = await window.__SUPABASE__.from("users").select("*");
console.log("Users:", data, "Error:", error);
// Expected: data = null or [], error about RLS
```

### 3.2 Test with curl (PowerShell)

```powershell
$SUPABASE_URL = "https://kkavlrxlkvwpmujwjzxl.supabase.co"
$ANON_KEY = "YOUR_ANON_KEY_HERE"  # from .env VITE_SUPABASE_ANON_KEY

# Try reading users table directly (should be blocked)
$r = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/users?select=*" `
  -Headers @{"apikey"=$ANON_KEY; "Authorization"="Bearer $ANON_KEY"}
Write-Host "Users: $r"
# Expected: empty array [] or error

# Try reading orders (should be blocked)
$r = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/orders?select=*" `
  -Headers @{"apikey"=$ANON_KEY; "Authorization"="Bearer $ANON_KEY"}
Write-Host "Orders: $r"
# Expected: empty array [] or error

# These 4 tables should be readable (realtime notifications)
$r = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/restaurants?select=id,name&limit=3" `
  -Headers @{"apikey"=$ANON_KEY; "Authorization"="Bearer $ANON_KEY"}
Write-Host "Restaurants (public): $($r | ConvertTo-Json)"
# Expected: data returned (anon SELECT policy exists)
```

---

## Step 4: Test CORS

### 4.1 Allowed Origin (should work)

```powershell
Invoke-RestMethod -Uri "http://localhost:5000/health" `
  -Headers @{"Origin"="http://localhost:5173"} -Method GET
# Expected: {"status":"ok","timestamp":"..."}
```

### 4.2 Blocked Origin (should fail)

```powershell
try {
    Invoke-WebRequest -Uri "http://localhost:5000/auth/login" -Method POST `
      -Headers @{"Origin"="http://evil.com"; "Content-Type"="application/json"} `
      -Body '{"email":"test@test.com","password":"test"}'
    Write-Host "FAIL: Should have been blocked"
} catch {
    Write-Host "PASS: Request from evil.com blocked by CORS"
}
```

> **Note:** PowerShell doesn't enforce CORS — it's a browser security mechanism. For the real test, open `http://evil.com` or any different origin in your browser, open DevTools Console, and run:
>
> ```javascript
> fetch("http://localhost:5000/auth/login", {
>   method: "POST",
>   headers: { "Content-Type": "application/json" },
>   body: '{"email":"a","password":"b"}',
> })
>   .then((r) => console.log(r))
>   .catch((e) => console.log("Blocked:", e));
> ```
>
> You should see a CORS error in the console.

---

## Step 5: Test Rate Limiting

### 5.1 Auth Rate Limit (15 requests per 15 minutes)

```powershell
# Send 16 rapid login attempts
for ($i = 1; $i -le 16; $i++) {
    $r = Invoke-WebRequest -Uri "http://localhost:5000/auth/login" -Method POST `
      -Headers @{"Content-Type"="application/json"} `
      -Body '{"email":"bruteforce@test.com","password":"wrong"}' `
      -SkipHttpErrorCheck
    Write-Host "Request $i : HTTP $($r.StatusCode)"
    if ($r.StatusCode -eq 429) {
        Write-Host "Rate limited! Auth protection working." -ForegroundColor Green
        break
    }
}
```

**Expected:** After ~15 requests, you get HTTP 429 (Too Many Requests).

### 5.2 Global Rate Limit (200 per minute)

The global limiter is 200/min — harder to test manually but the automated script checks this.

---

## Step 6: Test Account Takeover Prevention

### 6.1 complete-profile Without Token

```powershell
$r = Invoke-WebRequest -Uri "http://localhost:5000/auth/complete-profile" -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"userId":"00000000-0000-0000-0000-000000000001","username":"hacker","email":"hack@test.com","phone":"1234567890","latitude":"6.9","longitude":"79.8"}' `
  -SkipHttpErrorCheck
Write-Host "Status: $($r.StatusCode) Body: $($r.Content)"
# Expected: 401 - "Access token is required"
```

### 6.2 complete-profile With Fake Token

```powershell
$r = Invoke-WebRequest -Uri "http://localhost:5000/auth/complete-profile" -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"userId":"00000000-0000-0000-0000-000000000001","username":"hacker","email":"hack@test.com","phone":"1234567890","latitude":"6.9","longitude":"79.8","access_token":"totally-fake-token"}' `
  -SkipHttpErrorCheck
Write-Host "Status: $($r.StatusCode) Body: $($r.Content)"
# Expected: 403 - "Access denied"
```

### 6.3 user-email Without Auth

```powershell
$r = Invoke-WebRequest -Uri "http://localhost:5000/auth/user-email?userId=00000000-0000-0000-0000-000000000001" `
  -Method GET -SkipHttpErrorCheck
Write-Host "Status: $($r.StatusCode) Body: $($r.Content)"
# Expected: 401 - "Unauthorized"
```

---

## Step 7: Test IDOR on Orders

This test requires two accounts: one **driver** and one **admin/customer** with an order.

```powershell
# Using your driver token, try to view an order assigned to a DIFFERENT driver
$r = Invoke-WebRequest -Uri "http://localhost:5000/orders/SOME_OTHER_DRIVERS_ORDER_ID" `
  -Method GET -Headers @{"Authorization"="Bearer $DRIVER_TOKEN"} -SkipHttpErrorCheck
Write-Host "Status: $($r.StatusCode)"
# Expected: 403 (not your order) or 404

# Try delivery-status of another driver's order
$r = Invoke-WebRequest -Uri "http://localhost:5000/orders/SOME_OTHER_DRIVERS_ORDER_ID/delivery-status" `
  -Method GET -Headers @{"Authorization"="Bearer $DRIVER_TOKEN"} -SkipHttpErrorCheck
Write-Host "Status: $($r.StatusCode)"
# Expected: 403 or scoped data only
```

**To get a real order ID:** Login as admin, go to orders page, copy an order ID from the URL or page.

---

## Step 8: Test Admin Stats Scoping

If you have two restaurant admins, this is the key test:

```powershell
# Login as Admin of Restaurant A
$admin1 = Invoke-RestMethod -Uri "http://localhost:5000/auth/login" -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"email":"ADMIN_A_EMAIL","password":"PASSWORD"}'

# Get stats - should only see Restaurant A's data
$stats = Invoke-RestMethod -Uri "http://localhost:5000/admin/stats" `
  -Headers @{"Authorization"="Bearer $($admin1.token)"}
Write-Host ($stats | ConvertTo-Json -Depth 5)
# Verify: orderCount, revenue, customerCount relate ONLY to this restaurant
```

If you only have one restaurant, verify the stats query is scoped by checking the backend terminal logs — you should see no errors.

---

## Step 9: Test Filter Injection

```powershell
# Injection attempt on restaurant search
$r = Invoke-RestMethod -Uri "http://localhost:5000/public/restaurants?search=test,id.neq.00000000" `
  -Method GET
Write-Host "Restaurants: $($r | ConvertTo-Json)"
# Expected: returns results normally, commas stripped from search

# Injection attempt on food search
$r = Invoke-RestMethod -Uri "http://localhost:5000/public/foods?search=pizza(name)" `
  -Method GET
Write-Host "Foods: $($r | ConvertTo-Json)"
# Expected: returns results normally, parentheses stripped

# Before the fix, these could manipulate PostgREST filters
```

---

## Step 10: Test Cron Secret Enforcement

```powershell
# No secret
$r = Invoke-WebRequest "http://localhost:5000/driver/deposits/cron/daily-snapshot" `
  -Method POST -Headers @{"Content-Type"="application/json"} -Body '{}' -SkipHttpErrorCheck
Write-Host "No secret: $($r.StatusCode)"
# Expected: 401

# Wrong secret
$r = Invoke-WebRequest "http://localhost:5000/driver/deposits/cron/daily-snapshot" `
  -Method POST -Headers @{"Content-Type"="application/json"} `
  -Body '{"secret":"wrong-guess"}' -SkipHttpErrorCheck
Write-Host "Wrong secret: $($r.StatusCode)"
# Expected: 401

# Old default secret (was hardcoded before fix)
$r = Invoke-WebRequest "http://localhost:5000/driver/deposits/cron/daily-snapshot" `
  -Method POST -Headers @{"Content-Type"="application/json"} `
  -Body '{"secret":"nearme-cron-secret"}' -SkipHttpErrorCheck
Write-Host "Old default: $($r.StatusCode)"
# Expected: 401

# Correct secret
$r = Invoke-WebRequest "http://localhost:5000/driver/deposits/cron/daily-snapshot" `
  -Method POST -Headers @{"Content-Type"="application/json"} `
  -Body '{"secret":"nM-cr0n-s3cret-k3y-2026-xQ7pR9wZ"}' -SkipHttpErrorCheck
Write-Host "Correct secret: $($r.StatusCode)"
# Expected: 200 (or 500 if no data, but NOT 401)
```

---

## Step 11: Test JWT 7-Day Expiry

```powershell
# Login and decode the JWT
$resp = Invoke-RestMethod -Uri "http://localhost:5000/auth/login" -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}'

$token = $resp.token
$parts = $token.Split(".")
$payload = $parts[1]

# Fix base64 padding
$padding = 4 - ($payload.Length % 4)
if ($padding -ne 4) { $payload += "=" * $padding }

$decoded = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($payload))
$json = $decoded | ConvertFrom-Json

$iat = [DateTimeOffset]::FromUnixTimeSeconds($json.iat).DateTime
$exp = [DateTimeOffset]::FromUnixTimeSeconds($json.exp).DateTime
$diff = $exp - $iat

Write-Host "Issued: $iat"
Write-Host "Expires: $exp"
Write-Host "Duration: $($diff.TotalDays) days"
# Expected: ~7 days (not 365!)
```

---

## Step 12: Test Body Size Limit

```powershell
# Generate 12MB payload (exceeds 10MB limit)
$bigBody = '{"data":"' + ("A" * 12000000) + '"}'

$r = Invoke-WebRequest -Uri "http://localhost:5000/auth/register" -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body $bigBody -SkipHttpErrorCheck
Write-Host "12MB payload: HTTP $($r.StatusCode)"
# Expected: 413 Payload Too Large
```

---

## Step 13: Test Error Handler

```powershell
# Hit a non-existent route
$r = Invoke-WebRequest -Uri "http://localhost:5000/nonexistent/route" `
  -Method GET -SkipHttpErrorCheck
Write-Host "404: $($r.Content)"
# Expected: 404, no stack trace or internal error details

# The error handler should return generic messages, never err.message
```

---

## Step 14: Test Log Sanitization

### Watch the backend terminal output while performing these actions:

1. **Login attempt** — watch terminal: password should show `[REDACTED]`, never the actual password
2. **Register** — verify no password in logs
3. **Manager creates admin/driver** — verify temp password says `[REDACTED]`
4. **Verify email flow** — verify no verification token/link in logs

```powershell
# Trigger a login (watch your backend terminal)
Invoke-RestMethod -Uri "http://localhost:5000/auth/login" -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"email":"test@example.com","password":"MySecretPassword123!"}'
```

**Check the backend terminal**: You should see `[REDACTED]` instead of the actual password.

---

## Step 15: Full Role-Based Access Tests

### 15.1 Customer Role

```powershell
$H = @{"Authorization"="Bearer $CUSTOMER_TOKEN"; "Content-Type"="application/json"}

# Should WORK (customer endpoints):
Invoke-WebRequest "http://localhost:5000/orders/my-orders" -Headers $H -SkipHttpErrorCheck | Select StatusCode
Invoke-WebRequest "http://localhost:5000/cart" -Headers $H -SkipHttpErrorCheck | Select StatusCode
Invoke-WebRequest "http://localhost:5000/customer/notifications" -Headers $H -SkipHttpErrorCheck | Select StatusCode
# Expected: 200

# Should FAIL (admin endpoints):
Invoke-WebRequest "http://localhost:5000/admin/stats" -Headers $H -SkipHttpErrorCheck | Select StatusCode
Invoke-WebRequest "http://localhost:5000/admin/orders" -Headers $H -SkipHttpErrorCheck | Select StatusCode
# Expected: 403

# Should FAIL (manager endpoints):
Invoke-WebRequest "http://localhost:5000/manager/admins" -Headers $H -SkipHttpErrorCheck | Select StatusCode
# Expected: 403

# Should FAIL (driver endpoints):
Invoke-WebRequest "http://localhost:5000/driver/me" -Headers $H -SkipHttpErrorCheck | Select StatusCode
# Expected: 403
```

### 15.2 Admin Role (Restaurant Owner)

```powershell
$H = @{"Authorization"="Bearer $ADMIN_TOKEN"; "Content-Type"="application/json"}

# Should WORK:
Invoke-WebRequest "http://localhost:5000/admin/stats" -Headers $H -SkipHttpErrorCheck | Select StatusCode
Invoke-WebRequest "http://localhost:5000/admin/me" -Headers $H -SkipHttpErrorCheck | Select StatusCode
Invoke-WebRequest "http://localhost:5000/admin/orders" -Headers $H -SkipHttpErrorCheck | Select StatusCode
# Expected: 200

# Should FAIL:
Invoke-WebRequest "http://localhost:5000/manager/admins" -Headers $H -SkipHttpErrorCheck | Select StatusCode
Invoke-WebRequest "http://localhost:5000/driver/me" -Headers $H -SkipHttpErrorCheck | Select StatusCode
# Expected: 403
```

### 15.3 Driver Role

```powershell
$H = @{"Authorization"="Bearer $DRIVER_TOKEN"; "Content-Type"="application/json"}

# Should WORK:
Invoke-WebRequest "http://localhost:5000/driver/me" -Headers $H -SkipHttpErrorCheck | Select StatusCode
Invoke-WebRequest "http://localhost:5000/driver/earnings/summary" -Headers $H -SkipHttpErrorCheck | Select StatusCode
Invoke-WebRequest "http://localhost:5000/driver/notifications" -Headers $H -SkipHttpErrorCheck | Select StatusCode
# Expected: 200

# Should FAIL:
Invoke-WebRequest "http://localhost:5000/admin/stats" -Headers $H -SkipHttpErrorCheck | Select StatusCode
Invoke-WebRequest "http://localhost:5000/manager/admins" -Headers $H -SkipHttpErrorCheck | Select StatusCode
Invoke-WebRequest "http://localhost:5000/orders/my-orders" -Headers $H -SkipHttpErrorCheck | Select StatusCode
# Expected: 403
```

### 15.4 Manager Role

```powershell
$H = @{"Authorization"="Bearer $MANAGER_TOKEN"; "Content-Type"="application/json"}

# Should WORK:
Invoke-WebRequest "http://localhost:5000/manager/admins" -Headers $H -SkipHttpErrorCheck | Select StatusCode
Invoke-WebRequest "http://localhost:5000/manager/drivers" -Headers $H -SkipHttpErrorCheck | Select StatusCode
Invoke-WebRequest "http://localhost:5000/manager/reports/sales" -Headers $H -SkipHttpErrorCheck | Select StatusCode
# Expected: 200

# Should FAIL:
Invoke-WebRequest "http://localhost:5000/admin/stats" -Headers $H -SkipHttpErrorCheck | Select StatusCode
Invoke-WebRequest "http://localhost:5000/driver/me" -Headers $H -SkipHttpErrorCheck | Select StatusCode
Invoke-WebRequest "http://localhost:5000/orders/my-orders" -Headers $H -SkipHttpErrorCheck | Select StatusCode
# Expected: 403
```

---

## Step 16: Frontend Verification

### 16.1 API_URL Works

Open http://localhost:5173 in your browser. Open DevTools → Network tab.

1. Browse restaurants/foods — verify requests go to `http://localhost:5000` (not hardcoded)
2. Login — verify the login request URL uses the correct API

### 16.2 Realtime Notifications

1. Login as **Admin** — open restaurant dashboard
2. In another browser/incognito, login as **Customer** — place an order
3. Verify the admin sees a real-time notification pop up (no page refresh needed)

### 16.3 Driver Notifications

1. Login as **Driver** in one browser
2. As admin, assign a delivery to that driver
3. Verify the driver receives a real-time notification

### 16.4 Console Clean

Open DevTools → Console on every page. Navigate through the app.

- **No `console.log` debug messages** should appear (we removed them all)
- No `undefined` errors from `supabase` variable

---

## Quick Checklist Summary

| #   | Test                                       | Expected           | Status |
| --- | ------------------------------------------ | ------------------ | ------ |
| 1   | Automated script                           | All PASS           | ☐      |
| 2   | SQL migrations deployed                    | No errors          | ☐      |
| 3   | RLS blocks anon read on users/orders       | Empty/error        | ☐      |
| 4   | CORS blocks evil.com                       | Browser CORS error | ☐      |
| 5   | Rate limit after 15 auth reqs              | HTTP 429           | ☐      |
| 6   | complete-profile needs access_token        | HTTP 401/403       | ☐      |
| 7   | user-email needs auth                      | HTTP 401           | ☐      |
| 8   | Driver can't see other driver's order      | HTTP 403           | ☐      |
| 9   | Admin stats scoped to restaurant           | Own data only      | ☐      |
| 10  | Search injection sanitized                 | Normal results     | ☐      |
| 11  | Cron rejects wrong/no secret               | HTTP 401           | ☐      |
| 12  | JWT expires in 7 days                      | ~7d, not 365d      | ☐      |
| 13  | 12MB body rejected                         | HTTP 413           | ☐      |
| 14  | Error handler hides details                | Generic message    | ☐      |
| 15  | Logs show [REDACTED]                       | No passwords       | ☐      |
| 16  | Customer can't access admin/driver/manager | HTTP 403           | ☐      |
| 17  | Admin can't access manager/driver          | HTTP 403           | ☐      |
| 18  | Driver can't access admin/manager/customer | HTTP 403           | ☐      |
| 19  | Manager can't access admin/driver/customer | HTTP 403           | ☐      |
| 20  | Public endpoints work unauthenticated      | HTTP 200           | ☐      |
| 21  | Frontend notifications real-time           | Popup appears      | ☐      |
| 22  | No console.log debug in browser            | Clean console      | ☐      |
| 23  | Leaked Password Protection enabled         | Dashboard ON       | ☐      |

---

## Troubleshooting

| Problem                           | Solution                                                                |
| --------------------------------- | ----------------------------------------------------------------------- |
| Rate limit test won't trigger     | Wait 15 minutes for the window to reset, or restart the backend         |
| 401 on all requests               | Your token may have expired (7d now). Login again                       |
| SQL migration errors              | Run them one section at a time; some policies may already be dropped    |
| CORS test passes in PowerShell    | CORS is browser-enforced. Test from actual browser DevTools             |
| Backend won't start               | Check `.env` has all required variables (CRON_SECRET, JWT_SECRET, etc.) |
| Frontend shows "undefined" errors | Check `import { API_URL } from "../config"` path is correct             |
