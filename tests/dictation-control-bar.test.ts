// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DictationControlBar } from '@/components/note/dictation/dictation-control-bar';

const noop = () => {};

function renderControl(overrides: Partial<Parameters<typeof DictationControlBar>[0]> = {}) {
  const props: Parameters<typeof DictationControlBar>[0] = {
    enabled: true,
    uiState: 'listening',
    captureState: 'capturing',
    captureLabel: 'Browser microphone',
    providerLabel: 'OpenAI Whisper',
    providerNote: 'Review final transcript before insertion.',
    providerOptions: [
      {
        providerId: 'openai-whisper',
        providerLabel: 'OpenAI Whisper',
        available: true,
        engineLabel: 'server STT',
      },
    ],
    requestedProviderId: 'openai-whisper',
    allowMockFallback: false,
    providerStatusLoading: false,
    sessionStatusLabel: 'active',
    targetLabel: 'Live Visit Notes',
    helperText: 'Dictate, stop, review, then insert.',
    voiceGuide: {
      statusLabel: 'Ready',
      headline: 'Dictation is active',
      detail: 'Speak the phrase, then review the final transcript.',
      phrases: [],
      needsAttention: false,
      actionLabel: 'Voice guide',
    },
    onVoiceGuideAction: noop,
    onRequestedProviderChange: noop,
    onAllowMockFallbackChange: noop,
    onRefreshProviderStatus: noop,
    onStart: noop,
    onPause: noop,
    onStop: noop,
    ...overrides,
  };

  return createElement(DictationControlBar, props);
}

describe('DictationControlBar', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container.remove();
    vi.restoreAllMocks();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('teaches review-first dictation instead of one-click insertion', async () => {
    await act(async () => {
      root.render(renderControl());
    });

    expect(container.textContent).toContain('Stop & Review');
    expect(container.textContent).not.toContain('Stop & Insert');
    expect(container.textContent).toContain('Review final transcript before insertion.');
  });
});
