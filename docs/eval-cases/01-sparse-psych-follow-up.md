# Eval Case: Sparse psychiatry follow-up with thin source

## Note type
Psychiatry follow-up

## Risk focus
Sparse source, padding risk, unsupported mental-status filler

## Input source
### Clinician note
- Follow-up for depression/anxiety.
- Mood "a little better."
- Sleeping 5-6 hours.
- Missed sertraline about twice this week.
- No SI or HI.
- Wants to keep current dose for now.

### Collateral
- None.

### Transcript
- "I'm doing a little better, not all the way there."
- "Sleep still kind of broken."
- "I forgot my pill a couple of times."

### Objective data
- Current medication listed: sertraline 50 mg daily.

## Expected truths that must survive
- Patient reports mild improvement, not full remission.
- Sleep remains impaired at about 5-6 hours.
- Sertraline adherence was imperfect this week.
- Patient denies SI/HI.
- Patient wants to continue current dose.

## Things the model must NOT add
- Full symptom review that was never provided.
- Claims of euthymic mood or "doing well" beyond the source.
- A medication increase, therapy referral, or safety plan not mentioned.
- Detailed MSE findings not supported by source.

## Known ambiguity that should stay ambiguous
- Whether anxiety improved specifically.
- Whether there were medication side effects.
- Whether functioning at work/school improved.

## Review result
- Stoplight:
- Total score:
- Failures found:
- Example unsupported text:
- Recommended fix:
