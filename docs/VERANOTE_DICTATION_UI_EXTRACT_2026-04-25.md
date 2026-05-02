# Veranote Dictation UI Extract

Last updated: 2026-04-25
Derived from: [VERANOTE_DICTATION_AMBIENT_UI_HANDOFF_2026-04-25.md](/Users/danielhale/.openclaw/workspace/app-prototype/docs/VERANOTE_DICTATION_AMBIENT_UI_HANDOFF_2026-04-25.md)
Audience: dictation module thread only
Purpose: isolate the exact design contract, ownership, and integration expectations for the dictation lane without ambient-listening overlap

## 1. Dictation Product Role

Dictation is a `source-capture mode`, not an encounter-wide session controller.

The intended Veranote workspace order remains:

1. `Encounter control`
2. `Source capture`
3. `Draft + review`
4. `Finish to EHR`

For dictation, this means:

- dictation belongs in `Source capture`
- dictation feeds the existing source workflow
- dictation transcript review should stay close to source capture and review
- Vera should stay adjacent to drafting/review, not the live recorder controls

## 2. Placement Decision

Dictation should live inside the source workspace as a dedicated source mode.

The source-mode model should be:

- `Manual`
- `Dictation`
- `Transcript`
- `Objective`
- `Imported` later if needed

Dictation should not appear as:

- a top-level encounter controller
- a full-page replacement for the source panel
- an ambient-style session shell

## 3. Dictation UI Contract

Dictation should produce:

- record / pause / stop controls
- target section awareness
- interim transcript visibility
- pending reviewed segments
- insert / commit flow into the correct source section
- command-driven insertion support
- dictation history when useful

Dictation should not:

- masquerade as encounter capture
- force ambient-review assumptions onto simple voice correction workflows
- take over the whole left/source side with dictation-only layout decisions

## 4. Transcript Contract For Dictation

Transcript should have its own dedicated source/review mode.

For the dictation lane, that means:

- provider-dictated transcript history can live in `Transcript`
- transcript review should remain visible and reviewable
- transcript should not be hidden as extra stacked text areas

Dictation transcript review should support provenance later, but without noisy UI.

## 5. Ownership Boundaries

The dictation thread owns:

- dictation source mode
- provider voice capture controls
- live interim transcript / pending insertion flow
- dictation command layer
- insertion targeting
- dictation history
- section insertion behavior

The dictation thread should avoid:

- presenting dictation as the encounter-wide capture mode
- redesigning the top ambient command band
- moving Vera
- replacing transcript review patterns needed by ambient
- redesigning the finish/export lane

## 6. Core Integration Files

Primary integration file:

- [components/note/new-note-form.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/new-note-form.tsx)

Reason:

- this is already the source-to-draft orchestration layer
- dictation should plug into this page model instead of becoming a separate workflow

Most relevant dictation files:

- [components/note/dictation/dictation-control-bar.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/dictation/dictation-control-bar.tsx)
- [components/note/dictation/dictation-transcript-panel.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/dictation/dictation-transcript-panel.tsx)
- [components/note/dictation/dictation-command-manager.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/dictation/dictation-command-manager.tsx)
- [app/api/dictation/sessions/route.ts](/Users/danielhale/.openclaw/workspace/app-prototype/app/api/dictation/sessions/route.ts)
- [app/api/dictation/sessions/[sessionId]/route.ts](/Users/danielhale/.openclaw/workspace/app-prototype/app/api/dictation/sessions/[sessionId]/route.ts)

Downstream review surface:

- [components/note/review-workspace.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/review-workspace.tsx)

## 7. Exact Integration Expectations In `new-note-form.tsx`

Dictation should integrate into:

- the source-mode switcher
- the active source pane body
- section targeting state

Likely refactor direction:

- lift dictation out of the generic stacked source-entry area
- mount it as a dedicated `Dictation` mode pane
- keep insertion aligned to the existing source sections

Review-related additions for later:

- provenance badges
- transcript-linked evidence hooks
- ambient/dictation-aware reason tags where useful

## 8. Non-Goals For The Dictation Thread

Do not do these as part of dictation landing:

- redesign the full finish/export system
- move Vera into the capture area
- create a separate dictation-only note page
- fork the workflow into separate ambient and dictation note experiences
- hide transcript review behind advanced settings

## 9. Dictation Mental Model

Veranote should teach the user:

- `Dictation` = add or correct source by voice
- `Transcript` = review the spoken source
- `Review` = make the note trustworthy
- `Finish` = paste safely into the EHR

## 10. Immediate Dictation Recommendation

If there is a choice between:

- building dictation as a large standalone recorder surface, or
- fitting dictation into the shared source-to-draft workflow

choose the shared workflow.

That keeps Veranote feeling like one system instead of separate voice tools bolted onto the note.
