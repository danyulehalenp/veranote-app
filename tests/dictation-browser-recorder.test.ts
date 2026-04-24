import { describe, expect, it } from 'vitest';
import {
  browserRecorderSupported,
  buildDictationChunkUpload,
  getPreferredRecorderMimeType,
} from '@/lib/dictation/browser-recorder';

describe('browser recorder helpers', () => {
  it('detects recorder support and preferred mime type', () => {
    const mediaRecorder = {
      isTypeSupported: (mimeType: string) => mimeType === 'audio/webm;codecs=opus',
    };

    expect(browserRecorderSupported(mediaRecorder)).toBe(true);
    expect(getPreferredRecorderMimeType(mediaRecorder)).toBe('audio/webm;codecs=opus');
    expect(browserRecorderSupported(null)).toBe(false);
  });

  it('builds a backend chunk payload from a blob', async () => {
    const blob = new Blob(['hello-audio'], { type: 'audio/webm' });
    const payload = await buildDictationChunkUpload({
      blob,
      sessionId: 'dictation-session-1',
      sequence: 4,
      capturedAt: '2026-04-23T00:00:00.000Z',
    });

    expect(payload.sessionId).toBe('dictation-session-1');
    expect(payload.sequence).toBe(4);
    expect(payload.mimeType).toBe('audio/webm');
    expect(payload.sizeBytes).toBe(blob.size);
    expect(payload.base64Audio.length).toBeGreaterThan(0);
  });
});
