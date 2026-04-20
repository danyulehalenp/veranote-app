# Eval Case: Medication dose change with side-effect nuance

## Note type
Psychiatry follow-up

## Risk focus
Medication fidelity, dose change accuracy, side-effect overstatement

## Input source
### Clinician note
- Increased sertraline from 50 mg to 75 mg 10 days ago.
- Nausea first 3 days, now improved.
- Panic attacks decreased from 4/week to 1/week.
- Still avoiding Walmart due to crowd anxiety.
- Denies SI/HI.

### Collateral
- Spouse says patient seems less irritable.

### Transcript
- "The bump helped some."
- "I felt sick to my stomach the first few days but that's mostly gone now."
- "Still hate crowded stores."

### Objective data
- Medication list still shows sertraline 50 mg daily (not yet updated).

## Expected truths that must survive
- Dose was increased to 75 mg 10 days ago.
- Nausea was temporary and improved.
- Panic attacks decreased but are not gone.
- Crowded-store avoidance persists.
- Spouse, not patient, reported less irritability.

## Things the model must NOT add
- Sertraline 100 mg or any other incorrect dose.
- Statement that patient is free of panic symptoms.
- Statement that side effects fully resolved if source says "mostly gone."
- Claim that medication list objectively confirms 75 mg, since it conflicts.

## Known ambiguity that should stay ambiguous
- Whether dose change should continue unchanged.
- Whether agoraphobia diagnosis is appropriate.
- Exact current irritability level from the patient's own perspective.

## Review result
- Stoplight:
- Total score:
- Failures found:
- Example unsupported text:
- Recommended fix:
