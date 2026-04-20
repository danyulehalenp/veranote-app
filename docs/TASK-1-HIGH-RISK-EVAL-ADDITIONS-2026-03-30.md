# Task #1 High-Risk Eval Additions (2026-03-30)

## Purpose

This pass integrates a focused subset of the strongest newer Task #1 failure modes into the app prototype's eval library without bloating the case set.

These additions are intentionally synthetic, conservative, and tuned toward failure modes that are both clinically meaningful and easy for a polished draft to get subtly wrong.

## Cases added

### 20 — Mother reports active SI while patient denies current SI
Why it matters:
- Tests whether the note preserves a live source conflict around suicidality.
- Punishes overconfident resolution in either direction.

### 21 — Hallucinations denied but behavior suggests internal preoccupation
Why it matters:
- Tests whether denial of AH/VH gets flattened into full psychosis absence.
- Also punishes converting behavioral concern into unsupported confirmed hallucinations.

### 22 — Sertraline dose conflict across clinician note, patient report, and chart
Why it matters:
- Stronger medication-source conflict case than the prior "dose change with side-effect nuance" case.
- Forces the app to preserve intended dose versus actual reported use.

### 23 — Substance use denied despite positive screen and collateral concern
Why it matters:
- Tests patient denial against both collateral and objective data.
- Punishes fake certainty about exact timing/pattern of use.

### 24 — No self-harm in clinician note but transcript discloses recent cutting
Why it matters:
- Tests whether transcript content is ignored when it conflicts with a cleaner clinician summary.
- Distinguishes recent cutting from suicidal intent without erasing either point.

### 25 — Passive homicidal fantasy versus active violent intent
Why it matters:
- Adds violence-risk nuance not previously represented well in the eval library.
- Punishes both overstatement into active homicidal intent and over-reassuring flattening.

## What was intentionally not added in this pass

These themes were already represented enough to avoid duplicate bloat:
- passive death wish described as not wanting to wake up
- timeline drift after interrupted medication adherence
- partial inpatient improvement mistaken for discharge readiness
- minimal source input inviting fabricated plan details
- medical complaint minimized by patient but objective abnormality present

Those remain important, but the existing cases already cover them reasonably well.

## Workflow change

The Eval batch runner now includes a dedicated subset:
- `Task #1 high-risk additions`

Use this subset when a prompt, review, or generation change touches:
- suicidality conflict handling
- self-harm wording
- psychosis denial versus observed behavior
- medication/source reconciliation
- substance-use contradiction handling
- violence-risk wording

## Recommended next move

Run one manual pass of cases `20-25`, save scorecards/results artifacts, and use the failures to decide whether the next prompt revision should prioritize:
1. conflict-preserving attribution language,
2. risk-language guardrails, or
3. medication/source mismatch wording.
