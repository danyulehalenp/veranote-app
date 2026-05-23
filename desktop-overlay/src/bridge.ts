type OverlayBridgeConfig = {
  appBaseUrl: string;
  providerId: string;
  desktopBridgeKey?: string;
};

type OverlayProviderStatus = {
  providerId: string;
  providerLabel: string;
  available: boolean;
  engineLabel: string;
  reason: string;
};

type OverlaySelection = {
  requestedProvider?: string;
  activeProvider?: string;
  activeProviderLabel?: string;
  engineLabel?: string;
  fallbackApplied?: boolean;
  fallbackReason?: string;
  reason?: string;
};

type OverlayCommand = {
  id: string;
  label: string;
  spokenPhrases: string[];
  action: string;
  scope: string;
  description: string;
  outputText?: string;
};

type OverlayWorkflowProfile = {
  destination: string;
  destinationLabel: string;
  speechBoxMode: 'floating-source-box' | 'floating-field-box';
  supportsDirectFieldInsertion: boolean;
  directFieldGuidance: string;
  fieldTargets: Array<{
    id: string;
    label: string;
    note: string;
  }>;
};

type OverlayTranscriptSegment = {
  id: string;
  dictationSessionId: string;
  encounterId: string;
  noteId?: string;
  targetSection?: string;
  text: string;
  normalizedText?: string;
  isFinal: boolean;
  confidence?: number;
  startMs?: number;
  endMs?: number;
  speakerLabel?: string;
  reviewStatus: string;
  reviewFlags: Array<{
    flagType: string;
    severity: string;
    matchedText: string;
    message: string;
    suggestedAction?: string;
  }>;
  insertedTransactionId?: string;
  source: {
    provider: string;
    modelOrEngine?: string;
    mode: string;
    vendorSegmentId?: string;
  };
  createdAt: string;
};

function getOverlayBridgeConfig(): OverlayBridgeConfig {
  return {
    appBaseUrl: process.env.VERANOTE_APP_BASE_URL || 'http://127.0.0.1:3000',
    providerId: process.env.VERANOTE_PROVIDER_ID || 'provider_default',
    desktopBridgeKey: process.env.DICTATION_DESKTOP_BRIDGE_KEY,
  };
}

async function bridgeFetch(pathname: string, init?: RequestInit) {
  const config = getOverlayBridgeConfig();
  const headers = new Headers(init?.headers || {});
  headers.set('Content-Type', 'application/json');
  if (config.desktopBridgeKey) {
    headers.set('x-veranote-desktop-key', config.desktopBridgeKey);
  }

  return fetch(`${config.appBaseUrl}${pathname}`, {
    ...init,
    headers,
  });
}

export async function fetchOverlayProviderStatus() {
  const config = getOverlayBridgeConfig();
  const response = await bridgeFetch(`/api/dictation/providers?providerId=${encodeURIComponent(config.providerId)}`);
  const payload = await response.json() as {
    providers?: OverlayProviderStatus[];
    defaultSelection?: OverlaySelection;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || 'Unable to load overlay provider status.');
  }

  return payload;
}

export async function fetchOverlayCommandLibrary() {
  const config = getOverlayBridgeConfig();
  const response = await bridgeFetch(`/api/settings/provider?providerId=${encodeURIComponent(config.providerId)}`);
  const payload = await response.json() as {
    settings?: {
      dictationCommands?: OverlayCommand[];
    };
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || 'Unable to load overlay command library.');
  }

  return payload.settings?.dictationCommands || [];
}

export async function fetchOverlayWorkflowProfile() {
  const config = getOverlayBridgeConfig();
  const response = await bridgeFetch(`/api/settings/provider?providerId=${encodeURIComponent(config.providerId)}`);
  const payload = await response.json() as {
    workflowProfile?: OverlayWorkflowProfile;
    error?: string;
  };

  if (!response.ok || !payload.workflowProfile) {
    throw new Error(payload.error || 'Unable to load overlay workflow profile.');
  }

  return payload.workflowProfile;
}

