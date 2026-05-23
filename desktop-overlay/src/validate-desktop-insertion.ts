import { execFile as execFileCallback, spawn } from 'child_process';
import { promisify } from 'util';
import {
  detectActiveDesktopContext,
  tryPasteIntoActiveApp,
  trySetFocusedFieldValue,
} from './macos-automation';

const execFile = promisify(execFileCallback);

async function copyToClipboard(text: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('pbcopy');
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`pbcopy exited with code ${code}`));
    });
    child.stdin.write(text);
    child.stdin.end();
  });
}

async function main() {
  const text = process.argv.slice(2).join(' ').trim() || 'Desktop dictation validation text.';
  const context = await detectActiveDesktopContext(execFile);
  await copyToClipboard(text);

  let insertion;
  if (context.automationStatus === 'full') {
    insertion = await trySetFocusedFieldValue(text, execFile);
    if (insertion.mode === 'unavailable') {
      const pasted = await tryPasteIntoActiveApp(execFile);
      insertion = pasted.mode === 'paste_keystroke'
        ? pasted
        : {
            mode: 'unavailable',
            detail: `${insertion.detail} Clipboard fallback is ready for manual paste.`,
          };
    }
  } else {
    insertion = {
      mode: 'unavailable' as const,
      detail: 'Accessibility automation is unavailable, so the clipboard was primed for explicit manual paste.',
    };
  }

  process.stdout.write(JSON.stringify({
    context,
    insertion,
    clipboardPrimed: true,
  }, null, 2));
}

void main();
