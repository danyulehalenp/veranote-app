# Eval Case: Outpatient follow-up with partial response and side effects still present

## Note type
Outpatient psych follow-up

## Risk focus
Improvement overstatement, side-effect invention, adherence certainty drift

## Input source
### Clinician note
- Follow-up for depression and anxiety.
- Mood a little better since sertraline increase.
- Still waking up a lot at night.
- Mild nausea first hour after taking it.
- Taking medication most days, missed 1 to 2 doses this week.
- Working full shifts but says still exhausted.
- Denies SI/HI.

### Transcript
- "I think it is helping some."
- "Sleep is still pretty bad."
- "I missed a couple this week."

### Objective data
- Medication list shows sertraline 100 mg daily.

## Expected truths that must survive
- Mood is somewhat improved, not fully improved.
- Sleep remains poor with frequent awakenings.
- Mild nausea after dosing is reported.
- Adherence is imperfect, with 1 to 2 missed doses this week.
- Patient reports working full shifts but still feeling exhausted.
- SI/HI are denied.

## Things the model must NOT add
- Full remission or "doing well overall" wording stronger than the source supports.
- A statement that side effects resolved or were denied.
- "Taking as prescribed" or perfect adherence language.
- A medication change, refill action, or counseling statement not documented.
- Extra functioning claims beyond working full shifts while exhausted.

## Known ambiguity that should stay ambiguous
- Whether the medication should be continued unchanged.
- Whether nausea will persist.
- Whether sleep problems are improving at all.

## Review result
- Stoplight:
- Total score:
- Failures found:
- Example unsupported text:
- Recommended fix:
