# Redis Installation Script for Windows
# This script helps you install Redis using the easiest method available

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Redis Installation Helper" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Check if Docker is installed
Write-Host "Checking for Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Docker found: $dockerVersion" -ForegroundColor Green
        Write-Host "`nStarting Redis in Docker..." -ForegroundColor Yellow
        
        # Check if redis-hirenow already exists
        $existingContainer = docker ps -a --filter "name=redis-hirenow" --format "{{.Names}}" 2>$null
        
        if ($existingContainer -eq "redis-hirenow") {
            Write-Host "Redis container already exists. Starting it..." -ForegroundColor Yellow
            docker start redis-hirenow
        } else {
            Write-Host "Creating new Redis container..." -ForegroundColor Yellow
            docker run -d -p 6379:6379 --name redis-hirenow --restart always redis:alpine
        }
        
        # Wait a moment for Redis to start
        Start-Sleep -Seconds 2
        
        # Test connection
        Write-Host "`nTesting Redis connection..." -ForegroundColor Yellow
        $redisTest = docker exec redis-hirenow redis-cli ping 2>$null
        
        if ($redisTest -eq "PONG") {
            Write-Host "✓ Redis is running successfully!" -ForegroundColor Green
            Write-Host "`nRedis is now available at: localhost:6379" -ForegroundColor Cyan
            
            Write-Host "`n========================================" -ForegroundColor Cyan
            Write-Host "Next Steps:" -ForegroundColor Cyan
            Write-Host "========================================" -ForegroundColor Cyan
            Write-Host "1. Open a NEW terminal" -ForegroundColor White
            Write-Host "2. Run: cd backend" -ForegroundColor White
            Write-Host "3. Run: & .\venv\Scripts\Activate.ps1" -ForegroundColor White
            Write-Host "4. Run: celery -A core worker --loglevel=info --pool=solo" -ForegroundColor White
            Write-Host "`n5. Keep that terminal open!" -ForegroundColor Yellow
            Write-Host "6. Start Django in another terminal: python manage.py runserver" -ForegroundColor White
            Write-Host "7. Test interview submission - should return in 1-2 seconds!" -ForegroundColor Green
            
            Write-Host "`n========================================" -ForegroundColor Cyan
            Write-Host "Useful Commands:" -ForegroundColor Cyan
            Write-Host "========================================" -ForegroundColor Cyan
            Write-Host "Stop Redis:    docker stop redis-hirenow" -ForegroundColor White
            Write-Host "Start Redis:   docker start redis-hirenow" -ForegroundColor White
            Write-Host "View logs:     docker logs redis-hirenow" -ForegroundColor White
            Write-Host "Remove Redis:  docker rm -f redis-hirenow" -ForegroundColor White
            
            exit 0
        } else {
            Write-Host "✗ Redis container started but not responding" -ForegroundColor Red
            exit 1
        }
    }
} catch {
    Write-Host "✗ Docker not found" -ForegroundColor Red
}

# Check if WSL is available
Write-Host "`nChecking for WSL..." -ForegroundColor Yellow
try {
    $wslVersion = wsl --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ WSL found" -ForegroundColor Green
        Write-Host "`nYou can install Redis in WSL with:" -ForegroundColor Cyan
        Write-Host "  wsl" -ForegroundColor White
        Write-Host "  sudo apt update" -ForegroundColor White
        Write-Host "  sudo apt install redis-server -y" -ForegroundColor White
        Write-Host "  sudo service redis-server start" -ForegroundColor White
        
        $response = Read-Host "`nWould you like to install Redis in WSL now? (y/n)"
        if ($response -eq "y" -or $response -eq "Y") {
            Write-Host "`nInstalling Redis in WSL..." -ForegroundColor Yellow
            wsl sudo apt update
            wsl sudo apt install redis-server -y
            wsl sudo service redis-server start
            
            # Test
            $wslTest = wsl redis-cli ping 2>$null
            if ($wslTest -eq "PONG") {
                Write-Host "✓ Redis installed and running in WSL!" -ForegroundColor Green
                Write-Host "`nRedis is available at: localhost:6379" -ForegroundColor Cyan
                
                Write-Host "`n========================================" -ForegroundColor Cyan
                Write-Host "Next Steps: (same as Docker)" -ForegroundColor Cyan
                Write-Host "========================================" -ForegroundColor Cyan
                Write-Host "1. Open a NEW terminal" -ForegroundColor White
                Write-Host "2. Run Celery worker (see above)" -ForegroundColor White
                Write-Host "3. Test interview submission!" -ForegroundColor Green
                
                Write-Host "`nTo start Redis later:" -ForegroundColor Cyan
                Write-Host "  wsl sudo service redis-server start" -ForegroundColor White
                
                exit 0
            } else {
                Write-Host "✗ Installation completed but Redis not responding" -ForegroundColor Red
                exit 1
            }
        }
    }
} catch {
    Write-Host "✗ WSL not found" -ForegroundColor Red
}

# No Docker or WSL - manual installation
Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "Manual Installation Required" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow

Write-Host "`nNeither Docker nor WSL found on your system." -ForegroundColor White
Write-Host "Please choose one of these options:`n" -ForegroundColor White

Write-Host "Option 1: Install Docker Desktop (Recommended)" -ForegroundColor Cyan
Write-Host "  - Download: https://www.docker.com/products/docker-desktop/" -ForegroundColor White
Write-Host "  - Install and restart your computer" -ForegroundColor White
Write-Host "  - Run this script again" -ForegroundColor White

Write-Host "`nOption 2: Install WSL" -ForegroundColor Cyan
Write-Host "  - Run in PowerShell (as Admin): wsl --install" -ForegroundColor White
Write-Host "  - Restart your computer" -ForegroundColor White
Write-Host "  - Run this script again" -ForegroundColor White

Write-Host "`nOption 3: Use Thread Fallback (No Redis)" -ForegroundColor Cyan
Write-Host "  - No installation needed!" -ForegroundColor Green
Write-Host "  - Interview submission will wait 2 minutes (current behavior)" -ForegroundColor Yellow
Write-Host "  - Fine for development, use Redis for production" -ForegroundColor White

Write-Host "`nOption 4: Manual Redis Installation" -ForegroundColor Cyan
Write-Host "  - Download: https://github.com/microsoftarchive/redis/releases" -ForegroundColor White
Write-Host "  - Extract and run redis-server.exe" -ForegroundColor White
Write-Host "  - More complex, not recommended" -ForegroundColor Yellow

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Recommendation:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "For Development: Use thread fallback (Option 3) - no setup needed" -ForegroundColor White
Write-Host "For Production: Install Docker (Option 1) or use cloud Redis" -ForegroundColor White

Write-Host "`nYour app works fine without Redis - it just waits 2 minutes on submit." -ForegroundColor Green
Write-Host "Add Redis later when you need instant responses!" -ForegroundColor Green
