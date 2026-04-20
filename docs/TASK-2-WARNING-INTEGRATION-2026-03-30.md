# Task #2 Warning Integration (2026-03-30)

## Goal

Add the highest-value next warning cues from the recent eval material without turning review into a warning wall.

## Integrated warning subset

This pass intentionally focused on a small conservative set:

1. **Global negation stronger than source**
   - Catches drafts that turn qualified denial into a clean global denial.
   - Examples: passive death-wish + `denies SI`, denial + recent cutting, denial + observed psychosis concern.

2. **Medication reconciliation cleaner than source**
   - Tightens dose/adherence/chart-mismatch review when the source still leaves the active medication picture unresolved.

3. **Subjective vs objective mismatch smoothing**
   - Broadens the older clinician-vs-objective cue so it also covers behavior-vs-denial and positive-screen-vs-denial patterns.

4. **Plan overreach**
   - Flags routine monitoring/follow-up/coping/refill language when the source has no real plan or only a very narrow one.

5. **Sparse-input richness inflation**
   - Keeps the sparse-input warning, but makes it easier to trigger when thin sources get turned into fuller, calmer, or more planful prose.

6. **Current denial erasing recent or conflicting risk detail**
   - Adds a more specific cue for the common `currently denies` cleanup failure in high-risk cases.

7. **Collateral/patient conflict flattening**
   - Keeps the attribution warning but broadens it to collateral/transcript/staff conflict instead of only classic family collateral.

## Where they appear

### Source-side review suggestions
These appear in the app's copilot suggestion layer before/during draft review:
- `lib/ai/source-analysis.ts`

Key wording now emphasizes:
- attribution conflict risk
- subjective vs objective mismatch risk
- sparse input can inflate into richer certainty
- plan may be broader than the source
- current denial may erase recent/conflicting risk detail

### Output-vs-source high-risk warning cues
These appear in the review workspace and eval mismatch-hint flow:
- `lib/eval/high-risk-warnings.ts`

Normalized warning names now include:
- `global-negation`
- `attribution-conflict`
- `subjective-objective-mismatch`
- `medication-reconciliation`
- `sparse-input-richness`
- `plan-overreach`
- `current-denial-recent-risk`

## Design choice

This pass did **not** add every candidate from the eval notes.

Reason:
- The app already had useful warning scaffolding.
- The bigger need was sharper naming and better coverage of a few specific distortion patterns.
- The warning layer should stay review-oriented, not pretend to adjudicate truth.

## Next best move

Run a targeted manual regression pass on cases:
- 20
- 21
- 22
- 23
- 24
- 18

Then trim any warnings that feel duplicative in the review UI before adding more case-specific cues.
