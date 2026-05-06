# Simple PostgreSQL Storage Test Script

Write-Host "PostgreSQL Storage Verification" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check if table exists
Write-Host "[1] Checking if binary_storage table exists..." -ForegroundColor Yellow
$tableExists = docker-compose -f docker-compose.dev.yml exec -T postgres psql -U medplum -d medplum -t -c "\dt binary_storage" 2>&1
if ($tableExists -match "binary_storage") {
    Write-Host "    SUCCESS: Table exists" -ForegroundColor Green
} else {
    Write-Host "    FAILED: Table does not exist" -ForegroundColor Red
}
Write-Host ""

# Count images
Write-Host "[2] Counting images in database..." -ForegroundColor Yellow
$count = docker-compose -f docker-compose.dev.yml exec -T postgres psql -U medplum -d medplum -t -c "SELECT COUNT(*) FROM binary_storage;" 2>&1
$count = $count.Trim()
Write-Host "    Images in database: $count" -ForegroundColor Cyan
Write-Host ""

# Check configuration
Write-Host "[3] Checking configuration..." -ForegroundColor Yellow
$config = docker-compose -f docker-compose.dev.yml exec -T medplum-server env 2>&1 | Select-String "BINARY_STORAGE"
Write-Host "    Config: $config" -ForegroundColor White
Write-Host ""

# Check file system
Write-Host "[4] Checking file system..." -ForegroundColor Yellow
$fsCheck = docker-compose -f docker-compose.dev.yml exec -T medplum-server ls /app/packages/server/binary/ 2>&1
if ($fsCheck -match "No such file" -or $fsCheck -match "cannot access") {
    Write-Host "    SUCCESS: No file system storage" -ForegroundColor Green
} else {
    Write-Host "    WARNING: File system directory exists" -ForegroundColor Yellow
}
Write-Host ""

# Show recent uploads if any
if ([int]$count -gt 0) {
    Write-Host "[5] Recent uploads:" -ForegroundColor Yellow
    docker-compose -f docker-compose.dev.yml exec -T postgres psql -U medplum -d medplum -c "SELECT substring(key from 1 for 40) as key, content_type, pg_size_pretty(LENGTH(data)) as size, created_at FROM binary_storage ORDER BY created_at DESC LIMIT 3;"
} else {
    Write-Host "[5] No images uploaded yet" -ForegroundColor Yellow
    Write-Host "    Upload an image through your app to test!" -ForegroundColor Cyan
}
Write-Host ""

Write-Host "Test complete!" -ForegroundColor Green
