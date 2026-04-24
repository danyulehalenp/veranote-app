import { describe, expect, it } from 'vitest';
import { buildRetrievedInternalKnowledgeHelp, retrieveVeranoteDocs } from '@/lib/veranote/assistant-internal-retrieval';

describe('assistant internal retrieval helper', () => {
  it('retrieves relevant internal docs for product-direction questions', () => {
    const matches = retrieveVeranoteDocs('does veranote support outpatient psych?', 2);

    expect(matches.some((match) => match.id === 'outpatient-psych-requirements')).toBe(true);
    expect(matches.some((match) => match.id === 'provider-profile-model')).toBe(true);
  });

  it('builds an internal retrieval answer for broader product questions', () => {
    const response = buildRetrievedInternalKnowledgeHelp('what does veranote mean by source fidelity?', {});

    expect(response?.message).toContain('source');
    expect(response?.references?.[0]?.sourceType).toBe('internal');
  });

  it('retrieves Louisiana inpatient psych guidance for medical-necessity questions', () => {
    const matches = retrieveVeranoteDocs('louisiana inpatient psych medical necessity approval', 2);

    expect(matches.some((match) => match.id === 'louisiana-inpatient-psych-documentation')).toBe(true);
  });

  it('does not treat charting warnings as product-direction questions just because Vera is mentioned', () => {
    const response = buildRetrievedInternalKnowledgeHelp(
      'If somebody insists on documenting schizophrenia here, what exact warning should Vera give instead of sounding agreeable?',
      {},
    );

    expect(response).toBeNull();
  });
});
