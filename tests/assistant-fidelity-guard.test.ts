import { describe, expect, it } from 'vitest';
import { enforceFidelity } from '@/lib/veranote/assistant-fidelity-guard';
import { detectContradictions } from '@/lib/veranote/assistant-contradiction-detector';
import { parseMSEFromText } from '@/lib/veranote/assistant-mse-parser';
import { detectRiskSignals } from '@/lib/veranote/assistant-risk-detector';

describe('enforceFidelity', () => {
  it('softens unsupported normal MSE wording and adds insufficiency language', () => {
    const source = 'Patient calm and cooperative.';
    const guarded = enforceFidelity({
      output: {
        message: 'Assessment: euthymic mood with appropriate affect and no hallucinations.',
        suggestions: ['Risk is low and thought process is linear.'],
      },
      source,
      mseAnalysis: parseMSEFromText(source),
      riskAnalysis: detectRiskSignals(source),
      contradictions: detectContradictions(source),
    });

    expect(guarded.message).toContain('mood not fully described');
    expect(guarded.message).toContain('based on available information');
    expect(guarded.suggestions?.join(' ')).toContain('insufficient data');
  });

  it('blocks minimizing suicide risk when plan language is present', () => {
    const source = 'Patient denies SI but says she has a plan to overdose if discharged.';
    const guarded = enforceFidelity({
      output: {
        message: 'Assessment: low suicide risk.',
        suggestions: ['Patient is clearly low risk.'],
      },
      source,
      mseAnalysis: parseMSEFromText(source),
      riskAnalysis: detectRiskSignals(source),
      contradictions: detectContradictions(source),
    });

    expect(guarded.message).toContain('cannot be minimized');
    expect(guarded.suggestions?.join(' ')).toContain('Contradiction flagged');
  });
});
