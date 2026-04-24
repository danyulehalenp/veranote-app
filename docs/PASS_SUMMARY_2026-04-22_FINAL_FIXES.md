# Pass Summary: Final Eval Fixes

Date: 2026-04-22  
Workspace: `/Users/danielhale/.openclaw/workspace/app-prototype`

This file records exactly what was done in the final pass that fixed the remaining Vera eval failures.

## Goal

Fix the two remaining eval failures without increasing hallucination risk:

1. perceptual contradiction handling
2. grave-disability / possible-high-risk overreach

## Files Changed

- [assistant-contradiction-detector.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/veranote/assistant-contradiction-detector.ts)
- [assistant-risk-detector.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/veranote/assistant-risk-detector.ts)
- [assistant-pipeline.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/veranote/pipeline/assistant-pipeline.ts)
- [respond/route.ts](/Users/danielhale/.openclaw/workspace/app-prototype/app/api/assistant/respond/route.ts)

## Exact Changes

### 1. Extended contradiction detection

In [assistant-contradiction-detector.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/veranote/assistant-contradiction-detector.ts):

- broadened the hallucination-denial contradiction rule to match:
  - `denies avh`
  - `denies hearing voices`
  - `appears internally preoccupied`
  - `talking to unseen others`
- changed the detail language so it explicitly says:
  - reported denial
  - observed internal-preoccupation language
  - preserve both without resolving the conflict
- added a second perceptual contradiction rule for:
  - perceptual denial vs direct perceptual/psychotic symptom language
  - examples:
    - `auditory hallucinations`
    - `visual hallucinations`
    - `hearing voices`
    - `command hallucinations`

Key new contradiction detail:

```ts
'The source includes a reported denial of hallucinations alongside observed internal-preoccupation language. Preserve the reported denial and the observed behavior without resolving the conflict.'
```

### 2. Reworked risk analysis levels

In [assistant-risk-detector.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/veranote/assistant-risk-detector.ts):

- replaced the old implicit boolean-style downstream usage with a structured level on `RiskAnalysis`
- added:

```ts
level: 'clear_high' | 'possible_high' | 'unclear'
```

- added `determineRiskLevel(signals)`:
  - `clear_high`
    - suicide active ideation / plan / intent
    - violence threats
  - `possible_high`
    - any other matched risk signals, including grave-disability/self-care concerns
  - `unclear`
    - no matched signals

This was the key change that stopped sparse grave-disability-like evidence from being treated too strongly.

### 3. Updated the assistant pipeline

In [assistant-pipeline.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/veranote/pipeline/assistant-pipeline.ts):

- removed the extra derived `highRisk: boolean`
- now returns the richer `RiskAnalysis` object directly with its `level`

Before:

```ts
risk: RiskAnalysis & { highRisk: boolean }
```

After:

```ts
risk: RiskAnalysis
```

### 4. Updated route contradiction response

In [respond/route.ts](/Users/danielhale/.openclaw/workspace/app-prototype/app/api/assistant/respond/route.ts):

- changed `buildContradictionPriorityPayload(...)` to accept full contradiction objects instead of plain detail strings
- added a dedicated perceptual contradiction branch

New behavior:

- suicide contradiction:
  - denial + plan/intent
  - explicit contradiction-first safety response
- perceptual contradiction:
  - denial of hallucinations + observed internal preoccupation / perceptual symptom signal
  - explicit separation of:
    - reported denial
    - observed behavior

Perceptual contradiction message now:

```ts
'There is a perceptual contradiction in the source. The reported denial of hallucinations and the observed behavior suggesting internal preoccupation should both remain visible without reconciliation.'
```

### 5. Updated route risk response

Also in [respond/route.ts](/Users/danielhale/.openclaw/workspace/app-prototype/app/api/assistant/respond/route.ts):

- replaced the old `buildHighRiskPriorityPayload()` with `buildRiskPriorityPayload(level)`
- route now branches on:

```ts
if (riskAnalysis.level !== 'unclear') {
```

- `clear_high`:
  - strong explicit high-risk response
- `possible_high`:
  - uncertainty-preserving response
  - avoids firm grave-disability / high-risk conclusions

New `possible_high` message:

```ts
'The source may contain elevated risk or self-care concerns, but there is insufficient data to state a firm high-risk conclusion. Preserve the concern while keeping the uncertainty visible.'
```

This is what fixed the grave-disability overreach case.

### 6. Broadened source text capture for short clinical inputs

Still in [respond/route.ts](/Users/danielhale/.openclaw/workspace/app-prototype/app/api/assistant/respond/route.ts):

- added `looksLikeClinicalReasoningSource(...)`
- kept the old `looksLikeRawClinicalDetail(...)`
- widened assistant reasoning intake just enough to admit short, clinically meaningful source lines like:

```text
Patient denies hallucinations. Nursing notes describe responding to internal stimuli.
```

Before this, some short contradiction cases were being dropped from `sourceText`, which meant the contradiction detector never saw them.

## Why These Changes Were Needed

Before this pass:
- `risk-grave-disability-not-assumed` still failed because risk routing was too forceful
- `contradiction-hallucination-denial-plus-observation` still failed because the contradiction branch was not getting triggered reliably and the wording was not specific enough

After this pass:
- grave-disability-like concerns are treated as `possible_high`, not automatically as clearly high risk
- perceptual contradictions are explicitly recognized and surfaced

## Verification Run

Command run:

```bash
npm run eval:vera
```

Result:

```text
Passed: 19/19
Failed: 0/19
```

Previously failing cases now pass:

- `contradiction-hallucination-denial-plus-observation`
- `risk-grave-disability-not-assumed`
- `risk-prior-attempt-not-current-intent` also remained clean after the wording adjustments

Build also rechecked:

```bash
npm run build
```

Result:
- passed

## Net Effect

This pass did not add broad new functionality. It was a final stabilization pass that:

- made contradiction handling more clinically precise
- made risk escalation more conservative and uncertainty-aware
- fixed short-source ingestion for contradiction reasoning
- brought the Vera eval suite to `19/19`

## Related Files

If you want the broader context for this pass, see:

- [STABILIZATION_PATCH_AND_FINDINGS_2026-04-21.md](/Users/danielhale/.openclaw/workspace/app-prototype/docs/STABILIZATION_PATCH_AND_FINDINGS_2026-04-21.md)
- [FOCUSED_IMPLEMENTATION_REVIEW_2026-04-21.md](/Users/danielhale/.openclaw/workspace/app-prototype/docs/FOCUSED_IMPLEMENTATION_REVIEW_2026-04-21.md)
- [IMPLEMENTATION_AUDIT_SNAPSHOT_2026-04-21.md](/Users/danielhale/.openclaw/workspace/app-prototype/docs/IMPLEMENTATION_AUDIT_SNAPSHOT_2026-04-21.md)
