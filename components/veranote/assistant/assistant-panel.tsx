'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { Composer } from '@/components/veranote/assistant/composer';
import { AssistantPersonaAvatar } from '@/components/veranote/assistant/assistant-persona-avatar';
import { ContextPill } from '@/components/veranote/assistant/context-pill';
import { ThreadView } from '@/components/veranote/assistant/thread-view';
import { InlineFeedbackControl } from '@/components/veranote/feedback/inline-feedback-control';
import { getAssistantModeDefinition, listAssistantModeDefinitions } from '@/lib/veranote/assistant-mode';
import { getAssistantToolDefinition, getAssistantToolRiskLabel } from '@/lib/veranote/assistant-tool-registry';
import { describeAssistantReferencePolicy } from '@/lib/veranote/assistant-source-policy';
import { publishAssistantAction } from '@/lib/veranote/assistant-context';
import type { NoteSectionKey, OutputScope } from '@/lib/note/section-profiles';
import { buildLanePreferencePrompt } from '@/lib/veranote/preference-draft';
import { DEFAULT_PROVIDER_IDENTITY_ID } from '@/lib/constants/provider-identities';
import { resolveAssistantPersona } from '@/lib/veranote/assistant-persona';
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
  onClose?: () => void;
  onResetLayout?: () => void;
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
  answerMode?: AssistantMessage['answerMode'],
  builderFamily?: AssistantMessage['builderFamily'],
): AssistantMessage {
  return {
    id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    suggestions,
    references,
    externalAnswerMeta,
    modeMeta,
    answerMode,
    builderFamily,
  };
}

function inferFeedbackWorkflowArea(message: AssistantMessage) {
  if (message.content.includes('provider-review switching framework')) {
    return 'switching_framework' as const;
  }

  if (message.answerMode === 'medication_reference_answer') {
    return 'medication_reference' as const;
  }

  return 'vera_assistant' as const;
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

function buildEmptyStateTitle(stage: AssistantStage, mode: AssistantMode, assistantName: string) {
  if (mode === 'prompt-builder') {
    return stage === 'review' ? 'Turn review habits into reusable preferences' : 'Shape reusable lane preferences before you generate';
  }

  if (mode === 'reference-lookup') {
    return 'Look up documentation terms and coding references';
  }

  return stage === 'review'
    ? `Use ${assistantName} to tighten this draft without drifting from source`
    : `Use ${assistantName} to set up the lane and organize source material`;
}

function buildEmptyStateDescription(stage: AssistantStage, mode: AssistantMode, assistantName: string) {
  if (mode === 'prompt-builder') {
    return stage === 'review'
      ? `Ask ${assistantName} to capture recurring review edits so future drafts lean closer to the way you actually revise.`
      : `Ask ${assistantName} to translate your workflow into note-lane preferences, presets, or reusable setup patterns.`;
  }

  if (mode === 'reference-lookup') {
    return `${assistantName} can explain note sections, documentation language, and approved reference lookups without leaving your current workflow.`;
  }

  return stage === 'review'
    ? `Start with a warning, a risky sentence, or a missing detail and ${assistantName} will help you correct it conservatively.`
    : `Start with a note type, a source-organizing question, or a workflow problem and ${assistantName} will help you set up the next step.`;
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

function buildWorkflowStageItems(stage: AssistantStage, context: AssistantApiContext, hasConversation: boolean, hasActions: boolean) {
  const inReview = stage === 'review';

  return [
    {
      id: 'source-intake',
      label: 'Source intake',
      detail: context.noteType ? `${context.noteType} is open.` : 'Provider workspace is open.',
      status: inReview || hasConversation ? 'complete' : 'active',
    },
    {
      id: 'draft-shaping',
      label: 'Draft shaping',
      detail: context.focusedSectionHeading ? `Focused on ${context.focusedSectionHeading}.` : 'Lane and source guidance stay close.',
      status: inReview ? 'complete' : hasConversation ? 'active' : 'upcoming',
    },
    {
      id: 'review',
      label: 'Review',
      detail: inReview
        ? (context.topHighRiskWarningTitle ? `Watching ${context.topHighRiskWarningTitle}.` : 'Reviewing wording and source fit.')
        : 'Review opens after the draft takes shape.',
      status: inReview ? 'active' : 'upcoming',
    },
    {
      id: 'finish',
      label: 'Finish',
      detail: hasActions ? 'Assistant actions are available near the composer.' : 'Copy and export happen after review confidence is higher.',
      status: inReview && hasConversation ? 'active' : 'upcoming',
    },
  ] as const;
}

function getStageStatusClassName(status: 'complete' | 'active' | 'upcoming') {
  if (status === 'complete') {
    return 'border-emerald-200/24 bg-[rgba(22,101,52,0.22)] text-emerald-100';
  }

  if (status === 'active') {
    return 'border-cyan-200/24 bg-[rgba(18,181,208,0.14)] text-cyan-50';
  }

  return 'border-cyan-200/10 bg-[rgba(13,30,50,0.62)] text-cyan-50/68';
}

function buildActionPresentation(
  action: AssistantAction,
  stage: AssistantStage,
  context: AssistantApiContext,
  assistantName: string,
) {
  if (action.type === 'apply-conservative-rewrite' || action.type === 'run-review-rewrite') {
    return {
      lane: 'Fix now',
      rationale: context.topHighRiskWarningTitle
        ? 'Current wording likely needs a more conservative pass before finishing.'
        : 'This wording likely reads stronger or cleaner than the source currently supports.',
    };
  }

  if (action.type === 'apply-note-revision') {
    return {
      lane: 'Fix now',
      rationale: context.focusedSectionHeading
        ? `This is a direct wording change for ${context.focusedSectionHeading}.`
        : 'This is a direct wording fix you can review immediately.',
    };
  }

  if (action.type === 'jump-to-source-evidence') {
    return {
      lane: 'Check source',
      rationale: 'Use this when you want to verify support before trusting the current wording.',
    };
  }

  if (action.type === 'create-preset-draft' || action.type === 'append-preferences' || action.type === 'replace-preferences') {
    return {
      lane: 'Save as preference',
      rationale: stage === 'review'
        ? 'This pattern is repeating enough in review that it should become reusable.'
        : 'This workflow choice is repeating enough to preserve as a reusable default.',
    };
  }

  return {
    lane: `Teach ${assistantName}`,
    rationale: `Use this when ${assistantName} needs to learn a missing capability instead of leaving the gap hidden.`,
  };
}

export const AssistantPanel = memo(function AssistantPanel({
  stage,
  context,
  isMinimized = false,
  onToggleMinimized,
  onClose,
  onResetLayout,
}: AssistantPanelProps) {
  const resolvedProviderIdentityId = context.providerIdentityId || DEFAULT_PROVIDER_IDENTITY_ID;
  const assistantPersona = useMemo(() => resolveAssistantPersona(context), [context]);
  const assistantName = assistantPersona.name;
  const assistantRole = assistantPersona.role || 'Clinical Assistant';
  const [learningHydratedAt, setLearningHydratedAt] = useState(0);
  const [mode, setMode] = useState<AssistantMode>('workflow-help');
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [actions, setActions] = useState<AssistantAction[]>([]);
  const [actionMessage, setActionMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showFollowupIdeas, setShowFollowupIdeas] = useState(false);
  const [showSecondaryControls, setShowSecondaryControls] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showContextDetails, setShowContextDetails] = useState(false);
  const [showReferencePolicyPanel, setShowReferencePolicyPanel] = useState(false);
  const [showMemoryCenter, setShowMemoryCenter] = useState(false);
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);
  const [showScenarioQuestions, setShowScenarioQuestions] = useState(false);
  const [showCurrentCues, setShowCurrentCues] = useState(false);
  const [editingMemoryKey, setEditingMemoryKey] = useState<string | null>(null);
  const [editingMemoryValue, setEditingMemoryValue] = useState('');
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

    return `This week ${assistantName} is mostly seeing ${themes.slice(0, 2).join(' and ')}${themes.length > 2 ? ' across your workflow.' : '.'}`;
  }, [activeNoteTypeInsight, assistantName, profilePromptPreferenceSuggestion, rewritePreferenceSuggestion]);

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
    setShowSecondaryControls(false);
    setShowTools(false);
    setShowContextDetails(false);
    setShowReferencePolicyPanel(false);
    setShowMemoryCenter(false);
    setShowFollowupIdeas(false);
    setShowQuickPrompts(false);
    setShowScenarioQuestions(false);
    setShowCurrentCues(false);
    setEditingMemoryKey(null);
    setEditingMemoryValue('');
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
        // Keep local provider-scoped Atlas memory available if server hydration fails.
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
        answerMode: item.answerMode,
        builderFamily: item.builderFamily,
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
    setShowFollowupIdeas(false);
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
        createMessage(
          'assistant',
          data.message,
          data.suggestions,
          data.references,
          data.externalAnswerMeta,
          data.modeMeta,
          data.answerMode,
          data.builderFamily,
        ),
      ]);
      setActions(data.actions || []);
      setShowSuggestions(false);
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
          throw new Error(data.error || `Unable to save ${assistantName} gap feedback right now.`);
        }

        if (data.notification?.delivered && data.notification.recipient) {
          setActionMessage(`${assistantName} gap saved and emailed to ${data.notification.recipient} so this missing skill can be reviewed and added.`);
        } else {
          setActionMessage(`${assistantName} gap saved to Beta Feedback so this missing skill can be reviewed and added.`);
        }
        setActions((current) => current.filter((item) => item !== action));
      } catch (error) {
        setActionMessage(error instanceof Error ? error.message : `Unable to save ${assistantName} gap feedback right now.`);
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
        ? `${assistantName} jumped to the source evidence area for this review context.`
        : action.type === 'run-review-rewrite'
        ? `${assistantName} started the ${action.rewriteMode.replace(/-/g, ' ')} rewrite for this review draft.`
        : action.type === 'apply-conservative-rewrite'
        ? `${assistantName} applied a focused conservative rewrite. Please review the sentence before final use.`
        : action.type === 'apply-note-revision'
        ? `${assistantName} applied the requested revision${action.targetSectionHeading ? ` in ${action.targetSectionHeading}` : ''}. Please review it before final use.`
        : action.type === 'create-preset-draft'
        ? `Preset draft sent to the current note lane as ${action.presetName}.`
        : `${assistantName} preference suggestion sent into the current note lane.`,
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

  function startEditingMemory(key: string, value: string) {
    setEditingMemoryKey(key);
    setEditingMemoryValue(value);
  }

  function cancelEditingMemory() {
    setEditingMemoryKey(null);
    setEditingMemoryValue('');
  }

  function saveEditedMemory() {
    if (!editingMemoryKey || !editingMemoryValue.trim()) {
      return;
    }

    assistantMemoryService.updateRememberedFact(editingMemoryKey, editingMemoryValue.trim(), resolvedProviderIdentityId);
    setLearningHydratedAt(Date.now());
    setActionMessage(`Updated what ${assistantName} remembers for this provider workspace.`);
    cancelEditingMemory();
  }

  function removeMemoryFact(key: string) {
    const removed = assistantMemoryService.removeRememberedFact(key, resolvedProviderIdentityId);
    if (!removed) {
      return;
    }

    setLearningHydratedAt(Date.now());
    setActionMessage(`Removed that remembered workflow note from ${assistantName}.`);
    if (editingMemoryKey === key) {
      cancelEditingMemory();
    }
  }

  const currentCueCards = useMemo(() => {
    const cards: VeraCueCard[] = [];

    if (profilePromptPreferenceSuggestion) {
      cards.push({
        id: `profile:${profilePromptPreferenceSuggestion.key}`,
        title: 'Profile pattern is active',
        description: `${assistantName} is seeing ${profilePromptPreferenceSuggestion.label} across ${profilePromptPreferenceSuggestion.noteTypes.length} note types.`,
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
        whyNow: `This matters now because your review behavior is showing a repeat safety style that ${assistantName} can help formalize instead of leaving it as a one-off correction pattern.`,
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
        description: `${assistantName} is seeing a repeated setup for this note lane: ${activeNoteTypeInsight.laneSuggestion.outputScope.replace(/-/g, ' ')} scope, ${activeNoteTypeInsight.laneSuggestion.outputStyle} style, ${activeNoteTypeInsight.laneSuggestion.format} format.`,
        whyNow: `This matters now because the same structure keeps showing up when you work in this note lane, which usually means ${assistantName} should help preserve that setup for you.`,
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
        description: `${assistantName} is seeing this note-lane prompt pattern repeat: ${activeNoteTypeInsight.promptSuggestion.label}.`,
        whyNow: `This matters now because the same prompt shaping pattern is repeating enough that ${assistantName} can turn it into something reusable and easier to maintain.`,
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
  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find((item) => item.role === 'assistant') || null,
    [messages],
  );
  const latestAssistantSuggestions = useMemo(
    () => (latestAssistantMessage?.suggestions || [])
      .map((suggestion) => suggestion.trim())
      .filter(Boolean)
      .slice(0, 4),
    [latestAssistantMessage],
  );
  const referencePolicyPreview = useMemo(
    () => mode === 'reference-lookup' ? describeAssistantReferencePolicy(activeReferenceQuery) : null,
    [activeReferenceQuery, mode],
  );
  useEffect(() => {
    setShowFollowupIdeas(false);
  }, [latestAssistantMessage?.id, latestAssistantSuggestions.length]);

  const isReviewMode = stage === 'review';
  const compactContextLine = [
    context.noteType ? `Note: ${context.noteType}` : null,
    stage === 'review' && context.topHighRiskWarningTitle ? `Warning: ${context.topHighRiskWarningTitle}` : null,
    context.outputDestination ? context.outputDestination : null,
  ].filter(Boolean).join(' • ');
  const stageFocusLine = stage === 'review'
    ? 'Review mode is prioritizing contradictions, risk cues, and the next safest action.'
    : 'Compose mode is prioritizing note setup, source organization, and reusable workflow support.';
  const hasToolsContent = Boolean(
    quickPrompts.length
    || scenarioQuestions.length
    || stage === 'review' && rewritePreferenceSuggestion
    || profilePromptPreferenceSuggestion
    || currentCueCards.length,
  );
  const modeDefinitions = listAssistantModeDefinitions();
  const activeModeDefinition = getAssistantModeDefinition(mode);
  const emptyStateTitle = buildEmptyStateTitle(stage, mode, assistantName);
  const emptyStateDescription = buildEmptyStateDescription(stage, mode, assistantName);
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
        detail: context.focusedSectionSentence || `${assistantName} can help tighten this section without drifting from source.`,
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
  const minimalContextChips = [
    context.noteType ? context.noteType : null,
    context.focusedSectionHeading ? context.focusedSectionHeading : null,
    isReviewMode && context.topHighRiskWarningTitle ? context.topHighRiskWarningTitle : null,
    context.outputDestination && context.outputDestination !== 'Generic' ? context.outputDestination : null,
  ].filter(Boolean);
  const primaryStripText = isReviewMode
    ? context.topHighRiskWarningTitle
      ? `Review focus: ${context.topHighRiskWarningTitle}`
      : 'Review mode is focused on the current clinical analysis.'
    : compactContextLine || stageFocusLine;
  const workflowStageItems = useMemo(
    () => buildWorkflowStageItems(stage, context, messages.length > 0, actions.length > 0),
    [actions.length, context, messages.length, stage],
  );
  const visibleMemoryHighlights = useMemo(() => {
    const highlights: Array<{ id: string; label: string; detail: string }> = [];

    if (activeNoteTypeInsight?.laneSuggestion) {
      highlights.push({
        id: 'lane',
        label: 'Usual lane setup',
        detail: `${activeNoteTypeInsight.noteType}: ${activeNoteTypeInsight.laneSuggestion.outputScope.replace(/-/g, ' ')} scope with ${activeNoteTypeInsight.laneSuggestion.outputStyle}.`,
      });
    }

    if (rewritePreferenceSuggestion) {
      highlights.push({
        id: 'rewrite',
        label: 'Rewrite tendency',
        detail: `${conservativeOptionLabel(rewritePreferenceSuggestion.optionTone)} is your repeated review style for ${rewritePreferenceSuggestion.noteType}.`,
      });
    }

    if (profilePromptPreferenceSuggestion) {
      highlights.push({
        id: 'profile-pattern',
        label: 'Provider pattern',
        detail: profilePromptPreferenceSuggestion.label,
      });
    }

    if (activeNoteTypeInsight?.promptSuggestion) {
      highlights.push({
        id: 'prompt',
        label: 'Prompt habit',
        detail: activeNoteTypeInsight.promptSuggestion.label,
      });
    }

    return highlights.slice(0, 4);
  }, [activeNoteTypeInsight, profilePromptPreferenceSuggestion, rewritePreferenceSuggestion]);
  const rememberedFacts = useMemo(
    () => assistantMemoryService.getRememberedFacts(resolvedProviderIdentityId).slice(0, 6),
    [learningHydratedAt, resolvedProviderIdentityId],
  );
  const returnStateSummary = useMemo(() => {
    if (messages.length) {
      return {
        title: 'Continuing this thread',
        detail: `${assistantName} is holding ${messages.length} recent turn${messages.length === 1 ? '' : 's'} in view for this ${stage} session.`,
      };
    }

    if (visibleMemoryHighlights.length) {
      return {
        title: 'Continuing your usual workflow',
        detail: `${assistantName} is resuming from learned provider patterns instead of starting from zero.`,
      };
    }

    return {
      title: 'Fresh session, same workspace',
      detail: 'The thread is empty, but stage context and provider preferences are still available.',
    };
  }, [messages.length, stage, visibleMemoryHighlights.length]);

  function clearConversation() {
    setMessages([]);
    setActions([]);
    setActionMessage('');
    setShowSuggestions(false);
    setShowFollowupIdeas(false);
  }

  function openReplyViewForMessage() {
    if (isMinimized && onToggleMinimized) {
      onToggleMinimized();
    }
  }

  async function handleComposerSend(message: string) {
    openReplyViewForMessage();
    await sendMessage(message);
  }

  function sendStageAction(nextMode: AssistantMode, prompt: string) {
    openReplyViewForMessage();
    setMode(nextMode);
    void sendMessage(prompt);
  }

  function renderAvailableActions() {
    return actions.map((action) => (
      <div key={`${action.type}-${action.label}`} className="rounded-[14px] border border-cyan-200/12 bg-[rgba(13,30,50,0.56)] px-3 py-3">
        {(() => {
          const tool = getAssistantToolDefinition(action);
          const presentation = buildActionPresentation(action, stage, context, assistantName);
          return (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-cyan-200/14 bg-[rgba(18,181,208,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50">
                  {presentation.lane}
                </span>
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
              <div className="mt-2 rounded-[12px] border border-cyan-200/10 bg-[rgba(7,17,30,0.28)] px-2.5 py-2 text-[11px] leading-5 text-cyan-50/72">
                Why this matters: {presentation.rationale}
              </div>
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
    ));
  }

  function renderAssistantOptionsBlock() {
    if (!latestAssistantSuggestions.length && !actions.length) {
      return null;
    }

    return (
      <div className="shrink-0 border-b border-cyan-200/10 bg-[rgba(5,14,25,0.72)] px-2.5 py-2.5">
        <div className="rounded-[16px] border border-cyan-200/10 bg-[rgba(8,20,34,0.62)] px-3 py-2.5 shadow-[0_10px_26px_rgba(4,12,24,0.12)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/70">Optional follow-ups</div>
              <div className="mt-0.5 text-[11px] leading-5 text-cyan-50/58">
                Hidden by default so the chat stays readable.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {latestAssistantSuggestions.length ? (
                <button
                  type="button"
                  onClick={() => setShowFollowupIdeas((current) => !current)}
                  className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-[11px] font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
                >
                  {showFollowupIdeas ? 'Hide follow-ups' : `Follow-ups (${latestAssistantSuggestions.length})`}
                </button>
              ) : null}
              {actions.length ? (
                <button
                  type="button"
                  onClick={() => setShowSuggestions((current) => !current)}
                  className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-[11px] font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
                >
                  {showSuggestions ? 'Hide actions' : `Actions (${actions.length})`}
                </button>
              ) : null}
            </div>
          </div>
          {showFollowupIdeas && latestAssistantSuggestions.length ? (
            <div className="mt-2 flex max-h-[92px] flex-wrap gap-2 overflow-y-auto pr-1">
              {latestAssistantSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={isLoading}
                  onClick={() => void sendMessage(suggestion)}
                  className="rounded-full border border-cyan-200/12 bg-[rgba(18,181,208,0.11)] px-3 py-1.5 text-left text-xs font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.17)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
          {showSuggestions && actions.length ? (
            <div className="mt-3 max-h-[210px] space-y-2 overflow-y-auto pr-1">
              {renderAvailableActions()}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (isMinimized) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div data-assistant-drag-handle="true" className="flex touch-none select-none flex-wrap items-center justify-between gap-2 border-b border-cyan-200/10 pb-3">
          <div>
            <div className="flex items-center gap-3">
              <AssistantPersonaAvatar avatar={assistantPersona.avatar} label={assistantName} size="sm" />
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/68">{assistantName}</div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-cyan-100/54">{assistantRole} • Verified by Veranote</div>
              </div>
            </div>
            <div className="mt-2 text-sm text-cyan-50/76">
              Compact mode stays ready for a quick question without taking over the workspace.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {onResetLayout ? (
              <button
                type="button"
                onClick={onResetLayout}
                className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-[11px] font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
              >
                Reset position
              </button>
            ) : null}
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-[11px] font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
              >
                Close
              </button>
            ) : null}
            {onToggleMinimized ? (
              <button
                type="button"
                onClick={onToggleMinimized}
                className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-[11px] font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
              >
                Expand
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 rounded-[16px] border border-cyan-200/10 bg-[rgba(8,20,34,0.56)] px-3 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/68">Current context</div>
          <div className="mt-1 text-xs leading-5 text-cyan-50/74">
            {primaryStripText}
          </div>
        </div>

        <div className="mt-3 rounded-[16px] border border-cyan-200/10 bg-[rgba(8,20,34,0.56)] px-3 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/68">Quick ask</div>
          <div className="mt-1 text-xs leading-5 text-cyan-50/64">
            Sending a question opens the full reply view so the answer stays visible.
          </div>
          <div className="mt-2">
            <Composer disabled={isLoading} placeholder={composerPlaceholder} onSend={handleComposerSend} compact />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div data-assistant-drag-handle="true" className="shrink-0 touch-none select-none space-y-2 border-b border-cyan-200/10 pb-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-cyan-200/12 bg-[rgba(18,181,208,0.1)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50">
                {isReviewMode ? 'Current context' : activeModeDefinition.label}
              </span>
              {!isReviewMode ? <ContextPill stage={stage} /> : null}
              {minimalContextChips.slice(0, isReviewMode ? 2 : 3).map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-cyan-200/10 bg-[rgba(13,30,50,0.72)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50/82"
                >
                  {chip}
                </span>
              ))}
            </div>
            <div className={`mt-1 text-xs leading-5 ${isReviewMode ? 'text-rose-100/82' : 'text-cyan-50/72'}`}>
              {primaryStripText}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {onResetLayout ? (
              <button
                type="button"
                onClick={onResetLayout}
                className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-[11px] font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
              >
                Reset position
              </button>
            ) : null}
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-[11px] font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
              >
                Close
              </button>
            ) : null}
            {onToggleMinimized ? (
              <button
                type="button"
                onClick={onToggleMinimized}
                className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-[11px] font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
              >
                {isMinimized ? 'Expand' : 'Minimize'}
              </button>
            ) : null}
            {(hasToolsContent || contextActionCards.length || referencePolicyPreview || !isReviewMode) ? (
              <button
                type="button"
                onClick={() => setShowSecondaryControls((current) => !current)}
                className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-[11px] font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
              >
                {showSecondaryControls ? 'Hide controls' : 'Controls'}
              </button>
            ) : null}
          </div>
        </div>

        {!isReviewMode && showSecondaryControls ? (
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
          </div>
        ) : null}

        {actionMessage ? (
          <div className="rounded-xl border border-emerald-200/24 bg-[rgba(5,46,22,0.18)] px-3 py-2 text-xs text-emerald-100/88">
            {actionMessage}
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden py-2">
        <div
          data-testid="assistant-conversation-box"
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-cyan-200/12 bg-[linear-gradient(180deg,rgba(6,15,27,0.9),rgba(4,12,24,0.94))] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]"
        >
          {renderAssistantOptionsBlock()}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 pr-1">
          <div className="flex min-h-full flex-col gap-3">
            <div className="min-h-[320px] flex-1">
              <ThreadView
                stage={stage}
                messages={messages}
                isLoading={isLoading}
                emptyStateTitle={emptyStateTitle}
                emptyStateDescription={emptyStateDescription}
                starterPrompts={quickPrompts.slice(0, 4)}
                onSelectStarter={(prompt) => void sendMessage(prompt)}
                activityTimeline={assistantActivityTimeline}
                focusedSectionHeading={context.focusedSectionHeading}
                assistantName={assistantName}
                assistantRole={assistantRole}
                assistantAvatar={assistantPersona.avatar}
                renderAssistantFeedback={(message, isLatestAssistant) => {
                  if (!isLatestAssistant) {
                    return null;
                  }

                  const latestProviderQuestion = [...messages].reverse().find((item) => item.role === 'provider')?.content;

                  return (
                    <InlineFeedbackControl
                      pageContext={`${assistantName} assistant • ${stage} • ${context.noteType || 'Unknown note type'}`}
                      workflowArea={inferFeedbackWorkflowArea(message)}
                      noteType={context.noteType}
                      answerMode={message.answerMode}
                      builderFamily={message.builderFamily}
                      routeTaken={message.modeMeta?.mode || `assistant-${stage}`}
                      promptSummary={latestProviderQuestion}
                      responseSummary={message.content}
                      providerId={resolvedProviderIdentityId}
                      providerProfileId={context.providerProfileId}
                      providerProfileName={context.providerProfileName}
                      providerAddressingName={context.providerAddressingName}
                      stage={stage}
                      assistantName={assistantName}
                    />
                  );
                }}
              />
            </div>

            {showSecondaryControls ? (
              <div className="grid gap-2">
                <div className="rounded-[16px] border border-cyan-200/10 bg-[rgba(10,24,40,0.56)] px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/68">Workflow state</div>
                    <div className="text-[11px] text-cyan-50/58">{returnStateSummary.title}</div>
                  </div>
                  <div className="mt-1 text-xs leading-5 text-cyan-50/72">{returnStateSummary.detail}</div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {workflowStageItems.map((item, index) => (
                      <div
                        key={item.id}
                        className={`rounded-[14px] border px-3 py-2 ${getStageStatusClassName(item.status)}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.12em]">
                            Step {index + 1}
                          </div>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.12em]">
                            {item.status}
                          </div>
                        </div>
                        <div className="mt-1 text-sm font-semibold">{item.label}</div>
                        <div className="mt-1 text-[11px] leading-5 opacity-80">{item.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[16px] border border-cyan-200/10 bg-[rgba(8,20,34,0.56)] px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/68">What {assistantName} remembers</div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setShowMemoryCenter((current) => !current)}
                        className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
                      >
                        {showMemoryCenter ? 'Hide editor' : 'Memory center'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMode('prompt-builder');
                          void sendMessage('What do you remember about my workflow, and what should I update or save as a reusable preference?');
                        }}
                        className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
                      >
                        Review memory
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-[14px] border border-cyan-200/10 bg-[rgba(13,30,50,0.54)] px-3 py-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100/68">Workflow patterns</div>
                      <div className="mt-1 text-sm font-semibold text-cyan-50">{visibleMemoryHighlights.length}</div>
                      <div className="mt-1 text-[11px] leading-5 text-cyan-50/64">Reusable habits {assistantName} is actively using right now.</div>
                    </div>
                    <div className="rounded-[14px] border border-cyan-200/10 bg-[rgba(13,30,50,0.54)] px-3 py-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100/68">Direct memory notes</div>
                      <div className="mt-1 text-sm font-semibold text-cyan-50">{rememberedFacts.length}</div>
                      <div className="mt-1 text-[11px] leading-5 text-cyan-50/64">Explicit things you taught {assistantName} about your workflow.</div>
                    </div>
                    <div className="rounded-[14px] border border-cyan-200/10 bg-[rgba(13,30,50,0.54)] px-3 py-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100/68">Current continuity</div>
                      <div className="mt-1 text-sm font-semibold text-cyan-50">{context.noteType || (isReviewMode ? 'Review session' : 'Compose session')}</div>
                      <div className="mt-1 text-[11px] leading-5 text-cyan-50/64">The note lane and current context {assistantName} is carrying forward.</div>
                    </div>
                  </div>
                  {visibleMemoryHighlights.length ? (
                    <div className="mt-3 grid gap-2">
                      {visibleMemoryHighlights.map((item) => (
                        <div key={item.id} className="rounded-[14px] border border-cyan-200/10 bg-[rgba(13,30,50,0.54)] px-3 py-2.5">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100/72">{item.label}</div>
                          <div className="mt-1 text-xs leading-5 text-cyan-50/78">{item.detail}</div>
                        </div>
                      ))}
                      <div className="rounded-[14px] border border-cyan-200/10 bg-[rgba(7,17,30,0.28)] px-3 py-2.5 text-xs leading-5 text-cyan-50/66">
                        {visibleMemoryHighlights.length === 1
                          ? `That is the strongest learned pattern ${assistantName} has for this workflow right now. As more repeat habits show up, additional memory items will appear here.`
                          : `These are the main learned patterns ${assistantName} is using right now. Open Memory center if you want to edit direct remembered notes.`}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs leading-5 text-cyan-50/68">
                      {assistantName} has not learned a strong provider pattern here yet. As you work, repeated note habits and review tendencies will show up in this panel.
                    </div>
                  )}
                  {showMemoryCenter ? (
                    <div className="mt-3 rounded-[14px] border border-cyan-200/10 bg-[rgba(13,30,50,0.54)] px-3 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100/72">Editable memory notes</div>
                        <div className="text-[11px] text-cyan-50/56">Update or remove what {assistantName} keeps about your workflow.</div>
                      </div>
                      {rememberedFacts.length ? (
                        <div className="mt-3 space-y-2">
                          {rememberedFacts.map((fact) => (
                            <div key={fact.key} className="rounded-[12px] border border-cyan-200/10 bg-[rgba(7,17,30,0.28)] px-3 py-3">
                              {editingMemoryKey === fact.key ? (
                                <div className="space-y-2">
                                  <textarea
                                    value={editingMemoryValue}
                                    onChange={(event) => setEditingMemoryValue(event.target.value)}
                                    className="workspace-control min-h-[88px] w-full rounded-[14px] px-3 py-2 text-sm leading-6"
                                  />
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={saveEditedMemory}
                                      className="rounded-full border border-cyan-200/14 bg-[rgba(18,181,208,0.16)] px-3 py-1.5 text-xs font-medium text-cyan-50"
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelEditingMemory}
                                      className="rounded-full border border-cyan-200/10 bg-[rgba(13,30,50,0.68)] px-3 py-1.5 text-xs font-medium text-cyan-50/78"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="min-w-0">
                                    <div className="text-sm leading-6 text-cyan-50/84">{fact.fact}</div>
                                    <div className="mt-1 text-[11px] text-cyan-50/54">
                                      Seen {fact.count} time{fact.count === 1 ? '' : 's'}{fact.lastSeenAt ? ` • last updated ${formatCueRecency(fact.lastSeenAt)}` : ''}
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => startEditingMemory(fact.key, fact.fact)}
                                      className="rounded-full border border-cyan-200/10 bg-[rgba(13,30,50,0.68)] px-3 py-1 text-[11px] font-medium text-cyan-50/80"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => removeMemoryFact(fact.key)}
                                      className="rounded-full border border-rose-200/16 bg-[rgba(127,29,29,0.22)] px-3 py-1 text-[11px] font-medium text-rose-100"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-3 text-xs leading-5 text-cyan-50/66">
                          No direct conversational memory notes are saved yet. Use “remember that...” with {assistantName} to teach it something explicit about your workflow.
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {showSecondaryControls ? (
              <>
                <div className="aurora-soft-panel rounded-[18px] p-3 sm:p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Workspace controls</div>
                  <div className="mt-1 text-[11px] leading-5 text-cyan-50/66">{stageFocusLine}</div>
                  {contextSummaryChips.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {contextSummaryChips.map((chip) => (
                        <span
                          key={chip}
                          className="rounded-full border border-cyan-200/10 bg-[rgba(13,30,50,0.74)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50/84"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  ) : null}
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
                  {hasToolsContent ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowTools((current) => !current)}
                        className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-xs font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
                      >
                        {showTools ? 'Hide recommendations' : 'Recommendations'}
                      </button>
                    </div>
                  ) : null}
                </div>

                {contextActionCards.length ? (
                  <div className="rounded-[18px] border border-cyan-200/12 bg-[rgba(13,30,50,0.52)] px-3 py-3 sm:px-4">
                    <button
                      type="button"
                      onClick={() => setShowContextDetails((current) => !current)}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100">Live note context</div>
                        <div className="mt-1 text-xs leading-6 text-cyan-50/74">
                          Current note context {assistantName} can use right now.
                        </div>
                      </div>
                      <span className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50/80">
                        {showContextDetails ? 'Hide' : 'Expand'}
                      </span>
                    </button>
                    {showContextDetails ? (
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
                    ) : null}
                  </div>
                ) : null}

                {referencePolicyPreview ? (
                  <div className="rounded-[18px] border border-cyan-200/12 bg-[rgba(13,30,50,0.52)] px-3 py-3 sm:px-4">
                    <button
                      type="button"
                      onClick={() => setShowReferencePolicyPanel((current) => !current)}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100">Reference policy</div>
                        <div className="mt-1 text-xs leading-6 text-cyan-50/74">
                          How {assistantName} is using references in this reply.
                        </div>
                      </div>
                      <span className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50/80">
                        {showReferencePolicyPanel ? 'Hide' : 'Expand'}
                      </span>
                    </button>
                    {showReferencePolicyPanel ? (
                      <div className="mt-3">
                        <div className="text-sm font-semibold text-white">{referencePolicyPreview.title}</div>
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
                ) : null}

                {showTools ? (
                  <div className="aurora-soft-panel rounded-[18px] p-3 sm:p-4">
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
                          {showCurrentCues ? 'Hide cues' : `${assistantName} cues`}
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
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{assistantName} profile insight</div>
                            <div className="mt-2 text-sm text-ink">
                              {assistantName} has noticed a repeated provider pattern for <span className="font-semibold">{context.providerProfileName || 'this profile'}</span>: <span className="font-semibold">{profilePromptPreferenceSuggestion.label}</span>.
                            </div>
                            <div className="mt-2 text-xs leading-6 text-muted">
                              This has shown up across {profilePromptPreferenceSuggestion.noteTypes.length} note types. If that feels right, {assistantName} can draft it as a broader reusable preference instead of leaving it as a one-off habit.
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
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Current {assistantName} cues</div>
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
                                        Used from {assistantName} {card.usageCount} time{card.usageCount === 1 ? '' : 's'}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {assistantActivityTimeline.length ? (
                              <div className="mt-3 rounded-[14px] border border-cyan-200/12 bg-[rgba(13,30,50,0.56)] px-3 py-3">
                                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{assistantName} activity timeline</div>
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
                        Open recommendations only when you want a faster starting point.
                      </div>
                    )}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 border-t border-cyan-200/10 bg-[rgba(5,14,25,0.86)] px-2.5 py-2.5">
          <Composer disabled={isLoading} placeholder={composerPlaceholder} onSend={handleComposerSend} compact />
        </div>
      </div>
      </div>
    </div>
  );
});
