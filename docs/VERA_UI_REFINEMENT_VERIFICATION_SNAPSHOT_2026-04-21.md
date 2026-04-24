# Vera UI Refinement Verification Snapshot

## 1. Files Modified

- [assistant-panel.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/veranote/assistant/assistant-panel.tsx)
- [thread-view.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/veranote/assistant/thread-view.tsx)

## 2. Full Updated Code

### assistant-panel.tsx
```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Composer } from '@/components/veranote/assistant/composer';
import { ContextPill } from '@/components/veranote/assistant/context-pill';
import { ThreadView } from '@/components/veranote/assistant/thread-view';
import { getAssistantModeDefinition, listAssistantModeDefinitions } from '@/lib/veranote/assistant-mode';
import { getAssistantToolDefinition, getAssistantToolRiskLabel } from '@/lib/veranote/assistant-tool-registry';
import { describeAssistantReferencePolicy } from '@/lib/veranote/assistant-source-policy';
import { publishAssistantAction } from '@/lib/veranote/assistant-context';
import type { NoteSectionKey, OutputScope } from '@/lib/note/section-profiles';
import { buildLanePreferencePrompt } from '@/lib/veranote/preference-draft';
import { DEFAULT_PROVIDER_IDENTITY_ID } from '@/lib/constants/provider-identities';
import { getVeraCueUsageStorageKey } from '@/lib/veranote/provider-identity';
import { veraInteractionStyleLabel, veraProactivityLabel } from '@/lib/veranote/vera-relationship';
import { assistantMemoryService } from '@/lib/veranote/assistant-memory-service';
import type { FeedbackNotificationResult } from '@/lib/beta/feedback-email';
import type { AssistantAction, AssistantApiContext, AssistantMessage, AssistantMode, AssistantResponsePayload, AssistantStage, AssistantThreadTurn } from '@/types/assistant';

type AssistantPanelProps = {
  stage: AssistantStage;
  context: AssistantApiContext;
  isMinimized?: boolean;
  onToggleMinimized?: () => void;
};

const MODE_STORAGE_KEY_PREFIX = 'veranote-assistant-mode';

type VeraCueCard = {
  id: string;
  title: string;
  description: string;
  whyNow: string;
  actionLabel: string;
  onDraft: () => void;
  usageCount: number;
  recencyTimestamp?: string;
  kind: 'profile' | 'rewrite' | 'lane' | 'prompt';
};

type ContextActionCard = {
  id: string;
  label: string;
  detail: string;
  actionLabel: string;
  prompt: string;
  nextMode: AssistantMode;
};

function buildInitialSuggestions(stage: AssistantStage): string[] {
  return stage === 'compose'
    ? [
        'Help me shape this note lane around my workflow.',
        'What should I set before I generate the draft?',
        'How should I organize messy source material here?',
      ]
    : [
        'Why did this warning appear?',
        'What should I fix first in review?',
        'How do I keep this wording more conservative?',
        'Add this to HPI: patient has been off meds for 4 months.',
        'Put this in assessment: concern remains high because she has been off meds for months.',
        'Can you add that the patient has been off meds for 4 months?',
        'I forgot to put that UDS was +THC and +meth and UPT was negative.',
      ];
}

function createMessage(
  role: AssistantMessage['role'],
  content: string,
  suggestions?: string[],
  references?: AssistantMessage['references'],
  externalAnswerMeta?: AssistantMessage['externalAnswerMeta'],
  modeMeta?: AssistantMessage['modeMeta'],
): AssistantMessage {
  return {
    id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    suggestions,
    references,
    externalAnswerMeta,
    modeMeta,
  };
}

function conservativeOptionLabel(tone: 'most-conservative' | 'balanced' | 'closest-to-source') {
  if (tone === 'most-conservative') {
    return 'Most conservative';
  }

  if (tone === 'closest-to-source') {
    return 'Closest to source';
  }

  return 'Balanced';
}

function isRecentCue(value?: string, days = 7) {
  if (!value) {
    return false;
  }

  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) {
    return false;
  }

  return Date.now() - parsed <= days * 24 * 60 * 60 * 1000;
}

function readCueUsageCounts(providerId?: string) {
  if (typeof window === 'undefined') {
    return {} as Record<string, number>;
  }

  try {
    const scopedProviderId = providerId || DEFAULT_PROVIDER_IDENTITY_ID;
    const raw = window.localStorage.getItem(getVeraCueUsageStorageKey(scopedProviderId));
    if (!raw) {
      return {} as Record<string, number>;
    }

    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {} as Record<string, number>;
  }
}

function writeCueUsageCounts(providerId: string | undefined, counts: Record<string, number>) {
  if (typeof window === 'undefined') {
    return;
  }

  const scopedProviderId = providerId || DEFAULT_PROVIDER_IDENTITY_ID;
  window.localStorage.setItem(getVeraCueUsageStorageKey(scopedProviderId), JSON.stringify(counts));
}

function cueTimestampValue(value?: string) {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatCueRecency(value?: string) {
  if (!value) {
    return 'recently';
  }

  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) {
    return 'recently';
  }

  const diffHours = Math.floor((Date.now() - parsed) / (60 * 60 * 1000));

  if (diffHours < 1) {
    return 'just now';
  }

  if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  }

  return 'recently';
}

function buildEmptyStateTitle(stage: AssistantStage, mode: AssistantMode) {
  if (mode === 'prompt-builder') {
    return stage === 'review' ? 'Turn review habits into reusable preferences' : 'Shape reusable lane preferences before you generate';
  }

  if (mode === 'reference-lookup') {
    return 'Look up documentation terms and coding references';
  }

  return stage === 'review' ? 'Use Vera to tighten this draft without drifting from source' : 'Use Vera to set up the lane and organize source material';
}

function buildEmptyStateDescription(stage: AssistantStage, mode: AssistantMode) {
  if (mode === 'prompt-builder') {
    return stage === 'review'
      ? 'Ask Vera to capture recurring review edits so future drafts lean closer to the way you actually revise.'
      : 'Ask Vera to translate your workflow into note-lane preferences, presets, or reusable setup patterns.';
  }

  if (mode === 'reference-lookup') {
    return 'Vera can explain note sections, documentation language, and approved reference lookups without leaving your current workflow.';
  }

  return stage === 'review'
    ? 'Start with a warning, a risky sentence, or a missing detail and Vera will help you correct it conservatively.'
    : 'Start with a note type, a source-organizing question, or a workflow problem and Vera will help you set up the next step.';
}

function buildComposerPlaceholder(stage: AssistantStage, context: AssistantApiContext) {
  if (stage === 'review' && context.topHighRiskWarningTitle) {
    return `Review "${context.topHighRiskWarningTitle}", this section, conservative rewrites, or what to verify before export...`;
  }

  if (context.focusedSectionHeading) {
    return `${context.focusedSectionHeading}, source support, note preferences, or workflow help...`;
  }

  if (stage === 'compose') {
    return 'Source organization, note setup, presets, or how to shape this lane before generating...';
  }

  return 'This warning, this section, note preferences, privacy, or workflow help...';
}

export function AssistantPanel({ stage, context, isMinimized = false, onToggleMinimized }: AssistantPanelProps) {
  const resolvedProviderIdentityId = context.providerIdentityId || DEFAULT_PROVIDER_IDENTITY_ID;
  const [learningHydratedAt, setLearningHydratedAt] = useState(0);
  const [mode, setMode] = useState<AssistantMode>('workflow-help');
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [actions, setActions] = useState<AssistantAction[]>([]);
  const [actionMessage, setActionMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);
  const [showScenarioQuestions, setShowScenarioQuestions] = useState(false);
  const [showCurrentCues, setShowCurrentCues] = useState(false);
  const [rewritePreferenceSuggestion, setRewritePreferenceSuggestion] = useState<{
    noteType: string;
    optionTone: 'most-conservative' | 'balanced' | 'closest-to-source';
    count: number;
  } | null>(null);
  const [profilePromptPreferenceSuggestion, setProfilePromptPreferenceSuggestion] = useState<ReturnType<typeof assistantMemoryService.getProfilePromptSuggestion>>(null);
  const [cueUsageCounts, setCueUsageCounts] = useState<Record<string, number>>({});
  const providerWorkflowInsights = useMemo(() => assistantMemoryService.getWorkflowInsights({
    profileId: context.providerProfileId,
    noteTypes: context.noteType ? [context.noteType] : [],
  }, resolvedProviderIdentityId), [context.noteType, context.providerProfileId, learningHydratedAt, resolvedProviderIdentityId]);
  const activeNoteTypeInsight = providerWorkflowInsights.noteTypeInsights[0] || null;
  const weeklyTheme = useMemo(() => {
    const themes: string[] = [];

    if (profilePromptPreferenceSuggestion && isRecentCue(profilePromptPreferenceSuggestion.lastSeenAt || profilePromptPreferenceSuggestion.lastUsedAt)) {
      themes.push('provider-level preference patterns');
    }

    if (rewritePreferenceSuggestion && activeNoteTypeInsight?.rewriteSuggestion && isRecentCue(activeNoteTypeInsight.rewriteSuggestion.lastSeenAt || activeNoteTypeInsight.rewriteSuggestion.lastUsedAt)) {
      themes.push('conservative review wording');
    }

    if (activeNoteTypeInsight?.laneSuggestion && isRecentCue(activeNoteTypeInsight.laneSuggestion.lastSeenAt || activeNoteTypeInsight.laneSuggestion.lastUsedAt)) {
      themes.push('repeat note-lane setups');
    }

    if (activeNoteTypeInsight?.promptSuggestion && isRecentCue(activeNoteTypeInsight.promptSuggestion.lastSeenAt || activeNoteTypeInsight.promptSuggestion.lastUsedAt)) {
      themes.push('reusable prompt patterns');
    }

    if (!themes.length) {
      return null;
    }

    return `This week Vera is mostly seeing ${themes.slice(0, 2).join(' and ')}${themes.length > 2 ? ' across your workflow.' : '.'}`;
  }, [activeNoteTypeInsight, profilePromptPreferenceSuggestion, rewritePreferenceSuggestion]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setMode('workflow-help');
      return;
    }

    try {
      const raw = window.localStorage.getItem(`${MODE_STORAGE_KEY_PREFIX}:${resolvedProviderIdentityId}:${stage}`);
      if (raw === 'workflow-help' || raw === 'prompt-builder' || raw === 'reference-lookup') {
        setMode(raw);
        return;
      }
    } catch {
      // Ignore storage access issues and fall back to workflow help.
    }

    setMode('workflow-help');
  }, [resolvedProviderIdentityId, stage]);

  useEffect(() => {
    setMessages([]);
    setActions([]);
    setActionMessage('');
    setShowSuggestions(false);
    setShowTools(false);
    setShowQuickPrompts(false);
    setShowScenarioQuestions(false);
    setShowCurrentCues(false);
  }, [context.providerAddressingName, context.veraInteractionStyle, context.veraProactivityLevel, stage]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(`${MODE_STORAGE_KEY_PREFIX}:${resolvedProviderIdentityId}:${stage}`, mode);
  }, [mode, resolvedProviderIdentityId, stage]);

  useEffect(() => {
    if (stage !== 'review') {
      setRewritePreferenceSuggestion(null);
      return;
    }

    setRewritePreferenceSuggestion(assistantMemoryService.getRewriteSuggestion(context.noteType, resolvedProviderIdentityId));
  }, [context.noteType, learningHydratedAt, resolvedProviderIdentityId, stage]);

  useEffect(() => {
    setProfilePromptPreferenceSuggestion(
      assistantMemoryService.getProfilePromptSuggestion(context.providerProfileId, resolvedProviderIdentityId),
    );
  }, [context.providerProfileId, context.noteType, learningHydratedAt, resolvedProviderIdentityId]);

  useEffect(() => {
    let isMounted = true;

    async function hydrateLearning() {
      try {
        await assistantMemoryService.hydrateLearning(resolvedProviderIdentityId);
        if (isMounted) {
          setLearningHydratedAt(Date.now());
        }
      } catch {
        // Keep local provider-scoped Vera memory available if server hydration fails.
      }
    }

    void hydrateLearning();

    return () => {
      isMounted = false;
    };
  }, [context.providerProfileId, context.noteType, resolvedProviderIdentityId]);

  useEffect(() => {
    setCueUsageCounts(readCueUsageCounts(resolvedProviderIdentityId));
  }, [resolvedProviderIdentityId]);

  const quickPrompts = useMemo(() => {
    if (mode === 'prompt-builder') {
      return stage === 'review'
        ? [
            'Turn this recurring review fix into a reusable preference.',
            'Help me save a preference from this review edit.',
            'I keep correcting overconfident wording. Help me save that pattern.',
            'I want future drafts to preserve uncertainty better.',
          ]
        : [
            'Help me shape prompt and note preferences for this note type.',
            'What should I save as a reusable preset here?',
            'How should I make this note lane more conservative and source-close?',
            'I want this workflow to fit the way I practice.',
          ];
    }

    if (mode === 'reference-lookup') {
      return [
        'Look up an ICD-10 or documentation term.',
        'What is the difference between H&P and consult?',
        'What goes in assessment or plan?',
        'What does HPI or MSE mean?',
      ];
    }

    return stage === 'review'
      ? [
          'Why did this warning appear?',
          'What should I fix first in review?',
          'How do I keep this wording more conservative?',
          'What should I check before export?',
        ]
      : [
          'What should I focus on in this stage?',
          'How should I move through this workflow efficiently?',
          'How should I organize messy source material?',
          'What sections should I include for this note?',
        ];
  }, [mode, stage]);

  const scenarioQuestions = useMemo(() => {
    if (mode === 'prompt-builder') {
      return stage === 'review'
        ? [
            'Turn this recurring review fix into a reusable preference.',
            'Help me save a preference from this review edit.',
            'I keep correcting overconfident wording. Help me save that pattern.',
            'I often shorten plans in this note type. Help me save that.',
            'I want future drafts to preserve uncertainty better.',
            'Create a preset draft from this review pattern.',
          ]
        : [
            'Help me build prompt and note preferences for this note type.',
            'I want evals to stay more conservative and differential-aware.',
            'I want progress notes to be shorter and easier to scan.',
            'I do not want a standalone MSE unless the source supports it.',
            'I need this to work better for my output destination.',
            'Help me create a reusable preset for this note lane.',
            'I want the plan shorter but still clinically safe.',
            'I want this workflow to fit the way I practice.',
          ];
    }

    if (mode === 'reference-lookup') {
      return [
        'Do you know the diagnosis ICD 10 for MDD?',
        'What is the ICD 10 code for recurrent severe MDD without psychotic features?',
        'What is the difference between H&P and consult?',
        'What goes in assessment?',
        'What goes in plan?',
        'What does HPI mean?',
        'What does MSE mean?',
      ];
    }

    return stage === 'review'
      ? [
          'Why did this warning appear?',
          'What should I fix first in review?',
          'How do I make this wording more conservative?',
          'What should stay uncertain here?',
          'Show me the source for this warning.',
          'How is the system determining confidence for this statement?',
          'How should I review this section faster without missing risk?',
          'How do I handle contradiction cues in this note?',
          'How do destination constraints affect this review?',
          'What should I check before export?',
          'Add this to HPI: patient has been off meds for 4 months.',
          'Put this in assessment: concern remains high because she has been off meds for months.',
          'Can you add that the patient has been off meds for 4 months?',
          'I forgot to put that UDS was +THC and +meth and UPT was negative.',
        ]
      : [
          'What should I do first for this note type?',
          'How should I organize messy source material before generating?',
          'Where should collateral go versus transcript?',
          'What sections should I include for this note?',
          'How do I keep this note more source-close?',
          'What should I save as a preset?',
          'How do I make this easier for my workflow?',
          'How should I set this up for my output destination?',
          'Where can I find saved drafts?',
          'How do I share feedback with the Veranote team?',
          'How does Veranote protect my data and patient confidentiality?',
          'What diagnosis should I assign to this patient?',
        ];
  }, [mode, stage]);

  async function sendMessage(message: string) {
    console.info('[veranote-assistant] send-message', { stage, mode, message });

    const recentMessages: AssistantThreadTurn[] = [
      ...messages.slice(-6).map((item) => ({
        role: item.role,
        content: item.content,
      })),
      {
        role: 'provider',
        content: message,
      },
    ];

    setMessages((current) => [...current, createMessage('provider', message)]);
    setActionMessage('');
    setActions([]);
    setShowSuggestions(false);
    setIsLoading(true);

    try {
      const response = await fetch('/api/assistant/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, mode, message, context, recentMessages }),
      });

      const data = (await response.json()) as AssistantResponsePayload & { error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Unable to load assistant help right now.');
      }

      setMessages((current) => [
        ...current,
        createMessage('assistant', data.message, data.suggestions, data.references, data.externalAnswerMeta, data.modeMeta),
      ]);
      setActions(data.actions || []);
      if (data.actions?.some((action) => action.type === 'send-beta-feedback')) {
        setShowSuggestions(true);
      }
    } catch (error) {
      setMessages((current) => [
        ...current,
        createMessage('assistant', error instanceof Error ? error.message : 'Unable to load assistant help right now.'),
      ]);
      setActions([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAction(action: AssistantAction) {
    if (action.type === 'send-beta-feedback') {
      try {
        const latestProviderQuestion = [...messages].reverse().find((item) => item.role === 'provider')?.content;
        const latestAssistantReply = [...messages].reverse().find((item) => item.role === 'assistant')?.content;

        const response = await fetch('/api/beta-feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pageContext: `${action.pageContext} • ${stage} • ${context.noteType || 'Unknown note type'}`,
            category: action.feedbackCategory,
            message: action.feedbackMessage,
            metadata: {
              source: 'vera-gap',
              providerId: resolvedProviderIdentityId,
              providerProfileId: context.providerProfileId,
              providerProfileName: context.providerProfileName,
              providerAddressingName: context.providerAddressingName,
              noteType: context.noteType,
              stage,
              originalQuestion: latestProviderQuestion,
              assistantReply: latestAssistantReply || "No, but I'll find out how I can learn how to.",
            },
          }),
        });

        const data = await response.json() as {
          error?: string;
          notification?: FeedbackNotificationResult;
        };

        if (!response.ok) {
          throw new Error(data.error || 'Unable to save Vera gap feedback right now.');
        }

        if (data.notification?.delivered && data.notification.recipient) {
          setActionMessage(`Vera gap saved and emailed to ${data.notification.recipient} so this missing skill can be reviewed and added.`);
        } else {
          setActionMessage('Vera gap saved to Beta Feedback so this missing skill can be reviewed and added.');
        }
        setActions((current) => current.filter((item) => item !== action));
      } catch (error) {
        setActionMessage(error instanceof Error ? error.message : 'Unable to save Vera gap feedback right now.');
      }
      return;
    }

    if (action.type === 'apply-conservative-rewrite' && context.noteType) {
      assistantMemoryService.recordRewriteSelection(context.noteType, action.optionTone, resolvedProviderIdentityId);
      setRewritePreferenceSuggestion(assistantMemoryService.getRewriteSuggestion(context.noteType, resolvedProviderIdentityId));
    }

    publishAssistantAction({
      type: action.type,
      instructions: action.instructions,
      presetName: action.type === 'create-preset-draft' ? action.presetName : undefined,
      rewriteMode: action.type === 'run-review-rewrite' ? action.rewriteMode : undefined,
      originalText: action.type === 'apply-conservative-rewrite' ? action.originalText : undefined,
      replacementText: action.type === 'apply-conservative-rewrite' ? action.replacementText : undefined,
      revisionText: action.type === 'apply-note-revision' ? action.revisionText : undefined,
      targetSectionHeading: action.type === 'apply-note-revision' ? action.targetSectionHeading : undefined,
    });

    setActionMessage(
      action.type === 'jump-to-source-evidence'
        ? 'Assistant jumped to the source evidence area for this review context.'
        : action.type === 'run-review-rewrite'
        ? `Assistant started the ${action.rewriteMode.replace(/-/g, ' ')} rewrite for this review draft.`
        : action.type === 'apply-conservative-rewrite'
        ? 'Assistant applied a focused conservative rewrite. Please review the sentence before final use.'
        : action.type === 'apply-note-revision'
        ? `Vera applied the requested revision${action.targetSectionHeading ? ` in ${action.targetSectionHeading}` : ''}. Please review it before final use.`
        : action.type === 'create-preset-draft'
        ? `Preset draft sent to the current note lane as ${action.presetName}.`
        : 'Assistant preference suggestion sent into the current note lane.',
    );
  }

  function handleDraftRewritePreferenceSuggestion() {
    if (!rewritePreferenceSuggestion) {
      return;
    }

    const toneLabel = conservativeOptionLabel(rewritePreferenceSuggestion.optionTone).toLowerCase();
    setMode('prompt-builder');
    void sendMessage(`I usually prefer the ${toneLabel} rewrite style for ${rewritePreferenceSuggestion.noteType}. Help me turn that into a reusable note preference.`);
  }

  function handleDismissRewritePreferenceSuggestion() {
    if (!rewritePreferenceSuggestion) {
      return;
    }

    assistantMemoryService.dismissRewriteSuggestion(
      rewritePreferenceSuggestion.noteType,
      rewritePreferenceSuggestion.optionTone,
      resolvedProviderIdentityId,
    );
    setRewritePreferenceSuggestion(null);
  }

  function handleDraftProfilePattern() {
    if (!profilePromptPreferenceSuggestion) {
      return;
    }

    setMode('prompt-builder');
    void sendMessage(profilePromptPreferenceSuggestion.seedPrompt);
  }

  function handleDismissProfilePattern() {
    if (!profilePromptPreferenceSuggestion || !context.providerProfileId) {
      return;
    }

    assistantMemoryService.dismissProfilePromptSuggestion(
      context.providerProfileId,
      profilePromptPreferenceSuggestion.key,
      resolvedProviderIdentityId,
    );
    setProfilePromptPreferenceSuggestion(null);
  }

  function handleDraftLanePattern() {
    if (!activeNoteTypeInsight?.laneSuggestion) {
      return;
    }

    setMode('prompt-builder');
    void sendMessage(buildLanePreferencePrompt({
      noteType: activeNoteTypeInsight.noteType,
      outputScope: activeNoteTypeInsight.laneSuggestion.outputScope as OutputScope,
      outputStyle: activeNoteTypeInsight.laneSuggestion.outputStyle,
      format: activeNoteTypeInsight.laneSuggestion.format,
      requestedSections: activeNoteTypeInsight.laneSuggestion.requestedSections as NoteSectionKey[],
    }));
  }

  function handleDraftPromptPattern() {
    if (!activeNoteTypeInsight?.promptSuggestion) {
      return;
    }

    setMode('prompt-builder');
    void sendMessage(activeNoteTypeInsight.promptSuggestion.seedPrompt);
  }

  function bumpCueUsage(cueId: string) {
    const nextCounts = {
      ...cueUsageCounts,
      [cueId]: (cueUsageCounts[cueId] || 0) + 1,
    };
    setCueUsageCounts(nextCounts);
    writeCueUsageCounts(resolvedProviderIdentityId, nextCounts);
  }

  const currentCueCards = useMemo(() => {
    const cards: VeraCueCard[] = [];

    if (profilePromptPreferenceSuggestion) {
      cards.push({
        id: `profile:${profilePromptPreferenceSuggestion.key}`,
        title: 'Profile pattern is active',
        description: `Vera is seeing ${profilePromptPreferenceSuggestion.label} across ${profilePromptPreferenceSuggestion.noteTypes.length} note types.`,
        whyNow: 'This matters now because the same provider-level preference is repeating across multiple note lanes, which is a strong signal that it should become a reusable default.',
        actionLabel: 'Draft from this cue',
        onDraft: () => {
          bumpCueUsage(`profile:${profilePromptPreferenceSuggestion.key}`);
          handleDraftProfilePattern();
        },
        usageCount: cueUsageCounts[`profile:${profilePromptPreferenceSuggestion.key}`] || 0,
        recencyTimestamp: profilePromptPreferenceSuggestion.lastUsedAt || profilePromptPreferenceSuggestion.lastSeenAt,
        kind: 'profile',
      });
    }

    if (rewritePreferenceSuggestion && activeNoteTypeInsight?.rewriteSuggestion) {
      cards.push({
        id: `rewrite:${rewritePreferenceSuggestion.noteType}:${rewritePreferenceSuggestion.optionTone}`,
        title: 'Review habit is active',
        description: `You have leaned toward the ${conservativeOptionLabel(rewritePreferenceSuggestion.optionTone)} rewrite style ${rewritePreferenceSuggestion.count} times for ${rewritePreferenceSuggestion.noteType}.`,
        whyNow: 'This matters now because your review behavior is showing a repeat safety style that Vera can help formalize instead of leaving it as a one-off correction pattern.',
        actionLabel: 'Draft from this cue',
        onDraft: () => {
          bumpCueUsage(`rewrite:${rewritePreferenceSuggestion.noteType}:${rewritePreferenceSuggestion.optionTone}`);
          handleDraftRewritePreferenceSuggestion();
        },
        usageCount: cueUsageCounts[`rewrite:${rewritePreferenceSuggestion.noteType}:${rewritePreferenceSuggestion.optionTone}`] || 0,
        recencyTimestamp: activeNoteTypeInsight.rewriteSuggestion.lastUsedAt || activeNoteTypeInsight.rewriteSuggestion.lastSeenAt,
        kind: 'rewrite',
      });
    }

    if (activeNoteTypeInsight?.laneSuggestion) {
      const cueId = `lane:${activeNoteTypeInsight.noteType}:${activeNoteTypeInsight.laneSuggestion.key}`;
      cards.push({
        id: cueId,
        title: 'Lane preference is active',
        description: `Vera is seeing a repeated setup for this note lane: ${activeNoteTypeInsight.laneSuggestion.outputScope.replace(/-/g, ' ')} scope, ${activeNoteTypeInsight.laneSuggestion.outputStyle} style, ${activeNoteTypeInsight.laneSuggestion.format} format.`,
        whyNow: 'This matters now because the same structure keeps showing up when you work in this note lane, which usually means Vera should help preserve that setup for you.',
        actionLabel: 'Draft from this cue',
        onDraft: () => {
          bumpCueUsage(cueId);
          handleDraftLanePattern();
        },
        usageCount: cueUsageCounts[cueId] || 0,
        recencyTimestamp: activeNoteTypeInsight.laneSuggestion.lastUsedAt || activeNoteTypeInsight.laneSuggestion.lastSeenAt,
        kind: 'lane',
      });
    }

    if (activeNoteTypeInsight?.promptSuggestion) {
      const cueId = `prompt:${activeNoteTypeInsight.noteType}:${activeNoteTypeInsight.promptSuggestion.key}`;
      cards.push({
        id: cueId,
        title: 'Prompt pattern is active',
        description: `Vera is seeing this note-lane prompt pattern repeat: ${activeNoteTypeInsight.promptSuggestion.label}.`,
        whyNow: 'This matters now because the same prompt shaping pattern is repeating enough that Vera can turn it into something reusable and easier to maintain.',
        actionLabel: 'Draft from this cue',
        onDraft: () => {
          bumpCueUsage(cueId);
          handleDraftPromptPattern();
        },
        usageCount: cueUsageCounts[cueId] || 0,
        recencyTimestamp: activeNoteTypeInsight.promptSuggestion.lastUsedAt || activeNoteTypeInsight.promptSuggestion.lastSeenAt,
        kind: 'prompt',
      });
    }

    return cards.sort((a, b) => {
      if (b.usageCount !== a.usageCount) {
        return b.usageCount - a.usageCount;
      }

      return cueTimestampValue(b.recencyTimestamp) - cueTimestampValue(a.recencyTimestamp);
    });
  }, [
    activeNoteTypeInsight,
    cueUsageCounts,
    profilePromptPreferenceSuggestion,
    rewritePreferenceSuggestion,
  ]);
  const assistantActivityTimeline = useMemo(() => currentCueCards
    .slice(0, 3)
    .map((card) => ({
      id: card.id,
      label: card.title,
      detail: `${card.kind === 'rewrite' ? 'Review' : 'Workspace'} cue ${card.usageCount > 0 ? `used ${card.usageCount} time${card.usageCount === 1 ? '' : 's'}` : 'seen'} ${formatCueRecency(card.recencyTimestamp)}.`,
    })), [currentCueCards]);
  const activeReferenceQuery = useMemo(() => mode === 'reference-lookup'
    ? [...messages].reverse().find((item) => item.role === 'provider')?.content
    : undefined, [messages, mode]);
  const referencePolicyPreview = useMemo(
    () => mode === 'reference-lookup' ? describeAssistantReferencePolicy(activeReferenceQuery) : null,
    [activeReferenceQuery, mode],
  );
  const compactContextLine = [
    context.noteType ? `Note: ${context.noteType}` : null,
    stage === 'review' && context.topHighRiskWarningTitle ? `Warning: ${context.topHighRiskWarningTitle}` : null,
    context.outputDestination ? context.outputDestination : null,
  ].filter(Boolean).join(' • ');
  const stageFocusLine = stage === 'review'
    ? 'Use Vera to explain warnings, suggest conservative rewrites, and help finish the note without drifting from source.'
    : 'Use Vera to help shape setup, organize source material, and build reusable preferences before generating.';
  const hasToolsContent = Boolean(
    quickPrompts.length
    || scenarioQuestions.length
    || stage === 'review' && rewritePreferenceSuggestion
    || profilePromptPreferenceSuggestion
    || currentCueCards.length,
  );
  const modeDefinitions = listAssistantModeDefinitions();
  const activeModeDefinition = getAssistantModeDefinition(mode);
  const emptyStateTitle = buildEmptyStateTitle(stage, mode);
  const emptyStateDescription = buildEmptyStateDescription(stage, mode);
  const stageActionStrip = stage === 'review'
    ? [
        { label: 'Explain warning', prompt: 'Explain the main warning on this note and tell me what to fix first.', nextMode: 'workflow-help' as AssistantMode },
        { label: 'More conservative', prompt: 'Help me make the current note wording more conservative and closer to source.', nextMode: 'workflow-help' as AssistantMode },
        { label: 'Find source support', prompt: 'Show me what source support I should verify before I finalize this note.', nextMode: 'workflow-help' as AssistantMode },
        { label: 'Check documentation term', prompt: 'Look up a documentation term or coding reference for this review context.', nextMode: 'reference-lookup' as AssistantMode },
      ]
    : [
        { label: 'Organize source', prompt: 'Help me organize messy source material before I generate the note.', nextMode: 'workflow-help' as AssistantMode },
        { label: 'Shape lane', prompt: 'Help me shape this note lane around my workflow and output destination.', nextMode: 'workflow-help' as AssistantMode },
        { label: 'Draft reusable preference', prompt: 'Help me turn this workflow pattern into a reusable preference or preset.', nextMode: 'prompt-builder' as AssistantMode },
        { label: 'Reference lookup', prompt: 'Look up a documentation term or note-structure reference for this compose stage.', nextMode: 'reference-lookup' as AssistantMode },
      ];
  const contextActionCards = useMemo(() => {
    const cards: ContextActionCard[] = [];

    if (stage === 'review' && context.topHighRiskWarningTitle) {
      cards.push({
        id: 'warning',
        label: 'Top warning in focus',
        detail: context.topHighRiskWarningDetail || context.topHighRiskWarningTitle,
        actionLabel: 'Work this warning',
        prompt: `The top warning is "${context.topHighRiskWarningTitle}". Explain what it means, what source support I should verify, and what I should fix first.`,
        nextMode: 'workflow-help',
      });
    }

    if (context.focusedSectionHeading) {
      cards.push({
        id: 'section',
        label: `Focused section: ${context.focusedSectionHeading}`,
        detail: context.focusedSectionSentence || 'Vera can help tighten this section without drifting from source.',
        actionLabel: stage === 'review' ? 'Review this section' : 'Shape this section',
        prompt: stage === 'review'
          ? `I am focused on the ${context.focusedSectionHeading} section. Help me review and revise it conservatively without drifting from source.`
          : `I am focused on the ${context.focusedSectionHeading} section. Help me shape what belongs here before I generate the note.`,
        nextMode: 'workflow-help',
      });
    }

    if (context.outputDestination && context.outputDestination !== 'Generic') {
      cards.push({
        id: 'destination',
        label: `${context.outputDestination} output is active`,
        detail: 'Keep wording and structure clean for the current destination without changing clinical meaning or certainty.',
        actionLabel: `Fit ${context.outputDestination}`,
        prompt: `Help me keep this note clean for ${context.outputDestination} without changing the clinical meaning or certainty.`,
        nextMode: 'workflow-help',
      });
    }

    if (stage === 'review' && ((context.needsReviewCount || 0) > 0 || (context.unreviewedCount || 0) > 0 || (context.phaseTwoCueCount || 0) > 0)) {
      cards.push({
        id: 'review-queue',
        label: 'Review queue is active',
        detail: [
          (context.needsReviewCount || 0) > 0 ? `${context.needsReviewCount} need review` : null,
          (context.unreviewedCount || 0) > 0 ? `${context.unreviewedCount} unreviewed` : null,
          (context.phaseTwoCueCount || 0) > 0 ? `${context.phaseTwoCueCount} follow-up cues` : null,
        ].filter(Boolean).join(' • '),
        actionLabel: 'Plan review pass',
        prompt: `I have ${context.needsReviewCount || 0} items needing review, ${context.unreviewedCount || 0} unreviewed items, and ${context.phaseTwoCueCount || 0} follow-up cues. Give me a fast review plan for this note.`,
        nextMode: 'workflow-help',
      });
    }

    return cards;
  }, [
    context.focusedSectionHeading,
    context.focusedSectionSentence,
    context.needsReviewCount,
    context.outputDestination,
    context.phaseTwoCueCount,
    context.topHighRiskWarningDetail,
    context.topHighRiskWarningTitle,
    context.unreviewedCount,
    stage,
  ]);
  const contextSummaryChips = [
    stage === 'review' && (context.needsReviewCount || 0) > 0 ? `${context.needsReviewCount} need review` : null,
    stage === 'review' && (context.unreviewedCount || 0) > 0 ? `${context.unreviewedCount} unreviewed` : null,
    stage === 'review' && (context.phaseTwoCueCount || 0) > 0 ? `${context.phaseTwoCueCount} follow-up cues` : null,
    context.focusedSectionHeading ? context.focusedSectionHeading : null,
    context.outputDestination && context.outputDestination !== 'Generic' ? context.outputDestination : null,
  ].filter(Boolean);
  const composerPlaceholder = buildComposerPlaceholder(stage, context);

  function clearConversation() {
    setMessages([]);
    setActions([]);
    setActionMessage('');
    setShowSuggestions(false);
  }

  function sendStageAction(nextMode: AssistantMode, prompt: string) {
    setMode(nextMode);
    void sendMessage(prompt);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 border-b border-cyan-200/10 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100">Vera</div>
            <div className="mt-1 text-lg font-semibold text-white">Your Vera assistant</div>
            <div className="mt-1 truncate text-xs text-cyan-50/72">
              {[context.providerAddressingName ? `Working with ${context.providerAddressingName}` : null, compactContextLine].filter(Boolean).join(' • ')}
            </div>
            {(context.veraInteractionStyle || context.veraProactivityLevel) ? (
              <div className="mt-1 truncate text-[11px] text-cyan-50/60">
                {[context.veraInteractionStyle ? veraInteractionStyleLabel(context.veraInteractionStyle) : null, context.veraProactivityLevel ? veraProactivityLabel(context.veraProactivityLevel) : null].filter(Boolean).join(' • ')}
              </div>
            ) : null}
            <div className="mt-1 truncate text-[11px] text-cyan-50/58">
              {activeModeDefinition.detail}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onToggleMinimized ? (
              <button
                type="button"
                onClick={onToggleMinimized}
                className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-[11px] font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
              >
                {isMinimized ? 'Expand' : 'Minimize'}
              </button>
            ) : null}
            <ContextPill stage={stage} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {modeDefinitions.map((definition) => (
            <button
              key={definition.mode}
              type="button"
              onClick={() => setMode(definition.mode)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                mode === definition.mode
                  ? 'border-cyan-200/30 bg-[rgba(18,181,208,0.18)] text-cyan-50'
                  : 'border-cyan-200/10 bg-[rgba(13,30,50,0.68)] text-ink hover:border-cyan-200/20 hover:bg-[rgba(18,181,208,0.12)] hover:text-cyan-50'
              }`}
              title={definition.detail}
            >
              {definition.label}
            </button>
          ))}
          {hasToolsContent ? (
            <button
              type="button"
              onClick={() => setShowTools((current) => !current)}
              className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-xs font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
            >
              {showTools ? 'Hide recommendations' : 'Recommendations'}
            </button>
          ) : null}
          {actions.length ? (
            <button
              type="button"
              onClick={() => setShowSuggestions((current) => !current)}
              className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-xs font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
            >
              {showSuggestions ? `Hide suggestions (${actions.length})` : `Suggestions (${actions.length})`}
            </button>
          ) : null}
          {messages.length ? (
            <button
              type="button"
              onClick={clearConversation}
              className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-xs font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
            >
              Clear thread
            </button>
          ) : null}
        </div>

        {actionMessage ? (
          <div className="rounded-xl border border-emerald-200/24 bg-[rgba(5,46,22,0.18)] px-3 py-2 text-xs text-emerald-100/88">
            {actionMessage}
          </div>
        ) : null}
        <div className="rounded-[18px] border border-cyan-200/12 bg-[rgba(13,30,50,0.52)] px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100">Stage focus</div>
          <div className="mt-1 text-xs leading-6 text-cyan-50/76">{stageFocusLine}</div>
          {contextSummaryChips.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {contextSummaryChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-cyan-200/12 bg-[rgba(18,181,208,0.1)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50"
                >
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100/80">Fast actions</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {stageActionStrip.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => sendStageAction(action.nextMode, action.prompt)}
                className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-xs font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
              >
                {action.label}
              </button>
            ))}
          </div>
          {!isMinimized ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {quickPrompts.slice(0, 4).map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void sendMessage(prompt)}
                  className="rounded-full border border-cyan-200/10 bg-[rgba(18,181,208,0.08)] px-3 py-1.5 text-xs font-medium text-cyan-50/88 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.14)]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {contextActionCards.length ? (
          <div className="rounded-[18px] border border-cyan-200/12 bg-[rgba(13,30,50,0.52)] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100">Live note context</div>
            <div className="mt-1 text-xs leading-6 text-cyan-50/74">
              Vera can act on the note state that is already in focus right now.
            </div>
            <div className="mt-3 space-y-2">
              {contextActionCards.map((card) => (
                <div key={card.id} className="rounded-[14px] border border-cyan-200/10 bg-[rgba(7,17,30,0.34)] px-3 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100/76">{card.label}</div>
                  <div className="mt-1 text-xs leading-6 text-cyan-50/78">{card.detail}</div>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => sendStageAction(card.nextMode, card.prompt)}
                      className="rounded-full border border-cyan-200/12 bg-[rgba(18,181,208,0.12)] px-3 py-1.5 text-xs font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.18)]"
                    >
                      {card.actionLabel}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {referencePolicyPreview ? (
          <div className="rounded-[18px] border border-cyan-200/12 bg-[rgba(13,30,50,0.52)] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100">Reference policy</div>
            <div className="mt-1 text-sm font-semibold text-white">{referencePolicyPreview.title}</div>
            <div className="mt-1 text-xs leading-6 text-cyan-50/76">{referencePolicyPreview.detail}</div>
            {referencePolicyPreview.categoryLabels.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {referencePolicyPreview.categoryLabels.map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-cyan-200/12 bg-[rgba(18,181,208,0.12)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50"
                  >
                    {label}
                  </span>
                ))}
              </div>
            ) : null}
            {referencePolicyPreview.domainLabels.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {referencePolicyPreview.domainLabels.map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.7)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50/86"
                  >
                    {label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 py-2">
        <ThreadView
          messages={messages}
          isLoading={isLoading}
          emptyStateTitle={emptyStateTitle}
          emptyStateDescription={emptyStateDescription}
          starterPrompts={quickPrompts.slice(0, 4)}
          onSelectStarter={(prompt) => void sendMessage(prompt)}
          activityTimeline={assistantActivityTimeline}
        />
      </div>

      {!isMinimized && showSuggestions && actions.length ? (
        <div className="aurora-soft-panel mb-3 shrink-0 rounded-[18px] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Suggestions</div>
              <div className="mt-1 text-[11px] text-cyan-50/68">
                Vera generated {actions.length} suggested action{actions.length === 1 ? '' : 's'} for this conversation.
              </div>
            </div>
          </div>
          <div className="mt-3 max-h-[220px] space-y-2 overflow-y-auto pr-1">
            {actions.map((action) => (
              <div key={`${action.type}-${action.label}`} className="rounded-[14px] border border-cyan-200/12 bg-[rgba(13,30,50,0.56)] px-3 py-3">
                {(() => {
                  const tool = getAssistantToolDefinition(action);
                  return (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-cyan-50">{action.label}</div>
                        <span className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50/80">
                          {getAssistantToolRiskLabel(tool.riskLevel)}
                        </span>
                        {action.type === 'apply-conservative-rewrite' ? (
                          <span className="rounded-full border border-sky-200/20 bg-[rgba(56,189,248,0.14)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-100">
                            {conservativeOptionLabel(action.optionTone)}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-[11px] text-cyan-50/58">{tool.summary}</div>
                    </>
                  );
                })()}
                <div className="mt-2 whitespace-pre-wrap text-xs leading-6 text-cyan-50/72">{action.instructions}</div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => void handleAction(action)}
                    className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium"
                  >
                    {action.type === 'send-beta-feedback'
                      ? 'Send to Beta Feedback'
                      : action.type === 'apply-note-revision'
                      ? 'Apply revision'
                      : stage === 'review'
                      ? 'Send to compose'
                      : 'Apply'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!isMinimized && showTools ? (
        <div className="aurora-soft-panel mb-3 shrink-0 rounded-[18px] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowQuickPrompts((current) => !current)}
              className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-xs font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
            >
              {showQuickPrompts ? 'Hide quick starts' : 'Quick starts'}
            </button>
            <button
              type="button"
              onClick={() => setShowScenarioQuestions((current) => !current)}
              className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-xs font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
            >
              {showScenarioQuestions ? 'Hide scenarios' : 'Scenarios'}
            </button>
            {currentCueCards.length ? (
              <button
                type="button"
                onClick={() => setShowCurrentCues((current) => !current)}
                className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-xs font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
              >
                {showCurrentCues ? 'Hide cues' : 'Vera cues'}
              </button>
            ) : null}
          </div>

          {(showQuickPrompts || showScenarioQuestions || showCurrentCues || stage === 'review' && rewritePreferenceSuggestion || profilePromptPreferenceSuggestion) ? (
            <div className="mt-4 max-h-[220px] space-y-4 overflow-y-auto pr-1">
              {showQuickPrompts ? (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Quick starts</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {quickPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void sendMessage(prompt)}
                        className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-xs font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {showScenarioQuestions ? (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Common provider scenarios</div>
                  <div className="mt-1 text-[11px] text-cyan-50/70">
                    Use these when you want a fast starting point.
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {scenarioQuestions.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void sendMessage(prompt)}
                        className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-left text-xs font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {stage === 'review' && rewritePreferenceSuggestion ? (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Preference insight</div>
                  <div className="mt-2 text-sm text-ink">
                    You have chosen the <span className="font-semibold">{conservativeOptionLabel(rewritePreferenceSuggestion.optionTone)}</span> rewrite style {rewritePreferenceSuggestion.count} times for <span className="font-semibold">{rewritePreferenceSuggestion.noteType}</span>.
                  </div>
                  <div className="mt-2 text-xs leading-6 text-muted">
                    Save it only if you want future drafts and review guidance for this note type to lean in that direction.
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleDraftRewritePreferenceSuggestion}
                      className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                    >
                      Draft preference suggestion
                    </button>
                    <button
                      type="button"
                      onClick={handleDismissRewritePreferenceSuggestion}
                      className="rounded-xl border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-4 py-2 text-sm font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : null}

              {profilePromptPreferenceSuggestion ? (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Vera profile insight</div>
                  <div className="mt-2 text-sm text-ink">
                    Vera has noticed a repeated provider pattern for <span className="font-semibold">{context.providerProfileName || 'this profile'}</span>: <span className="font-semibold">{profilePromptPreferenceSuggestion.label}</span>.
                  </div>
                  <div className="mt-2 text-xs leading-6 text-muted">
                    This has shown up across {profilePromptPreferenceSuggestion.noteTypes.length} note types. If that feels right, Vera can draft it as a broader reusable preference instead of leaving it as a one-off habit.
                  </div>
                  <div className="mt-2 text-xs text-cyan-50/70">
                    Seen in: {profilePromptPreferenceSuggestion.noteTypes.join(' • ')}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleDraftProfilePattern}
                      className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-medium"
                    >
                      Draft from profile pattern
                    </button>
                    <button
                      type="button"
                      onClick={handleDismissProfilePattern}
                      className="rounded-xl border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-4 py-2 text-sm font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : null}

              {showCurrentCues && currentCueCards.length ? (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Current Vera cues</div>
                  {weeklyTheme ? (
                    <div className="mt-2 rounded-[14px] border border-cyan-200/12 bg-[rgba(13,30,50,0.56)] px-3 py-2 text-xs leading-6 text-cyan-50/72">
                      {weeklyTheme}
                    </div>
                  ) : null}
                  <div className="mt-2 space-y-2 text-sm text-ink">
                    {currentCueCards.map((card, index) => (
                      <div key={card.id} className="rounded-[14px] border border-cyan-200/12 bg-[rgba(13,30,50,0.56)] px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium text-cyan-50">{card.title}</div>
                          {index === 0 && card.usageCount > 0 ? (
                            <span className="rounded-full border border-cyan-200/20 bg-[rgba(18,181,208,0.16)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50">
                              Most useful to you
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-cyan-50/72">
                          {card.description}
                        </div>
                        {index === 0 ? (
                          <div className="mt-2 text-xs leading-6 text-cyan-50/72">
                            Why this matters now: {card.whyNow}
                          </div>
                        ) : null}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={card.onDraft}
                            className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium"
                          >
                            {card.actionLabel}
                          </button>
                          {card.usageCount > 0 ? (
                            <span className="text-[11px] text-cyan-50/70">
                              Used from Vera {card.usageCount} time{card.usageCount === 1 ? '' : 's'}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                  {assistantActivityTimeline.length ? (
                    <div className="mt-3 rounded-[14px] border border-cyan-200/12 bg-[rgba(13,30,50,0.56)] px-3 py-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Assistant activity timeline</div>
                      <div className="mt-2 space-y-2">
                        {assistantActivityTimeline.map((item) => (
                          <div key={item.id} className="text-xs text-cyan-50/72">
                            <span className="font-semibold text-cyan-50">{item.label}:</span> {item.detail}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-3 text-xs text-cyan-50/62">
              Open recommendations if you want ideas for what Vera can help with.
            </div>
          )}
        </div>
      ) : null}

      {!isMinimized ? (
        <div className="shrink-0 border-t border-cyan-200/10 pt-2">
          <div className="aurora-soft-panel rounded-[18px] p-3">
            <Composer disabled={isLoading} placeholder={composerPlaceholder} onSend={sendMessage} />
          </div>
        </div>
      ) : (
        <div className="aurora-soft-panel rounded-[18px] p-4">
          <div className="flex items-center justify-between gap-3 text-sm text-cyan-50/74">
            <div>Vera is minimized. Expand when you want the full thread and composer.</div>
            {onToggleMinimized ? (
              <button
                type="button"
                onClick={onToggleMinimized}
                className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium"
              >
                Expand Vera
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

```

### thread-view.tsx
```tsx
'use client';

import { useEffect, useRef } from 'react';
import type { AssistantMessage } from '@/types/assistant';

type ThreadViewProps = {
  messages: AssistantMessage[];
  isLoading: boolean;
  emptyStateTitle: string;
  emptyStateDescription: string;
  starterPrompts: string[];
  onSelectStarter: (prompt: string) => void;
  activityTimeline: Array<{
    id: string;
    label: string;
    detail: string;
  }>;
};

export function ThreadView({
  messages,
  isLoading,
  emptyStateTitle,
  emptyStateDescription,
  starterPrompts,
  onSelectStarter,
  activityTimeline,
}: ThreadViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      return;
    }

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const shouldAutoScroll = distanceFromBottom < 140 || messages.length < 2 || isLoading;

    if (shouldAutoScroll) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [isLoading, messages]);

  return (
    <div
      ref={containerRef}
      className="aurora-soft-panel flex h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain rounded-[18px] px-1.5 py-2.5 scroll-smooth"
    >
      {!messages.length && !isLoading ? (
        <div className="rounded-[22px] border border-cyan-200/12 bg-[linear-gradient(180deg,rgba(12,31,51,0.9),rgba(8,20,34,0.92))] px-4 py-4 text-cyan-50 shadow-[0_18px_42px_rgba(4,12,24,0.24)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/82">Session ready</div>
          <div className="mt-2 text-base font-semibold text-white">{emptyStateTitle}</div>
          <div className="mt-2 text-sm leading-6 text-cyan-50/76">{emptyStateDescription}</div>
          {starterPrompts.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onSelectStarter(prompt)}
                  className="rounded-full border border-cyan-200/12 bg-[rgba(18,181,208,0.12)] px-3 py-1.5 text-left text-xs font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.18)]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}
          {activityTimeline.length ? (
            <div className="mt-4 rounded-[16px] border border-cyan-200/10 bg-[rgba(13,30,50,0.56)] px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/76">Recent Vera activity</div>
              <div className="mt-2 space-y-2">
                {activityTimeline.map((item) => (
                  <div key={item.id} className="text-xs leading-5 text-cyan-50/72">
                    <span className="font-semibold text-cyan-50">{item.label}:</span> {item.detail}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex ${message.role === 'assistant' ? 'justify-start' : 'justify-end'}`}
        >
          <div
            className={`rounded-[18px] px-4 py-3 text-sm leading-6 ${
              message.role === 'assistant'
                ? 'w-full max-w-[min(100%,72rem)] border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] text-cyan-50'
                : 'max-w-[88%] border border-cyan-200/20 bg-[rgba(18,181,208,0.16)] text-cyan-50'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-75">
                {message.role === 'assistant' ? 'Vera' : 'You'}
              </div>
              {message.role === 'assistant' ? (
                <ConfidenceBadge message={message} />
              ) : null}
            </div>
            {message.role === 'assistant' && message.modeMeta ? (
              <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-cyan-100/62">
                {message.modeMeta.shortLabel} • {message.modeMeta.detail}
              </div>
            ) : null}
            {message.role === 'assistant' ? (
              <AssistantMessageBody message={message} />
            ) : (
              <div className="mt-1 whitespace-pre-wrap">{message.content}</div>
            )}
            {message.externalAnswerMeta ? (
              <div className="mt-3 rounded-[14px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] px-3 py-2 text-xs text-cyan-50/86">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-cyan-200/12 bg-[rgba(18,181,208,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50">
                    {message.externalAnswerMeta.label}
                  </span>
                </div>
                <div className="mt-1">{message.externalAnswerMeta.detail}</div>
              </div>
            ) : null}
            {message.references?.length ? (
              <div className="mt-3 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100/80">
                  {getReferenceHeading(message.references)}
                </div>
                <div className="flex flex-col gap-2 text-xs">
                  {message.references.map((reference) => (
                    reference.sourceType === 'internal' ? (
                      <div
                        key={reference.url}
                        className="rounded-[14px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] px-3 py-2 text-cyan-50/88"
                      >
                        {reference.label}
                      </div>
                    ) : (
                      <a
                        key={reference.url}
                        href={reference.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-[14px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] px-3 py-2 text-cyan-50 underline-offset-2 hover:text-white hover:underline"
                      >
                        {reference.label}
                      </a>
                    )
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ))}
      {isLoading ? (
        <div className="flex justify-start">
          <div className="w-full max-w-[min(100%,72rem)] rounded-[18px] border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-4 py-3 text-sm text-cyan-50/76">
            Vera is typing...
          </div>
        </div>
      ) : null}
      <div ref={endRef} />
    </div>
  );
}

function getReferenceHeading(references: AssistantMessage['references']) {
  const kinds = new Set((references || []).map((reference) => reference.sourceType || 'external'));

  if (kinds.size === 1 && kinds.has('internal')) {
    return 'Veranote references';
  }

  if (kinds.size === 1 && kinds.has('external')) {
    return 'External references';
  }

  return 'References';
}

function ConfidenceBadge({ message }: { message: AssistantMessage }) {
  const confidence = deriveConfidence(message);

  if (!confidence) {
    return null;
  }

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${confidence.className}`}>
      {confidence.label}
    </span>
  );
}

function AssistantMessageBody({ message }: { message: AssistantMessage }) {
  const structured = buildStructuredAssistantResponse(message);

  return (
    <div className="mt-2 space-y-3">
      {structured.alertLines.length ? (
        <ClinicalSection
          title="Contradiction / Risk"
          tone="alert"
          lines={structured.alertLines}
        />
      ) : null}
      {structured.interpretationLines.length ? (
        <ClinicalSection
          title="Clinical Interpretation"
          tone="default"
          lines={structured.interpretationLines}
        />
      ) : null}
      {structured.suggestedActions.length ? (
        <ClinicalSection
          title="Suggested Actions"
          tone="action"
          lines={structured.suggestedActions}
          forceBullets
        />
      ) : null}
      {structured.optionalImprovements.length ? (
        <ClinicalSection
          title="Optional Improvements"
          tone="secondary"
          lines={structured.optionalImprovements}
          forceBullets
        />
      ) : null}
      {!structured.alertLines.length
        && !structured.interpretationLines.length
        && !structured.suggestedActions.length
        && !structured.optionalImprovements.length ? (
          <div className="whitespace-pre-wrap leading-6 text-cyan-50/92">{message.content}</div>
        ) : null}
    </div>
  );
}

function ClinicalSection({
  title,
  tone,
  lines,
  forceBullets = false,
}: {
  title: string;
  tone: 'alert' | 'default' | 'action' | 'secondary';
  lines: string[];
  forceBullets?: boolean;
}) {
  const toneClassName = {
    alert: 'border-rose-300/22 bg-[rgba(94,21,38,0.34)]',
    default: 'border-cyan-200/10 bg-[rgba(7,17,30,0.34)]',
    action: 'border-cyan-200/12 bg-[rgba(10,27,45,0.5)]',
    secondary: 'border-slate-200/10 bg-[rgba(15,24,39,0.42)]',
  }[tone];

  return (
    <div className={`rounded-[14px] border px-3 py-3 ${toneClassName}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100/80">
        {title}
      </div>
      <div className="mt-2 space-y-2">
        {lines.map((line, lineIndex) => {
          const bulletMatch = line.match(/^[-*]\s+(.*)$/);
          const displayLine = bulletMatch?.[1] || line;

          if (forceBullets || bulletMatch) {
            return (
              <div key={`${title}-${lineIndex}`} className="flex gap-2 text-cyan-50/92">
                <span className="mt-[2px] text-cyan-100/70">•</span>
                <span className="leading-6">{displayLine}</span>
              </div>
            );
          }

          return (
            <div key={`${title}-${lineIndex}`} className="whitespace-pre-wrap leading-6 text-cyan-50/92">
              {displayLine}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function splitAssistantSections(content: string) {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const sections: Array<{ title?: string; lines: string[] }> = [];
  let current: { title?: string; lines: string[] } = { lines: [] };

  for (const line of lines) {
    const titleMatch = line.match(/^([A-Z][A-Za-z /&-]{2,40}):\s*(.*)$/);

    if (titleMatch) {
      if (current.lines.length || current.title) {
        sections.push(current);
      }

      current = {
        title: titleMatch[1],
        lines: titleMatch[2] ? [titleMatch[2]] : [],
      };
      continue;
    }

    current.lines.push(line);
  }

  if (current.lines.length || current.title) {
    sections.push(current);
  }

  return sections;
}

function buildStructuredAssistantResponse(message: AssistantMessage) {
  const sections = splitAssistantSections(message.content);
  const flattenedLines = sections.flatMap((section) => section.lines).filter(Boolean);

  const alertLines = flattenedLines.filter(isAlertLine);
  const interpretationLines = flattenedLines.filter((line) => !isAlertLine(line));
  const suggestedActions = (message.suggestions || []).slice(0, 4);
  const optionalImprovements = (message.suggestions || []).slice(4);

  return {
    alertLines,
    interpretationLines,
    suggestedActions,
    optionalImprovements,
  };
}

function isAlertLine(line: string) {
  return /\b(conflict|contradict|high-risk|high risk|risk information|denial and plan|plan or intent|must be preserved|without reconciliation)\b/i.test(line);
}

function deriveConfidence(message: AssistantMessage) {
  if (message.externalAnswerMeta?.level === 'direct-trusted-page') {
    return {
      label: 'High confidence',
      className: 'border-emerald-300/20 bg-[rgba(16,74,54,0.34)] text-emerald-100',
    };
  }

  if (message.externalAnswerMeta?.level === 'trusted-search-path') {
    return {
      label: 'Moderate confidence',
      className: 'border-amber-300/20 bg-[rgba(92,55,20,0.32)] text-amber-100',
    };
  }

  if (/\b(uncertain|insufficient|unclear|needs clarification|proposed based on available information|based on available information)\b/i.test(message.content)) {
    return {
      label: 'Uncertain - needs clarification',
      className: 'border-amber-300/20 bg-[rgba(92,55,20,0.32)] text-amber-100',
    };
  }

  if (/\b(conflict|contradict|must be preserved|without reconciliation)\b/i.test(message.content)) {
    return {
      label: 'Uncertain - needs clarification',
      className: 'border-rose-300/20 bg-[rgba(94,21,38,0.34)] text-rose-100',
    };
  }

  if (message.content.trim()) {
    return {
      label: 'Moderate confidence',
      className: 'border-cyan-200/16 bg-[rgba(12,46,66,0.34)] text-cyan-100',
    };
  }

  return null;
}

```

## 3. Response Structure Rendering

Exact rendered section structure now produced by `AssistantMessageBody` in `thread-view.tsx`:

```tsx
<div className="mt-2 space-y-3">
  {structured.alertLines.length ? (
    <ClinicalSection
      title="Contradiction / Risk"
      tone="alert"
      lines={structured.alertLines}
    />
  ) : null}
  {structured.interpretationLines.length ? (
    <ClinicalSection
      title="Clinical Interpretation"
      tone="default"
      lines={structured.interpretationLines}
    />
  ) : null}
  {structured.suggestedActions.length ? (
    <ClinicalSection
      title="Suggested Actions"
      tone="action"
      lines={structured.suggestedActions}
      forceBullets
    />
  ) : null}
  {structured.optionalImprovements.length ? (
    <ClinicalSection
      title="Optional Improvements"
      tone="secondary"
      lines={structured.optionalImprovements}
      forceBullets
    />
  ) : null}
</div>
```

Section titles displayed in UI:
- `CONTRADICTION / RISK`
- `CLINICAL INTERPRETATION`
- `SUGGESTED ACTIONS`
- `OPTIONAL IMPROVEMENTS`

## 4. Before vs After

### Before
- Assistant replies rendered as a single broad text block inside one message bubble.
- Suggestions appeared as a plain list appended under the message.
- Contradiction-heavy outputs were easy to miss because risk language blended into the rest of the explanation.
- Response width was narrower and more visually compressed, which created more line wrapping and more scrolling.

### After
- Assistant replies render as structured clinical-support cards.
- Contradiction/risk content is separated into its own highlighted section.
- Main reasoning is separated into a `Clinical Interpretation` section.
- Suggestions render as short actionable bullets under `Suggested Actions`.
- Overflow guidance can continue under `Optional Improvements`.
- Confidence/uncertainty is visible near the Vera label, making ambiguity faster to spot.
- Reading and scanning are improved because users can identify the alert, explanation, and actions independently.

## 5. Width / Layout Changes

Exact class changes in `thread-view.tsx`:

```tsx
<div
  ref={containerRef}
  className="aurora-soft-panel flex h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain rounded-[18px] px-1.5 py-2.5 scroll-smooth"
>
```

```tsx
message.role === 'assistant'
  ? 'w-full max-w-[min(100%,72rem)] border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] text-cyan-50'
  : 'max-w-[88%] border border-cyan-200/20 bg-[rgba(18,181,208,0.16)] text-cyan-50'
```

```tsx
<div className="w-full max-w-[min(100%,72rem)] rounded-[18px] border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-4 py-3 text-sm text-cyan-50/76">
  Vera is typing...
</div>
```

Exact panel spacing changes in `assistant-panel.tsx`:

```tsx
<div className="min-h-0 flex-1 py-2">
```

```tsx
<div className="shrink-0 border-t border-cyan-200/10 pt-2">
  <div className="aurora-soft-panel rounded-[18px] p-3">
    <Composer disabled={isLoading} placeholder={composerPlaceholder} onSend={sendMessage} />
  </div>
</div>
```

Confirmed:
- assistant responses are wider
- side padding is reduced
- horizontal compression is lower

## 6. Visual Hierarchy

Section header styling in `ClinicalSection`:

```tsx
<div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100/80">
  {title}
</div>
```

Spacing between sections:

```tsx
<div className="mt-2 space-y-3">
```

Background / border usage:

```tsx
const toneClassName = {
  alert: 'border-rose-300/22 bg-[rgba(94,21,38,0.34)]',
  default: 'border-cyan-200/10 bg-[rgba(7,17,30,0.34)]',
  action: 'border-cyan-200/12 bg-[rgba(10,27,45,0.5)]',
  secondary: 'border-slate-200/10 bg-[rgba(15,24,39,0.42)]',
}[tone];
```

Confirmed:
- no flashy UI added
- no distracting animations added
- the look stays clean and clinical
- risk content is emphasized with a subtle rose tone rather than a bright warning style

## 7. Scroll Behavior

Auto-scroll logic in `thread-view.tsx`:

```tsx
useEffect(() => {
  const container = containerRef.current;
  if (!container) {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    return;
  }

  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
  const shouldAutoScroll = distanceFromBottom < 140 || messages.length < 2 || isLoading;

  if (shouldAutoScroll) {
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    });
  }
}, [isLoading, messages]);
```

Overflow handling:

```tsx
className="aurora-soft-panel flex h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain rounded-[18px] px-1.5 py-2.5 scroll-smooth"
```

Confirmed:
- latest response auto-scrolls into view when the user is already near the bottom
- smooth scrolling is enabled
- `overscroll-contain` reduces awkward stack/overscroll behavior
- messages do not force excessive vertical stacking through narrow widths the way they did before

## 8. Input Cleanup

Updated placeholder builder in `assistant-panel.tsx`:

```tsx
function buildComposerPlaceholder(stage: AssistantStage, context: AssistantApiContext) {
  if (stage === 'review' && context.topHighRiskWarningTitle) {
    return `Review "${context.topHighRiskWarningTitle}", this section, conservative rewrites, or what to verify before export...`;
  }

  if (context.focusedSectionHeading) {
    return `${context.focusedSectionHeading}, source support, note preferences, or workflow help...`;
  }

  if (stage === 'compose') {
    return 'Source organization, note setup, presets, or how to shape this lane before generating...';
  }

  return 'This warning, this section, note preferences, privacy, or workflow help...';
}
```

Confirmed:
- duplicate `Ask Vera...` phrasing was removed from the input guidance
- placeholder remains
- no extra instruction banner was added above the input

## 9. Example Rendered Response

Example input:

```text
Patient denies SI but later says she has a plan
```

Example assistant payload shape already supported by the UI:

```ts
{
  role: 'assistant',
  content: 'There is conflicting suicide-risk information in the source. Both denial and plan or intent are present and must be preserved without reconciliation.',
  suggestions: [
    'Document both denial and plan explicitly.',
    'Avoid collapsing this into a single risk statement.',
    'Clarify timing and current intent if possible.'
  ]
}
```

Rendered UI shape:

```text
Vera   Uncertain - needs clarification

[CONTRADICTION / RISK]
There is conflicting suicide-risk information in the source.
Both denial and plan or intent are present and must be preserved without reconciliation.

[CLINICAL INTERPRETATION]
There is conflicting suicide-risk information in the source. Both denial and plan or intent are present and must be preserved without reconciliation.

[SUGGESTED ACTIONS]
• Document both denial and plan explicitly.
• Avoid collapsing this into a single risk statement.
• Clarify timing and current intent if possible.
```

## 10. Safety Confirmation

Confirmed:
- no backend logic changed
- no assistant API schema changed
- no prompt assembly changed
- no PHI-handling logic changed
- UI changes affect rendering only in:
  - `assistant-panel.tsx`
  - `thread-view.tsx`

Build verification:

```text
✓ Compiled successfully
Finished TypeScript
```

## 11. Known Gaps

- `Clinical Interpretation` currently reuses the main assistant content lines, so contradiction-only responses can still duplicate some wording across the alert and interpretation sections.
- Confidence is inferred from existing metadata/text instead of coming from an explicit backend confidence field.
- `Optional Improvements` only appears when there are more than four suggestions; there is not yet a distinct backend flag for “primary” vs “secondary” suggestions.
- The assistant panel still has a dense upper control area; the reply body is much clearer, but the overall panel could still be simplified in a later pass.
- No dedicated mobile-specific refinement was added for section card density beyond the width and padding changes.
