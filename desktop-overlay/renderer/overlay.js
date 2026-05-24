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
  const overlayShell = document.getElementById('overlay-shell');
  const miniModeToggle = document.getElementById('mini-mode-toggle');
  const miniOpenButton = document.getElementById('mini-open-button');
  const hideWindowButton = document.getElementById('hide-window');
  const miniSummaryLabel = document.getElementById('mini-summary-label');
  const miniSummaryCopy = document.getElementById('mini-summary-copy');
  const ehrTarget = document.getElementById('ehr-target');
  const notePackage = document.getElementById('note-package');
  const transferSectionTabs = document.getElementById('transfer-section-tabs');
  const activeSectionLabel = document.getElementById('active-section-label');
  const activeSectionText = document.getElementById('active-section-text');
  const copyTransferSectionButton = document.getElementById('copy-transfer-section');
  const pasteTransferSectionButton = document.getElementById('paste-transfer-section');
  const markTransferDoneButton = document.getElementById('mark-transfer-done');
  const previousTransferSectionButton = document.getElementById('previous-transfer-section');
  const nextTransferSectionButton = document.getElementById('next-transfer-section');
  const resetTransferChecklistButton = document.getElementById('reset-transfer-checklist');
  const transferProgressBar = document.getElementById('transfer-progress-bar');
  const transferProgressCopy = document.getElementById('transfer-progress-copy');
  const transferStatusCopy = document.getElementById('transfer-status-copy');
  const draftImportText = document.getElementById('draft-import-text');
  const importDraftClipboardButton = document.getElementById('import-draft-clipboard');
  const parseDraftTextButton = document.getElementById('parse-draft-text');
  const clearDraftImportButton = document.getElementById('clear-draft-import');
  const draftImportStatus = document.getElementById('draft-import-status');

  let pollTimer = null;
  let mediaStream = null;
  let mediaRecorder = null;
  let activeSessionId = '';
  let chunkSequence = 0;
  let commandLibrary = [];
  let captureUploadEnabled = false;
  let recordedAudioChunks = [];
  let reviewPending = false;
  const TRANSFER_STATE_KEY = 'veranote-mini-transfer-dock-v1';
  const COMPACT_STATE_KEY = 'veranote-mini-transfer-dock-compact-v1';
  const overlayApi = window.veranoteOverlay || {
    getStatus: async () => ({
      appName: 'Mini Veranote Transfer Dock',
      mode: 'browser-preview',
      overlayVisible: true,
      activeSessionId: null,
      activeDraftId: null,
      activeDraftUrl: null,
      pasteBuffer: null,
      lastMiniTransferAction: null,
      currentFieldBuffer: null,
      confirmedDesktopTarget: null,
      insertionStrategies: ['clipboard_only'],
      providers: [{ providerId: 'mock-stt', providerLabel: 'Preview provider', engineLabel: 'Browser preview', available: true }],
      commandLibrary: [],
      workflowProfile: null,
      activeFieldTarget: null,
      defaultSelection: { requestedProvider: 'mock-stt' },
      sessionState: null,
      interimSegment: null,
      pendingSegments: [],
      providerStatus: 'Browser preview mode. Electron bridge actions use safe mock responses.',
      nextStep: 'Run the Electron app to connect this dock to desktop clipboard and EHR-field detection.',
    }),
    copyTransferSection: async (input) => ({
      sectionId: input.sectionId,
      sectionLabel: input.sectionLabel,
      ehrLabel: input.ehrLabel,
      action: 'copied',
      mode: 'browser_preview',
      detail: `${input.sectionLabel} would be copied in the Electron overlay.`,
      completedAt: new Date().toISOString(),
    }),
    pasteTransferSection: async (input) => ({
      sectionId: input.sectionId,
      sectionLabel: input.sectionLabel,
      ehrLabel: input.ehrLabel,
      action: 'pasted',
      mode: 'browser_preview',
      detail: `${input.sectionLabel} would paste into the active field in the Electron overlay.`,
      completedAt: new Date().toISOString(),
    }),
    setCompactMode: async (input) => ({ compact: input.compact }),
    hideWindow: async () => ({ hidden: true }),
    uploadChunk: async () => ({}),
    nextTarget: async () => ({}),
    previousTarget: async () => ({}),
    confirmTarget: async () => ({}),
    commitCommand: async () => ({}),
    discardSegment: async () => ({}),
    acceptSegment: async () => ({}),
    startSession: async () => ({ sessionId: 'browser-preview-session' }),
    stopSession: async () => ({ stopped: true }),
    openDraft: async () => ({ opened: false }),
    pasteCurrentField: async () => ({ detail: 'Browser preview cannot paste into desktop apps.' }),
    readClipboardText: async () => ({ text: '', readAt: new Date().toISOString() }),
  };

  const EHR_LABELS = {
    wellsky: 'WellSky',
    tebra: 'Tebra / Kareo',
    epic: 'Epic',
    athena: 'athenaOne',
    valant: 'Valant',
    therapynotes: 'TherapyNotes',
    simplepractice: 'SimplePractice',
    icanotes: 'ICANotes',
    generic: 'Generic EHR',
  };

  const EHR_SECTION_LABELS = {
    wellsky: {
      hpi: 'Narrative summary / interval update',
      mse: 'Mental status',
      assessment: 'Assessment',
      plan: 'Assessment-plan / treatment plan',
      risk: 'Risk / safety narrative',
      billing: 'Billing support note',
    },
    tebra: {
      hpi: 'Subjective / HPI',
      mse: 'Mental functional / MSE',
      assessment: 'Assessment',
      plan: 'Plan',
      risk: 'Risk / safety',
      billing: 'Coding support',
    },
    epic: {
      hpi: 'HPI',
      mse: 'Psych exam / MSE',
      assessment: 'Assessment',
      plan: 'Plan',
      risk: 'Safety / risk',
      billing: 'LOS support',
    },
    athena: {
      hpi: 'HPI',
      mse: 'Physical exam / psych',
      assessment: 'Assessment',
      plan: 'Plan',
      risk: 'Risk / safety',
      billing: 'Billing notes',
    },
    valant: {
      hpi: 'Presenting problem / interval',
      mse: 'Mental status exam',
      assessment: 'Clinical assessment',
      plan: 'Treatment plan',
      risk: 'Safety planning',
      billing: 'Service / coding support',
    },
    therapynotes: {
      hpi: 'Session narrative',
      mse: 'Current mental status',
      assessment: 'Assessment',
      plan: 'Plan / follow-up',
      risk: 'Risk / safety',
      billing: 'Service details',
    },
    simplepractice: {
      hpi: 'Subjective',
      mse: 'Objective / MSE',
      assessment: 'Assessment',
      plan: 'Plan',
      risk: 'Risk / safety',
      billing: 'Billing support',
    },
    icanotes: {
      hpi: 'History / interval update',
      mse: 'MSE',
      assessment: 'Assessment',
      plan: 'Plan',
      risk: 'Risk assessment',
      billing: 'Coding support',
    },
    generic: {
      hpi: 'HPI / interval',
      mse: 'MSE',
      assessment: 'Assessment',
      plan: 'Plan',
      risk: 'Risk / safety',
      billing: 'Billing support',
    },
  };

  const NOTE_PACKAGES = {
    'psych-followup': [
      {
        id: 'hpi',
        label: 'HPI / interval',
        text: 'Patient seen for follow-up. Interval symptoms, sleep, appetite, medication adherence, side effects, psychosocial stressors, and functional status should be summarized here from the finalized Veranote draft.',
      },
      {
        id: 'mse',
        label: 'MSE',
        text: 'Mental status exam: appearance, behavior, speech, mood, affect, thought process, thought content, perception, cognition, insight, judgment, and risk elements should only include source-supported findings.',
      },
      {
        id: 'assessment',
        label: 'Assessment',
        text: 'Assessment should reconcile interval history, response to treatment, medication tolerance, risk changes, diagnostic uncertainty, and source conflicts without overstating unsupported conclusions.',
      },
      {
        id: 'plan',
        label: 'Plan',
        text: 'Plan should include provider-reviewed medication plan, therapy/supportive interventions, monitoring, follow-up, education, and safety instructions that belong in the chart.',
      },
      {
        id: 'risk',
        label: 'Risk / safety',
        text: 'Risk documentation should preserve patient report, observed findings, collateral information, protective factors, safety planning, and any conflicts without false reassurance.',
      },
      {
        id: 'billing',
        label: 'Billing support',
        text: 'Optional billing support: summarize time, complexity cues, psychotherapy add-on documentation, care coordination, and MDM support for provider review. This is not autonomous billing advice.',
      },
    ],
    'psych-eval': [
      {
        id: 'hpi',
        label: 'HPI / history',
        text: 'Initial evaluation history should summarize chief concern, timeline, current symptoms, prior episodes, treatment history, substance use, medical factors, family history, social context, and collateral/source conflicts.',
      },
      {
        id: 'mse',
        label: 'MSE',
        text: 'Mental status exam should document only source-supported observations across appearance, behavior, speech, mood, affect, thought process/content, perception, cognition, insight, judgment, and risk.',
      },
      {
        id: 'assessment',
        label: 'Formulation',
        text: 'Assessment/formulation should synthesize diagnosis considerations, rule-outs, medical/substance confounders, severity, functional impact, strengths, and uncertainty without diagnosing from sparse data.',
      },
      {
        id: 'plan',
        label: 'Plan',
        text: 'Plan should include provider-reviewed treatment recommendations, medication considerations, labs/monitoring, therapy level of care, follow-up, safety planning, and coordination needs.',
      },
      {
        id: 'risk',
        label: 'Risk / safety',
        text: 'Risk section should separate reported, denied, observed, and collateral information for SI/HI, psychosis, impulsivity, access to means, protective factors, and safety steps.',
      },
      {
        id: 'billing',
        label: 'Billing support',
        text: 'Optional billing support: summarize complexity and time elements for provider review after the note is complete.',
      },
    ],
    'therapy-progress': [
      {
        id: 'hpi',
        label: 'Session focus',
        text: 'Session focus should summarize presenting concern, interval update, therapy themes, interventions used, patient response, and functioning since last session.',
      },
      {
        id: 'mse',
        label: 'Observations',
        text: 'Observations should include only supported affect, engagement, speech, cognition, thought content, and risk-related details relevant to therapy documentation.',
      },
      {
        id: 'assessment',
        label: 'Progress',
        text: 'Progress should connect symptoms, goals, response to intervention, barriers, and clinical impressions without unsupported certainty.',
      },
      {
        id: 'plan',
        label: 'Plan / homework',
        text: 'Plan should include next-session focus, homework, coping practice, coordination, and follow-up.',
      },
      {
        id: 'risk',
        label: 'Risk / safety',
        text: 'Risk/safety should preserve any screening results, denials, disclosures, collateral conflicts, and safety planning.',
      },
    ],
    discharge: [
      {
        id: 'hpi',
        label: 'Course summary',
        text: 'Course summary should describe presenting problem, interval course, treatment response, unresolved issues, and discharge/transition rationale from source-supported material.',
      },
      {
        id: 'mse',
        label: 'Discharge MSE',
        text: 'Discharge MSE should include only supported findings and avoid inventing normal findings.',
      },
      {
        id: 'assessment',
        label: 'Discharge assessment',
        text: 'Discharge assessment should summarize stability, residual symptoms, risk context, diagnoses/uncertainty, and source conflicts.',
      },
      {
        id: 'plan',
        label: 'Aftercare plan',
        text: 'Aftercare plan should include medications, follow-up, referrals, safety plan, crisis instructions, and care coordination as reviewed by provider.',
      },
      {
        id: 'risk',
        label: 'Risk / safety',
        text: 'Risk/safety should avoid unsupported phrases like cleared or no risk and should preserve relevant denials, collateral, protective factors, and follow-up safety steps.',
      },
    ],
  };

  let transferState = hydrateTransferState();

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

  function getCurrentEhrLabel() {
    return EHR_LABELS[transferState.ehr] || 'Generic EHR';
  }

  function makeTransferSections(ehrValue, packageValue) {
    const baseSections = NOTE_PACKAGES[packageValue] || NOTE_PACKAGES['psych-followup'];
    const ehrLabels = EHR_SECTION_LABELS[ehrValue] || EHR_SECTION_LABELS.generic;

    return baseSections.map((section) => ({
      ...section,
      ehrLabel: ehrLabels[section.id] || section.label,
      done: false,
    }));
  }

  function hydrateTransferState() {
    const defaultState = {
      ehr: 'wellsky',
      notePackage: 'psych-followup',
      activeIndex: 0,
      sections: makeTransferSections('wellsky', 'psych-followup'),
    };

    try {
      const parsed = JSON.parse(window.localStorage.getItem(TRANSFER_STATE_KEY) || 'null');
      if (!parsed || !Array.isArray(parsed.sections) || !parsed.sections.length) {
        return defaultState;
      }
      return {
        ...defaultState,
        ...parsed,
        activeIndex: Math.max(0, Math.min(Number(parsed.activeIndex) || 0, parsed.sections.length - 1)),
        sections: parsed.sections.map((section) => ({
          id: String(section.id || 'section'),
          label: String(section.label || 'Section'),
          ehrLabel: String(section.ehrLabel || section.label || 'Section'),
          text: String(section.text || ''),
          done: Boolean(section.done),
        })),
      };
    } catch {
      return defaultState;
    }
  }

  function persistTransferState() {
    window.localStorage.setItem(TRANSFER_STATE_KEY, JSON.stringify(transferState));
  }

  function resetTransferSections() {
    transferState.sections = makeTransferSections(transferState.ehr, transferState.notePackage);
    transferState.activeIndex = 0;
    persistTransferState();
    renderTransferDock();
  }

  function getActiveTransferSection() {
    if (!transferState.sections.length) {
      resetTransferSections();
    }
    if (transferState.activeIndex < 0 || transferState.activeIndex >= transferState.sections.length) {
      transferState.activeIndex = 0;
    }
    return transferState.sections[transferState.activeIndex];
  }

  function moveTransferSection(direction) {
    if (!transferState.sections.length) {
      resetTransferSections();
      return;
    }
    transferState.activeIndex = (
      transferState.activeIndex + direction + transferState.sections.length
    ) % transferState.sections.length;
    persistTransferState();
    renderTransferDock();
  }

  function setTransferStatus(message, tone) {
    if (transferStatusCopy) {
      transferStatusCopy.textContent = message;
      transferStatusCopy.dataset.tone = tone || 'neutral';
    }
    if (miniSummaryCopy) {
      miniSummaryCopy.textContent = message;
    }
  }

  function setDraftImportStatus(message) {
    if (draftImportStatus) {
      draftImportStatus.textContent = message;
    }
  }

  function normalizeHeading(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/^[#*\-\s]+/, '')
      .replace(/[:*\-\s]+$/, '')
      .replace(/[^a-z0-9/ &-]/g, ' ')
      .replace(/\s+/g, ' ');
  }

  function classifyDraftHeading(rawHeading) {
    const heading = normalizeHeading(rawHeading);
    if (!heading) {
      return '';
    }
    if (/\b(billing|cpt|coding|time|mdm|medical decision|level of service|los)\b/.test(heading)) {
      return 'billing';
    }
    if (/\b(risk|safety|suicid|homicid|violence|means|protective|crisis)\b/.test(heading)) {
      return 'risk';
    }
    if (/\b(plan|recommendation|follow up|aftercare|disposition|intervention|homework)\b/.test(heading)) {
      return 'plan';
    }
    if (/\b(assessment|formulation|impression|diagnos|progress|clinical status)\b/.test(heading)) {
      return 'assessment';
    }
    if (/\b(mse|mental status|objective|observation|exam|psych exam)\b/.test(heading)) {
      return 'mse';
    }
    if (/\b(hpi|history|interval|subjective|reason|chief|course|session focus|presenting)\b/.test(heading)) {
      return 'hpi';
    }
    return '';
  }

  function parseDraftBlocks(draftText) {
    const normalized = String(draftText || '').replace(/\r\n/g, '\n').trim();
    if (!normalized) {
      return [];
    }

    const lines = normalized.split('\n');
    const blocks = [];
    let current = { heading: 'Imported narrative', id: 'hpi', lines: [] };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        if (current.lines.length) {
          current.lines.push('');
        }
        continue;
      }

      const colonMatch = line.match(/^(.{3,80}?):\s*(.*)$/);
      const standaloneHeading = /^[A-Z][A-Za-z0-9 /&()-]{2,80}$/.test(line) && line.split(/\s+/).length <= 8;
      const headingText = colonMatch?.[1] || (standaloneHeading ? line : '');
      const classified = classifyDraftHeading(headingText);

      if (classified) {
        if (current.lines.some((item) => item.trim())) {
          blocks.push(current);
        }
        current = {
          heading: headingText,
          id: classified,
          lines: [],
        };
        if (colonMatch?.[2]?.trim()) {
          current.lines.push(colonMatch[2].trim());
        }
        continue;
      }

      current.lines.push(line);
    }

    if (current.lines.some((item) => item.trim())) {
      blocks.push(current);
    }

    return blocks.map((block) => ({
      id: block.id,
      heading: block.heading,
      text: block.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    })).filter((block) => block.text);
  }

  function buildImportedSections(draftText) {
    const blocks = parseDraftBlocks(draftText);
    const baseSections = makeTransferSections(transferState.ehr, transferState.notePackage);

    if (!blocks.length) {
      const fallback = baseSections.find((section) => section.id === 'hpi') || baseSections[0];
      fallback.text = String(draftText || '').trim();
      fallback.done = false;
      return baseSections;
    }

    return baseSections.map((section) => {
      const matchingBlocks = blocks.filter((block) => block.id === section.id);
      if (!matchingBlocks.length) {
        return {
          ...section,
          text: '',
          done: false,
        };
      }
      return {
        ...section,
        text: matchingBlocks.map((block) => block.text).join('\n\n'),
        done: false,
      };
    }).filter((section) => section.text.trim() || section.id !== 'billing');
  }

  function importDraftIntoTransferQueue(draftText, sourceLabel) {
    const text = String(draftText || '').trim();
    if (!text) {
      setDraftImportStatus('No draft text found to import.');
      setTransferStatus('No draft text found to import.', 'error');
      return false;
    }

    transferState.sections = buildImportedSections(text);
    transferState.activeIndex = 0;
    persistTransferState();
    renderTransferDock();
    const importedCount = transferState.sections.filter((section) => section.text.trim()).length;
    const message = `Imported ${importedCount} section${importedCount === 1 ? '' : 's'} from ${sourceLabel}. Review before transfer.`;
    setDraftImportStatus(message);
    setTransferStatus(message, 'success');
    return true;
  }

  function renderTransferDock() {
    if (ehrTarget) {
      ehrTarget.value = transferState.ehr;
    }
    if (notePackage) {
      notePackage.value = transferState.notePackage;
    }

    const section = getActiveTransferSection();
    const doneCount = transferState.sections.filter((item) => item.done).length;
    const totalCount = transferState.sections.length;
    const progress = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

    if (transferProgressBar) {
      transferProgressBar.style.width = `${progress}%`;
    }
    if (transferProgressCopy) {
      transferProgressCopy.textContent = `${doneCount} of ${totalCount} sections transferred for ${getCurrentEhrLabel()}.`;
    }
    if (miniSummaryLabel) {
      miniSummaryLabel.textContent = `${doneCount}/${totalCount} transferred`;
    }
    if (activeSectionLabel) {
      activeSectionLabel.textContent = `${section.ehrLabel} (${section.label})`;
    }
    if (activeSectionText && activeSectionText.value !== section.text) {
      activeSectionText.value = section.text;
    }
    if (markTransferDoneButton) {
      markTransferDoneButton.textContent = section.done ? 'Marked Done' : 'Mark Done';
    }

    if (transferSectionTabs) {
      transferSectionTabs.innerHTML = '';
      transferState.sections.forEach((item, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `section-tab${index === transferState.activeIndex ? ' active' : ''}${item.done ? ' done' : ''}`;
        button.textContent = item.ehrLabel;
        button.addEventListener('click', () => {
          transferState.activeIndex = index;
          persistTransferState();
          renderTransferDock();
        });
        transferSectionTabs.appendChild(button);
      });
    }
  }

  function setCompactMode(compact) {
    overlayShell?.classList.toggle('is-compact', compact);
    if (miniModeToggle) {
      miniModeToggle.textContent = compact ? 'Expand' : 'Minimize';
    }
    window.localStorage.setItem(COMPACT_STATE_KEY, compact ? 'true' : 'false');
    void overlayApi.setCompactMode({ compact }).catch(() => {});
  }

  async function copyActiveTransferSection() {
    const section = getActiveTransferSection();
    const result = await overlayApi.copyTransferSection({
      sectionId: section.id,
      sectionLabel: section.ehrLabel,
      ehrLabel: getCurrentEhrLabel(),
      text: section.text,
    });
    setTransferStatus(result?.detail || `${section.ehrLabel} copied to clipboard.`, 'success');
    setCaptureState('copied', `${section.ehrLabel} copied to clipboard.`);
  }

  async function pasteActiveTransferSection() {
    const section = getActiveTransferSection();
    const result = await overlayApi.pasteTransferSection({
      sectionId: section.id,
      sectionLabel: section.ehrLabel,
      ehrLabel: getCurrentEhrLabel(),
      text: section.text,
    });
    setTransferStatus(result?.detail || `${section.ehrLabel} sent to active field.`, 'success');
    setCaptureState('pasted', result?.detail || `${section.ehrLabel} sent to active field.`);
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

    await overlayApi.uploadChunk(payload);
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
          void overlayApi.nextTarget().then(refreshStatus);
          return;
        }

        void overlayApi.commitCommand({
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
          void overlayApi.nextTarget().then(async () => {
            await overlayApi.discardSegment(segment.id);
            await refreshStatus();
          });
          return;
        }

        if (commandMatch?.outputText) {
          void overlayApi.commitCommand({
            commandId: commandMatch.id,
            targetSection: segment.targetSection || targetSection?.value || 'clinicianNotes',
          }).then(async () => {
            await overlayApi.discardSegment(segment.id);
            await refreshStatus();
          });
          return;
        }

        reviewPending = true;
        void stopLocalCapture()
          .then(() => overlayApi.acceptSegment(segment.id))
          .then(() => overlayApi.stopSession().catch(() => {}))
          .then(refreshStatus);
      });

      const discard = document.createElement('button');
      discard.textContent = 'Discard';
      discard.addEventListener('click', () => {
        void overlayApi.discardSegment(segment.id).then(refreshStatus);
      });

      actions.appendChild(accept);
      actions.appendChild(discard);
      card.appendChild(actions);
      pendingSegments.appendChild(card);
    }
  }

  async function refreshStatus() {
    const status = await overlayApi.getStatus();
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
    renderTransferDock();

    if (status.lastMiniTransferAction?.detail) {
      setTransferStatus(status.lastMiniTransferAction.detail, 'neutral');
    }

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
    renderTransferDock();
    setCompactMode(window.localStorage.getItem(COMPACT_STATE_KEY) === 'true');
    await refreshStatus();
  } catch (error) {
    renderTransferDock();
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

  miniModeToggle?.addEventListener('click', () => {
    setCompactMode(!overlayShell?.classList.contains('is-compact'));
  });

  miniOpenButton?.addEventListener('click', () => {
    setCompactMode(false);
  });

  hideWindowButton?.addEventListener('click', () => {
    void overlayApi.hideWindow();
  });

  ehrTarget?.addEventListener('change', () => {
    transferState.ehr = ehrTarget.value || 'generic';
    transferState.sections = makeTransferSections(transferState.ehr, transferState.notePackage);
    transferState.activeIndex = 0;
    persistTransferState();
    renderTransferDock();
    setTransferStatus(`EHR target changed to ${getCurrentEhrLabel()}. Review each section before transfer.`, 'neutral');
  });

  notePackage?.addEventListener('change', () => {
    transferState.notePackage = notePackage.value || 'psych-followup';
    transferState.sections = makeTransferSections(transferState.ehr, transferState.notePackage);
    transferState.activeIndex = 0;
    persistTransferState();
    renderTransferDock();
    setTransferStatus('Note package changed. Review the generated section queue before transfer.', 'neutral');
  });

  activeSectionText?.addEventListener('input', () => {
    const section = getActiveTransferSection();
    section.text = activeSectionText.value;
    section.done = false;
    persistTransferState();
    renderTransferDock();
  });

  copyTransferSectionButton?.addEventListener('click', () => {
    void copyActiveTransferSection().catch((error) => {
      setCaptureState('error', error instanceof Error ? error.message : 'Unable to copy transfer section.');
      setTransferStatus(error instanceof Error ? error.message : 'Unable to copy transfer section.', 'error');
    });
  });

  pasteTransferSectionButton?.addEventListener('click', () => {
    void pasteActiveTransferSection().catch((error) => {
      setCaptureState('error', error instanceof Error ? error.message : 'Unable to paste transfer section.');
      setTransferStatus(error instanceof Error ? error.message : 'Unable to paste transfer section.', 'error');
    });
  });

  markTransferDoneButton?.addEventListener('click', () => {
    const section = getActiveTransferSection();
    section.done = !section.done;
    persistTransferState();
    renderTransferDock();
    setTransferStatus(section.done
      ? `${section.ehrLabel} marked transferred.`
      : `${section.ehrLabel} marked incomplete.`,
    section.done ? 'success' : 'neutral');
  });

  previousTransferSectionButton?.addEventListener('click', () => {
    moveTransferSection(-1);
  });

  nextTransferSectionButton?.addEventListener('click', () => {
    moveTransferSection(1);
  });

  resetTransferChecklistButton?.addEventListener('click', () => {
    resetTransferSections();
    setTransferStatus('Transfer checklist reset. Review each section before sending anything to the EHR.', 'neutral');
  });

  importDraftClipboardButton?.addEventListener('click', () => {
    void overlayApi.readClipboardText().then((payload) => {
      if (draftImportText) {
        draftImportText.value = payload?.text || '';
      }
      importDraftIntoTransferQueue(payload?.text || '', 'clipboard');
    }).catch((error) => {
      const message = error instanceof Error ? error.message : 'Unable to read clipboard.';
      setDraftImportStatus(message);
      setTransferStatus(message, 'error');
    });
  });

  parseDraftTextButton?.addEventListener('click', () => {
    importDraftIntoTransferQueue(draftImportText?.value || '', 'manual paste');
  });

  clearDraftImportButton?.addEventListener('click', () => {
    if (draftImportText) {
      draftImportText.value = '';
    }
    setDraftImportStatus('Draft import box cleared.');
  });

  startButton?.addEventListener('click', () => {
    void overlayApi.startSession({
      encounterId: encounterId?.value || 'overlay-demo-encounter',
      targetSection: targetSection?.value || 'clinicianNotes',
      requestedProviderId: requestedProvider?.value || 'mock-stt',
      allowMockFallback: Boolean(allowFallback?.checked),
    }).then(async (session) => {
      try {
        await startLocalCapture(session.sessionId);
      } catch (error) {
        await overlayApi.stopSession().catch(() => {});
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
      overlayApi.stopSession().then(refreshStatus)
    ));
  });

  previousTargetButton?.addEventListener('click', () => {
    void overlayApi.previousTarget().then(refreshStatus);
  });

  nextTargetButton?.addEventListener('click', () => {
    void overlayApi.nextTarget().then(refreshStatus);
  });

  confirmTargetButton?.addEventListener('click', () => {
    void overlayApi.confirmTarget().then(refreshStatus).catch((error) => {
      setCaptureState('error', error instanceof Error ? error.message : 'Unable to confirm the active desktop target.');
    });
  });

  openDraftButton?.addEventListener('click', () => {
    void overlayApi.openDraft();
  });

  pasteLatestButton?.addEventListener('click', () => {
    void overlayApi.pasteCurrentField().then((result) => {
      setCaptureState('capturing', result?.detail || 'Pasted the current field buffer.');
      return refreshStatus();
    }).catch((error) => {
      setCaptureState('error', error instanceof Error ? error.message : 'Unable to paste the current field buffer.');
    });
  });
}());
