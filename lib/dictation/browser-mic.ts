import type { DictationCaptureState } from '@/types/dictation';

type MediaDevicesLike = {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
};

export function browserDictationSupported(mediaDevices?: MediaDevicesLike | null) {
  return typeof mediaDevices?.getUserMedia === 'function';
}

export function getBrowserDictationErrorMessage(error: unknown, options?: { secureContext?: boolean }) {
  if (options?.secureContext === false) {
    return 'Microphone capture needs a secure browser context. Open Veranote on localhost in Chrome or Edge and try again.';
  }

  const errorName = typeof error === 'object' && error && 'name' in error
    ? String((error as { name?: unknown }).name)
    : '';

  switch (errorName) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'Microphone access was denied. Allow microphone access for this browser tab and try again.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No microphone was found on this device. Connect a microphone and try again.';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'The microphone is unavailable right now. Another app may already be using it.';
    default:
      if (error instanceof Error && error.message.trim()) {
        return error.message;
      }
      return 'Unable to access the microphone.';
  }
}

export async function requestBrowserDictationStream(
  mediaDevices?: MediaDevicesLike | null,
  options?: { secureContext?: boolean },
) {
  if (!browserDictationSupported(mediaDevices)) {
    throw new Error('Microphone capture is not available in this browser.');
  }

  try {
    return await mediaDevices!.getUserMedia!({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  } catch (error) {
    throw new Error(getBrowserDictationErrorMessage(error, options));
  }
}

export function stopBrowserDictationStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => {
    track.stop();
  });
}

export function setBrowserDictationStreamPaused(stream: MediaStream | null | undefined, paused: boolean) {
  stream?.getAudioTracks().forEach((track) => {
    track.enabled = !paused;
  });
}

export function getBrowserDictationCaptureState(input: {
  supported: boolean;
  stream: MediaStream | null;
  paused: boolean;
  requestingPermission: boolean;
  error?: string;
}): DictationCaptureState {
  if (!input.supported) {
    return 'unsupported';
  }

  if (input.error) {
    return 'error';
  }

  if (input.requestingPermission) {
    return 'requesting_permission';
  }

  if (!input.stream) {
    return 'idle';
  }

  if (input.paused) {
    return 'paused';
  }

  const liveTrack = input.stream.getAudioTracks().some((track) => track.readyState === 'live' && track.enabled);
  return liveTrack ? 'capturing' : 'ready';
}
