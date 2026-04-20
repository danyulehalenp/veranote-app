# Medication Guardrails — V1 Immediate Slice

This document defines the **small medication truth-preservation slice** for the current app.

It is intentionally narrow.
The goal is to reduce medication-related hallucination and over-cleanup in source-to-draft transformation **without** building a full medication management subsystem.

## Current goals

For V1, medication handling should:
- preserve medication names, doses, routes, frequencies, and timing **only when explicitly present in source**
- preserve unresolved source conflict instead of silently reconciling it
- preserve whether a medication was:
  - continued
  - increased or decreased
  - stopped
  - not started
  - reportedly taken differently than listed
- preserve uncertainty about adherence, side effects, or med-list accuracy
- surface review cues when the source suggests medication mismatch, outdated chart data, or incomplete reconciliation

## Current non-goals

V1 is **not** trying to:
- perform full medication reconciliation
- infer the most likely "true" active medication list
- normalize every medication into a canonical drug database
- build a dosing calculator, interaction checker, refill workflow, or prescribing tool
- auto-resolve brand/generic equivalence when the source itself is unclear
- create a medication timeline engine beyond preserving clearly stated source chronology

## First-wave medication warning candidates

These are the main medication-related warning themes worth supporting now:

1. **Medication conflict / active regimen unresolved**
   - clinician note, patient report, chart med list, MAR, refill history, or collateral disagree
   - draft should not collapse conflict into one clean regimen unless source already does

2. **Dose / frequency drift**
   - draft changes `50 mg` to `100 mg`, `daily` to `BID`, `qhs` to `nightly PRN`, etc.

3. **Medication stopped vs still listed**
   - source says patient stopped the med, but chart or med list still shows it active

4. **Adherence wording stronger than source**
   - draft says `taking as prescribed` when source only says `reports taking most days` or does not address adherence

5. **Side-effect or tolerability overstatement**
   - draft turns tentative or historical side-effect discussion into a definite current medication effect

6. **Invented plan or refill decision**
   - draft adds `continue`, `refill`, `increase`, `decrease`, `restart`, or `monitor` language not actually documented

7. **Formulation / route confusion**
   - ER/XR/IR, depot vs oral, scheduled vs PRN, injection vs tablet, patch vs oral form get flattened or swapped

## First-wave medication eval-case themes

The immediate eval set should keep covering these families:
- dose increase or decrease with conflicting med-list data
- patient-reported regimen differing from chart/listed regimen
- PRN frequency conflict across patient and collateral
- medication self-discontinuation followed by later symptom change
- refill request with minimal other source detail
- side-effect concern that is plausible but not confirmed
- inpatient `taking as ordered` language that does **not** imply a new medication plan
- chart/MAR/objective medication data that conflicts with narrative source

## Common brand / generic / formulation traps

Guard against these common cleanup errors:
- treating **brand and generic as separate active meds** when they appear to refer to the same drug
- treating **brand and generic as automatically interchangeable truth** when the source may still be inconsistent
- losing formulation qualifiers such as:
  - IR / ER / XR / SR / CR
  - tablet / capsule / liquid / patch / injection
  - scheduled vs PRN
  - oral vs IM / LAI / depot
- turning `as needed` into scheduled use
- turning a scheduled med into PRN use
- collapsing `patient says taking 50 mg` and `med list shows 100 mg` into a single confident statement
- assuming a refill request means the medication is being taken exactly as listed
- assuming MAR confirmation means outpatient adherence is known

## Must-not-invent rules

The current app must **not invent**:
- a medication name not present in source
- a dose, route, formulation, or frequency not present in source
- a medication change decision for today if the source does not state one
- that a medication was continued, refilled, restarted, increased, decreased, or stopped unless supported
- adherence status beyond what source supports
- side effects, tolerability conclusions, or benefit claims beyond what source supports
- a clean reconciled medication list when the source remains conflicted
- that a chart or medication list is current, accurate, or clinician-verified if that is not stated

## V1 implementation posture

For this phase:
- prefer explicit uncertainty over reconciliation
- prefer `source conflict remains unresolved` over picking a winner
- prefer narrow medication review warnings over a large medication architecture build
- keep medication handling in the current prompt/review/eval trust layer, not a new backend subsystem

## When to revisit

Bring back the larger medication subsystem only after the current app has:
- stable grounded drafting across the existing note wedge
- routine regression passes on medication conflict cases
- review UX that clearly shows evidence for medication statements
- evidence that medication complexity is the real next bottleneck, not general source-faithfulness
