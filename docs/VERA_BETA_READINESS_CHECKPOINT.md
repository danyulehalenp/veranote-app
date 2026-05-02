# Vera Beta Readiness Checkpoint

Date: 2026-04-25

## Current Validated Status

### Assistant / UI Workflows
- Live UI workflow regression: passed
- Live UI flow rerun: 6/6 passed
- Phase 2 regression: passed
- Phase 3 Batch 1 regression: passed
- Phase 3 Batch 2 regression: passed
- Phase 3 Batch 3 routing: passed
- Messy-provider question-bank validation: passed

### Note Builder
- Production note builder uses the live model path
- Provider / model: `openai / gpt-4.1-mini`
- Model-backed path: 12/12 cases
- Clinically usable: 11/12 cases
- Average overall score: 4.1/5
- No fake-normal MSE observed
- No unsafe discharge / risk wording observed
- No fallback shell output observed

### Psych Medication Reference
- Structured psych medication library: 109 medications
- Medication reference stress test: 35/35 passed
- No missing required dose caveats
- No missing required interaction caveats
- No hallucinated unknown medications
- No stale-context reuse in validated stress coverage
- Medication documentation prompts stayed in the documentation lane

### Medication Switching / Cross-Titration
- Switching / cross-titration stress test: 29/29 passed
- Provider-review switching caveat present
- No patient-specific order language
- High-risk switch rules working
- Messy provider phrasing recognized

### Validation Stack
- Current regression stack: 150/150 passed
- Eval suite: 43/43 passed
- Production build: passed

## What Vera Can Currently Do Well
- Chart-ready wording
- Risk and contradiction handling
- HPI generation
- Progress note refinement
- Discharge summary generation
- Note-builder draft generation
- MSE limitation handling
- Medical-versus-psychiatric overlap handling
- Violence nuance
- Eating-disorder instability wording
- Involuntary medication / refusal caution
- AMA / elopement risk wording
- Personality-language caution
- Messy shorthand provider prompts
- Psych medication lookup
- Medication monitoring questions
- Common interaction concerns
- Medication documentation wording
- Provider-review medication switching frameworks

## Known Limitations
- Vera is not a clinician of record.
- Vera is not a treatment decision-maker.
- Medication answers are not a replacement for current prescribing references.
- Switching and cross-taper responses are provider-review frameworks, not orders.
- Vera is not a licensed drug database.
- Legal, hold, and capacity language must be verified locally.
- Sparse follow-up notes may still be generic.
- Vera may occasionally produce clinically correct reasoning that still requires minor editing to become fully usable chart-ready text.
- Beta users may surface unseen phrasing failures.
- All outputs require clinician review before use.

## Beta-Safe Use Cases
- Note drafting from PHI-safe or appropriately authorized clinical source text
- HPI, progress-note, and discharge-summary draft support
- Chart-ready wording refinement
- Iterative refinement: initial response → correction → final wording
- Contradiction and risk wording support
- MSE limitation checks
- Medication reference support with verification caveats
- Interaction concern triage with verification caveats
- Switching or cross-taper framework generation with verification caveats
- Medication documentation wording

## Not-For-Beta Use Cases
- Autonomous note signing or submission
- Unsupervised medication orders
- Definitive cross-taper schedules
- Definitive diagnosis or treatment decisions
- Legal determinations
- Capacity determinations as final conclusions
- Licensed drug-database replacement
- Raw PHI memory storage

## Final Beta Recommendation
- Ready for internal use: yes
- Ready for 1 NP controlled beta tester: yes
- Ready for all 5 NP testers immediately: not yet; invite 1 first, observe for 3-5 days, then expand if no major issues

## Next Step
1. Run a final production smoke test on [app.veranote.org](https://app.veranote.org).
2. Confirm sign-in, note builder, Vera assistant, medication reference, and switching work live.
3. Invite 1 trusted NP tester.
4. Collect feedback and failure cases.
5. Convert failures into Vera Lab regression cases.
6. Expand to the remaining 4 testers after the first tester is stable.

## Readout
- Vera is currently validated for supervised beta use as a documentation assistant and reference-support tool, not as an autonomous clinical decision-maker.
- The strongest validated areas are chart wording, contradiction preservation, HPI/progress/discharge drafting, medication reference support, interaction caution surfacing, and provider-review switching frameworks.
- The beta rollout should remain staged, feedback-heavy, and clinician-reviewed.
