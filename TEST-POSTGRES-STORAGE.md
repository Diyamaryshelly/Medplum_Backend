# Testing PostgreSQL Storage - Step by Step Guide 🧪

This guide will help you test that images are being stored in PostgreSQL instead of the file system.

## 📋 Quick Test Checklist

- [ ] Rebuild Docker containers
- [ ] Verify table creation
- [ ] Upload test image
- [ ] Verify image in database
- [ ] Verify image NOT in file system
- [ ] Download and view image
- [ ] Check database size

---

## Step 1: Rebuild and Start Services 🔨

```bash
cd medplum

# Stop current services
docker-compose -f docker-compose.dev.yml down

# Rebuild with new code (this will take a few minutes)
docker-compose -f docker-compose.dev.yml build --no-cache medplum-server

# Start all services
docker-compose -f docker-compose.dev.yml up -d

# Wait for services to be healthy (30-60 seconds)
docker-compose -f docker-compose.dev.yml ps
```

**Expected Output**:
```
NAME                      STATUS
hapi_fhir                 Up (healthy)
medplum-medplum-app-1     Up (healthy)
medplum-medplum-server-1  Up (healthy)
medplum-postgres-1        Up (healthy)
medplum-redis-1           Up (healthy)
```

---

## Step 2: Check Server Logs 📝

```bash
# Watch server logs for "Binary storage table ensured"
docker-compose -f docker-compose.dev.yml logs medplum-server | grep -i "binary"
```

**Expected Output**:
```
medplum-server-1  | {"level":"INFO","timestamp":"...","msg":"Binary storage table ensured"}
```

If you see this, the PostgreSQL storage is initialized! ✅

---

## Step 3: Verify Table Creation 🗄️

```bash
# Connect to PostgreSQL
docker-compose -f docker-compose.dev.yml exec postgres psql -U medplum -d medplum
```

**Inside PostgreSQL, run these commands**:

```sql
-- Check if table exists
\dt binary_storage

-- View table structure
\d binary_storage

-- Check if table is empty (should be 0 rows initially)
SELECT COUNT(*) FROM binary_storage;

-- Exit PostgreSQL
\q
```

**Expected Output**:
```
                Table "public.binary_storage"
   Column     |            Type             | Nullable | Default
--------------+-----------------------------+----------+---------
 key          | character varying(255)      | not null |
 content_type | character varying(255)      |          |
 data         | bytea                       | not null |
 created_at   | timestamp without time zone |          | now()
 updated_at   | timestamp without time zone |          | now()

 count
-------
     0
```

✅ Table created successfully!

---

## Step 4: Upload Test Image 📤

### Option A: Via Your Chat App

1. Open your chat app
2. Go to **Orderbook** tab
3. Click **Upload Medical Report**
4. Select an image
5. Wait for OCR processing
6. Click **Save**

### Option B: Via API (cURL)

```bash
# Create a test image
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" | base64 -d > test-image.png

# Upload via Medplum API (you'll need an access token)
# This is just an example - use your app instead
```

---

## Step 5: Verify Image in Database ✅

**Immediately after upload, check the database**:

```bash
# Quick check - count images
docker-compose -f docker-compose.dev.yml exec postgres psql -U medplum -d medplum -c "SELECT COUNT(*) FROM binary_storage;"

# View uploaded images
docker-compose -f docker-compose.dev.yml exec postgres psql -U medplum -d medplum -c "
SELECT 
  key,
  content_type,
  LENGTH(data) as size_bytes,
  pg_size_pretty(LENGTH(data)) as size_human,
  created_at
FROM binary_storage
ORDER BY created_at DESC
LIMIT 5;
"
```

**Expected Output**:
```
 count
-------
     1

                    key                     | content_type | size_bytes | size_human |         created_at
--------------------------------------------+--------------+------------+------------+----------------------------
 binary/abc123.../version123...             | image/jpeg   |    1048576 | 1024 kB    | 2026-05-06 10:30:45.123456
```

✅ Image is in PostgreSQL!

---

## Step 6: Verify Image NOT in File System ❌

```bash
# Check if binary directory is empty or doesn't exist
docker-compose -f docker-compose.dev.yml exec medplum-server ls -la /app/packages/server/binary/ 2>&1
```

**Expected Output**:
```
ls: cannot access '/app/packages/server/binary/': No such file or directory
```

OR if directory exists:
```
total 8
drwxr-xr-x 2 root root 4096 May  6 10:30 .
drwxr-xr-x 5 root root 4096 May  6 10:30 ..
```

✅ No image files in file system!

---

## Step 7: View Image Data (Sample) 🔍

```bash
# View first 100 bytes of image data (as hex)
docker-compose -f docker-compose.dev.yml exec postgres psql -U medplum -d medplum -c "
SELECT 
  key,
  content_type,
  encode(substring(data from 1 for 100), 'hex') as first_100_bytes_hex
FROM binary_storage
ORDER BY created_at DESC
LIMIT 1;
"
```

**Expected Output**:
```
                    key                     | content_type |           first_100_bytes_hex
--------------------------------------------+--------------+------------------------------------------
 binary/abc123.../version123...             | image/jpeg   | ffd8ffe000104a46494600010101006000600000...
```

The hex starting with `ffd8ffe0` confirms it's a JPEG image! ✅

---

## Step 8: Check Database Size 📊

```bash
# Check total storage used
docker-compose -f docker-compose.dev.yml exec postgres psql -U medplum -d medplum -c "
SELECT 
  COUNT(*) as image_count,
  pg_size_pretty(SUM(LENGTH(data))) as total_size,
  pg_size_pretty(AVG(LENGTH(data))) as avg_size,
  pg_size_pretty(MIN(LENGTH(data))) as min_size,
  pg_size_pretty(MAX(LENGTH(data))) as max_size
FROM binary_storage;
"
```

**Expected Output**:
```
 image_count | total_size | avg_size | min_size | max_size
-------------+------------+----------+----------+----------
           3 | 3072 kB    | 1024 kB  | 512 kB   | 1536 kB
```

---

## Step 9: Test Image Download 📥

### Via Your App

1. Go to **Orderbook** tab
2. You should see your uploaded images
3. Images should display correctly
4. Click on an image to view full size

### Via API

```bash
# Get DocumentReferences
curl http://localhost:8103/fhir/R4/DocumentReference | jq '.entry[0].resource.content[0].attachment.url'

# The URL will be something like: "Binary/abc123..."
```

---

## Step 10: Complete Verification Script 🎯

Run this all-in-one verification script:

```bash
#!/bin/bash
echo "🧪 PostgreSQL Storage Verification"
echo "=================================="
echo ""

echo "1️⃣ Checking if binary_storage table exists..."
docker-compose -f docker-compose.dev.yml exec -T postgres psql -U medplum -d medplum -c "\dt binary_storage" | grep binary_storage
if [ $? -eq 0 ]; then
  echo "✅ Table exists"
else
  echo "❌ Table does not exist"
  exit 1
fi
echo ""

echo "2️⃣ Counting images in database..."
COUNT=$(docker-compose -f docker-compose.dev.yml exec -T postgres psql -U medplum -d medplum -t -c "SELECT COUNT(*) FROM binary_storage;")
echo "📊 Images in database: $COUNT"
echo ""

echo "3️⃣ Checking file system (should be empty)..."
docker-compose -f docker-compose.dev.yml exec -T medplum-server ls /app/packages/server/binary/ 2>&1 | grep -q "No such file"
if [ $? -eq 0 ]; then
  echo "✅ No file system storage (using PostgreSQL)"
else
  echo "⚠️  File system directory exists (might have old files)"
fi
echo ""

echo "4️⃣ Database storage statistics..."
docker-compose -f docker-compose.dev.yml exec -T postgres psql -U medplum -d medplum -c "
SELECT 
  COUNT(*) as images,
  pg_size_pretty(SUM(LENGTH(data))) as total_size
FROM binary_storage;
"
echo ""

echo "5️⃣ Recent uploads..."
docker-compose -f docker-compose.dev.yml exec -T postgres psql -U medplum -d medplum -c "
SELECT 
  substring(key from 1 for 40) as key_preview,
  content_type,
  pg_size_pretty(LENGTH(data)) as size,
  created_at
FROM binary_storage
ORDER BY created_at DESC
LIMIT 3;
"
echo ""

echo "✅ Verification complete!"
```

Save this as `verify-postgres-storage.sh` and run:

```bash
chmod +x verify-postgres-storage.sh
./verify-postgres-storage.sh
```

---

## Troubleshooting 🔧

### Issue: Table Not Created

```bash
# Manually create table
docker-compose -f docker-compose.dev.yml exec postgres psql -U medplum -d medplum << 'EOF'
CREATE TABLE IF NOT EXISTS binary_storage (
  key VARCHAR(255) PRIMARY KEY,
  content_type VARCHAR(255),
  data BYTEA NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_binary_storage_created_at 
ON binary_storage(created_at);
EOF
```

### Issue: Images Still in File System

```bash
# Check configuration
docker-compose -f docker-compose.dev.yml exec medplum-server env | grep BINARY_STORAGE

# Should show:
# MEDPLUM_BINARY_STORAGE=database
```

### Issue: Upload Fails

```bash
# Check server logs
docker-compose -f docker-compose.dev.yml logs medplum-server --tail=50

# Look for errors related to "binary" or "storage"
```

---

## Success Criteria ✅

Your PostgreSQL storage is working correctly if:

- ✅ `binary_storage` table exists in PostgreSQL
- ✅ Images appear in `binary_storage` table after upload
- ✅ File system `/app/packages/server/binary/` is empty or doesn't exist
- ✅ Images display correctly in your app
- ✅ Server logs show "Binary storage table ensured"
- ✅ Database size increases with each upload

---

## Comparison Test 📊

### Before (File System):
```bash
# Images were here:
docker-compose -f docker-compose.dev.yml exec medplum-server ls -lah /app/packages/server/binary/
# Output: Multiple directories with files

# Database was small:
docker-compose -f docker-compose.dev.yml exec postgres psql -U medplum -d medplum -c "SELECT pg_size_pretty(pg_database_size('medplum'));"
# Output: ~50 MB
```

### After (PostgreSQL):
```bash
# No files in file system:
docker-compose -f docker-compose.dev.yml exec medplum-server ls /app/packages/server/binary/
# Output: No such file or directory

# Database is larger:
docker-compose -f docker-compose.dev.yml exec postgres psql -U medplum -d medplum -c "SELECT pg_size_pretty(pg_database_size('medplum'));"
# Output: ~55 MB (increased by image size)

# Images in database:
docker-compose -f docker-compose.dev.yml exec postgres psql -U medplum -d medplum -c "SELECT COUNT(*) FROM binary_storage;"
# Output: 5 (or however many you uploaded)
```

---

## Next Steps 🚀

After successful testing:

1. ✅ Upload more images to test performance
2. ✅ Monitor database size growth
3. ✅ Test image download/display
4. ✅ Set up database backups
5. ✅ Consider cleanup strategy for old images

---

**You're all set!** Your images are now stored in PostgreSQL! 🎉
