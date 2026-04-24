'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { DEFAULT_PROVIDER_SETTINGS, type ProviderSettings } from '@/lib/constants/settings';
import { findProviderProfile, providerProfiles } from '@/lib/constants/provider-profiles';
import type { NoteSectionKey, OutputScope } from '@/lib/note/section-profiles';
import { buildLanePreferencePrompt } from '@/lib/veranote/preference-draft';
import { assistantMemoryService } from '@/lib/veranote/assistant-memory-service';
import {
  getOutputDestinationMeta,
  getOutputDestinationOptions,
  getOutputNoteFocusLabel,
  inferOutputNoteFocus,
  OUTPUT_NOTE_FOCUSES,
} from '@/lib/veranote/output-destinations';
import {
  describeAcceptedLedgerReopenTarget,
  resolveAcceptedLedgerReopenTarget,
  resolveLaneLedgerRecord,
  resolveProfileLedgerRecord,
  resolvePromptLedgerRecord,
  resolveRewriteLedgerRecord,
} from '@/lib/veranote/vera-memory-ledger-service';
import type { AssistantLearningStore } from '@/lib/veranote/assistant-learning';
import { getCurrentProviderId, getVeraMemoryAckStorageKey, getProviderSettingsStorageKey, getAssistantPendingActionStorageKey } from '@/lib/veranote/provider-identity';
import { buildVeraIntro, resolveVeraAddress, veraInteractionStyleLabel, veraProactivityLabel } from '@/lib/veranote/vera-relationship';
import type { VeraMemoryCategory, VeraMemoryLedger, VeraMemoryLedgerItem } from '@/types/vera-memory';

function rewriteToneLabel(tone: 'most-conservative' | 'balanced' | 'closest-to-source') {
  if (tone === 'most-conservative') {
    return 'Most conservative';
  }

  if (tone === 'closest-to-source') {
    return 'Closest to source';
  }

  return 'Balanced';
}

function recommendedNextActionText(kind: 'profile' | 'rewrite' | 'lane' | 'prompt') {
  if (kind === 'profile') {
    return 'Recommended next action: open this in the workspace and turn it into a broader provider-level preference draft.';
  }

  if (kind === 'rewrite') {
    return 'Recommended next action: open review and decide whether this rewrite style should remain a review habit or become an intentional preference.';
  }

  if (kind === 'lane') {
    return 'Recommended next action: open the workspace and decide whether this repeated lane setup should become a reusable note-lane preference.';
  }

  return 'Recommended next action: open the workspace and decide whether this prompt-builder pattern should become a reusable preference block.';
}

function formatMemoryTimestamp(value?: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatMemoryRecency(value?: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 60) {
    return diffMinutes <= 1 ? 'just now' : `${diffMinutes} minutes ago`;
  }

  if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }

  if (diffDays === 1) {
    return 'yesterday';
  }

  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }

  if (diffDays < 14) {
    return 'last week';
  }

  if (diffDays < 30) {
    return `${Math.floor(diffDays / 7)} weeks ago`;
  }

  return 'a while ago';
}

function memoryTimestampLine(label: 'Last seen' | 'Last used', value?: string) {
  const recency = formatMemoryRecency(value);
  const exact = formatMemoryTimestamp(value);

  if (!recency && !exact) {
    return `${label}: not available yet`;
  }

  if (recency && exact) {
    return `${label}: ${recency} • ${exact}`;
  }

  return `${label}: ${recency || exact}`;
}

function isRecentTimestamp(value?: string, hours = 24) {
  if (!value) {
    return false;
  }

  const parsed = new Date(value).getTime();

  if (Number.isNaN(parsed)) {
    return false;
  }

  return Date.now() - parsed <= hours * 60 * 60 * 1000;
}

function memoryPriorityLabel(input: {
  lastUsedAt?: string;
  lastSeenAt?: string;
}) {
  if (isRecentTimestamp(input.lastUsedAt, 24)) {
    return 'Recently used';
  }

  if (isRecentTimestamp(input.lastSeenAt, 24)) {
    return 'Current pattern';
  }

  if (isRecentTimestamp(input.lastUsedAt, 24 * 7)) {
    return 'Still active';
  }

  return null;
}

function recentMemoryKindLabel(kind: RecentMemoryItem['kind']) {
  if (kind === 'rewrite') {
    return 'Review habit';
  }

  if (kind === 'lane') {
    return 'Lane preference';
  }

  if (kind === 'prompt') {
    return 'Prompt pattern';
  }

  return 'Profile pattern';
}

function veraMemoryCategoryLabel(category: VeraMemoryCategory | 'all') {
  if (category === 'relationship') {
    return 'Relationship';
  }

  if (category === 'accepted-preference') {
    return 'Accepted';
  }

  if (category === 'observed-workflow') {
    return 'Observed';
  }

  if (category === 'safety') {
    return 'Safety';
  }

  return 'All memory';
}

function veraMemoryStatusLabel(status: VeraMemoryLedgerItem['status']) {
  if (status === 'accepted') {
    return 'Accepted';
  }

  if (status === 'observed') {
    return 'Observed';
  }

  return 'Active';
}

function veraMemorySourceLabel(source: VeraMemoryLedgerItem['source']) {
  if (source === 'provider-settings') {
    return 'Provider settings';
  }

  return 'Assistant learning';
}

function veraMemoryConfidenceLabel(confidence: VeraMemoryLedgerItem['confidence']) {
  if (confidence === 'strong') {
    return 'Strong';
  }

  if (confidence === 'established') {
    return 'Established';
  }

  return 'Emerging';
}

type RecentMemoryItem = {
  id: string;
  label: string;
  kind: 'profile' | 'rewrite' | 'lane' | 'prompt';
  noteType?: string;
  lastSeenAt?: string;
  lastUsedAt?: string;
  seedPrompt?: string;
  promptKey?: string;
  laneKey?: string;
  rewriteTone?: 'most-conservative' | 'balanced' | 'closest-to-source';
  laneConfig?: {
    outputScope: OutputScope;
    outputStyle: string;
    format: string;
    requestedSections: NoteSectionKey[];
  };
};

type RecentMemoryActivityItem = RecentMemoryItem & {
  activityKind: 'used' | 'seen';
  activityTime: number;
};

type LedgerItemActions = {
  primaryLabel: string;
  onPrimary: () => void;
  onAccept?: () => void;
  onDismiss?: () => void;
};

function latestMemoryActivity(items: RecentMemoryItem[]): RecentMemoryActivityItem[] {
  return [...items]
    .map((item) => {
      const usedTime = item.lastUsedAt ? new Date(item.lastUsedAt).getTime() : 0;
      const seenTime = item.lastSeenAt ? new Date(item.lastSeenAt).getTime() : 0;
      const activityTime = Math.max(
        Number.isNaN(usedTime) ? 0 : usedTime,
        Number.isNaN(seenTime) ? 0 : seenTime,
      );

      return {
        ...item,
        activityKind: (usedTime >= seenTime && usedTime > 0 ? 'used' : 'seen') as 'used' | 'seen',
        activityTime,
      };
    })
    .filter((item) => item.activityTime > 0)
    .sort((a, b) => b.activityTime - a.activityTime)
    .slice(0, 4);
}

function recentMemoryChangeLabel(item: RecentMemoryActivityItem) {
  if (item.activityKind === 'used') {
    return 'Used again';
  }

  if (isRecentTimestamp(item.lastSeenAt, 6)) {
    return 'New signal';
  }

  return 'Reinforced pattern';
}

function recentMemoryChangeDetail(item: RecentMemoryActivityItem) {
  if (item.kind === 'rewrite') {
    return item.activityKind === 'used'
      ? 'You revisited this review habit recently.'
      : 'Vera saw this rewrite style show up again in review behavior.';
  }

  if (item.kind === 'lane') {
    return item.activityKind === 'used'
      ? 'You reopened this lane setup to work from it again.'
      : 'Vera noticed this output lane pattern repeating again.';
  }

  if (item.kind === 'prompt') {
    return item.activityKind === 'used'
      ? 'You reused this prompt pattern again in the workspace.'
      : 'Vera noticed this prompt-builder pattern repeating again.';
  }

  return item.activityKind === 'used'
    ? 'You reopened this provider-level pattern to work from it again.'
    : 'Vera noticed this provider-level preference pattern surfacing again.';
}

function readAcknowledgedMemoryTokens(providerId?: string) {
  if (typeof window === 'undefined') {
    return [] as string[];
  }

  try {
    const raw = window.localStorage.getItem(getVeraMemoryAckStorageKey(providerId || getCurrentProviderId()));

    if (!raw) {
      return [] as string[];
    }

    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as string[];
  }
}

function writeAcknowledgedMemoryTokens(tokens: string[], providerId?: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(getVeraMemoryAckStorageKey(providerId || getCurrentProviderId()), JSON.stringify(tokens));
}

function recentMemoryAckToken(item: RecentMemoryActivityItem) {
  return `${item.id}:${item.activityTime}`;
}

function pruneAcknowledgedMemoryTokens(tokens: string[], items: RecentMemoryActivityItem[]) {
  const validTokens = new Set(items.map((item) => recentMemoryAckToken(item)));
  return tokens.filter((token) => validTokens.has(token));
}

