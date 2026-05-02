# Veranote Dictation + Ambient UI Handoff

Last updated: 2026-04-25
Audience: parallel feature threads working on dictation and ambient listening
Purpose: define exact UI placement, ownership, and integration expectations so both modules land cleanly in the current Veranote workflow

## 1. Product Decision Summary

Veranote should treat these two features differently:

- `Ambient listening` is a session-level encounter mode
- `Dictation` is a source-capture mode

They should not compete for the same visual role.

The intended workspace model is:

1. `Encounter control`
2. `Source capture`
3. `Draft + review`
4. `Finish to EHR`

This means:

- ambient belongs in `Encounter control`
- dictation belongs in `Source capture`
- transcript review belongs near `Source capture` and `Draft + review`
- Vera stays beside `Draft + review`

## 2. Final Placement Decision

### Ambient listening

Ambient listening should live in the top workspace/session command band, above the source panel.

It should be presented as:
- `Start ambient session`
- `Pause`
- `Resume`
- `Stop + generate`
- live session state
- timer / mic state / consent state / encounter summary

Ambient should feel like the current visit is being captured across the whole page, not like the user opened a widget inside one input card.

### Dictation

Dictation should live inside the source workspace as a dedicated source mode.

It should be presented as one of the source modes/tabs:
- `Manual`
- `Dictation`
- `Transcript`
- `Objective`
- `Imported` later if needed

Dictation is not a top-level encounter controller. It is provider-directed voice input into the note source workflow.

### Transcript

Transcript should have its own dedicated source/review mode.

This applies to:
- ambient transcript
- provider-dictated transcript history when useful

Transcript should not be hidden as just more stacked text fields.

### Vera

Vera remains adjacent to review/editing, not adjacent to live capture controls.

Her role stays:
- explain
- verify
- rewrite
- remember
- help finish the note

She should be aware of ambient/dictation state, but not physically colocated with the recorder controls.

## 3. Current Veranote File Ownership Map

These are the most relevant existing integration points.

### Core workspace
- [components/note/new-note-form.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/new-note-form.tsx)
- [components/note/review-workspace.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/review-workspace.tsx)
- [app/page.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/app/page.tsx)
- [app/dashboard/new-note/page.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/app/dashboard/new-note/page.tsx)

### Dictation lane
- [components/note/dictation/dictation-control-bar.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/dictation/dictation-control-bar.tsx)
- [components/note/dictation/dictation-transcript-panel.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/dictation/dictation-transcript-panel.tsx)
- [components/note/dictation/dictation-command-manager.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/dictation/dictation-command-manager.tsx)
- [app/api/dictation/sessions/route.ts](/Users/danielhale/.openclaw/workspace/app-prototype/app/api/dictation/sessions/route.ts)
- [app/api/dictation/sessions/[sessionId]/route.ts](/Users/danielhale/.openclaw/workspace/app-prototype/app/api/dictation/sessions/[sessionId]/route.ts)

### Ambient lane
- [components/note/ambient/ambient-control-bar.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/ambient/ambient-control-bar.tsx)
- [components/note/ambient/ambient-transcript-workspace.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/ambient/ambient-transcript-workspace.tsx)
- [components/note/ambient/ambient-draft-review-panel.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/ambient/ambient-draft-review-panel.tsx)
- [app/api/ambient/sessions/route.ts](/Users/danielhale/.openclaw/workspace/app-prototype/app/api/ambient/sessions/route.ts)
- [app/api/ambient/sessions/[sessionId]/route.ts](/Users/danielhale/.openclaw/workspace/app-prototype/app/api/ambient/sessions/[sessionId]/route.ts)

### Vera lane
- [components/veranote/assistant/assistant-shell.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/veranote/assistant/assistant-shell.tsx)
- [components/veranote/assistant/assistant-panel.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/veranote/assistant/assistant-panel.tsx)
- [components/veranote/assistant/thread-view.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/veranote/assistant/thread-view.tsx)

## 4. Wireframe-Level Layout Contract

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Top nav                                                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│ Encounter control bar                                                       │
│ [Start ambient] [Pause] [Resume] [Stop + Generate] session state / preset   │
├───────────────────────┬───────────────────────────────────┬──────────────────┤
│ Source capture        │ Draft + review                    │ Vera + Evidence  │
│ [Manual]              │ note draft                        │ Vera thread      │
│ [Dictation]           │ expected sections                 │ quick actions    │
│ [Transcript]          │ reason tags                       │ memory/context   │
│ [Objective]           │ review start cue                  │ evidence/support │
├───────────────────────┴───────────────────────────────────┴──────────────────┤
│ Finish to EHR                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 5. Ownership Boundaries For Parallel Threads

