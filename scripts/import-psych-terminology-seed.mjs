import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_SOURCE_FILE = '/Users/danielhale/Desktop/veranote_codex_kit/data/veranote_psychiatry_seed_bundle.json';
const SOURCE_FILE = process.env.VERANOTE_TERM_SOURCE_FILE || DEFAULT_SOURCE_FILE;
const APP_ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const DATA_DIR = path.join(APP_ROOT, 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'psych-psychiatry-terminology.seed.json');

function main() {
  if (!fs.existsSync(SOURCE_FILE)) {
    throw new Error(`Psychiatry terminology source file not found: ${SOURCE_FILE}`);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const bundle = JSON.parse(fs.readFileSync(SOURCE_FILE, 'utf8'));
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');

  const counts = bundle?.metadata?.counts || {};
  console.log(`Wrote ${OUTPUT_FILE}`);
  console.log(
    `Imported terminology seed with ${counts.lexicon_terms ?? 0} lexicon terms, ${counts.abbreviations ?? 0} abbreviations, ${counts.mse_items ?? 0} MSE items, and ${counts.risk_language_items ?? 0} risk-language entries.`,
  );
}

main();
