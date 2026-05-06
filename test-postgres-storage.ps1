# PowerShell script to test PostgreSQL storage implementation

Write-Host "🧪 PostgreSQL Storage Verification" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check if services are running
Write-Host "1️⃣ Checking if services are running..." -ForegroundColor Yellow
$services = docker-compose -f docker-compose.dev.yml ps --format json | ConvertFrom-Json
$serverRunning = $services | Where-Object { $_.Service -eq "medplum-server" -and $_.State -eq "running" }
$postgresRunning = $services | Where-Object { $_.Service -eq "postgres" -and $_.State -eq "running" }

if ($serverRunning -and $postgresRunning) {
    Write-Host "✅ Services are running" -ForegroundColor Green
} else {
    Write-Host "❌ Services are not running. Please start them first:" -ForegroundColor Red
    Write-Host "   docker-compose -f docker-compose.dev.yml up -d" -ForegroundColor White
    exit 1
}
Write-Host ""

# Step 2: Check if binary_storage table exists
Write-Host "2️⃣ Checking if binary_storage table exists..." -ForegroundColor Yellow
$tableCheck = docker-compose -f docker-compose.dev.yml exec -T postgres psql -U medplum -d medplum -t -c "\dt binary_storage" 2>&1
if ($tableCheck -match "binary_storage") {
    Write-Host "✅ Table exists" -ForegroundColor Green
} else {
    Write-Host "❌ Table does not exist" -ForegroundColor Red
    Write-Host "   Creating table..." -ForegroundColor Yellow
    
    $createTable = @"
CREATE TABLE IF NOT EXISTS binary_storage (
  key VARCHAR(255) PRIMARY KEY,
  content_type VARCHAR(255),
  data BYTEA NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_binary_storage_created_at ON binary_storage(created_at);
"@
    
    docker-compose -f docker-compose.dev.yml exec -T postgres psql -U medplum -d medplum -c $createTable
    Write-Host "✅ Table created" -ForegroundColor Green
}
Write-Host ""

# Step 3: Count images in database
Write-Host "3️⃣ Counting images in database..." -ForegroundColor Yellow
$count = docker-compose -f docker-compose.dev.yml exec -T postgres psql -U medplum -d medplum -t -c "SELECT COUNT(*) FROM binary_storage;"
$count = $count.Trim()
Write-Host "📊 Images in database: $count" -ForegroundColor Cyan
Write-Host ""

# Step 4: Check file system
Write-Host "4️⃣ Checking file system (should be empty)..." -ForegroundColor Yellow
$fsCheck = docker-compose -f docker-compose.dev.yml exec -T medplum-server ls /app/packages/server/binary/ 2>&1
if ($fsCheck -match "No such file" -or $fsCheck -match "cannot access") {
    Write-Host "✅ No file system storage (using PostgreSQL)" -ForegroundColor Green
} else {
    Write-Host "⚠️  File system directory exists (might have old files)" -ForegroundColor Yellow
    Write-Host "   Files found:" -ForegroundColor Gray
    Write-Host $fsCheck -ForegroundColor Gray
}
Write-Host ""

# Step 5: Database storage statistics
Write-Host "5️⃣ Database storage statistics..." -ForegroundColor Yellow
$stats = docker-compose -f docker-compose.dev.yml exec -T postgres psql -U medplum -d medplum -c "
SELECT 
  COUNT(*) as images,
  pg_size_pretty(COALESCE(SUM(LENGTH(data)), 0)) as total_size,
  pg_size_pretty(COALESCE(AVG(LENGTH(data)), 0)) as avg_size
FROM binary_storage;
"
Write-Host $stats -ForegroundColor White
Write-Host ""

# Step 6: Recent uploads
if ([int]$count -gt 0) {
    Write-Host "6️⃣ Recent uploads..." -ForegroundColor Yellow
    $recent = docker-compose -f docker-compose.dev.yml exec -T postgres psql -U medplum -d medplum -c "
SELECT 
  substring(key from 1 for 50) as key_preview,
  content_type,
  pg_size_pretty(LENGTH(data)) as size,
  created_at
FROM binary_storage
ORDER BY created_at DESC
LIMIT 5;
"
    Write-Host $recent -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "6️⃣ No images uploaded yet" -ForegroundColor Yellow
    Write-Host "   Upload an image through your app to test!" -ForegroundColor Cyan
    Write-Host ""
}

# Step 7: Check configuration
Write-Host "7️⃣ Checking configuration..." -ForegroundColor Yellow
$config = docker-compose -f docker-compose.dev.yml exec -T medplum-server env | Select-String "BINARY_STORAGE"
if ($config -match "database") {
    Write-Host "✅ Configuration correct: $config" -ForegroundColor Green
} else {
    Write-Host "❌ Configuration incorrect: $config" -ForegroundColor Red
    Write-Host "   Expected: MEDPLUM_BINARY_STORAGE=database" -ForegroundColor Yellow
}
Write-Host ""

# Step 8: Check server logs
Write-Host "8️⃣ Checking server logs for storage initialization..." -ForegroundColor Yellow
$logs = docker-compose -f docker-compose.dev.yml logs medplum-server 2>&1 | Select-String -Pattern "Binary storage|binary_storage" | Select-Object -Last 5
if ($logs) {
    Write-Host "Recent storage-related logs:" -ForegroundColor Cyan
    $logs | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
} else {
    Write-Host "⚠️  No storage-related logs found" -ForegroundColor Yellow
}
Write-Host ""

# Summary
Write-Host "📋 Summary" -ForegroundColor Cyan
Write-Host "==========" -ForegroundColor Cyan
Write-Host ""

$allGood = $true

if ($serverRunning -and $postgresRunning) {
    Write-Host "✅ Services running" -ForegroundColor Green
} else {
    Write-Host "❌ Services not running" -ForegroundColor Red
    $allGood = $false
}

if ($tableCheck -match "binary_storage") {
    Write-Host "✅ Table exists" -ForegroundColor Green
} else {
    Write-Host "❌ Table missing" -ForegroundColor Red
    $allGood = $false
}

if ($config -match "database") {
    Write-Host "✅ Configuration correct" -ForegroundColor Green
} else {
    Write-Host "❌ Configuration incorrect" -ForegroundColor Red
    $allGood = $false
}

if ($fsCheck -match "No such file" -or $fsCheck -match "cannot access") {
    Write-Host "✅ File system empty" -ForegroundColor Green
} else {
    Write-Host "⚠️  File system has files" -ForegroundColor Yellow
}

Write-Host "📊 Images in database: $count" -ForegroundColor Cyan
Write-Host ""

if ($allGood) {
    Write-Host "🎉 PostgreSQL storage is working correctly!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Upload an image through your app" -ForegroundColor White
    Write-Host "2. Run this script again to verify the image is in PostgreSQL" -ForegroundColor White
    Write-Host "3. Check that the image displays correctly in your app" -ForegroundColor White
} else {
    Write-Host "❌ Some issues detected. Please review the output above." -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Rebuild: docker-compose -f docker-compose.dev.yml build --no-cache" -ForegroundColor White
    Write-Host "2. Restart: docker-compose -f docker-compose.dev.yml up -d" -ForegroundColor White
    Write-Host "3. Check logs: docker-compose -f docker-compose.dev.yml logs medplum-server" -ForegroundColor White
}
Write-Host ""
