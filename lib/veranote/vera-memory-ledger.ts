import type { ProviderSettings } from '@/lib/constants/settings';
import type { AssistantLearningStore } from '@/lib/veranote/assistant-learning';
import type { VeraMemoryLedger, VeraMemoryLedgerItem } from '@/types/vera-memory';

function nowIso() {
  return new Date().toISOString();
}

function latestTimestamp(values: Array<string | undefined>) {
  const valid = values
    .map((value) => (value ? new Date(value).getTime() : 0))
    .filter((value) => value > 0)
    .sort((a, b) => b - a);

  return valid[0] ? new Date(valid[0]).toISOString() : undefined;
}

function pushIfValue(items: VeraMemoryLedgerItem[], item: VeraMemoryLedgerItem | null) {
  if (item) {
    items.push(item);
  }
}

function confidenceForObservedCount(count: number): VeraMemoryLedgerItem['confidence'] {
  if (count >= 5) {
    return 'strong';
  }

  if (count >= 3) {
    return 'established';
  }

  return 'emerging';
}

function confidenceForAcceptedCount(count?: number): VeraMemoryLedgerItem['confidence'] {
  if (!count || count < 2) {
    return 'established';
  }

  if (count >= 4) {
    return 'strong';
  }

  return 'established';
}

export function buildVeraMemoryLedger(input: {
  providerId: string;
  settings: ProviderSettings;
  learningStore: AssistantLearningStore;
}) {
  const { providerId, settings, learningStore } = input;
  const items: VeraMemoryLedgerItem[] = [];

  const address = settings.veraPreferredAddress.trim()
    || settings.providerFirstName.trim()
    || settings.providerLastName.trim();

  pushIfValue(items, address ? {
    id: 'relationship-addressing',
    category: 'relationship',
    label: 'Preferred addressing style',
    detail: `Vera should address this provider as ${address}. Preference mode: ${settings.veraAddressPreference}.`,
    source: 'provider-settings',
    status: 'accepted',
    confidence: 'strong',
    originSummary: 'Saved directly in provider relationship settings.',
    reinforcementSummary: 'Reinforced whenever relationship settings are saved for this provider.',
    lastUpdatedAt: nowIso(),
  } : null);

  pushIfValue(items, {
    id: 'relationship-tone',
    category: 'relationship',
    label: 'Interaction style',
    detail: `Vera should use a ${settings.veraInteractionStyle} tone with ${settings.veraProactivityLevel} proactivity.`,
    source: 'provider-settings',
    status: 'accepted',
    confidence: 'strong',
    originSummary: 'Saved directly in provider relationship settings.',
    reinforcementSummary: 'Reinforced whenever interaction style or proactivity is updated for this provider.',
    lastUpdatedAt: nowIso(),
  });

  pushIfValue(items, settings.veraMemoryNotes.trim() ? {
    id: 'relationship-memory-note',
    category: 'relationship',
    label: 'Long-term provider memory note',
    detail: settings.veraMemoryNotes.trim(),
    source: 'provider-settings',
    status: 'accepted',
    confidence: 'strong',
    originSummary: 'Entered directly by the provider as a durable Vera memory note.',
    reinforcementSummary: 'Reinforced whenever the provider updates Vera’s long-term memory note.',
    lastUpdatedAt: nowIso(),
  } : null);

  Object.entries(learningStore.acceptedRewriteSuggestionsByNoteType || {}).forEach(([noteType, tone]) => {
    if (!tone) {
      return;
    }

    items.push({
      id: `accepted-rewrite:${noteType}:${tone}`,
      category: 'accepted-preference',
      label: `${noteType} rewrite preference`,
      detail: `Accepted ${tone.replace(/-/g, ' ')} rewrite style for ${noteType}.`,
      source: 'assistant-learning',
      status: 'accepted',
      confidence: confidenceForAcceptedCount(learningStore.rewritePreferencesByNoteType?.[noteType]?.[tone] || 0),
      originSummary: `Promoted from repeated ${noteType} review rewrite behavior into an accepted provider preference.`,
      reinforcementSummary: `Observed ${learningStore.rewritePreferencesByNoteType?.[noteType]?.[tone] || 0} time${(learningStore.rewritePreferencesByNoteType?.[noteType]?.[tone] || 0) === 1 ? '' : 's'} and explicitly accepted by the provider.`,
      lastUpdatedAt: learningStore.rewriteLastUsedByNoteType?.[noteType]?.[tone] || learningStore.rewriteLastSeenByNoteType?.[noteType]?.[tone],
    });
  });

  Object.entries(learningStore.acceptedLanePreferenceKeysByNoteType || {}).forEach(([noteType, key]) => {
    if (!key) {
      return;
    }

    const record = (learningStore.lanePreferencesByNoteType?.[noteType] || []).find((item) => (
      JSON.stringify({
        outputScope: item.outputScope,
        outputStyle: item.outputStyle,
        format: item.format,
        requestedSections: [...item.requestedSections].sort(),
      }) === key
    ));

    items.push({
      id: `accepted-lane:${noteType}:${key}`,
      category: 'accepted-preference',
      label: `${noteType} lane setup`,
      detail: record
        ? `Accepted lane setup for ${noteType}: ${record.outputScope.replace(/-/g, ' ')}, ${record.outputStyle}, ${record.format}.`
        : `Accepted lane setup for ${noteType}.`,
      source: 'assistant-learning',
      status: 'accepted',
      confidence: confidenceForAcceptedCount(record?.count),
      originSummary: `Promoted from repeated ${noteType} workspace lane setup behavior into an accepted provider preference.`,
      reinforcementSummary: record
        ? `Observed ${record.count} time${record.count === 1 ? '' : 's'} with ${record.outputScope.replace(/-/g, ' ')} scope, ${record.outputStyle} style, and ${record.format} format.`
        : 'Accepted after repeated workspace behavior for this note type.',
      lastUpdatedAt: record?.lastUsedAt || record?.lastSeenAt,
    });
  });

  Object.entries(learningStore.acceptedPromptPreferenceKeysByNoteType || {}).forEach(([noteType, key]) => {
    if (!key) {
      return;
    }

    const record = (learningStore.promptPreferencesByNoteType?.[noteType] || []).find((item) => item.patternKey === key);
    items.push({
      id: `accepted-prompt:${noteType}:${key}`,
      category: 'accepted-preference',
      label: `${noteType} prompt pattern`,
      detail: record ? `Accepted prompt pattern for ${noteType}: ${record.label}.` : `Accepted prompt pattern for ${noteType}.`,
      source: 'assistant-learning',
      status: 'accepted',
      confidence: confidenceForAcceptedCount(record?.count),
      originSummary: `Promoted from repeated ${noteType} prompt-builder behavior into an accepted provider preference.`,
      reinforcementSummary: record
        ? `Observed ${record.count} time${record.count === 1 ? '' : 's'} with the pattern "${record.label}".`
        : 'Accepted after repeated prompt-builder behavior for this note type.',
      lastUpdatedAt: record?.lastUsedAt || record?.lastSeenAt,
    });
  });

  Object.entries(learningStore.acceptedPromptPreferenceKeysByProfileId || {}).forEach(([profileId, key]) => {
    if (!key) {
      return;
    }

    const record = (learningStore.promptPreferencesByProfileId?.[profileId] || []).find((item) => item.patternKey === key);
    items.push({
      id: `accepted-profile:${profileId}:${key}`,
      category: 'accepted-preference',
      label: 'Provider profile pattern',
      detail: record ? `Accepted cross-note profile pattern: ${record.label}.` : 'Accepted cross-note provider pattern.',
      source: 'assistant-learning',
      status: 'accepted',
      confidence: confidenceForAcceptedCount(record?.count),
      originSummary: 'Promoted from repeated cross-note workflow behavior into an accepted provider-level pattern.',
      reinforcementSummary: record
        ? `Observed ${record.count} time${record.count === 1 ? '' : 's'} across ${record.noteTypes.length} note type${record.noteTypes.length === 1 ? '' : 's'}.`
        : 'Accepted after repeated cross-note provider behavior.',
      lastUpdatedAt: record?.lastUsedAt || record?.lastSeenAt,
    });
  });

  Object.entries(learningStore.rewritePreferencesByNoteType || {}).forEach(([noteType, counts]) => {
    (Object.entries(counts) as Array<[string, number]>).forEach(([tone, count]) => {
      if (count < 2) {
        return;
      }

      items.push({
        id: `observed-rewrite:${noteType}:${tone}`,
        category: 'observed-workflow',
        label: `${noteType} rewrite habit`,
        detail: `Vera has observed the ${tone.replace(/-/g, ' ')} rewrite style ${count} times for ${noteType}.`,
        source: 'assistant-learning',
        status: 'observed',
        confidence: confidenceForObservedCount(count),
        originSummary: `Observed from provider review behavior in ${noteType}.`,
        reinforcementSummary: `Reinforced by ${count} rewrite selection${count === 1 ? '' : 's'} for this note type.`,
        lastUpdatedAt: learningStore.rewriteLastUsedByNoteType?.[noteType]?.[tone as 'most-conservative' | 'balanced' | 'closest-to-source']
          || learningStore.rewriteLastSeenByNoteType?.[noteType]?.[tone as 'most-conservative' | 'balanced' | 'closest-to-source'],
      });
    });
  });

  Object.entries(learningStore.lanePreferencesByNoteType || {}).forEach(([noteType, records]) => {
    records.forEach((record) => {
      if (record.count < 2) {
        return;
      }

      items.push({
        id: `observed-lane:${noteType}:${record.outputScope}:${record.outputStyle}:${record.format}`,
        category: 'observed-workflow',
        label: `${noteType} lane repetition`,
        detail: `Vera has observed the same lane setup ${record.count} times for ${noteType}.`,
        source: 'assistant-learning',
        status: 'observed',
        confidence: confidenceForObservedCount(record.count),
        originSummary: `Observed from repeated workspace configuration and finalization behavior in ${noteType}.`,
        reinforcementSummary: `Reinforced by ${record.count} repeat${record.count === 1 ? '' : 's'} using ${record.outputScope.replace(/-/g, ' ')} scope, ${record.outputStyle} style, and ${record.format} format.`,
        lastUpdatedAt: record.lastUsedAt || record.lastSeenAt,
      });
    });
  });

  Object.entries(learningStore.promptPreferencesByNoteType || {}).forEach(([noteType, records]) => {
    records.forEach((record) => {
      if (record.count < 2) {
        return;
      }

      items.push({
        id: `observed-prompt:${noteType}:${record.patternKey}`,
        category: 'observed-workflow',
        label: `${noteType} prompt repetition`,
        detail: `Vera has observed the prompt pattern "${record.label}" ${record.count} times for ${noteType}.`,
        source: 'assistant-learning',
        status: 'observed',
        confidence: confidenceForObservedCount(record.count),
        originSummary: `Observed from repeated prompt-builder usage in ${noteType}.`,
        reinforcementSummary: `Reinforced by ${record.count} repeat${record.count === 1 ? '' : 's'} of the prompt pattern "${record.label}".`,
        lastUpdatedAt: record.lastUsedAt || record.lastSeenAt,
      });
    });
  });

  pushIfValue(items, settings.closerToSourceDefault ? {
    id: 'safety-source-fidelity',
    category: 'safety',
    label: 'Closer-to-source default',
    detail: 'Vera should preserve source fidelity and default to closer-to-source behavior when uncertainty is present.',
    source: 'provider-settings',
    status: 'accepted',
    confidence: 'strong',
    originSummary: 'Saved directly in provider safety/output settings.',
    reinforcementSummary: 'Reinforced whenever closer-to-source default remains enabled for this provider.',
    lastUpdatedAt: nowIso(),
  } : null);

  pushIfValue(items, settings.outputDestination !== 'Generic' ? {
    id: 'safety-destination-constraint',
    category: 'safety',
    label: 'Destination constraint awareness',
    detail: `Vera should respect ${settings.outputDestination} output constraints without changing meaning or certainty.`,
    source: 'provider-settings',
    status: 'accepted',
    confidence: 'strong',
    originSummary: 'Saved directly in provider output settings.',
    reinforcementSummary: `Reinforced whenever ${settings.outputDestination} remains the active output destination.`,
    lastUpdatedAt: nowIso(),
  } : null);

  return {
    providerId,
    generatedAt: nowIso(),
    items: items
      .sort((a, b) => {
        const aTime = a.lastUpdatedAt ? new Date(a.lastUpdatedAt).getTime() : 0;
        const bTime = b.lastUpdatedAt ? new Date(b.lastUpdatedAt).getTime() : 0;
        return bTime - aTime;
      })
      .map((item) => ({
        ...item,
        lastUpdatedAt: item.lastUpdatedAt || latestTimestamp([item.lastUpdatedAt]),
      })),
  } satisfies VeraMemoryLedger;
}
