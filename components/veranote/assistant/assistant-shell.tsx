'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AssistantPanel } from '@/components/veranote/assistant/assistant-panel';
import { ASSISTANT_ACTION_EVENT, ASSISTANT_CONTEXT_EVENT, ASSISTANT_PENDING_ACTION_KEY, type AssistantContextSnapshot } from '@/lib/veranote/assistant-context';
import { assembleAssistantApiContext, resolveAssistantStageForPathname } from '@/lib/veranote/assistant-context-assembly';
import { ASSISTANT_ENABLED } from '@/lib/veranote/assistant-mode';
import type { AssistantApiContext, AssistantStage } from '@/types/assistant';

export function AssistantShell() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [context, setContext] = useState<AssistantApiContext & { stage?: AssistantStage }>({});

  const routeStage = useMemo(() => resolveAssistantStageForPathname(pathname), [pathname]);
  const stage = context.stage || routeStage;

  useEffect(() => {
    setContext({});
  }, [pathname]);

  useEffect(() => {
    function handleContextEvent(event: Event) {
      const nextEvent = event as CustomEvent<AssistantContextSnapshot>;
      setContext(assembleAssistantApiContext(nextEvent.detail));
    }

    window.addEventListener(ASSISTANT_CONTEXT_EVENT, handleContextEvent);
    return () => window.removeEventListener(ASSISTANT_CONTEXT_EVENT, handleContextEvent);
  }, []);

  useEffect(() => {
    function handleAssistantAction(event: Event) {
      const nextEvent = event as CustomEvent<{
        type: 'replace-preferences' | 'append-preferences' | 'create-preset-draft' | 'jump-to-source-evidence' | 'run-review-rewrite' | 'apply-conservative-rewrite' | 'apply-note-revision';
        instructions: string;
        presetName?: string;
        rewriteMode?: 'more-concise' | 'more-formal' | 'closer-to-source' | 'regenerate-full-note';
        originalText?: string;
        replacementText?: string;
        revisionText?: string;
        targetSectionHeading?: string;
      }>;

      if (
        nextEvent.detail.type === 'jump-to-source-evidence'
        || nextEvent.detail.type === 'run-review-rewrite'
        || nextEvent.detail.type === 'apply-conservative-rewrite'
        || nextEvent.detail.type === 'apply-note-revision'
      ) {
        return;
      }

      if (stage !== 'review') {
        return;
      }

      localStorage.setItem(ASSISTANT_PENDING_ACTION_KEY, JSON.stringify(nextEvent.detail));
      router.push('/#workspace');
    }

    window.addEventListener(ASSISTANT_ACTION_EVENT, handleAssistantAction);
    return () => window.removeEventListener(ASSISTANT_ACTION_EVENT, handleAssistantAction);
  }, [router, stage]);

  if (!ASSISTANT_ENABLED || !stage) {
    return null;
  }

  function toggleOpen() {
    setIsOpen((current) => {
      const next = !current;
      console.info('[veranote-assistant] panel-toggle', { pathname, open: next });
      return next;
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={toggleOpen}
        className="fixed bottom-6 right-6 z-40 rounded-full border border-cyan-200/20 bg-[rgba(4,12,24,0.92)] px-5 py-3 text-sm font-semibold text-cyan-50 shadow-[0_20px_50px_rgba(4,12,24,0.42)] backdrop-blur-xl transition hover:border-cyan-200/30 hover:bg-[rgba(18,181,208,0.18)]"
      >
        {isOpen ? 'Close Vera' : 'Open Vera'}
      </button>

      {isOpen ? (
        <div className="fixed bottom-24 right-6 z-40 h-[min(780px,calc(100vh-7rem))] w-[min(520px,calc(100vw-2rem))]">
          <div className="aurora-panel flex h-full flex-col rounded-[30px] p-5 shadow-[0_28px_90px_rgba(4,12,24,0.48)]">
            <AssistantPanel stage={stage} context={context} />
          </div>
        </div>
      ) : null}
    </>
  );
}
