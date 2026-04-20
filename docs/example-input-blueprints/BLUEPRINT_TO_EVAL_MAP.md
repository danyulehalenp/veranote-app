# Blueprint To Eval Map

This map ties the new example-input blueprints to current and future Veranote eval work.

## Already Covered Well By Existing Eval Cases

### Acute psych HPI / assessment

- [05-collateral-conflict-adolescent.md](/Users/danielhale/.openclaw/workspace/app-prototype/docs/eval-cases/05-collateral-conflict-adolescent.md)
- [20-mother-reports-active-si-patient-denies-current-si.md](/Users/danielhale/.openclaw/workspace/app-prototype/docs/eval-cases/20-mother-reports-active-si-patient-denies-current-si.md)
- [21-hallucinations-denied-but-behavior-suggests-internal-preoccupation.md](/Users/danielhale/.openclaw/workspace/app-prototype/docs/eval-cases/21-hallucinations-denied-but-behavior-suggests-internal-preoccupation.md)
- [23-substance-denial-vs-positive-screen-and-collateral.md](/Users/danielhale/.openclaw/workspace/app-prototype/docs/eval-cases/23-substance-denial-vs-positive-screen-and-collateral.md)

### Inpatient psych progress note

- [10-inpatient-psych-progress.md](/Users/danielhale/.openclaw/workspace/app-prototype/docs/eval-cases/10-inpatient-psych-progress.md)
- [16-inpatient-behavior-conflict-multisource.md](/Users/danielhale/.openclaw/workspace/app-prototype/docs/eval-cases/16-inpatient-behavior-conflict-multisource.md)

### Meds / labs / diagnosis review

- [02-medication-dose-change.md](/Users/danielhale/.openclaw/workspace/app-prototype/docs/eval-cases/02-medication-dose-change.md)
- [06-objective-data-conflict.md](/Users/danielhale/.openclaw/workspace/app-prototype/docs/eval-cases/06-objective-data-conflict.md)
- [11-conflicting-medication-frequency.md](/Users/danielhale/.openclaw/workspace/app-prototype/docs/eval-cases/11-conflicting-medication-frequency.md)
- [22-sertraline-dose-conflict-across-sources.md](/Users/danielhale/.openclaw/workspace/app-prototype/docs/eval-cases/22-sertraline-dose-conflict-across-sources.md)
- [26-refill-request-without-documented-med-decision.md](/Users/danielhale/.openclaw/workspace/app-prototype/docs/eval-cases/26-refill-request-without-documented-med-decision.md)

## Undercovered And Worth Adding Next

### Inpatient psych discharge

This is strongly represented in the mined founder-history and currently underrepresented in the eval suite.

Recommended next evals:

- discharge summary with partial improvement, not full remission
- discharge denial of SI/HI/AVH after earlier admission symptoms
- discharge med optimization mentioned vaguely without exact changes
- discharge follow-up requested but not fully specified

### Format / destination constraints

This is a real job from the founder history and currently weakly represented in evals.

Recommended next evals:

- ASCII-safe export without loss of risk wording
- destination-specific formatting without adding content
- same note exported under two output constraints

### Outpatient psych follow-up

This is now part of the product model but still thin in the eval suite.

Recommended next evals:

- partial outpatient improvement with persistent insomnia, anxiety, or concentration symptoms
- telehealth follow-up with chronic passive SI history but no acute intent
- refill/adherence visit where the medication decision is still underspecified
- functioning improvement claims that should stay modest and source-bound

### Outpatient psychiatric evaluation

This is also newly present in the product model and should be protected against premature diagnostic certainty.

Recommended next evals:

- depression versus bipolar-spectrum uncertainty
- old diagnosis in records but not yet confirmed today
- intake with mixed trauma, attention, and anxiety symptoms
- chronic risk history without current acute intent

## Suggested Near-Term Eval Expansion Order

1. inpatient psych discharge
2. format / destination constraints
3. outpatient psych follow-up
4. outpatient psychiatric evaluation
5. more med/lab-sensitive follow-up and refill boundary cases
