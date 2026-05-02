# Veranote Ambient Listening UI Implementation Plan

Date: 2026-04-24

Status: implementation planning document

Companion docs:

- [/Users/danielhale/.openclaw/workspace/app-prototype/docs/VERANOTE_AMBIENT_LISTENING_PRODUCT_DIRECTION_2026-04-24.md](/Users/danielhale/.openclaw/workspace/app-prototype/docs/VERANOTE_AMBIENT_LISTENING_PRODUCT_DIRECTION_2026-04-24.md)
- [/Users/danielhale/.openclaw/workspace/app-prototype/docs/VERANOTE_AMBIENT_LISTENING_V1_IMPLEMENTATION_SPEC_2026-04-24.md](/Users/danielhale/.openclaw/workspace/app-prototype/docs/VERANOTE_AMBIENT_LISTENING_V1_IMPLEMENTATION_SPEC_2026-04-24.md)
- [/Users/danielhale/.openclaw/workspace/app-prototype/components/note/dictation/dictation-control-bar.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/dictation/dictation-control-bar.tsx)
- [/Users/danielhale/.openclaw/workspace/app-prototype/components/note/dictation/dictation-transcript-panel.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/dictation/dictation-transcript-panel.tsx)

This document defines the first UI slice for ambient listening inside Veranote.

The goal is to make the first implementation buildable with a stable component map, event model, and mock data shape.

## 1. UI Objectives

The UI must do four things well:

- make recording state unmissable
- make speaker attribution visible and correctable
- make source-to-draft traceability easy to inspect
- make provider acceptance deliberate and safe

If the UI does not help the provider answer `who said this?`, `how certain is this?`, and `why is this sentence in the draft?`, then it is not ready.

## 2. Surface Map

The initial ambient UI should be built from five coordinated surfaces:

1. ambient session launcher
2. consent gate sheet
3. ambient control bar
4. diarized transcript workspace
5. evidence-linked draft review panel

Optional sixth surface for the same first milestone:

6. speaker correction drawer

## 3. Placement In Veranote

### Initial entry points

Ambient should initially appear only in internal or guarded surfaces:

- source-entry tools area in the new-note workflow
- internal settings / capability panel
- dedicated internal test route later if needed

### Recommended placement in compose flow

Ambient should appear as a sibling to dictation, not a replacement for it.

Recommended placement:

- `Add source`
- `Dictation`
- `Ambient (internal)`

Ambient should visually signal higher caution than dictation:

- warmer review tone
- explicit consent badge
- stronger “draft-only” language

## 4. Component Plan

### A. `AmbientSessionLauncher`

Purpose:

- setup before any recording begins

Responsibilities:

- choose ambient mode
- choose care setting
- define participants
- display jurisdiction and consent requirements
- create local session shell

Suggested props:

```ts
type AmbientSessionLauncherProps = {
  enabled: boolean;
  defaultMode: AmbientListeningMode;
  defaultCareSetting: AmbientCareSetting;
  availableModes: AmbientListeningMode[];
  onStartSetup: (payload: AmbientSessionSetupDraft) => void;
  onCancel: () => void;
};
```

Suggested local draft model:

```ts
type AmbientSessionSetupDraft = {
  mode: AmbientListeningMode;
  careSetting: AmbientCareSetting;
  providerState?: string | null;
  patientState?: string | null;
  participants: Array<{
    participantId: string;
    role: AmbientParticipantRole;
    displayLabel: string;
    minorOrDependent: boolean;
  }>;
};
```

UI contents:

- mode picker
- care setting picker
- participant table
- consent requirement preview
- start button

### B. `AmbientConsentGateSheet`

Purpose:

- collect or confirm participant consent before recording

Responsibilities:

- show consent requirement summary
- collect method and status per participant
- prevent record start if policy blocks

Suggested props:

```ts
type AmbientConsentGateSheetProps = {
  open: boolean;
  sessionId: string;
  participants: AmbientParticipant[];
  requiresAllAudibleParticipants: boolean;
  approvedScriptVersion?: string | null;
  onSaveConsent: (events: AmbientConsentEventDraft[]) => void;
  onConfirmReady: () => void;
  onCancel: () => void;
};
```

