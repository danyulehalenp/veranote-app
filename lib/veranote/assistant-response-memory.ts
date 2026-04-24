import type { AssistantLearningStore } from '@/lib/veranote/assistant-learning';
import type { AssistantResponsePayload, AssistantStage, AssistantMode } from '@/types/assistant';

type EnrichInput = {
  payload: AssistantResponsePayload;
  learningStore: AssistantLearningStore;
  normalizedMessage: string;
  stage: AssistantStage;
  mode: AssistantMode;
  noteType?: string;
  profileId?: string;
};

const STOP_WORDS = new Set([
  'about', 'after', 'before', 'could', 'hello', 'help', 'into', 'just', 'like', 'more', 'note',
  'please', 'review', 'section', 'that', 'them', 'they', 'this', 'what', 'when', 'where', 'which',
  'with', 'would', 'your', 'workflow',
]);

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function tokenize(value: string) {
  return unique(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .map((item) => item.trim())
      .filter((item) => item.length >= 4 && !STOP_WORDS.has(item)),
  );
}

function findRelevantRememberedFacts(normalizedMessage: string, learningStore: AssistantLearningStore) {
  const messageTokens = tokenize(normalizedMessage);
  const facts = learningStore.conversationalMemoryFacts || [];

  const scored = facts.map((fact) => {
    const factTokens = tokenize(fact.fact);
    const overlap = factTokens.filter((token) => messageTokens.includes(token)).length;
    return {
      fact: fact.fact,
      score: overlap * 10 + fact.count,
    };
  });

  const matched = scored
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .map((item) => item.fact);

  if (matched.length) {
    return matched;
  }

  if (!messageTokens.length) {
    return facts.slice(0, 1).map((item) => item.fact);
  }

  return [];
}

function buildRewritePreferenceLine(noteType: string | undefined, learningStore: AssistantLearningStore) {
  if (!noteType) {
    return null;
  }

  const counts = learningStore.rewritePreferencesByNoteType?.[noteType];
  if (!counts) {
    return null;
  }

  const [tone, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
  if (!tone || typeof count !== 'number' || count < 2) {
    return null;
  }

  const toneLabel = tone === 'most-conservative'
    ? 'most conservative'
    : tone === 'closest-to-source'
    ? 'closest to source'
    : 'balanced';

  return `I’m keeping in mind that you usually prefer ${toneLabel} wording for ${noteType}.`;
}

function buildMemorySuggestions(input: EnrichInput) {
  const rememberedFacts = findRelevantRememberedFacts(input.normalizedMessage, input.learningStore);
  const rewriteLine = buildRewritePreferenceLine(input.noteType, input.learningStore);
  const suggestions = [
    ...rememberedFacts.map((fact) => `Remembered preference: ${fact}`),
    rewriteLine ? rewriteLine.replace(/^I’m keeping in mind that /, 'Remembered style: ').replace(/\.$/, '.') : null,
  ].filter(Boolean) as string[];

  return suggestions.slice(0, 3);
}

function getTopRewritePreference(noteType: string | undefined, learningStore: AssistantLearningStore) {
  if (!noteType) {
    return null;
  }

  const counts = learningStore.rewritePreferencesByNoteType?.[noteType];
  if (!counts) {
    return null;
  }

  const [tone, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
  if (!tone || typeof count !== 'number' || count < 2) {
    return null;
  }

  return tone as 'most-conservative' | 'balanced' | 'closest-to-source';
}

function getTopLanePreference(noteType: string | undefined, learningStore: AssistantLearningStore) {
  if (!noteType) {
    return null;
  }

  const records = learningStore.lanePreferencesByNoteType?.[noteType] || [];
  const top = [...records].sort((a, b) => b.count - a.count)[0];

  if (!top || top.count < 2) {
    return null;
  }

  return top;
}

function getTopPromptPreference(noteType: string | undefined, learningStore: AssistantLearningStore, profileId?: string) {
  if (profileId) {
    const profileRecords = learningStore.promptPreferencesByProfileId?.[profileId] || [];
    const topProfile = [...profileRecords].sort((a, b) => b.count - a.count)[0];
    if (topProfile && topProfile.count >= 3) {
      return topProfile.label;
    }
  }

  if (!noteType) {
    return null;
  }

  const records = learningStore.promptPreferencesByNoteType?.[noteType] || [];
  const top = [...records].sort((a, b) => b.count - a.count)[0];
  if (!top || top.count < 2) {
    return null;
  }

  return top.label;
}

function rewriteToneLabel(tone: 'most-conservative' | 'balanced' | 'closest-to-source') {
  return tone === 'most-conservative'
    ? 'most conservative'
    : tone === 'closest-to-source'
    ? 'closest to source'
    : 'balanced';
}

function enrichActions(input: EnrichInput) {
  const actions = input.payload.actions;
  if (!actions?.length) {
    return actions;
  }

  const rewritePreference = getTopRewritePreference(input.noteType, input.learningStore);
  const lanePreference = getTopLanePreference(input.noteType, input.learningStore);
  const promptPreference = getTopPromptPreference(input.noteType, input.learningStore, input.profileId);
  const rememberedFacts = findRelevantRememberedFacts(input.normalizedMessage, input.learningStore);

  return actions.map((action) => {
    if (action.type === 'apply-conservative-rewrite' && rewritePreference) {
      const preferred = action.optionTone === rewritePreference;
      return {
        ...action,
        label: preferred ? `${action.label} • preferred` : action.label,
        instructions: [
          action.instructions,
          preferred ? `This matches the rewrite style you usually prefer for ${input.noteType}.` : null,
          rememberedFacts[0] ? `Keep in mind: ${rememberedFacts[0]}.` : null,
        ].filter(Boolean).join(' '),
      };
    }

    if ((action.type === 'replace-preferences' || action.type === 'append-preferences' || action.type === 'create-preset-draft') && (lanePreference || promptPreference || rememberedFacts.length)) {
      const laneLine = lanePreference
        ? `Your repeated lane pattern for ${input.noteType} leans toward ${lanePreference.outputScope.replace(/-/g, ' ')} scope, ${lanePreference.outputStyle} style, and ${lanePreference.format} format.`
        : null;
      const promptLine = promptPreference
        ? `A repeated preference pattern is already showing up: ${promptPreference}.`
        : null;

      return {
        ...action,
        instructions: [
          action.instructions,
          laneLine,
          promptLine,
          rememberedFacts[0] ? `Remembered provider preference: ${rememberedFacts[0]}.` : null,
        ].filter(Boolean).join(' '),
      };
    }

    if (action.type === 'run-review-rewrite' && rewritePreference) {
      const preferred = (rewritePreference === 'closest-to-source' && action.rewriteMode === 'closer-to-source')
        || (rewritePreference === 'balanced' && action.rewriteMode === 'more-formal')
        || (rewritePreference === 'most-conservative' && action.rewriteMode === 'closer-to-source');

      return {
        ...action,
        label: preferred ? `${action.label} • aligned` : action.label,
        instructions: [
          action.instructions,
          `Your past review behavior most often leans ${rewriteToneLabel(rewritePreference)} for ${input.noteType}.`,
        ].join(' '),
      };
    }

    return action;
  });
}

export function enrichAssistantResponseWithLearning(input: EnrichInput): AssistantResponsePayload {
  if (input.mode === 'reference-lookup') {
    return input.payload;
  }

  const rememberedFacts = findRelevantRememberedFacts(input.normalizedMessage, input.learningStore);
  const rewriteLine = buildRewritePreferenceLine(input.noteType, input.learningStore);
  const memorySuggestions = buildMemorySuggestions(input);
  const enrichedActions = enrichActions(input);

  const actionsChanged = JSON.stringify(enrichedActions || []) !== JSON.stringify(input.payload.actions || []);

  if (!rememberedFacts.length && !rewriteLine && !memorySuggestions.length && !actionsChanged) {
    return input.payload;
  }

  const canAppendMemoryToMessage = input.stage === 'compose'
    || input.mode === 'prompt-builder'
    || /workflow|preference|preset|organize|review|rewrite|warning/.test(input.normalizedMessage);

  return {
    ...input.payload,
    actions: enrichedActions,
    message: canAppendMemoryToMessage
      ? [
          input.payload.message,
          rewriteLine,
          rememberedFacts[0] ? `I’m also keeping in mind: ${rememberedFacts[0]}.` : null,
        ].filter(Boolean).join(' ')
      : input.payload.message,
    suggestions: unique([
      ...(input.payload.suggestions || []),
      ...memorySuggestions,
    ]).slice(0, 8),
  };
}
