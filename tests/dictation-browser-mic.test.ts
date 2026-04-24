import { describe, expect, it } from 'vitest';
import {
  browserDictationSupported,
  getBrowserDictationCaptureState,
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
});
