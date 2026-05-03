import esbuild from 'esbuild';
import fs from 'fs';
import { builtinModules } from 'module';

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const allDeps = Object.keys(pkg.dependencies || {});

// Dependencies that are already present in the official medplum/medplum-server image
// OR that we prefer to keep as external to avoid complex bundling issues (like tesseract.js worker paths)
const standardDeps = [
  'express', 'cors', 'compression', 'body-parser', 'pg', 'redis', 'bullmq', 'bcrypt',
  'jose', 'zod', 'ws', 'nodemailer', 'pdfmake', 'jszip', 'dotenv', 'cookie-parser',
  'validator', 'semver', 'uuid', 'bowser', 'hibp', 'otplib', 'qrcode',
  'rate-limiter-flexible', 'rfc6902', 'temporal-polyfill', 'winston',
  'node-fetch', 'sharp', 'tesseract.js'
];

const external = [
  ...builtinModules,
  ...builtinModules.map(m => `node:${m}`),
  ...allDeps.filter(d => 
    standardDeps.includes(d) || 
    d.startsWith('@medplum/') || 
    d.startsWith('@aws-sdk/') || 
    d.startsWith('@azure/') || 
    d.startsWith('@google-cloud/') || 
    d.startsWith('@opentelemetry/') ||
    d.startsWith('@smithy/')
  )
];

const options = {
  entryPoints: ['./src/index.ts', './src/otel/instrumentation.ts'],
  bundle: true,
  platform: 'node',
  loader: { '.ts': 'ts' },
  resolveExtensions: ['.ts', '.js', '.json', '.mjs'],
  target: 'node22',
  tsconfig: 'tsconfig.json',
  minify: false,
  sourcemap: true,
  external: external,
  format: 'esm',
  outdir: './dist',
  banner: {
    js: `
import { createRequire as __createRequire } from 'module';
import { fileURLToPath as __fileURLToPath } from 'url';
import { dirname as __dirname_func } from 'path';
const require = __createRequire(import.meta.url);
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirname_func(__filename);
`,
  },
};

esbuild
  .build(options)
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
