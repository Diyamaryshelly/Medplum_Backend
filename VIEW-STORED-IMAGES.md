# How to View Stored Images 📸

This guide shows you multiple ways to view images stored in your Medplum system.

## Quick Start (Easiest Method) 🚀

### View the Latest Uploaded Image

```powershell
# Windows PowerShell
cd medplum
.\view-latest-image.ps1
```

This will automatically:
1. Find the most recent image
2. Download it to `temp-images/latest-image.png`
3. Open it in your default image viewer

---

## Method 1: Download All Images 📥

### Windows PowerShell

```powershell
cd medplum
.\download-images.ps1
```

This downloads all images to `downloaded-images/` folder.

### Linux/Mac Bash

```bash
cd medplum
chmod +x download-images.sh
./download-images.sh
```

**Result**: All images saved to `downloaded-images/` as `image-0.bin`, `image-1.bin`, etc.

**To view**:
```powershell
# Rename to proper extension
Rename-Item downloaded-images/image-0.bin image-0.png

# Open the image
start downloaded-images/image-0.png
```

---

## Method 2: Get Image URLs via API 🔗

```powershell
cd medplum
.\get-image-urls.ps1
```

This shows:
- Document IDs
- Upload dates
- Patient references
- Binary IDs
- Download commands

**Example Output**:
```
[1] Document ID: abc123
    Date: 2026-05-06T04:28:00Z
    Patient: Patient/eb2573d0-cafc-4b6a-9400-05747579f9b1
    Content Type: image/png
    Binary ID: 5f974b3c-6820-4702-82ac-e486e67b8771
```

---

## Method 3: Manual Docker Commands 🐳

### List All Stored Images

```bash
docker-compose -f docker-compose.dev.yml exec medplum-server ls -lah /app/packages/server/binary/
```

### View Contents of a Specific Directory

```bash
docker-compose -f docker-compose.dev.yml exec medplum-server ls -lah /app/packages/server/binary/[directory-id]/
```

### Download a Specific Image

```bash
# Copy from container to local machine
docker cp medplum-server:/app/packages/server/binary/[project-id]/[binary-id] ./my-image.png

# Open the image
start ./my-image.png  # Windows
open ./my-image.png   # Mac
xdg-open ./my-image.png  # Linux
```

**Example**:
```bash
docker cp medplum-server:/app/packages/server/binary/f728b3f5-60e9-4baa-aa33-579952cd5c7d/5f974b3c-6820-4702-82ac-e486e67b8771 ./image.png
start ./image.png
```

---

## Method 4: Access via Medplum Storage API 🌐

### Step 1: Get DocumentReference

```bash
curl http://localhost:8103/fhir/R4/DocumentReference
```

### Step 2: Extract Storage URL

Look for URLs like:
```
http://localhost:8103/storage/[project-id]/[binary-id]?Expires=...&Signature=...
```

### Step 3: Download Image

```bash
curl "http://localhost:8103/storage/[project-id]/[binary-id]?Expires=...&Signature=..." -o image.png
```

Or open directly in browser:
```
http://localhost:8103/storage/[project-id]/[binary-id]?Expires=...&Signature=...
```

---

## Method 5: Access via Frontend App 📱

### Medplum App (Web UI)

1. Open http://localhost:3000
2. Login with your credentials
3. Navigate to **DocumentReference** resources
4. Click on a document to view details
5. Click on the attachment URL to view/download the image

### Your Chat App

1. Open your chat app
2. Go to **History** or **Orderbook** tab
3. View uploaded documents
4. Click on document to see the image

---

## Troubleshooting 🔧

### No Images Found

```bash
# Check if container is running
docker-compose -f docker-compose.dev.yml ps medplum-server

# Check if binary directory exists
docker-compose -f docker-compose.dev.yml exec medplum-server ls -la /app/packages/server/
```

### Permission Denied

```bash
# Run PowerShell as Administrator
# Or use sudo on Linux/Mac
sudo ./download-images.sh
```

### Image Won't Open

The file might not have the correct extension. Try:
```powershell
# Try different extensions
Rename-Item image.bin image.png
Rename-Item image.bin image.jpg
Rename-Item image.bin image.jpeg
```

---

## Storage Location Details 📂

### Docker Volume
- **Volume Name**: `medplum-server-binary`
- **Container Path**: `/app/packages/server/binary/`
- **Structure**: `[project-id]/[binary-id]`

### Database References
- **PostgreSQL**: Stores Binary and DocumentReference metadata
- **HAPI FHIR**: Stores Observation resources (extracted vitals)

---

## Quick Reference Commands 📝

```powershell
# View latest image (easiest)
.\view-latest-image.ps1

# Download all images
.\download-images.ps1

# Get image URLs and metadata
.\get-image-urls.ps1

# List all images in Docker
docker-compose -f docker-compose.dev.yml exec medplum-server ls -lah /app/packages/server/binary/

# Copy specific image
docker cp medplum-server:/app/packages/server/binary/[dir]/[file] ./image.png

# Query DocumentReferences
curl http://localhost:8103/fhir/R4/DocumentReference

# Query via browser
http://localhost:3000
```

---

## Examples 💡

### Example 1: View Most Recent Upload

```powershell
cd medplum
.\view-latest-image.ps1
```

### Example 2: Download All and View First Image

```powershell
cd medplum
.\download-images.ps1
Rename-Item downloaded-images/image-0.bin image-0.png
start downloaded-images/image-0.png
```

### Example 3: Get Metadata and Download Specific Image

```powershell
# Get list of images
.\get-image-urls.ps1

# Copy specific image (use IDs from output)
docker cp medplum-server:/app/packages/server/binary/f728b3f5-60e9-4baa-aa33-579952cd5c7d/5f974b3c-6820-4702-82ac-e486e67b8771 ./medical-report.png

# Open it
start ./medical-report.png
```

---

## Summary 📋

| Method | Difficulty | Use Case |
|--------|-----------|----------|
| `view-latest-image.ps1` | ⭐ Easy | Quick view of most recent upload |
| `download-images.ps1` | ⭐ Easy | Backup all images |
| `get-image-urls.ps1` | ⭐⭐ Medium | Get metadata and URLs |
| Docker commands | ⭐⭐⭐ Advanced | Manual control |
| Storage API | ⭐⭐⭐ Advanced | Programmatic access |
| Web UI | ⭐ Easy | Visual browsing |

---

**Recommended**: Start with `view-latest-image.ps1` for quick viewing! 🎉
