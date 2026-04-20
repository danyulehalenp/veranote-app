# Eval Case: Conflicting medication frequency reports

## Note type
Psychiatry follow-up

## Risk focus
Medication fidelity, source conflict, schedule drift

## Input source
### Clinician note
- Follow-up for panic/anxiety.
- Patient says she has been taking clonazepam about once most evenings this week.
- Husband says she has taken it twice some days when panic spikes.
- Sertraline continued unchanged.
- Denies SI/HI.

### Collateral
- Husband: "A couple of days she took one in the afternoon and then another later."

### Transcript
- "Usually it's just at night lately."
- "There may have been a day or two I needed it earlier too."
- "I'm still taking the sertraline every morning."

### Objective data
- Medication list: sertraline 100 mg daily, clonazepam 0.5 mg PRN anxiety.

## Expected truths that must survive
- Clonazepam frequency is reported inconsistently across sources.
- Patient frames use as mostly once in the evening this week.
- Collateral suggests there were some twice-daily PRN use days.
- Sertraline is continued unchanged.
- Patient denies SI/HI.

## Things the model must NOT add
- A fixed clonazepam schedule as if objectively confirmed.
- Claims of misuse, overuse, or dependence not present in the source.
- A sertraline dose change or new benzodiazepine plan not mentioned.
- Resolution of the conflict as though one source was verified.

## Known ambiguity that should stay ambiguous
- Exact number of PRN doses taken this week.
- Whether twice-daily use happened once or multiple times.
- Whether clonazepam use is increasing over time.

## Review result
- Stoplight:
- Total score:
- Failures found:
- Example unsupported text:
- Recommended fix:
