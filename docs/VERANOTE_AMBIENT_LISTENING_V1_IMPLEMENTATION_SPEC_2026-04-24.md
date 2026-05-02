# Veranote Ambient Listening V1 Implementation Spec

Date: 2026-04-24

Status: implementation planning document

Companion docs:

- [/Users/danielhale/.openclaw/workspace/app-prototype/docs/VERANOTE_AMBIENT_LISTENING_PRODUCT_DIRECTION_2026-04-24.md](/Users/danielhale/.openclaw/workspace/app-prototype/docs/VERANOTE_AMBIENT_LISTENING_PRODUCT_DIRECTION_2026-04-24.md)
- [/Users/danielhale/.openclaw/workspace/app-prototype/docs/AMBIENT_LISTENING_MODULE_SCAFFOLD.md](/Users/danielhale/.openclaw/workspace/app-prototype/docs/AMBIENT_LISTENING_MODULE_SCAFFOLD.md)
- [/Users/danielhale/.openclaw/workspace/app-prototype/types/ambient-listening.ts](/Users/danielhale/.openclaw/workspace/app-prototype/types/ambient-listening.ts)
- [/Users/danielhale/.openclaw/workspace/app-prototype/lib/constants/ambient-listening.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/constants/ambient-listening.ts)

This document translates the product direction into a concrete V1 build target.

It does not authorize production release or live PHI capture.

## 1. V1 Goal

Build an internal ambient listening alpha for Veranote that can:

- start a consent-gated ambient session
- capture multi-speaker transcript turns
- differentiate provider and patient speech
- let the provider review and correct speaker assignment
- generate a psych-first evidence-linked draft
- require explicit provider acceptance before content is used in the note workflow

The product value of V1 is:

- trustworthy source capture
- role-aware transcript review
- source-faithful psych draft generation

The product value is not:

- autonomous note writing
- silent chart insertion
- final clinical decision support

## 2. Non-Negotiable V1 Constraints

- no ambient recording without explicit consent workflow
- no hidden recording state
- no raw audio retention by default
- no direct final-note insertion
- no unsupported MSE completion
- no autonomous diagnosis, legal, or risk conclusions
- no collapsing provider/patient/collateral into a single undifferentiated transcript

## 3. V1 Success Criteria

V1 is successful only if all of these are true:

- provider and patient speech are kept separate in transcript turns
- low-confidence speaker attribution is visible
- providers can correct misattributed turns
- draft sentences show evidence support
- unsafe or unsupported draft content is flagged before acceptance
- accepted content lands in source/review workflow, not silently into final note text

## 4. Primary User Story

`As a psychiatric provider, I want to capture an encounter ambiently, review who said what, and accept only source-faithful draft content into Veranote without losing contradictions or uncertainty.`

## 5. V1 User Flow

### Step 1: Start ambient session

Entry points:

- source workflow utility rail
- note compose setup strip
- dedicated internal ambient test surface later

Required inputs before start:

- encounter mode
- care setting
- provider state / patient state if needed for policy gating
- participant list at minimum:
  - provider
  - patient
  - optional collateral / family / interpreter

Result:

- new ambient session enters `consent_pending`

### Step 2: Consent gate

Required behavior:

- capture consent status per audible participant where policy requires it
- display recording/transcription/AI-draft scope clearly
- block progression to recording if required consent is missing

Result:

- session enters `ready_to_record`

### Step 3: Live ambient capture

Required behavior:

- visible recording banner
- start / pause / off-record / stop controls
- diarized transcript turns streamed into a timeline
- each turn shows:
  - speaker role
  - speaker label if known
  - speaker confidence
  - text confidence
  - final / interim state

Result:

- session enters `recording`, `paused`, or `off_record` as appropriate

### Step 4: Processing and draft generation

Required behavior:

- transcript turns are normalized after stop
- review flags are created
- psych-first draft is generated from supported turns
- every draft sentence includes evidence anchors

Result:

- session enters `draft_ready` or `needs_review`

### Step 5: Review and accept

Required behavior:

- provider reviews transcript
- provider corrects speaker roles where needed
- provider excludes unsupported turns
- provider reviews evidence-linked draft
- provider accepts sections or sentences into Veranote source/review lanes

Result:

- session enters `accepted_into_note` and later `finalized` or `discarded`

## 6. Required Screens And Surfaces

### A. Ambient Session Launcher

Purpose:

- fast, safe session setup

Fields:

- encounter mode
- care setting
- jurisdiction context
- participant list
- consent requirement summary

