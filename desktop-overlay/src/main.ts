import path from 'path';
import { execFile as execFileCallback } from 'child_process';
import { promisify } from 'util';
import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, shell } from 'electron';
import {
  resolveBestWorkflowFieldTarget,
  resolveDesktopFieldTargetPack,
  resolveDesktopInsertionStrategies,
  resolveDesktopTargetAdapter,
} from './target-adapters';
import {
  commitOverlayTranscriptSegment,
  fetchOverlayCommandLibrary,
  fetchOverlayProviderStatus,
  fetchOverlaySessionState,
  fetchOverlayWorkflowProfile,
  pullOverlayTranscriptEvents,
  startOverlayDictationSession,
  stopOverlayDictationSession,
  uploadOverlayAudioChunk,
} from './bridge';
import {
  detectActiveDesktopContext as detectMacDesktopContext,
  tryPasteIntoActiveApp,
  trySetFocusedFieldValue,
} from './macos-automation';

const execFile = promisify(execFileCallback);

let overlayWindow: BrowserWindow | null = null;
let activeOverlaySessionId = '';
let activeOverlayDraftId = '';
let activeOverlayDraftUrl = '';
let lastOverlayPasteBuffer: {
  text: string;
  fieldTargetLabel?: string;
  destinationLabel?: string;
  committedAt: string;
  preferredBehavior?: string;
  insertionNote?: string;
} | null = null;
let lastMiniTransferAction: {
  sectionId: string;
  sectionLabel: string;
  ehrLabel?: string;
  action: 'copied' | 'pasted';
  mode: string;
  detail: string;
  completedAt: string;
} | null = null;
let overlayFieldBuffers: Record<string, {
  text: string;
  fieldTargetId: string;
  fieldTargetLabel: string;
  destinationLabel?: string;
  updatedAt: string;
  sourceCount: number;
  preferredBehavior?: string;
  insertionNote?: string;
}> = {};
let confirmedDesktopTarget: {
  appName?: string;
  elementRole?: string;
  windowTitle?: string;
  focusedLabel?: string;
  automationStatus?: 'full' | 'partial' | 'unavailable';
  automationError?: string;
  adapterId?: string;
  adapterLabel?: string;
  fieldTargetId?: string;
  fieldTargetLabel?: string;
  fieldTargetBehavior?: string;
  fieldTargetNote?: string;
  confirmedAt: string;
} | null = null;
let overlayCommandLibrary: Array<{
  id: string;
  label: string;
  spokenPhrases: string[];
  action: string;
  scope: string;
  description: string;
  outputText?: string;
}> = [];
let overlayWorkflowProfile: {
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
} | null = null;
let activeOverlayFieldTargetIndex = 0;
let overlayPendingSegments: Array<{
  id: string;
  text: string;
  targetSection?: string;
  confidence?: number;
  reviewFlags: Array<{
    flagType: string;
    severity: string;
    matchedText: string;
    message: string;
    suggestedAction?: string;
  }>;
  source: {
    provider: string;
    modelOrEngine?: string;
    mode: string;
    vendorSegmentId?: string;
  };
  dictationSessionId: string;
  encounterId: string;
  noteId?: string;
  normalizedText?: string;
  isFinal: boolean;
  startMs?: number;
  endMs?: number;
  speakerLabel?: string;
  reviewStatus: string;
  createdAt: string;
  insertedTransactionId?: string;
}> = [];
let overlayInterimSegment: {
  id: string;
  text: string;
  targetSection?: string;
  confidence?: number;
} | null = null;

function mergePendingSegments(nextSegments: typeof overlayPendingSegments) {
  const byId = new Map<string, typeof overlayPendingSegments[number]>();
  for (const segment of overlayPendingSegments) {
    byId.set(segment.id, segment);
  }
  for (const segment of nextSegments) {
    if (segment.isFinal) {
      byId.set(segment.id, segment);
    } else {
      overlayInterimSegment = {
        id: segment.id,
        text: segment.text,
        targetSection: segment.targetSection,
        confidence: segment.confidence,
      };
    }
  }
  overlayPendingSegments = [...byId.values()].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}

