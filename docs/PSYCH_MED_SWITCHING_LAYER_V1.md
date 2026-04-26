# Psych Medication Switching Layer v1

## Purpose

This layer gives Vera a structured, provider-review-only framework for psychiatric medication switching, tapering, cross-titration, and transition questions.

It is meant to support high-yield medication reference questions such as antidepressant switches, antipsychotic transitions, benzodiazepine tapers, and oral-to-LAI questions without turning Vera into a prescribing engine.

## Scope

Version 1 covers:

- switch / cross-taper intent detection
- high-risk transition rule detection
- strategy labeling for common switch types
- concise provider-review framework output
- non-authoritative safety language for high-risk transitions

## What It Can Answer

- whether a switch sounds more like direct switch, taper then switch, cross-taper, washout-required, taper-only, or oral-to-LAI transition
- whether a transition is high risk or should not be framed as a routine cross-taper
- high-yield monitoring targets during a transition
- high-yield interaction or discontinuation concerns to verify
- messy shorthand prompts such as:
  - `cross titrate zoloft to effexor`
  - `wean paxil start lexapro`
  - `prozac to zoloft how long wait`
  - `seroquel to abilify cross taper?`
  - `risperdal po to consta`
  - `xanax taper pls`

## What It Cannot Answer

- patient-specific final orders
- exact week-by-week tapers that should be used as-is
- definitive washout timing without current product verification
- individualized dose-conversion or equivalence decisions
- patient-specific pregnancy, renal, hepatic, geriatric, or interaction decision-making

## Safety Disclaimers

Every switching answer should include:

`This is a provider-review switching framework, not a patient-specific order. Verify with current prescribing references, interaction checking, and patient-specific factors.`

High-risk transitions should also make clear when specialist or current-reference guidance is required.

## Strategy Types

- `direct_switch`
- `taper_then_switch`
- `cross_taper`
- `taper_washout_switch`
- `washout_required`
- `overlap_bridge`
- `oral_to_lai_transition`
- `taper_only`
- `specialist_reference_required`
- `avoid_cross_taper`

## High-Risk Rule Categories

- MAOI switches
- fluoxetine long-half-life transitions
- paroxetine or venlafaxine discontinuation risk
- clomipramine / TCA serotonergic switch risk
- antidepressant-to-antidepressant switch caution
- antipsychotic-to-antipsychotic transition burden
- oral-to-LAI product-specific verification
- lithium transition caution
- valproate-lamotrigine transition rash / titration risk
- carbamazepine interaction-heavy transitions
- benzodiazepine taper risk
- stimulant switch or restart in mania / psychosis risk contexts
- sedative-hypnotic taper / rebound insomnia risk

## Verification Requirements

This layer is designed to force verification rather than replace it.

High-yield verification targets include:

- current dose, indication, duration, and adherence
- interaction checker review
- formulation and product-specific labeling
- washout requirements
- withdrawal or relapse risk
- monitoring needs such as labs, levels, vitals, EKG, EPS, suicidality, or toxicity checks

## Future Expansion

Future versions can add:

- richer product-specific LAI transition support
- more explicit long-half-life and discontinuation maps
- specialized switching coverage for clozapine, esketamine, methadone, and buprenorphine transitions
- licensed database integration for product-specific switching details and labeling-dependent instructions
