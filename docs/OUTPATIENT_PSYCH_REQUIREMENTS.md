# Outpatient Psych Requirements

This document exists to correct an important bias in the current Veranote build direction.

## Why This Matters

The founder workflow is strongly shaped by:

- inpatient psych
- acute psychiatric hospital documentation
- hospitalization chronology
- discharge summaries
- inpatient progress-note pressure

That founder signal is valuable, but it is not the whole psych market.

In reality, many psych providers work primarily in outpatient settings.

That means Veranote cannot mature as a psych-first product while behaving as if:

- psych documentation mostly means inpatient progress notes
- discharge summaries are the central psych note
- acute admission framing is the dominant psych workflow

## Product Correction

Veranote should remain psych-first, but psych-first should explicitly include both:

1. `Inpatient psych`
2. `Outpatient psych`

The founder dataset is currently more heavily weighted toward inpatient work.

That means outpatient psych must be handled as:

- an intentional expansion within the psych wedge
- not a vague later specialty expansion

## What Makes Outpatient Psych Different

Outpatient psych notes often differ from inpatient psych notes in meaningful ways:

- ongoing therapeutic alliance matters more
- longitudinal medication management is central
- symptom change over time may be subtler
- function, work, family, and daily-life context are often more prominent
- telehealth framing may matter
- visit cadence and follow-up planning are different
- acute insurance-driven inpatient language is often less central
- the note may need to balance concise med-management structure with a longitudinal outpatient feel

## Outpatient Psych Workflows Veranote Should Eventually Support Well

### 1. Outpatient medication-management follow-up

Examples:

- routine psych follow-up
- depression/anxiety med check
- ADHD follow-up
- bipolar maintenance follow-up
- side-effect review
- adherence and response tracking

### 2. Telehealth psych follow-up

Examples:

- telehealth visit summary
- remote symptom review
- medication response and follow-up planning
- functioning and stressor update

### 3. Outpatient intake / psychiatric evaluation

Examples:

- new outpatient psychiatric evaluation
- longer psychosocial and longitudinal history
- med-history-heavy initial visits
- diagnostic clarification without inpatient urgency framing

### 4. Ongoing longitudinal psych care

Examples:

- symptom trajectory over months
- chronic-risk nuance
- medication trials over time
- psychotherapy/therapy coordination
- family/work/social functioning updates

## Key Product Implications

Outpatient psych support will likely require:

- note types that are clearly outpatient, not inpatient-derived
- different workflow starters
- different review emphasis
- different template defaults
- different trust checks for chronology and risk wording

For example:

- inpatient discharge review focuses on current-vs-admission-vs-hospital-course chronology
- outpatient follow-up review may focus more on:
  - prior-visit vs current-visit change
  - medication response over time
  - functional change
  - telehealth context
  - chronic-risk nuance without false reassurance

## Guardrail

Veranote should not force outpatient psych providers into inpatient-shaped note logic.

That would create:

- awkward note structure
- wrong emphasis
- unnecessary hospital-style wording
- reduced product fit outside acute settings

## What This Means Right Now

Near-term product truth:

- the founder workflow remains inpatient-heavy
- the current prototype is strongest in inpatient psych
- outpatient psych should now be treated as an explicit psych-wedge requirement, not a generic later expansion

## Recommended Next Moves

1. Add explicit outpatient psych note types to the product model.
2. Add at least one outpatient psych provider profile.
3. Add outpatient psych founder-style blueprints or provider-beta scenarios.
4. Add outpatient psych eval cases before claiming broad psych readiness.
5. Use provider beta to compare:
   - inpatient-heavy fit
   - outpatient-heavy fit

## Short Version

Veranote is psych-first.

But psych-first must mean more than inpatient psych.

The product should explicitly grow toward outpatient psych workflows inside the psych wedge, not wait until some vague later “expansion” phase.
