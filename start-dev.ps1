# Dead Drop Development Startup Script
# PowerShell script to start both backend and frontend

Write-Host "Starting Dead Drop Development Servers..." -ForegroundColor Cyan
Write-Host ""

# Check if backend is already running
$backendRunning = $false
try {
    $response = Invoke-WebRequest -Uri "http://localhost:4000/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
    if ($response.StatusCode -eq 200) {
        $backendRunning = $true
    }
} catch {
    $backendRunning = $false
}

# Check if frontend is already running
$frontendRunning = $false
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5178" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
    if ($response.StatusCode -eq 200) {
        $frontendRunning = $true
    }
} catch {
    $frontendRunning = $false
}

if ($backendRunning) {
    Write-Host "Backend already running on http://localhost:4000" -ForegroundColor Green
} else {
    Write-Host "Starting Backend on http://localhost:4000..." -ForegroundColor Blue
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\apps\bridge'; Write-Host 'BACKEND' -ForegroundColor Cyan; npm run dev"
    Write-Host "   Waiting for backend to start..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
}

if ($frontendRunning) {
    Write-Host "Frontend already running on http://localhost:5178" -ForegroundColor Green
} else {
    Write-Host "Starting Frontend on http://localhost:5178..." -ForegroundColor Green
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\apps\frontend'; Write-Host 'FRONTEND' -ForegroundColor Magenta; npm run dev"
    Write-Host "   Waiting for frontend to start..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
}

Write-Host ""
Write-Host "Dead Drop is starting!" -ForegroundColor Green
Write-Host ""
Write-Host "URLs:" -ForegroundColor Cyan
Write-Host "   Frontend: http://localhost:5178" -ForegroundColor White
Write-Host "   Backend:  http://localhost:4000" -ForegroundColor White
Write-Host ""
Write-Host "To check status:" -ForegroundColor Cyan
Write-Host "   curl http://localhost:4000/api/health" -ForegroundColor White
Write-Host ""
Write-Host "To stop servers:" -ForegroundColor Yellow
Write-Host "   Close the terminal windows or press Ctrl+C" -ForegroundColor White
Write-Host ""

# Open browser
Start-Sleep -Seconds 2
Write-Host "Opening browser..." -ForegroundColor Cyan
Start-Process "http://localhost:5178"
