# Example Input Blueprint: Outpatient Psych Follow-Up

## Why This Matters

This is now an explicit psych-wedge requirement for Veranote.

The job is:

- raw outpatient med-management and symptom follow-up input in
- polished, source-faithful outpatient psychiatry follow-up note out

## Typical Raw Inputs

### Clinician bullets

- chief concern or follow-up purpose
- interval symptom update since last visit
- medication adherence
- medication response
- side effects or tolerability
- sleep, appetite, anxiety, mood, focus, irritability, or psychosis updates
- work, school, home, or relationship functioning
- safety check
- follow-up plan, refill needs, or next steps

### Optional transcript fragments

- patient explanation of what feels better, worse, or unchanged
- exact side-effect wording
- refill or adherence comments
- telehealth-specific logistics if relevant

### Objective data

- medication list
- PHQ-9, GAD-7, ASRS, or other scales if used
- vitals if available
- lab follow-up if clinically relevant

## Input Shape Veranote Should Handle

- short med-check bullets
- rough dictation with fragmented chronology
- brief transcript plus clinician bullets
- symptom and functioning fragments mixed together
- refill-oriented visits with limited decision detail

## Truth Risks

- overstating improvement from partial response
- inventing adherence certainty
- inventing side-effect denial
- flattening chronic risk into "no safety concerns"
- adding medication decisions that were not documented

## Review Priorities

- symptom change should stay literal
- adherence should remain bounded to what source supports
- side effects must not be invented or over-cleaned
- chronic versus acute risk language should stay distinct
- functioning claims should stay tied to source

## Likely Veranote Features This Should Drive

- outpatient med-management note path
- adherence and side-effect review prompts
- chronic-risk versus acute-risk wording review
- functioning-aware follow-up structure
- refill-decision warning when plan detail is thin

## Example Eval Directions

- partial improvement with insomnia or anxiety still present
- refill request without documented send/continue decision
- chronic passive SI history but no current active intent
- telehealth follow-up with functioning changes and limited objective data
