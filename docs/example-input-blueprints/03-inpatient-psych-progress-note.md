# Example Input Blueprint: Inpatient Psych Progress Note

## Why This Matters

The founder history shows repeated use of AI for progress-note cleanup and refinement.

The job is:

- day-to-day inpatient psych updates in
- concise, faithful progress note out

## Typical Raw Inputs

### Clinician bullets

- patient report today
- sleep, appetite, mood, anxiety
- unit behavior
- participation in groups
- medication adherence / PRN use
- current MSE fragments
- plan for today

### Optional transcript fragments

- short patient quotes
- staff description of overnight behavior

### Objective data

- MAR
- nursing note
- behavioral events
- observation level or precautions

## Input Shape Veranote Should Handle

- sparse bullets
- repeated follow-up cadence
- partial improvement language
- overnight-event carryover
- mixed patient/staff/objective fragments

## Truth Risks

- turning partial improvement into resolution
- inventing discharge readiness
- softening difficult behavior
- overstating adherence or effect of meds
- losing time sensitivity between yesterday and today

## Review Priorities

- improvement should stay partial if source is partial
- overnight behavior should not be erased by a calm interview
- med/PRN statements should remain exact
- plan should not grow beyond documented decision-making
- current interview status should stay distinct from prior events

## Likely Veranote Features This Should Drive

- progress-note-specific drafting path
- “yesterday vs today” conflict check
- MAR/nursing support visibility
- partial-improvement wording guardrails
- quick-review workflow for daily note cadence

## Example Eval Directions

- calm today but escalated last night
- denies AH today after voices yesterday
- PRN given but source does not state effect
- “continue current plan” with no new decision details
