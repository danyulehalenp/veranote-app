# Vera Phase 2 Stability Milestone

Date: 2026-04-23

## Context
- Provider profile / workflow context: `mixed-inpatient-psych-medical-consult`
- Test shape: 13 messy multi-turn provider conversations
- Conversation structure: initial prompt, correction prompt, pressure prompt
- Verification baseline: live `POST /api/assistant/respond?eval=true` regression run

## Milestone Result
- Phase 2 provider simulation regression pass: `13/13`
- Generic fallback count: `0`
- Answer-mode issues: `0`
- Routing issues: `0`
- Unsafe simplification: `0`

## Failure Modes Resolved
- Pressure-turn answer-mode persistence now holds for:
  - `chart_ready_wording`
  - `warning_language`
  - `clinical_explanation`
  - `workflow_guidance`
  - `mse_completion_limits`
- Generic meta-wrapper failures were removed from the Phase 2 conversation set:
  - no `Keep this source-bound...`
  - no `Ask for the exact wording...`
  - no `I don't have a safe Veranote answer for that yet.`
- Legal hold wording now preserves threshold caution under correction and pressure turns.
- Ambiguous follow-up prompts now keep the active clinical target instead of drifting into unrelated templates.
- Collateral versus patient conflict wording now remains report-versus-report rather than adjudicating truth.
- Discharge blocker responses now stay chart-ready under rushed pressure.
- Capacity, overlap, withdrawal, fragmented-source, and stimulant-boundary families now resist shortcut framing without falling into generic fallback.

## Remaining Caveats
- This milestone pins the current 13-conversation Phase 2 set; it does not prove broad readiness across all psychiatric documentation scenarios.
- The regression suite covers provider-facing answer shape and pressure persistence, not external-reference freshness or specialty-specific edge cases outside the current corpus.
- Operational caveat remains separate from assistant behavior: one historical failed `metric_insert` queue row is still present in monitoring, but it did not affect the passing Phase 2 regression.

## Recommended Next Phase
- Promote this passing Phase 2 set as a required regression gate for future assistant changes.
- Expand coverage into Phase 3 real-world scenarios with higher variance populations and clinical domains:
  - pediatric / adolescent psych
  - geriatric cognitive overlap
  - pregnancy / postpartum psych
  - eating-disorder medical instability
  - violence / homicide nuance
  - sedative / benzo / opioid risk
  - trauma-informed documentation
  - outpatient and consult-liaison follow-up pressure

## Release Guidance
- Safe to keep using for controlled internal verification on the pinned Phase 2 conversation set.
- Any future routing or wording changes that touch pressure persistence should rerun:
  - Phase 2 provider simulation regression suite
  - `npm run eval:vera`
  - `npm run build`
