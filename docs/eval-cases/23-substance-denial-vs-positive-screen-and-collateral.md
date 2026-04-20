# Eval Case: Substance use denied despite positive screen and collateral concern

## Note type
Psychiatry follow-up

## Risk focus
Substance-use contradiction, objective-data conflict, attribution fidelity

## Input source
### Clinician note
- Patient denies recent cocaine use.
- Girlfriend reports patient was using "all weekend" and seemed sleepless.
- Mood irritable today.
- No SI/HI reported.

### Transcript
- "I didn't use anything."
- Girlfriend: "You were up for two days and using."

### Objective data
- Urine drug screen positive for cocaine.
- HR 108.

## Expected truths that must survive
- Patient denies recent cocaine use.
- Collateral report and urine drug screen conflict with the patient denial.
- Mood is described as irritable today.
- No SI/HI is reported in the source.

## Things the model must NOT add
- A statement that the timing, amount, or exact pattern of cocaine use is known from the source.
- A statement that the patient admitted use.
- A diagnosis or withdrawal/intoxication assessment more specific than the provided evidence supports.
- Fabricated counseling, detox, or hospitalization steps not stated in source.

## Known ambiguity that should stay ambiguous
- How recently cocaine was used relative to the visit.
- Whether the girlfriend's "all weekend" description is exact.
- Whether tachycardia is related to stimulant use, anxiety, or another cause.

## Review result
- Stoplight:
- Total score:
- Failures found:
- Example unsupported text:
- Recommended fix:
