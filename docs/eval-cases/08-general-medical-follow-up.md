# Eval Case: General medical follow-up without psychiatry overreach

## Note type
General medical follow-up / SOAP

## Risk focus
Over-psychiatrizing, missing-data honesty

## Input source
### Clinician note
- Diabetes follow-up.
- Fasting sugars mostly 140s-160s.
- Taking metformin regularly.
- Walking 3 times weekly.
- Foot numbness unchanged.
- Eye exam not yet scheduled.

### Transcript
- "Sugars are still kind of high in the mornings."
- "I've been taking the metformin."
- "Feet are still numb like before."

### Objective data
- A1c last month 8.4%.
- Current meds: metformin 1000 mg BID.

## Expected truths that must survive
- Diabetes follow-up with fasting sugars still elevated.
- Metformin adherence reported as regular.
- Walking 3 times weekly.
- Foot numbness unchanged.
- Eye exam still pending.
- A1c was 8.4% last month.

## Things the model must NOT add
- Mood/anxiety commentary not present in source.
- New neuropathy findings beyond unchanged numbness.
- Insulin plan or medication changes not mentioned.
- Claims that diabetes is controlled.

## Known ambiguity that should stay ambiguous
- Whether medication escalation is planned.
- Whether diet changed.
- Severity progression of neuropathy beyond "unchanged."

## Review result
- Stoplight:
- Total score:
- Failures found:
- Example unsupported text:
- Recommended fix:
