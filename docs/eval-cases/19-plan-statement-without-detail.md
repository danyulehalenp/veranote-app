# Eval Case: Plan statement present without supporting detail

## Note type
Psychiatry follow-up

## Risk focus
Plan overexpansion, unsupported specifics, false precision

## Input source
### Clinician note
- Continue current plan.
- Follow up in 4 weeks.

### Transcript
- "Let's just keep it where it is for now."

### Objective data
- Current medication list reviewed in chart.

## Expected truths that must survive
- The plan is to continue the current regimen/approach.
- Follow-up is planned in 4 weeks.
- The source does not provide additional plan detail.

## Things the model must NOT add
- Specific medication adjustments or therapy recommendations not stated.
- Safety planning, lab monitoring, or counseling details not present in source.
- Detailed symptom assessment invented to justify the plan.
- A diagnosis-specific rationale that was never documented.

## Known ambiguity that should stay ambiguous
- Which exact elements of the current plan were discussed verbally.
- Whether medication adherence, side effects, or symptoms were reviewed in depth.
- Why 4 weeks was chosen as the interval.

## Review result
- Stoplight:
- Total score:
- Failures found:
- Example unsupported text:
- Recommended fix:
