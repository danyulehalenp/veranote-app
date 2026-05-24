import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertIncludes(fileLabel, source, expected) {
  if (!source.includes(expected)) {
    throw new Error(`${fileLabel} is missing required text: ${expected}`);
  }
}

const html = read('renderer/index.html');
const renderer = read('renderer/overlay.js');
const styles = read('renderer/overlay.css');
const preload = read('src/preload.ts');
const main = read('src/main.ts');
const adapters = read('src/target-adapters.ts');

[
  'Mini Veranote',
  'EHR Transfer Dock',
  'copy-transfer-section',
  'paste-transfer-section',
  'mark-transfer-done',
  'ehr-target',
].forEach((expected) => assertIncludes('renderer/index.html', html, expected));

[
  'copyTransferSection',
  'pasteTransferSection',
  'setCompactMode',
  'hideWindow',
].forEach((expected) => assertIncludes('src/preload.ts', preload, expected));

[
  'overlay:copy-transfer-section',
  'overlay:paste-transfer-section',
  'overlay:set-compact-mode',
  'overlay:hide-window',
  'explicit provider click',
].forEach((expected) => assertIncludes('src/main.ts', main, expected));

[
  'wellsky',
  'tebra',
  'epic',
  'athena',
  'valant',
  'therapynotes',
  'simplepractice',
  'icanotes',
  'generic',
  'NOTE_PACKAGES',
].forEach((expected) => assertIncludes('renderer/overlay.js', renderer, expected));

[
  '-webkit-app-region: drag',
  '.section-tab.active',
  '.is-compact',
  '.transfer-card',
].forEach((expected) => assertIncludes('renderer/overlay.css', styles, expected));

[
  'epic-browser',
  'athena-browser',
  'valant-browser',
  'icanotes-browser',
].forEach((expected) => assertIncludes('src/target-adapters.ts', adapters, expected));

console.log(JSON.stringify({
  ok: true,
  checked: [
    'renderer/index.html',
    'renderer/overlay.js',
    'renderer/overlay.css',
    'src/preload.ts',
    'src/main.ts',
    'src/target-adapters.ts',
  ],
  message: 'Mini Veranote transfer dock wiring is present and provider-controlled.',
}, null, 2));
