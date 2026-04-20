# Targeted Rerun — Cases 18 and 17 — 2026-03-30

## Scope
One more strict sparse-input / ultra-literalness pass with two specific goals:
1. make extremely thin source stay brutally minimal instead of mildly tidied
2. preserve explicit no-SI / no-risk language better in therapy-shaped output

Execution path:
- live generation via `generateNote`
- `keepCloserToSource: true`
- `outputStyle: Standard`
- `format: Labeled Sections`

Raw rerun output:
- `docs/eval-results/targeted-rerun-cases-18-17-2026-03-30.raw.json`

## What changed in this pass

### Constraint detection
- Added `sourceHasExplicitNoSiOrRiskLine` detection in `lib/ai/source-analysis.ts` so prompt assembly can explicitly protect documented no-SI / no-self-harm / denial-of-plan language.

### Prompt assembly tightening
- Added a stronger very-sparse directive in `lib/ai/assemble-prompt.ts` telling the model to keep unsupported required sections empty/minimal or use very short wording like `Not documented in source.`
- Explicitly discouraged fake-completeness filler such as:
  - `No new symptom details were provided`
  - `Assessment details were not provided in the source`
- Tightened handling of minimal status language so `about the same` / `nothing major changed` must stay literal rather than being converted into `stable`, `no new symptoms`, or fuller symptom review language.
- Added an explicit reviewability directive telling the model to keep negative safety language visible when present.

### Template prompt tightening
- `prompts/psychiatry-follow-up.md`
  - strengthened very-sparse rules
  - explicitly banned note-padding filler lines
  - reinforced preservation of explicit no-SI / no-self-harm / denial-of-plan language
- `prompts/therapy-progress.md`
  - explicitly told the model to keep documented no-SI / no-risk lines visible in therapy notes
  - added a brief anti-filler rule for unsupported sections

## Case 18 — Minimal input with high hallucination risk

### New output snapshot
- `Chief Concern / Interval Update: The patient presents for a brief medication check. The patient reports "about the same" and "nothing major changed" since the last visit.`
- `Symptom Review: Not documented in source.`
- `Medications / Adherence / Side Effects: The patient is currently prescribed lamotrigine 100 mg daily. A medication refill is needed.`
- `Mental Status / Observations: Not documented in source.`
- `Safety / Risk: Not documented in source.`
- `Assessment: Not documented in source.`
- `Plan: Refill for lamotrigine requested. Further plan details not documented in source.`

### Readout
What improved:
- The worst filler line is gone: `No new symptom details were provided` no longer appears.
- The source phrases `about the same` and `nothing major changed` survived directly.
- The note stays narrow on refill language and does not imply refill completion.
- Unsupported sections now collapse into much shorter `Not documented in source` wording instead of pretending to summarize absent content.

What still remains weak:
- `since the last visit` is still an added time anchor not explicitly stated in the source.
- `Further plan details not documented in source` is still section scaffolding; it is safer than fake plan content, but still not ideal ultra-literal output.
- The case is better, but still not truly elegant; it still wants to tidy the sparse source into a conventional note shell.

Bottom line:
- **Case 18 improved materially enough to count as a real gain, but it is still not fully solved.**
- The anti-smoothing pass helped, especially by removing the most misleading fake-completeness symptom filler.

## Case 17 — Therapy intervention attempted without clear effect

### New output snapshot
- `Subjective: The patient discussed work-related stress and continued to ruminate about feedback from their supervisor. They reported that the grounding exercise reviewed during the session "didn't really help much" when attempted.`
- `Assessment: The patient remains focused on supervisor feedback and finds grounding exercises of limited benefit at this time. No suicidal ideation was reported.`
- `Plan: No plan details were documented in the source.`

### Readout
What improved:
- The attempted intervention remains visible in the main note.
- The lack of benefit remains visible in the main note.
- The explicit no-SI line now survives into the final therapy output (`No suicidal ideation was reported.`), which is better than the prior pass.
- The note still avoids inventing homework, symptom relief, or broader therapy progress.

What still remains weak:
- `finds grounding exercises of limited benefit at this time` is a little smoother and broader than the source wording `didn't really help much` / `wasn't doing much for me right then`.
- `No plan details were documented in the source` is still placeholder-ish rather than truly note-native.

Bottom line:
- **Case 17 improved materially.**
- The no-SI preservation specifically is better on this pass.

## Net readout
- Case 18: better, more literal, less fake-complete, still somewhat scaffolded.
- Case 17: better, with clear preservation of both no-benefit language and the explicit no-SI line.

## Validation
- `npm run build` ✅ passed
- `npm run lint` ⚠️ failed because the repo still has no `eslint.config.(js|mjs|cjs)` file for ESLint v10

## Key files changed
- `lib/ai/source-analysis.ts`
- `lib/ai/assemble-prompt.ts`
- `prompts/psychiatry-follow-up.md`
- `prompts/therapy-progress.md`
- `docs/eval-results/targeted-rerun-cases-18-17-2026-03-30.md`
- `docs/eval-results/targeted-rerun-cases-18-17-2026-03-30.raw.json`
