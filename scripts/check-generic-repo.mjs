import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage']);
const ignoredFiles = new Set(['package-lock.json', 'check-generic-repo.mjs']);
const allowedSourceUrlFiles = new Set(['src/data/adapters/google-sheets.ts']);

// Keep this list specific to the source project. Add a term before importing
// any material from an adopter's repository; do not use this as a general PII scanner.
const forbidden = [
  { label: 'WDS name', pattern: /women\s*(developers?|devs?)\s*(sg|singapore)?/i },
  { label: 'WDS abbreviation', pattern: /\bwds\b/i },
  { label: 'source owner name', pattern: /\bzawanah\b/i },
  { label: 'Google Sheets document URL', pattern: /docs\.google\.com\/spreadsheets\/d\//i },
  { label: 'configured Google Sheets ID', pattern: /^VITE_GOOGLE_SHEET_ID=(?!replace_with_your_sheet_id\s*$).+/m },
];

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return ignoredDirectories.has(entry.name) ? [] : filesIn(path);
    return ignoredFiles.has(entry.name) ? [] : [path];
  }));
  return nested.flat();
}

const findings = [];
for (const file of await filesIn(root)) {
  const content = await readFile(file, 'utf8');
  const path = relative(root, file).replaceAll('\\', '/');
  for (const { label, pattern } of forbidden) {
    if (label === 'Google Sheets document URL' && allowedSourceUrlFiles.has(path)) continue;
    if (pattern.test(content)) findings.push(`${path}: ${label}`);
  }
}

if (findings.length) {
  console.error('Generic repository scan failed:\n' + findings.map((finding) => `- ${finding}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Generic repository scan passed: no WDS names or configured source identifiers found.');
}
