import { describe, expect, it } from 'vitest';
import {
  resolveBestWorkflowFieldTarget,
  resolveDesktopFieldTargetPack,
  resolveDesktopInsertionStrategies,
  resolveDesktopTargetAdapter,
} from '@/lib/dictation/desktop-target-adapters';

describe('desktop target adapters', () => {
  it('matches a browser-hosted EHR adapter from app and window title', () => {
    const adapter = resolveDesktopTargetAdapter({
      destinationLabel: 'Tebra/Kareo',
      desktopContext: {
        appName: 'Google Chrome',
        windowTitle: 'Tebra Encounter Note',
      },
    });

    expect(adapter?.id).toBe('tebra-browser');
  });

  it('prefers direct accessibility insertion before paste for known adapters', () => {
    const strategies = resolveDesktopInsertionStrategies({
      destinationLabel: 'SimplePractice',
      desktopContext: {
        appName: 'Safari',
        windowTitle: 'SimplePractice Progress Note',
      },
    });

    expect(strategies[0]).toBe('accessibility_set_value');
    expect(strategies[1]).toBe('paste_keystroke');
  });

  it('returns the richer field target pack for a matched adapter and field', () => {
    const adapter = resolveDesktopTargetAdapter({
      destinationLabel: 'Tebra/Kareo',
      desktopContext: {
        appName: 'Google Chrome',
        windowTitle: 'Tebra Encounter Note',
      },
    });

    const fieldPack = resolveDesktopFieldTargetPack({
      adapter,
      fieldTargetId: 'tebra-plan',
    });

    expect(fieldPack?.preferredBehavior).toBe('append');
    expect(fieldPack?.aliases).toContain('treatment plan');
  });

  it('resolves the best workflow field target from focused label and window title', () => {
    const target = resolveBestWorkflowFieldTarget({
      adapter: resolveDesktopTargetAdapter({
        destinationLabel: 'Tebra/Kareo',
        desktopContext: {
          appName: 'Google Chrome',
          windowTitle: 'Tebra Subjective Field',
        },
      }),
      workflowProfile: {
        destination: 'Tebra/Kareo',
        destinationLabel: 'Tebra/Kareo',
        speechBoxMode: 'floating-field-box',
        supportsDirectFieldInsertion: true,
        directFieldGuidance: 'Aim at one note field at a time.',
        fieldTargets: [
          {
            id: 'tebra-subjective',
            label: 'Subjective / HPI',
            note: 'Use for interval narrative and patient-reported course.',
          },
          {
            id: 'tebra-plan',
            label: 'Plan',
            note: 'Use for medications and next steps.',
          },
        ],
      },
      desktopContext: {
        appName: 'Google Chrome',
        windowTitle: 'Tebra Subjective Field',
        elementRole: 'text area',
        focusedLabel: 'Subjective / HPI',
      },
    });

    expect(target?.id).toBe('tebra-subjective');
  });
});
