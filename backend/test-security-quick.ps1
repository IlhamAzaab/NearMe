# NearMe Quick Security Test
# Run: powershell test-security-quick.ps1

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  NearMe Security Testing" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Backend Running
Write-Host "[1/5] Backend..." -ForegroundColor Yellow
try {
    Invoke-RestMethod -Uri "http://localhost:5000/health" | Out-Null
    Write-Host "  [PASS] Backend running" -ForegroundColor Green
} catch {
    Write-Host "  [FAIL] Backend NOT running" -ForegroundColor Red
    exit 1
}

# Test 2: Customer Login
Write-Host "[2/5] Customer login..." -ForegroundColor Yellow
try {
    $resp = Invoke-RestMethod -Uri "http://localhost:5000/auth/login" -Method POST -Headers @{"Content-Type"="application/json"} -Body '{"email":"muhammadui.23@cse.mrt.ac.lk","password":"12341234"}'
    $TOKEN = $resp.token
    Write-Host "  [PASS] Login successful" -ForegroundColor Green
} catch {
    Write-Host "  [FAIL] Login failed" -ForegroundColor Red
    exit 1
}

# Test 3: Customer Can Access Own Orders
Write-Host "[3/5] Customer accessing own orders..." -ForegroundColor Yellow
try {
    $orders = Invoke-RestMethod -Uri "http://localhost:5000/orders/my-orders" -Headers @{"Authorization"="Bearer $TOKEN"}
    Write-Host "  [PASS] Got $($orders.orders.Count) orders" -ForegroundColor Green
} catch {
    Write-Host "  [FAIL] Blocked from own orders" -ForegroundColor Red
}

# Test 4: Customer Blocked from Admin
Write-Host "[4/5] Customer blocked from admin..." -ForegroundColor Yellow
try {
    Invoke-RestMethod -Uri "http://localhost:5000/admin/stats" -Headers @{"Authorization"="Bearer $TOKEN"} | Out-Null
    Write-Host "  [FAIL] Customer accessed admin endpoint!" -ForegroundColor Red
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq 403) {
        Write-Host "  [PASS] Blocked with 403" -ForegroundColor Green
    } else {
        Write-Host "  [INFO] Status: $status" -ForegroundColor Yellow
    }
}

# Test 5: No Token Blocked
Write-Host "[5/5] No token = blocked..." -ForegroundColor Yellow
try {
    Invoke-RestMethod -Uri "http://localhost:5000/orders/my-orders" | Out-Null
    Write-Host "  [FAIL] Accessed without token!" -ForegroundColor Red
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq 401) {
        Write-Host "  [PASS] Blocked with 401" -ForegroundColor Green
    } else {
        Write-Host "  [INFO] Status: $status" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  Testing Complete" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""
