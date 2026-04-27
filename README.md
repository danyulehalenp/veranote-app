# Veranote Prototype

Prototype scaffold for a clinician-facing documentation transformation app.

## Identity note
This repo/workspace still carries some legacy internal naming from the earlier `Clinical Documentation Transformer` phase.
The canonical product name is now **Veranote**.

## Product boundary note
Veranote is the clinician-facing product.
OpenClaw remains the runtime, orchestration, token-tracking, Agent Factory, and operator-control system around it.
Infrastructure/operator tooling should not be built into the Veranote product UI.

## Stack
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- OpenAI SDK
- Zod

## Current MVP scope
- structured multi-source intake for:
  - clinician notes
  - intake / collateral
  - patient conversation / transcript text
  - objective data / labs / vitals / medications
- source-faithful draft generation
- rewrite tools
- missing-data prompts
- contradiction flagging for obvious source conflicts
- saved drafts with lightweight backend persistence
- psych-first template/profile workflow
- fidelity evaluation workspace with batch flow and results export
- plain-text export plus review-bundle export
- a **small medication truth-preservation slice** focused on medication fidelity, unresolved-conflict visibility, and anti-invention guardrails

## What this MVP does not do yet
- live ambient listening
- production PHI/compliance hardening
- EHR integration
- hospital deployment/admin governance
- broad multi-specialty depth beyond the current wedge

## Safety note
Prototype use only. Use fake or de-identified data unless running in an approved compliant environment.

## Local setup
1. Copy `.env.example` to `.env.local`
2. Add `OPENAI_API_KEY` if you want live model generation
3. Run `npm install`
4. Run `npm run dev:test`
5. Open `http://localhost:3001`

If you prefer a different local port, set both `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` to that exact origin in `.env.local`.
Veranote's beta sign-in flow is origin-sensitive, so the browser URL, `NEXTAUTH_URL`, and the running dev port should all match.

## If the local site seems down

If the app appears broken, stuck on sign-in, or keeps redirecting incorrectly, it is often an origin mismatch.

Check the following:

1. Confirm the dev server is running:
   ```bash
   npm run dev:test
   ```

## Beta provider sign-in setup
For controlled beta access, configure the sign-in layer before sharing the app outside internal testing.

Required environment variables:
- `AUTH_SECRET` — long random secret for session signing
- `VERANOTE_BETA_ACCESS_CODE` — shared fallback beta access code

Optional environment variable:
- `VERANOTE_BETA_ACCOUNT_CODES` — JSON object mapping seeded provider account ids or emails to provider-specific access codes

Example:

```env
AUTH_SECRET=replace-with-a-long-random-secret
VERANOTE_BETA_ACCESS_CODE=replace-with-a-shared-beta-code
VERANOTE_BETA_ACCOUNT_CODES={"account-brandy-norris-beta":"replace-with-brandy-code","stacey.creel@veranote-beta.local":"replace-with-stacey-code"}
```

Behavior:
- invited beta providers sign in at `/sign-in`
- external beta mode scopes provider data to the signed-in account
- internal provider switching remains hidden unless internal mode is enabled

## Current behavior
- If `OPENAI_API_KEY` is present, the app uses prompt-based model generation.
- If no key is present, the app falls back to local mock generation so the workflow still works.
- Review separates contradiction warnings from missing/unclear items.
- Example cards can be loaded directly into the New Note workflow.
- Review now includes a source-evidence panel with per-source-section tabs plus a combined source view.
- Review now also surfaces likely supporting source blocks for each draft section, with transparent overlap labels and term highlighting to speed manual verification without pretending certainty.
- Draft review now includes section navigation, section review cues, trust notices, lightweight high-risk warning cues, a clinician checklist, persisted per-section review status, and reviewer-confirmed evidence links before export.
- Prompt assembly and rewrite logic were tightened to remove unsupported claims rather than polishing them into plausible fiction.
- Sparse-input handling is intentionally conservative: when the source is thin, the draft should stay thin rather than being smoothed into fake completeness.
- Plan handling is intentionally narrow: if the source does not document a plan, the draft should say so or stay minimal instead of inventing routine next steps.
- Saved drafts now retain structured source sections, copilot nudges, section-by-section review state, and reviewer-confirmed evidence links so trust work can resume where it stopped.

## Trust-focused review slice added in this pass
- Source evidence is visible beside the editable draft so users can compare before accepting wording.
- The review screen reminds users that polished prose is not evidence.
- Draft sections are surfaced as review anchors when headings are present.
- Rewrite tools are framed as wording controls, not permission to add content.
- Suggested evidence and reviewer-confirmed evidence are shown as different things, because review breadcrumbs are not truth certificates.
- High-risk warning cues now specifically watch for passive-death-wish flattening, global negation stronger than source, attribution collapse, subjective-vs-objective mismatch smoothing, medication reconciliation overcleanup, timeline compression, sparse-input richness inflation, plan overexpansion, current-denial/recent-risk erasure, and partial-improvement drift.

## Medication scope split

Current scope:
- `docs/MEDICATION-GUARDRAILS-V1.md` — immediate medication guardrails for the prototype

Deferred future architecture:
- `docs/FUTURE-MEDICATION-SUBSYSTEM.md` — preserved larger medication subsystem idea, explicitly **not** current implementation scope
- `docs/MEDICATION-ROADMAP-NOTE.md` — short note on when deeper medication architecture should come back

Short version:
- **Now:** prevent medication invention, preserve med conflicts, and keep review honest
- **Not now:** full medication reconciliation platform, normalization engine, or backend-heavy medication subsystem

## Evaluation docs
- `docs/V1-SCOPE.md` — defines the actual V1 wedge and acceptance criteria
- `docs/FIDELITY-EVAL-CHECKLIST.md` — scoring rubric for source faithfulness
- `docs/MEDICATION-GUARDRAILS-V1.md` — immediate medication fidelity and anti-invention rules for the current app
- `docs/eval-cases/` — concrete regression cases for hallucination/fidelity testing
- `docs/eval-results/` — saved regression artifacts, including serious-round summaries and raw outputs
  - latest Task #1 high-risk manual pass: `docs/eval-results/task-1-high-risk-2026-03-30.summary.md`

## Current eval set
The repo now includes 26 eval cases covering:
- sparse psych follow-up
- medication dose changes
- negation-heavy visits
- timeline-sensitive follow-up
- adolescent collateral conflict
- objective-data conflict
- therapy/process notes
- general medical follow-up
- safety-language nuance
- inpatient psych progress
- conflicting medication frequency reports
- passive death wish hidden by denial language
- temporal negation with vomiting resolved yesterday
- collateral overstatement versus patient minimization
- medication stop with delayed worsening
- inpatient behavior conflict across patient and staff sources
- therapy intervention without clear effect
- minimal input high hallucination risk
- plan statement without supporting detail
- mother reports active SI while patient denies current SI
- hallucinations denied but behavior suggests internal preoccupation
- sertraline dose conflict across clinician note, patient report, and chart
- substance use denial despite positive screen and collateral concern
- no self-harm note conflicts with recent cutting disclosed in transcript
- passive homicidal fantasy versus active violent intent
- refill request without documented medication decision

Suggested workflow:
1. pick a case from `docs/eval-cases/`
2. load the source content into the app
3. generate the draft
4. score it with `docs/FIDELITY-EVAL-CHECKLIST.md`
5. record failures before changing prompts or review UX

First serious regression round recommendation:
- Start with cases `11-19` in the Eval batch runner via `Serious regression round 1`
- If a change touches psych risk language specifically, make sure `09`, `12`, `15`, `16`, and `18` are in the pass
- If a change touches source conflict handling, make sure `05`, `11`, `14`, `16`, `20`, `22`, and `23` are in the pass
- If a change touches safety, self-harm, psychosis denial, or violence-risk wording, also run Task #1 high-risk additions: `20`, `21`, `22`, `23`, `24`, and `25` via the Eval batch runner

## Recommended next steps
1. Improve section-level heuristics into sentence- or claim-level linking where it clearly helps and stays honest.
2. Turn the current eval docs into a lightweight in-app or scripted regression workflow.
3. Add richer parsing for section headings so review anchors work on more template styles.
4. Tighten the reviewer-confirmed evidence flow so manual selections can also be made from unsupported-but-relevant source blocks with less friction.
5. Expand medication eval coverage and review cues before considering any larger medication subsystem work.

## Core principle
Missing information is flagged, not filled in. The system should improve structure and readability without inventing facts, and clinician review before use is required.
