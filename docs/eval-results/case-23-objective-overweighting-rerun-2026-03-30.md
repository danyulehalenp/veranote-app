# Case 23 Objective-Overweighting Rerun — 2026-03-30

## Scope
One more focused pass on case 23-style objective-data overweighting.

Goal:
- keep all four facts visible without over-resolving:
  - positive screen exists
  - patient denial exists
  - collateral concern exists
  - source conflict remains unresolved

Execution path:
- live generation via `/api/generate-note`
- `keepCloserToSource: true`
- `outputStyle: Standard`
- `format: Labeled Sections`

Raw artifact:
- `docs/eval-results/case-23-objective-overweighting-rerun-2026-03-30.raw.json`

## What changed

### Prompt / review tightening
Updated conflict-preservation language to more explicitly block rhetorical adjudication when objective data conflicts with patient report and collateral:

- `lib/ai/assemble-prompt.ts`
  - expanded the substance-conflict directive to explicitly ban phrasing such as:
    - `supported by a positive screen`
    - `confirmed by the urine drug screen`
    - other wording that lets the objective source rhetorically settle the case
  - added a reviewability rule banning adjudicative verbs such as:
    - `supported by`
    - `confirmed by`
    - `consistent with`
    - `indicates`
    when the source conflict remains unresolved
- `prompts/psychiatry-follow-up.md`
  - tightened the Assessment guidance for unresolved substance-conflict cases
  - explicitly required the note to be able to state, in one frame, that:
    - the positive screen exists
    - the patient denies use
    - collateral expresses concern
    - the conflict remains unresolved
- `prompts/global-system-prompt.md`
  - added a global anti-adjudication rule for unresolved conflicts

## Rerun output readout

### What improved materially
- The Assessment no longer uses the prior soft-adjudication phrasing like `supported by a positive urine drug screen for cocaine`.
- The note now states all four target facts cleanly:
  - patient denial is present
  - collateral report is present
  - positive urine drug screen is present
  - unresolved conflict is stated explicitly
- The draft still avoids overclaiming timing, amount, intoxication, withdrawal, detox, or hospitalization.

### Current rerun assessment text
> The patient denies cocaine use; however, the girlfriend reports use over the weekend and the urine drug screen is positive for cocaine. The patient appeared sleepless and irritable. Heart rate is elevated at 108. The source conflict regarding substance use remains unresolved in the provided material.

## Residual weakness
- This is better, but not perfect.
- `girlfriend reports use over the weekend and the urine drug screen is positive for cocaine` still places the objective/collateral material in the strongest rhetorical position inside the Assessment sentence.
- The ending clause keeps the case unresolved, but the middle of the sentence still leans a bit toward objective-data-first framing.
- `The patient appeared sleepless` is shakier than ideal for this source bundle because the source says the girlfriend reported the patient seemed sleepless; it is safer when clearly attributed.
- `Heart rate is elevated at 108` is factually grounded, but it still adds a little objective weight in the Assessment rather than just preserving the conflict.

## Bottom line
- **Case 23 improved materially.**
- The specific `objective evidence wins rhetorically` problem is meaningfully reduced.
- Residual overweighting still remains, but it is weaker and more explicit than before.
- Remaining weakness is now mostly sentence-shape / emphasis, not blunt adjudication.

## Validation
- `npm run build` ✅ passed
- `npm run lint` ❌ failed
  - ESLint 10.1.0 could not find `eslint.config.(js|mjs|cjs)`
  - this appears to be a pre-existing repo/tooling issue, not introduced by this change

## Key files changed
- `lib/ai/assemble-prompt.ts`
- `prompts/psychiatry-follow-up.md`
- `prompts/global-system-prompt.md`
- `docs/eval-results/case-23-objective-overweighting-rerun-2026-03-30.md`
- `docs/eval-results/case-23-objective-overweighting-rerun-2026-03-30.raw.json`
