'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { AssistantPanel } from '@/components/veranote/assistant/assistant-panel';
import { ASSISTANT_ACTION_EVENT, ASSISTANT_CONTEXT_EVENT, type AssistantContextSnapshot } from '@/lib/veranote/assistant-context';
import { assembleAssistantApiContext, resolveAssistantStageForPathname } from '@/lib/veranote/assistant-context-assembly';
import { ASSISTANT_ENABLED } from '@/lib/veranote/assistant-mode';
import { getAssistantPendingActionStorageKey, getCurrentProviderId } from '@/lib/veranote/provider-identity';
import type { AssistantApiContext, AssistantStage } from '@/types/assistant';

const PANEL_SIZE_STORAGE_KEY = 'veranote-assistant-panel-size';
const PANEL_OPEN_STORAGE_KEY = 'veranote-assistant-panel-open';
const PANEL_MINIMIZED_STORAGE_KEY = 'veranote-assistant-panel-minimized';
const DEFAULT_PANEL_SIZE = {
  width: 560,
  height: 780,
};
const MIN_PANEL_SIZE = {
  width: 420,
  height: 520,
};

function clampPanelSize(width: number, height: number) {
  if (typeof window === 'undefined') {
    return {
      width: Math.max(MIN_PANEL_SIZE.width, width),
      height: Math.max(MIN_PANEL_SIZE.height, height),
    };
  }

  return {
    width: Math.min(Math.max(MIN_PANEL_SIZE.width, width), window.innerWidth - 32),
    height: Math.min(Math.max(MIN_PANEL_SIZE.height, height), window.innerHeight - 112),
  };
}

export function AssistantShell() {
  const pathname = usePathname();
  const router = useRouter();
  const { data } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [context, setContext] = useState<AssistantApiContext & { stage?: AssistantStage }>({});
  const [panelSize, setPanelSize] = useState(DEFAULT_PANEL_SIZE);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  const routeStage = useMemo(() => resolveAssistantStageForPathname(pathname), [pathname]);
  const stage = context.stage || routeStage;
  const sessionScopedContext = useMemo(() => ({
    ...context,
    providerAccountId: data?.user?.providerAccountId || context.providerAccountId,
    providerIdentityId: data?.user?.providerIdentityId || context.providerIdentityId,
  }), [context, data?.user?.providerAccountId, data?.user?.providerIdentityId]);
  const assistantPendingActionStorageKey = useMemo(
    () => getAssistantPendingActionStorageKey(data?.user?.providerIdentityId || context.providerIdentityId || getCurrentProviderId()),
    [context.providerIdentityId, data?.user?.providerIdentityId],
  );

  useEffect(() => {
    setContext({});
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const raw = window.localStorage.getItem(PANEL_SIZE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<typeof DEFAULT_PANEL_SIZE>;
        if (typeof parsed.width === 'number' && typeof parsed.height === 'number') {
          setPanelSize(clampPanelSize(parsed.width, parsed.height));
          return;
        }
      }
    } catch {
      // Ignore storage parsing issues and fall back to defaults.
    }

    setPanelSize(clampPanelSize(DEFAULT_PANEL_SIZE.width, DEFAULT_PANEL_SIZE.height));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      setIsOpen(window.localStorage.getItem(PANEL_OPEN_STORAGE_KEY) === 'true');
    } catch {
      // Ignore storage access issues and keep the panel closed by default.
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const storedValue = window.localStorage.getItem(PANEL_MINIMIZED_STORAGE_KEY);
      setIsMinimized(storedValue === null ? true : storedValue === 'true');
    } catch {
      // Ignore storage access issues and keep the panel minimized by default.
      setIsMinimized(true);
    }
  }, []);

  useEffect(() => {
    function handleWindowResize() {
      setPanelSize((current) => clampPanelSize(current.width, current.height));
      setIsCompactViewport(window.innerWidth < 768);
    }

    handleWindowResize();
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

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

      localStorage.setItem(assistantPendingActionStorageKey, JSON.stringify(nextEvent.detail));
      router.push('/#workspace');
    }

    window.addEventListener(ASSISTANT_ACTION_EVENT, handleAssistantAction);
    return () => window.removeEventListener(ASSISTANT_ACTION_EVENT, handleAssistantAction);
  }, [assistantPendingActionStorageKey, router, stage]);

  if (!ASSISTANT_ENABLED || !stage) {
    return null;
  }

  function toggleOpen() {
    setIsOpen((current) => {
      const next = !current;
      console.info('[veranote-assistant] panel-toggle', { pathname, open: next });
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(PANEL_OPEN_STORAGE_KEY, String(next));
        if (next) {
          setIsMinimized(true);
          window.localStorage.setItem(PANEL_MINIMIZED_STORAGE_KEY, 'true');
        }
      }
      return next;
    });
  }

  function toggleMinimized() {
    setIsMinimized((current) => {
      const next = !current;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(PANEL_MINIMIZED_STORAGE_KEY, String(next));
      }
      return next;
    });
  }

  function persistPanelSize(nextWidth: number, nextHeight: number) {
    if (typeof window === 'undefined') {
      return;
    }

    const nextSize = clampPanelSize(nextWidth, nextHeight);
    setPanelSize(nextSize);
    window.localStorage.setItem(PANEL_SIZE_STORAGE_KEY, JSON.stringify(nextSize));
  }

  function beginResize(direction: 'width' | 'height' | 'both') {
    return function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
      event.preventDefault();

      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = panelSize.width;
      const startHeight = panelSize.height;

      function handlePointerMove(moveEvent: PointerEvent) {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;
        const nextWidth = direction === 'height' ? startWidth : startWidth - deltaX;
        const nextHeight = direction === 'width' ? startHeight : startHeight - deltaY;
        setPanelSize(clampPanelSize(nextWidth, nextHeight));
      }

      function handlePointerUp(moveEvent: PointerEvent) {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;
        const nextWidth = direction === 'height' ? startWidth : startWidth - deltaX;
        const nextHeight = direction === 'width' ? startHeight : startHeight - deltaY;

        document.body.style.userSelect = '';
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        persistPanelSize(nextWidth, nextHeight);
      }

      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    };
  }

  return (
    <>
      {!isOpen ? (
        <button
          type="button"
          onClick={toggleOpen}
          className="fixed bottom-20 right-4 z-40 rounded-full border border-cyan-200/20 bg-[rgba(4,12,24,0.92)] px-4 py-3 text-sm font-semibold text-cyan-50 shadow-[0_20px_50px_rgba(4,12,24,0.42)] backdrop-blur-xl transition hover:border-cyan-200/30 hover:bg-[rgba(18,181,208,0.18)] sm:bottom-10 sm:right-6 sm:px-5"
        >
          Open Atlas
        </button>
      ) : null}

      {isOpen ? (
        <>
          <button
            type="button"
            aria-label="Close Atlas"
            onClick={toggleOpen}
            className="fixed inset-0 z-30 bg-[rgba(4,12,24,0.48)] backdrop-blur-[2px]"
          />
          <div
            className={`fixed z-40 ${isCompactViewport ? 'inset-x-3 bottom-20 top-3' : 'bottom-24 right-6'}`}
            style={isCompactViewport ? undefined : { width: `${panelSize.width}px`, height: isMinimized ? 'auto' : `${panelSize.height}px` }}
          >
            {!isCompactViewport && !isMinimized ? (
              <>
                <div className="absolute inset-y-5 left-0 z-10 w-3 cursor-ew-resize touch-none" onPointerDown={beginResize('width')} />
                <div className="absolute inset-x-5 top-0 z-10 h-3 cursor-ns-resize touch-none" onPointerDown={beginResize('height')} />
                <div className="absolute left-0 top-0 z-20 h-4 w-4 cursor-nwse-resize touch-none" onPointerDown={beginResize('both')} />
              </>
            ) : null}
            <div className={`aurora-panel flex flex-col overflow-hidden rounded-[30px] p-4 shadow-[0_28px_90px_rgba(4,12,24,0.48)] sm:p-5 ${isCompactViewport || !isMinimized ? 'h-full' : ''}`}>
              <AssistantPanel
                stage={stage}
                context={sessionScopedContext}
                isMinimized={isMinimized}
                onToggleMinimized={toggleMinimized}
                onClose={toggleOpen}
              />
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
