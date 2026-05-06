# PowerShell script to download all stored images from Medplum Docker container

Write-Host "📥 Downloading all stored images from Medplum..." -ForegroundColor Cyan

# Create output directory
New-Item -ItemType Directory -Force -Path "downloaded-images" | Out-Null

# Get list of all binary directories
$binaryDirs = docker-compose -f docker-compose.dev.yml exec -T medplum-server ls /app/packages/server/binary/

# Counter
$count = 0

# Loop through each directory
foreach ($dir in $binaryDirs) {
    $dir = $dir.Trim()
    
    if ($dir -ne "") {
        Write-Host "Processing directory: $dir" -ForegroundColor Yellow
        
        # Get files in this directory
        $files = docker-compose -f docker-compose.dev.yml exec -T medplum-server ls "/app/packages/server/binary/$dir/"
        
        foreach ($file in $files) {
            $file = $file.Trim()
            
            if ($file -ne "") {
                # Copy file from container
                $outputFile = "downloaded-images/image-$count.bin"
                docker cp "medplum-server:/app/packages/server/binary/$dir/$file" $outputFile
                
                Write-Host "✅ Downloaded: image-$count.bin (from $dir/$file)" -ForegroundColor Green
                $count++
            }
        }
    }
}

Write-Host ""
Write-Host "🎉 Downloaded $count images to ./downloaded-images/" -ForegroundColor Green
Write-Host "💡 Tip: Rename .bin files to .png or .jpg to view them" -ForegroundColor Cyan
Write-Host ""
Write-Host "To view an image, run:" -ForegroundColor Yellow
Write-Host "  Rename-Item downloaded-images/image-0.bin image-0.png" -ForegroundColor White
Write-Host "  start downloaded-images/image-0.png" -ForegroundColor White
