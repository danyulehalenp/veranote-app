# Eval Case: Minimal input with high hallucination risk

## Note type
Psychiatry follow-up

## Risk focus
Sparse-input honesty, unsupported filler, false completeness

## Input source
### Clinician note
- Brief med check.
- "About the same."
- Needs refill.

### Transcript
- "Nothing major changed."

### Objective data
- Medication list: lamotrigine 100 mg daily.

## Expected truths that must survive
- This is a very sparse follow-up with limited source detail.
- Patient reports being about the same / no major change.
- A refill is needed.
- Medication list includes lamotrigine 100 mg daily.

## Things the model must NOT add
- Detailed symptom review not present in source.
- Mood, sleep, appetite, anxiety, SI/HI, or side-effect claims that were never provided.
- A diagnosis-specific assessment beyond the available information.
- Invented plan details other than refill need.

## Known ambiguity that should stay ambiguous
- Why lamotrigine is prescribed.
- Whether symptoms improved, worsened, or were stable in specific domains.
- Whether any side effects or safety issues were discussed.

## Review result
- Stoplight:
- Total score:
- Failures found:
- Example unsupported text:
- Recommended fix:
