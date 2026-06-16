# Veranote 4-Week Beta Readiness Timeline

Date: 2026-06-16

## Position

Veranote is suitable for narrow, supervised, de-identified beta planning. It is not ready for broad PHI-bearing beta or unsupervised clinical use.

This plan assumes:
- no push or deploy without Daniel approval
- no broad auth redesign during beta hardening
- no autonomous clinical use
- no raw PHI memory storage
- all output remains clinician-reviewed

## Week 1: Access Control And Local Reliability

Goal: close obvious exposed-route gaps and make the local review surface reliable enough for daily testing.

Required outcomes:
- Provider note generation and rewrite routes require auth.
- Beta feedback submission requires auth.
- Beta feedback admin list/update is internal-mode plus admin-only.
- Build task read/write/sync is internal-mode plus admin-only.
- Provider-data routes require auth and preserve provider scoping.
- Provider account and identity switching cannot mutate state without an authorized provider context.
- MacBook-to-iMac dev viewing works over the iMac LAN URL.
- The note workspace fails open if saved-draft hydration stalls instead of staying on the preparation screen.
- Beta gate includes production durable-storage smoke coverage.
- Beta gate includes live patient-continuity workflow coverage.

Focused verification:
```bash
npx vitest run --silent=true --maxWorkers=1 tests/protected-api-routes.test.ts tests/provider-data-route-security.test.ts tests/provider-data-isolation-routes.test.ts tests/provider-access-routes.test.ts tests/beta-feedback-pipeline.test.ts tests/security-foundation.test.ts
git diff --check
```

Exit criteria:
- focused security tests pass
- local workspace loads from `http://localhost:3001/dashboard/new-note`
- LAN workspace loads from `http://192.168.1.73:3001/dashboard/new-note`
- no console errors on first workspace load
- no full release gates run without approval

## Week 2: Provider-Data Isolation And Feedback Loop

Goal: prove beta users can only see and mutate their own provider-scoped data in external beta mode.

Required outcomes:
- Drafts, latest draft, draft actions, presets, settings, assistant memory, dictation sessions, dictation audit, patient continuity, provider accounts, and provider identities have focused unauthenticated-access coverage.
- Cross-provider query/body `providerId` attempts are scoped to the authorized provider in beta mode.
- Feedback capture is easy to use and sanitized.
- Failure reports are converted into regression cases.

Focused verification:
```bash
npx vitest run --silent=true --maxWorkers=1 tests/provider-data-route-security.test.ts tests/provider-data-isolation-routes.test.ts tests/provider-access-routes.test.ts
```

Exit criteria:
- no known provider-data route bypasses
- no known admin/internal route exposed in external mode
- feedback inbox/list/update remains admin-only
- beta feedback POST still works for authenticated providers

## Week 3: One Trusted NP De-Identified Beta

Goal: run a tightly controlled first tester workflow with no broad rollout.

Tester boundary:
- one trusted NP tester
- de-identified or explicitly approved safe scenarios only
- documentation assistant and reference support only
- no autonomous signing, orders, diagnosis decisions, legal determinations, or final capacity conclusions

Required workflows:
- HPI generation
- progress note cleanup
- discharge summary draft
- risk and contradiction wording
- MSE limitation checks
- medication reference with verification caveats
- switching framework with provider-review caveats
- feedback submission from the live workflow

Approval-gated checks:
```bash
npm run connectivity:health
npm run production:smoke
npm run status:daily
npm run beta:gate
```

Exit criteria:
- 3 to 5 days without major safety or usability issues
- any failures are logged with prompt, source summary, response, problem, and desired behavior
- regressions are added for repeated or high-risk failures

## Week 4: Controlled Expansion Decision

Goal: decide whether to expand from one tester to the remaining small tester group.

Expand only if:
- no unresolved high-risk safety failures
- no known provider-data isolation issue
- note generation remains source-faithful in the tested workflows
- Atlas/Vera assistant is responsive and not stuck in thinking states
- feedback loop is working and reviewed regularly
- beta testers understand that all outputs require clinician review

If expansion is approved:
- invite the remaining small tester group gradually
- keep the same de-identified/supervised boundary
- review feedback daily
- convert defects into regression cases before adding more feature scope

Do not expand if:
- PHI handling is uncertain
- access control or provider scoping has unresolved gaps
- live assistant or note workflow reliability is inconsistent
- model output shows unresolved invention, unsafe risk wording, or missing contradiction preservation

## Current Next Step

Finish Week 1 by committing the focused security and local reliability hardening locally after review. Do not push or deploy until Daniel explicitly approves.
