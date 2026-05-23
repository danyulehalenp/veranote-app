(async function bootstrapOverlay() {
  const CHUNK_INTERVAL_MS = 1200;
  const MIN_UPLOAD_CHUNK_BYTES = 512;
  const ACCEPTED_AUDIO_MIME_PREFIXES = [
    'audio/webm',
    'audio/mp4',
    'audio/m4a',
    'audio/wav',
    'audio/mpeg',
    'audio/mp3',
    'audio/ogg',
    'audio/flac',
  ];

  const nextStep = document.getElementById('next-step');
  const providerStatus = document.getElementById('provider-status');
  const requestedProvider = document.getElementById('requested-provider');
  const encounterId = document.getElementById('encounter-id');
  const targetSection = document.getElementById('target-section');
  const allowFallback = document.getElementById('allow-fallback');
  const refreshButton = document.getElementById('refresh-status');
  const startButton = document.getElementById('start-session');
  const pauseButton = document.getElementById('pause-session');
  const resumeButton = document.getElementById('resume-session');
  const stopButton = document.getElementById('stop-session');
  const queueSummary = document.getElementById('queue-summary');
  const interimPreview = document.getElementById('interim-preview');
  const pendingSegments = document.getElementById('pending-segments');
  const speechBoxState = document.getElementById('speech-box-state');
  const currentTarget = document.getElementById('current-target');
  const currentTargetCopy = document.getElementById('current-target-copy');
  const draftLinkState = document.getElementById('draft-link-state');
  const draftLinkCopy = document.getElementById('draft-link-copy');
  const openDraftButton = document.getElementById('open-draft');
  const pasteLatestButton = document.getElementById('paste-latest');
  const captureStatePill = document.getElementById('capture-state-pill');
  const captureStatusCopy = document.getElementById('capture-status-copy');
  const commandSummary = document.getElementById('command-summary');
  const commandTray = document.getElementById('command-tray');
  const fieldTargetLabel = document.getElementById('field-target-label');
  const fieldTargetCopy = document.getElementById('field-target-copy');
  const nextTargetButton = document.getElementById('next-target');
  const previousTargetButton = document.getElementById('previous-target');
  const confirmTargetButton = document.getElementById('confirm-target');

  let pollTimer = null;
  let mediaStream = null;
  let mediaRecorder = null;
  let activeSessionId = '';
  let chunkSequence = 0;
  let commandLibrary = [];
  let captureUploadEnabled = false;
  let recordedAudioChunks = [];
  let reviewPending = false;

  function normalizeCommandText(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ');
  }

  function resolveCommandMatch(text) {
    const normalized = normalizeCommandText(text);
    if (!normalized) {
      return null;
    }

    return commandLibrary.find((command) => (
      Array.isArray(command.spokenPhrases)
      && command.spokenPhrases.some((phrase) => normalizeCommandText(phrase) === normalized)
    )) || null;
  }

  function setCaptureState(nextState, detail) {
    if (captureStatePill) {
      captureStatePill.textContent = nextState;
      captureStatePill.className = 'status-pill';
      if (nextState === 'capturing') {
        captureStatePill.classList.add('active');
      }
      if (nextState === 'error') {
        captureStatePill.classList.add('error');
      }
    }
    if (captureStatusCopy) {
      captureStatusCopy.textContent = detail || 'Microphone capture is idle.';
    }
  }

  function bytesToBase64(bytes) {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    return window.btoa(binary);
  }

  async function readBlobBytes(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  function getPreferredRecorderMimeType() {
    if (typeof window.MediaRecorder === 'undefined' || typeof window.MediaRecorder.isTypeSupported !== 'function') {
      return '';
    }

    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    return candidates.find((mimeType) => window.MediaRecorder.isTypeSupported(mimeType)) || '';
  }

  function hasEbmlHeader(bytes) {
    return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  }

  function hasMp4FileTypeHeader(bytes) {
    return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
  }

  function isAcceptedAudioChunk(bytes, mimeType) {
    const normalizedMimeType = String(mimeType || '').toLowerCase();
    if (!bytes.length || bytes.length < MIN_UPLOAD_CHUNK_BYTES) {
      return false;
    }

    if (!ACCEPTED_AUDIO_MIME_PREFIXES.some((prefix) => normalizedMimeType.startsWith(prefix))) {
      return false;
    }

    // MediaRecorder time-sliced WebM emits standalone metadata only on the first chunk.
    // Headerless follow-up slices are not valid files for OpenAI batch transcription.
    if (normalizedMimeType.startsWith('audio/webm')) {
      return hasEbmlHeader(bytes);
    }

    if (normalizedMimeType.startsWith('audio/mp4') || normalizedMimeType.startsWith('audio/m4a')) {
      return hasMp4FileTypeHeader(bytes);
    }

    return true;
  }

  async function uploadRecordedBlob(blob) {
    if (reviewPending || !captureUploadEnabled || !activeSessionId || !blob || !blob.size) {
      return;
    }

    const bytes = await readBlobBytes(blob);
    const mimeType = blob.type || 'application/octet-stream';
    if (reviewPending || !captureUploadEnabled || !activeSessionId) {
      return;
    }
    if (!isAcceptedAudioChunk(bytes, mimeType)) {
      return;
    }

    chunkSequence += 1;
    const payload = {
      sessionId: activeSessionId,
      sequence: chunkSequence,
      base64Audio: bytesToBase64(bytes),
      mimeType,
      sizeBytes: bytes.length,
      capturedAt: new Date().toISOString(),
    };

    await window.veranoteOverlay.uploadChunk(payload);
  }

  async function stopLocalCapture() {
    captureUploadEnabled = false;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    mediaRecorder = null;
    recordedAudioChunks = [];

    if (mediaStream) {
      const tracks = mediaStream.getTracks();
      for (const track of tracks) {
        track.stop();
      }
    }
    mediaStream = null;
    setCaptureState('idle', 'Microphone capture is idle.');
  }

  function pauseLocalCapture() {
    if (mediaRecorder && mediaRecorder.state === 'recording' && typeof mediaRecorder.pause === 'function') {
      mediaRecorder.pause();
    }
    if (mediaStream) {
      for (const track of mediaStream.getAudioTracks()) {
        track.enabled = false;
      }
    }
    setCaptureState('paused', 'Microphone capture is paused.');
  }

  function resumeLocalCapture() {
    if (mediaStream) {
      for (const track of mediaStream.getAudioTracks()) {
        track.enabled = true;
      }
    }
    if (mediaRecorder && mediaRecorder.state === 'paused' && typeof mediaRecorder.resume === 'function') {
      mediaRecorder.resume();
    }
    setCaptureState('capturing', 'Microphone capture is live and uploading audio to the backend dictation session.');
  }

  async function startLocalCapture(sessionId) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone capture is not available in this overlay.');
    }
    if (typeof window.MediaRecorder === 'undefined') {
      throw new Error('MediaRecorder is not available in this overlay.');
    }

    activeSessionId = sessionId;
    chunkSequence = 0;
    captureUploadEnabled = true;
    reviewPending = false;
    recordedAudioChunks = [];
    setCaptureState('requesting', 'Requesting microphone permission...');

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    const mimeType = getPreferredRecorderMimeType();
    mediaRecorder = mimeType
      ? new window.MediaRecorder(mediaStream, { mimeType })
      : new window.MediaRecorder(mediaStream);

    mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size > 0) {
        recordedAudioChunks.push(event.data);
        const cumulativeBlob = new Blob(recordedAudioChunks, {
          type: event.data.type || mimeType || 'audio/webm',
        });
        void uploadRecordedBlob(cumulativeBlob).catch((error) => {
          setCaptureState('error', error instanceof Error ? error.message : 'Unable to upload audio chunk.');
        });
      }
    });

    mediaRecorder.addEventListener('error', (event) => {
      const message = event?.error?.message || 'Overlay recorder error.';
      setCaptureState('error', message);
    });

    mediaRecorder.start(CHUNK_INTERVAL_MS);
    setCaptureState('capturing', 'Microphone capture is live and uploading audio to the backend dictation session.');
  }

  function renderCommandTray(status) {
    if (!commandTray) {
      return;
    }

    commandTray.innerHTML = '';
    const usableCommands = commandLibrary.filter((command) => command.outputText || command.action === 'navigate_target');

    if (commandSummary) {
      commandSummary.textContent = usableCommands.length
        ? `${usableCommands.length} stored command${usableCommands.length === 1 ? '' : 's'} ready`
        : 'No stored commands available';
    }

    if (!usableCommands.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No provider dictation commands are configured yet.';
      commandTray.appendChild(empty);
      return;
    }

    for (const command of usableCommands) {
      const card = document.createElement('div');
      card.className = 'command-card';

      const label = document.createElement('div');
      label.className = 'panel-value';
      label.textContent = command.label;
      card.appendChild(label);

      const copy = document.createElement('div');
      copy.className = 'panel-copy';
      copy.textContent = command.description || 'Stored dictation command';
      card.appendChild(copy);

      const trigger = document.createElement('div');
      trigger.className = 'panel-copy';
      trigger.textContent = `Trigger: ${(command.spokenPhrases || []).slice(0, 2).join(' • ') || 'manual only'}`;
      card.appendChild(trigger);

      const actions = document.createElement('div');
      actions.className = 'segment-actions';

      const apply = document.createElement('button');
      apply.className = 'primary';
      apply.textContent = command.action === 'navigate_target' ? 'Move target' : 'Insert command';
      apply.addEventListener('click', () => {
        if (command.action === 'navigate_target') {
          void window.veranoteOverlay.nextTarget().then(refreshStatus);
          return;
        }

        void window.veranoteOverlay.commitCommand({
          commandId: command.id,
          targetSection: targetSection?.value || 'clinicianNotes',
        }).then(refreshStatus);
      });
      actions.appendChild(apply);

      card.appendChild(actions);
      commandTray.appendChild(card);
    }
  }

  function renderFieldTarget(status) {
    const target = status.activeFieldTarget;
    const workflow = status.workflowProfile;

    if (fieldTargetLabel) {
      fieldTargetLabel.textContent = target?.label || workflow?.destinationLabel || 'No field target loaded';
    }
    if (fieldTargetCopy) {
      const heldCount = status.currentFieldBuffer?.sourceCount ? ` Held items: ${status.currentFieldBuffer.sourceCount}.` : '';
      const confirmed = status.confirmedDesktopTarget?.appName
        ? ` Confirmed app: ${status.confirmedDesktopTarget.appName}${status.confirmedDesktopTarget.elementRole ? ` (${status.confirmedDesktopTarget.elementRole})` : ''}.`
        : '';
      const adapter = status.confirmedDesktopTarget?.adapterLabel
        ? ` Strategy: ${status.confirmedDesktopTarget.adapterLabel}.`
        : '';
      const behavior = status.confirmedDesktopTarget?.fieldTargetBehavior
        ? ` Field behavior: ${status.confirmedDesktopTarget.fieldTargetBehavior}.`
        : '';
      const fieldPackNote = status.confirmedDesktopTarget?.fieldTargetNote
        ? ` ${status.confirmedDesktopTarget.fieldTargetNote}`
        : '';
      const insertionStrategy = Array.isArray(status.insertionStrategies) && status.insertionStrategies.length
        ? ` Insert order: ${status.insertionStrategies.join(' -> ')}.`
        : '';
      fieldTargetCopy.textContent = `${target?.note || workflow?.directFieldGuidance || 'The overlay will load the provider’s destination-aware field workflow here.'}${heldCount}${confirmed}${adapter}${behavior}${fieldPackNote}${insertionStrategy}`;
    }
    if (nextTargetButton) {
      nextTargetButton.disabled = !workflow?.fieldTargets?.length;
    }
    if (previousTargetButton) {
      previousTargetButton.disabled = !workflow?.fieldTargets?.length;
    }
  }

  function renderPendingSegments(status) {
    if (!pendingSegments) {
      return;
    }

    pendingSegments.innerHTML = '';
    const items = Array.isArray(status.pendingSegments) ? status.pendingSegments : [];

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No final transcript is waiting for review.';
      pendingSegments.appendChild(empty);
      return;
    }

    for (const segment of items) {
      const commandMatch = resolveCommandMatch(segment.text);
      const card = document.createElement('div');
      card.className = 'segment-card';

      const meta = document.createElement('div');
      meta.className = 'segment-meta';
      meta.innerHTML = `<span>${segment.targetSection || 'source section'}</span><span>${segment.source?.provider || 'provider'}</span>`;
      card.appendChild(meta);

      const text = document.createElement('div');
      text.className = 'segment-text';
      text.textContent = segment.text || '';
      card.appendChild(text);

      if (Array.isArray(segment.reviewFlags) && segment.reviewFlags.length) {
        const flags = document.createElement('div');
        flags.className = 'segment-flags';
        for (const flag of segment.reviewFlags) {
          const pill = document.createElement('span');
          pill.className = 'flag-pill';
          pill.textContent = `${flag.severity}: ${flag.flagType}`;
          flags.appendChild(pill);
        }
        card.appendChild(flags);
      }

      if (commandMatch) {
        const matchCopy = document.createElement('div');
        matchCopy.className = 'panel-copy';
        matchCopy.textContent = `Stored command match: ${commandMatch.label}`;
        card.appendChild(matchCopy);
      }

      const actions = document.createElement('div');
      actions.className = 'segment-actions';

      const accept = document.createElement('button');
      accept.className = 'primary';
      if (commandMatch?.action === 'navigate_target') {
        accept.textContent = `Move to next field`;
      } else {
        accept.textContent = commandMatch ? `Apply ${commandMatch.label}` : 'Accept into draft';
      }
      accept.addEventListener('click', () => {
        if (commandMatch?.action === 'navigate_target') {
          void window.veranoteOverlay.nextTarget().then(async () => {
            await window.veranoteOverlay.discardSegment(segment.id);
            await refreshStatus();
          });
          return;
        }

        if (commandMatch?.outputText) {
          void window.veranoteOverlay.commitCommand({
            commandId: commandMatch.id,
            targetSection: segment.targetSection || targetSection?.value || 'clinicianNotes',
          }).then(async () => {
            await window.veranoteOverlay.discardSegment(segment.id);
            await refreshStatus();
          });
          return;
        }

        reviewPending = true;
        void stopLocalCapture()
          .then(() => window.veranoteOverlay.acceptSegment(segment.id))
          .then(() => window.veranoteOverlay.stopSession().catch(() => {}))
          .then(refreshStatus);
      });

      const discard = document.createElement('button');
      discard.textContent = 'Discard';
      discard.addEventListener('click', () => {
        void window.veranoteOverlay.discardSegment(segment.id).then(refreshStatus);
      });

      actions.appendChild(accept);
      actions.appendChild(discard);
      card.appendChild(actions);
      pendingSegments.appendChild(card);
    }
  }

  async function refreshStatus() {
    const status = await window.veranoteOverlay.getStatus();
    activeSessionId = status.activeSessionId || '';
    commandLibrary = Array.isArray(status.commandLibrary) ? status.commandLibrary : [];
    const queuedForReview = Array.isArray(status.pendingSegments) && status.pendingSegments.length > 0;

    if (queuedForReview && captureUploadEnabled) {
      reviewPending = true;
      await stopLocalCapture();
      setCaptureState('paused', 'Transcript is ready for review. Capture is paused until you accept or discard it.');
    }

    if (nextStep) {
      nextStep.textContent = status.nextStep || 'Connect overlay to backend dictation sessions.';
    }
    if (providerStatus) {
      providerStatus.textContent = status.providerStatus || 'Overlay status unavailable.';
    }
    if (speechBoxState) {
      speechBoxState.textContent = status.activeSessionId
        ? `Session live${status.sessionState?.fallbackApplied ? ' • fallback active' : ''}`
        : 'Overlay ready';
    }
    if (currentTarget) {
      const fieldLabel = status.activeFieldTarget?.label ? ` • ${status.activeFieldTarget.label}` : '';
      currentTarget.textContent = status.sessionState?.activeProviderLabel
        ? `${targetSection?.value || 'clinicianNotes'}${fieldLabel} • ${status.sessionState.activeProviderLabel}`
        : 'Veranote source mode';
    }
    if (currentTargetCopy) {
      currentTargetCopy.textContent = status.workflowProfile?.supportsDirectFieldInsertion
        ? `Field-box mode for ${status.workflowProfile.destinationLabel}. Accepted text is tracked against the active field target before true desktop insertion is added.`
        : 'Source-box mode keeps reviewed text in Veranote-first routing before any direct field insertion.';
    }

    if (requestedProvider && Array.isArray(status.providers)) {
      requestedProvider.innerHTML = '';
      for (const provider of status.providers) {
        const option = document.createElement('option');
        option.value = provider.providerId;
        option.textContent = `${provider.providerLabel} • ${provider.engineLabel}${provider.available ? '' : ' (unavailable)'}`;
        requestedProvider.appendChild(option);
      }
      if (status.defaultSelection?.requestedProvider) {
        requestedProvider.value = status.defaultSelection.requestedProvider;
      }
    }

    if (queueSummary) {
      const count = Array.isArray(status.pendingSegments) ? status.pendingSegments.length : 0;
      queueSummary.textContent = count
        ? `${count} segment${count === 1 ? '' : 's'} waiting for review`
        : (status.activeSessionId ? 'Listening for final transcript' : 'No queued transcript yet');
    }

    if (interimPreview) {
      interimPreview.textContent = status.interimSegment?.text
        ? `Interim: ${status.interimSegment.text}`
        : 'Interim transcript will appear here while the overlay session is active.';
    }

    if (draftLinkState) {
      if (status.currentFieldBuffer?.text) {
        draftLinkState.textContent = status.activeDraftId
          ? `Paste buffer ready • ${status.activeDraftId}`
          : 'Paste buffer ready';
      } else {
        draftLinkState.textContent = status.activeDraftId
          ? `Draft linked: ${status.activeDraftId}`
          : 'Not linked yet';
      }
    }
    if (draftLinkCopy) {
      const fieldLabel = status.activeFieldTarget?.label ? ` Current field: ${status.activeFieldTarget.label}.` : '';
      if (status.currentFieldBuffer?.text) {
        draftLinkCopy.textContent = `Current field buffer is ready to paste into the active desktop app.${fieldLabel}`;
      } else {
        draftLinkCopy.textContent = status.activeDraftUrl
          ? `Accepted segments are being routed into a connected Veranote draft checkpoint.${fieldLabel}`
          : 'The first accepted segment will create a connected draft checkpoint.';
      }
    }
    if (openDraftButton) {
      openDraftButton.disabled = !status.activeDraftUrl;
    }
    if (pasteLatestButton) {
      pasteLatestButton.disabled = !status.currentFieldBuffer?.text;
    }

    renderFieldTarget(status);
    renderCommandTray(status);
    renderPendingSegments(status);

    if (pollTimer) {
      window.clearTimeout(pollTimer);
    }
    if (status.activeSessionId) {
      pollTimer = window.setTimeout(() => {
        void refreshStatus();
      }, 2000);
    }
  }

  try {
    await refreshStatus();
  } catch (error) {
    if (nextStep) {
      nextStep.textContent = 'Overlay scaffold ready';
    }
    if (providerStatus) {
      providerStatus.textContent = error instanceof Error ? error.message : 'Unable to load overlay status.';
    }
  }

  refreshButton?.addEventListener('click', () => {
    void refreshStatus();
  });

  startButton?.addEventListener('click', () => {
    void window.veranoteOverlay.startSession({
      encounterId: encounterId?.value || 'overlay-demo-encounter',
      targetSection: targetSection?.value || 'clinicianNotes',
      requestedProviderId: requestedProvider?.value || 'mock-stt',
      allowMockFallback: Boolean(allowFallback?.checked),
    }).then(async (session) => {
      try {
        await startLocalCapture(session.sessionId);
      } catch (error) {
        await window.veranoteOverlay.stopSession().catch(() => {});
        setCaptureState('error', error instanceof Error ? error.message : 'Unable to start microphone capture.');
      }
      await refreshStatus();
    }).catch((error) => {
      setCaptureState('error', error instanceof Error ? error.message : 'Unable to start overlay session.');
    });
  });

  pauseButton?.addEventListener('click', () => {
    pauseLocalCapture();
  });

  resumeButton?.addEventListener('click', () => {
    resumeLocalCapture();
  });

  stopButton?.addEventListener('click', () => {
    void stopLocalCapture().then(() => (
      window.veranoteOverlay.stopSession().then(refreshStatus)
    ));
  });

  previousTargetButton?.addEventListener('click', () => {
    void window.veranoteOverlay.previousTarget().then(refreshStatus);
  });

  nextTargetButton?.addEventListener('click', () => {
    void window.veranoteOverlay.nextTarget().then(refreshStatus);
  });

  confirmTargetButton?.addEventListener('click', () => {
    void window.veranoteOverlay.confirmTarget().then(refreshStatus).catch((error) => {
      setCaptureState('error', error instanceof Error ? error.message : 'Unable to confirm the active desktop target.');
    });
  });

  openDraftButton?.addEventListener('click', () => {
    void window.veranoteOverlay.openDraft();
  });

  pasteLatestButton?.addEventListener('click', () => {
    void window.veranoteOverlay.pasteCurrentField().then((result) => {
      setCaptureState('capturing', result?.detail || 'Pasted the current field buffer.');
      return refreshStatus();
    }).catch((error) => {
      setCaptureState('error', error instanceof Error ? error.message : 'Unable to paste the current field buffer.');
    });
  });
}());
