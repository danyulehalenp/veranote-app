import { describe, expect, it } from 'vitest';
import { buildInternalKnowledgeHelp } from '@/lib/veranote/assistant-internal-knowledge';
import { POST } from '@/app/api/assistant/respond/route';

describe('assistant internal knowledge helper', () => {
  it('answers presets versus preferences from Veranote docs', () => {
    const response = buildInternalKnowledgeHelp('what is the difference between presets and prompt preferences?', {});

    expect(response?.message).toContain('Prompt and note preferences describe how a note lane should usually behave');
    expect(response?.references?.[0]?.sourceType).toBe('internal');
  });

  it('answers V1 scope questions from internal docs', () => {
    const response = buildInternalKnowledgeHelp('what note types are in scope for v1?', {});

    expect(response?.message).toContain('The current wedge includes psychiatry follow-up notes');
    expect(response?.references?.some((reference) => reference.label.includes('V1 Scope'))).toBe(true);
  });

  it('routes app-specific product questions to internal knowledge before fallback guidance', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'What is the difference between presets and prompt preferences?',
        context: { noteType: 'Inpatient Psych Progress Note', providerAddressingName: 'Daniel Hale' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('Prompt and note preferences describe how a note lane should usually behave');
    expect(payload.references?.[0]?.sourceType).toBe('internal');
  });

  it('answers Louisiana inpatient psych documentation questions from internal docs', () => {
    const response = buildInternalKnowledgeHelp('what does louisiana need for inpatient psych approval?', {});

    expect(response?.message).toContain('Louisiana reviewers usually need more than broad risk language');
    expect(response?.references?.some((reference) => reference.label.includes('Louisiana'))).toBe(true);
  });

  it('routes Louisiana inpatient psych approval questions through the live endpoint', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'What does Louisiana need for inpatient psych approval?',
        context: { noteType: 'Inpatient Psych Progress Note', providerAddressingName: 'Daniel Hale' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('Louisiana reviewers usually need more than broad risk language');
    expect(payload.references?.some((reference: { label?: string; sourceType?: string }) => reference.sourceType === 'internal' && reference.label?.includes('Louisiana'))).toBe(true);
  });

  it('answers Louisiana PEC and CEC workflow questions conservatively', () => {
    const response = buildInternalKnowledgeHelp('what should i document if the patient is already pecd?', {});

    expect(response?.message).toContain('PEC and CEC should be handled as Louisiana workflow-reference support');
    expect(response?.suggestions?.[1]).toContain('should not volunteer keep-versus-discharge advice');
    expect(response?.references?.some((reference) => reference.label.includes('PEC and CEC'))).toBe(true);
  });

  it('routes Louisiana PEC workflow questions through the live endpoint', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'What should I document if the patient is already PECd?',
        context: { noteType: 'Inpatient Psych Progress Note', providerAddressingName: 'Daniel Hale' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('PEC and CEC should be handled as Louisiana workflow-reference support');
    expect(payload.references?.some((reference: { label?: string; sourceType?: string }) => reference.sourceType === 'internal' && reference.label?.includes('PEC and CEC'))).toBe(true);
  });
});
