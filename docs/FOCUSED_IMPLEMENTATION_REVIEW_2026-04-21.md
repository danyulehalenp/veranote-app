# Focused Implementation Review

Date: 2026-04-21  
Workspace: `/Users/danielhale/.openclaw/workspace/app-prototype`

This review is intentionally narrower than the full code snapshot in [IMPLEMENTATION_AUDIT_SNAPSHOT_2026-04-21.md](/Users/danielhale/.openclaw/workspace/app-prototype/docs/IMPLEMENTATION_AUDIT_SNAPSHOT_2026-04-21.md).

It focuses on three areas:
- auth / eval regression fixes
- assistant routing quality gaps
- production-readiness blockers

## 1. Auth / Eval Regression Fixes

### Current status

The assistant routes now require auth, which is the right production direction. The current eval harness was not updated to supply auth, so the eval runner is now functionally broken as a regression tool unless it is run with explicit mock-auth allowances.

Current `npm run eval:vera` result:

```text
Vera Eval Report
Passed: 4/19
Failed: 15/19
```

Important current-state note:
- the route is logging repeated `auth_failed` events during eval execution
- this means the eval failures are not cleanly measuring model/assistant quality anymore
- the eval system is now partially measuring auth coupling instead of assistant regressions

### Evidence

Auth middleware now enforces auth on every request:

```ts
// lib/auth/auth-middleware.ts
export async function requireAuth(request: Request): Promise<AuthenticatedRequestContext> {
  const headerToken = extractBearerToken(request);
  const cookieToken = extractCookieToken(request);
  const tokenAuth = validateMockToken(headerToken) || validateMockToken(cookieToken);

  if (tokenAuth) {
    return {
      user: tokenAuth.user,
      isAuthenticated: true,
      providerAccountId: tokenAuth.providerAccountId,
      providerIdentityId: tokenAuth.providerIdentityId,
      tokenSource: headerToken ? 'header' : 'cookie',
    };
  }

  const authorizedProvider = await getAuthorizedProviderContext();
  if (authorizedProvider) {
    return {
      user: buildProviderUser(authorizedProvider.providerIdentityId, authorizedProvider.providerAccountId),
      isAuthenticated: true,
      providerAccountId: authorizedProvider.providerAccountId,
      providerIdentityId: authorizedProvider.providerIdentityId,
      tokenSource: 'session',
    };
  }

  throw new Error('Unauthorized');
}
```

The eval runner still builds unauthenticated requests:

```ts
// lib/veranote/evals/eval-runner.ts
function buildEvalRequest(input: string) {
  return new Request('http://localhost/api/assistant/respond?eval=true', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      stage: 'compose',
      mode: 'workflow-help',
      message: input,
      context: {
        providerAddressingName: 'Daniel Hale',
        noteType: 'Inpatient Psych Progress Note',
      },
    }),
  });
}
```

The route rejects before assistant logic if auth is missing:

```ts
// app/api/assistant/respond/route.ts
let authContext;
try {
  authContext = await requireAuth(request);
} catch {
  logEvent({
    route: 'assistant/respond',
    action: 'auth_failed',
    outcome: 'rejected',
    status: 401,
  });
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

### Impact

- evals no longer provide a trustworthy regression baseline
- auth failures can mask real assistant behavior regressions
- safe logs are now noisier during eval runs because every case can emit `auth_failed`

### Minimal fix path

1. Update `buildEvalRequest(...)` in [eval-runner.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/veranote/evals/eval-runner.ts) to include a mock provider bearer token.
2. Run evals with `VERANOTE_ALLOW_MOCK_AUTH=true`, or introduce an eval-only server helper that calls the route through an authenticated request builder.
3. Keep auth enforced; do not weaken the route for eval mode.

### Recommended concrete change

Preferred approach:

```ts
headers: {
  'content-type': 'application/json',
  Authorization: 'Bearer provider:provider-daniel-hale-beta',
}
```

and run:

```bash
VERANOTE_ALLOW_MOCK_AUTH=true npm run eval:vera
```

## 2. Assistant Routing Quality Gaps

### Current status

The route has become a large orchestration layer with many support systems attached, but the main answer path is still largely rule/orchestrator-driven. In practice, some clinically important prompts are still resolving into generic workflow copy instead of the most specific contradiction/risk-aware response.

### Most important issue

The route builds rich structured support:
- knowledge bundle
- MSE analysis
- risk analysis
- contradiction detection
- defensibility
- workflow suggestions

But the route still depends on `orchestrateAssistantResponse(...)` for the core answer, then mostly appends suggestions after the fact. That means the strongest reasoning layers can influence side suggestions without materially steering the main answer enough.

### Evidence

The route now builds the support stack:

```ts
const filteredKnowledgeBundle = filterKnowledgeByPolicy(knowledgeBundleWithReferences);
const providerMemory = filterProviderMemoryByPolicy(resolveProviderMemory(providerId, { ... }));
const medicalNecessity = evaluateMedicalNecessity(sourceText);
const levelOfCare = evaluateLevelOfCare(sourceText);
const cptSupport = evaluateCptSupport(sourceText);
const losAssessment = evaluateLOS(sourceText);
const auditFlags = detectAuditRisk(sourceText);
const longitudinalSummary = summarizeTrends(buildPreviousNotes(body.context, body.recentMessages));
const mseAnalysis = parseMSEFromText(sourceText);
const riskAnalysis = detectRiskSignals(sourceText);
const contradictionAnalysis = detectContradictions(sourceText);
const nextActions = suggestNextActions(sourceText, filteredKnowledgeBundle, longitudinalSummary);
const triageSuggestion = suggestTriage(sourceText);
const dischargeStatus = evaluateDischarge(sourceText);
const workflowTasks = suggestTasks({ ... });
```

It also builds a structured prompt:

```ts
const structuredKnowledgePrompt = assembleAssistantKnowledgePrompt({
  task: rawMessage,
  sourceNote: sourceText,
  knowledgeBundle: filteredKnowledgeBundle,
  providerMemory,
  medicalNecessity,
  levelOfCare,
  cptSupport,
  losAssessment,
  auditFlags,
  nextActions,
  triageSuggestion,
  dischargeStatus,
  workflowTasks,
  longitudinalSummary,
  mseAnalysis,
  riskAnalysis,
  contradictionAnalysis,
});
```

But the main payload still comes from the orchestrator:

```ts
const { stage, mode, message, context, recentMessages, intentTrace, payload } = orchestrateAssistantResponse(body, {
  buildBoundaryHelp,
  buildConversationalHelp,
  buildInternalKnowledgeHelp,
  buildReferenceLookupHelp,
  buildGeneralKnowledgeHelp,
  buildPrivacyTrustHelp,
  buildSupportAndTrainingHelp,
  buildRequestedRevisionHelp,
  buildProvenanceHelp,
  buildPromptBuilderHelp,
  buildDirectReviewHelp,
  buildReviewScenarioHelp,
  buildUnknownQuestionFallback,
  buildWorkflowHelp,
  buildContextualSectionDraftHelp,
  buildDirectComposeHelp,
  buildMixedDomainComposeHelp,
  buildRawDetailComposeHelp,
  buildComposeScenarioHelp,
});
```

And most of the new systems then only attach suggestions:

```ts
knowledgeAwarePayload = appendUniqueSuggestions(knowledgeAwarePayload, [
  buildStructuredKnowledgeReminder(filteredKnowledgeBundle),
  ...buildDefensibilitySuggestions({ ... }),
  ...buildWorkflowSuggestions({ ... }),
  ...mseAnalysis.unsupportedNormals.slice(0, 2),
  ...(contradictionAnalysis.contradictions.length ? [contradictionAnalysis.contradictions[0].detail] : []),
]);
```

### Real observed behavior

A live test request:

```json
{
  "stage": "review",
  "mode": "workflow-help",
  "message": "Patient denies SI but later says she has a plan to overdose if discharged. What should Vera say?",
  "context": {
    "currentDraftText": "Patient denies SI but later says she has a plan to overdose if discharged. Appears internally preoccupied.",
    "noteType": "Psych Follow-Up",
    "specialty": "Psychiatry"
  }
}
```

Returned this main message:

```text
The built-in assistant should stay embedded in Veranote, keep providers in control, preserve source fidelity, and refuse unsafe clinical-decision requests. PEC and CEC questions should be treated as Louisiana workflow-reference support, not automatic disposition advice. The safer Vera role is to help providers document the risk picture, reassessment, and legal-workflow rationale clearly when they explicitly ask. This remains based on available information.
```

This answer is too generic and partially off-target for the prompt. The side suggestions are better than the main response.

### Additional routing issue

The knowledge intent classifier is very shallow and keyword-heavy:

```ts
function classifyKnowledgeIntent(input: string): KnowledgeIntent {
  const normalized = input.toLowerCase();

  if (hasKeyword(normalized, ['reference', 'source', 'citation', 'link', 'guideline', 'where can i verify'])) {
    return 'reference_help';
  }

  if (hasKeyword(normalized, ['icd', 'icd-10', 'icd10', 'code', 'coding', 'bill', 'billing', 'cpt', 'modifier'])) {
    return 'coding_help';
  }

  ...

  if (hasKeyword(normalized, ['how do i write', 'how should i write', 'document', 'documentation', 'note', 'soap', 'assessment', 'plan', 'mse'])) {
    return 'workflow_help';
  }

  if (hasKeyword(normalized, ['diagnosis', 'rule out', 'rule-out', 'what is this', 'differential', 'provisional diagnosis'])) {
    return 'diagnosis_help';
  }

  return 'draft_support';
}
```

The presence of general words like `note`, `assessment`, `plan`, or `mse` can tilt inputs toward workflow handling too early.

### Impact

- contradiction-heavy and safety-heavy prompts can receive generic workflow framing instead of the most clinically relevant answer
- the strongest new clinical layers are not yet fully shaping the main response body
- the system looks more capable in architecture than in actual final output behavior

### Minimal fix path

1. Give contradiction/risk/diagnosis-aware helpers priority before generic workflow helpers for review-stage prompts.
2. Use `structuredKnowledgePrompt` as a first-class response driver, not just a side artifact.
3. Narrow `workflow_help` keyword capture so it does not win too broadly.
4. For safety-sensitive prompts, explicitly allow the contradiction/risk analyses to replace the main payload, not just augment suggestions.

### Recommended concrete changes

- Add a contradiction-first branch before generic workflow help in [respond/route.ts](/Users/danielhale/.openclaw/workspace/app-prototype/app/api/assistant/respond/route.ts)
- Split `classifyKnowledgeIntent(...)` into:
  - risk / contradiction
  - diagnosis / substance
  - workflow
- Change `buildKnowledgeSupportPayload(...)` so it can produce the main message for contradiction-heavy review cases, not just a fallback

## 3. Production-Readiness Blockers

### Current status

The app now has stronger auth, logging, env validation, and a Supabase deployment foundation, but its core persistence and some operational paths are still prototype-grade.

### Blocker 1: primary persistence is still file-backed

[lib/db/client.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/db/client.ts) is still the effective runtime data layer for drafts, provider settings, learning, feedback, and task state.

Evidence:

```ts
const DATA_DIR = path.join(process.cwd(), '.prototype-data');
const DB_PATH = path.join(DATA_DIR, 'prototype-db.json');
```

And the database shape still includes app-critical state:

```ts
type PrototypeDb = {
  drafts: DraftRecord[];
  providerSettings: ProviderSettings;
  providerSettingsByProviderId: Record<string, ProviderSettings>;
  currentProviderAccountId: string;
  currentProviderId: string;
  notePresets: NotePreset[];
  notePresetsByProviderId: Record<string, NotePreset[]>;
  assistantLearningByProviderId: Record<string, AssistantLearningStore>;
  veraMemoryLedgerByProviderId: Record<string, VeraMemoryLedger>;
  veranoteBuildTasks: VeranoteBuildTask[];
  betaFeedback: BetaFeedbackItem[];
};
```

This is the largest production blocker in the codebase.

### Blocker 2: new Supabase layer exists, but is not integrated

The deployment foundation is present:
- [env.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/config/env.ts)
- [supabase-client.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/db/supabase-client.ts)
- [schema.sql](/Users/danielhale/.openclaw/workspace/app-prototype/lib/db/schema.sql)

But this is still preparatory infrastructure. The app is not yet actually reading and writing its core data to Supabase.

### Blocker 3: audit log is in-memory only

The new audit log foundation is useful, but it is not persistent:

```ts
// lib/audit/audit-log.ts
const auditEvents: AuditEvent[] = [];
```

That means audit data disappears with process restart.

### Blocker 4: provider memory store is in-memory only

The Phase 4 memory layer is currently process-local:

```ts
// lib/veranote/memory/memory-store.ts
const providerMemoryStore = new Map<string, ProviderMemoryItem[]>();
```

That is acceptable for a first foundation pass, but not for deployment-grade behavior.

### Blocker 5: assistant route is not backed by an external model in the current path

The assistant route currently logs this:

```ts
model: 'veranote-server-route'
```

That is a server-route label, not an external model routing identity. In contrast, note generation and rewrite still explicitly use:

```ts
const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
```

from:
- [generate-note.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/ai/generate-note.ts)
- [rewrite-note.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/ai/rewrite-note.ts)

So the product currently has:
- explicit model routing for note generation / rewrite
- mostly rule/orchestrator routing for the assistant layer

That may be intentional, but it should be treated as a real architectural distinction.

### Blocker 6: env validation is production-useful but can be operationally brittle

[env.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/config/env.ts) throws immediately if required vars are missing:

```ts
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${details}`);
}
```

This is a good production guardrail. The operational caveat is that any accidental import of this module in tooling or non-deployment contexts will hard-fail early.

### Impact

- current deployment stack is not yet the runtime truth for app persistence
- auditability and provider memory are not durable
- assistant behavior is still harder to reason about as a production model-backed service

### Minimal fix path

1. Move `lib/db/client.ts` responsibilities into real Supabase-backed storage in slices:
   - drafts
   - provider settings
   - provider memory
   - assistant learning / audit
2. Persist audit events to the database.
3. Persist provider memory to the database.
4. Decide explicitly whether Vera assistant responses stay rule-based or become model-backed through the structured prompt path.

## Recommended Next Order

1. Fix eval auth coupling so regression testing is trustworthy again.
2. Tighten contradiction/risk routing so the main assistant answer improves, not just the suggestions list.
3. Replace the file-backed prototype DB path with real Supabase storage for drafts, provider state, audit logs, and memory.

## Reference Files

Full code snapshot:
- [IMPLEMENTATION_AUDIT_SNAPSHOT_2026-04-21.md](/Users/danielhale/.openclaw/workspace/app-prototype/docs/IMPLEMENTATION_AUDIT_SNAPSHOT_2026-04-21.md)

Most relevant implementation files:
- [respond/route.ts](/Users/danielhale/.openclaw/workspace/app-prototype/app/api/assistant/respond/route.ts)
- [eval-runner.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/veranote/evals/eval-runner.ts)
- [auth-middleware.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/auth/auth-middleware.ts)
- [assistant-knowledge.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/veranote/assistant-knowledge.ts)
- [assistant-source-policy.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/veranote/assistant-source-policy.ts)
- [db/client.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/db/client.ts)
- [supabase-client.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/db/supabase-client.ts)