Primary action:

- `Start ambient session`

Secondary actions:

- `Cancel`
- `Review recording rules`

Blocked states:

- unknown jurisdiction when policy blocks
- missing participant minimums

### B. Consent Gate Sheet

Purpose:

- collect and display recording/transcription consent state

Required UI elements:

- participant rows
- consent status badge
- consent method
- consent scope summary
- approved script / policy version if available

Primary actions:

- `Confirm consent and continue`
- `Decline / stop setup`

Rules:

- cannot enter live recording without required consent
- consent status changes must be auditable

### C. Live Transcript Workspace

Purpose:

- display ambient capture in a reviewable, role-aware way

Layout:

- top banner: recording state + timer + pause/off-record/stop
- left/main column: transcript timeline
- right column: live flags and draft readiness summary

Transcript row contents:

- speaker badge
- speaker confidence
- turn text
- turn timestamps
- text confidence
- high-risk markers

Turn actions:

- `Relabel speaker`
- `Exclude from draft`
- `Mark provider-confirmed`
- `Flag for review`

### D. Speaker Correction Surface

Purpose:

- repair diarization mistakes before note acceptance

Actions:

- change role
- change speaker label
- merge adjacent turns
- split turn
- mark unresolved speaker

Rules:

- correction must not silently rewrite already accepted note content
- low-confidence turns remain visible even after correction

### E. Evidence-Linked Draft Review

Purpose:

- review generated note content before acceptance

Layout:

- sectioned psych draft
- sentence-level support
- grouped review flags

Per-sentence data:

- sentence text
- assertion type
- support status
- confidence
- linked transcript turns

Sentence actions:

- `Accept`
- `Edit before accept`
- `Reject`
- `Jump to source`

### F. Acceptance Drawer

Purpose:

- send approved material into Veranote source/review lanes

Acceptance targets:

- conversation transcript source lane
- collateral lane
- medication / symptom source lane
- draft review workspace

Rules:

- no direct silent insertion into final signed note text
- accepted content should preserve provenance

## 7. Required Runtime State Model

Use the existing ambient session state family in [ambient-listening.ts](/Users/danielhale/.openclaw/workspace/app-prototype/types/ambient-listening.ts:1).

V1 will actively use:

- `idle`
- `consent_pending`
- `ready_to_record`
- `recording`
- `paused`
- `off_record`
- `processing_transcript`
- `draft_generation_pending`
- `draft_ready`
- `needs_review`
- `accepted_into_note`
- `discarded`

### State transition rules

- `idle -> consent_pending` on session creation
- `consent_pending -> ready_to_record` only if required consent is satisfied
- `ready_to_record -> recording` on explicit start
- `recording -> paused` on pause
- `paused -> recording` on resume
- `recording -> off_record` on explicit off-record window
- `off_record -> recording` on explicit return
- `recording -> processing_transcript` on stop
- `processing_transcript -> draft_generation_pending` after transcript normalization
- `draft_generation_pending -> draft_ready` if no blocking flags
- `draft_generation_pending -> needs_review` if blocking or high-severity flags are present
- `draft_ready -> accepted_into_note` on provider accept
- `needs_review -> accepted_into_note` only after review requirements are satisfied
- any active state -> `discarded` on explicit discard

## 8. Data Flow

### Capture flow

1. provider starts session
2. consent and participant context are captured
3. browser or approved client capture sends audio chunks to backend session bridge
4. STT provider returns transcript segments with diarization metadata
5. backend normalizes segments into `AmbientTranscriptTurn`
6. safety pass annotates turns with concepts, risk markers, and attribution confidence

### Review flow

1. transcript turns appear in timeline
2. provider corrects or excludes problematic turns
3. corrected turn set is used to create evidence-linked draft sentences
4. draft sentences and flags are displayed together
5. provider accepts selected material into Veranote workflow lanes

### Acceptance flow

1. accepted sentence is stored with provenance
2. accepted content is inserted into Veranote source/review workspace
3. final note authoring still happens through the normal Veranote review path

## 9. Speaker Differentiation Implementation Rules

Speaker differentiation is a hard gate for ambient psychiatry work.

### Required V1 model

Every transcript turn must carry:

- `speakerRole`
- `speakerLabel`
- `speakerConfidence`
- `textConfidence`

### Required speaker roles for V1

- `provider`
- `patient`
- `guardian`
- `caregiver`
- `family_member`
- `interpreter`
- `other_clinician`
- `unknown`

