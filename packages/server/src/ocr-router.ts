// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Router } from 'express';
import multer from 'multer';
import { createWorker } from 'tesseract.js';

export const ocrRouter = Router();

// ─── HAPI FHIR target URL ────────────────────────────────────────────────────
// Uses env var if set (e.g. for Docker), otherwise falls back to localhost.
const HAPI_FHIR_URL = process.env.HAPI_FHIR_URL || 'http://localhost:8080/fhir';

// ─── Hardcoded patient ID ─────────────────────────────────────────────────────
// This is the single patient ID used for all OCR operations
const PATIENT_ID = 'eb2573d0-cafc-4b6a-9400-05747579f9b1';

// ─── Multer: store upload in memory ─────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage() });

// ─── Text normalisation ──────────────────────────────────────────────────────
function normaliseText(raw: string): string {
  return raw
    .replace(/\|/g, '1')     // pipe → 1 (common Tesseract OCR artefact)
    .replace(/\s+/g, ' ')    // collapse whitespace / newlines
    .toLowerCase()
    .trim();
}

// ─── Safe keyword-based numeric extractor ───────────────────────────────────
// Pattern: keyword  [optional (units)]  [: or -]  number
function extract(text: string, keywordPattern: string, isFloat = false): number | null {
  const re = new RegExp(
    `${keywordPattern}\\s*(?:\\([^)]*\\))?\\s*[:\\-]?\\s*([0-9]+(?:\\.[0-9]+)?)`,
    'i'
  );
  const m = text.match(re);
  if (!m) return null;
  const v = isFloat ? parseFloat(m[1]) : parseInt(m[1], 10);
  return isNaN(v) ? null : v;
}

// ─── Validation guards (physiologically plausible ranges) ───────────────────
const validate = {
  hemoglobin: (v: number | null): number | null => (v != null && v >= 3   && v <= 25)  ? v : null,
  glucose:    (v: number | null): number | null => (v != null && v >= 40  && v <= 600) ? v : null,
  heart_rate: (v: number | null): number | null => (v != null && v >= 30  && v <= 250) ? v : null,
  systolic:   (v: number | null): number | null => (v != null && v >= 60  && v <= 300) ? v : null,
  diastolic:  (v: number | null): number | null => (v != null && v >= 30  && v <= 200) ? v : null,
};

// ─── Core parser ─────────────────────────────────────────────────────────────
interface ParsedVitals {
  hemoglobin: number | null;
  glucose:    number | null;
  heartRate:  number | null;
  systolic:   number | null;
  diastolic:  number | null;
}

function parseVitals(rawText: string): ParsedVitals {
  const t = normaliseText(rawText);

  console.log('[OCR] Normalised text:', t.substring(0, 300));

  // Hemoglobin: "hemoglobin (g/dl) 13.2"  "hb: 13.5"  "hgb 13"
  const hemoglobin = validate.hemoglobin(
    extract(t, '(?:hemoglobin|haemoglobin|hgb|hb)', true)
  );

  // Glucose: "glucose (mg/dl) 110"  "blood sugar: 110"
  const glucose = validate.glucose(
    extract(t, '(?:glucose|blood\\s*sugar|sugar)', false)
  );

  // Heart rate: "heart rate (bpm) 78"  "hr: 72"  "pulse 72"  fallback "78 bpm"
  let heart_rate = validate.heart_rate(
    extract(t, '(?:heart\\s*rate|pulse|hr)', false)
  );
  if (heart_rate === null) {
    const bpmFallback = t.match(/([0-9]{2,3})\s*bpm/i);
    if (bpmFallback) {
      heart_rate = validate.heart_rate(parseInt(bpmFallback[1], 10));
    }
  }

  // Blood pressure: "120/80"  "bp: 120 / 80"  "blood pressure (mmhg) 120/80"
  const bpMatch = t.match(/([0-9]{2,3})\s*\/\s*([0-9]{2,3})/);
  const systolic  = bpMatch ? validate.systolic(parseInt(bpMatch[1],  10)) : null;
  const diastolic = bpMatch ? validate.diastolic(parseInt(bpMatch[2], 10)) : null;

  const result: ParsedVitals = {
    hemoglobin,
    glucose,
    heartRate: heart_rate,   // camelCase for frontend
    systolic,
    diastolic,
  };

  console.log('[OCR] Parsed values:', JSON.stringify(result));
  return result;
}

