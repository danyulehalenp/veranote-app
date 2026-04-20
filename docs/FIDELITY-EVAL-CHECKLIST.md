# Veranote — Fidelity Evaluation Checklist

> Legacy note: older internal materials may still refer to this product as `Clinical Documentation Transformer`. The canonical product name is now **Veranote**.

## Purpose

Use this checklist to judge whether a generated draft is clinically faithful to the provided source material.

The goal is not to reward pretty writing. The goal is to catch:
- hallucinations
- altered meaning
- dropped facts
- timeline drift
- attribution mistakes
- polished nonsense

## How to use this

For each test case:
1. Load the same source input into the app
2. Generate a draft
3. Review the draft against source evidence
4. Score each category below
5. Record failures with concrete examples

## Quick pass / stoplight rating

Use this first:

- **Green** — clinically usable after normal review/editing
- **Yellow** — mostly useful but contains accuracy/fidelity issues that need correction
- **Red** — not trustworthy; meaning drift or fabrication makes the draft unsafe to rely on

## Detailed scoring rubric

Score each category:
- **2 = good**
- **1 = mixed / minor issue**
- **0 = failed / concerning**

### 1. Fact grounding
Does every substantive claim appear in or logically reflect the source?

Check for:
- invented symptoms
- invented history
- invented plan items
- invented social details
- invented risk statements

### 2. Medication fidelity
Are meds, doses, routes, frequencies, changes, and side effects preserved correctly?

Check for:
- wrong medication names
- wrong dosages
- missing medication changes
- fabricated adherence claims
- invented side effects or denials

### 3. Negation fidelity
Are negatives preserved exactly?

Check for:
- “denies SI/HI” becoming ambiguous
- absent symptoms becoming present
- “no side effects” becoming “tolerating well” when not clearly supported
- “not sure” becoming certainty

### 4. Timeline fidelity
Are dates, duration, sequence, and recency handled correctly?

Check for:
- wrong onset/duration
- mixing old and current symptoms
- moving past history into present status
- invented follow-up timing

### 5. Attribution fidelity
Does the draft preserve who said what?

Check for:
- patient statements presented as objective fact
- collateral statements attributed to patient
- clinician impression confused with reported history
- chart/objective data merged incorrectly into subjective narrative

### 6. Missing-data behavior
When source data is incomplete, does the draft stay honest?

Good behavior:
- leaves items sparse
- flags missing/unclear data
- avoids filling gaps with common-sounding filler

Failure behavior:
- auto-completes standard symptoms/history that were never provided
- adds boilerplate exam/assessment detail without support

### 7. Contradiction handling
When source materials disagree, does the draft avoid flattening the conflict into fake certainty?

Check for:
- transcript vs collateral mismatch
- objective data vs narrative mismatch
- copied contradictions with no signal
- contradictions silently resolved without basis

### 8. Template usefulness
Does the note still read like a usable note for the chosen format without sacrificing truth?

Check for:
- section structure is sensible
- wording is concise enough to use
- output is sparse when source is sparse
- formatting does not hide uncertainty

## Pass/fail guidance

Suggested thresholds:
- **Pass**: no critical failures and total score is strong across all high-risk categories
- **Conditional pass**: usable but needs targeted fixes in one or two categories
- **Fail**: any serious hallucination in meds, risk, negations, or timeline

## Critical failure conditions

Any of these should be treated as a failure even if the prose looks good:
- invented suicidal/homicidal ideation status
- invented medication, dose, or change
- invented follow-up plan or treatment decision
- incorrect attribution of collateral/patient statements
- reversal of negation or uncertainty
- fabricated objective findings

## Recommended test set categories

Build at least 2-3 cases for each:

1. **Sparse psych follow-up**
   - minimal input
   - tests whether model pads too much

2. **Medication change case**
   - dose increase/decrease, side effects, adherence nuance

3. **Negation-heavy case**
   - many denials and absent symptoms

4. **Timeline-sensitive case**
   - old symptoms vs current symptoms
   - medication history across dates

5. **Collateral conflict case**
   - patient says one thing, family/collateral says another

6. **Objective-data conflict case**
   - vitals/labs/chart detail differs from narrative impression

7. **Therapy/process note case**
   - more nuanced language, less structured objective data

8. **General medical follow-up case**
   - tests whether system over-psychiatrizes or over-normalizes

## Test case template

Use this structure for each eval file:

```md
# Eval Case: [name]

## Note type
[psychiatry follow-up / therapy progress / SOAP / etc.]

## Risk focus
[meds / negations / timeline / collateral conflict / sparse source / etc.]

## Input source
[Paste the exact structured input or source blocks used in the app]

## Expected truths that must survive
- 
- 
- 

## Things the model must NOT add
- 
- 
- 

## Known ambiguity that should stay ambiguous
- 
- 

## Review result
- Stoplight:
- Total score:
- Failures found:
- Example unsupported text:
- Recommended fix:
```

## What reviewers should write down when something fails

Be concrete. Not this:
- “felt off”

Write this instead:
- “Draft says patient is sleeping well; source only says ‘less tired’ and does not mention sleep quality.”
- “Draft states sertraline 100 mg daily; source says increased to 75 mg.”
- “Draft presents mother’s collateral as if patient confirmed it.”

## Recommendation for next build phase

Now that the repo has 19 eval cases, use the in-app `Serious regression round 1` subset as the first pass before meaningful prompt or review-workflow changes. That subset intentionally stresses hallucination pressure, conflict handling, risk-language flattening, and plan overexpansion.

If that round holds, expand to the full case library before calling the change trustworthy. That is how you keep the app from becoming smoother and dumber at the same time.
