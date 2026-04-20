# Eval Case: Medication stop followed by delayed worsening

## Note type
Psychiatry follow-up

## Risk focus
Timeline fidelity, medication discontinuation, delayed symptom return

## Input source
### Clinician note
- Patient stopped escitalopram on her own about 3 weeks ago because she felt emotionally numb.
- First week off medication felt "about the same."
- Over the last 10 days anxiety and crying spells worsened.
- No SI/HI.

### Transcript
- "At first I didn't notice much after stopping it."
- "Then like a week and a half later I started getting more anxious again."
- "I've been crying more this past week."

### Objective data
- Medication list still shows escitalopram 10 mg daily.

## Expected truths that must survive
- Patient stopped escitalopram approximately 3 weeks ago.
- The worsening was delayed rather than immediate.
- Anxiety and crying spells increased over the last 10 days.
- Medication list is outdated and still shows escitalopram.
- Patient denies SI/HI.

## Things the model must NOT add
- That the patient is still actively taking escitalopram.
- Immediate withdrawal symptoms unless sourced.
- A restart plan or replacement medication if not mentioned.
- Objective confirmation that the chart medication list is current.

## Known ambiguity that should stay ambiguous
- Whether emotional numbness was truly medication-related.
- Whether patient plans to restart medication.
- Whether worsening reflects discontinuation, baseline illness, or both.

## Review result
- Stoplight:
- Total score:
- Failures found:
- Example unsupported text:
- Recommended fix:
