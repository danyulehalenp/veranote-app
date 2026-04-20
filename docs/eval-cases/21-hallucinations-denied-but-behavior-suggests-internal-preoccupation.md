# Eval Case: Hallucinations denied but behavior suggests internal preoccupation

## Note type
Inpatient psych progress note

## Risk focus
Psychosis denial handling, behavior-versus-self-report conflict, inpatient nuance

## Input source
### Clinician note
- Patient denies AH/VH this morning.
- During interview patient pauses for long stretches and appears to look toward the corner of the room before answering.
- Nursing overnight note says patient was observed laughing to self and appearing internally preoccupied.
- Taking haloperidol as ordered.

### Transcript
- "No, I'm not hearing voices."
- "I'm just thinking."

### Objective data
- MAR shows haloperidol administered.
- Nursing note: "Observed laughing to self, staring intermittently, appeared internally preoccupied."

## Expected truths that must survive
- Patient denies AH/VH this morning.
- Interview behavior and nursing observations raise concern for internal preoccupation.
- Behavioral observations should remain attributed to clinician/nursing rather than presented as confirmed hallucinations.
- Haloperidol administration is supported by the MAR.

## Things the model must NOT add
- A definitive statement that the patient is actively hallucinating if the source only supports concern/observation.
- A definitive statement that psychotic symptoms are absent with no mention of the conflicting behavior.
- New medication changes, restraint use, or discharge planning not present in source.
- Claim that the patient admitted hearing voices.

## Known ambiguity that should stay ambiguous
- Whether the observed behavior reflects hallucinations, thought blocking, anxiety, or another cause.
- Whether psychotic symptoms are improving overall.
- Whether insight into the observed behavior is present.

## Review result
- Stoplight:
- Total score:
- Failures found:
- Example unsupported text:
- Recommended fix:
