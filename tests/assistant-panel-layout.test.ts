import { describe, expect, it } from 'vitest';
import {
  buildDefaultAssistantPanelLayout,
  clampAssistantPanelLayout,
  DEFAULT_PANEL_LAYOUT,
  PANEL_DEFAULT_BOTTOM_OFFSET,
  PANEL_MARGIN,
  parseStoredAssistantPanelLayout,
  MINIMIZED_PANEL_LAYOUT,
  snapAssistantPanelLayout,
} from '@/lib/veranote/assistant-panel-layout';

describe('assistant panel layout helpers', () => {
  const viewport = {
    width: 1440,
    height: 900,
  };

  it('builds the default desktop layout in the bottom-right corner', () => {
    const layout = buildDefaultAssistantPanelLayout(viewport);

    expect(layout).toEqual({
      x: viewport.width - DEFAULT_PANEL_LAYOUT.width - PANEL_MARGIN,
      y: viewport.height - DEFAULT_PANEL_LAYOUT.height - PANEL_DEFAULT_BOTTOM_OFFSET,
      width: DEFAULT_PANEL_LAYOUT.width,
      height: DEFAULT_PANEL_LAYOUT.height,
    });
  });

  it('clamps size and position within the viewport', () => {
    const layout = clampAssistantPanelLayout({
      x: -200,
      y: -120,
      width: 2400,
      height: 1200,
    }, viewport);

    expect(layout.x).toBe(PANEL_MARGIN);
    expect(layout.y).toBe(PANEL_MARGIN);
    expect(layout.width).toBe(viewport.width - PANEL_MARGIN * 2);
    expect(layout.height).toBe(viewport.height - PANEL_MARGIN * 2);
  });

  it('restores persisted layout when valid and falls back to legacy size when needed', () => {
    const restored = parseStoredAssistantPanelLayout(JSON.stringify({
      x: 500,
      y: 120,
      width: 640,
      height: 700,
    }), null, viewport);

    expect(restored).toEqual({
      x: 500,
      y: 120,
      width: 640,
      height: 700,
    });

    const legacy = parseStoredAssistantPanelLayout(
      'not-json',
      JSON.stringify({ width: 480, height: 600 }),
      viewport,
    );

    expect(legacy.width).toBe(480);
    expect(legacy.height).toBe(600);
    expect(legacy.x).toBe(viewport.width - 480 - PANEL_MARGIN);
  });

  it('snaps near the viewport edges', () => {
    const snapped = snapAssistantPanelLayout({
      x: PANEL_MARGIN + 6,
      y: PANEL_MARGIN + 8,
      width: 500,
      height: 600,
    }, viewport);

    expect(snapped.x).toBe(PANEL_MARGIN);
    expect(snapped.y).toBe(PANEL_MARGIN);
  });

  it('can clamp a minimized dock by its rendered bounds without losing saved panel size', () => {
    const layout = clampAssistantPanelLayout({
      x: 1300,
      y: 820,
      width: 620,
      height: 720,
    }, viewport, MINIMIZED_PANEL_LAYOUT);

    expect(layout.width).toBe(620);
    expect(layout.height).toBe(720);
    expect(layout.x).toBe(viewport.width - MINIMIZED_PANEL_LAYOUT.width - PANEL_MARGIN);
    expect(layout.y).toBe(viewport.height - MINIMIZED_PANEL_LAYOUT.height - PANEL_MARGIN);
  });

  it('restores a minimized persisted dock using minimized bounds', () => {
    const restored = parseStoredAssistantPanelLayout(JSON.stringify({
      x: 1128,
      y: 784,
      width: 620,
      height: 720,
    }), null, viewport, MINIMIZED_PANEL_LAYOUT);

    expect(restored).toEqual({
      x: viewport.width - MINIMIZED_PANEL_LAYOUT.width - PANEL_MARGIN,
      y: viewport.height - MINIMIZED_PANEL_LAYOUT.height - PANEL_MARGIN,
      width: 620,
      height: 720,
    });
  });
});
