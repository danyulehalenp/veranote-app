# Veranote Dictation Overlay

This is the desktop scaffold for the future always-on-top dictation speech box.

## Purpose

The web module is now strong at:

- mic capture
- backend transcription sessions
- review-first insertion
- provider selection and fallback visibility
- stored command expansion

This desktop package is the next layer for:

- always-on-top speech box
- global hotkeys
- desktop target routing
- future EHR field insertion

## Current State

- Electron shell scaffold
- frameless always-on-top overlay window
- preload bridge
- placeholder overlay UI
- status IPC seam

## Next Steps

1. Wire overlay controls to `/api/dictation/providers`
2. Start / pause / stop backend dictation sessions from the overlay
3. Show live transcript preview in the floating speech box
4. Route reviewed text back into Veranote source lanes
5. Add target picker for EHR field workflows