### Required speaker behavior

- low-confidence speaker assignment must be visible
- unresolved speaker assignment must block overconfident note drafting
- provider turns must not be rewritten as patient symptoms
- collateral turns must remain collateral unless confirmed

### Acceptance rule

If a sentence depends on speaker identity and the relevant source turn remains unresolved, that sentence should either:

- stay excluded
- be flagged as unresolved
- require provider-confirmed support before acceptance

## 10. Drafting Rules

### Drafting inputs allowed

- finalized or reviewable transcript turns
- provider-confirmed corrections
- structured encounter context

### Drafting inputs not allowed

- unsupported hallucinated filler
- unreviewed low-confidence inferences presented as fact
- automatically completed normal exam findings

### Draft sentence requirements

Every `AmbientDraftSentence` should include:

- text
- assertion type
- confidence
- evidence anchors

### Draft section rules

- MSE must remain partial if source is partial
- risk language must preserve contradictions
- collateral must remain collateral
- assessment must preserve uncertainty if differential remains open

## 11. Review Flag Rules

At minimum, V1 should create and display flags for:

- consent
- speaker attribution
- negation
- risk language
- psychosis
- medication
- diagnosis
- legal status
- unsupported claim
- process note boundary
- stigma

### Blocking flags

The following should block straightforward acceptance until reviewed:

- consent uncertainty
- speaker attribution high-severity issues
- unsupported claim
- legal-status overstatement
- process-note boundary issues

## 12. Vera’s Role In V1 Ambient

Vera is not the ambient recorder.

In V1 ambient review, Vera may:

- explain a flag
- suggest more conservative wording
- identify contradiction
- suggest chart-ready wording after provider review

Vera may not:

- silently accept draft content
- resolve weak diarization automatically into certainty
- make diagnosis, hold, or capacity conclusions

## 13. API / Service Planning Targets

V1 likely needs the following backend concepts, even if exact routes differ later:

- ambient session create / read / update
- consent event capture
- transcript turn ingest / poll / stream
- review flag generation
- draft generation trigger
- accept-to-workspace action
- discard session action

These should remain separate from dictation routes, even if they share internal transcription adapters later.

## 14. Internal Alpha Build Order

### Slice 1: session shell

- ambient launcher
- session states
- consent gate UI
- participant model wiring

### Slice 2: transcript lane

- backend session bridge
- transcript turn rendering
- speaker badges
- confidence display

### Slice 3: speaker correction

- relabel actions
- unresolved speaker handling
- exclude-from-draft behavior

### Slice 4: draft review

- draft sentence model
- evidence anchor rendering
- sentence accept / reject

### Slice 5: Veranote acceptance path

- accept to source/review lanes
- provenance carry-through
- review-state summaries

## 15. V1 Evaluation Targets

Before ambient alpha should be considered usable, testing should cover:

- provider vs patient speaker differentiation
- collateral vs patient contradiction preservation
- MSE non-fabrication
- low-confidence speaker handling
- risk language under mixed speakers
- off-record exclusion behavior
- unsupported claim flagging
- note acceptance only after review

### Priority adversarial scenarios

- patient denies SI, collateral reports goodbye texts
- provider asks about hallucinations, patient answers ambiguously
- interpreter and patient speak in overlapping turns
- provider says an assessment aloud; system must not treat it as patient report
- family member dominates part of the conversation
- partial MSE source from ambient transcript

## 16. Open Questions For Later Implementation

These do not block the spec, but should be resolved before coding deeper vendor integration:

- whether V1 ambient uses the current dictation session bridge or a sibling ambient bridge
- whether live transcript delivery is polling, SSE, or websocket-based
- what minimum diarization confidence threshold should trigger a blocking flag
- whether uploaded audio enters the same review flow or a separate batch-processing path

## 17. Immediate Next Task Recommendation

The next concrete build artifact should be a UI implementation plan for:

- ambient launcher
- consent gate
- live transcript workspace
- speaker correction panel
- evidence-linked draft review

That plan should define:

- component list
- state props
- event contracts
- mock payloads
- internal test fixtures

That follow-on plan now lives at:

- [/Users/danielhale/.openclaw/workspace/app-prototype/docs/VERANOTE_AMBIENT_LISTENING_UI_IMPLEMENTATION_PLAN_2026-04-24.md](/Users/danielhale/.openclaw/workspace/app-prototype/docs/VERANOTE_AMBIENT_LISTENING_UI_IMPLEMENTATION_PLAN_2026-04-24.md)
