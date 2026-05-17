'use client';

import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { AssistantPersonaAvatar } from '@/components/veranote/assistant/assistant-persona-avatar';
import { AssistantPanel } from '@/components/veranote/assistant/assistant-panel';
import { ASSISTANT_ACTION_EVENT, ASSISTANT_CONTEXT_EVENT, type AssistantContextSnapshot } from '@/lib/veranote/assistant-context';
import { assembleAssistantApiContext, resolveAssistantStageForPathname } from '@/lib/veranote/assistant-context-assembly';
import {
  buildDefaultAssistantPanelLayout,
  clampAssistantPanelLayout,
  getRenderedAssistantPanelBounds,
  MINIMIZED_PANEL_LAYOUT,
  PANEL_LAYOUT_STORAGE_KEY,
  PANEL_MINIMIZED_STORAGE_KEY,
  PANEL_OPEN_STORAGE_KEY,
  PANEL_SIZE_STORAGE_KEY,
  parseStoredAssistantPanelLayout,
  snapAssistantPanelLayout,
  type AssistantPanelRenderedBounds,
  type AssistantPanelLayout,
  type AssistantViewport,
} from '@/lib/veranote/assistant-panel-layout';
import { resolveAssistantPersona } from '@/lib/veranote/assistant-persona';
import { ASSISTANT_ENABLED } from '@/lib/veranote/assistant-mode';
import { getAssistantPendingActionStorageKey, getCurrentProviderId } from '@/lib/veranote/provider-identity';
import {
  fetchProviderSettingsFromServer,
  readCachedProviderSettings,
  writeCachedProviderSettings,
} from '@/lib/veranote/provider-settings-client';
import type { AssistantApiContext, AssistantStage } from '@/types/assistant';

const ASSISTANT_OPEN_EVENT = 'veranote-assistant-open';
const DRAG_HANDLE_SELECTOR = '[data-assistant-drag-handle="true"]';
const INTERACTIVE_DRAG_EXCLUSIONS = 'button, input, textarea, select, a, summary, [role="button"], [data-no-drag="true"]';
const COMPACT_VIEWPORT_WIDTH = 768;
const DOCKED_VIEWPORT_WIDTH = 1180;

function getAssistantViewport(): AssistantViewport {
  if (typeof window === 'undefined') {
    return {
      width: 1440,
      height: 900,
    };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function layoutsMatch(a: AssistantPanelLayout, b: AssistantPanelLayout) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

type CommitLayoutOptions = {
  persist?: boolean;
  renderedBounds?: AssistantPanelRenderedBounds;
  snap?: boolean;
};

export function AssistantShell() {
  const pathname = usePathname();
  const router = useRouter();
  const { data } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [context, setContext] = useState<AssistantApiContext & { stage?: AssistantStage }>({});
  const [panelLayout, setPanelLayout] = useState<AssistantPanelLayout>(() => (
    buildDefaultAssistantPanelLayout({
      width: 1440,
      height: 900,
    })
  ));
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [providerPersonaContext, setProviderPersonaContext] = useState<Pick<AssistantApiContext, 'userAiName' | 'userAiRole' | 'userAiAvatar'>>({});

  const layoutRef = useRef(panelLayout);
  const suppressNextDockClickRef = useRef(false);
  const routeStage = useMemo(() => resolveAssistantStageForPathname(pathname), [pathname]);
  const stage = context.stage || routeStage;
  const resolvedProviderIdentityId = data?.user?.providerIdentityId || context.providerIdentityId || getCurrentProviderId();
  const sessionScopedContext = useMemo(() => ({
    ...context,
    providerAccountId: data?.user?.providerAccountId || context.providerAccountId,
    providerIdentityId: data?.user?.providerIdentityId || context.providerIdentityId,
  }), [context, data?.user?.providerAccountId, data?.user?.providerIdentityId]);
  const personaScopedContext = useMemo(() => ({
    ...sessionScopedContext,
    ...providerPersonaContext,
  }), [providerPersonaContext, sessionScopedContext]);
  const assistantPersona = useMemo(
    () => resolveAssistantPersona(personaScopedContext),
    [personaScopedContext],
  );
  const assistantPendingActionStorageKey = useMemo(
    () => getAssistantPendingActionStorageKey(resolvedProviderIdentityId),
    [resolvedProviderIdentityId],
  );

  useEffect(() => {
    layoutRef.current = panelLayout;
  }, [panelLayout]);

  const commitPanelLayout = useCallback((nextLayout: AssistantPanelLayout, options: CommitLayoutOptions = {}) => {
    const viewport = getAssistantViewport();
    const normalized = options.snap
      ? snapAssistantPanelLayout(nextLayout, viewport)
      : clampAssistantPanelLayout(nextLayout, viewport, options.renderedBounds);

    layoutRef.current = normalized;
    setPanelLayout((current) => layoutsMatch(current, normalized) ? current : normalized);

    if (options.persist === false || typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(normalized));
    window.localStorage.setItem(PANEL_SIZE_STORAGE_KEY, JSON.stringify({
      width: normalized.width,
      height: normalized.height,
    }));
  }, []);

  const resetPanelLayout = useCallback(() => {
    const nextLayout = buildDefaultAssistantPanelLayout(getAssistantViewport());
    commitPanelLayout(nextLayout, {
      persist: true,
    });
  }, [commitPanelLayout]);

  const closePanel = useCallback(() => {
    console.info('[veranote-assistant] panel-toggle', { pathname, open: false });
    setIsOpen(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PANEL_OPEN_STORAGE_KEY, 'false');
    }
  }, [pathname]);

  const expandPanel = useCallback(() => {
    setIsOpen(true);
    setIsMinimized(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PANEL_OPEN_STORAGE_KEY, 'true');
      window.localStorage.setItem(PANEL_MINIMIZED_STORAGE_KEY, 'false');
    }
    commitPanelLayout(layoutRef.current, {
      persist: true,
    });
  }, [commitPanelLayout]);

  const minimizePanel = useCallback(() => {
    setIsMinimized(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PANEL_MINIMIZED_STORAGE_KEY, 'true');
    }
  }, []);

  const toggleMinimized = useCallback(() => {
    if (isMinimized) {
      expandPanel();
      return;
    }

    minimizePanel();
  }, [expandPanel, isMinimized, minimizePanel]);

  const openPanel = useCallback(() => {
    console.info('[veranote-assistant] panel-toggle', { pathname, open: true });
    setIsOpen(true);
    setIsMinimized(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PANEL_OPEN_STORAGE_KEY, 'true');
      window.localStorage.setItem(PANEL_MINIMIZED_STORAGE_KEY, 'false');
    }
    commitPanelLayout(layoutRef.current, {
      persist: true,
    });
  }, [commitPanelLayout, pathname]);

  useEffect(() => {
    setContext({});
  }, [pathname]);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    const applyPersonaSnapshot = (nextPersona: Pick<AssistantApiContext, 'userAiName' | 'userAiRole' | 'userAiAvatar'>) => {
      if (!isActive) {
        return;
      }

      setProviderPersonaContext((current) => (
        current.userAiName === nextPersona.userAiName
        && current.userAiRole === nextPersona.userAiRole
        && current.userAiAvatar === nextPersona.userAiAvatar
          ? current
          : nextPersona
      ));
    };

    async function hydrateProviderPersona() {
      const cached = readCachedProviderSettings(resolvedProviderIdentityId);
      if (cached) {
        applyPersonaSnapshot({
          userAiName: cached.userAiName,
          userAiRole: cached.userAiRole,
          userAiAvatar: cached.userAiAvatar,
        });
      }

      try {
        const serverSettings = await fetchProviderSettingsFromServer(resolvedProviderIdentityId, controller.signal);
        writeCachedProviderSettings(resolvedProviderIdentityId, serverSettings);
        applyPersonaSnapshot({
          userAiName: serverSettings.userAiName,
          userAiRole: serverSettings.userAiRole,
          userAiAvatar: serverSettings.userAiAvatar,
        });
      } catch {
        if (!cached) {
          applyPersonaSnapshot({});
        }
      }
    }

    void hydrateProviderPersona();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [resolvedProviderIdentityId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const viewport = getAssistantViewport();
    const shouldUseMinimizedBounds = viewport.width < DOCKED_VIEWPORT_WIDTH || window.localStorage.getItem(PANEL_MINIMIZED_STORAGE_KEY) === 'true';
    const storedLayout = parseStoredAssistantPanelLayout(
      window.localStorage.getItem(PANEL_LAYOUT_STORAGE_KEY),
      window.localStorage.getItem(PANEL_SIZE_STORAGE_KEY),
      viewport,
      shouldUseMinimizedBounds ? MINIMIZED_PANEL_LAYOUT : undefined,
    );
    layoutRef.current = storedLayout;
    setPanelLayout(storedLayout);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const viewport = getAssistantViewport();
      setIsOpen(viewport.width >= DOCKED_VIEWPORT_WIDTH && window.localStorage.getItem(PANEL_OPEN_STORAGE_KEY) === 'true');
    } catch {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const viewport = getAssistantViewport();
      const storedValue = window.localStorage.getItem(PANEL_MINIMIZED_STORAGE_KEY);
      setIsMinimized(viewport.width < DOCKED_VIEWPORT_WIDTH || storedValue === null ? true : storedValue === 'true');
    } catch {
      setIsMinimized(true);
    }
  }, []);

  useEffect(() => {
    function handleWindowResize() {
      const viewport = getAssistantViewport();
      setIsCompactViewport(viewport.width < COMPACT_VIEWPORT_WIDTH);
      commitPanelLayout(layoutRef.current, {
        persist: false,
        renderedBounds: isMinimized ? MINIMIZED_PANEL_LAYOUT : undefined,
      });
    }

    handleWindowResize();
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [commitPanelLayout, isMinimized]);

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
        type: 'replace-preferences' | 'append-preferences' | 'create-preset-draft' | 'jump-to-source-evidence' | 'run-review-rewrite' | 'apply-conservative-rewrite' | 'apply-note-revision' | 'apply-draft-rewrite';
        instructions: string;
        presetName?: string;
        rewriteMode?: 'more-concise' | 'more-formal' | 'closer-to-source' | 'regenerate-full-note';
        originalText?: string;
        replacementText?: string;
        revisionText?: string;
        targetSectionHeading?: string;
        draftText?: string;
        rewriteLabel?: string;
      }>;

      if (
        nextEvent.detail.type === 'jump-to-source-evidence'
        || nextEvent.detail.type === 'run-review-rewrite'
        || nextEvent.detail.type === 'apply-conservative-rewrite'
        || nextEvent.detail.type === 'apply-note-revision'
        || nextEvent.detail.type === 'apply-draft-rewrite'
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

  useEffect(() => {
    function handleAssistantOpen() {
      openPanel();
    }

    window.addEventListener(ASSISTANT_OPEN_EVENT, handleAssistantOpen);
    return () => window.removeEventListener(ASSISTANT_OPEN_EVENT, handleAssistantOpen);
  }, [openPanel]);

  const beginDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (isCompactViewport) {
      return;
    }

    const target = event.target as HTMLElement | null;
    const dragHandle = target?.closest(DRAG_HANDLE_SELECTOR);
    const interactiveTarget = target?.closest(INTERACTIVE_DRAG_EXCLUSIONS);

    if (!dragHandle || (interactiveTarget && interactiveTarget !== dragHandle)) {
      return;
    }

    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLayout = layoutRef.current;
    const renderedBounds = getRenderedAssistantPanelBounds(startLayout, isMinimized);
    let hasMoved = false;
    setIsInteracting(true);
    document.body.style.userSelect = 'none';

    function handlePointerMove(moveEvent: PointerEvent) {
      if (Math.abs(moveEvent.clientX - startX) > 4 || Math.abs(moveEvent.clientY - startY) > 4) {
        hasMoved = true;
      }
      commitPanelLayout({
        ...startLayout,
        x: startLayout.x + (moveEvent.clientX - startX),
        y: startLayout.y + (moveEvent.clientY - startY),
      }, {
        persist: false,
        renderedBounds,
      });
    }

    function handlePointerUp(moveEvent: PointerEvent) {
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      setIsInteracting(false);
      if (isMinimized && hasMoved) {
        suppressNextDockClickRef.current = true;
      }
      commitPanelLayout({
        ...startLayout,
        x: startLayout.x + (moveEvent.clientX - startX),
        y: startLayout.y + (moveEvent.clientY - startY),
      }, {
        persist: true,
        renderedBounds,
      });
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [commitPanelLayout, isCompactViewport, isMinimized]);

  const beginResize = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (isCompactViewport || isMinimized) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const startLayout = layoutRef.current;
    setIsInteracting(true);
    document.body.style.userSelect = 'none';

    function handlePointerMove(moveEvent: PointerEvent) {
      commitPanelLayout({
        ...startLayout,
        width: startLayout.width + (moveEvent.clientX - startX),
        height: startLayout.height + (moveEvent.clientY - startY),
      }, {
        persist: false,
      });
    }

    function handlePointerUp(moveEvent: PointerEvent) {
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      setIsInteracting(false);
      commitPanelLayout({
        ...startLayout,
        width: startLayout.width + (moveEvent.clientX - startX),
        height: startLayout.height + (moveEvent.clientY - startY),
      }, {
        persist: true,
      });
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [commitPanelLayout, isCompactViewport, isMinimized]);

  if (!ASSISTANT_ENABLED || !stage) {
    return null;
  }

  const renderedBounds = getRenderedAssistantPanelBounds(panelLayout, isMinimized);
  const desktopFrameStyle = isCompactViewport
    ? undefined
    : {
        left: `${panelLayout.x}px`,
        top: `${panelLayout.y}px`,
        width: `${renderedBounds.width}px`,
        height: `${renderedBounds.height}px`,
      };

  return (
    <>
      {!isOpen ? (
        <button
          type="button"
          data-testid="assistant-open-button"
          data-assistant-edge-dock="true"
          aria-label={`Ask ${assistantPersona.name}`}
          onClick={openPanel}
          className={`fixed z-50 flex items-center gap-3 border border-cyan-200/22 bg-[rgba(4,12,24,0.94)] p-2.5 text-sm font-semibold text-cyan-50 shadow-[0_20px_50px_rgba(4,12,24,0.42)] backdrop-blur-xl transition hover:border-cyan-200/34 hover:bg-[rgba(18,181,208,0.18)] ${
            isCompactViewport
              ? 'bottom-4 right-4 rounded-full sm:bottom-10 sm:right-6 sm:px-5 sm:py-3'
              : 'right-0 top-1/2 -translate-y-1/2 flex-col rounded-l-[22px] border-r-0 px-2 py-3'
          }`}
        >
          <AssistantPersonaAvatar avatar={assistantPersona.avatar} label={assistantPersona.name} size="sm" />
          {isCompactViewport ? (
            <span className="hidden sm:inline">Ask {assistantPersona.name}</span>
          ) : (
            <span className="hidden sm:block [writing-mode:vertical-rl] rotate-180 text-[10px] uppercase tracking-[0.16em] text-cyan-100/74">
              Assistant
            </span>
          )}
        </button>
      ) : null}

      {isOpen && isCompactViewport && !isMinimized ? (
        <button
          type="button"
          aria-label={`Close ${assistantPersona.name}`}
          onClick={closePanel}
          className="fixed inset-0 z-30 bg-[rgba(4,12,24,0.36)] backdrop-blur-[2px]"
        />
      ) : null}

      {isOpen && isMinimized ? (
        <div
          data-testid="assistant-minimized-dock"
          className={`fixed z-50 ${isCompactViewport ? 'bottom-4 right-4 sm:bottom-10 sm:right-6' : ''} ${isInteracting ? 'opacity-92' : ''}`}
          style={desktopFrameStyle}
          onPointerDown={beginDrag}
        >
          <div
            data-assistant-drag-handle="true"
            role="button"
            tabIndex={0}
            aria-label={`Open ${assistantPersona.name}`}
            onClick={(event) => {
              const target = event.target as HTMLElement | null;
              if (suppressNextDockClickRef.current) {
                suppressNextDockClickRef.current = false;
                return;
              }
              if (target?.closest('[data-no-drag="true"]')) {
                return;
              }
              expandPanel();
            }}
            onKeyDown={(event) => {
              const target = event.target as HTMLElement | null;
              if (target?.closest('[data-no-drag="true"]')) {
                return;
              }
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                expandPanel();
              }
            }}
            className="flex h-full items-center gap-2 rounded-[24px] border border-cyan-200/18 bg-[rgba(4,12,24,0.94)] p-2.5 shadow-[0_22px_60px_rgba(4,12,24,0.4)] backdrop-blur-xl transition sm:gap-3 sm:px-4"
          >
            <AssistantPersonaAvatar avatar={assistantPersona.avatar} label={assistantPersona.name} size="sm" />
            <div className="hidden min-w-0 sm:block">
              <div className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/74">{assistantPersona.name}</div>
              <div className="truncate text-[10px] uppercase tracking-[0.12em] text-cyan-100/54">Verified by Veranote</div>
            </div>
            <div className="ml-auto hidden flex-wrap items-center gap-2 sm:flex">
              {!isCompactViewport ? (
                <button
                  type="button"
                  data-no-drag="true"
                  onClick={resetPanelLayout}
                  className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-[11px] font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
                >
                  Reset
                </button>
              ) : null}
              <button
                type="button"
                data-no-drag="true"
                data-testid="assistant-expand-button"
                onClick={expandPanel}
                className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-[11px] font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
              >
                Open
              </button>
              <button
                type="button"
                data-no-drag="true"
                onClick={closePanel}
                className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-[11px] font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isOpen && !isMinimized ? (
        <div
          data-testid="assistant-floating-panel"
          className={`fixed z-40 ${isCompactViewport ? 'inset-x-3 bottom-20 top-3' : ''}`}
          style={desktopFrameStyle}
          onPointerDown={beginDrag}
        >
          <div
            className={`aurora-panel relative flex h-full min-h-0 flex-col overflow-hidden rounded-[30px] p-4 shadow-[0_28px_90px_rgba(4,12,24,0.48)] transition-opacity sm:p-5 ${
              isInteracting ? 'opacity-95' : ''
            }`}
          >
            {!isCompactViewport ? (
              <button
                type="button"
                aria-label="Resize assistant panel"
                onPointerDown={beginResize}
                className="absolute bottom-2 right-2 z-20 flex h-6 w-6 cursor-nwse-resize items-center justify-center rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] text-cyan-100/68 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
              >
                <span className="pointer-events-none block text-[14px] leading-none">⌟</span>
              </button>
            ) : null}
            <AssistantPanel
              stage={stage}
              context={personaScopedContext}
              isMinimized={false}
              onToggleMinimized={toggleMinimized}
              onClose={closePanel}
              onResetLayout={isCompactViewport ? undefined : resetPanelLayout}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
