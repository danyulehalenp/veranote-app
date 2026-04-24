import { describe, expect, it } from 'vitest';
import { detectRiskSignals } from '@/lib/veranote/assistant-risk-detector';

describe('detectRiskSignals', () => {
  it('detects suicide plan and prior-attempt language', () => {
    const analysis = detectRiskSignals('Patient reports suicidal ideation with plan to overdose tonight and a prior overdose attempt last year.');

    expect(analysis.suicide.some((item) => item.subtype === 'active_ideation')).toBe(true);
    expect(analysis.suicide.some((item) => item.subtype === 'plan')).toBe(true);
    expect(analysis.suicide.some((item) => item.subtype === 'prior_attempts')).toBe(true);
  });

  it('keeps absence-of-evidence warning even when no risk is detected', () => {
    const analysis = detectRiskSignals('Follow-up note. Doing okay. Meds reviewed.');

    expect(analysis.suicide).toHaveLength(0);
    expect(analysis.generalWarnings[0]).toContain('Absence of evidence');
  });
});