Draft event model:

```ts
type AmbientConsentEventDraft = {
  participantId: string;
  status: 'granted' | 'declined' | 'withdrawn';
  method: AmbientConsentMethod;
  scope: AmbientConsentScope;
  notes?: string | null;
};
```

UI contents:

- participant rows
- granted / declined state
- method selector
- scope summary
- blocking warning banner if consent is incomplete

### C. `AmbientControlBar`

Purpose:

- persistent encounter-state header during live ambient capture

This should visually evolve from the dictation control bar pattern, but add ambient-specific state.

Responsibilities:

- show session state
- show active mode / care setting
- show consent-ready state
- show recording state clearly
- surface pause / off-record / stop

Suggested props:

```ts
type AmbientControlBarProps = {
  enabled: boolean;
  sessionState: AmbientSessionState;
  mode: AmbientListeningMode;
  careSetting: AmbientCareSetting;
  recordingActive: boolean;
  consentSummaryLabel: string;
  participantSummaryLabel: string;
  providerLabel: string;
  elapsedSeconds: number;
  helperText: string;
  onStartRecording: () => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  onOffRecordStart: () => void;
  onOffRecordEnd: () => void;
  onStopRecording: () => void;
};
```

UI badges:

- `Consent ready`
- `Recording`
- `Off record`
- `Draft only`
- `Speaker review required`

### D. `AmbientTranscriptWorkspace`

Purpose:

- main review surface for transcript turns

Responsibilities:

- display diarized turns
- expose speaker confidence and text confidence
- enable turn-level actions
- surface flags inline

Suggested props:

```ts
type AmbientTranscriptWorkspaceProps = {
  sessionId: string;
  turns: AmbientTranscriptTurnViewModel[];
  selectedTurnId?: string;
  onSelectTurn: (turnId: string) => void;
  onRelabelSpeaker: (turnId: string, role: AmbientParticipantRole) => void;
  onExcludeTurn: (turnId: string) => void;
  onRestoreTurn: (turnId: string) => void;
  onMarkProviderConfirmed: (turnId: string) => void;
  onOpenSpeakerCorrection: (turnId: string) => void;
};
```

View model:

```ts
type AmbientTranscriptTurnViewModel = AmbientTranscriptTurn & {
  severityBadges: string[];
  attributionNeedsReview: boolean;
  textNeedsReview: boolean;
  linkedDraftSentenceIds: string[];
};
```

Transcript row layout:

- left: speaker chip
- center: text and timestamps
- right: confidence and action cluster

Turn actions:

- `Relabel`
- `Exclude`
- `Restore`
- `Provider-confirm`
- `Correct speaker`

### E. `AmbientSpeakerCorrectionDrawer`

Purpose:

- focused correction workflow for diarization issues

Responsibilities:

- allow precise role correction
- handle uncertain / unresolved speaker cases
- support split / merge later if needed

Suggested props:

```ts
type AmbientSpeakerCorrectionDrawerProps = {
  open: boolean;
  turn: AmbientTranscriptTurnViewModel | null;
  participantOptions: AmbientParticipant[];
  onAssignRole: (turnId: string, role: AmbientParticipantRole) => void;
  onAssignSpeakerLabel: (turnId: string, speakerLabel: string | null) => void;
  onMarkUnresolved: (turnId: string) => void;
  onClose: () => void;
};
```

Minimum V1 actions:

- assign role
- assign label
- mark unresolved

Later-only actions:

- split turn
- merge adjacent turns

### F. `AmbientDraftReviewPanel`

Purpose:

- review note-ready content with evidence support

Responsibilities:

- show sectioned draft
- show evidence support for each sentence
- surface sentence-level accept / reject
- jump back to transcript source

Suggested props:

```ts
type AmbientDraftReviewPanelProps = {
  sessionId: string;
  sections: AmbientDraftSectionViewModel[];
  reviewFlags: AmbientReviewFlag[];
  onAcceptSentence: (sentenceId: string) => void;
  onRejectSentence: (sentenceId: string) => void;
  onEditSentence: (sentenceId: string, text: string) => void;
  onJumpToSource: (turnId: string) => void;
  onAcceptSection: (sectionId: string) => void;
};
```

