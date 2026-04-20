# Eval Case: Timeline-sensitive follow-up with old vs current symptoms

## Note type
Psychiatry follow-up

## Risk focus
Timeline fidelity, current-vs-past symptom drift

## Input source
### Clinician note
- Two months ago had daily crying spells.
- Over last 2 weeks crying spells down to twice weekly.
- Panic attack last occurred 3 weeks ago.
- Started trazodone 50 mg one month ago; sleep improved after first week.
- Missed work once last month, none this week.

### Transcript
- "I was crying every day back then."
- "Now it's maybe a couple of times a week."
- "The last panic attack was a few weeks ago."
- "Sleep got a little better after I started the trazodone."

### Objective data
- Current meds: trazodone 50 mg qhs.

## Expected truths that must survive
- Daily crying spells were historical, not current.
- Current crying frequency is reduced, not absent.
- Last panic attack was 3 weeks ago.
- Trazodone began one month ago.
- Sleep improved after initiation.
- Work impairment improved recently.

## Things the model must NOT add
- Current daily crying spells.
- Claim that panic attacks resolved permanently.
- Wrong trazodone timing or dose.
- Statement that patient has had no functional impairment at all.

## Known ambiguity that should stay ambiguous
- Exact cause of improvement.
- Whether trazodone alone explained better sleep.
- Whether work functioning is fully normalized.

## Review result
- Stoplight:
- Total score:
- Failures found:
- Example unsupported text:
- Recommended fix:
