# Step 3 PHI Isolation Review

Date: 2026-04-21  
Workspace: `/Users/danielhale/.openclaw/workspace/app-prototype`

## Goal

Implement the PHI isolation and de-identification layer for Veranote so that:

- PHI is not exposed to models
- PHI is not exposed to logs
- clinical meaning is preserved
- provider-facing output can be safely rehydrated

## Files Created

- `/Users/danielhale/.openclaw/workspace/app-prototype/lib/security/phi-types.ts`
- `/Users/danielhale/.openclaw/workspace/app-prototype/lib/security/phi-detector.ts`
- `/Users/danielhale/.openclaw/workspace/app-prototype/lib/security/phi-sanitizer.ts`
- `/Users/danielhale/.openclaw/workspace/app-prototype/lib/security/phi-rehydrator.ts`

## Files Modified

- `/Users/danielhale/.openclaw/workspace/app-prototype/app/api/assistant/respond/route.ts`
- `/Users/danielhale/.openclaw/workspace/app-prototype/lib/security/safe-logger.ts`
- `/Users/danielhale/.openclaw/workspace/app-prototype/lib/ai/assemble-prompt.ts`
- `/Users/danielhale/.openclaw/workspace/app-prototype/tests/security-foundation.test.ts`
- `/Users/danielhale/.openclaw/workspace/app-prototype/tests/assemble-prompt.test.ts`

## New Files

### `phi-types.ts`

```ts
export type PhiEntity = {
  type:
    | 'NAME'
    | 'DOB'
    | 'MRN'
    | 'PHONE'
    | 'ADDRESS'
    | 'EMAIL';
  original: string;
  placeholder: string;
};

export type PhiSanitizationResult = {
  sanitizedText: string;
  entities: PhiEntity[];
};
```

### `phi-detector.ts`

```ts
import type { PhiEntity } from '@/lib/security/phi-types';

type SupportedPhiType = PhiEntity['type'];

type PhiMatch = {
  type: SupportedPhiType;
  original: string;
  index: number;
};

const ADDRESS_PATTERN = /\b\d{1,5}\s+[A-Z][A-Za-z0-9.'-]*(?:\s+[A-Z][A-Za-z0-9.'-]*){0,5}\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Circle|Cir)\b\.?/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;
const LABELED_DOB_PATTERN = /\b(?:dob|date of birth|born)\s*[:#-]?\s*((?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4})|(?:[A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4}))\b/gi;
const LABELED_MRN_PATTERN = /\b(?:mrn|medical record number|patient id|account number)\s*[:#-]?\s*([A-Z0-9-]{7,})\b/gi;
const UNLABELED_MRN_PATTERN = /\b\d{7,}\b/g;
const LABELED_NAME_PATTERN = /\b(?:name|patient|pt|client|member)\s*[:#-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g;
const LEADING_NAME_PATTERN = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})(?=\s+(?:DOB|dob|MRN|mrn|reports|states|presents|called|is|was)\b)/gm;
const CONTEXTUAL_NAME_PATTERN = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})(?=\s+(?:DOB|dob|MRN|mrn|reports|reported|states|stated|presents|presented|called|note|chart)\b)/g;

const NON_NAME_TOKENS = new Set([
  'Avenue',
  'Birth',
  'Boulevard',
  'Chart',
  'Circle',
  'Client',
  'Court',
  'Date',
  'Drive',
  'Lane',
  'Main',
  'Medical',
  'Member',
  'Mental',
  'Name',
  'Patient',
  'Pt',
  'Record',
  'Road',
  'State',
  'Status',
  'Street',
  'Way',
]);

function collectMatches(pattern: RegExp, text: string, type: SupportedPhiType, captureGroup = 0) {
  const matches: PhiMatch[] = [];
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const raw = match[captureGroup];
    if (!raw) {
      continue;
    }

    const offsetWithinMatch = captureGroup === 0 ? 0 : match[0].indexOf(raw);
    matches.push({
      type,
      original: raw.trim(),
      index: match.index + Math.max(offsetWithinMatch, 0),
    });
  }

  return matches;
}

function buildPlaceholder(type: SupportedPhiType, count: number) {
  return `[${type}_${count}]`;
}

function isLikelyPersonName(value: string) {
  const tokens = value.split(/\s+/);
  return tokens.length >= 2 && tokens.every((token) => !NON_NAME_TOKENS.has(token));
}

export function detectPHI(text: string): PhiEntity[] {
  if (!text.trim()) {
    return [];
  }

  const matches: PhiMatch[] = [
    ...collectMatches(EMAIL_PATTERN, text, 'EMAIL'),
    ...collectMatches(PHONE_PATTERN, text, 'PHONE'),
    ...collectMatches(LABELED_DOB_PATTERN, text, 'DOB', 1),
    ...collectMatches(LABELED_MRN_PATTERN, text, 'MRN', 1),
    ...collectMatches(ADDRESS_PATTERN, text, 'ADDRESS'),
    ...collectMatches(LABELED_NAME_PATTERN, text, 'NAME', 1),
    ...collectMatches(LEADING_NAME_PATTERN, text, 'NAME', 1),
    ...collectMatches(CONTEXTUAL_NAME_PATTERN, text, 'NAME', 1),
    ...collectMatches(UNLABELED_MRN_PATTERN, text, 'MRN'),
  ];

  const seen = new Map<string, PhiEntity>();
  const counters: Record<SupportedPhiType, number> = {
    NAME: 0,
    DOB: 0,
    MRN: 0,
    PHONE: 0,
    ADDRESS: 0,
    EMAIL: 0,
  };

  matches
    .sort((left, right) => left.index - right.index || right.original.length - left.original.length)
    .forEach((match) => {
      if (match.type === 'NAME' && !isLikelyPersonName(match.original)) {
        return;
      }

      const key = `${match.type}:${match.original.toLowerCase()}`;
      if (seen.has(key)) {
        return;
      }

      counters[match.type] += 1;
      seen.set(key, {
        type: match.type,
        original: match.original,
        placeholder: buildPlaceholder(match.type, counters[match.type]),
      });
    });

  return [...seen.values()];
}
```

### `phi-sanitizer.ts`

```ts
import { detectPHI } from '@/lib/security/phi-detector';
import type { PhiEntity, PhiSanitizationResult } from '@/lib/security/phi-types';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function applyPhiEntities(text: string, entities: PhiEntity[]) {
  if (!text) {
    return '';
  }

  return entities
    .slice()
    .sort((left, right) => right.original.length - left.original.length)
    .reduce((sanitized, entity) => {
      return sanitized.replace(new RegExp(escapeRegExp(entity.original), 'g'), entity.placeholder);
    }, text);
}

export function sanitizePHITexts(texts: string[]) {
  const entities = detectPHI(texts.filter(Boolean).join('\n\n'));
  return {
    sanitizedTexts: texts.map((text) => applyPhiEntities(text, entities)),
    entities,
  };
}

export function sanitizePHI(text: string): PhiSanitizationResult {
  const { sanitizedTexts, entities } = sanitizePHITexts([text]);
  return {
    sanitizedText: sanitizedTexts[0] || '',
    entities,
  };
}

export function sanitizeForLogging(text: string) {
  return sanitizePHI(text).sanitizedText;
}
```

### `phi-rehydrator.ts`

```ts
import type { PhiEntity } from '@/lib/security/phi-types';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function rehydratePHI(text: string, entities: PhiEntity[]) {
  if (!text) {
    return '';
  }

  return entities
    .slice()
    .sort((left, right) => right.placeholder.length - left.placeholder.length)
    .reduce((rehydrated, entity) => {
      return rehydrated.replace(new RegExp(escapeRegExp(entity.placeholder), 'g'), entity.original);
    }, text);
}
```

## Route Integration

### Imports added in `respond/route.ts`

```ts
import { rehydratePHI } from '@/lib/security/phi-rehydrator';
import { sanitizeForLogging, sanitizePHITexts } from '@/lib/security/phi-sanitizer';
import type { PhiEntity } from '@/lib/security/phi-types';
```

### New route helper

```ts
function rehydrateAssistantPayload(payload: AssistantResponsePayload, entities: PhiEntity[]): AssistantResponsePayload {
  if (!entities.length) {
    return payload;
  }

  return {
    ...payload,
    message: rehydratePHI(payload.message, entities),
    suggestions: payload.suggestions?.map((item) => rehydratePHI(item, entities)),
    actions: payload.actions?.map((action) => {
      switch (action.type) {
        case 'replace-preferences':
        case 'append-preferences':
        case 'jump-to-source-evidence':
        case 'run-review-rewrite':
          return {
            ...action,
            label: rehydratePHI(action.label, entities),
            instructions: rehydratePHI(action.instructions, entities),
          };
        case 'create-preset-draft':
          return {
            ...action,
            label: rehydratePHI(action.label, entities),
            instructions: rehydratePHI(action.instructions, entities),
            presetName: rehydratePHI(action.presetName, entities),
          };
        case 'apply-conservative-rewrite':
          return {
            ...action,
            label: rehydratePHI(action.label, entities),
            instructions: rehydratePHI(action.instructions, entities),
            originalText: rehydratePHI(action.originalText, entities),
            replacementText: rehydratePHI(action.replacementText, entities),
          };
        case 'apply-note-revision':
          return {
            ...action,
            label: rehydratePHI(action.label, entities),
            instructions: rehydratePHI(action.instructions, entities),
            revisionText: rehydratePHI(action.revisionText, entities),
            targetSectionHeading: action.targetSectionHeading ? rehydratePHI(action.targetSectionHeading, entities) : action.targetSectionHeading,
          };
        case 'send-beta-feedback':
          return {
            ...action,
            label: rehydratePHI(action.label, entities),
            instructions: rehydratePHI(action.instructions, entities),
            feedbackMessage: rehydratePHI(action.feedbackMessage, entities),
            pageContext: rehydratePHI(action.pageContext, entities),
          };
        default:
          return action;
      }
    }),
  };
}
```

### PHI sanitization before pipeline/model path

```ts
const rawMessage = body.message || '';
const sourceText = buildSourceTextForReasoning(rawMessage, body.context, body.recentMessages);
const { sanitizedTexts, entities: phiEntities } = sanitizePHITexts([
  rawMessage,
  sourceText,
  body.context?.currentDraftText || '',
]);
const [sanitizedMessage, sanitizedSourceText, sanitizedDraftText] = sanitizedTexts;
```

### Assistant pipeline now uses sanitized text

```ts
const pipeline = await runAssistantPipeline({
  message: sanitizedMessage,
  sourceText: sanitizedSourceText,
  intent: knowledgeIntent,
  stage: body.stage,
  noteType: body.context?.noteType,
});
```

### Memory extraction now uses sanitized draft text

```ts
const suggestedMemory = filterProviderMemoryByPolicy(
  extractMemoryFromOutput(sanitizedDraftText || '', providerId)
    .filter((item) => !providerMemory.some((existing) => existing.content === item.content)),
).slice(0, 3);
```

### Prompt assembly now uses sanitized text

```ts
const structuredKnowledgePrompt = assembleAssistantKnowledgePrompt({
  task: sanitizedMessage,
  sourceNote: sanitizedSourceText,
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

### Final payload rehydration before response

```ts
const memoryAwarePayload = applyProviderMemoryToPayload(fidelitySafePayload, providerMemory);
const finalPayload = rehydrateAssistantPayload(memoryAwarePayload, phiEntities);

return NextResponse.json({
  ...finalPayload,
  references: hydratedReferences,
  externalAnswerMeta,
  modeMeta: buildAssistantModeMeta(mode, stage),
  suggestedMemory,
  ...(evalMode ? {
    eval: {
      rawOutput: finalPayload.message,
      ...
    },
  } : {}),
});
```

## Logging Protection

### `safe-logger.ts`

```ts
import { sanitizePHI } from '@/lib/security/phi-sanitizer';

function sanitizeMetadata(metadata?: SafeLogEvent['metadata']) {
  if (!metadata) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        if (typeof value === 'string') {
          return [key, sanitizePHI(value).sanitizedText];
        }
        return [key, value];
      }),
  );
}

export function logEvent(event: SafeLogEvent) {
  const entry = {
    timestamp: event.timestamp || new Date().toISOString(),
    route: sanitizePHI(event.route).sanitizedText,
    ...(event.action ? { action: sanitizePHI(event.action).sanitizedText } : {}),
    ...(event.model ? { model: sanitizePHI(event.model).sanitizedText } : {}),
    ...(event.userId ? { userId: sanitizePHI(event.userId).sanitizedText } : {}),
    ...(typeof event.status === 'number' ? { status: event.status } : {}),
    ...(event.outcome ? { outcome: event.outcome } : {}),
    ...(event.tokenUsage ? { tokenUsage: event.tokenUsage } : {}),
    ...(event.metadata ? { metadata: sanitizeMetadata(event.metadata) } : {}),
  };

  console.info('[veranote-safe-log]', entry);
  return entry;
}
```

Result:

- raw patient text is not logged
- log metadata is sanitized before `console.info(...)`
- entity maps are not logged

## Prompt Safety

### `assemble-prompt.ts`

The assistant prompt path now sanitizes source and task text before prompt construction.

```ts
import { sanitizePHI } from '@/lib/security/phi-sanitizer';
```

```ts
export function assemblePrompt(input: AssemblePromptInput) {
  const sanitizedSourceInput = sanitizePHI(input.sourceInput).sanitizedText;
  const constraints = summarizeSourceConstraints(sanitizedSourceInput);
  ...
  const fidelityDirectives = [...sourceShapeDirectives, ...buildFidelityDirectives(sanitizedSourceInput, input.keepCloserToSource)]
    .map((item) => `- ${item}`)
    .join('\n');
  const emergingDrugDirectives = buildEmergingDrugPromptGuidance(sanitizedSourceInput)
    .map((item) => `- ${item}`)
    .join('\n');
```

```ts
export function assembleAssistantKnowledgePrompt(input: AssistantKnowledgePromptInput) {
  const sanitizedTask = sanitizePHI(input.task).sanitizedText;
  const sanitizedSourceNote = sanitizePHI(input.sourceNote || '').sanitizedText;
  ...
  return [
    '[SOURCE NOTE]',
    sanitizedSourceNote.trim() ? truncateBlock(sanitizedSourceNote) : 'No source note provided.',
    '',
    '[TASK]',
    sanitizedTask.trim() || 'No task provided.',
    ...
  ].filter(Boolean).join('\n');
}
```

Result:

- no PHI should enter the assistant prompt path
- no PHI entity map is inserted into prompts
- prompts preserve clinical meaning using placeholders

## Example

### Input

```text
John Smith DOB 01/01/1980 reports SI
```

### Sanitized

```text
[NAME_1] DOB [DOB_1] reports SI
```

### Rehydrated provider-facing output

If the assistant internally produces:

```text
[NAME_1] DOB [DOB_1] reports suicidal ideation based on available information.
```

the final provider-facing output becomes:

```text
John Smith DOB 01/01/1980 reports suicidal ideation based on available information.
```

## Tests Added / Updated

### `tests/security-foundation.test.ts`

Added deterministic sanitize/rehydrate coverage:

```ts
it('sanitizes and rehydrates deterministic PHI placeholders', () => {
  const input = 'John Smith DOB 01/01/1980 reports SI. Call 555-123-4567 or jane@example.com.';
  const result = sanitizePHI(input);

  expect(result.sanitizedText).toContain('[NAME_1]');
  expect(result.sanitizedText).toContain('[DOB_1]');
  expect(result.sanitizedText).toContain('[PHONE_1]');
  expect(result.sanitizedText).toContain('[EMAIL_1]');
  expect(result.sanitizedText).not.toContain('John Smith');

  expect(rehydratePHI(result.sanitizedText, result.entities)).toBe(input);
});
```

### `tests/assemble-prompt.test.ts`

Added prompt PHI isolation coverage:

```ts
it('keeps PHI out of assistant prompts', () => {
  const prompt = assembleAssistantKnowledgePrompt({
    task: 'Help rewrite John Smith DOB 01/01/1980 note.',
    sourceNote: 'John Smith DOB 01/01/1980 reports suicidal ideation.',
    knowledgeBundle: {
      query: {
        text: 'Help rewrite John Smith DOB 01/01/1980 note.',
        intent: 'draft_support',
      },
      matchedIntents: ['draft_support'],
      diagnosisConcepts: [],
      codingEntries: [],
      medicationConcepts: [],
      emergingDrugConcepts: [],
      workflowGuidance: [],
      trustedReferences: [],
      memoryItems: [],
    },
  });

  expect(prompt).not.toContain('John Smith');
  expect(prompt).not.toContain('01/01/1980');
  expect(prompt).toContain('[NAME_1]');
  expect(prompt).toContain('[DOB_1]');
});
```

## Verification Results

Commands run:

```bash
npx vitest run tests/security-foundation.test.ts tests/assemble-prompt.test.ts
npm run eval:vera
npm run build
```

Results:

- `tests/security-foundation.test.ts` passed
- `tests/assemble-prompt.test.ts` passed
- `npm run eval:vera` passed `19/19`
- `npm run build` passed

## Confirmation

### No PHI in logs

Confirmed by:

- logger sanitization path in `safe-logger.ts`
- tests in `tests/security-foundation.test.ts`

### No PHI in prompt

Confirmed by:

- `assemble-prompt.ts`
- `assembleAssistantKnowledgePrompt(...)`
- tests in `tests/assemble-prompt.test.ts`

## Notes

- This establishes PHI isolation for the assistant route and assistant prompt path.
- Placeholder replacement is deterministic per request.
- The provider still sees rehydrated output.
- The model and assistant pipeline operate on sanitized text only.
- This does not yet mean full HIPAA compliance; it is the PHI isolation foundation requested in Step 3.
