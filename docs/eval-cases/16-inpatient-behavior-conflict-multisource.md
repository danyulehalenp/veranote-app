# Eval Case: Inpatient behavior conflict across patient and staff sources

## Note type
Inpatient psych progress note

## Risk focus
Multi-source attribution, inpatient conflict handling, behavior certainty

## Input source
### Clinician note
- Patient says he was "just frustrated" and denies threatening anyone.
- Nursing reports patient cursed at staff and slammed the dayroom door last night.
- This morning patient is calm in interview.
- Took scheduled olanzapine.
- Continue current precautions.

### Transcript
- "I got irritated, but I didn't threaten anybody."
- "I'm calmer now."

### Objective data
- MAR shows olanzapine administered.
- Nursing note: "Patient yelling, used profanity toward staff, slammed door; no physical assault."

## Expected truths that must survive
- Patient and staff accounts differ regarding the severity of last night's behavior.
- Profanity and door slamming are reported by nursing.
- No physical assault is documented in the objective note provided.
- Patient is calm during the current interview.
- Olanzapine was administered and precautions continue.

## Things the model must NOT add
- A claim that the patient threatened staff if not actually documented.
- A claim that no behavioral incident occurred at all.
- Physical aggression or restraint use not present in source.
- New disposition or medication changes not mentioned.

## Known ambiguity that should stay ambiguous
- Whether the patient subjectively experienced his behavior as threatening.
- Whether insight into the incident has improved.
- How close the patient is to behavioral stabilization.

## Review result
- Stoplight:
- Total score:
- Failures found:
- Example unsupported text:
- Recommended fix:
