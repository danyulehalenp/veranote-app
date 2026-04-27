import type { AssistantLearningStore } from '@/lib/veranote/assistant-learning';
import type { NoteSectionKey, OutputScope } from '@/lib/note/section-profiles';
import { buildLanePreferencePrompt } from '@/lib/veranote/preference-draft';
import type { VeraMemoryLedgerItem } from '@/types/vera-memory';

export type ParsedLedgerRecordKey = {
  scope: string;
  key: string;
};

export type ObservedLaneDescriptor = {
  noteType: string;
  outputScope: string;
  outputStyle: string;
  format: string;
};

export type ResolvedPromptLedgerRecord = {
  noteType: string;
  key: string;
  seedPrompt: string;
};

export type ResolvedProfileLedgerRecord = {
  profileId: string;
  key: string;
  seedPrompt: string;
};

export type ResolvedRewriteLedgerRecord = {
  noteType: string;
  tone: 'most-conservative' | 'balanced' | 'closest-to-source';
};

export type ResolvedLaneLedgerRecord = {
  noteType: string;
  key: string;
  prompt: string;
};

export type AcceptedLedgerReopenTarget =
  | {
      kind: 'rewrite';
      noteType: string;
      tone: ResolvedRewriteLedgerRecord['tone'];
    }
  | {
      kind: 'lane';
      noteType: string;
      key: string;
    }
  | {
      kind: 'prompt';
      noteType: string;
      key: string;
    }
  | {
      kind: 'profile';
      profileId: string;
      key: string;
    };

export function parseLedgerRecordKey(prefix: string, itemId: string): ParsedLedgerRecordKey {
  const remainder = itemId.slice(prefix.length);
  const splitIndex = remainder.indexOf(':');

  if (splitIndex === -1) {
    return { scope: remainder, key: '' };
  }

  return {
    scope: remainder.slice(0, splitIndex),
    key: remainder.slice(splitIndex + 1),
  };
}

export function parseObservedLaneDescriptor(itemId: string): ObservedLaneDescriptor | null {
  const remainder = itemId.slice('observed-lane:'.length);
  const parts = remainder.split(':');

  if (parts.length < 4) {
    return null;
  }

  const [noteType, outputScope, outputStyle, format] = parts;
  return { noteType, outputScope, outputStyle, format };
}

export function resolvePromptLedgerRecord(
  store: AssistantLearningStore,
  item: VeraMemoryLedgerItem,
): ResolvedPromptLedgerRecord | null {
  const promptPrefixes = ['accepted-prompt:', 'observed-prompt:'] as const;
  const matchedPrefix = promptPrefixes.find((prefix) => item.id.startsWith(prefix));

  if (!matchedPrefix) {
    return null;
  }

  const { scope: noteType, key } = parseLedgerRecordKey(matchedPrefix, item.id);
  const promptRecord = (store.promptPreferencesByNoteType[noteType] || []).find((record) => record.patternKey === key);

  if (!promptRecord) {
    return null;
  }

  return {
    noteType,
    key,
    seedPrompt: promptRecord.seedPrompt,
  };
}

export function resolveProfileLedgerRecord(
  store: AssistantLearningStore,
  item: VeraMemoryLedgerItem,
): ResolvedProfileLedgerRecord | null {
  const profilePrefixes = ['accepted-profile:', 'observed-profile:'] as const;
  const matchedPrefix = profilePrefixes.find((prefix) => item.id.startsWith(prefix));

  if (!matchedPrefix) {
    return null;
  }

  const { scope: profileId, key } = parseLedgerRecordKey(matchedPrefix, item.id);
  const profileRecord = (store.promptPreferencesByProfileId[profileId] || []).find((record) => record.patternKey === key);

  if (!profileRecord) {
    return null;
  }

  return {
    profileId,
    key,
    seedPrompt: profileRecord.seedPrompt,
  };
}

export function resolveRewriteLedgerRecord(item: VeraMemoryLedgerItem): ResolvedRewriteLedgerRecord | null {
  const rewritePrefixes = ['accepted-rewrite:', 'observed-rewrite:'] as const;
  const matchedPrefix = rewritePrefixes.find((prefix) => item.id.startsWith(prefix));

  if (!matchedPrefix) {
    return null;
  }

  const { scope: noteType, key } = parseLedgerRecordKey(matchedPrefix, item.id);
  return {
    noteType,
    tone: key as ResolvedRewriteLedgerRecord['tone'],
  };
}

export function resolveLaneLedgerRecord(
  store: AssistantLearningStore,
  item: VeraMemoryLedgerItem,
): ResolvedLaneLedgerRecord | null {
  if (item.id.startsWith('accepted-lane:')) {
    const { scope: noteType, key } = parseLedgerRecordKey('accepted-lane:', item.id);
    const laneRecord = (store.lanePreferencesByNoteType[noteType] || []).find((record) => (
      lanePreferenceKey(record) === key
    ));

    if (!laneRecord) {
      return null;
    }

    return {
      noteType,
      key,
      prompt: buildLanePrompt(noteType, laneRecord),
    };
  }

  if (!item.id.startsWith('observed-lane:')) {
    return null;
  }

  const descriptor = parseObservedLaneDescriptor(item.id);
  if (!descriptor) {
    return null;
  }

  const laneRecord = (store.lanePreferencesByNoteType[descriptor.noteType] || []).find((record) => (
    record.outputScope === descriptor.outputScope
    && record.outputStyle === descriptor.outputStyle
    && record.format === descriptor.format
  ));

  if (!laneRecord) {
    return null;
  }

  return {
    noteType: descriptor.noteType,
    key: lanePreferenceKey(laneRecord),
    prompt: buildLanePrompt(descriptor.noteType, laneRecord),
  };
}

export function resolveAcceptedLedgerReopenTarget(
  item: Pick<VeraMemoryLedgerItem, 'id'>,
): AcceptedLedgerReopenTarget | null {
  if (item.id.startsWith('accepted-rewrite:')) {
    const { scope: noteType, key } = parseLedgerRecordKey('accepted-rewrite:', item.id);
    return {
      kind: 'rewrite',
      noteType,
      tone: key as ResolvedRewriteLedgerRecord['tone'],
    };
  }

  if (item.id.startsWith('accepted-lane:')) {
    const { scope: noteType, key } = parseLedgerRecordKey('accepted-lane:', item.id);
    return {
      kind: 'lane',
      noteType,
      key,
    };
  }

  if (item.id.startsWith('accepted-prompt:')) {
    const { scope: noteType, key } = parseLedgerRecordKey('accepted-prompt:', item.id);
    return {
      kind: 'prompt',
      noteType,
      key,
    };
  }

  if (item.id.startsWith('accepted-profile:')) {
    const { scope: profileId, key } = parseLedgerRecordKey('accepted-profile:', item.id);
    return {
      kind: 'profile',
      profileId,
      key,
    };
  }

  return null;
}

export function describeAcceptedLedgerReopenTarget(target: AcceptedLedgerReopenTarget) {
  if (target.kind === 'rewrite') {
    return 'This accepted rewrite preference can be reopened as an active suggestion if you want Atlas to stop treating it as a reviewed preference.';
  }

  if (target.kind === 'lane') {
    return 'This accepted lane setup can be reopened as an active suggestion if you want Atlas to stop treating it as a reviewed preference.';
  }

  if (target.kind === 'prompt') {
    return 'This accepted prompt pattern can be reopened as an active suggestion if you want Atlas to treat it as reviewable again.';
  }

  return 'This accepted provider-level pattern can be reopened as an active suggestion if you want Atlas to treat it as reviewable again.';
}

function buildLanePrompt(
  noteType: string,
  laneRecord: {
    outputScope: string;
    outputStyle: string;
    format: string;
    requestedSections: string[];
  },
) {
  return buildLanePreferencePrompt({
    noteType,
    outputScope: laneRecord.outputScope as OutputScope,
    outputStyle: laneRecord.outputStyle,
    format: laneRecord.format,
    requestedSections: laneRecord.requestedSections as NoteSectionKey[],
  });
}

function lanePreferenceKey(record: {
  outputScope: string;
  outputStyle: string;
  format: string;
  requestedSections: string[];
}) {
  return JSON.stringify({
    outputScope: record.outputScope,
    outputStyle: record.outputStyle,
    format: record.format,
    requestedSections: [...record.requestedSections].sort(),
  });
}
