'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildDictationInsertionWorkflowProfile } from '@/lib/dictation/ehr-insertion-profiles';
import { inferOutputNoteFocus } from '@/lib/veranote/output-destinations';
import {
  DEFAULT_MINI_VERANOTE_PREFERENCES,
  MINI_VERANOTE_HANDOFF_STORAGE_KEY_PREFIX,
  MINI_VERANOTE_LAYOUT_STORAGE_KEY,
  MINI_VERANOTE_PREF_FALLBACK_STORAGE_KEY,
  MINI_VERANOTE_PREF_STORAGE_KEY_PREFIX,
  getMiniVeranoteProviderStorageKey,
  parseMiniVeranoteLayout,
  parseMiniVeranotePreferences,
  selectMiniVeranoteEhrPayload,
  writeMiniVeranotePreferences,
  type MiniVeranoteLayout,
  type MiniVeranotePayloadMode,
  type MiniVeranotePreferences,
  type MiniVeranoteSourceTarget,
} from '@/lib/veranote/mini-veranote-overlay';
import type { ProviderSettings } from '@/lib/constants/settings';
import type { SourceSections } from '@/types/session';

function clampMiniOverlayPosition(
  next: { x: number; y: number },
  size: { width: number; height: number },
) {
  if (typeof window === 'undefined') {
    return next;
  }

  const margin = 12;
  return {
    x: Math.min(Math.max(next.x, margin), Math.max(margin, window.innerWidth - size.width - margin)),
    y: Math.min(Math.max(next.y, margin), Math.max(margin, window.innerHeight - size.height - margin)),
  };
}

export type UseMiniVeranoteOverlayStateInput = {
  enabled: boolean;
  noteType: string;
  outputDestination: string;
  providerIdentityId: string;
  sourceSections: SourceSections;
  sourceInput: string;
  currentDraftText: string;
};

export function useMiniVeranoteOverlayState({
  enabled,
  noteType,
  outputDestination,
  providerIdentityId,
  sourceSections,
  sourceInput,
  currentDraftText,
}: UseMiniVeranoteOverlayStateInput) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [miniText, setMiniText] = useState('');
  const [targetSection, setTargetSection] = useState<MiniVeranoteSourceTarget>(DEFAULT_MINI_VERANOTE_PREFERENCES.targetSection);
  const [ehrPayloadMode, setEhrPayloadMode] = useState<MiniVeranotePayloadMode>(DEFAULT_MINI_VERANOTE_PREFERENCES.ehrPayloadMode);
  const [selectedFieldTargetId, setSelectedFieldTargetId] = useState(DEFAULT_MINI_VERANOTE_PREFERENCES.selectedFieldTargetId);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const layoutHydratedRef = useRef(false);
  const preferencesHydratedRef = useRef(false);
  const skipNextPreferencePersistRef = useRef(false);

  const size = isMinimized ? { width: 286, height: 76 } : { width: 396, height: 604 };
  const preferencesStorageKey = getMiniVeranoteProviderStorageKey(MINI_VERANOTE_PREF_STORAGE_KEY_PREFIX, providerIdentityId);
  const desktopHandoffStorageKey = getMiniVeranoteProviderStorageKey(MINI_VERANOTE_HANDOFF_STORAGE_KEY_PREFIX, providerIdentityId);
  const workflowProfile = useMemo(
    () => buildDictationInsertionWorkflowProfile(
      outputDestination as ProviderSettings['outputDestination'],
      inferOutputNoteFocus(noteType),
    ),
    [noteType, outputDestination],
  );
  const selectedFieldTarget = workflowProfile.fieldTargets.find((target) => target.id === selectedFieldTargetId)
    || workflowProfile.fieldTargets[0]
    || null;
  const targetSourceText = sourceSections[targetSection]?.trim() || '';
  const ehrPayload = useMemo(() => selectMiniVeranoteEhrPayload({
    mode: ehrPayloadMode,
    currentDraftText,
    miniText,
    targetSourceText,
    sourceInput,
  }), [currentDraftText, ehrPayloadMode, miniText, sourceInput, targetSourceText]);
  const ehrPayloadPreview = ehrPayload || 'Nothing ready to copy yet.';

  function persistPreferences(preferences: MiniVeranotePreferences) {
    writeMiniVeranotePreferences(preferencesStorageKey, preferences);
  }

  function setTargetSectionAndPersist(nextTarget: MiniVeranoteSourceTarget) {
    preferencesHydratedRef.current = true;
    setTargetSection(nextTarget);
    persistPreferences({
      targetSection: nextTarget,
      ehrPayloadMode,
      selectedFieldTargetId,
    });
  }

  function setEhrPayloadModeAndPersist(nextMode: MiniVeranotePayloadMode) {
    preferencesHydratedRef.current = true;
    setEhrPayloadMode(nextMode);
    persistPreferences({
      targetSection,
      ehrPayloadMode: nextMode,
      selectedFieldTargetId,
    });
  }

  function setSelectedFieldTargetIdAndPersist(nextFieldTargetId: string) {
    preferencesHydratedRef.current = true;
    setSelectedFieldTargetId(nextFieldTargetId);
    persistPreferences({
      targetSection,
      ehrPayloadMode,
      selectedFieldTargetId: nextFieldTargetId,
    });
  }

  function persistLayout(layout: MiniVeranoteLayout) {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(MINI_VERANOTE_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  }

  function setMinimizedAndPersist(nextMinimized: boolean) {
    setIsMinimized(nextMinimized);
    if (position) {
      persistLayout({
        ...position,
        minimized: nextMinimized,
      });
    }
  }

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || layoutHydratedRef.current) {
      return;
    }

    const parsedLayout = parseMiniVeranoteLayout(window.localStorage.getItem(MINI_VERANOTE_LAYOUT_STORAGE_KEY));
    if (parsedLayout) {
      setPosition((current) => current || clampMiniOverlayPosition({ x: parsedLayout.x, y: parsedLayout.y }, size));
      setIsMinimized(parsedLayout.minimized);
    } else {
      setPosition((current) => current || clampMiniOverlayPosition({
        x: window.innerWidth - size.width - 22,
        y: window.innerHeight - size.height - 22,
      }, size));
    }
    layoutHydratedRef.current = true;
  }, [enabled, size.height, size.width]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || preferencesHydratedRef.current) {
      return;
    }

    const parsedPrefs = parseMiniVeranotePreferences(
      window.localStorage.getItem(preferencesStorageKey)
      || window.localStorage.getItem(MINI_VERANOTE_PREF_FALLBACK_STORAGE_KEY),
    );
    if (parsedPrefs) {
      setTargetSection(parsedPrefs.targetSection);
      setEhrPayloadMode(parsedPrefs.ehrPayloadMode);
      setSelectedFieldTargetId(parsedPrefs.selectedFieldTargetId);
      skipNextPreferencePersistRef.current = true;
    }
    preferencesHydratedRef.current = true;
  }, [enabled, preferencesStorageKey]);

  useEffect(() => {
    if (!enabled || !preferencesHydratedRef.current) {
      return;
    }

    if (skipNextPreferencePersistRef.current) {
      skipNextPreferencePersistRef.current = false;
      return;
    }

    persistPreferences({
      targetSection,
      ehrPayloadMode,
      selectedFieldTargetId,
    });
  }, [ehrPayloadMode, enabled, preferencesStorageKey, selectedFieldTargetId, targetSection]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !position || !layoutHydratedRef.current) {
      return;
    }

    persistLayout({
      ...position,
      minimized: isMinimized,
    });
  }, [enabled, isMinimized, position]);

  useEffect(() => {
    if (selectedFieldTargetId || !workflowProfile.fieldTargets[0]) {
      return;
    }

    setSelectedFieldTargetId(workflowProfile.fieldTargets[0].id);
  }, [selectedFieldTargetId, workflowProfile.fieldTargets]);

  return {
    desktopHandoffStorageKey,
    ehrPayload,
    ehrPayloadMode,
    ehrPayloadPreview,
    isMinimized,
    miniText,
    position,
    selectedFieldTarget,
    selectedFieldTargetId,
    setEhrPayloadModeAndPersist,
    setMiniText,
    setMinimizedAndPersist,
    setPosition,
    setSelectedFieldTargetIdAndPersist,
    setTargetSectionAndPersist,
    size,
    targetSection,
    workflowProfile,
  };
}

export { clampMiniOverlayPosition };