export async function startOverlayDictationSession(input: {
  encounterId: string;
  noteId?: string;
  targetSection?: string;
  requestedProviderId: string;
  allowMockFallback: boolean;
}) {
  const config = getOverlayBridgeConfig();
  const response = await bridgeFetch('/api/dictation/sessions', {
    method: 'POST',
    body: JSON.stringify({
      providerId: config.providerId,
      encounterId: input.encounterId,
      noteId: input.noteId,
      targetSection: input.targetSection,
      mode: 'provider_dictation',
      sttProvider: input.requestedProviderId,
      allowMockFallback: input.allowMockFallback,
      language: 'en',
      commitMode: 'manual_accept',
    }),
  });
  const payload = await response.json() as {
    session?: {
      sessionId: string;
      activeProviderLabel?: string;
      engineLabel?: string;
      fallbackApplied?: boolean;
      fallbackReason?: string;
      reason?: string;
    };
    error?: string;
  };

  if (!response.ok || !payload.session) {
    throw new Error(payload.error || 'Unable to start overlay dictation session.');
  }

  return payload.session;
}

export async function stopOverlayDictationSession(sessionId: string) {
  const config = getOverlayBridgeConfig();
  const response = await bridgeFetch(`/api/dictation/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    body: JSON.stringify({
      providerId: config.providerId,
      action: 'stop',
      reason: 'provider_stopped',
    }),
  });
  const payload = await response.json() as { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || 'Unable to stop overlay dictation session.');
  }

  return true;
}

export async function fetchOverlaySessionState(sessionId: string) {
  const config = getOverlayBridgeConfig();
  const response = await bridgeFetch(
    `/api/dictation/sessions/${encodeURIComponent(sessionId)}?providerId=${encodeURIComponent(config.providerId)}`,
    { method: 'GET' },
  );
  const payload = await response.json() as {
    session?: {
      status?: string;
      activeProviderLabel?: string;
      engineLabel?: string;
      fallbackApplied?: boolean;
      fallbackReason?: string;
      providerReason?: string;
      queuedTranscriptEventCount?: number;
      receivedAudioChunkCount?: number;
    };
    error?: string;
  };

  if (!response.ok || !payload.session) {
    throw new Error(payload.error || 'Unable to load overlay session state.');
  }

  return payload.session;
}

export async function uploadOverlayAudioChunk(input: {
  sessionId: string;
  chunk: {
    sessionId: string;
    sequence: number;
    base64Audio: string;
    mimeType: string;
    sizeBytes: number;
    capturedAt: string;
  };
}) {
  const config = getOverlayBridgeConfig();
  const response = await bridgeFetch(`/api/dictation/sessions/${encodeURIComponent(input.sessionId)}`, {
    method: 'POST',
    body: JSON.stringify({
      providerId: config.providerId,
      action: 'upload_chunk',
      chunk: input.chunk,
    }),
  });
  const payload = await response.json() as {
    ingestion?: {
      receivedAudioChunkCount?: number;
      receivedAudioBytes?: number;
      queuedEventCount?: number;
    };
    error?: string;
  };

  if (!response.ok || !payload.ingestion) {
    throw new Error(payload.error || 'Unable to upload overlay audio chunk.');
  }

  return payload.ingestion;
}

export async function pullOverlayTranscriptEvents(sessionId: string) {
  const config = getOverlayBridgeConfig();
  const response = await bridgeFetch(`/api/dictation/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    body: JSON.stringify({
      providerId: config.providerId,
      action: 'pull_events',
    }),
  });
  const payload = await response.json() as {
    transcriptEvents?: OverlayTranscriptSegment[];
    error?: string;
  };

  if (!response.ok || !Array.isArray(payload.transcriptEvents)) {
    throw new Error(payload.error || 'Unable to load overlay transcript events.');
  }

  return payload.transcriptEvents;
}

export async function commitOverlayTranscriptSegment(input: {
  sessionId: string;
  segment: OverlayTranscriptSegment;
  draftId?: string;
  destinationMode?: 'floating-source-box' | 'floating-field-box';
  destinationFieldId?: string;
  destinationFieldLabel?: string;
}) {
  const config = getOverlayBridgeConfig();
  const response = await bridgeFetch(`/api/dictation/sessions/${encodeURIComponent(input.sessionId)}`, {
    method: 'POST',
    body: JSON.stringify({
      providerId: config.providerId,
      action: 'commit_segment',
      segment: input.segment,
      draftId: input.draftId,
      destinationMode: input.destinationMode,
      destinationFieldId: input.destinationFieldId,
      destinationFieldLabel: input.destinationFieldLabel,
    }),
  });
  const payload = await response.json() as {
    committed?: {
      draftId: string;
      draftUrl: string;
      insertion?: {
        transactionId: string;
      };
    };
    error?: string;
  };

  if (!response.ok || !payload.committed) {
    throw new Error(payload.error || 'Unable to commit overlay transcript segment.');
  }

  return payload.committed;
}
