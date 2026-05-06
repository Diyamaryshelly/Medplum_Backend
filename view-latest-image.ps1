# PowerShell script to download and view the latest uploaded image

Write-Host "🔍 Finding latest image..." -ForegroundColor Cyan

# Get the most recent directory (sorted by name, which includes timestamp)
$latestDir = docker-compose -f docker-compose.dev.yml exec -T medplum-server ls -t /app/packages/server/binary/ | Select-Object -First 1
$latestDir = $latestDir.Trim()

if ($latestDir -eq "") {
    Write-Host "❌ No images found in storage" -ForegroundColor Red
    exit 1
}

Write-Host "📂 Latest directory: $latestDir" -ForegroundColor Yellow

# Get the file in this directory
$file = docker-compose -f docker-compose.dev.yml exec -T medplum-server ls "/app/packages/server/binary/$latestDir/" | Select-Object -First 1
$file = $file.Trim()

if ($file -eq "") {
    Write-Host "❌ No file found in directory" -ForegroundColor Red
    exit 1
}

Write-Host "📄 File: $file" -ForegroundColor Yellow

# Create temp directory
New-Item -ItemType Directory -Force -Path "temp-images" | Out-Null

# Copy file from container (use actual container name)
$containerName = "medplum-medplum-server-1"
$outputFile = "temp-images/latest-image.png"
docker cp "${containerName}:/app/packages/server/binary/$latestDir/$file" $outputFile

if (Test-Path $outputFile) {
    Write-Host "✅ Downloaded to: $outputFile" -ForegroundColor Green
    Write-Host "🖼️  Opening image..." -ForegroundColor Cyan
    
    # Open the image with default viewer
    Invoke-Item $outputFile
    
    Write-Host ""
    Write-Host "✨ Done! Image should open in your default viewer." -ForegroundColor Green
} else {
    Write-Host "❌ Failed to download image" -ForegroundColor Red
    Write-Host "💡 Make sure the container is running: docker-compose -f docker-compose.dev.yml ps" -ForegroundColor Yellow
}
