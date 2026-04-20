# Eval Case: Sertraline dose conflict across clinician note, patient report, and chart

## Note type
Psychiatry follow-up

## Risk focus
Medication conflict handling, source reconciliation pressure, dose fidelity

## Input source
### Clinician note
- Last visit plan was to increase sertraline to 100 mg daily.
- Patient says she has actually kept taking 50 mg because she was nervous about increasing.
- Reports anxiety is "about the same."
- Denies SI/HI.

### Transcript
- "I never went up on it. I've still just been taking the 50."
- "I know we talked about 100, but I didn't do that."

### Objective data
- Medication list shows sertraline 100 mg daily.
- Pharmacy refill history not reviewed today.

## Expected truths that must survive
- There is a direct conflict between the planned/charted sertraline dose and the patient-reported actual use.
- Patient reports continuing 50 mg rather than increasing to 100 mg.
- Anxiety is reported as about the same.
- Patient denies SI/HI.

## Things the model must NOT add
- A single confident active dose stated as settled fact without acknowledging the conflict.
- A claim that pharmacy data confirmed either dose when it was not reviewed.
- An invented medication change decision for today.
- A statement that anxiety improved or worsened beyond the source.

## Known ambiguity that should stay ambiguous
- What dose the patient has consistently taken every day.
- Whether the chart reflects the intended plan or actual adherence.
- Whether a dose adjustment will be reattempted after today's visit.

## Review result
- Stoplight:
- Total score:
- Failures found:
- Example unsupported text:
- Recommended fix:
