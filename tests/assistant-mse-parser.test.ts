import { describe, expect, it } from 'vitest';
import { parseMSEFromText } from '@/lib/veranote/assistant-mse-parser';

describe('parseMSEFromText', () => {
  it('detects documented domains without auto-completing others', () => {
    const analysis = parseMSEFromText('Patient calm and cooperative. Speech is pressured. Patient reports feeling anxious.');

    expect(analysis.detectedDomains.map((item) => item.domain)).toContain('behavior');
    expect(analysis.detectedDomains.map((item) => item.domain)).toContain('speech');
    expect(analysis.detectedDomains.map((item) => item.domain)).toContain('mood');
    expect(analysis.missingDomains).toContain('affect');
    expect(analysis.unsupportedNormals.join(' ')).toContain('Affect is not described');
  });

  it('flags ambiguous perception material instead of resolving it', () => {
    const analysis = parseMSEFromText('Patient denies hallucinations. Nursing notes patient responding to internal stimuli.');

    expect(analysis.detectedDomains.map((item) => item.domain)).toContain('perception');
    expect(analysis.ambiguousSections.join(' ')).toContain('preserve both');
  });

  it('does not misclassify cooperative behavior as appearance', () => {
    const analysis = parseMSEFromText('Patient calm and cooperative with poor hygiene.');

    expect(analysis.detectedDomains.map((item) => item.domain)).toContain('behavior');
    expect(analysis.detectedDomains.map((item) => item.domain)).toContain('appearance');
    expect(analysis.detectedDomains.find((item) => item.domain === 'appearance')?.matches).not.toContain('cooperative');
  });
});
