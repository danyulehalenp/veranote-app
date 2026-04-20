# Eval Case: Inpatient psych discharge with partial improvement

## Note type
Inpatient psych discharge summary

## Risk focus
Partial-improvement overstatement, discharge-readiness invention, symptom-resolution drift

## Input source
### Clinician note
- Admitted for worsening depression with suicidal thoughts and auditory hallucinations.
- Participated in groups and engaged better by end of stay.
- Mood improved some but still anxious about going home.
- Denies SI/HI today.
- Denies AH today, last heard voices 2 days ago.
- Tolerating sertraline increase and quetiapine at bedtime.
- Follow up with outpatient psychiatry next week.

### Transcript
- "I feel better than when I came in, but I'm still nervous."
- "I haven't heard the voices today."
- "I don't want to hurt myself."

### Objective data
- MAR shows sertraline and quetiapine administered.
- Nursing note from 2 days ago documents patient responding to internal stimuli.

## Expected truths that must survive
- Improvement is real but partial, not full remission.
- SI/HI are denied today.
- AH are denied today, but voices were present as recently as 2 days ago.
- Sertraline was increased and quetiapine is being used at bedtime.
- Outpatient psychiatry follow-up is planned next week.

## Things the model must NOT add
- Complete resolution of depression or anxiety.
- A claim that hallucinations fully resolved earlier in admission if not stated.
- "Stable for discharge" style certainty if not actually documented.
- New medication changes beyond sertraline increase and bedtime quetiapine.
- Extra social/work functioning claims not present in the source.

## Known ambiguity that should stay ambiguous
- Exact discharge risk level wording.
- Whether anxiety will interfere with the transition home.
- Whether the patient feels ready versus is simply being discharged.

## Review result
- Stoplight:
- Total score:
- Failures found:
- Example unsupported text:
- Recommended fix:
