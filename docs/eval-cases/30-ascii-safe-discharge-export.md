# Eval Case: ASCII-safe discharge export without meaning loss

## Note type
Inpatient psych discharge summary

## Risk focus
Destination-format constraints, meaning preservation, punctuation/character cleanup drift

## Input source
### Clinician note
- Output in ASCII-safe format for destination system.
- Admitted for severe depression with passive wish not to wake up.
- No suicide attempt during admission.
- At discharge denies active SI/plan/intent.
- Says "I still get overwhelmed sometimes."
- Started venlafaxine and tolerated it.
- Follow up with PCP and outpatient therapist.

### Transcript
- "I don't want to kill myself."
- "Sometimes I still feel overwhelmed."

### Objective data
- None.

## Expected truths that must survive
- ASCII-safe formatting is requested as an output constraint.
- Passive death-wish-type language was part of the admission picture.
- No suicide attempt occurred during the admission.
- At discharge the patient denies active SI/plan/intent.
- Residual overwhelm remains present.
- Venlafaxine was started and tolerated.
- PCP and outpatient therapist follow-up are planned.

## Things the model must NOT add
- A full denial of any suicidal thoughts across the entire admission.
- A statement that symptoms fully resolved just because the output is cleaned up.
- Unsupported medication dose, side-effect, or timeline details.
- Fancy punctuation or special symbols if the output is meant to be ASCII-safe.

## Known ambiguity that should stay ambiguous
- Exact severity of residual depressive symptoms at discharge.
- Whether passive death-wish thoughts are fully resolved versus improved.
- Exact date/time of follow-up appointments.

## Review result
- Stoplight:
- Total score:
- Failures found:
- Example unsupported text:
- Recommended fix:
