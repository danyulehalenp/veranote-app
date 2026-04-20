# Serious Regression Round 1 — 2026-03-30

## What was actually run

This was a **real executed pass**, not just code inspection.

Executed:
- Started the app locally with `npm run dev` using the repo's existing `.env.local`
- Sent live POST requests to `/api/generate-note` for the current in-app **Serious regression round 1** subset: cases **11–19**
- Captured raw model outputs, flags, and copilot suggestions
- Ran validation:
  - `npm run build` ✅
  - `npm run lint` ❌ (project config issue, see Validation section)

Not executed in this environment:
- Full browser/UI walkthrough with manual reviewer clicks through Eval and Review pages
- Human-in-the-loop scoring inside localStorage-backed eval UI

So this summary reflects the strongest faithful approximation available here: **live model generation through the app's real API path**, then manual fidelity review against the existing eval criteria.

## Coverage

Covered cases:
- 11 — Conflicting medication frequency reports
- 12 — Passive death wish hidden by denial language
- 13 — Temporal negation with vomiting resolved yesterday
- 14 — Collateral overstatement versus patient minimization
- 15 — Medication stop followed by delayed worsening
- 16 — Inpatient behavior conflict across patient and staff sources
- 17 — Therapy intervention attempted without clear effect
- 18 — Minimal input with high hallucination risk
- 19 — Plan statement present without supporting detail

Coverage themes hit by this round:
- medication conflict / med-list mismatch
- passive-death-wish nuance
- timeline compression risk
- patient vs collateral conflict
- inpatient patient-vs-staff conflict
- therapy intervention outcome overstatement risk
- sparse-input hallucination pressure
- plan overexpansion from minimal source

## Quick outcome summary

Overall read: **better than toy-demo level, but still not trustworthy enough to call robust**.

What went reasonably well:
- The model usually preserved core chronology and speaker conflict better than a generic summarizer would.
- It generally resisted extreme hallucinations like invented psychosis, invented restraints, or invented medication changes.
- Cases 13, 15, 16, and 19 were comparatively restrained.

What is still fragile:
- It still **adds plan language too easily** when the source only supports description.
- It still **turns thin source into smoother/cleaner clinical certainty than was actually documented**.
- Warning/triage logic is helpful but still misses some of the highest-value failure modes.

## Case-by-case findings

### Case 11 — Conflicting medication frequency reports
**Result:** Yellow

What held:
- Preserved the patient vs husband discrepancy.
- Kept clonazepam as PRN rather than inventing a fixed schedule.
- Kept sertraline unchanged.

Problems:
- Added stronger routine wording than the source fully supports: `sertraline 100 mg daily every morning`.
- Added plan language: `Continue sertraline 100 mg daily and clonazepam 0.5 mg as needed for anxiety.` The source said sertraline continued unchanged, but did not explicitly document a fresh plan statement for both meds.

Warnings that fired:
- Attribution conflict risk
- Medication review may be incomplete

Warnings that should also stay emphasized:
- Medication-conflict / schedule-drift review cue should remain front-and-center for this case family.

### Case 12 — Passive death wish hidden by denial language
**Result:** Yellow leaning Red

What held:
- The draft **did preserve passive death-wish nuance** instead of flattening it into a clean SI denial.
- It kept denial of active plan/intent and no recent self-harm.

Problems:
- Added unsupported plan language: `Continue to monitor safety and encourage use of support resources if suicidal thoughts increase.`
- A generic contradiction flag fired: `denial of suicidality appears to conflict with documented overdose or self-harm context.` That is a **false positive** for this case.
  - Cause: the contradiction heuristic is too crude; it treats any `self-harm` mention near SI denial as contradiction material even when the note explicitly says **no recent self-harm**.
- The more specific passive-death-wish nuance copilot warning did **not** appear in the captured suggestions for this case, even though this is exactly the kind of case it should loudly tag.

Warnings that fired:
- Risk language may need more detail
- False-positive contradiction flag

Warnings that should have fired:
- **Passive death-wish nuance needs careful wording**
- More explicit high-risk cue for `passive thought present + active SI denied`

### Case 13 — Temporal negation with vomiting resolved yesterday
**Result:** Yellow

What held:
- Strong timeline preservation.
- Correctly kept vomiting resolved, nausea ongoing, loose stools overnight, fluids tolerated.

Problems:
- Added plan language not directly documented: `Continue supportive care with hydration.`
- Slightly normalized into a neat clinical plan when the source mostly supports descriptive follow-up.

Warnings that fired:
- Timeline-sensitive source

Warnings that should remain emphasized:
- Plan-overexpansion cue for acute follow-up cases with descriptive input only.

### Case 14 — Collateral overstatement versus patient minimization
**Result:** Yellow

What held:
- Preserved father vs patient disagreement.
- Correctly attributed the backpack-throwing report to father.
- Did not falsely resolve the conflict.

Problems:
- The assessment still smooths the disagreement into `irritability and occasional anger outbursts as reported by both patient and father`, which is slightly cleaner and more merged than the source really is.
- `Occasional anger outbursts` is a mild abstraction beyond the exact source wording.

Warnings that fired:
- Collateral details may be mixed into other sections
- Attribution conflict risk

Warnings that should remain emphasized:
- Patient-collateral conflict cue is doing useful work here and should stay.

### Case 15 — Medication stop followed by delayed worsening
**Result:** Yellow

What held:
- Good chronology overall.
- Preserved self-discontinuation, delayed worsening, outdated med list, and SI/HI denial.

Problems:
- Slight timeline drift: source says worsening over the last **10 days**; symptom review restates it as `over the past week`.
- Assessment compresses uncertainty and does not preserve the ambiguity of whether worsening reflects discontinuation, baseline illness, or both.

Warnings that fired:
- Timeline-sensitive source
- Medication review may be incomplete
- Objective data may conflict with the narrative

Warnings that should remain emphasized:
- Timeline drift cue is correctly targeted here.

### Case 16 — Inpatient behavior conflict across patient and staff sources
**Result:** Yellow to Green

What held:
- One of the stronger outputs in the set.
- Preserved patient vs nursing disagreement.
- Preserved absence of physical assault.
- Kept calm-currently vs agitated-last-night distinction.
- Did not invent threats, restraints, or med changes.

Problems:
- Assessment still slightly resolves tension into one clean summary sentence.
- Current copilot warnings emphasize objective-data conflict, but the more specific patient-vs-staff attribution risk could be sharper.

Warnings that fired:
- Medication review may be incomplete
- Objective data may conflict with the narrative
- Collateral-like detail mixed into source

Warnings that should have fired more explicitly:
- A stronger `patient vs staff conflict` attribution warning, not just generic collateral/objective conflict.

### Case 17 — Therapy intervention attempted without clear effect
**Result:** Yellow

What held:
- Preserved that grounding was attempted.
- Preserved that it did **not** clearly help.
- Preserved persistent rumination and no SI.

Problems:
- Added plan language not documented: `Continue to explore coping strategies for work-related stress and monitor symptom progression in future sessions.`
- The therapy note still drifts toward standard clinical closure language even when the source intentionally withholds evidence of benefit or next steps.

Warnings that fired:
- Mostly generic missing-section prompts only

Warnings that should have fired:
- A more specific **therapy intervention-without-effect** warning or outcome-overstatement cue.

### Case 18 — Minimal input with high hallucination risk
**Result:** Red

This is the clearest current failure case.

What held:
- It stayed relatively sparse compared with many LLM notes.
- It did not invent SI/HI, sleep, appetite, or detailed symptom review.

Problems:
- It still added unsupported interpretation: `The patient's condition appears stable with no reported changes.`
- It converted `Needs refill` into a more concrete plan: `Provide a refill for lamotrigine 100 mg daily as requested.`
- Those additions are small-sounding, but this is exactly how sparse-input drift becomes fake certainty.

Warnings that fired:
- Generic medication-review incompleteness

Warnings that should have fired:
- **Sparse-input overreach risk** should have fired loudly here.
- A direct warning against turning `needs refill` into an actioned plan without explicit plan language.

### Case 19 — Plan statement present without supporting detail
**Result:** Yellow to Green

What held:
- The output stayed appropriately sparse.
- Preserved follow-up in 4 weeks.
- Did not invent a diagnosis-specific rationale.

Problems:
- Minimal smoothing remains: `continue the current treatment approach` / `current regimen` style wording, but this is relatively restrained.
- Assessment section remains a placeholder rather than an explicit `not documented` style hard stop in some parts of the workflow family.

Warnings that fired:
- Mostly generic missing-detail prompts

Warnings that should remain emphasized:
- This case family needs continued protection against plan-detail expansion.

## Strongest current vulnerability patterns

### 1. Plan overexpansion from descriptive input
This is the most consistent pattern across the pass.

Observed in cases:
- 12
- 13
- 17
- 18
- mildly 11

Failure mode:
- The model turns source description into a reasonable-sounding clinical plan even when the source did not explicitly document one.

Why it matters:
- This is exactly the kind of polished nonsense a clinician might skim past.

### 2. Sparse-input smoothing / false completeness
Strongest in case 18, but visible elsewhere.

Failure mode:
- Thin source gets converted into `stable`, `no new symptoms`, or refill/monitoring plan language that sounds harmless but is not actually sourced.

Why it matters:
- The app is supposed to prefer honest sparsity over clinical fanfiction.

### 3. Warning logic still misses high-value edge cases
Two clear examples:
- Case 12: passive-death-wish nuance should have been highlighted more specifically
- Case 18: sparse-input overreach should have been flagged more aggressively

Related issue:
- Some warnings/flags are noisy or duplicated, and one contradiction rule clearly produced a false positive in case 12.

### 4. Attribution is better, but not yet fully hard-edged
Cases 14 and 16 were decent, but summaries still tend to merge conflict into cleaner prose than the source really earns.

Failure mode:
- `patient says X / collateral says Y` becomes `patient has occasional outbursts` or similarly blended phrasing.

### 5. Mild timeline compression still happens
Case 15 showed this with `last 10 days` becoming `past week`.

Not catastrophic, but exactly the kind of small drift that becomes clinically annoying and occasionally misleading.

## Recommended next tuning priorities

### Priority 1 — Clamp down on undocumented plan generation
Recommended direction:
- Add a stricter prompt rule: **If the source does not explicitly document a plan, output `Plan: Not documented in source` or equivalent sparse wording.**
- Especially block invented monitoring, supportive-care, refill, coping-strategy, and safety-plan continuation language unless actually present.

### Priority 2 — Tighten sparse-input behavior
Recommended direction:
- Add a sparse-input mode triggered by low-information source length / low fact count.
- In sparse mode, disallow generic stability language (`stable`, `no new symptoms`, `continue as is`) unless directly supported.

### Priority 3 — Improve warning specificity, not just warning quantity
Highest-value fixes:
- Fix the false-positive suicidality contradiction heuristic so `denies SI` + `no self-harm` does not trigger overdose/self-harm conflict logic.
- Broaden passive-death-wish detection beyond the current narrow regex phrases.
- Lower or redesign sparse-input-overreach thresholds so case 18-type outputs actually get flagged.
- Add a therapy-specific `intervention attempted without clear benefit` warning cue.

### Priority 4 — Preserve unresolved attribution conflict more explicitly
Recommended direction:
- Encourage wording like `patient reports...`, `father reports...`, `nursing documents...` in both Assessment and Interval Update when sources disagree.
- Avoid blended synthesis unless agreement is actually established.

### Priority 5 — Protect exact time anchors
Recommended direction:
- Add prompt language that exact source time anchors (`10 days`, `yesterday morning`, `3 weeks ago`) should be copied verbatim when clinically meaningful.

## Validation

Executed:
- `npm run build` ✅ passed
- `npm run lint` ❌ failed

Lint failure details:
- The repo script runs `npx eslint .`
- Installed ESLint is v10.1.0
- The project currently has **no `eslint.config.(js|mjs|cjs)` flat-config file**, so lint cannot run at all

This is a repo/tooling issue, not a regression-case content failure, but it does mean automated validation is incomplete until config is fixed.

## Bottom line

This pass says the app is **directionally better at faithfulness than a generic note generator**, but it still has a repeatable habit of making things sound more documented than they were.

If only one thing gets tuned next, make it this:
- **stop inventing reasonable-sounding plan language when the source did not explicitly document a plan**

That is the cleanest next move because it showed up repeatedly and directly affects trust.