export function ProviderSettingsPanel() {
  const router = useRouter();
  const { data: session } = useSession();
  const [settings, setSettings] = useState<ProviderSettings>(DEFAULT_PROVIDER_SETTINGS);
  const [message, setMessage] = useState('');
  const [outputProfileName, setOutputProfileName] = useState('');
  const [outputProfileSiteLabel, setOutputProfileSiteLabel] = useState('');
  const [editingOutputProfileId, setEditingOutputProfileId] = useState<string | null>(null);
  const resolvedProviderIdentityId = session?.user?.providerIdentityId || getCurrentProviderId();
  const activeProfile = findProviderProfile(settings.providerProfileId);
  const veraAddress = resolveVeraAddress(settings, activeProfile?.name);
  const [workflowInsights, setWorkflowInsights] = useState<ReturnType<typeof assistantMemoryService.getWorkflowInsights>>({
    profilePromptSuggestion: null,
    noteTypeInsights: [],
  });
  const [assistantLearningStore, setAssistantLearningStore] = useState<AssistantLearningStore>(assistantMemoryService.createEmptyLearningStore());
  const [veraMemoryLedger, setVeraMemoryLedger] = useState<VeraMemoryLedger | null>(null);
  const [isVeraMemoryOpen, setIsVeraMemoryOpen] = useState(false);
  const [ledgerCategoryFilter, setLedgerCategoryFilter] = useState<'all' | VeraMemoryCategory>('all');
  const [expandedLedgerDetailsId, setExpandedLedgerDetailsId] = useState<string | null>(null);
  const [expandedLedgerEditorId, setExpandedLedgerEditorId] = useState<string | null>(null);
  const [acknowledgedMemoryTokens, setAcknowledgedMemoryTokens] = useState<string[]>([]);
  const recentMemoryActivity = latestMemoryActivity([
    ...(workflowInsights.profilePromptSuggestion ? [{
      id: `profile:${workflowInsights.profilePromptSuggestion.key}`,
      label: workflowInsights.profilePromptSuggestion.label,
      kind: 'profile' as const,
      lastSeenAt: workflowInsights.profilePromptSuggestion.lastSeenAt,
      lastUsedAt: workflowInsights.profilePromptSuggestion.lastUsedAt,
      seedPrompt: workflowInsights.profilePromptSuggestion.seedPrompt,
      promptKey: workflowInsights.profilePromptSuggestion.key,
    }] : []),
    ...workflowInsights.noteTypeInsights.flatMap((insight) => ([
      ...(insight.rewriteSuggestion ? [{
        id: `rewrite:${insight.noteType}:${insight.rewriteSuggestion.optionTone}`,
        label: `${insight.noteType}: ${rewriteToneLabel(insight.rewriteSuggestion.optionTone)} rewrite style`,
        kind: 'rewrite' as const,
        noteType: insight.noteType,
        lastSeenAt: insight.rewriteSuggestion.lastSeenAt,
        lastUsedAt: insight.rewriteSuggestion.lastUsedAt,
        rewriteTone: insight.rewriteSuggestion.optionTone,
      }] : []),
      ...(insight.laneSuggestion ? [{
        id: `lane:${insight.noteType}:${insight.laneSuggestion.key}`,
        label: `${insight.noteType}: repeated lane setup`,
        kind: 'lane' as const,
        noteType: insight.noteType,
        lastSeenAt: insight.laneSuggestion.lastSeenAt,
        lastUsedAt: insight.laneSuggestion.lastUsedAt,
        laneKey: insight.laneSuggestion.key,
        laneConfig: {
          outputScope: insight.laneSuggestion.outputScope as OutputScope,
          outputStyle: insight.laneSuggestion.outputStyle,
          format: insight.laneSuggestion.format,
          requestedSections: insight.laneSuggestion.requestedSections as NoteSectionKey[],
        },
      }] : []),
      ...(insight.promptSuggestion ? [{
        id: `prompt:${insight.noteType}:${insight.promptSuggestion.key}`,
        label: `${insight.noteType}: ${insight.promptSuggestion.label}`,
        kind: 'prompt' as const,
        noteType: insight.noteType,
        lastSeenAt: insight.promptSuggestion.lastSeenAt,
        lastUsedAt: insight.promptSuggestion.lastUsedAt,
        seedPrompt: insight.promptSuggestion.seedPrompt,
        promptKey: insight.promptSuggestion.key,
      }] : []),
    ])),
  ]);
  const visibleRecentMemoryActivity = recentMemoryActivity.filter((item) => !acknowledgedMemoryTokens.includes(recentMemoryAckToken(item)));
  const featuredRecentMemoryItem = visibleRecentMemoryActivity[0] || null;
  const filteredLedgerItems = useMemo(() => {
    if (!veraMemoryLedger) {
      return [] as VeraMemoryLedgerItem[];
    }

    return veraMemoryLedger.items.filter((item) => (
      ledgerCategoryFilter === 'all' || item.category === ledgerCategoryFilter
    ));
  }, [ledgerCategoryFilter, veraMemoryLedger]);

  function refreshWorkflowInsights(nextSettings = settings) {
    const nextProfile = findProviderProfile(nextSettings.providerProfileId);
    setWorkflowInsights(assistantMemoryService.getWorkflowInsights({
      profileId: nextSettings.providerProfileId,
      noteTypes: nextProfile?.defaults.noteTypePriority || [],
    }, resolvedProviderIdentityId));
  }

  useEffect(() => {
    async function hydrateSettings() {
      const storageKey = getProviderSettingsStorageKey(resolvedProviderIdentityId);
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as ProviderSettings;
          setSettings({ ...DEFAULT_PROVIDER_SETTINGS, ...parsed });
          return;
        } catch {
          localStorage.removeItem(storageKey);
        }
      }

      try {
        const response = await fetch(`/api/settings/provider?providerId=${encodeURIComponent(resolvedProviderIdentityId)}`, { cache: 'no-store' });
        const data = (await response.json()) as { settings?: ProviderSettings };
        const merged = { ...DEFAULT_PROVIDER_SETTINGS, ...(data?.settings || {}) };
        setSettings(merged);
        localStorage.setItem(storageKey, JSON.stringify(merged));
      } catch {
        // Leave default settings in place if backend persistence is unavailable.
      }
    }

    void hydrateSettings();
  }, [resolvedProviderIdentityId]);

  useEffect(() => {
    refreshWorkflowInsights();
  }, [activeProfile, resolvedProviderIdentityId, settings.providerProfileId]);

  useEffect(() => {
    let isMounted = true;

    async function hydrateLearning() {
      try {
        const bundle = await assistantMemoryService.hydrateMemoryBundle(resolvedProviderIdentityId);
        if (isMounted) {
          setAssistantLearningStore(bundle.learningStore);
          setVeraMemoryLedger(bundle.veraMemoryLedger);
          refreshWorkflowInsights();
        }
      } catch {
        // Keep local provider-scoped Vera memory available if server hydration fails.
      }
    }

    void hydrateLearning();

    return () => {
      isMounted = false;
    };
  }, [resolvedProviderIdentityId, settings.providerProfileId]);

  useEffect(() => {
    setAcknowledgedMemoryTokens(readAcknowledgedMemoryTokens(resolvedProviderIdentityId));
  }, [resolvedProviderIdentityId]);

  useEffect(() => {
    const pruned = pruneAcknowledgedMemoryTokens(acknowledgedMemoryTokens, recentMemoryActivity);

    if (pruned.length !== acknowledgedMemoryTokens.length) {
      setAcknowledgedMemoryTokens(pruned);
      writeAcknowledgedMemoryTokens(pruned, resolvedProviderIdentityId);
    }
  }, [acknowledgedMemoryTokens, recentMemoryActivity, resolvedProviderIdentityId]);

  function updateSetting<K extends keyof ProviderSettings>(key: K, value: ProviderSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function applyOutputProfile(profileId: string) {
    setSettings((current) => {
      const profile = current.outputProfiles.find((item) => item.id === profileId);
      if (!profile) {
        return current;
      }

      return {
        ...current,
        outputDestination: profile.destination,
        outputNoteFocus: profile.noteFocus,
        asciiSafe: profile.asciiSafe,
        paragraphOnly: profile.paragraphOnly,
        wellskyFriendly: profile.wellskyFriendly,
        activeOutputProfileId: profile.id,
      };
    });
    setMessage('Applied saved site/EHR output preset.');
    window.setTimeout(() => setMessage(''), 2200);
  }

  function resetOutputProfileEditor() {
    setOutputProfileName('');
    setOutputProfileSiteLabel('');
    setEditingOutputProfileId(null);
  }

  function handleSaveOutputProfile() {
    const trimmedName = outputProfileName.trim();
    const trimmedSiteLabel = outputProfileSiteLabel.trim();

    if (!trimmedName || !trimmedSiteLabel) {
      setMessage('Add both a preset name and a site label before saving this output preset.');
      window.setTimeout(() => setMessage(''), 2400);
      return;
    }

    setSettings((current) => {
      const nextProfile = {
        id: editingOutputProfileId || `output-profile-${Date.now()}`,
        name: trimmedName,
        siteLabel: trimmedSiteLabel,
        destination: current.outputDestination,
        noteFocus: current.outputNoteFocus || inferOutputNoteFocus(trimmedName),
        asciiSafe: current.asciiSafe,
        paragraphOnly: current.paragraphOnly,
        wellskyFriendly: current.wellskyFriendly,
      };

      const nextProfiles = editingOutputProfileId
        ? current.outputProfiles.map((profile) => profile.id === editingOutputProfileId ? nextProfile : profile)
        : [nextProfile, ...current.outputProfiles.filter((profile) => profile.id !== nextProfile.id)];

      return {
        ...current,
        outputProfiles: nextProfiles,
        activeOutputProfileId: nextProfile.id,
      };
    });

    resetOutputProfileEditor();
    setMessage(editingOutputProfileId ? 'Updated saved site/EHR output preset.' : 'Saved current settings as a reusable site/EHR output preset.');
    window.setTimeout(() => setMessage(''), 2400);
  }

  function handleEditOutputProfile(profileId: string) {
    const profile = settings.outputProfiles.find((item) => item.id === profileId);
    if (!profile) {
      return;
    }

    setOutputProfileName(profile.name);
    setOutputProfileSiteLabel(profile.siteLabel);
    setEditingOutputProfileId(profile.id);
  }

  function handleDeleteOutputProfile(profileId: string) {
    setSettings((current) => ({
      ...current,
      outputProfiles: current.outputProfiles.filter((profile) => profile.id !== profileId),
      activeOutputProfileId: current.activeOutputProfileId === profileId ? '' : current.activeOutputProfileId,
    }));
    if (editingOutputProfileId === profileId) {
      resetOutputProfileEditor();
    }
    setMessage('Removed saved site/EHR output preset.');
    window.setTimeout(() => setMessage(''), 2200);
  }

  function scheduleMemorySync() {
    window.setTimeout(() => {
      void assistantMemoryService.hydrateMemoryBundle(resolvedProviderIdentityId).then((bundle) => {
        setAssistantLearningStore(bundle.learningStore);
        setVeraMemoryLedger(bundle.veraMemoryLedger);
        refreshWorkflowInsights();
      }).catch(() => {
        refreshWorkflowInsights();
      });
    }, 160);
  }

  function handleProfileChange(profileId: string) {
    if (!profileId) {
      setSettings((current) => ({
        ...current,
        providerProfileId: '',
      }));
      return;
    }

    const profile = findProviderProfile(profileId);
    if (!profile) {
      return;
    }

    setSettings((current) => ({
      ...current,
      ...profile.defaults.providerSettings,
      providerFirstName: current.providerFirstName,
      providerLastName: current.providerLastName,
      veraPreferredAddress: current.veraPreferredAddress,
      veraAddressPreference: current.veraAddressPreference,
      veraInteractionStyle: current.veraInteractionStyle,
      veraProactivityLevel: current.veraProactivityLevel,
      veraMemoryNotes: current.veraMemoryNotes,
      providerProfileId: profile.id,
    }));
    setMessage(`Applied ${profile.name} defaults. You can still tweak individual settings before saving.`);
    window.setTimeout(() => setMessage(''), 2600);
  }

  async function handleSave() {
    const storageKey = getProviderSettingsStorageKey(resolvedProviderIdentityId);
    localStorage.setItem(storageKey, JSON.stringify(settings));

    try {
      await fetch('/api/settings/provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, providerId: resolvedProviderIdentityId }),
      });
      setMessage('Settings saved locally and in the prototype backend store.');
    } catch {
      setMessage('Settings saved locally. Backend save was unavailable.');
    }

    try {
      const bundle = await assistantMemoryService.hydrateMemoryBundle(resolvedProviderIdentityId);
      setAssistantLearningStore(bundle.learningStore);
      setVeraMemoryLedger(bundle.veraMemoryLedger);
      refreshWorkflowInsights();
    } catch {
      // Keep the current settings available even if the ledger refresh fails.
    }

    window.setTimeout(() => setMessage(''), 2200);
  }

  function handleReset() {
    setSettings(DEFAULT_PROVIDER_SETTINGS);
    resetOutputProfileEditor();
    localStorage.removeItem(getProviderSettingsStorageKey(resolvedProviderIdentityId));
    setMessage('');
  }

  function openWorkspaceWithPreference(instructions: string, onUsed?: () => void) {
    onUsed?.();
    localStorage.setItem(getAssistantPendingActionStorageKey(resolvedProviderIdentityId), JSON.stringify({
      type: 'append-preferences',
      instructions,
    }));
    setIsVeraMemoryOpen(false);
    router.push('/#workspace');
  }

  function openReviewForRewriteStyle(onUsed?: () => void) {
    onUsed?.();
    setIsVeraMemoryOpen(false);
    router.push('/dashboard/review');
  }

  function handleRecentMemoryAction(item: RecentMemoryItem) {
    if (item.kind === 'rewrite' && item.noteType && item.rewriteTone) {
      const noteType = item.noteType;
      const rewriteTone = item.rewriteTone;
      openReviewForRewriteStyle(() => {
        assistantMemoryService.markRewriteUsed(noteType, rewriteTone, resolvedProviderIdentityId);
        refreshWorkflowInsights();
      });
      return;
    }

    if (item.kind === 'profile' && item.seedPrompt && item.promptKey && settings.providerProfileId) {
      const seedPrompt = item.seedPrompt;
      const promptKey = item.promptKey;
      const profileId = settings.providerProfileId;
      openWorkspaceWithPreference(item.seedPrompt, () => {
        assistantMemoryService.markProfilePromptUsed(profileId, promptKey, resolvedProviderIdentityId);
        refreshWorkflowInsights();
      });
      return;
    }

    if (item.kind === 'prompt' && item.noteType && item.seedPrompt && item.promptKey) {
      const noteType = item.noteType;
      const seedPrompt = item.seedPrompt;
      const promptKey = item.promptKey;
      openWorkspaceWithPreference(item.seedPrompt, () => {
        assistantMemoryService.markPromptUsed(noteType, promptKey, resolvedProviderIdentityId);
        refreshWorkflowInsights();
      });
      return;
    }

    if (item.kind === 'lane' && item.noteType && item.laneKey && item.laneConfig) {
      const noteType = item.noteType;
      const laneKey = item.laneKey;
      const laneConfig = item.laneConfig;
      openWorkspaceWithPreference(
        buildLanePreferencePrompt({
          noteType,
          outputScope: laneConfig.outputScope,
          outputStyle: laneConfig.outputStyle,
          format: laneConfig.format,
          requestedSections: laneConfig.requestedSections,
        }),
        () => {
          assistantMemoryService.markLaneUsed(noteType, laneKey, resolvedProviderIdentityId);
          refreshWorkflowInsights();
        },
      );
    }
  }

  function acknowledgeRecentMemory(item: RecentMemoryActivityItem) {
    const token = recentMemoryAckToken(item);
    const nextTokens = Array.from(new Set([...acknowledgedMemoryTokens, token]));
    setAcknowledgedMemoryTokens(nextTokens);
    writeAcknowledgedMemoryTokens(nextTokens, resolvedProviderIdentityId);
  }

  function clearAcknowledgedMemory() {
    setAcknowledgedMemoryTokens([]);
    writeAcknowledgedMemoryTokens([], resolvedProviderIdentityId);
  }

  function openSettingsSection(sectionId: string) {
    setIsVeraMemoryOpen(false);
    window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  function ledgerPromptActions(item: VeraMemoryLedgerItem): LedgerItemActions | null {
    const promptRecord = resolvePromptLedgerRecord(assistantLearningStore, item);
    if (!promptRecord) {
      return null;
    }

    return {
      primaryLabel: 'Open in workspace',
      onPrimary: () => openWorkspaceWithPreference(promptRecord.seedPrompt, () => {
        assistantMemoryService.markPromptUsed(promptRecord.noteType, promptRecord.key, resolvedProviderIdentityId);
        scheduleMemorySync();
      }),
      onAccept: item.category === 'observed-workflow'
        ? () => {
            assistantMemoryService.acceptPromptSuggestion(promptRecord.noteType, promptRecord.key, resolvedProviderIdentityId);
            scheduleMemorySync();
          }
        : undefined,
      onDismiss: item.category === 'observed-workflow'
        ? () => {
            assistantMemoryService.dismissPromptSuggestion(promptRecord.noteType, promptRecord.key, resolvedProviderIdentityId);
            scheduleMemorySync();
          }
        : undefined,
    };
  }

  function ledgerProfileActions(item: VeraMemoryLedgerItem): LedgerItemActions | null {
    if (!settings.providerProfileId) {
      return null;
    }

    const profileRecord = resolveProfileLedgerRecord(assistantLearningStore, item);
    if (!profileRecord) {
      return null;
    }

    return {
      primaryLabel: 'Open in workspace',
      onPrimary: () => openWorkspaceWithPreference(profileRecord.seedPrompt, () => {
        assistantMemoryService.markProfilePromptUsed(profileRecord.profileId, profileRecord.key, resolvedProviderIdentityId);
        scheduleMemorySync();
      }),
      onAccept: item.category === 'observed-workflow'
        ? () => {
            assistantMemoryService.acceptProfilePromptSuggestion(profileRecord.profileId, profileRecord.key, resolvedProviderIdentityId);
            scheduleMemorySync();
          }
        : undefined,
      onDismiss: item.category === 'observed-workflow'
        ? () => {
            assistantMemoryService.dismissProfilePromptSuggestion(profileRecord.profileId, profileRecord.key, resolvedProviderIdentityId);
            scheduleMemorySync();
          }
        : undefined,
    };
  }

  function ledgerRewriteActions(item: VeraMemoryLedgerItem): LedgerItemActions | null {
    const rewriteRecord = resolveRewriteLedgerRecord(item);
    if (!rewriteRecord) {
      return null;
    }

    return {
      primaryLabel: 'Open in review',
      onPrimary: () => openReviewForRewriteStyle(() => {
        assistantMemoryService.markRewriteUsed(rewriteRecord.noteType, rewriteRecord.tone, resolvedProviderIdentityId);
        scheduleMemorySync();
      }),
      onAccept: item.category === 'observed-workflow'
        ? () => {
            assistantMemoryService.acceptRewriteSuggestion(rewriteRecord.noteType, rewriteRecord.tone, resolvedProviderIdentityId);
            scheduleMemorySync();
          }
        : undefined,
      onDismiss: item.category === 'observed-workflow'
        ? () => {
            assistantMemoryService.dismissRewriteSuggestion(rewriteRecord.noteType, rewriteRecord.tone, resolvedProviderIdentityId);
            scheduleMemorySync();
          }
        : undefined,
    };
  }

  function ledgerLaneActions(item: VeraMemoryLedgerItem): LedgerItemActions | null {
    const laneRecord = resolveLaneLedgerRecord(assistantLearningStore, item);
    if (!laneRecord) {
      return null;
    }

    return {
      primaryLabel: 'Open in workspace',
      onPrimary: () => openWorkspaceWithPreference(
        laneRecord.prompt,
        () => {
          assistantMemoryService.markLaneUsed(laneRecord.noteType, laneRecord.key, resolvedProviderIdentityId);
          scheduleMemorySync();
        },
      ),
      onAccept: item.category === 'observed-workflow' ? () => {
        assistantMemoryService.acceptLaneSuggestion(laneRecord.noteType, laneRecord.key, resolvedProviderIdentityId);
        scheduleMemorySync();
      } : undefined,
      onDismiss: item.category === 'observed-workflow' ? () => {
        assistantMemoryService.dismissLaneSuggestion(laneRecord.noteType, laneRecord.key, resolvedProviderIdentityId);
        scheduleMemorySync();
      } : undefined,
    };
  }

  function ledgerItemActions(item: VeraMemoryLedgerItem): LedgerItemActions {
    if (item.category === 'relationship') {
      return {
        primaryLabel: 'Edit relationship settings',
        onPrimary: () => openSettingsSection('vera-relationship-settings'),
      };
    }

    if (item.category === 'safety') {
      return {
        primaryLabel: 'Edit output rules',
        onPrimary: () => openSettingsSection('provider-output-rules'),
      };
    }

    return (
      ledgerRewriteActions(item)
      || ledgerLaneActions(item)
      || ledgerPromptActions(item)
      || ledgerProfileActions(item)
      || {
        primaryLabel: 'Review in settings',
        onPrimary: () => setIsVeraMemoryOpen(true),
      }
    );
  }

  function renderLedgerInlineEditor(item: VeraMemoryLedgerItem) {
    if (item.id === 'relationship-addressing') {
      return (
        <div className="mt-4 rounded-[14px] border border-violet-200 bg-violet-50/70 p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-2 text-xs font-medium text-violet-900">
              <span>Address preference</span>
              <select
                value={settings.veraAddressPreference}
                onChange={(event) => updateSetting('veraAddressPreference', event.target.value as ProviderSettings['veraAddressPreference'])}
                className="rounded-xl border border-violet-200 bg-white p-3 text-sm"
              >
                <option value="provider-profile">Use provider profile name</option>
                <option value="first-name">Use my first name</option>
                <option value="title-last-name">Use Dr. LastName</option>
                <option value="preferred-address">Use my preferred address</option>
              </select>
            </label>
            <label className="grid gap-2 text-xs font-medium text-violet-900">
              <span>Preferred address override</span>
              <input
                value={settings.veraPreferredAddress}
                onChange={(event) => updateSetting('veraPreferredAddress', event.target.value)}
                placeholder="Example: Dr. Folarin"
                className="rounded-xl border border-violet-200 bg-white p-3 text-sm"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void handleSave()} className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium">
              Save relationship memory
            </button>
            <button type="button" onClick={() => setExpandedLedgerEditorId(null)} className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium">
              Done
            </button>
          </div>
        </div>
      );
    }

    if (item.id === 'relationship-tone') {
      return (
        <div className="mt-4 rounded-[14px] border border-violet-200 bg-violet-50/70 p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-2 text-xs font-medium text-violet-900">
              <span>Interaction style</span>
              <select
                value={settings.veraInteractionStyle}
                onChange={(event) => updateSetting('veraInteractionStyle', event.target.value as ProviderSettings['veraInteractionStyle'])}
                className="rounded-xl border border-violet-200 bg-white p-3 text-sm"
              >
                <option value="warm-professional">Warm professional</option>
                <option value="formal">Formal</option>
                <option value="friendly">Friendly</option>
              </select>
            </label>
            <label className="grid gap-2 text-xs font-medium text-violet-900">
              <span>Proactivity level</span>
              <select
                value={settings.veraProactivityLevel}
                onChange={(event) => updateSetting('veraProactivityLevel', event.target.value as ProviderSettings['veraProactivityLevel'])}
                className="rounded-xl border border-violet-200 bg-white p-3 text-sm"
              >
                <option value="light">Light-touch</option>
                <option value="balanced">Balanced</option>
                <option value="anticipatory">Anticipatory</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void handleSave()} className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium">
              Save relationship memory
            </button>
            <button type="button" onClick={() => setExpandedLedgerEditorId(null)} className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium">
              Done
            </button>
          </div>
        </div>
      );
    }

    if (item.id === 'relationship-memory-note') {
      return (
        <div className="mt-4 rounded-[14px] border border-violet-200 bg-violet-50/70 p-3">
          <label className="grid gap-2 text-xs font-medium text-violet-900">
            <span>Long-term Vera memory note</span>
            <textarea
              value={settings.veraMemoryNotes}
              onChange={(event) => updateSetting('veraMemoryNotes', event.target.value)}
              rows={4}
              className="rounded-xl border border-violet-200 bg-white p-3 text-sm"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void handleSave()} className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium">
              Save relationship memory
            </button>
            <button type="button" onClick={() => setExpandedLedgerEditorId(null)} className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium">
              Done
            </button>
          </div>
        </div>
      );
    }

    if (item.id === 'safety-source-fidelity') {
      return (
        <div className="mt-4 rounded-[14px] border border-violet-200 bg-violet-50/70 p-3">
          <label className="flex items-start gap-3 text-sm text-violet-900">
            <input
              type="checkbox"
              checked={settings.closerToSourceDefault}
              onChange={(event) => updateSetting('closerToSourceDefault', event.target.checked)}
            />
            Keep Vera closer to source by default when uncertainty is present.
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void handleSave()} className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium">
              Save safety memory
            </button>
            <button type="button" onClick={() => setExpandedLedgerEditorId(null)} className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium">
              Done
            </button>
          </div>
        </div>
      );
    }

    if (item.id === 'safety-destination-constraint') {
      return (
        <div className="mt-4 rounded-[14px] border border-violet-200 bg-violet-50/70 p-3">
          <label className="grid gap-2 text-xs font-medium text-violet-900">
            <span>Output destination</span>
            <select
              value={settings.outputDestination}
              onChange={(event) => updateSetting('outputDestination', event.target.value as ProviderSettings['outputDestination'])}
              className="rounded-xl border border-violet-200 bg-white p-3 text-sm"
            >
              {getOutputDestinationOptions().map((destination) => (
                <option key={destination.label} value={destination.label}>{destination.label}</option>
              ))}
            </select>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void handleSave()} className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium">
              Save safety memory
            </button>
            <button type="button" onClick={() => setExpandedLedgerEditorId(null)} className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium">
              Done
            </button>
          </div>
        </div>
      );
    }

    const acceptedTarget = resolveAcceptedLedgerReopenTarget(item);
    if (acceptedTarget) {
      return (
        <div className="mt-4 rounded-[14px] border border-violet-200 bg-violet-50/70 p-3 text-sm text-violet-900">
          <div>{describeAcceptedLedgerReopenTarget(acceptedTarget)}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                assistantMemoryService.reopenAcceptedLedgerSuggestion(item.id, resolvedProviderIdentityId);
                scheduleMemorySync();
                setExpandedLedgerEditorId(null);
              }}
              className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium"
            >
              Reopen as active suggestion
            </button>
            <button type="button" onClick={() => setExpandedLedgerEditorId(null)} className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium">
              Done
            </button>
          </div>
        </div>
      );
    }

    return null;
  }

  return (
    <div className="aurora-panel rounded-[28px] p-6">
      <h2 className="text-lg font-semibold">Provider / Output Settings</h2>
      <p className="mt-1 text-sm text-muted">Start shaping output to provider and EHR preferences. These settings can now persist in the lightweight backend prototype store as well as locally.</p>

      <div className="aurora-soft-panel mt-5 grid gap-4 rounded-[22px] border border-violet-200 p-4">
        <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
          <label className="grid gap-2 text-sm font-medium">
            <span>Provider profile</span>
            <select value={settings.providerProfileId} onChange={(event) => handleProfileChange(event.target.value)} className="rounded-xl border border-violet-200 bg-white p-3">
              <option value="">No profile selected</option>
              {providerProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.name}</option>
              ))}
            </select>
          </label>

          <div className="aurora-soft-panel rounded-[18px] border border-violet-200 p-4 text-sm text-violet-900">
            {activeProfile ? (
              <>
                <div className="font-semibold text-violet-950">{activeProfile.name}</div>
                <p className="mt-1">{activeProfile.description}</p>
                <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-violet-800">Preferred output style</div>
                <div className="mt-1 text-sm">{activeProfile.defaults.preferredOutputStyle}</div>
              </>
            ) : (
              <>
                <div className="font-semibold text-violet-950">Profile defaults are optional</div>
                <p className="mt-1">Choose one when you want Veranote to start from a workflow-aware set of output defaults instead of one generic setup.</p>
              </>
            )}
          </div>
        </div>

        {activeProfile ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="aurora-soft-panel rounded-[18px] border border-violet-200 p-4 text-sm text-violet-900">
              <div className="font-semibold text-violet-950">Note-type priority</div>
              <ul className="mt-2 space-y-1">
                {activeProfile.defaults.noteTypePriority.map((noteType) => (
                  <li key={noteType}>{noteType}</li>
                ))}
              </ul>
            </div>
            <div className="aurora-soft-panel rounded-[18px] border border-violet-200 p-4 text-sm text-violet-900">
              <div className="font-semibold text-violet-950">Workflow starters</div>
              <ul className="mt-2 space-y-1">
                {activeProfile.workflowFocus.map((focus) => (
                  <li key={focus}>{focus}</li>
                ))}
              </ul>
            </div>
            <div className="aurora-soft-panel rounded-[18px] border border-violet-200 p-4 text-sm text-violet-900">
              <div className="font-semibold text-violet-950">Review emphasis</div>
              <ul className="mt-2 space-y-1">
                {activeProfile.reviewEmphasis.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <div className="text-xs text-violet-900">
          Selecting a provider profile applies its output defaults into the current settings below. You can still override individual settings before saving.
        </div>
      </div>

      <div id="provider-output-rules" className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          <span>Output destination</span>
          <select value={settings.outputDestination} onChange={(event) => updateSetting('outputDestination', event.target.value as ProviderSettings['outputDestination'])} className="rounded-xl border border-border bg-white p-3">
            {getOutputDestinationOptions().map((destination) => (
              <option key={destination.label} value={destination.label}>{destination.label}</option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium">
          <span>Note focus</span>
          <select value={settings.outputNoteFocus} onChange={(event) => updateSetting('outputNoteFocus', event.target.value as ProviderSettings['outputNoteFocus'])} className="rounded-xl border border-border bg-white p-3">
            {OUTPUT_NOTE_FOCUSES.map((focus) => (
              <option key={focus} value={focus}>{getOutputNoteFocusLabel(focus)}</option>
            ))}
          </select>
        </label>

        <div className="rounded-lg border border-border bg-paper p-4 text-sm text-muted md:col-span-2">
          <div className="font-medium text-ink">{getOutputDestinationMeta(settings.outputDestination).summaryLabel}</div>
          <div className="mt-1">{getOutputDestinationMeta(settings.outputDestination).pasteExpectation}</div>
          <div className="mt-2 text-xs text-slate-600">
            Current note focus: {getOutputNoteFocusLabel(settings.outputNoteFocus)}
          </div>
        </div>

        <div className="aurora-soft-panel rounded-[18px] border border-violet-200 p-4 md:col-span-2">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-violet-950">Multi-site output presets</div>
              <p className="mt-1 text-sm text-violet-900/78">
                Save different site and EHR combinations so a provider can jump between multiple workplaces without rebuilding output rules each time.
              </p>
            </div>
            <div className="text-xs text-violet-900/68">
              Save the current destination, note focus, and formatting rules as a reusable preset.
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-violet-950">
              <span>Preset name</span>
              <input
                value={outputProfileName}
                onChange={(event) => setOutputProfileName(event.target.value)}
                placeholder="Example: Hospital A - Tebra Psych Initial"
                className="rounded-xl border border-violet-200 bg-white p-3"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-violet-950">
              <span>Site label</span>
              <input
                value={outputProfileSiteLabel}
                onChange={(event) => setOutputProfileSiteLabel(event.target.value)}
                placeholder="Example: Hospital A"
                className="rounded-xl border border-violet-200 bg-white p-3"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={handleSaveOutputProfile} className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium">
              {editingOutputProfileId ? 'Update output preset' : 'Save current as output preset'}
            </button>
            {editingOutputProfileId ? (
              <button type="button" onClick={resetOutputProfileEditor} className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium">
                Cancel edit
              </button>
            ) : null}
          </div>

          {settings.outputProfiles.length ? (
            <div className="mt-5 grid gap-3">
              {settings.outputProfiles.map((profile) => (
                <div key={profile.id} className="rounded-[16px] border border-violet-200 bg-white/80 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-violet-950">{profile.name}</div>
                      <div className="mt-1 text-sm text-violet-900/76">
                        {profile.siteLabel} • {profile.destination} • {getOutputNoteFocusLabel(profile.noteFocus)}
                      </div>
                      <div className="mt-2 text-xs text-violet-900/68">
                        {profile.asciiSafe ? 'ASCII-safe' : 'Standard punctuation'} • {profile.paragraphOnly ? 'Paragraph-first' : 'Headings allowed'} • {profile.wellskyFriendly ? 'Strict template cleanup' : 'Standard cleanup'}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => applyOutputProfile(profile.id)} className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium">
                        Apply
                      </button>
                      <button type="button" onClick={() => handleEditOutputProfile(profile.id)} className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium">
                        Edit
                      </button>
                      <button type="button" onClick={() => handleDeleteOutputProfile(profile.id)} className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium">
                        Delete
                      </button>
                    </div>
                  </div>
                  {settings.activeOutputProfileId === profile.id ? (
                    <div className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-violet-700">
                      Active preset
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-[16px] border border-dashed border-violet-200 bg-white/60 p-4 text-sm text-violet-900/72">
              No saved site/EHR presets yet. Save the current setup once and it will be available for reuse across sites.
            </div>
          )}
        </div>
      </div>

      <div id="vera-relationship-settings" className="aurora-soft-panel mt-5 grid gap-4 rounded-[22px] border border-violet-200 p-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">Vera relationship settings</h3>
          <p className="mt-1 text-sm text-muted">
            This is where the provider teaches Vera how to address them, how warm or formal to feel, and how proactive to be. These settings persist with provider settings so Vera does not feel like she forgot who she is helping.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            <span>Provider first name</span>
            <input
              value={settings.providerFirstName}
              onChange={(event) => updateSetting('providerFirstName', event.target.value)}
              placeholder="Example: Daniel"
              className="rounded-xl border border-border bg-white p-3"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            <span>Provider last name</span>
            <input
              value={settings.providerLastName}
              onChange={(event) => updateSetting('providerLastName', event.target.value)}
              placeholder="Example: Folarin"
              className="rounded-xl border border-border bg-white p-3"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            <span>Vera should address me as</span>
            <select
              value={settings.veraAddressPreference}
              onChange={(event) => updateSetting('veraAddressPreference', event.target.value as ProviderSettings['veraAddressPreference'])}
              className="rounded-xl border border-border bg-white p-3"
            >
              <option value="provider-profile">Use provider profile name</option>
              <option value="first-name">Use my first name</option>
              <option value="title-last-name">Use Dr. LastName</option>
              <option value="preferred-address">Use my preferred address</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            <span>Preferred address override</span>
            <input
              value={settings.veraPreferredAddress}
              onChange={(event) => updateSetting('veraPreferredAddress', event.target.value)}
              placeholder="Example: Dr. Folarin"
              className="rounded-xl border border-border bg-white p-3"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            <span>Interaction style</span>
            <select
              value={settings.veraInteractionStyle}
              onChange={(event) => updateSetting('veraInteractionStyle', event.target.value as ProviderSettings['veraInteractionStyle'])}
              className="rounded-xl border border-border bg-white p-3"
            >
              <option value="warm-professional">Warm professional</option>
              <option value="formal">Formal</option>
              <option value="friendly">Friendly</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            <span>Proactivity level</span>
            <select
              value={settings.veraProactivityLevel}
              onChange={(event) => updateSetting('veraProactivityLevel', event.target.value as ProviderSettings['veraProactivityLevel'])}
              className="rounded-xl border border-border bg-white p-3"
            >
              <option value="light">Light-touch</option>
              <option value="balanced">Balanced</option>
              <option value="anticipatory">Anticipatory</option>
            </select>
          </label>
        </div>

        <label className="grid gap-2 text-sm font-medium">
          <span>Long-term Vera memory note</span>
          <textarea
            value={settings.veraMemoryNotes}
            onChange={(event) => updateSetting('veraMemoryNotes', event.target.value)}
            placeholder="Example: Prefers to be addressed as Dr. Folarin. Likes concise but warm help. Wants Vera to anticipate missing risk and medication details."
            rows={4}
            className="rounded-xl border border-border bg-white p-3"
          />
        </label>

        <div className="aurora-panel rounded-[18px] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Vera relationship preview</div>
          <div className="mt-2 text-sm text-cyan-50/86">
            Addressing: <span className="font-semibold text-white">{veraAddress || 'Not set yet'}</span>
            {' '}• {veraInteractionStyleLabel(settings.veraInteractionStyle)}
            {' '}• {veraProactivityLabel(settings.veraProactivityLevel)}
          </div>
          <div className="mt-3 text-sm leading-6 text-cyan-50/78">
            {buildVeraIntro({
              stage: 'compose',
              address: veraAddress,
              interactionStyle: settings.veraInteractionStyle,
              proactivityLevel: settings.veraProactivityLevel,
            })}
          </div>
          {settings.veraMemoryNotes.trim() ? (
            <div className="mt-3 text-xs leading-6 text-cyan-50/72">
              Stored memory note: {settings.veraMemoryNotes.trim()}
            </div>
          ) : null}
        </div>
      </div>

      <div className="aurora-soft-panel mt-5 rounded-[22px] border border-violet-200 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink">Vera workflow insights</h3>
            <p className="mt-1 text-sm text-muted">
              This is the provider-facing memory summary for what Vera has noticed about your workflow. It is reviewable here first and still requires explicit action in the workspace or assistant flow before anything becomes a reusable preference.
            </p>
          </div>
          <div className="aurora-pill rounded-full px-3 py-1 text-xs font-medium">
            Review only
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setIsVeraMemoryOpen(true)}
            className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
          >
            Open Vera memory
          </button>
          <button
            type="button"
            onClick={() => {
              assistantMemoryService.resetLearningForProfile({
                profileId: settings.providerProfileId,
                noteTypes: activeProfile?.defaults.noteTypePriority || [],
              }, resolvedProviderIdentityId);
              refreshWorkflowInsights();
              setMessage('Vera memory reset for this provider profile.');
              window.setTimeout(() => setMessage(''), 2200);
            }}
            className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
          >
            Reset Vera memory
          </button>
        </div>

        {veraMemoryLedger ? (
          <div className="mt-4 rounded-[18px] border border-violet-200 bg-white p-4 text-sm text-violet-900">
            <div className="font-semibold text-violet-950">Server-side Vera memory ledger</div>
            <div className="mt-1 text-xs text-violet-800">
              Generated {memoryTimestampLine('Last seen', veraMemoryLedger.generatedAt).replace('Last seen: ', '')}
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {([
                ['relationship', 'Relationship'],
                ['accepted-preference', 'Accepted'],
                ['observed-workflow', 'Observed'],
                ['safety', 'Safety'],
              ] as const).map(([category, label]) => (
                <div key={category} className="rounded-[14px] border border-violet-200 bg-violet-50 px-3 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-800">{label}</div>
                  <div className="mt-1 text-lg font-semibold text-violet-950">
                    {veraMemoryLedger.items.filter((item) => item.category === category).length}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {workflowInsights.profilePromptSuggestion ? (
          <div className="aurora-panel mt-4 rounded-[18px] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold text-white">Cross-note profile pattern</div>
              {memoryPriorityLabel({
                lastSeenAt: workflowInsights.profilePromptSuggestion.lastSeenAt,
                lastUsedAt: workflowInsights.profilePromptSuggestion.lastUsedAt,
              }) ? (
                <span className="rounded-full border border-cyan-200/30 bg-cyan-300/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-50">
                  {memoryPriorityLabel({
                    lastSeenAt: workflowInsights.profilePromptSuggestion.lastSeenAt,
                    lastUsedAt: workflowInsights.profilePromptSuggestion.lastUsedAt,
                  })}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-cyan-50/78">
              Vera has noticed a repeated provider-level pattern:
              {' '}
              <span className="font-semibold text-white">{workflowInsights.profilePromptSuggestion.label}</span>.
            </p>
            <div className="mt-2 text-xs text-cyan-50/70">
              Seen across {workflowInsights.profilePromptSuggestion.noteTypes.length} note types: {workflowInsights.profilePromptSuggestion.noteTypes.join(' • ')}
            </div>
            <div className="mt-2 text-xs text-cyan-50/70">
              Status: {workflowInsights.profilePromptSuggestion.status}
            </div>
            <div className="mt-2 text-xs leading-6 text-cyan-50/72">
              Why Vera inferred this: {workflowInsights.profilePromptSuggestion.reason}
            </div>
            <div className="mt-2 text-xs text-cyan-50/70">
              {memoryTimestampLine('Last seen', workflowInsights.profilePromptSuggestion.lastSeenAt)}
            </div>
            <div className="mt-1 text-xs text-cyan-50/70">
              {memoryTimestampLine('Last used', workflowInsights.profilePromptSuggestion.lastUsedAt)}
            </div>
            <div className="mt-2 text-xs leading-6 text-cyan-50/72">
              {recommendedNextActionText('profile')}
            </div>
          </div>
        ) : null}

        {workflowInsights.noteTypeInsights.length ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {workflowInsights.noteTypeInsights.map((insight) => (
              <div key={insight.noteType} className="aurora-soft-panel rounded-[18px] border border-violet-200 p-4 text-sm text-violet-900">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-semibold text-violet-950">{insight.noteType}</div>
                  {memoryPriorityLabel({
                    lastSeenAt: insight.rewriteSuggestion?.lastSeenAt || insight.laneSuggestion?.lastSeenAt || insight.promptSuggestion?.lastSeenAt,
                    lastUsedAt: insight.rewriteSuggestion?.lastUsedAt || insight.laneSuggestion?.lastUsedAt || insight.promptSuggestion?.lastUsedAt,
                  }) ? (
                    <span className="rounded-full border border-violet-300 bg-violet-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-800">
                      {memoryPriorityLabel({
                        lastSeenAt: insight.rewriteSuggestion?.lastSeenAt || insight.laneSuggestion?.lastSeenAt || insight.promptSuggestion?.lastSeenAt,
                        lastUsedAt: insight.rewriteSuggestion?.lastUsedAt || insight.laneSuggestion?.lastUsedAt || insight.promptSuggestion?.lastUsedAt,
                      })}
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {insight.rewriteSuggestion ? (
                    <span className="aurora-pill rounded-full px-3 py-1 text-xs font-medium text-slate-700">
                      Rewrite style: {rewriteToneLabel(insight.rewriteSuggestion.optionTone)} ({insight.rewriteSuggestion.status})
                    </span>
                  ) : null}
                  {insight.laneSuggestion ? (
                    <span className="aurora-pill rounded-full px-3 py-1 text-xs font-medium text-slate-700">
                      Repeated lane setup ({insight.laneSuggestion.status})
                    </span>
                  ) : null}
                  {insight.promptSuggestion ? (
                    <span className="aurora-pill rounded-full px-3 py-1 text-xs font-medium text-slate-700">
                      Prompt pattern: {insight.promptSuggestion.label} ({insight.promptSuggestion.status})
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 space-y-2 text-xs leading-6 text-violet-900">
                  {insight.rewriteSuggestion ? (
                    <div>
                      Vera has seen the <span className="font-semibold">{rewriteToneLabel(insight.rewriteSuggestion.optionTone)}</span> review rewrite style {insight.rewriteSuggestion.count} times for this note type.
                      <div>Why Vera inferred this: {insight.rewriteSuggestion.reason}</div>
                      <div>{memoryTimestampLine('Last seen', insight.rewriteSuggestion.lastSeenAt)}</div>
                      <div>{memoryTimestampLine('Last used', insight.rewriteSuggestion.lastUsedAt)}</div>
                      <div>{recommendedNextActionText('rewrite')}</div>
                    </div>
                  ) : null}
                  {insight.laneSuggestion ? (
                    <div>
                      Vera has seen the same scope/style/format lane setup {insight.laneSuggestion.count} times for this note type.
                      <div>Why Vera inferred this: {insight.laneSuggestion.reason}</div>
                      <div>{memoryTimestampLine('Last seen', insight.laneSuggestion.lastSeenAt)}</div>
                      <div>{memoryTimestampLine('Last used', insight.laneSuggestion.lastUsedAt)}</div>
                      <div>{recommendedNextActionText('lane')}</div>
                    </div>
                  ) : null}
                  {insight.promptSuggestion ? (
                    <div>
                      Vera has seen this prompt-builder pattern {insight.promptSuggestion.count} times for this note type.
                      <div>Why Vera inferred this: {insight.promptSuggestion.reason}</div>
                      <div>{memoryTimestampLine('Last seen', insight.promptSuggestion.lastSeenAt)}</div>
                      <div>{memoryTimestampLine('Last used', insight.promptSuggestion.lastUsedAt)}</div>
                      <div>{recommendedNextActionText('prompt')}</div>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-[18px] border border-violet-200 bg-white p-4 text-sm text-violet-900">
            Vera has not accumulated enough repeat behavior to summarize yet. As providers keep using the workspace, review flow, and Vera quick builder, this area will start reflecting reusable patterns.
          </div>
        )}

        <div className="mt-4 text-xs text-violet-900">
          These insights are intentionally descriptive, not automatic. Use the workspace or Vera drawer when you want to turn one of these patterns into a saved reusable preference.
        </div>
      </div>

      <div className="mt-5 space-y-3 text-sm text-ink">
        <label className="flex items-start gap-3"><input type="checkbox" checked={settings.asciiSafe} onChange={(event) => updateSetting('asciiSafe', event.target.checked)} /> ASCII-safe output</label>
        <label className="flex items-start gap-3"><input type="checkbox" checked={settings.abbreviationsOkay} onChange={(event) => updateSetting('abbreviationsOkay', event.target.checked)} /> Standard clinical abbreviations okay</label>
        <label className="flex items-start gap-3"><input type="checkbox" checked={settings.paragraphOnly} onChange={(event) => updateSetting('paragraphOnly', event.target.checked)} /> Prefer paragraph-only output</label>
        <label className="flex items-start gap-3"><input type="checkbox" checked={settings.closerToSourceDefault} onChange={(event) => updateSetting('closerToSourceDefault', event.target.checked)} /> Closer to source by default</label>
        <label className="flex items-start gap-3"><input type="checkbox" checked={settings.wellskyFriendly} onChange={(event) => updateSetting('wellskyFriendly', event.target.checked)} /> WellSky-friendly formatting</label>
      </div>

      <div className="mt-6 flex gap-3">
        <button onClick={handleSave} className="aurora-primary-button rounded-xl px-5 py-3 font-medium">Save Settings</button>
        <button onClick={handleReset} className="aurora-secondary-button rounded-xl px-5 py-3 font-medium">Reset to Defaults</button>
      </div>

      {message ? <div className="mt-3 text-sm text-muted">{message}</div> : null}

      {isVeraMemoryOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(2,6,13,0.72)] px-4">
          <div className="aurora-panel max-h-[min(760px,90vh)] w-full max-w-4xl overflow-y-auto rounded-[28px] p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-lg font-semibold">Vera memory</h3>
                <p className="mt-1 text-sm text-muted">
                  Review what Vera has learned about this provider profile. Accept keeps the pattern as an intentional reviewed preference candidate, dismiss hides the suggestion, and reset clears the profile memory entirely.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsVeraMemoryOpen(false)}
                className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
              >
                Close
              </button>
            </div>

            {workflowInsights.profilePromptSuggestion ? (
              <div className="aurora-panel mt-5 rounded-[20px] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-white">Cross-note provider pattern</div>
                  {memoryPriorityLabel({
                    lastSeenAt: workflowInsights.profilePromptSuggestion.lastSeenAt,
                    lastUsedAt: workflowInsights.profilePromptSuggestion.lastUsedAt,
                  }) ? (
                    <span className="rounded-full border border-cyan-200/30 bg-cyan-300/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-50">
                      {memoryPriorityLabel({
                        lastSeenAt: workflowInsights.profilePromptSuggestion.lastSeenAt,
                        lastUsedAt: workflowInsights.profilePromptSuggestion.lastUsedAt,
                      })}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 text-sm text-cyan-50/78">{workflowInsights.profilePromptSuggestion.label}</div>
                <div className="mt-2 text-xs text-cyan-50/70">
                  Seen in: {workflowInsights.profilePromptSuggestion.noteTypes.join(' • ')}
                </div>
                <div className="mt-2 text-xs text-cyan-50/70">
                  Status: {workflowInsights.profilePromptSuggestion.status}
                </div>
                <div className="mt-2 text-xs leading-6 text-cyan-50/72">
                  Why Vera inferred this: {workflowInsights.profilePromptSuggestion.reason}
                </div>
                <div className="mt-2 text-xs text-cyan-50/70">
                  {memoryTimestampLine('Last seen', workflowInsights.profilePromptSuggestion.lastSeenAt)}
                </div>
                <div className="mt-1 text-xs text-cyan-50/70">
                  {memoryTimestampLine('Last used', workflowInsights.profilePromptSuggestion.lastUsedAt)}
                </div>
                <div className="mt-2 text-xs leading-6 text-cyan-50/72">
                  {recommendedNextActionText('profile')}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => openWorkspaceWithPreference(
                      workflowInsights.profilePromptSuggestion!.seedPrompt,
                      () => {
                        if (!settings.providerProfileId) {
                          return;
                        }
                        assistantMemoryService.markProfilePromptUsed(
                          settings.providerProfileId,
                          workflowInsights.profilePromptSuggestion!.key,
                          resolvedProviderIdentityId,
                        );
                        refreshWorkflowInsights();
                      },
                    )}
                    className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                  >
                    Open in workspace
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!settings.providerProfileId) {
                        return;
                      }
                      assistantMemoryService.acceptProfilePromptSuggestion(
                        settings.providerProfileId,
                        workflowInsights.profilePromptSuggestion!.key,
                        resolvedProviderIdentityId,
                      );
                      refreshWorkflowInsights();
                    }}
                    className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!settings.providerProfileId) {
                        return;
                      }
                      assistantMemoryService.dismissProfilePromptSuggestion(
                        settings.providerProfileId,
                        workflowInsights.profilePromptSuggestion!.key,
                        resolvedProviderIdentityId,
                      );
                      refreshWorkflowInsights();
                    }}
                    className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null}

            {featuredRecentMemoryItem ? (
              <div className="aurora-panel mt-5 rounded-[20px] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-white">Needs your attention</div>
                  <span className="rounded-full border border-amber-200/40 bg-amber-300/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-50">
                    Most current Vera cue
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="text-sm font-medium text-cyan-50">{featuredRecentMemoryItem.label}</div>
                  <span className="rounded-full border border-cyan-200/30 bg-cyan-300/12 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50">
                    {recentMemoryKindLabel(featuredRecentMemoryItem.kind)}
                  </span>
                  <span className="rounded-full border border-cyan-200/30 bg-cyan-300/12 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50">
                    {recentMemoryChangeLabel(featuredRecentMemoryItem)}
                  </span>
                </div>
                <div className="mt-2 text-xs text-cyan-50/78">
                  {recentMemoryChangeDetail(featuredRecentMemoryItem)}
                </div>
                <div className="mt-2 text-xs text-cyan-50/70">
                  {featuredRecentMemoryItem.activityKind === 'used'
                    ? `Recently used ${formatMemoryRecency(featuredRecentMemoryItem.lastUsedAt) || 'recently'}`
                    : `Recently seen ${formatMemoryRecency(featuredRecentMemoryItem.lastSeenAt) || 'recently'}`}
                  {featuredRecentMemoryItem.noteType ? ` • ${featuredRecentMemoryItem.noteType}` : ' • Provider profile'}
                </div>
                <div className="mt-2 text-xs text-cyan-50/70">
                  If Vera sees this pattern again later, this nudge can return even after you clear it here.
                </div>
                <div className="mt-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleRecentMemoryAction(featuredRecentMemoryItem)}
                      className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                    >
                      {featuredRecentMemoryItem.kind === 'rewrite' ? 'Open in review' : 'Open in workspace'}
                    </button>
                    <button
                      type="button"
                      onClick={() => acknowledgeRecentMemory(featuredRecentMemoryItem)}
                      className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                    >
                      Not now
                    </button>
                    <button
                      type="button"
                      onClick={() => acknowledgeRecentMemory(featuredRecentMemoryItem)}
                      className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                    >
                      Got it
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {acknowledgedMemoryTokens.length ? (
              <div className="aurora-soft-panel mt-5 rounded-[20px] border border-violet-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-violet-950">Snoozed Vera nudges</div>
                    <div className="mt-1 text-xs text-violet-800">
                      {acknowledgedMemoryTokens.length} recent cue{acknowledgedMemoryTokens.length === 1 ? '' : 's'} cleared for now. They can return if Vera sees fresh activity.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={clearAcknowledgedMemory}
                    className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                  >
                    Show again
                  </button>
                </div>
              </div>
            ) : null}

            {visibleRecentMemoryActivity.length ? (
              <div className="aurora-soft-panel mt-5 rounded-[20px] border border-violet-200 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-violet-950">What changed recently</div>
                  <span className="rounded-full border border-violet-300 bg-violet-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-800">
                    Latest Vera signals
                  </span>
                </div>
                <div className="mt-2 text-xs text-violet-800">
                  `Not now` or `Got it` clears the current nudge only. If Vera detects the pattern again later, it can reappear here with a fresh timestamp.
                </div>
                <div className="mt-3 grid gap-2">
                  {visibleRecentMemoryActivity.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[14px] border border-violet-200 bg-white px-3 py-2 text-sm text-violet-900 transition hover:border-violet-300 hover:bg-violet-50/60"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium text-violet-950">{item.label}</div>
                          <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700">
                            {recentMemoryKindLabel(item.kind)}
                          </span>
                          <span className="rounded-full border border-cyan-200/60 bg-cyan-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-800">
                            {recentMemoryChangeLabel(item)}
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700">
                          {item.kind === 'rewrite' ? 'Open review' : 'Open workspace'}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-violet-800">
                        {item.activityKind === 'used'
                          ? `Recently used ${formatMemoryRecency(item.lastUsedAt) || 'recently'}`
                          : `Recently seen ${formatMemoryRecency(item.lastSeenAt) || 'recently'}`}
                        {item.noteType ? ` • ${item.noteType}` : ' • Provider profile'}
                      </div>
                      <div className="mt-1 text-xs text-violet-700">
                        {recentMemoryChangeDetail(item)}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleRecentMemoryAction(item)}
                          className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium"
                        >
                          {item.kind === 'rewrite' ? 'Open review' : 'Open workspace'}
                        </button>
                        <button
                          type="button"
                          onClick={() => acknowledgeRecentMemory(item)}
                          className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium"
                        >
                          Not now
                        </button>
                        <button
                          type="button"
                          onClick={() => acknowledgeRecentMemory(item)}
                          className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium"
                        >
                          Got it
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {veraMemoryLedger ? (
              <div className="aurora-soft-panel mt-5 rounded-[20px] border border-violet-200 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-violet-950">Server-side Vera memory ledger</div>
                    <div className="mt-1 text-xs text-violet-800">
                      Inspect exactly what is being held at the provider-memory layer and act on it directly when that memory maps to workspace, review, or settings behavior.
                    </div>
                  </div>
                  <div className="text-xs font-medium text-violet-800">
                    {filteredLedgerItems.length} item{filteredLedgerItems.length === 1 ? '' : 's'} shown
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {(['all', 'relationship', 'accepted-preference', 'observed-workflow', 'safety'] as const).map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setLedgerCategoryFilter(category)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] ${
                        ledgerCategoryFilter === category
                          ? 'border-violet-400 bg-violet-100 text-violet-900'
                          : 'border-violet-200 bg-white text-violet-700'
                      }`}
                    >
                      {veraMemoryCategoryLabel(category)}
                    </button>
                  ))}
                </div>

                <div className="mt-4 grid gap-3">
                  {filteredLedgerItems.length ? filteredLedgerItems.map((item) => {
                    const actions = ledgerItemActions(item);
                    const isShowingDetails = expandedLedgerDetailsId === item.id;
                    const isEditingInline = expandedLedgerEditorId === item.id;
                    const hasInlineEditor = (
                      item.category === 'relationship'
                      || item.category === 'safety'
                      || item.id.startsWith('accepted-')
                    );

                    return (
                      <div key={item.id} className="rounded-[16px] border border-violet-200 bg-white p-4 text-sm text-violet-900">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="font-medium text-violet-950">{item.label}</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-800">
                                {veraMemoryCategoryLabel(item.category)}
                              </span>
                              <span className="rounded-full border border-cyan-200/60 bg-cyan-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-800">
                                {veraMemoryStatusLabel(item.status)}
                              </span>
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                                {veraMemorySourceLabel(item.source)}
                              </span>
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800">
                                {veraMemoryConfidenceLabel(item.confidence)}
                              </span>
                            </div>
                          </div>
                          <div className="text-xs text-violet-700">
                            {memoryTimestampLine('Last seen', item.lastUpdatedAt)}
                          </div>
                        </div>

                        <div className="mt-3 text-sm leading-6 text-violet-900">
                          {item.detail}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={actions.onPrimary}
                            className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium"
                          >
                            {actions.primaryLabel}
                          </button>
                          {actions.onAccept ? (
                            <button
                              type="button"
                              onClick={actions.onAccept}
                              className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium"
                            >
                              Accept
                            </button>
                          ) : null}
                          {actions.onDismiss ? (
                            <button
                              type="button"
                              onClick={actions.onDismiss}
                              className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium"
                            >
                              Dismiss
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setExpandedLedgerDetailsId((current) => current === item.id ? null : item.id)}
                            className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium"
                          >
                            {isShowingDetails ? 'Hide details' : 'Show details'}
                          </button>
                          {hasInlineEditor ? (
                            <button
                              type="button"
                              onClick={() => setExpandedLedgerEditorId((current) => current === item.id ? null : item.id)}
                              className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium"
                            >
                              {isEditingInline ? 'Hide in-place editor' : 'Edit in place'}
                            </button>
                          ) : null}
                        </div>
                        {isShowingDetails ? (
                          <div className="mt-4 rounded-[14px] border border-violet-200 bg-violet-50/70 p-3 text-sm text-violet-900">
                            <div className="grid gap-3 md:grid-cols-3">
                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700">Confidence</div>
                                <div className="mt-1 font-medium text-violet-950">{veraMemoryConfidenceLabel(item.confidence)}</div>
                                <div className="mt-1 text-xs leading-6 text-violet-800">
                                  This reflects how firmly Vera should treat this memory right now based on direct provider input or repeated behavior.
                                </div>
                              </div>
                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700">Origin</div>
                                <div className="mt-1 text-xs leading-6 text-violet-800">{item.originSummary}</div>
                              </div>
                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700">Reinforcement</div>
                                <div className="mt-1 text-xs leading-6 text-violet-800">
                                  {item.reinforcementSummary || 'This memory is present, but Vera does not have extra reinforcement detail for it yet.'}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {isEditingInline ? renderLedgerInlineEditor(item) : null}
                      </div>
                    );
                  }) : (
                    <div className="rounded-[16px] border border-violet-200 bg-white p-4 text-sm text-violet-900">
                      There are no memory entries in this ledger category yet.
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {workflowInsights.noteTypeInsights.map((insight) => (
                <div key={insight.noteType} className="aurora-soft-panel rounded-[20px] border border-violet-200 p-4 text-sm text-violet-900">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold text-violet-950">{insight.noteType}</div>
                    {memoryPriorityLabel({
                      lastSeenAt: insight.rewriteSuggestion?.lastSeenAt || insight.laneSuggestion?.lastSeenAt || insight.promptSuggestion?.lastSeenAt,
                      lastUsedAt: insight.rewriteSuggestion?.lastUsedAt || insight.laneSuggestion?.lastUsedAt || insight.promptSuggestion?.lastUsedAt,
                    }) ? (
                      <span className="rounded-full border border-violet-300 bg-violet-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-800">
                        {memoryPriorityLabel({
                          lastSeenAt: insight.rewriteSuggestion?.lastSeenAt || insight.laneSuggestion?.lastSeenAt || insight.promptSuggestion?.lastSeenAt,
                          lastUsedAt: insight.rewriteSuggestion?.lastUsedAt || insight.laneSuggestion?.lastUsedAt || insight.promptSuggestion?.lastUsedAt,
                        })}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-4 space-y-3">
                    {insight.rewriteSuggestion ? (
                      <div className="rounded-[16px] border border-violet-200 bg-white p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium text-violet-950">Rewrite style</div>
                          {memoryPriorityLabel({
                            lastSeenAt: insight.rewriteSuggestion.lastSeenAt,
                            lastUsedAt: insight.rewriteSuggestion.lastUsedAt,
                          }) ? (
                            <span className="rounded-full border border-violet-300 bg-violet-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-800">
                              {memoryPriorityLabel({
                                lastSeenAt: insight.rewriteSuggestion.lastSeenAt,
                                lastUsedAt: insight.rewriteSuggestion.lastUsedAt,
                              })}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-sm">{rewriteToneLabel(insight.rewriteSuggestion.optionTone)}</div>
                        <div className="mt-1 text-xs text-violet-800">Count: {insight.rewriteSuggestion.count} • Status: {insight.rewriteSuggestion.status}</div>
                        <div className="mt-1 text-xs text-violet-800">
                          {memoryTimestampLine('Last seen', insight.rewriteSuggestion.lastSeenAt)}
                        </div>
                        <div className="mt-1 text-xs text-violet-800">
                          {memoryTimestampLine('Last used', insight.rewriteSuggestion.lastUsedAt)}
                        </div>
                        <div className="mt-2 text-xs leading-6 text-violet-800">
                          Why Vera inferred this: {insight.rewriteSuggestion.reason}
                        </div>
                        <div className="mt-2 text-xs leading-6 text-violet-800">
                          {recommendedNextActionText('rewrite')}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openReviewForRewriteStyle(() => {
                              assistantMemoryService.markRewriteUsed(
                                insight.noteType,
                                insight.rewriteSuggestion!.optionTone,
                                resolvedProviderIdentityId,
                              );
                              refreshWorkflowInsights();
                            })}
                            className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium"
                          >
                            Open in review
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              assistantMemoryService.acceptRewriteSuggestion(
                                insight.noteType,
                                insight.rewriteSuggestion!.optionTone,
                                resolvedProviderIdentityId,
                              );
                              refreshWorkflowInsights();
                            }}
                            className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              assistantMemoryService.dismissRewriteSuggestion(
                                insight.noteType,
                                insight.rewriteSuggestion!.optionTone,
                                resolvedProviderIdentityId,
                              );
                              refreshWorkflowInsights();
                            }}
                            className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {insight.laneSuggestion ? (
                      <div className="rounded-[16px] border border-violet-200 bg-white p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium text-violet-950">Lane setup</div>
                          {memoryPriorityLabel({
                            lastSeenAt: insight.laneSuggestion.lastSeenAt,
                            lastUsedAt: insight.laneSuggestion.lastUsedAt,
                          }) ? (
                            <span className="rounded-full border border-violet-300 bg-violet-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-800">
                              {memoryPriorityLabel({
                                lastSeenAt: insight.laneSuggestion.lastSeenAt,
                                lastUsedAt: insight.laneSuggestion.lastUsedAt,
                              })}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-violet-800">
                          Count: {insight.laneSuggestion.count} • Status: {insight.laneSuggestion.status}
                        </div>
                        <div className="mt-1 text-xs text-violet-800">
                          Scope: {insight.laneSuggestion.outputScope.replace('-', ' ')} • Style: {insight.laneSuggestion.outputStyle} • Format: {insight.laneSuggestion.format}
                        </div>
                        <div className="mt-1 text-xs text-violet-800">
                          {memoryTimestampLine('Last seen', insight.laneSuggestion.lastSeenAt)}
                        </div>
                        <div className="mt-1 text-xs text-violet-800">
                          {memoryTimestampLine('Last used', insight.laneSuggestion.lastUsedAt)}
                        </div>
                        <div className="mt-2 text-xs leading-6 text-violet-800">
                          Why Vera inferred this: {insight.laneSuggestion.reason}
                        </div>
                        <div className="mt-2 text-xs leading-6 text-violet-800">
                          {recommendedNextActionText('lane')}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openWorkspaceWithPreference(
                              buildLanePreferencePrompt({
                                noteType: insight.noteType,
                                outputScope: insight.laneSuggestion!.outputScope as OutputScope,
                                outputStyle: insight.laneSuggestion!.outputStyle,
                                format: insight.laneSuggestion!.format,
                                requestedSections: insight.laneSuggestion!.requestedSections as NoteSectionKey[],
                              }),
                              () => {
                                assistantMemoryService.markLaneUsed(
                                  insight.noteType,
                                  insight.laneSuggestion!.key,
                                  resolvedProviderIdentityId,
                                );
                                refreshWorkflowInsights();
                              },
                            )}
                            className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium"
                          >
                            Open in workspace
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              assistantMemoryService.acceptLaneSuggestion(
                                insight.noteType,
                                insight.laneSuggestion!.key,
                                resolvedProviderIdentityId,
                              );
                              refreshWorkflowInsights();
                            }}
                            className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              assistantMemoryService.dismissLaneSuggestion(
                                insight.noteType,
                                insight.laneSuggestion!.key,
                                resolvedProviderIdentityId,
                              );
                              refreshWorkflowInsights();
                            }}
                            className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {insight.promptSuggestion ? (
                      <div className="rounded-[16px] border border-violet-200 bg-white p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium text-violet-950">Prompt-builder pattern</div>
                          {memoryPriorityLabel({
                            lastSeenAt: insight.promptSuggestion.lastSeenAt,
                            lastUsedAt: insight.promptSuggestion.lastUsedAt,
                          }) ? (
                            <span className="rounded-full border border-violet-300 bg-violet-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-800">
                              {memoryPriorityLabel({
                                lastSeenAt: insight.promptSuggestion.lastSeenAt,
                                lastUsedAt: insight.promptSuggestion.lastUsedAt,
                              })}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-sm">{insight.promptSuggestion.label}</div>
                        <div className="mt-1 text-xs text-violet-800">Count: {insight.promptSuggestion.count} • Status: {insight.promptSuggestion.status}</div>
                        <div className="mt-1 text-xs text-violet-800">
                          {memoryTimestampLine('Last seen', insight.promptSuggestion.lastSeenAt)}
                        </div>
                        <div className="mt-1 text-xs text-violet-800">
                          {memoryTimestampLine('Last used', insight.promptSuggestion.lastUsedAt)}
                        </div>
                        <div className="mt-2 text-xs leading-6 text-violet-800">
                          Why Vera inferred this: {insight.promptSuggestion.reason}
                        </div>
                        <div className="mt-2 text-xs leading-6 text-violet-800">
                          {recommendedNextActionText('prompt')}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openWorkspaceWithPreference(
                              insight.promptSuggestion!.seedPrompt,
                              () => {
                                assistantMemoryService.markPromptUsed(
                                  insight.noteType,
                                  insight.promptSuggestion!.key,
                                  resolvedProviderIdentityId,
                                );
                                refreshWorkflowInsights();
                              },
                            )}
                            className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium"
                          >
                            Open in workspace
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              assistantMemoryService.acceptPromptSuggestion(
                                insight.noteType,
                                insight.promptSuggestion!.key,
                                resolvedProviderIdentityId,
                              );
                              refreshWorkflowInsights();
                            }}
                            className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              assistantMemoryService.dismissPromptSuggestion(
                                insight.noteType,
                                insight.promptSuggestion!.key,
                                resolvedProviderIdentityId,
                              );
                              refreshWorkflowInsights();
                            }}
                            className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
