export type AssistantPanelLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AssistantViewport = {
  width: number;
  height: number;
};

export type AssistantPanelRenderedBounds = {
  width: number;
  height: number;
};

export const PANEL_LAYOUT_STORAGE_KEY = 'veranote-assistant-panel-layout';
export const PANEL_SIZE_STORAGE_KEY = 'veranote-assistant-panel-size';
export const PANEL_OPEN_STORAGE_KEY = 'veranote-assistant-panel-open';
export const PANEL_MINIMIZED_STORAGE_KEY = 'veranote-assistant-panel-minimized';
export const PANEL_MARGIN = 24;
export const PANEL_DEFAULT_BOTTOM_OFFSET = 96;
export const DEFAULT_PANEL_LAYOUT = {
  width: 560,
  height: 780,
} as const;
export const MIN_PANEL_LAYOUT = {
  width: 360,
  height: 420,
} as const;
export const MINIMIZED_PANEL_LAYOUT = {
  width: 288,
  height: 92,
} as const;

function clamp(value: number, min: number, max: number) {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

export function clampAssistantPanelSize(
  width: number,
  height: number,
  viewport: AssistantViewport,
) {
  return {
    width: clamp(width, MIN_PANEL_LAYOUT.width, viewport.width - PANEL_MARGIN * 2),
    height: clamp(height, MIN_PANEL_LAYOUT.height, viewport.height - PANEL_MARGIN * 2),
  };
}

export function buildDefaultAssistantPanelLayout(
  viewport: AssistantViewport,
  preferredSize: Partial<Pick<AssistantPanelLayout, 'width' | 'height'>> = {},
): AssistantPanelLayout {
  const size = clampAssistantPanelSize(
    preferredSize.width ?? DEFAULT_PANEL_LAYOUT.width,
    preferredSize.height ?? DEFAULT_PANEL_LAYOUT.height,
    viewport,
  );

  return {
    x: clamp(viewport.width - size.width - PANEL_MARGIN, PANEL_MARGIN, viewport.width - size.width - PANEL_MARGIN),
    y: clamp(viewport.height - size.height - PANEL_DEFAULT_BOTTOM_OFFSET, PANEL_MARGIN, viewport.height - size.height - PANEL_MARGIN),
    width: size.width,
    height: size.height,
  };
}

export function clampAssistantPanelLayout(
  layout: AssistantPanelLayout,
  viewport: AssistantViewport,
  renderedBounds?: AssistantPanelRenderedBounds,
): AssistantPanelLayout {
  const size = clampAssistantPanelSize(layout.width, layout.height, viewport);
  const positionBounds = renderedBounds ?? size;
  const positionWidth = clamp(positionBounds.width, 1, viewport.width - PANEL_MARGIN * 2);
  const positionHeight = clamp(positionBounds.height, 1, viewport.height - PANEL_MARGIN * 2);

  return {
    width: size.width,
    height: size.height,
    x: clamp(layout.x, PANEL_MARGIN, viewport.width - positionWidth - PANEL_MARGIN),
    y: clamp(layout.y, PANEL_MARGIN, viewport.height - positionHeight - PANEL_MARGIN),
  };
}

export function snapAssistantPanelLayout(
  layout: AssistantPanelLayout,
  viewport: AssistantViewport,
  snapDistance = 18,
) {
  const clamped = clampAssistantPanelLayout(layout, viewport);
  const maxX = viewport.width - clamped.width - PANEL_MARGIN;
  const maxY = viewport.height - clamped.height - PANEL_MARGIN;
  let nextX = clamped.x;
  let nextY = clamped.y;

  if (Math.abs(clamped.x - PANEL_MARGIN) <= snapDistance) {
    nextX = PANEL_MARGIN;
  } else if (Math.abs(clamped.x - maxX) <= snapDistance) {
    nextX = maxX;
  }

  if (Math.abs(clamped.y - PANEL_MARGIN) <= snapDistance) {
    nextY = PANEL_MARGIN;
  } else if (Math.abs(clamped.y - maxY) <= snapDistance) {
    nextY = maxY;
  }

  return {
    ...clamped,
    x: nextX,
    y: nextY,
  };
}

export function getRenderedAssistantPanelBounds(
  layout: AssistantPanelLayout,
  minimized: boolean,
) {
  if (!minimized) {
    return {
      width: layout.width,
      height: layout.height,
    };
  }

  return {
    width: Math.min(layout.width, MINIMIZED_PANEL_LAYOUT.width),
    height: MINIMIZED_PANEL_LAYOUT.height,
  };
}

export function parseStoredAssistantPanelLayout(
  rawLayout: string | null,
  rawLegacySize: string | null,
  viewport: AssistantViewport,
  renderedBounds?: AssistantPanelRenderedBounds,
) {
  if (rawLayout) {
    try {
      const parsed = JSON.parse(rawLayout) as Partial<AssistantPanelLayout>;
      if (
        typeof parsed.x === 'number'
        && typeof parsed.y === 'number'
        && typeof parsed.width === 'number'
        && typeof parsed.height === 'number'
      ) {
        return clampAssistantPanelLayout({
          x: parsed.x,
          y: parsed.y,
          width: parsed.width,
          height: parsed.height,
        }, viewport, renderedBounds);
      }
    } catch {
      // Ignore invalid persisted layout and fall back.
    }
  }

  if (rawLegacySize) {
    try {
      const parsed = JSON.parse(rawLegacySize) as Partial<Pick<AssistantPanelLayout, 'width' | 'height'>>;
      if (typeof parsed.width === 'number' && typeof parsed.height === 'number') {
        return buildDefaultAssistantPanelLayout(viewport, parsed);
      }
    } catch {
      // Ignore invalid legacy size data and fall back.
    }
  }

  return buildDefaultAssistantPanelLayout(viewport);
}