// ─── POST /ocr/upload ────────────────────────────────────────────────────────
ocrRouter.post('/upload', upload.single('file'), async (req, res) => {
  console.log('[OCR] Upload received');

  if (!req.file) {
    res.status(400).json({ error: 'No image file provided. Send multipart/form-data with field "file".' });
    return;
  }

  console.log(`[OCR] Using hardcoded patient ID: ${PATIENT_ID}`);
  console.log(`[OCR] File: ${req.file.originalname ?? 'unknown'}, size: ${req.file.size} bytes, type: ${req.file.mimetype}`);

  let imageBuffer = req.file.buffer;

  // Optional: attempt sharp preprocessing (greyscale + normalise) for better Tesseract accuracy.
  // Gracefully skipped if sharp is not installed.
  try {
    // Dynamic import so the server starts even without sharp
    const sharp = (await import('sharp')).default;
    const meta  = await sharp(imageBuffer).metadata();
    const w = (meta.width  || 800) * 2;
    const h = (meta.height || 600) * 2;
    imageBuffer = await sharp(imageBuffer)
      .resize(w, h, { kernel: 'lanczos3' })
      .greyscale()
      .normalise()
      .sharpen()
      .toFormat('png')
      .toBuffer();
    console.log('[OCR] Image preprocessed with sharp');
  } catch {
    console.log('[OCR] sharp not available — using raw buffer (install sharp for better accuracy)');
  }

  try {
    const worker = await createWorker('eng');

    // OEM 1 = LSTM only (most accurate), PSM 6 = uniform text block
    await worker.setParameters({
      tessedit_ocr_engine_mode: '1' as any,
      tessedit_pageseg_mode:    '6' as any,
    });

    const { data } = await worker.recognize(imageBuffer);
    await worker.terminate();

    console.log('[OCR] Text extracted, length:', data.text.length);

    const vitals = parseVitals(data.text);

    // ── Auto-save to HAPI FHIR with hardcoded patient ID ─────────────────────
    console.log(`[OCR] Auto-saving vitals to HAPI for patient ${PATIENT_ID}`);
    const savedObservations = await saveVitalsToHapi(vitals, PATIENT_ID);
    console.log(`[OCR] Saved ${savedObservations.length} observation(s) to HAPI`);

    res.json({
      ...vitals,
      patientId: PATIENT_ID,
      saved: true,
      savedCount: savedObservations.length,
      savedIds: savedObservations.map((o: any) => o.id),
      // Include raw text so the client can log it for debugging
      _rawText: data.text.substring(0, 500),
    });
  } catch (error) {
    console.error('[OCR] Processing failed:', error);
    res.status(500).json({ error: 'OCR processing failed. Please try a clearer image.' });
  }
});

// ─── Ensure patient exists in HAPI (upsert via PUT) ─────────────────────────
async function ensurePatientInHapi(patientId: string): Promise<void> {
  const url = `${HAPI_FHIR_URL}/Patient/${patientId}`;
  try {
    // Check if patient already exists
    const check = await fetch(url, { headers: { Accept: 'application/json' } });
    if (check.ok) {
      console.log(`[OCR] Patient/${patientId} already exists in HAPI`);
      return;
    }
    // Patient not found — create it via PUT so we keep the same ID
    console.log(`[OCR] Patient/${patientId} not found in HAPI — creating...`);
    const create = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resourceType: 'Patient',
        id: patientId,
        name: [{ text: `Patient ${patientId}` }],
      }),
    });
    if (create.ok) {
      console.log(`[OCR] Patient/${patientId} created in HAPI`);
    } else {
      const err = await create.text();
      console.error(`[OCR] Failed to create Patient/${patientId} in HAPI:`, err);
    }
  } catch (err) {
    console.error(`[OCR] Network error while upserting Patient/${patientId}:`, err);
  }
}

