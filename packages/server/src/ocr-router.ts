// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Router } from 'express';
import multer from 'multer';
import { createWorker } from 'tesseract.js';

export const ocrRouter = Router();

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

    const response = {
      ...vitals,
      // Include raw text so the client can log it for debugging
      _rawText: data.text.substring(0, 500),
    };

    res.json(response);
  } catch (error) {
    console.error('[OCR] Processing failed:', error);
    res.status(500).json({ error: 'OCR processing failed. Please try a clearer image.' });
  }
});

// ─── POST /ocr/save ──────────────────────────────────────────────────────────
// Saves the confirmed vitals to the HAPI FHIR server
ocrRouter.post('/save', async (req, res) => {
  const data = req.body;
  const { patientId } = data;

  if (!patientId) {
    res.status(400).json({ error: 'patientId is required' });
    return;
  }

  const HAPI_URL = 'http://hapi-fhir:8080/fhir'; // Internal docker name since it's on the same network
  // Fallback to localhost if not in docker or if preferred
  const TARGET_URL = process.env.HAPI_FHIR_URL || HAPI_URL;

  console.log(`[OCR] Saving vitals for patient ${patientId} to ${TARGET_URL}`);

  const now = new Date().toISOString();
  const subjectRef = `Patient/${patientId}`;
  const observations = [];

  // Helper to create Observation
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

  if (data.hemoglobin) observations.push(createObs('Hemoglobin', '718-7', data.hemoglobin, 'g/dL'));
  if (data.glucose)    observations.push(createObs('Glucose', '2339-0', data.glucose, 'mg/dL'));
  if (data.heartRate)  observations.push(createObs('Heart Rate', '8867-4', data.heartRate, 'bpm'));

  if (data.systolic || data.diastolic) {
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
        ...(data.systolic ? [{
          code: { coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic' }] },
          valueQuantity: { value: data.systolic, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' }
        }] : []),
        ...(data.diastolic ? [{
          code: { coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic' }] },
          valueQuantity: { value: data.diastolic, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' }
        }] : [])
      ]
    });
  }

  const results = [];
  for (const obs of observations) {
    try {
      const response = await fetch(`${TARGET_URL}/Observation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(obs),
      });
      if (response.ok) {
        results.push(await response.json());
      }
    } catch (err) {
      console.error(`[OCR] Failed to save observation to HAPI:`, err);
    }
  }

  res.json({ success: true, count: results.length, observations: results.map(o => (o as any).id) });
});
