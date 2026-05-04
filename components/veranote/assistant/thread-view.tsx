'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { AssistantPersonaAvatar } from '@/components/veranote/assistant/assistant-persona-avatar';
import type { AssistantAvatarId } from '@/lib/veranote/assistant-persona';
import type { AssistantMessage, AssistantStage } from '@/types/assistant';

type ThreadViewProps = {
  stage: AssistantStage;
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
  focusedSectionHeading?: string;
  renderAssistantFeedback?: (message: AssistantMessage, isLatestAssistant: boolean) => ReactNode;
  assistantName?: string;
  assistantRole?: string;
  assistantAvatar?: AssistantAvatarId;
};

export function ThreadView({
  stage,
  messages,
  isLoading,
  emptyStateTitle,
  emptyStateDescription,
  starterPrompts,
  onSelectStarter,
  activityTimeline,
  focusedSectionHeading,
  renderAssistantFeedback,
  assistantName = 'Assistant',
  assistantRole = 'Clinical Assistant',
  assistantAvatar = 'clinical-orbit',
}: ThreadViewProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  const latestAssistantMessageId = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant')?.id || null,
    [messages],
  );
  const visibleMessages = messages;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [isLoading, messages]);

  return (
    <div
      className="flex min-h-full flex-col gap-3 px-1 py-1.5 sm:px-2"
    >
      {!messages.length && !isLoading ? (
        <div className="rounded-[20px] border border-cyan-200/10 bg-[linear-gradient(180deg,rgba(12,27,45,0.84),rgba(8,19,33,0.88))] px-3.5 py-3.5 text-cyan-50 shadow-[0_16px_36px_rgba(4,12,24,0.18)]">
          <div className="flex items-center gap-3">
            <AssistantPersonaAvatar avatar={assistantAvatar} label={assistantName} size="sm" />
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">{assistantName}</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-cyan-100/52">
                {assistantRole || 'Clinical Assistant'} • Verified by Veranote
              </div>
            </div>
          </div>
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
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/70">Recent context</div>
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
      {visibleMessages.map((message) => {
        const isLatestAssistant = message.role === 'assistant' && message.id === latestAssistantMessageId;
        const isOlderAssistant = message.role === 'assistant' && !isLatestAssistant;
        const messageWrapperClassName = `flex py-2 ${message.role === 'assistant' ? 'justify-start' : 'justify-end'} ${isOlderAssistant ? 'opacity-72' : ''}`;
        const messageCardClassName = message.role === 'assistant'
          ? `w-full max-w-[min(100%,78rem)] rounded-[16px] border px-3 py-2.5 text-sm leading-6 text-cyan-50 sm:px-3.5 ${
            isLatestAssistant
              ? 'border-cyan-300/14 bg-[rgba(7,17,30,0.88)] shadow-[0_18px_34px_rgba(4,12,24,0.16)]'
              : 'border-cyan-200/8 bg-[rgba(8,18,31,0.7)] shadow-[0_10px_18px_rgba(4,12,24,0.08)]'
          }`
          : 'max-w-[92%] rounded-[16px] border border-cyan-200/12 bg-[rgba(18,181,208,0.1)] px-3 py-2.5 text-sm leading-6 text-cyan-50/86 sm:max-w-[82%] sm:px-3.5 lg:max-w-[74%]';

        return (
          <div
            key={message.id}
            className={messageWrapperClassName}
            data-testid={message.role === 'assistant' ? 'assistant-message' : 'assistant-provider-message'}
            data-assistant-message-id={message.id}
            data-assistant-message-latest={message.role === 'assistant' && isLatestAssistant ? 'true' : undefined}
          >
            <div className={messageCardClassName}>
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-75">
                  {message.role === 'assistant'
                    ? isLatestAssistant
                      ? assistantName
                      : 'Earlier note'
                    : 'You'}
                </div>
                {message.role === 'assistant' ? <ConfidenceBadge message={message} /> : null}
                {message.role === 'assistant' && isLatestAssistant ? (
                  <span className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.52)] px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em] text-cyan-50/84">
                    Verified by Veranote
                  </span>
                ) : null}
              </div>
              {message.role === 'assistant' && message.modeMeta && isLatestAssistant ? (
                <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-cyan-100/54">
                  {message.modeMeta.shortLabel}
                </div>
              ) : null}
              {message.role === 'assistant' ? (
                <AssistantMessageBody
                  message={message}
                  stage={stage}
                  focusedSectionHeading={focusedSectionHeading}
                />
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
              {message.role === 'assistant' && renderAssistantFeedback ? renderAssistantFeedback(message, isLatestAssistant) : null}
            </div>
          </div>
        );
      })}
      {isLoading ? (
        <div className="flex justify-start">
          <div className="w-full max-w-[min(100%,78rem)] rounded-[16px] border border-cyan-200/10 bg-[rgba(9,20,35,0.78)] px-3 py-2.5 text-sm text-cyan-50/72 shadow-[0_14px_24px_rgba(4,12,24,0.12)] sm:px-3.5">
            <div className="text-sm font-medium text-cyan-50/88">{assistantName} is reviewing this with you.</div>
            <div className="mt-1 text-xs text-cyan-100/62">Checking source support, wording strength, and what matters most next.</div>
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
    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.04em] ${confidence.className}`}>
      {confidence.label}
    </span>
  );
}

function AssistantMessageBody({
  message,
  stage,
  focusedSectionHeading,
}: {
  message: AssistantMessage;
  stage: AssistantStage;
  focusedSectionHeading?: string;
}) {
  const sections = splitAssistantSections(message.content);
  const displaySections = sections.length
    ? sections
    : [{ title: undefined, lines: message.content.split('\n').map((line) => line.trim()).filter(Boolean) }];
  const hasStageContext = stage === 'review' && focusedSectionHeading;

  return (
    <div className="mt-2">
      <div
        className="rounded-[16px] border border-cyan-200/10 bg-[rgba(11,24,40,0.62)] px-3 py-3 shadow-[0_12px_26px_rgba(4,12,24,0.12)]"
        data-testid="assistant-message-body"
      >
        <div className="space-y-2.5">
          {displaySections.map((section, sectionIndex) => (
            <div
              key={`${section.title || 'body'}-${sectionIndex}`}
              className={getSectionToneClassName(section.title)}
            >
              {section.title ? (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/74">
                    {section.title}
                  </div>
                  <span className={getSectionEvidencePillClassName(section.title)}>
                    {getSectionEvidenceLabel(section.title)}
                  </span>
                </div>
              ) : null}
              <div className="space-y-2">
                {section.lines.map((line, lineIndex) => {
                  const bulletMatch = line.match(/^[-*]\s+(.*)$/);
                  const displayLine = bulletMatch?.[1] || line;

                  return bulletMatch ? (
                    <div key={`${sectionIndex}-${lineIndex}`} className="flex gap-2 text-cyan-50/92">
                      <span className="mt-[2px] text-cyan-100/60">•</span>
                      <span className="leading-5">{displayLine}</span>
                    </div>
                  ) : (
                    <div
                      key={`${sectionIndex}-${lineIndex}`}
                      className={`whitespace-pre-wrap leading-5 ${isRiskSection(section.title) ? 'text-[14px] text-rose-50/96' : 'text-cyan-50/92'}`}
                    >
                      {displayLine}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {message.suggestions?.length ? (
        <div className="mt-2 text-[11px] text-cyan-100/58">
          Quick options stay below so the conversation can stay readable.
        </div>
      ) : null}
      {hasStageContext ? (
        <div className="mt-2 text-[11px] text-cyan-100/50">
          Still working in {focusedSectionHeading}.
        </div>
      ) : null}
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

function deriveConfidence(message: AssistantMessage) {
  if (message.externalAnswerMeta?.level === 'direct-trusted-page') {
    return {
      label: 'Trusted reference',
      className: 'border-emerald-300/20 bg-[rgba(16,74,54,0.34)] text-emerald-100',
    };
  }

  if (message.externalAnswerMeta?.level === 'trusted-search-path') {
    return {
      label: 'Supported lookup',
      className: 'border-amber-300/20 bg-[rgba(92,55,20,0.32)] text-amber-100',
    };
  }

  if (/\b(conflict|contradict|must be preserved|without reconciliation)\b/i.test(message.content)) {
    return {
      label: 'Needs verification',
      className: 'border-rose-300/20 bg-[rgba(94,21,38,0.34)] text-rose-100',
    };
  }

  if (/\b(uncertain|insufficient|unclear|needs clarification|proposed based on available information|based on available information)\b/i.test(message.content)) {
    return {
      label: 'Source unclear',
      className: 'border-amber-300/20 bg-[rgba(92,55,20,0.32)] text-amber-100',
    };
  }

  if (message.content.trim()) {
    return {
      label: 'Source-grounded',
      className: 'border-cyan-200/16 bg-[rgba(12,46,66,0.34)] text-cyan-100',
    };
  }

  return null;
}

function normalizeSectionTitle(title?: string) {
  return (title || '').trim().toLowerCase();
}

function isRiskSection(title?: string) {
  const normalized = normalizeSectionTitle(title);
  return normalized.includes('contradiction') || normalized.includes('risk');
}

function getSectionToneClassName(title?: string) {
  if (!title) {
    return 'space-y-2';
  }

  if (isRiskSection(title)) {
    return 'space-y-2 rounded-[14px] border-2 border-rose-300/34 bg-[rgba(98,24,39,0.26)] px-3 py-2.5 shadow-[0_14px_28px_rgba(58,13,25,0.18)]';
  }

  const normalized = normalizeSectionTitle(title);
  if (normalized.includes('suggested actions')) {
    return 'space-y-2 rounded-[14px] border border-cyan-200/12 bg-[rgba(10,27,45,0.48)] px-3 py-2.5';
  }

  if (normalized.includes('clinical interpretation')) {
    return 'space-y-2 rounded-[14px] border border-cyan-200/10 bg-[rgba(9,21,36,0.44)] px-3 py-2.5';
  }

  return 'space-y-2 rounded-[14px] border border-cyan-200/8 bg-[rgba(8,18,31,0.42)] px-3 py-2.5';
}

function getSectionEvidenceLabel(title?: string) {
  const normalized = normalizeSectionTitle(title);
  if (isRiskSection(title)) {
    return 'Why this needs care';
  }

  if (normalized.includes('suggested actions')) {
    return 'Next move';
  }

  if (normalized.includes('clinical interpretation')) {
    return 'Working read';
  }

  return 'Helpful frame';
}

function getSectionEvidencePillClassName(title?: string) {
  const normalized = normalizeSectionTitle(title);

  if (isRiskSection(title)) {
    return 'rounded-full border border-rose-300/28 bg-[rgba(123,27,48,0.32)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-50';
  }

  if (normalized.includes('suggested actions')) {
    return 'rounded-full border border-cyan-200/14 bg-[rgba(18,181,208,0.12)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50';
  }

  if (normalized.includes('clinical interpretation')) {
    return 'rounded-full border border-white/10 bg-[rgba(255,255,255,0.04)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50/78';
  }

  return 'rounded-full border border-white/10 bg-[rgba(255,255,255,0.04)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50/78';
}
