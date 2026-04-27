import { describe, expect, it } from 'vitest';
import {
  detectActiveDesktopContext,
  getFrontmostAppName,
  tryPasteIntoActiveApp,
  trySetFocusedFieldValue,
} from '../desktop-overlay/src/macos-automation';

describe('macOS desktop automation helper', () => {
  it('falls back cleanly when frontmost app detection fails', async () => {
    const result = await getFrontmostAppName(async () => {
      throw new Error('timed out');
    });

    expect(result.appName).toBe('');
    expect(result.error).toContain('timed out');
  });

  it('returns partial desktop context when accessibility detail is unavailable', async () => {
    let callCount = 0;
    const result = await detectActiveDesktopContext(async () => {
      callCount += 1;
      if (callCount === 1) {
        return { stdout: 'TextEdit\n', stderr: '' };
      }
      throw new Error('Accessibility permission missing');
    });

    expect(result.appName).toBe('TextEdit');
    expect(result.automationStatus).toBe('partial');
    expect(result.automationError).toContain('Accessibility permission missing');
  });

  it('reports direct insertion success when accessibility value setting succeeds', async () => {
    const result = await trySetFocusedFieldValue('hello', async () => ({
      stdout: 'set_value||text area',
      stderr: '',
    }));

    expect(result.mode).toBe('set_value');
    expect(result.detail).toContain('text area');
  });

  it('reports unavailable paste automation when keystroke injection fails', async () => {
    const result = await tryPasteIntoActiveApp(async () => {
      throw new Error('not permitted');
    });

    expect(result.mode).toBe('unavailable');
    expect(result.detail).toContain('not permitted');
  });
});