async function hydrateOverlayTranscriptQueue() {
  if (!activeOverlaySessionId) {
    return;
  }

  const sessionState = await fetchOverlaySessionState(activeOverlaySessionId);
  if ((sessionState.queuedTranscriptEventCount || 0) > 0) {
    const events = await pullOverlayTranscriptEvents(activeOverlaySessionId);
    mergePendingSegments(events);
  }

  return sessionState;
}

function getActiveOverlayFieldTarget() {
  const targets = overlayWorkflowProfile?.fieldTargets || [];
  if (!targets.length) {
    return null;
  }

  if (activeOverlayFieldTargetIndex < 0 || activeOverlayFieldTargetIndex >= targets.length) {
    activeOverlayFieldTargetIndex = 0;
  }

  return targets[activeOverlayFieldTargetIndex] || null;
}

function moveOverlayFieldTarget(direction: 1 | -1) {
  const targets = overlayWorkflowProfile?.fieldTargets || [];
  if (!targets.length) {
    return getActiveOverlayFieldTarget();
  }

  activeOverlayFieldTargetIndex = (activeOverlayFieldTargetIndex + direction + targets.length) % targets.length;
  return getActiveOverlayFieldTarget();
}

async function pasteTextIntoActiveApp(text: string) {
  clipboard.writeText(text);

  if (process.platform !== 'darwin') {
    return {
      mode: 'clipboard_only',
      detail: 'Paste automation is currently only wired for macOS. The text is on the clipboard.',
    };
  }

  if (confirmedDesktopTarget?.automationStatus !== 'full') {
    return {
      mode: 'clipboard_only',
      detail: 'Accessibility automation is not fully available, so the current field buffer was copied to the clipboard for explicit manual paste.',
    };
  }

  const result = await tryPasteIntoActiveApp(execFile);
  if (result.mode === 'paste_keystroke') {
    return {
      mode: 'macos_paste',
      detail: result.detail,
    };
  }

  return {
    mode: 'clipboard_only',
    detail: `${result.detail} The current field buffer stays on the clipboard for manual paste.`,
  };
}

async function insertTextIntoFocusedMacField(text: string) {
  return trySetFocusedFieldValue(text, execFile);
}

async function detectActiveDesktopContext() {
  if (process.platform !== 'darwin') {
    return {
      appName: 'Unsupported platform',
      elementRole: '',
      windowTitle: '',
      focusedLabel: '',
      automationStatus: 'unavailable' as const,
      automationError: 'Desktop target confirmation is currently only wired for macOS.',
    };
  }

  return detectMacDesktopContext(execFile);
}

async function insertTextIntoCurrentField(text: string) {
  clipboard.writeText(text);

  if (process.platform !== 'darwin') {
    return {
      mode: 'clipboard_only',
      detail: 'Desktop field insertion is currently only wired for macOS. The text is on the clipboard.',
    };
  }

  const strategies = resolveDesktopInsertionStrategies({
    destinationLabel: overlayWorkflowProfile?.destinationLabel,
    desktopContext: confirmedDesktopTarget,
  });

  for (const strategy of strategies) {
    if (strategy === 'accessibility_set_value') {
      if (confirmedDesktopTarget?.automationStatus !== 'full') {
        continue;
      }
      try {
        const accessibilityAttempt = await insertTextIntoFocusedMacField(text);
        if (accessibilityAttempt.mode === 'set_value') {
          return {
            mode: 'macos_accessibility',
            detail: `Inserted text directly into the focused ${accessibilityAttempt.detail || 'field'} using accessibility value setting.`,
          };
        }
      } catch {
        // Continue to next strategy.
      }
    }

    if (strategy === 'paste_keystroke') {
      return pasteTextIntoActiveApp(text);
    }
  }

  return {
    mode: 'clipboard_only',
    detail: 'Copied the current field buffer to the clipboard for manual insertion.',
  };
}