Suggested section model:

```ts
type AmbientDraftSectionViewModel = {
  sectionId: string;
  label: string;
  sentences: Array<AmbientDraftSentence & {
    supportSummary: string;
    primaryTurnIds: string[];
    blockingFlagIds: string[];
    accepted: boolean;
  }>;
};
```

Sentence actions:

- `Accept`
- `Reject`
- `Edit`
- `Jump to source`

## 5. Layout Recommendation

### Desktop layout

Recommended three-zone layout:

- top: ambient control bar
- left: transcript workspace
- right: draft review panel
- overlay/drawer: consent gate and speaker correction

### Tablet / narrower layout

- top: control bar
- tabs:
  - transcript
  - draft
  - flags
- drawer: speaker correction

### Mobile / very narrow internal view

Not a priority for V1 ambient alpha.

If needed, use stacked cards and collapse transcript actions behind a sheet.

## 6. Interaction Rules

### Recording rules

- if session state is not `ready_to_record`, `Start recording` must be disabled
- if `off_record` is active, transcript input should visibly stop
- if consent becomes invalid mid-session, stop further capture and show blocking state

### Speaker rules

- low-confidence speaker turns must show a visible review style
- turns with unresolved speaker must not silently feed strong draft claims
- if provider changes speaker role after draft generation, affected draft sentences should be marked stale and re-reviewed

### Draft rules

- sentence accept should be disabled if sentence has unresolved blocking flags
- section accept should summarize blocking items before commit
- `Jump to source` should always target the relevant transcript turn

## 7. Event Contracts

The UI should be designed around explicit events instead of hidden mutation.

### Session events

```ts
type AmbientUiSessionEvent =
  | { type: 'ambient_session_setup_started'; payload: AmbientSessionSetupDraft }
  | { type: 'ambient_consent_saved'; payload: AmbientConsentEventDraft[] }
  | { type: 'ambient_recording_started'; payload: { sessionId: string } }
  | { type: 'ambient_recording_paused'; payload: { sessionId: string } }
  | { type: 'ambient_off_record_started'; payload: { sessionId: string } }
  | { type: 'ambient_off_record_ended'; payload: { sessionId: string } }
  | { type: 'ambient_recording_stopped'; payload: { sessionId: string } };
```

### Transcript review events

```ts
type AmbientUiTranscriptEvent =
  | { type: 'ambient_turn_selected'; payload: { sessionId: string; turnId: string } }
  | { type: 'ambient_turn_relabel_requested'; payload: { sessionId: string; turnId: string; role: AmbientParticipantRole } }
  | { type: 'ambient_turn_excluded'; payload: { sessionId: string; turnId: string } }
  | { type: 'ambient_turn_restored'; payload: { sessionId: string; turnId: string } }
  | { type: 'ambient_turn_provider_confirmed'; payload: { sessionId: string; turnId: string } };
```

### Draft review events

```ts
type AmbientUiDraftEvent =
  | { type: 'ambient_sentence_accept_requested'; payload: { sessionId: string; sentenceId: string } }
  | { type: 'ambient_sentence_reject_requested'; payload: { sessionId: string; sentenceId: string } }
  | { type: 'ambient_sentence_edit_requested'; payload: { sessionId: string; sentenceId: string; text: string } }
  | { type: 'ambient_jump_to_source_requested'; payload: { sessionId: string; turnId: string } }
  | { type: 'ambient_section_accept_requested'; payload: { sessionId: string; sectionId: string } };
```

## 8. Mock Payloads For UI Development

### Mock participants

```ts
const mockParticipants: AmbientParticipant[] = [
  {
    participantId: 'provider-1',
    role: 'provider',
    displayLabel: 'Provider',
    consentStatus: 'granted',
    minorOrDependent: false,
    speakerLabel: 'Speaker A',
  },
  {
    participantId: 'patient-1',
    role: 'patient',
    displayLabel: 'Patient',
    consentStatus: 'granted',
    minorOrDependent: false,
    speakerLabel: 'Speaker B',
  },
  {
    participantId: 'family-1',
    role: 'family_member',
    displayLabel: 'Mother',
    consentStatus: 'granted',
    minorOrDependent: false,
    speakerLabel: 'Speaker C',
  },
];
```

