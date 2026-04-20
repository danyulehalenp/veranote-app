# Example Input Blueprint: Meds / Labs / Diagnosis Review Support

## Why This Matters

A substantial slice of the founder history was not pure note generation.
It was note-adjacent reasoning support around:

- medication questions
- lab interpretation
- diagnosis/differential framing

These are highly relevant because they feed documentation wording and trust boundaries.

## Typical Raw Inputs

### Clinician bullets

- current medication list
- adherence issues
- recent dose changes
- side-effect concerns
- refill request
- diagnostic question or differential concern

### Optional transcript fragments

- patient description of side effects
- provider shorthand around what changed

### Objective data

- lab values
- positive screens
- vital signs
- med history from chart

## Input Shape Veranote Should Handle

- refill-only request with weak decision support
- side-effect concern without clear causality
- diagnosis support with incomplete evidence
- lab abnormality mixed into psych workflow
- med/lab question that must feed documentation carefully

## Truth Risks

- saying a refill was sent when not documented
- over-explaining causality from thin evidence
- inventing med changes
- hardening a differential into a diagnosis
- smoothing labs into narrative without enough caution

## Review Priorities

- decisions versus requests must stay separate
- objective data should remain visible and literal
- diagnostic reasoning should stay assistive
- medication statements should be exact
- uncertainty should remain visible

## Likely Veranote Features This Should Drive

- med/lab review panel in note review
- refill-decision gating
- objective-data truth block
- diagnosis assistive-language guardrails
- contradiction detection for medication frequency/dose

## Example Eval Directions

- refill requested without documented clinician decision
- dose conflict across sources
- patient denies substance use but screen is positive
- side effect described but unclear if medication-related
