# Mini Veranote Transfer Dock

This package is the desktop companion for Veranote. It runs as an always-on-top Electron window that can sit over a provider's EHR while the provider transfers reviewed note sections.

## Safety Model

Mini Veranote is provider-controlled:

- It does not silently write into an EHR.
- It copies or pastes only after an explicit button click.
- If macOS accessibility insertion is unavailable, it falls back to clipboard-only transfer.
- The provider still chooses the destination EHR field and reviews the text before transfer.

## Current Features

- Always-on-top floating dock.
- Frameless draggable header.
- Minimized mode and hide button.
- EHR target selector for WellSky, Tebra/Kareo, Epic, athenaOne, Valant, TherapyNotes, SimplePractice, ICANotes, and Generic EHR.
- Note package selector for psych follow-up, psych evaluation, therapy progress, and discharge/transition notes.
- Section queue with editable text, copy, paste, next section, mark done, and reset checklist actions.
- Active EHR field confirmation using the existing macOS desktop-context bridge.
- Existing dictation bridge remains available in a secondary panel.

## Running Locally

Build first:

```bash
npm --prefix desktop-overlay run build
```

Then launch:

```bash
npm --prefix desktop-overlay run dev
```

The global hotkey is:

```text
Cmd/Ctrl + Shift + D
```

## Validation

Static transfer-dock wiring:

```bash
npm --prefix desktop-overlay run validate:transfer-dock
```

TypeScript build:

```bash
npm --prefix desktop-overlay run build
```

Desktop insertion smoke check:

```bash
npm --prefix desktop-overlay run validate:desktop
```

`validate:desktop` can be blocked by macOS Accessibility permissions or by not having a text field focused. That does not mean the provider-controlled clipboard fallback is broken.

## Next Product Steps

1. Feed final Veranote draft sections from the web app directly into the transfer queue.
2. Add EHR-specific field recipes after observing real provider copy/paste workflows.
3. Add source evidence badges beside each section so providers can confirm traceability before transfer.
4. Package and notarize the overlay after the workflow is stable.