### Mock transcript turns

```ts
const mockTurns: AmbientTranscriptTurnViewModel[] = [
  {
    id: 'turn-1',
    sessionId: 'ambient-1',
    startMs: 0,
    endMs: 4500,
    speakerRole: 'provider',
    speakerLabel: 'Speaker A',
    speakerConfidence: 0.97,
    text: 'Tell me what felt hardest overnight.',
    textConfidence: 0.96,
    isFinal: true,
    excludedFromDraft: false,
    clinicalConcepts: [],
    riskMarkers: [],
    severityBadges: [],
    attributionNeedsReview: false,
    textNeedsReview: false,
    linkedDraftSentenceIds: [],
  },
  {
    id: 'turn-2',
    sessionId: 'ambient-1',
    startMs: 4700,
    endMs: 11800,
    speakerRole: 'patient',
    speakerLabel: 'Speaker B',
    speakerConfidence: 0.82,
    text: 'I barely slept and I still do not feel safe going home.',
    textConfidence: 0.95,
    isFinal: true,
    excludedFromDraft: false,
    clinicalConcepts: ['sleep disturbance'],
    riskMarkers: ['not safe going home'],
    severityBadges: ['risk language'],
    attributionNeedsReview: true,
    textNeedsReview: false,
    linkedDraftSentenceIds: ['sentence-1'],
  },
];
```

### Mock draft section

```ts
const mockDraftSections: AmbientDraftSectionViewModel[] = [
  {
    sectionId: 'safety',
    label: 'Safety / Risk',
    sentences: [
      {
        sentenceId: 'sentence-1',
        text: 'Patient reports not feeling safe to return home.',
        evidenceAnchors: [
          {
            turnId: 'turn-2',
            startChar: 29,
            endChar: 58,
            supportType: 'direct',
            confidence: 0.95,
          },
        ],
        assertionType: 'risk',
        confidence: 0.86,
        supportSummary: '1 direct source turn',
        primaryTurnIds: ['turn-2'],
        blockingFlagIds: ['flag-speaker-1'],
        accepted: false,
      },
    ],
  },
];
```

## 9. Visual Language Recommendation

Ambient should feel related to dictation, but more careful and more review-heavy.

Suggested visual cues:

- amber / copper tones for consent and caution
- cyan / slate for transcript mechanics
- rose accents only for severe risk or blocking issues
- speaker chips with distinct role color coding:
  - provider
  - patient
  - collateral
  - unknown

Do not make it playful or consumer-voice-assistant styled.

## 10. First UI Milestone

The first meaningful UI milestone should include:

- launcher
- consent gate
- control bar
- transcript timeline with speaker badges
- basic speaker correction drawer
- draft review panel with mock evidence anchors

That milestone is enough to validate:

- whether the workflow feels coherent
- whether speaker differentiation is understandable
- whether providers can review without getting lost

## 11. Recommended File Planning

Suggested initial component files:

- `components/note/ambient/ambient-session-launcher.tsx`
- `components/note/ambient/ambient-consent-gate-sheet.tsx`
- `components/note/ambient/ambient-control-bar.tsx`
- `components/note/ambient/ambient-transcript-workspace.tsx`
- `components/note/ambient/ambient-speaker-correction-drawer.tsx`
- `components/note/ambient/ambient-draft-review-panel.tsx`

Suggested support files:

- `lib/ambient-listening/mock-data.ts`
- `lib/ambient-listening/view-models.ts`
- `lib/ambient-listening/ui-events.ts`

## 12. Immediate Next Build Recommendation

After this plan, the best next implementation task is:

`Build the ambient internal UI shell with mock data only, no live capture.`

That shell should let the team validate:

- screen hierarchy
- speaker differentiation visibility
- evidence-linked review flow
- acceptance behavior before wiring real session transport
