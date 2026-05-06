# PowerShell script to get image URLs from Medplum API

Write-Host "🔍 Fetching DocumentReferences from Medplum..." -ForegroundColor Cyan

# Query DocumentReferences
$response = Invoke-RestMethod -Uri "http://localhost:8103/fhir/R4/DocumentReference" -Method Get

if ($response.entry) {
    Write-Host "📋 Found $($response.entry.Count) document(s)" -ForegroundColor Green
    Write-Host ""
    
    $index = 1
    foreach ($entry in $response.entry) {
        $doc = $entry.resource
        $docId = $doc.id
        $date = $doc.date
        $patientRef = $doc.subject.reference
        
        Write-Host "[$index] Document ID: $docId" -ForegroundColor Yellow
        Write-Host "    Date: $date" -ForegroundColor White
        Write-Host "    Patient: $patientRef" -ForegroundColor White
        
        if ($doc.content -and $doc.content[0].attachment) {
            $attachment = $doc.content[0].attachment
            $contentType = $attachment.contentType
            $url = $attachment.url
            
            Write-Host "    Content Type: $contentType" -ForegroundColor White
            Write-Host "    URL: $url" -ForegroundColor Cyan
            
            # If it's a Binary reference, construct the storage URL
            if ($url -match "Binary/(.+)") {
                $binaryId = $Matches[1]
                Write-Host "    Binary ID: $binaryId" -ForegroundColor Magenta
                Write-Host "    💡 To download: docker cp medplum-server:/app/packages/server/binary/[project-id]/$binaryId ./image-$index.png" -ForegroundColor Gray
            }
        }
        
        Write-Host ""
        $index++
    }
} else {
    Write-Host "❌ No documents found" -ForegroundColor Red
}

Write-Host ""
Write-Host "💡 Tip: Use view-latest-image.ps1 to quickly view the most recent image" -ForegroundColor Cyan
