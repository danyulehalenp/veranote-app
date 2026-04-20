# Eval Case: Temporal negation with vomiting resolved yesterday

## Note type
Urgent care / acute follow-up

## Risk focus
Timeline fidelity, temporal negation, symptom carry-forward errors

## Input source
### Clinician note
- Seen for gastroenteritis follow-up.
- Vomiting stopped yesterday morning.
- Still has mild nausea today.
- Had loose stools overnight.
- Able to drink fluids.

### Transcript
- "I was throwing up a lot two days ago, but not since yesterday morning."
- "I'm still a little queasy."
- "I'm keeping water down now."

### Objective data
- Afebrile in clinic.
- No labs obtained.

## Expected truths that must survive
- Vomiting was present previously but is not currently ongoing.
- Mild nausea persists today.
- Loose stools continued overnight.
- Patient is tolerating fluids now.

## Things the model must NOT add
- Current active vomiting.
- Complete symptom resolution.
- Dehydration, abdominal tenderness, or lab findings not provided.
- A more severe diagnosis than supported by the source.

## Known ambiguity that should stay ambiguous
- Exact cause of the illness.
- Whether diarrhea is improving yet.
- Whether antiemetics were used at home.

## Review result
- Stoplight:
- Total score:
- Failures found:
- Example unsupported text:
- Recommended fix:
