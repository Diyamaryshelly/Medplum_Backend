# OCR Patient ID Integration Guide

## ✅ Changes Applied - Option A

The OCR router now accepts and uses the patient ID from your requests. This allows you to use the same patient ID in both Medplum and HAPI FHIR.

## 🎯 How It Works

### Before (Old Behavior)
- ❌ Always used hardcoded patient ID: `"1000"`
- ❌ Ignored any patient ID sent in the request
- ❌ Medplum and HAPI had different patient IDs

### After (New Behavior)
- ✅ Accepts patient ID from the request
- ✅ Uses the provided patient ID in HAPI FHIR
- ✅ Falls back to `"1000"` if no patient ID is provided
- ✅ Works with both simple IDs (`"1000"`) and UUIDs (`"eb2573d0-cafc-4b6a-9400-05747579f9b1"`)

## 📝 Updated Endpoints

### 1. POST `/ocr/upload` - Upload Image for OCR

**Before:**
```javascript
const formData = new FormData();
formData.append('file', imageFile);
// Patient ID was ignored
```

**After:**
```javascript
const formData = new FormData();
formData.append('file', imageFile);
formData.append('patientId', 'eb2573d0-cafc-4b6a-9400-05747579f9b1'); // ✅ Now used!

const response = await fetch('http://localhost:8103/ocr/upload', {
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
  "patientId": "eb2573d0-cafc-4b6a-9400-05747579f9b1",  // ✅ Your patient ID
  "saved": true,
  "savedCount": 4,
  "savedIds": ["obs-123", "obs-124", "obs-125", "obs-126"],
  "_rawText": "Hemoglobin (g/dL) 13.2\nGlucose (mg/dL) 110..."
}
```

### 2. POST `/ocr/save` - Manually Save Vitals

**Before:**
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
    // patientId was ignored
  })
});
```

**After:**
```javascript
fetch('http://localhost:8103/ocr/save', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    hemoglobin: 13.2,
    glucose: 110,
    heartRate: 78,
    systolic: 120,
    diastolic: 80,
    patientId: 'eb2573d0-cafc-4b6a-9400-05747579f9b1'  // ✅ Now used!
  })
});
```

**Response:**
```json
{
  "success": true,
  "patientId": "eb2573d0-cafc-4b6a-9400-05747579f9b1",  // ✅ Your patient ID
  "hapiUrl": "http://localhost:8080/fhir",
  "count": 4,
  "savedIds": ["obs-123", "obs-124", "obs-125", "obs-126"]
}
```

## 🔄 Integration Flow

### Complete Workflow

```
1. User uploads image in your frontend
   ↓
2. Frontend gets patient ID from Medplum
   patientId = "eb2573d0-cafc-4b6a-9400-05747579f9b1"
   ↓
3. Frontend sends to OCR endpoint with patientId
   POST /ocr/upload
   FormData: { file: image, patientId: "eb2573d0-..." }
   ↓
4. OCR extracts vitals from image
   ↓
5. OCR saves to HAPI FHIR with the SAME patient ID
   Patient/eb2573d0-cafc-4b6a-9400-05747579f9b1
   ↓
6. Response includes the patient ID used
   { patientId: "eb2573d0-...", saved: true, ... }
```

## 💻 Frontend Code Examples

### React Example

```typescript
// Get patient from Medplum
const patient = await medplum.readResource('Patient', patientId);

// Upload image with patient ID
const uploadVitals = async (imageFile: File) => {
  const formData = new FormData();
  formData.append('file', imageFile);
  formData.append('patientId', patient.id!);  // ✅ Include patient ID
  
  const response = await fetch('http://localhost:8103/ocr/upload', {
    method: 'POST',
    body: formData
  });
  
  const result = await response.json();
  console.log('Vitals saved for patient:', result.patientId);
  console.log('Saved observations:', result.savedIds);
  
  return result;
};

// Manual save with patient ID
const saveVitals = async (vitals: any) => {
  const response = await fetch('http://localhost:8103/ocr/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...vitals,
      patientId: patient.id!  // ✅ Include patient ID
    })
  });
  
  return await response.json();
};
```

### Vanilla JavaScript Example

```javascript
// Upload with patient ID
async function uploadImage(imageFile, patientId) {
  const formData = new FormData();
  formData.append('file', imageFile);
  formData.append('patientId', patientId);  // ✅ Include patient ID
  
  const response = await fetch('http://localhost:8103/ocr/upload', {
    method: 'POST',
    body: formData
  });
  
  const result = await response.json();
  console.log('Patient ID used:', result.patientId);
  return result;
}

// Save vitals with patient ID
async function saveVitals(vitals, patientId) {
  const response = await fetch('http://localhost:8103/ocr/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hemoglobin: vitals.hemoglobin,
      glucose: vitals.glucose,
      heartRate: vitals.heartRate,
      systolic: vitals.systolic,
      diastolic: vitals.diastolic,
      patientId: patientId  // ✅ Include patient ID
    })
  });
  
  return await response.json();
}

