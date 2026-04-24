import { describe, expect, it } from 'vitest';
import { detectContradictions } from '@/lib/veranote/assistant-contradiction-detector';

describe('detectContradictions', () => {
  it('flags suicide denial with plan language', () => {
    const analysis = detectContradictions('Patient denies SI but later states a plan to overdose tonight.');

    expect(analysis.contradictions[0]?.label).toContain('Suicide denial');
    expect(analysis.severityLevel).toBe('high');
  });

  it('flags hallucination denial with observed internal preoccupation', () => {
    const analysis = detectContradictions('Patient denies hallucinations. Staff note says patient is laughing to self and responding to internal stimuli.');

    expect(analysis.contradictions.some((item) => item.label.includes('hallucinations'))).toBe(true);
  });

  it('flags AH shorthand denial with observed internal preoccupation', () => {
    const analysis = detectContradictions('Patient denies AH today. Nursing note says patient appeared internally preoccupied.');

    expect(analysis.contradictions.some((item) => item.detail.includes('reported denial of hallucinations'))).toBe(true);
    expect(analysis.severityLevel).toBe('high');
  });
});