// ─── Shared helper: build & POST observations to HAPI FHIR ───────────────────
async function saveVitalsToHapi(vitals: ParsedVitals, patientId: string): Promise<any[]> {
  console.log(`[OCR] saveVitalsToHapi → ${HAPI_FHIR_URL}, patient: ${patientId}`);

  // Always ensure the patient exists in HAPI before saving observations
  await ensurePatientInHapi(patientId);

  const now = new Date().toISOString();
  const subjectRef = `Patient/${patientId}`;
  const observations: any[] = [];

  // Helper to create a simple scalar Observation
  const createObs = (name: string, loinc: string, val: number, unit: string) => ({
    resourceType: 'Observation',
    status: 'final',
    code: {
      coding: [{ system: 'http://loinc.org', code: loinc, display: name }],
      text: name,
    },
    subject: { reference: subjectRef },
    effectiveDateTime: now,
    valueQuantity: { value: val, unit, system: 'http://unitsofmeasure.org', code: unit },
  });

  if (vitals.hemoglobin) observations.push(createObs('Hemoglobin', '718-7', vitals.hemoglobin, 'g/dL'));
  if (vitals.glucose)    observations.push(createObs('Glucose', '2339-0', vitals.glucose, 'mg/dL'));
  if (vitals.heartRate)  observations.push(createObs('Heart Rate', '8867-4', vitals.heartRate, '/min'));

  if (vitals.systolic || vitals.diastolic) {
    observations.push({
      resourceType: 'Observation',
      status: 'final',
      code: {
        coding: [{ system: 'http://loinc.org', code: '55284-4', display: 'Blood Pressure' }],
        text: 'Blood Pressure',
      },
      subject: { reference: subjectRef },
      effectiveDateTime: now,
      component: [
        ...(vitals.systolic ? [{
          code: { coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic BP' }] },
          valueQuantity: { value: vitals.systolic, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' }
        }] : []),
        ...(vitals.diastolic ? [{
          code: { coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic BP' }] },
          valueQuantity: { value: vitals.diastolic, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' }
        }] : [])
      ]
    });
  }

  const results: any[] = [];
  for (const obs of observations) {
    try {
      const response = await fetch(`${HAPI_FHIR_URL}/Observation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(obs),
      });
      const body = await response.json();
      if (response.ok) {
        console.log(`[OCR] Saved observation: ${body.id} (${obs.code?.text})`);
        results.push(body);
      } else {
        console.error(`[OCR] HAPI rejected observation (${obs.code?.text}):`, JSON.stringify(body));
      }
    } catch (err) {
      console.error(`[OCR] Network error saving to HAPI (${obs.code?.text}):`, err);
    }
  }

  return results;
}

// ─── POST /ocr/save ──────────────────────────────────────────────────────────
// Manual save endpoint — uses hardcoded PATIENT_ID
ocrRouter.post('/save', async (req, res) => {
  const data = req.body;

  console.log(`[OCR] /save called for hardcoded patient ${PATIENT_ID}`);
  console.log(`[OCR] Vitals received:`, JSON.stringify({
    hemoglobin: data.hemoglobin,
    glucose: data.glucose,
    heartRate: data.heartRate,
    systolic: data.systolic,
    diastolic: data.diastolic,
  }));

  const vitals: ParsedVitals = {
    hemoglobin: data.hemoglobin ?? null,
    glucose:    data.glucose    ?? null,
    heartRate:  data.heartRate  ?? null,
    systolic:   data.systolic   ?? null,
    diastolic:  data.diastolic  ?? null,
  };

  const hasAnyVital = Object.values(vitals).some(v => v !== null);
  if (!hasAnyVital) {
    res.status(400).json({ error: 'No valid vitals found in request body', received: data });
    return;
  }

  const results = await saveVitalsToHapi(vitals, PATIENT_ID);
  res.json({
    success: results.length > 0,
    patientId: PATIENT_ID,
    hapiUrl: HAPI_FHIR_URL,
    count: results.length,
    savedIds: results.map((o: any) => o.id),
    warning: results.length === 0 ? 'No observations were saved — check server logs for [OCR] HAPI errors' : undefined,
  });
});

// ─── GET /ocr/debug ───────────────────────────────────────────────────────────
// Diagnostic: tests HAPI connectivity, patient upsert, and observation POST
ocrRouter.get('/debug', async (_req, res) => {
  const report: Record<string, any> = { hapiUrl: HAPI_FHIR_URL };

  // Step 1: Can we reach HAPI at all?
  try {
    const ping = await fetch(`${HAPI_FHIR_URL}/metadata`, { headers: { Accept: 'application/json' } });
    report.hapiReachable = ping.ok;
    report.hapiStatus = ping.status;
  } catch (err: any) {
    report.hapiReachable = false;
    report.hapiError = err.message;
    res.json(report);
    return;
  }

  // Step 2: Can we create/upsert a patient?
  const testPatientId = 'debug-test-patient';
  try {
    const p = await fetch(`${HAPI_FHIR_URL}/Patient/${testPatientId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resourceType: 'Patient', id: testPatientId, name: [{ text: 'Debug Test' }] }),
    });
    report.patientUpsert = { status: p.status, ok: p.ok };
    if (!p.ok) report.patientUpsertError = await p.text();
  } catch (err: any) {
    report.patientUpsert = { ok: false, error: err.message };
  }

  // Step 3: Can we post an Observation?
  try {
    const obs = {
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '718-7', display: 'Hemoglobin' }], text: 'Hemoglobin' },
      subject: { reference: `Patient/${testPatientId}` },
      effectiveDateTime: new Date().toISOString(),
      valueQuantity: { value: 13.5, unit: 'g/dL', system: 'http://unitsofmeasure.org', code: 'g/dL' },
    };
    const o = await fetch(`${HAPI_FHIR_URL}/Observation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(obs),
    });
    const body = await o.json();
    report.observationPost = { status: o.status, ok: o.ok, id: (body as any).id };
    if (!o.ok) report.observationPostError = body;
  } catch (err: any) {
    report.observationPost = { ok: false, error: err.message };
  }

  report.verdict = report.hapiReachable && report.patientUpsert?.ok && report.observationPost?.ok
    ? '✅ All checks passed — HAPI is working correctly'
    : '❌ One or more checks failed — see details above';

  res.json(report);
});

