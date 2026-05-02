import { describe, expect, it } from 'vitest';
import {
  browserRecorderSupported,
  buildCumulativeDictationAudioBlob,
  buildDictationChunkUpload,
  getBrowserAudioChunkSkipReason,
  getPreferredRecorderMimeType,
  readBlobBytes,
  shouldUploadBrowserDictationBlob,
} from '@/lib/dictation/browser-recorder';

function createStandaloneWebmBytes() {
  const bytes = new Uint8Array(1280);
  bytes[0] = 0x1a;
  bytes[1] = 0x45;
  bytes[2] = 0xdf;
  bytes[3] = 0xa3;
  bytes.fill(1, 4);
  return bytes;
}

function createHeaderlessWebmBytes() {
  const bytes = new Uint8Array(1280);
  bytes.fill(2);
  return bytes;
}

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

  it('builds cumulative browser blobs that preserve the first WebM header', async () => {
    const firstSlice = new Blob([createStandaloneWebmBytes()], { type: 'audio/webm;codecs=opus' });
    const secondSlice = new Blob([createHeaderlessWebmBytes()], { type: 'audio/webm;codecs=opus' });

    const rawSecondBytes = await readBlobBytes(secondSlice);
    expect(getBrowserAudioChunkSkipReason({
      bytes: rawSecondBytes,
      mimeType: secondSlice.type,
    })).toBe('non_standalone_webm_chunk');

    const cumulativeBlob = buildCumulativeDictationAudioBlob([firstSlice, secondSlice], 'audio/webm;codecs=opus');
    const cumulativeBytes = await readBlobBytes(cumulativeBlob);

    expect(cumulativeBlob.type).toBe('audio/webm;codecs=opus');
    expect(cumulativeBytes.length).toBe(firstSlice.size + secondSlice.size);
    expect(getBrowserAudioChunkSkipReason({
      bytes: cumulativeBytes,
      mimeType: cumulativeBlob.type,
    })).toBe('');
  });

  it('reports client-side audio skip reasons before upload', () => {
    expect(getBrowserAudioChunkSkipReason({
      bytes: new Uint8Array(),
      mimeType: 'audio/webm',
    })).toBe('empty_audio_chunk');

    expect(getBrowserAudioChunkSkipReason({
      bytes: new Uint8Array(128),
      mimeType: 'audio/webm',
    })).toBe('audio_chunk_too_small');

    expect(getBrowserAudioChunkSkipReason({
      bytes: createStandaloneWebmBytes(),
      mimeType: 'application/octet-stream',
    })).toBe('unsupported_audio_mime_type');
  });

  it('waits for enough audio before auto-uploading batch transcription blobs', () => {
    const bytes = createStandaloneWebmBytes();

    expect(shouldUploadBrowserDictationBlob({
      bytes,
      mimeType: 'audio/webm',
      elapsedMs: 1500,
      final: false,
    })).toMatchObject({ upload: false, reason: 'recording_too_short' });

    expect(shouldUploadBrowserDictationBlob({
      bytes,
      mimeType: 'audio/webm',
      elapsedMs: 5000,
      final: false,
    })).toMatchObject({ upload: true });

    expect(shouldUploadBrowserDictationBlob({
      bytes,
      mimeType: 'audio/webm',
      elapsedMs: 500,
      final: true,
    })).toMatchObject({ upload: true });
  });
});
