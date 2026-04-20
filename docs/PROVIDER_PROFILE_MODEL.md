# Provider Profile Model

This document defines the first concrete provider-profile model for Veranote.

It is intentionally scoped to:

- founder-seeded profile defaults
- workflow-aware defaults
- output profile defaults
- review emphasis

It is not yet a full Prompt Studio or advanced customization system.

## Why This Exists

The founder dataset is strong, but it comes from one provider.

That means Veranote should not assume one universal documentation style.

Instead, it should start with a small set of profile defaults that can shape:

- which workflows feel primary
- what output settings are preferred
- what review emphasis deserves extra attention

without changing core truth safeguards.

## Guardrail

Provider profiles should influence:

- default note types
- default workflow starters
- default export preferences
- default review emphasis
- default output style

Provider profiles should **not** influence:

- whether facts may be invented
- whether source conflicts remain visible
- whether medication ambiguity can be cleaned up
- whether attribution can be flattened
- whether risk wording can be overstated

## Current Code Model

Code artifacts:

- `/Users/danielhale/.openclaw/workspace/app-prototype/types/provider-profile.ts`
- `/Users/danielhale/.openclaw/workspace/app-prototype/lib/constants/provider-profiles.ts`

The current model includes:

- profile id
- profile name
- description
- workflow focus
- review emphasis
- default role
- note-type priority
- preferred output style
- provider settings defaults
- founder workflow starter ids
- founder preset ids

## First Founder-Seeded Profiles

### 1. `Psych Discharge Heavy`

Designed for providers who repeatedly need:

- hospitalization chronology
- discharge-status clarity
- medication-change visibility
- discharge-export friendliness

Defaults:

- preferred note type priority:
  - `Inpatient Psych Discharge Summary`
  - `Inpatient Psych Progress Note`
- output style:
  - `Polished`
- review emphasis:
  - discharge chronology
  - medication fidelity
  - risk-language literalism
  - export-profile constraints

### 2. `Acute HPI / Assessment Heavy`

Designed for providers who repeatedly need:

- messy intake organization
- HPI structuring
- collateral conflict preservation
- risk and objective-data clarity

Defaults:

- preferred note type priority:
  - `Inpatient Psych Initial Adult Evaluation`
  - `Inpatient Psych Initial Adolescent Evaluation`
  - `Psych Admission Medical H&P`
- output style:
  - `Standard`
- review emphasis:
  - risk-language literalism
  - collateral attribution
  - objective-data literalism
  - medication fidelity

### 3. `Progress Note Heavy`

Designed for providers who repeatedly need:

- frequent psych follow-up
- behavior + MSE + PRN awareness
- treatment-response tracking
- conservative improvement wording

Defaults:

- preferred note type priority:
  - `Inpatient Psych Progress Note`
  - `Inpatient Psych Day Two Note`
- output style:
  - `Standard`
- review emphasis:
  - progress literalism
  - risk-language literalism
  - medication fidelity

### 4. `Meds / Labs / DX Review Heavy`

Designed for providers who repeatedly need:

- medication-sensitive review
- labs/objective-data literalism
- bounded diagnosis framing
- concise note-ready interpretation support

Defaults:

- preferred note type priority:
  - `Inpatient Psych Progress Note`
  - `Medical Consultation Note`
  - `General Medical SOAP/HPI`
- output style:
  - `Concise`
- review emphasis:
  - medication fidelity
  - objective-data literalism
  - risk-language literalism
  - export-profile constraints

## Important Gap

The profile model now includes an `Outpatient Psych Follow-Up Heavy` profile so the psych wedge is not inpatient-only at the defaults layer.

That is an important correction, but not the end of the outpatient gap. The current founder dataset is still more inpatient-heavy than outpatient-heavy, which means outpatient support is now present in code but still thinner in examples, evals, and founder-like workflow coverage.

Current outpatient fit now includes:

- routine medication management follow-up
- telehealth psych follow-up
- longitudinal symptom and functioning review
- less hospitalization chronology emphasis

Still needed next:

- stronger outpatient founder-style blueprints
- outpatient-specific eval cases
- broader outpatient provider-beta feedback

## Relationship To Existing Veranote Pieces

The provider profile model should sit above:

1. `Provider settings`
   - destination
   - ASCII-safe
   - paragraph-only
   - closer-to-source default

2. `Founder workflow starters`
   - acute admission
   - psych discharge
   - psych progress
   - meds/labs review

3. `Locked founder presets`
   - current preset catalog in `lib/note/presets.ts`

The intended hierarchy is:

- provider profile sets smart defaults
- workflow starter or preset shapes the immediate job
- trust guardrails remain global

## What This Enables Later

Later UI work can use this model for:

- provider profile picker
- onboarding defaults
- “switch my workflow mode” controls
- profile-aware review emphasis
- profile-aware starter suggestions

## What Should Happen Next

The next implementation step after this model is:

- decide which current settings screen controls should become profile-driven
- and which should remain manually editable per note

That will prevent profile logic from feeling redundant or confusing.
