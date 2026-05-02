# Veranote Ambient Listening Product Direction

Date: 2026-04-24

Status: design direction for product and implementation planning

## Purpose

This document defines the target product shape for Veranote ambient listening.

It is meant to turn the existing scaffold into a buildable direction that combines:

- Abridge-style trust and evidence traceability
- Eleos-style behavioral-health specificity
- Freed / Heidi-style low-friction capture and review
- Veranote’s existing psych-first safety discipline

This is not a production-readiness claim and not an approval to enable live ambient capture yet.

## Product Thesis

Veranote ambient listening should be:

- psych-first
- source-faithful
- consent-gated
- evidence-linked
- provider-reviewed
- easy to start under time pressure

It should feel like:

- a reliable psychiatric documentation partner
- a careful source-to-note translator
- a fast but disciplined ambient drafting workflow

It should not feel like:

- a hidden recorder
- a generic AI scribe
- an autonomous clinical decision-maker
- a tool that quietly rewrites uncertainty into confidence

## Primary Benchmarks To Learn From

### 1. Trust benchmark: Abridge

Use as the benchmark for:

- linked evidence
- auditable note claims
- clinician trust posture
- source-to-note verification

Veranote implication:

- every important draft sentence should be traceable back to transcript support
- providers should be able to inspect why a sentence exists before accepting it

### 2. Behavioral-health benchmark: Eleos

Use as the benchmark for:

- behavioral-health specialization
- in-workflow compliance support
- organization-controlled guardrails
- non-autonomous workflow assistance

Veranote implication:

- ambient output should be psychiatry-native, not generic primary-care templating
- review flags should focus on psych risk, contradiction, unsupported assessment, and process-note boundary issues

### 3. Ease-of-use benchmark: Freed and Heidi

Use as the benchmark for:

- one-click capture
- fast draft turnaround
- low setup burden
- flexible template feeling

Veranote implication:

- starting an ambient session should feel as easy as dictation
- the workflow should not demand heavy setup before every encounter

## Core Product Direction

The target model is:

`Abridge trust + Eleos psych specificity + Freed/Heidi simplicity`

In practical terms, Veranote ambient listening should ship only when it can do all of these together:

- clearly capture who said what
- keep provider and patient voices distinct
- preserve uncertainty and contradiction
- produce psych-structured draft notes quickly
- show sentence-level evidence support
- require provider review before note acceptance

## Non-Negotiable Requirement: Speaker Differentiation

Ambient listening must differentiate between provider and patient voice during transcription.

This is not optional.

Why it matters:

- psychiatric notes depend on the difference between patient report, clinician observation, collateral report, and clinician assessment
- risk language can change meaning entirely depending on speaker
- MSE and assessment language become unsafe if provider statements are mixed into patient speech
- ambient output is not trustworthy unless the system can keep source roles distinct

### Required speaker roles

At minimum, the ambient workflow must support:

- provider
- patient
- collateral / family / guardian
- other clinician / interpreter / unknown

### Required speaker capabilities

- diarized transcript turns with speaker label and confidence
- role-aware note drafting
- UI to correct wrong speaker assignments before note acceptance
- flags when speaker attribution confidence is low
- hard separation between:
  - patient-reported content
  - provider observations
  - collateral reports
  - clinician assessment / plan

### Product rule

If speaker attribution is too weak to safely assign a statement, Veranote should:

- mark it as unresolved
- avoid converting it into chart-ready certainty
- require provider review before using it in note language

## V1 Product Scope

### Core encounter flow

1. Start ambient session

- provider selects encounter mode:
  - in-room
  - telehealth
  - collateral / family
  - uploaded audio
- visible recording banner appears immediately

2. Consent gate

- capture required consent state before recording
- block recording if required consent state is not met
- log consent scope and participant role

3. Live capture and diarized transcript

- stream transcript turns into a timeline
- assign speaker label and confidence per turn
- show when attribution is uncertain
- allow pause / off-record / stop

4. Draft generation

