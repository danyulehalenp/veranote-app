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
import { getCurrentProviderId, getVeraCueUsageStorageKey } from '@/lib/veranote/provider-identity';
import { veraInteractionStyleLabel, veraProactivityLabel } from '@/lib/veranote/vera-relationship';
import { assistantMemoryService } from '@/lib/veranote/assistant-memory-service';
import type { AssistantAction, AssistantApiContext, AssistantMessage, AssistantMode, AssistantResponsePayload, AssistantStage, AssistantThreadTurn } from '@/types/assistant';

type AssistantPanelProps = {
  stage: AssistantStage;
  context: AssistantApiContext;
};

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

function readCueUsageCounts() {
  if (typeof window === 'undefined') {
    return {} as Record<string, number>;
  }

  try {
    const raw = window.localStorage.getItem(getVeraCueUsageStorageKey(getCurrentProviderId()));
    if (!raw) {
      return {} as Record<string, number>;
    }

    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {} as Record<string, number>;
  }
}

function writeCueUsageCounts(counts: Record<string, number>) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(getVeraCueUsageStorageKey(getCurrentProviderId()), JSON.stringify(counts));
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

function shortVeraGreetingName(address?: string) {
  if (!address?.trim()) {
    return null;
  }

  const cleaned = address.replace(/,.*$/, '').trim();

  if (!cleaned) {
    return null;
  }

  if (cleaned.startsWith('Dr. ')) {
    return cleaned;
  }

  return cleaned.split(/\s+/)[0] || cleaned;
}

function buildGreetingLine(address?: string) {
  const shortName = shortVeraGreetingName(address);
  return shortName ? `Hi, ${shortName}. How can I help you today?` : 'Hi. How can I help you today?';
}

export function AssistantPanel({ stage, context }: AssistantPanelProps) {
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
  }), [context.noteType, context.providerProfileId, learningHydratedAt]);
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
    setMode('workflow-help');
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
    if (stage !== 'review') {
      setRewritePreferenceSuggestion(null);
      return;
    }

    setRewritePreferenceSuggestion(assistantMemoryService.getRewriteSuggestion(context.noteType));
  }, [context.noteType, learningHydratedAt, stage]);

  useEffect(() => {
    setProfilePromptPreferenceSuggestion(assistantMemoryService.getProfilePromptSuggestion(context.providerProfileId));
  }, [context.providerProfileId, context.noteType, learningHydratedAt]);

  useEffect(() => {
    let isMounted = true;

    async function hydrateLearning() {
      try {
        await assistantMemoryService.hydrateLearning();
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
  }, [context.providerProfileId, context.noteType]);

  useEffect(() => {
    setCueUsageCounts(readCueUsageCounts());
  }, []);

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
              providerId: getCurrentProviderId(),
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

        const data = await response.json() as { error?: string };

        if (!response.ok) {
          throw new Error(data.error || 'Unable to save Vera gap feedback right now.');
        }

        setActionMessage('Vera gap saved to Beta Feedback so this missing skill can be reviewed and added.');
        setActions((current) => current.filter((item) => item !== action));
      } catch (error) {
        setActionMessage(error instanceof Error ? error.message : 'Unable to save Vera gap feedback right now.');
      }
      return;
    }

    if (action.type === 'apply-conservative-rewrite' && context.noteType) {
      assistantMemoryService.recordRewriteSelection(context.noteType, action.optionTone);
      setRewritePreferenceSuggestion(assistantMemoryService.getRewriteSuggestion(context.noteType));
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

    assistantMemoryService.dismissRewriteSuggestion(rewritePreferenceSuggestion.noteType, rewritePreferenceSuggestion.optionTone);
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

    assistantMemoryService.dismissProfilePromptSuggestion(context.providerProfileId, profilePromptPreferenceSuggestion.key);
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
    writeCueUsageCounts(nextCounts);
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
  const greetingName = shortVeraGreetingName(context.providerAddressingName);
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
  const hasToolsContent = Boolean(
    quickPrompts.length
    || scenarioQuestions.length
    || stage === 'review' && rewritePreferenceSuggestion
    || profilePromptPreferenceSuggestion
    || currentCueCards.length,
  );
  const modeDefinitions = listAssistantModeDefinitions();
  const activeModeDefinition = getAssistantModeDefinition(mode);

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
          <ContextPill stage={stage} />
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
        </div>

        {actionMessage ? (
          <div className="rounded-xl border border-emerald-200/24 bg-[rgba(5,46,22,0.18)] px-3 py-2 text-xs text-emerald-100/88">
            {actionMessage}
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

      <div className="min-h-0 flex-1 py-3">
        <ThreadView
          messages={messages}
          isLoading={isLoading}
          emptyTitle={buildGreetingLine(context.providerAddressingName)}
        />
      </div>

      {showSuggestions && actions.length ? (
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

      {showTools ? (
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

      <div className="shrink-0 border-t border-cyan-200/10 pt-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Ask Vera directly</div>
        <div className="mb-3 text-[11px] text-cyan-50/72">
          Ask your question or comment here. Vera replies directly above so the conversation stays in one visible flow.
        </div>
        <div className="aurora-soft-panel rounded-[18px] p-4">
          <Composer disabled={isLoading} onSend={sendMessage} />
        </div>
      </div>
    </div>
  );
}
