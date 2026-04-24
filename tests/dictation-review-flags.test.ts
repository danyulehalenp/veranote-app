import { describe, expect, it } from 'vitest';
import { detectDictationReviewFlags } from '@/lib/dictation/review-flags';

describe('detectDictationReviewFlags', () => {
  it('flags meaning-changing psychiatric language without rewriting text', () => {
    const flags = detectDictationReviewFlags('Patient denies SI and takes sertraline 50 mg on a 5150 hold.');
    const flagTypes = flags.map((flag) => flag.flagType);

    expect(flagTypes).toContain('negation');
    expect(flagTypes).toContain('risk_language');
    expect(flagTypes).toContain('medication');
    expect(flagTypes).toContain('dose');
    expect(flagTypes).toContain('legal_status');
  });

  it('returns no flags for neutral narrative text', () => {
    expect(detectDictationReviewFlags('Patient reports improved sleep and wants to return to work.')).toEqual([]);
  });
});