function getCurrentFieldBufferKey() {
  return getActiveOverlayFieldTarget()?.id || 'floating-source-box';
}

function getCurrentFieldBuffer() {
  return overlayFieldBuffers[getCurrentFieldBufferKey()] || null;
}

function updateCurrentFieldBuffer(text: string) {
  const fieldTarget = getActiveOverlayFieldTarget();
  const fieldPack = resolveDesktopFieldTargetPack({
    adapter: resolveDesktopTargetAdapter({
      destinationLabel: overlayWorkflowProfile?.destinationLabel,
      desktopContext: confirmedDesktopTarget,
    }),
    fieldTargetId: fieldTarget?.id,
  });
  const fieldKey = getCurrentFieldBufferKey();
  const current = overlayFieldBuffers[fieldKey];
  const nextText = fieldPack?.preferredBehavior === 'replace'
    ? text.trim()
    : (current?.text?.trim() ? `${current.text.trim()}\n${text.trim()}` : text.trim());

  overlayFieldBuffers[fieldKey] = {
    text: nextText,
    fieldTargetId: fieldTarget?.id || fieldKey,
    fieldTargetLabel: fieldTarget?.label || 'Floating source box',
    destinationLabel: overlayWorkflowProfile?.destinationLabel,
    updatedAt: new Date().toISOString(),
    sourceCount: (current?.sourceCount || 0) + 1,
    preferredBehavior: fieldPack?.preferredBehavior,
    insertionNote: fieldPack?.insertionNote,
  };

  lastOverlayPasteBuffer = {
    text: nextText,
    fieldTargetLabel: overlayFieldBuffers[fieldKey].fieldTargetLabel,
    destinationLabel: overlayWorkflowProfile?.destinationLabel,
    committedAt: overlayFieldBuffers[fieldKey].updatedAt,
    preferredBehavior: fieldPack?.preferredBehavior,
    insertionNote: fieldPack?.insertionNote,
  };

  return overlayFieldBuffers[fieldKey];
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 500,
    height: 720,
    minWidth: 360,
    minHeight: 118,
    frame: false,
    alwaysOnTop: true,
    transparent: false,
    resizable: true,
    title: 'Mini Veranote Transfer Dock',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function registerOverlayShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+D', () => {
    if (!overlayWindow) {
      createOverlayWindow();
      return;
    }

    if (overlayWindow.isVisible()) {
      overlayWindow.hide();
    } else {
      overlayWindow.show();
      overlayWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  createOverlayWindow();
  registerOverlayShortcuts();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (!overlayWindow) {
    createOverlayWindow();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

ipcMain.handle('overlay:get-status', async () => {
  try {
    const providerPayload = await fetchOverlayProviderStatus();
    overlayCommandLibrary = await fetchOverlayCommandLibrary().catch(() => overlayCommandLibrary);
    overlayWorkflowProfile = await fetchOverlayWorkflowProfile().catch(() => overlayWorkflowProfile);
    const sessionState = activeOverlaySessionId
      ? await hydrateOverlayTranscriptQueue().catch(() => null)
      : null;

    return {
      appName: 'Veranote Dictation Overlay',
      mode: 'desktop-bridge',
      overlayVisible: overlayWindow?.isVisible() || false,
      activeSessionId: activeOverlaySessionId || null,
      activeDraftId: activeOverlayDraftId || null,
      activeDraftUrl: activeOverlayDraftUrl || null,
      pasteBuffer: lastOverlayPasteBuffer,
      lastMiniTransferAction,
      currentFieldBuffer: getCurrentFieldBuffer(),
      confirmedDesktopTarget,
      insertionStrategies: resolveDesktopInsertionStrategies({
        destinationLabel: overlayWorkflowProfile?.destinationLabel,
        desktopContext: confirmedDesktopTarget,
      }),
      providers: providerPayload.providers || [],
      commandLibrary: overlayCommandLibrary,
      workflowProfile: overlayWorkflowProfile,
      activeFieldTarget: getActiveOverlayFieldTarget(),
      defaultSelection: providerPayload.defaultSelection || null,
      sessionState,
      interimSegment: overlayInterimSegment,
      pendingSegments: overlayPendingSegments,
      providerStatus: sessionState?.providerReason || providerPayload.defaultSelection?.reason || 'Desktop bridge ready.',
      nextStep: activeOverlaySessionId
        ? (overlayPendingSegments.length
          ? 'Review the pending transcript queue and send accepted segments into Veranote.'
          : 'Keep dictating or stop the current overlay session.')
        : 'Start an overlay dictation session against the backend bridge.',
    };
  } catch (error) {
    return {
      appName: 'Veranote Dictation Overlay',
      mode: 'desktop-bridge',
      overlayVisible: overlayWindow?.isVisible() || false,
      activeSessionId: activeOverlaySessionId || null,
      activeDraftId: activeOverlayDraftId || null,
      activeDraftUrl: activeOverlayDraftUrl || null,
      pasteBuffer: lastOverlayPasteBuffer,
      lastMiniTransferAction,
      currentFieldBuffer: getCurrentFieldBuffer(),
      confirmedDesktopTarget,
      insertionStrategies: resolveDesktopInsertionStrategies({
        destinationLabel: overlayWorkflowProfile?.destinationLabel,
        desktopContext: confirmedDesktopTarget,
      }),
      providers: [],
      commandLibrary: overlayCommandLibrary,
      workflowProfile: overlayWorkflowProfile,
      activeFieldTarget: getActiveOverlayFieldTarget(),
      defaultSelection: null,
      sessionState: null,
      interimSegment: overlayInterimSegment,
      pendingSegments: overlayPendingSegments,
      providerStatus: error instanceof Error ? error.message : 'Desktop bridge unavailable.',
      nextStep: 'Set VERANOTE_APP_BASE_URL and DICTATION_DESKTOP_BRIDGE_KEY to connect the overlay.',
    };
  }
});

ipcMain.handle('overlay:start-session', async (_event: unknown, input: {
  encounterId: string;
  noteId?: string;
  targetSection?: string;
  requestedProviderId: string;
  allowMockFallback: boolean;
}) => {
  const session = await startOverlayDictationSession(input);
  activeOverlaySessionId = session.sessionId;
  activeOverlayDraftId = '';
  activeOverlayDraftUrl = '';
  lastOverlayPasteBuffer = null;
  overlayFieldBuffers = {};
  confirmedDesktopTarget = null;
  overlayPendingSegments = [];
  overlayInterimSegment = null;
  return session;
});

ipcMain.handle('overlay:stop-session', async () => {
  if (!activeOverlaySessionId) {
    return { stopped: false };
  }

  await stopOverlayDictationSession(activeOverlaySessionId);
  activeOverlaySessionId = '';
  overlayInterimSegment = null;
  return { stopped: true };
});

ipcMain.handle('overlay:accept-segment', async (_event: unknown, input: { segmentId: string }) => {
  if (!activeOverlaySessionId) {
    throw new Error('No active overlay session.');
  }

  const segment = overlayPendingSegments.find((item) => item.id === input.segmentId);
  if (!segment) {
    throw new Error('Transcript segment not found.');
  }

  const committed = await commitOverlayTranscriptSegment({
    sessionId: activeOverlaySessionId,
    segment,
    draftId: activeOverlayDraftId || undefined,
    destinationMode: overlayWorkflowProfile?.speechBoxMode,
    destinationFieldId: getActiveOverlayFieldTarget()?.id,
    destinationFieldLabel: getActiveOverlayFieldTarget()?.label,
  });

  activeOverlayDraftId = committed.draftId;
  activeOverlayDraftUrl = committed.draftUrl;
  updateCurrentFieldBuffer(segment.text);
  overlayPendingSegments = overlayPendingSegments.filter((item) => item.id !== input.segmentId);

  return {
    ...committed,
    pendingCount: overlayPendingSegments.length,
  };
});

ipcMain.handle('overlay:discard-segment', async (_event: unknown, input: { segmentId: string }) => {
  overlayPendingSegments = overlayPendingSegments.filter((item) => item.id !== input.segmentId);
  if (overlayInterimSegment?.id === input.segmentId) {
    overlayInterimSegment = null;
  }
  return {
    pendingCount: overlayPendingSegments.length,
  };
});

ipcMain.handle('overlay:open-draft', async () => {
  if (!activeOverlayDraftUrl) {
    return { opened: false };
  }

  await shell.openExternal(activeOverlayDraftUrl.startsWith('http')
    ? activeOverlayDraftUrl
    : `${process.env.VERANOTE_APP_BASE_URL || 'http://127.0.0.1:3000'}${activeOverlayDraftUrl}`);
  return { opened: true };
});

ipcMain.handle('overlay:next-target', async () => {
  return {
    activeFieldTarget: moveOverlayFieldTarget(1),
  };
});

ipcMain.handle('overlay:previous-target', async () => {
  return {
    activeFieldTarget: moveOverlayFieldTarget(-1),
  };
});

ipcMain.handle('overlay:commit-command', async (_event: unknown, input: {
  commandId: string;
  targetSection?: string;
}) => {
  if (!activeOverlaySessionId) {
    throw new Error('No active overlay session.');
  }

  const command = overlayCommandLibrary.find((item) => item.id === input.commandId);
  if (!command?.outputText) {
    throw new Error('Stored command not available.');
  }

  const sessionState = await fetchOverlaySessionState(activeOverlaySessionId);
  const targetSection = input.targetSection || 'clinicianNotes';
  const committed = await commitOverlayTranscriptSegment({
    sessionId: activeOverlaySessionId,
    draftId: activeOverlayDraftId || undefined,
    destinationMode: overlayWorkflowProfile?.speechBoxMode,
    destinationFieldId: getActiveOverlayFieldTarget()?.id,
    destinationFieldLabel: getActiveOverlayFieldTarget()?.label,
    segment: {
      id: `overlay-command-${Math.random().toString(36).slice(2, 10)}`,
      dictationSessionId: activeOverlaySessionId,
      encounterId: 'overlay-command',
      noteId: activeOverlayDraftId || undefined,
      targetSection,
      text: command.outputText,
      normalizedText: command.outputText,
      isFinal: true,
      reviewStatus: 'reviewed',
      reviewFlags: [],
      source: {
        provider: sessionState.activeProviderLabel || 'overlay-command',
        modelOrEngine: sessionState.engineLabel,
        mode: 'manual',
      },
      createdAt: new Date().toISOString(),
    },
  });

  activeOverlayDraftId = committed.draftId;
  activeOverlayDraftUrl = committed.draftUrl;
  updateCurrentFieldBuffer(command.outputText);

  return committed;
});

ipcMain.handle('overlay:confirm-target', async () => {
  const context = await detectActiveDesktopContext();
  const adapter = resolveDesktopTargetAdapter({
    destinationLabel: overlayWorkflowProfile?.destinationLabel,
    desktopContext: context,
  });
  const suggestedFieldTarget = resolveBestWorkflowFieldTarget({
    workflowProfile: overlayWorkflowProfile,
    desktopContext: context,
    adapter,
  });

  if (suggestedFieldTarget && overlayWorkflowProfile?.fieldTargets?.length) {
    const suggestedIndex = overlayWorkflowProfile.fieldTargets.findIndex((target) => target.id === suggestedFieldTarget.id);
    if (suggestedIndex >= 0) {
      activeOverlayFieldTargetIndex = suggestedIndex;
    }
  }

  const fieldPack = resolveDesktopFieldTargetPack({
    adapter,
    fieldTargetId: getActiveOverlayFieldTarget()?.id,
  });

  confirmedDesktopTarget = {
    appName: context.appName,
    elementRole: context.elementRole,
    windowTitle: context.windowTitle,
    focusedLabel: context.focusedLabel,
    automationStatus: context.automationStatus,
    automationError: context.automationError,
    adapterId: adapter?.id,
    adapterLabel: adapter?.label,
    fieldTargetId: getActiveOverlayFieldTarget()?.id,
    fieldTargetLabel: getActiveOverlayFieldTarget()?.label,
    fieldTargetBehavior: fieldPack?.preferredBehavior,
    fieldTargetNote: fieldPack?.insertionNote,
    confirmedAt: new Date().toISOString(),
  };
  return {
    ...confirmedDesktopTarget,
    automationStatus: context.automationStatus,
    automationError: context.automationError,
  };
});

ipcMain.handle('overlay:paste-current-field', async () => {
  const currentFieldBuffer = getCurrentFieldBuffer();
  if (!currentFieldBuffer?.text?.trim()) {
    throw new Error('No held text is ready for the current field target.');
  }

  const result = await insertTextIntoCurrentField(currentFieldBuffer.text);
  return {
    ...result,
    pasteBuffer: currentFieldBuffer,
  };
});

ipcMain.handle('overlay:copy-transfer-section', async (_event: unknown, input: {
  sectionId: string;
  sectionLabel: string;
  ehrLabel?: string;
  text: string;
}) => {
  const text = input.text.trim();
  if (!text) {
    throw new Error('No section text is ready to copy.');
  }

  clipboard.writeText(text);
  const completedAt = new Date().toISOString();
  lastMiniTransferAction = {
    sectionId: input.sectionId,
    sectionLabel: input.sectionLabel,
    ehrLabel: input.ehrLabel,
    action: 'copied',
    mode: 'clipboard_only',
    detail: `${input.sectionLabel} copied to clipboard for provider-controlled paste.`,
    completedAt,
  };
  lastOverlayPasteBuffer = {
    text,
    fieldTargetLabel: input.sectionLabel,
    destinationLabel: input.ehrLabel,
    committedAt: completedAt,
    preferredBehavior: 'append',
    insertionNote: 'Mini Veranote copied this section only after an explicit provider click.',
  };

  return lastMiniTransferAction;
});

ipcMain.handle('overlay:paste-transfer-section', async (_event: unknown, input: {
  sectionId: string;
  sectionLabel: string;
  ehrLabel?: string;
  text: string;
}) => {
  const text = input.text.trim();
  if (!text) {
    throw new Error('No section text is ready to paste.');
  }

  const result = await insertTextIntoCurrentField(text);
  const completedAt = new Date().toISOString();
  lastMiniTransferAction = {
    sectionId: input.sectionId,
    sectionLabel: input.sectionLabel,
    ehrLabel: input.ehrLabel,
    action: 'pasted',
    mode: result.mode,
    detail: result.detail,
    completedAt,
  };
  lastOverlayPasteBuffer = {
    text,
    fieldTargetLabel: input.sectionLabel,
    destinationLabel: input.ehrLabel,
    committedAt: completedAt,
    preferredBehavior: 'append',
    insertionNote: 'Mini Veranote attempted insertion only after an explicit provider click; clipboard fallback remains available.',
  };

  return lastMiniTransferAction;
});

ipcMain.handle('overlay:set-compact-mode', async (_event: unknown, input: { compact: boolean }) => {
  if (overlayWindow) {
    overlayWindow.setSize(input.compact ? 360 : 500, input.compact ? 118 : 720);
  }
  return { compact: input.compact };
});

ipcMain.handle('overlay:hide-window', async () => {
  overlayWindow?.hide();
  return { hidden: true };
});

ipcMain.handle('overlay:upload-chunk', async (_event: unknown, input: {
  chunk: {
    sessionId: string;
    sequence: number;
    base64Audio: string;
    mimeType: string;
    sizeBytes: number;
    capturedAt: string;
  };
}) => {
  if (!activeOverlaySessionId) {
    throw new Error('No active overlay session.');
  }

  return uploadOverlayAudioChunk({
    sessionId: activeOverlaySessionId,
    chunk: input.chunk,
  });
});
