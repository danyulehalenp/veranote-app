import type { DictationCaptureState } from '@/types/dictation';

type MediaDevicesLike = {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
};

export function browserDictationSupported(mediaDevices?: MediaDevicesLike | null) {
  return typeof mediaDevices?.getUserMedia === 'function';
}

export async function requestBrowserDictationStream(mediaDevices?: MediaDevicesLike | null) {
  if (!browserDictationSupported(mediaDevices)) {
    throw new Error('Microphone capture is not available in this browser.');
  }

  return mediaDevices!.getUserMedia!({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
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
