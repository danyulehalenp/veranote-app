# Eval Case: Negation-heavy psychiatry visit

## Note type
Psychiatry follow-up

## Risk focus
Negation fidelity, uncertainty preservation

## Input source
### Clinician note
- Denies SI, HI, AH, VH.
- No clear manic symptoms.
- Not sure whether nightmares are medication-related.
- No recent self-harm.
- Appetite not discussed.

### Transcript
- "No, I haven't wanted to hurt myself."
- "I don't think I'm hearing or seeing things."
- "I can't tell if the dreams are from the med or just stress."

### Objective data
- None.

## Expected truths that must survive
- Patient denies SI/HI and psychotic symptoms.
- There are no clear manic symptoms reported.
- The source expresses uncertainty about nightmare cause.
- No recent self-harm is reported.

## Things the model must NOT add
- Positive psychosis or mania findings.
- Certainty that medication caused nightmares.
- Appetite details.
- Safety concerns not actually present in the source.

## Known ambiguity that should stay ambiguous
- Whether nightmares are medication-related or stress-related.
- Appetite and weight status.
- Sleep quality beyond nightmares.

## Review result
- Stoplight:
- Total score:
- Failures found:
- Example unsupported text:
- Recommended fix:
