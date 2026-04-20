import { describe, expect, it } from 'vitest';
import { buildRetrievedInternalKnowledgeHelp, retrieveVeranoteDocs } from '@/lib/veranote/assistant-internal-retrieval';
import { POST } from '@/app/api/assistant/respond/route';

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

  it('routes broad Veranote product questions through internal retrieval in the live endpoint', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'Why is review required in Veranote?',
        context: { providerAddressingName: 'Daniel Hale' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('reviewable draft');
    expect(payload.references?.some((reference: { sourceType?: string }) => reference.sourceType === 'internal')).toBe(true);
  });

  it('retrieves Louisiana inpatient psych guidance for medical-necessity questions', () => {
    const matches = retrieveVeranoteDocs('louisiana inpatient psych medical necessity approval', 2);

    expect(matches.some((match) => match.id === 'louisiana-inpatient-psych-documentation')).toBe(true);
  });
});
