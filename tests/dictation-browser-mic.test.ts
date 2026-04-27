import { describe, expect, it } from 'vitest';
import {
  browserDictationSupported,
  getBrowserDictationErrorMessage,
  getBrowserDictationCaptureState,
  requestBrowserDictationStream,
  setBrowserDictationStreamPaused,
  stopBrowserDictationStream,
} from '@/lib/dictation/browser-mic';

function createTrack() {
  return {
    enabled: true,
    readyState: 'live',
    stopped: false,
    stop() {
      this.stopped = true;
      this.readyState = 'ended';
    },
  };
}

function createStream() {
  const audioTrack = createTrack();
  return {
    getTracks: () => [audioTrack],
    getAudioTracks: () => [audioTrack],
  } as unknown as MediaStream;
}

describe('browser mic helpers', () => {
  it('detects browser support from mediaDevices', () => {
    expect(browserDictationSupported({ getUserMedia: async () => createStream() })).toBe(true);
    expect(browserDictationSupported({})).toBe(false);
  });

  it('pauses and stops tracks safely', () => {
    const stream = createStream();
    const [track] = stream.getAudioTracks() as unknown as Array<ReturnType<typeof createTrack>>;

    setBrowserDictationStreamPaused(stream, true);
    expect(track.enabled).toBe(false);

    setBrowserDictationStreamPaused(stream, false);
    expect(track.enabled).toBe(true);

    stopBrowserDictationStream(stream);
    expect(track.stopped).toBe(true);
  });

  it('derives capture state from support, permission, and stream status', () => {
    const stream = createStream();

    expect(getBrowserDictationCaptureState({
      supported: false,
      stream: null,
      paused: false,
      requestingPermission: false,
    })).toBe('unsupported');

    expect(getBrowserDictationCaptureState({
      supported: true,
      stream,
      paused: false,
      requestingPermission: false,
    })).toBe('capturing');

    expect(getBrowserDictationCaptureState({
      supported: true,
      stream,
      paused: true,
      requestingPermission: false,
    })).toBe('paused');
  });

  it('maps browser microphone failures to clearer user-facing guidance', async () => {
    expect(getBrowserDictationErrorMessage(new DOMException('', 'NotAllowedError'))).toContain('denied');
    expect(getBrowserDictationErrorMessage(new DOMException('', 'NotFoundError'))).toContain('No microphone');
    expect(getBrowserDictationErrorMessage(new DOMException('', 'NotReadableError'))).toContain('unavailable');
    expect(getBrowserDictationErrorMessage(new Error('custom failure'))).toBe('custom failure');
    expect(getBrowserDictationErrorMessage(new Error(''), { secureContext: false })).toContain('secure browser context');

    await expect(requestBrowserDictationStream({
      getUserMedia: async () => {
        throw new DOMException('', 'NotAllowedError');
      },
    })).rejects.toThrow('Microphone access was denied');
  });
});
