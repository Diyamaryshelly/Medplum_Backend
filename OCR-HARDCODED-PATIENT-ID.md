# ✅ OCR with Hardcoded Patient ID

## Summary

The OCR router now uses a **hardcoded patient ID** for all operations. No need to send patient ID in requests.

## 🎯 Configuration

**Hardcoded Patient ID:**
```typescript
const PATIENT_ID = 'eb2573d0-cafc-4b6a-9400-05747579f9b1';
```

**Location:** `packages/server/src/ocr-router.ts` (line 9)

## 📝 How It Works

### Upload Endpoint

**Request:**
```javascript
const formData = new FormData();
formData.append('file', imageFile);
// No need to send patientId - it's hardcoded!

fetch('http://localhost:8103/ocr/upload', {
  method: 'POST',
  body: formData
});
```

**Response:**
```json
{
  "hemoglobin": 13.2,
  "glucose": 110,
  "heartRate": 78,
  "systolic": 120,
  "diastolic": 80,
  "patientId": "eb2573d0-cafc-4b6a-9400-05747579f9b1",  // ✅ Hardcoded
  "saved": true,
  "savedCount": 4,
  "savedIds": ["obs-123", "obs-124", "obs-125", "obs-126"]
}
```

### Save Endpoint

**Request:**
```javascript
fetch('http://localhost:8103/ocr/save', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    hemoglobin: 13.2,
    glucose: 110,
    heartRate: 78,
    systolic: 120,
    diastolic: 80
    // No need to send patientId - it's hardcoded!
  })
});
```

**Response:**
```json
{
  "success": true,
  "patientId": "eb2573d0-cafc-4b6a-9400-05747579f9b1",  // ✅ Hardcoded
  "hapiUrl": "http://localhost:8080/fhir",
  "count": 4,
  "savedIds": ["obs-123", "obs-124", "obs-125", "obs-126"]
}
```

## 🔄 What Happens

1. **Upload image** → OCR extracts vitals
2. **Automatically saves** to HAPI FHIR with patient ID: `eb2573d0-cafc-4b6a-9400-05747579f9b1`
3. **Creates patient** in HAPI if it doesn't exist
4. **Creates observations** linked to that patient
5. **Returns results** with the hardcoded patient ID

## ✨ Benefits

- ✅ **Simple**: No need to manage patient IDs in frontend
- ✅ **Consistent**: Always uses the same patient ID
- ✅ **Single patient**: Perfect for single-patient applications
- ✅ **No errors**: Can't accidentally use wrong patient ID

## 🔧 Changing the Patient ID

If you need to change the patient ID, edit `packages/server/src/ocr-router.ts`:

```typescript
// Line 9
const PATIENT_ID = 'your-new-patient-id-here';
```

Then restart the server:
```bash
docker-compose -f docker-compose.dev.yml restart medplum-server
```

## 🧪 Testing

### Test Upload
```bash
curl -X POST http://localhost:8103/ocr/upload \
  -F "file=@test-image.png"
```

### Test Save
```bash
curl -X POST http://localhost:8103/ocr/save \
  -H "Content-Type: application/json" \
  -d '{
    "hemoglobin": 13.2,
    "glucose": 110,
    "heartRate": 78,
    "systolic": 120,
    "diastolic": 80
  }'
```

### Verify in HAPI
```bash
# Get observations for the hardcoded patient
curl http://localhost:8080/fhir/Observation?subject=Patient/eb2573d0-cafc-4b6a-9400-05747579f9b1

# Get the patient
curl http://localhost:8080/fhir/Patient/eb2573d0-cafc-4b6a-9400-05747579f9b1
```

## 📊 Server Logs

Watch the logs to see the hardcoded patient ID in action:

```bash
docker-compose -f docker-compose.dev.yml logs -f medplum-server | grep OCR
```

You'll see:
```
[OCR] Using hardcoded patient ID: eb2573d0-cafc-4b6a-9400-05747579f9b1
[OCR] Auto-saving vitals to HAPI for patient eb2573d0-cafc-4b6a-9400-05747579f9b1
[OCR] Patient/eb2573d0-cafc-4b6a-9400-05747579f9b1 created in HAPI
[OCR] Saved 4 observation(s) to HAPI
```

## 💻 Frontend Code

Your frontend code is now simpler - no need to manage patient IDs:

```javascript
// Upload image
async function uploadVitalsImage(imageFile) {
  const formData = new FormData();
  formData.append('file', imageFile);
  // That's it! Patient ID is hardcoded on the server
  
  const response = await fetch('http://localhost:8103/ocr/upload', {
    method: 'POST',
    body: formData
  });
  
  const result = await response.json();
  console.log('Saved for patient:', result.patientId);
  return result;
}

// Save vitals manually
async function saveVitals(vitals) {
  const response = await fetch('http://localhost:8103/ocr/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(vitals)
    // No patientId needed!
  });
  
  return await response.json();
}
```

## ⚠️ Important Notes

1. **Single Patient Only**: This setup is for applications with a single patient
2. **Patient Auto-Creation**: The patient is automatically created in HAPI FHIR if it doesn't exist
3. **UUID Support**: HAPI FHIR fully supports UUID patient IDs (no size issues)
4. **Medplum vs HAPI**: 
   - Medplum: Stores DocumentReference with patient `eb2573d0-cafc-4b6a-9400-05747579f9b1`
   - HAPI: Stores Observations with patient `eb2573d0-cafc-4b6a-9400-05747579f9b1`
   - ✅ Both use the same patient ID now!

## 🎉 Result

Now when you upload an image or save vitals:
- ✅ Patient ID is always: `eb2573d0-cafc-4b6a-9400-05747579f9b1`
- ✅ No need to send it in requests
- ✅ Consistent across Medplum and HAPI FHIR
- ✅ Simple and error-free

**Your integration is complete!** 🚀