- generate a psych-first draft from transcript support only
- group content into note sections
- tag sentence provenance

5. Review and acceptance

- provider reviews transcript, flags, and evidence-linked draft
- provider can accept, exclude, rewrite, or move content
- accepted content lands in Veranote source and review lanes, not directly as final signed note text

### V1 note sections

Ambient-generated drafts should support:

- HPI / interval history
- symptoms and stressors
- medications / adherence / side effects
- substance use
- psychosocial context
- safety / risk
- MSE only if source supports it
- assessment with explicit uncertainty handling
- plan / follow-up

### V1 exclusions

Do not include in V1:

- silent final-note insertion
- autonomous diagnosis assignment
- autonomous risk classification
- autonomous legal hold / capacity conclusions
- psychotherapy process-note generation
- default raw audio retention
- background or hidden recording

## Ambient UX Principles

### 1. Fast start

- one primary start action
- minimal pre-encounter friction
- default-safe capture settings

### 2. Visible recording state

- recording state always visible
- clear pause / off-record controls
- explicit post-stop processing state

### 3. Source-first review

- transcript timeline and draft should feel connected
- providers should be able to see where wording came from
- review should prioritize risky or ambiguous material first

### 4. Calm psychiatric tone

Ambient review UX should feel:

- clinically serious
- calm
- legible under time pressure
- focused on note safety rather than flashy AI behavior

## Required Review Surfaces

### Transcript timeline

Must show:

- speaker label
- speaker confidence
- final vs interim state
- excluded turns
- risk markers
- medication / legal / psychosis markers

### Draft sentence review

Must show:

- sentence text
- sentence type
- evidence anchors
- confidence
- review flags

### High-priority review flags

Ambient review should prioritize flags for:

- consent uncertainty
- speaker attribution uncertainty
- negation ambiguity
- contradiction across speakers
- risk language
- psychosis language
- medication details
- diagnosis overstatement
- legal-status overstatement
- unsupported claims
- process-note boundary issues

## Voice Attribution Rules

### Drafting rules by speaker

- patient statements become patient report, not observation
- provider spoken interpretation should not be copied into the note as if observed fact without support
- collateral statements remain collateral statements unless explicitly confirmed
- provider questions should not be transformed into patient symptoms

### Example conversions

- If provider says, `Any suicidal thoughts?`
  - do not draft `Patient has suicidal thoughts`
- If patient says, `I have not felt safe at home`
  - may support patient-reported risk language
- If sister says, `She texted goodbye last night`
  - remains collateral until reviewed
- If provider says, `He appears internally preoccupied`
  - this can support clinician observation if the encounter context supports it, but still should remain clearly observational

### Diarization correction UX

V1 should include:

- relabel speaker action
- merge / split neighboring turns if attribution drift occurred
- exclude turn from draft
- accept turn as provider-confirmed evidence

## Evidence Model Requirements

Ambient note drafting should remain evidence-linked.

Every draft sentence should be associated with:

- one or more transcript turns
- support type:
  - direct
  - paraphrase
  - inferred
  - provider-confirmed
- confidence

Product rule:

- unsupported sentence generation should be blocked or flagged
- inferred content should be visibly marked and easier to challenge
- provider-confirmed edits may upgrade support status, but must remain auditable

## Psychiatry-Specific Safety Rules

Ambient listening must inherit the same safety posture Vera already uses in note assistance.

### Never do these

- fabricate normal MSE findings
- collapse contradictions between patient, provider, and collateral
- convert uncertainty into a clean diagnosis
- state low risk when high-risk source facts remain unresolved
- state capacity or legal hold conclusions beyond source support
- blur psychotherapy/process-note material into ordinary documentation

### Always do these

- preserve speaker source
- preserve contradiction
- keep patient report versus observation distinct
- keep collateral distinct from provider observation
- say what is missing when evidence is incomplete

## Recommended Product Architecture Direction

Ambient listening should remain a separate lane from dictation.

### Relationship to dictation

Dictation is:

- provider-controlled
- single-speaker by default
- lower ambiguity
- earlier implementation lane

Ambient listening is:

- multi-speaker
- higher ambiguity
- higher compliance burden
- review-heavier

Shared reusable layers:

- backend session ownership
- provider selection and status
- transcript event queue
- review flagging
- provenance / source insertion
- note review surfaces

Ambient-specific layers:

- consent workflow
- participant tracking
- diarization
- speaker correction
- evidence-anchor review
- stronger retention / audit controls

## Recommended V1 UI Shape

### Ambient control bar

- start / pause / off-record / stop
- active mode
- recording state
- elapsed time
- visible consent state

### Live transcript panel

- left rail: speaker badges
- main stream: diarized transcript turns
- inline attribution confidence
- turn actions:
  - relabel
  - exclude
  - mark off-record

### Draft review panel

- sectioned psych draft
- sentence-level evidence anchors
- review flags grouped by severity
- accept to source lane actions

### Safety banners

- consent incomplete
- jurisdiction unknown
- low speaker confidence
- unresolved contradiction
- unsupported claim risk

## Feature Priorities

### Must-have before internal ambient alpha

- consent gate
- visible recording state
- speaker diarization
- provider/patient differentiation
- transcript turn review
- sentence-level evidence anchors
- contradiction and risk flagging
- draft-only acceptance

### Strong next wave

- provider-confirmed speaker correction
- psych encounter templates
- telehealth-specific handling
- collateral-aware drafting controls
- per-section confidence summaries

### Later

- provider preference memory for ambient output style
- org-level policy overlays
- desktop overlay for ambient review assistance
- deeper EHR-specific output mapping

## Competitive Build Guidance

### Copy directly in spirit

- Abridge: verify AI note claims against conversation support
- Eleos: behavioral-health-first workflow and organizational guardrails
- Freed: start fast, do not overcomplicate the front door
- Heidi: flexible output shaping and accessible browser-first feel

### Do not copy yet

- broad autonomous action layers
- coding-first optimization as primary value
- hidden AI workflow magic
- anything that obscures source provenance to look smoother

## Success Metrics

Ambient listening should be considered successful only if providers can trust it.

Primary metrics:

- time from stop to first draft
- provider edit burden
- percent of accepted sentences with direct or provider-confirmed support
- speaker attribution correction rate
- unsupported-claim flag rate
- contradiction-preservation accuracy
- provider trust / willingness-to-reuse

Psych-specific quality metrics:

- patient-report vs observation separation accuracy
- collateral-preservation accuracy
- no-fabricated-MSE rate
- risk-language fidelity
- process-note boundary fidelity

## Phased Build Recommendation

### Phase 1: internal ambient alpha

- consent + recording shell
- participant model
- diarized transcript turns
- speaker correction
- evidence-linked draft review
- draft-only acceptance into source lanes

### Phase 2: psych-first ambient draft quality

- psych note templates
- better contradiction handling
- stronger risk / med / psychosis flags
- better telehealth and collateral flows

### Phase 3: Vera-assisted ambient review

- chart-ready rewrite suggestions
- contradiction explanation
- safe wording alternatives
- provider preference suggestions with approval

### Phase 4: operational hardening

- deeper audit views
- retention jobs
- org policy controls
- admin review and monitoring

## Immediate Repo Implications

The current scaffold is pointed in the right direction.

The next implementation work should preserve these existing boundaries:

- ambient remains separate from dictation
- ambient remains draft-only
- ambient remains consent-gated
- raw audio remains off by default

And it should add these next:

- speaker attribution as a first-class runtime signal
- speaker correction as a first-class review action
- role-aware drafting rules before broader ambient UX expansion

## Decision Summary

Build Veranote ambient listening toward:

- Abridge-style evidence trust
- Eleos-style behavioral-health specificity
- Freed / Heidi-level usability
- strict provider/patient/collateral voice separation

If Veranote cannot reliably differentiate speaker roles, it should not be treated as ready for ambient psychiatric documentation.
