import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DEFAULT_SOURCE_FILE = '/Users/danielhale/Desktop/veranote_diagnosis_pack.zip';
const SOURCE_FILE = process.env.VERANOTE_DIAGNOSIS_SOURCE_FILE || DEFAULT_SOURCE_FILE;
const APP_ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const DATA_DIR = path.join(APP_ROOT, 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'psych-psychiatry-diagnosis.seed.json');
const TMP_DIR = path.join(APP_ROOT, '.tmp-diagnosis-import');

function main() {
  if (!fs.existsSync(SOURCE_FILE)) {
    throw new Error(`Psychiatry diagnosis source file not found: ${SOURCE_FILE}`);
  }

  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });

  execFileSync('unzip', ['-q', SOURCE_FILE, '-d', TMP_DIR]);

  const extractedDir = path.join(TMP_DIR, 'veranote_diagnosis_pack');
  const bundleFile = path.join(extractedDir, 'veranote_psychiatry_diagnosis_seed_bundle.json');

  if (!fs.existsSync(bundleFile)) {
    throw new Error(`Diagnosis seed bundle not found inside zip: ${bundleFile}`);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const bundle = JSON.parse(fs.readFileSync(bundleFile, 'utf8'));
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${OUTPUT_FILE}`);
  console.log(
    `Imported diagnosis seed with ${bundle?.taxonomy?.length ?? 0} taxonomy categories, ${bundle?.diagnoses?.length ?? 0} diagnoses, ${bundle?.timeframe_rules?.length ?? 0} timeframe rules, and ${bundle?.terms_to_avoid?.length ?? 0} diagnosis caution terms.`,
  );
}

main();
