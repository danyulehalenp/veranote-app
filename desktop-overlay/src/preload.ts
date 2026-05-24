import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('veranoteOverlay', {
  getStatus: () => ipcRenderer.invoke('overlay:get-status'),
  startSession: (input: {
    encounterId: string;
    noteId?: string;
    targetSection?: string;
    requestedProviderId: string;
    allowMockFallback: boolean;
  }) => ipcRenderer.invoke('overlay:start-session', input),
  stopSession: () => ipcRenderer.invoke('overlay:stop-session'),
  acceptSegment: (segmentId: string) => ipcRenderer.invoke('overlay:accept-segment', { segmentId }),
  discardSegment: (segmentId: string) => ipcRenderer.invoke('overlay:discard-segment', { segmentId }),
  openDraft: () => ipcRenderer.invoke('overlay:open-draft'),
  nextTarget: () => ipcRenderer.invoke('overlay:next-target'),
  previousTarget: () => ipcRenderer.invoke('overlay:previous-target'),
  confirmTarget: () => ipcRenderer.invoke('overlay:confirm-target'),
  pasteCurrentField: () => ipcRenderer.invoke('overlay:paste-current-field'),
  copyTransferSection: (input: {
    sectionId: string;
    sectionLabel: string;
    ehrLabel?: string;
    text: string;
  }) => ipcRenderer.invoke('overlay:copy-transfer-section', input),
  pasteTransferSection: (input: {
    sectionId: string;
    sectionLabel: string;
    ehrLabel?: string;
    text: string;
  }) => ipcRenderer.invoke('overlay:paste-transfer-section', input),
  readClipboardText: () => ipcRenderer.invoke('overlay:read-clipboard-text'),
  setCompactMode: (input: { compact: boolean }) => ipcRenderer.invoke('overlay:set-compact-mode', input),
  hideWindow: () => ipcRenderer.invoke('overlay:hide-window'),
  commitCommand: (input: {
    commandId: string;
    targetSection?: string;
  }) => ipcRenderer.invoke('overlay:commit-command', input),
  uploadChunk: (chunk: {
    sessionId: string;
    sequence: number;
    base64Audio: string;
    mimeType: string;
    sizeBytes: number;
    capturedAt: string;
  }) => ipcRenderer.invoke('overlay:upload-chunk', { chunk }),
});
