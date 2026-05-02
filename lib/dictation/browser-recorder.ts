import type { DictationAudioChunkUpload } from '@/types/dictation';

type MediaRecorderLike = {
  isTypeSupported?: (mimeType: string) => boolean;
};

const RECORDER_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
];
const MIN_UPLOAD_CHUNK_BYTES = 512;
const MIN_AUTO_TRANSCRIBE_MS = 4500;
const ACCEPTED_AUDIO_MIME_PREFIXES = [
  'audio/webm',
  'audio/mp4',
  'audio/m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/flac',
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

export async function readBlobBytes(blob: Blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

function hasEbmlHeader(bytes: Uint8Array) {
  return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
}

function hasMp4FileTypeHeader(bytes: Uint8Array) {
  return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
}

export function getBrowserAudioChunkSkipReason(input: {
  bytes: Uint8Array;
  mimeType: string;
}) {
  const normalizedMimeType = input.mimeType.toLowerCase();

  if (!input.bytes.length) {
    return 'empty_audio_chunk';
  }

  if (input.bytes.length < MIN_UPLOAD_CHUNK_BYTES) {
    return 'audio_chunk_too_small';
  }

  if (!ACCEPTED_AUDIO_MIME_PREFIXES.some((prefix) => normalizedMimeType.startsWith(prefix))) {
    return 'unsupported_audio_mime_type';
  }

  if (normalizedMimeType.startsWith('audio/webm') && !hasEbmlHeader(input.bytes)) {
    return 'non_standalone_webm_chunk';
  }

  if ((normalizedMimeType.startsWith('audio/mp4') || normalizedMimeType.startsWith('audio/m4a')) && !hasMp4FileTypeHeader(input.bytes)) {
    return 'non_standalone_mp4_chunk';
  }

  return '';
}

export function buildCumulativeDictationAudioBlob(chunks: Blob[], fallbackMimeType?: string) {
  const lastChunk = chunks[chunks.length - 1];
  return new Blob(chunks, {
    type: lastChunk?.type || fallbackMimeType || 'audio/webm',
  });
}

export function shouldUploadBrowserDictationBlob(input: {
  bytes: Uint8Array;
  mimeType: string;
  elapsedMs: number;
  final: boolean;
  lastUploadedSizeBytes?: number;
}) {
  const skipReason = getBrowserAudioChunkSkipReason({
    bytes: input.bytes,
    mimeType: input.mimeType,
  });

  if (skipReason) {
    return { upload: false, reason: skipReason };
  }

  if (!input.final && input.elapsedMs < MIN_AUTO_TRANSCRIBE_MS) {
    return { upload: false, reason: 'recording_too_short' };
  }

  if (!input.final && input.bytes.length === input.lastUploadedSizeBytes) {
    return { upload: false, reason: 'audio_already_uploaded' };
  }

  return { upload: true, reason: '' };
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
