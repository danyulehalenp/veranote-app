'use client';

import { useEffect, useRef } from 'react';
import type { AssistantMessage } from '@/types/assistant';

type ThreadViewProps = {
  messages: AssistantMessage[];
  isLoading: boolean;
  emptyTitle?: string;
  emptyDetail?: string;
};

export function ThreadView({ messages, isLoading, emptyTitle, emptyDetail }: ThreadViewProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [isLoading, messages]);

  return (
    <div className="aurora-soft-panel flex h-full min-h-0 flex-col gap-3 overflow-y-auto rounded-[18px] p-3 pr-2">
      {!messages.length && !isLoading ? (
        <div className="rounded-[18px] border border-cyan-200/12 bg-[rgba(13,30,50,0.56)] px-4 py-4 text-sm text-ink">
          <div className="font-medium text-cyan-50">{emptyTitle || 'Ask Vera anything.'}</div>
          {emptyDetail ? (
            <div className="mt-1 text-xs leading-6 text-cyan-50/72">
              {emptyDetail}
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
            className={`max-w-[88%] rounded-[18px] px-4 py-3 text-sm leading-6 ${
              message.role === 'assistant'
                ? 'border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] text-cyan-50'
                : 'border border-cyan-200/20 bg-[rgba(18,181,208,0.16)] text-cyan-50'
            }`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-75">
              {message.role === 'assistant' ? 'Vera' : 'You'}
            </div>
            {message.role === 'assistant' && message.modeMeta ? (
              <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-cyan-100/62">
                {message.modeMeta.shortLabel} • {message.modeMeta.detail}
              </div>
            ) : null}
            <div className="mt-1 whitespace-pre-wrap">{message.content}</div>
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
            {message.suggestions?.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs opacity-90">
                {message.suggestions.map((suggestion) => (
                  <li key={suggestion}>{suggestion}</li>
                ))}
              </ul>
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
          <div className="max-w-[88%] rounded-[18px] border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-4 py-3 text-sm text-cyan-50/76">
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