### Ambient thread owns

- encounter/session-level capture controls
- ambient transcript state and transcript workspace
- consent/session state surfaces
- ambient-to-draft handoff behavior

Ambient thread should avoid:
- turning ambient into a permanent replacement for the source panel
- moving Vera
- redesigning the finish/export lane
- embedding ambient controls deep inside dictation UI

### Dictation thread owns

- dictation source mode
- provider voice capture controls
- live interim transcript / pending insertion flow
- dictation command layer / insertion targeting
- dictation history and section insertion behavior

Dictation thread should avoid:
- presenting dictation as a top-level encounter controller
- taking over the entire left panel with dictation-only assumptions
- replacing transcript review patterns needed for ambient

### Shared contract

Both threads must assume:
- there is one unified note workflow
- both features feed the same draft/review pipeline
- source provenance matters
- transcript-derived content must remain reviewable

## 6. Exact UI Expectations

### Ambient expectations

Ambient should produce:
- visible active session state
- transcript output that can be reviewed in a dedicated mode
- clear “stop and send to draft/review” action
- session status that persists while working elsewhere on the note

Ambient should not:
- look like a tiny mic widget buried in the source stack
- hijack the finish lane
- sit inside Vera

### Dictation expectations

Dictation should produce:
- record / pause / stop controls
- target section awareness
- interim transcript
- pending segments
- insert/commit flow into the appropriate source section

Dictation should not:
- masquerade as the ambient encounter mode
- force providers into transcript review if they are just dictating a source section

### Review expectations

Review should eventually show provenance cues such as:
- sourced from ambient transcript
- sourced from provider dictation
- sourced from manual entry

This should be additive trust metadata, not heavy visual noise.

## 7. Concrete Integration Targets In Current Code

### Highest-value integration point

Primary integration file:
- [components/note/new-note-form.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/new-note-form.tsx)

Reason:
- this is already the source-to-draft orchestration layer
- both dictation and ambient should plug into this page model

### Ambient should integrate into

Inside `new-note-form.tsx`:
- top command/status area
- source-mode switcher as the producer of `Transcript` state
- draft generation handoff

Likely refactor target:
- add a formal `encounter control bar` region rather than leaving ambient UI buried in a lower panel

### Dictation should integrate into

Inside `new-note-form.tsx`:
- source-mode switcher
- active source pane body
- section targeting state

Likely refactor target:
- lift dictation out of the generic stacked source-entry area into a dedicated `Dictation` mode pane

### Review should integrate into

- [components/note/review-workspace.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/review-workspace.tsx)

Needed additions later:
- provenance badges
- transcript-linked evidence hooks
- ambient/dictation-aware reason tags when useful

## 8. Recommended Build Sequence

To avoid collision between threads:

1. Ambient thread:
   - build session state model and top encounter control band
   - expose transcript mode output contract

2. Dictation thread:
   - build dictation source mode UI
   - keep insertion flow aligned to existing source sections

3. Shared integration pass:
   - introduce unified source-mode switcher in `new-note-form.tsx`
   - mount ambient transcript and dictation as separate modes

4. Review pass:
   - add provenance cues in `review-workspace.tsx`

5. Vera pass:
   - make assistant context aware of current source mode and encounter state

## 9. Non-Goals For This Phase

Do not do these during module landing:

- do not redesign the full finish/export system
- do not move Vera into the capture area
- do not create separate standalone note pages for ambient vs dictation
- do not fork the workflow into “ambient version” and “dictation version”
- do not hide transcript review behind advanced settings

## 10. Final Product Framing

Veranote should teach the user this mental model:

- `Ambient listening` = capture the encounter
- `Dictation` = add or correct source by voice
- `Transcript` = review the spoken source
- `Review` = make the note trustworthy
- `Vera` = help think, rewrite, verify, and remember
- `Finish` = paste safely into the EHR

## 11. Immediate Recommendation To Both Threads

If either thread has to choose between:
- building itself as a standalone big feature surface, or
- fitting into this shared encounter workflow

choose the shared encounter workflow.

That will make the final Veranote product feel like one intentional system instead of three adjacent tools.