// Usage
const patientId = 'eb2573d0-cafc-4b6a-9400-05747579f9b1';
const result = await uploadImage(imageFile, patientId);
```

## 🧪 Testing

### Test with cURL

```bash
# Test upload with patient ID
curl -X POST http://localhost:8103/ocr/upload \
  -F "file=@test-image.png" \
  -F "patientId=eb2573d0-cafc-4b6a-9400-05747579f9b1"

# Test save with patient ID
curl -X POST http://localhost:8103/ocr/save \
  -H "Content-Type: application/json" \
  -d '{
    "hemoglobin": 13.2,
    "glucose": 110,
    "heartRate": 78,
    "systolic": 120,
    "diastolic": 80,
    "patientId": "eb2573d0-cafc-4b6a-9400-05747579f9b1"
  }'
```

### Test with Postman

**Upload Endpoint:**
1. Method: `POST`
2. URL: `http://localhost:8103/ocr/upload`
3. Body: `form-data`
   - Key: `file`, Type: `File`, Value: Select image
   - Key: `patientId`, Type: `Text`, Value: `eb2573d0-cafc-4b6a-9400-05747579f9b1`

**Save Endpoint:**
1. Method: `POST`
2. URL: `http://localhost:8103/ocr/save`
3. Body: `raw` (JSON)
```json
{
  "hemoglobin": 13.2,
  "glucose": 110,
  "heartRate": 78,
  "systolic": 120,
  "diastolic": 80,
  "patientId": "eb2573d0-cafc-4b6a-9400-05747579f9b1"
}
```

## 🔍 Verification

### Check HAPI FHIR

After uploading, verify the observations were created with the correct patient ID:

```bash
# Get observations for your patient
curl http://localhost:8080/fhir/Observation?subject=Patient/eb2573d0-cafc-4b6a-9400-05747579f9b1

# Get the patient resource
curl http://localhost:8080/fhir/Patient/eb2573d0-cafc-4b6a-9400-05747579f9b1
```

### Check Server Logs

```bash
# Watch OCR logs
docker-compose -f docker-compose.dev.yml logs -f medplum-server | grep OCR
```

You should see:
```
[OCR] Using patient ID: eb2573d0-cafc-4b6a-9400-05747579f9b1
[OCR] Auto-saving vitals to HAPI for patient eb2573d0-cafc-4b6a-9400-05747579f9b1
[OCR] Patient/eb2573d0-cafc-4b6a-9400-05747579f9b1 created in HAPI
[OCR] Saved 4 observation(s) to HAPI
```

## ⚠️ Important Notes

### 1. Patient ID Format
- ✅ Simple IDs: `"1000"`, `"123"`, `"patient-abc"`
- ✅ UUIDs: `"eb2573d0-cafc-4b6a-9400-05747579f9b1"`
- ✅ Any valid FHIR ID format

### 2. Patient Creation
The OCR router automatically creates the patient in HAPI FHIR if it doesn't exist:
- Uses `PUT /Patient/{id}` to ensure the ID matches
- Creates a minimal patient resource
- Safe to call multiple times (idempotent)

### 3. Fallback Behavior
If you don't provide a patient ID:
- Falls back to `DEFAULT_PATIENT_ID = "1000"`
- Useful for testing
- Update `DEFAULT_PATIENT_ID` in `ocr-router.ts` if needed

### 4. DocumentReference
The DocumentReference you mentioned is created by your **frontend** or **Medplum**, not by the OCR router. The OCR router only creates:
- Patient resources in HAPI
- Observation resources in HAPI

## 🐛 Troubleshooting

### Issue: Patient ID still showing as "1000"

**Solution:** Make sure you're sending the patient ID in the request:
```javascript
// ❌ Wrong - missing patientId
formData.append('file', imageFile);

// ✅ Correct - includes patientId
formData.append('file', imageFile);
formData.append('patientId', 'eb2573d0-cafc-4b6a-9400-05747579f9b1');
```

### Issue: Different patient IDs in Medplum vs HAPI

**Solution:** Always use the Medplum patient ID when calling the OCR endpoint:
```javascript
// Get patient from Medplum
const patient = await medplum.readResource('Patient', patientId);

// Use the same ID for OCR
formData.append('patientId', patient.id);
```

### Issue: HAPI returns 404 for patient

**Solution:** The OCR router automatically creates the patient. Check logs:
```bash
docker-compose -f docker-compose.dev.yml logs medplum-server | grep "Patient/"
```

## 📚 Related Documentation

- **[VOLUME-MOUNTING-SUCCESS.md](./VOLUME-MOUNTING-SUCCESS.md)** - Volume mounting verification
- **[DOCKER-DEV-QUICKSTART.md](./DOCKER-DEV-QUICKSTART.md)** - Development quick start
- **OCR Router**: `packages/server/src/ocr-router.ts`

## ✅ Summary

With Option A implemented:
1. ✅ OCR endpoints accept patient ID from requests
2. ✅ Same patient ID used in both Medplum and HAPI FHIR
3. ✅ Works with UUIDs and simple IDs
4. ✅ Automatic patient creation in HAPI
5. ✅ Backward compatible (falls back to "1000")

**Your integration is ready!** 🚀

Update your frontend to include the patient ID in OCR requests, and both systems will use the same patient ID.
