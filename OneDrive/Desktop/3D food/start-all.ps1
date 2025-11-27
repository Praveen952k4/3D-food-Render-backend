# Start All Servers Script
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  3D Food AR App - Server Startup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Kill existing node processes
Write-Host "Stopping any running node processes..." -ForegroundColor Yellow
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Start Backend
Write-Host ""
Write-Host "Starting Backend Server (Port 5001)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", @"
    Set-Location 'c:\Users\Praveen\OneDrive\Desktop\3D food\ar-food-backend'
    Write-Host '╔══════════════════════════════════════╗' -ForegroundColor Cyan
    Write-Host '║   BACKEND SERVER - Port 5001        ║' -ForegroundColor Cyan
    Write-Host '╚══════════════════════════════════════╝' -ForegroundColor Cyan
    npm start
"@

# Wait for backend to start
Write-Host "Waiting for backend to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 8

# Start Frontend
Write-Host ""
Write-Host "Starting Frontend Server (Port 3000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", @"
    Set-Location 'c:\Users\Praveen\OneDrive\Desktop\3D food\ar-food-app'
    `$env:REACT_APP_API_URL='http://localhost:5001/api'
    Write-Host '╔══════════════════════════════════════╗' -ForegroundColor Cyan
    Write-Host '║   FRONTEND SERVER - Port 3000       ║' -ForegroundColor Cyan
    Write-Host '║   API: http://localhost:5001/api    ║' -ForegroundColor Cyan
    Write-Host '╚══════════════════════════════════════╝' -ForegroundColor Cyan
    npm start
"@

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Servers are starting!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backend:  http://localhost:5001" -ForegroundColor Yellow
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Yellow
Write-Host ""
Write-Host "Login Credentials:" -ForegroundColor Magenta
Write-Host "  Phone: 8148545814 (Admin)" -ForegroundColor White
Write-Host "  OTP:   123456" -ForegroundColor White
Write-Host ""
