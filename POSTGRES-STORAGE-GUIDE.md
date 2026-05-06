# PostgreSQL Binary Storage Guide 🗄️

This guide explains how to store images directly in PostgreSQL instead of the file system.

## 📋 Table of Contents

1. [Overview](#overview)
2. [Implementation](#implementation)
3. [Configuration](#configuration)
4. [Migration](#migration)
5. [Advantages & Disadvantages](#advantages--disadvantages)
6. [Verification](#verification)
7. [Troubleshooting](#troubleshooting)

---

## 1. Overview

### What Changed?

**Before (File System Storage)**:
- Images stored in: `/app/packages/server/binary/[project-id]/[binary-id]`
- Metadata in PostgreSQL, files on disk
- Requires Docker volume for persistence

**After (PostgreSQL Storage)**:
- Images stored in: PostgreSQL `binary_storage` table as `BYTEA` (binary data)
- Both metadata AND files in PostgreSQL
- No Docker volume needed for binary files

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Upload                           │
│              medplum.createAttachment(blob)                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Medplum Server                              │
│  POST /fhir/R4/Binary                                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  PostgresBinaryStorage.writeFile()                   │   │
│  │  1. Convert stream to buffer                         │   │
│  │  2. INSERT INTO binary_storage                       │   │
│  │     (key, content_type, data)                        │   │
│  │  3. Create Binary resource metadata                  │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  PostgreSQL Database                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  binary_storage Table:                               │   │
│  │    - key: "binary/[id]/[version]"                    │   │
│  │    - content_type: "image/jpeg"                      │   │
│  │    - data: <BYTEA binary data>                       │   │
│  │    - created_at: timestamp                           │   │
│  │    - updated_at: timestamp                           │   │
│  │                                                       │   │
│  │  Binary Table (metadata):                            │   │
│  │    - id, contentType, url                            │   │
│  │                                                       │   │
│  │  DocumentReference Table:                            │   │
│  │    - id, subject, content, date                      │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Implementation

### Files Created

#### `packages/server/src/storage/postgres.ts`

A new storage backend that implements the `BinaryStorage` interface:

**Key Features**:
- ✅ Stores binary data as PostgreSQL `BYTEA` type
- ✅ Automatic table creation on startup
- ✅ Upsert support (INSERT ... ON CONFLICT)
- ✅ Stream to buffer conversion
- ✅ Copy operation support
- ✅ Storage statistics utility
- ✅ Cleanup utility for old binaries

**Table Schema**:
```sql
CREATE TABLE binary_storage (
  key VARCHAR(255) PRIMARY KEY,
  content_type VARCHAR(255),
  data BYTEA NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_binary_storage_created_at 
ON binary_storage(created_at);
```

### Files Modified

#### `packages/server/src/storage/loader.ts`

Added PostgreSQL storage initialization:

```typescript
import { PostgresBinaryStorage } from './postgres';

export function initBinaryStorage(type?: string): void {
  // ... existing code ...
  } else if (type === 'database' || type === 'postgres' || type === 'postgresql') {
    binaryStorage = new PostgresBinaryStorage();
  } else {
    // ... existing code ...
  }
}
```

---

## 3. Configuration

### Environment Variables

#### `.env` File

```env
# Change from file system to database storage
MEDPLUM_BINARY_STORAGE=database

# Alternative values:
# MEDPLUM_BINARY_STORAGE=postgres
# MEDPLUM_BINARY_STORAGE=postgresql
# MEDPLUM_BINARY_STORAGE=file:./binary/  (old way)
```

#### `docker-compose.dev.yml`

```yaml
services:
  medplum-server:
    environment:
      MEDPLUM_BINARY_STORAGE: 'database'
    
    # No longer need binary volume!
    volumes:
      - ./packages/server/src:/app/packages/server/src:cached
      - ./packages/server/package.json:/app/packages/server/package.json:cached
      - medplum-node-modules:/app/node_modules
      - medplum-server-node-modules:/app/packages/server/node_modules
      # ❌ Removed: - medplum-server-binary:/app/packages/server/binary

volumes:
  medplum-postgres-data:
  medplum-node-modules:
  medplum-server-node-modules:
  # ❌ Removed: medplum-server-binary:
```

---

## 4. Migration

### Option A: Fresh Start (Recommended for Development)

```bash
# Stop all services
docker-compose -f docker-compose.dev.yml down -v

# Rebuild with new configuration
docker-compose -f docker-compose.dev.yml build --no-cache

# Start services
docker-compose -f docker-compose.dev.yml up -d

# Check logs
docker-compose -f docker-compose.dev.yml logs -f medplum-server
```

### Option B: Migrate Existing Images

If you have existing images in file storage that you want to migrate:

```bash
# 1. Create a migration script
cat > migrate-to-postgres.sql << 'EOF'
-- This is a manual process - you'll need to:
-- 1. Export files from Docker volume
-- 2. Convert to base64 or binary
-- 3. INSERT into binary_storage table

-- Example for a single file:
INSERT INTO binary_storage (key, content_type, data)
VALUES (
  'binary/[binary-id]/[version-id]',
  'image/jpeg',
  decode('[base64-encoded-data]', 'base64')
);
EOF

# 2. For automated migration, create a Node.js script
# (This would require custom development)
```

**Note**: For production, you'd want to create a proper migration script that:
1. Reads all files from the file system
2. Converts them to buffers
3. Inserts them into PostgreSQL
4. Verifies the migration

---

## 5. Advantages & Disadvantages

### ✅ Advantages

| Benefit | Description |
|---------|-------------|
| **Simplified Backup** | Single database backup includes everything |
| **ACID Transactions** | Binary data changes are transactional |
| **No Volume Management** | No need for Docker volumes or file system permissions |
| **Easier Replication** | PostgreSQL replication handles binaries automatically |
| **Atomic Operations** | Binary and metadata updates are atomic |
| **Better for Small Files** | Efficient for medical reports, documents |
| **Centralized Storage** | Everything in one place |

### ❌ Disadvantages

| Drawback | Description |
|----------|-------------|
| **Database Size** | PostgreSQL database will grow significantly |
| **Performance** | Slower for very large files (>10MB) |
| **Memory Usage** | Entire file loaded into memory during read/write |
| **Backup Size** | Database backups become much larger |
| **Query Performance** | Large BYTEA columns can slow down queries |
| **Not Ideal for Videos** | File system or S3 better for large media |

### 📊 Comparison Table

| Feature | File System | PostgreSQL | S3/Cloud |
|---------|-------------|------------|----------|
| **Setup Complexity** | Low | Low | Medium |
| **Performance (Small Files)** | Fast | Fast | Medium |
| **Performance (Large Files)** | Fast | Slow | Fast |
| **Backup Simplicity** | Medium | High | High |
| **Scalability** | Medium | Low | High |
| **Cost** | Low | Low | Medium |
| **Best For** | General use | Small files, simple setup | Production, large scale |

---

## 6. Verification

### Check Table Creation

```bash
# Connect to PostgreSQL
docker-compose -f docker-compose.dev.yml exec postgres psql -U medplum -d medplum

# Check if table exists
\dt binary_storage

# View table structure
\d binary_storage

# Count stored images
SELECT COUNT(*) FROM binary_storage;

# Check total storage size
SELECT 
  COUNT(*) as image_count,
  pg_size_pretty(SUM(LENGTH(data))) as total_size,
  pg_size_pretty(AVG(LENGTH(data))) as avg_size
FROM binary_storage;

# View recent uploads
SELECT 
  key,
  content_type,
  LENGTH(data) as size_bytes,
  created_at
FROM binary_storage
ORDER BY created_at DESC
LIMIT 10;
```

### Test Upload

```bash
# Upload an image through your app
# Then check if it's in the database

docker-compose -f docker-compose.dev.yml exec postgres psql -U medplum -d medplum -c "SELECT key, content_type, LENGTH(data) as size FROM binary_storage ORDER BY created_at DESC LIMIT 1;"
```

### Check Server Logs

```bash
docker-compose -f docker-compose.dev.yml logs medplum-server | grep "Binary"

# Should see:
# Binary storage table ensured
# Binary file written to PostgreSQL
# Binary file read from PostgreSQL
```

---

## 7. Troubleshooting

### Issue: Table Not Created

**Symptoms**:
```
Error: relation "binary_storage" does not exist
```

**Solution**:
```bash
# Manually create the table
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

### Issue: Out of Memory

**Symptoms**:
```
JavaScript heap out of memory
```

**Solution**:
```yaml
# In docker-compose.dev.yml, increase Node.js memory
services:
  medplum-server:
    environment:
      NODE_OPTIONS: '--max-old-space-size=4096'
```

### Issue: Slow Performance

**Symptoms**:
- Image uploads/downloads are slow
- Database queries timeout

**Solution**:
```sql
-- Add more indexes
CREATE INDEX idx_binary_storage_key ON binary_storage(key);

-- Analyze table
ANALYZE binary_storage;

-- Check table size
SELECT pg_size_pretty(pg_total_relation_size('binary_storage'));

-- Consider switching back to file storage for large files
```

### Issue: Database Too Large

**Symptoms**:
- PostgreSQL container running out of disk space
- Backups taking too long

**Solution**:
```bash
# Clean up old binaries (older than 90 days)
docker-compose -f docker-compose.dev.yml exec postgres psql -U medplum -d medplum -c "DELETE FROM binary_storage WHERE created_at < NOW() - INTERVAL '90 days';"

# Vacuum the table
docker-compose -f docker-compose.dev.yml exec postgres psql -U medplum -d medplum -c "VACUUM FULL binary_storage;"

# Or switch back to file storage
```

---

## 8. Switching Back to File Storage

If you need to switch back:

### Step 1: Update Configuration

```env
# In .env
MEDPLUM_BINARY_STORAGE=file:./binary/
```

```yaml
# In docker-compose.dev.yml
services:
  medplum-server:
    environment:
      MEDPLUM_BINARY_STORAGE: 'file:./binary/'
    volumes:
      - medplum-server-binary:/app/packages/server/binary

volumes:
  medplum-server-binary:
```

### Step 2: Restart

```bash
docker-compose -f docker-compose.dev.yml down
docker-compose -f docker-compose.dev.yml up -d
```

---

## 9. Best Practices

### ✅ Do's

- ✅ Use PostgreSQL storage for small files (<5MB)
- ✅ Monitor database size regularly
- ✅ Set up automated cleanup for old binaries
- ✅ Use connection pooling
- ✅ Regular database backups
- ✅ Test performance with your typical file sizes

### ❌ Don'ts

- ❌ Don't store videos or very large files (>10MB)
- ❌ Don't skip database backups
- ❌ Don't ignore database size warnings
- ❌ Don't use for high-traffic production without testing
- ❌ Don't forget to vacuum the table periodically

---

## 10. Monitoring

### Database Size Query

```sql
-- Total size of binary_storage table
SELECT 
  pg_size_pretty(pg_total_relation_size('binary_storage')) as total_size,
  pg_size_pretty(pg_relation_size('binary_storage')) as table_size,
  pg_size_pretty(pg_indexes_size('binary_storage')) as indexes_size;

-- Growth over time
SELECT 
  DATE(created_at) as date,
  COUNT(*) as uploads,
  pg_size_pretty(SUM(LENGTH(data))) as size
FROM binary_storage
GROUP BY DATE(created_at)
ORDER BY date DESC
LIMIT 30;
```

### Performance Monitoring

```sql
-- Slowest queries
SELECT 
  query,
  mean_exec_time,
  calls
FROM pg_stat_statements
WHERE query LIKE '%binary_storage%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

---

## Summary

You've successfully configured Medplum to store images in PostgreSQL! 🎉

**What's Different**:
- Images now stored in `binary_storage` table
- No file system volumes needed
- Simpler backup and replication
- Better for small to medium files

**Next Steps**:
1. Test image upload through your app
2. Verify images are in PostgreSQL
3. Monitor database size
4. Set up automated cleanup if needed

For questions or issues, check the troubleshooting section above.
