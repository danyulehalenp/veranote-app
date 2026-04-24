import type { DictationAudioChunkUpload } from '@/types/dictation';

type MediaRecorderLike = {
  isTypeSupported?: (mimeType: string) => boolean;
};

const RECORDER_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
];

export function browserRecorderSupported(recorder?: MediaRecorderLike | null) {
  return Boolean(recorder);
}

export function getPreferredRecorderMimeType(recorder?: MediaRecorderLike | null) {
  if (!recorder?.isTypeSupported) {
    return '';
  }

  return RECORDER_MIME_CANDIDATES.find((mimeType) => recorder.isTypeSupported?.(mimeType)) || '';
}

export async function encodeBlobToBase64(blob: Blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }

  return Buffer.from(binary, 'binary').toString('base64');
}

export async function buildDictationChunkUpload(input: {
  blob: Blob;
  sessionId: string;
  sequence: number;
  capturedAt: string;
}): Promise<DictationAudioChunkUpload> {
  return {
    sessionId: input.sessionId,
    sequence: input.sequence,
    base64Audio: await encodeBlobToBase64(input.blob),
    mimeType: input.blob.type || 'application/octet-stream',
    sizeBytes: input.blob.size,
    capturedAt: input.capturedAt,
  };
}
