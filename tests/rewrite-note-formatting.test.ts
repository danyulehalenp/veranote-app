import { afterEach, describe, expect, it, vi } from 'vitest';

import { rewriteNote } from '@/lib/ai/rewrite-note';

const sourceInput = [
  'Patient reports low mood and poor sleep.',
  'Provider observed anxious affect and linear thought process.',
  'Plan discussed: continue source-supported follow-up and verify risk language.',
].join('\n');

const currentDraft = [
  'HPI:',
  'Patient reports low mood and poor sleep.',
  '',
  'MSE:',
  'Provider observed anxious affect and linear thought process.',
  '',
  'Plan:',
  'Continue source-supported follow-up and verify risk language.',
].join('\n');

const markdownDraft = [
  '## HPI',
  '- Patient reports anxiety is improved but still avoids crowded stores.',
  '',
  'MENTAL STATUS EXAM',
  '- Cooperative with anxious affect and goal-directed thought process.',
  '',
  'Assessment and Plan',
  '1. Continue source-supported follow-up.',
  '2. No final medication change is documented.',
].join('\n');

describe('rewrite note formatting fallbacks', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('turns a sectioned draft into one paragraph without headings when asked', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');

    const result = await rewriteNote({
      sourceInput,
      currentDraft,
      noteType: 'Outpatient Psych Follow-Up',
      rewriteMode: 'one-paragraph',
    });

    expect(result.mode).toBe('fallback');
    expect(result.note).toMatch(/^Patient reports low mood/i);
    expect(result.note).not.toMatch(/\bHPI:|\bMSE:|\bPlan:/);
    expect(result.note).toMatch(/verify risk language/i);
    expect(result.note.split(/\n{2,}/)).toHaveLength(1);
  });

  it('creates two paragraphs for HPI then MSE/Plan shaping', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');

    const result = await rewriteNote({
      sourceInput,
      currentDraft,
      noteType: 'Outpatient Psych Follow-Up',
      rewriteMode: 'two-paragraph-hpi-mse-plan',
    });

    const paragraphs = result.note.split(/\n{2,}/);

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toMatch(/low mood and poor sleep/i);
    expect(paragraphs[1]).toMatch(/anxious affect/i);
    expect(paragraphs[1]).toMatch(/verify risk language/i);
    expect(result.note).not.toMatch(/\bHPI:|\bMSE:|\bPlan:/);
  });

  it('keeps story-flow shaping source-faithful instead of inventing content', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');

    const result = await rewriteNote({
      sourceInput,
      currentDraft,
      noteType: 'Outpatient Psych Follow-Up',
      rewriteMode: 'story-flow',
    });

    expect(result.note).toMatch(/Patient reports low mood/i);
    expect(result.note).toMatch(/linear thought process/i);
    expect(result.note).not.toMatch(/denies suicidal ideation|stable for discharge|normal limits/i);
  });

  it('removes markdown, all-caps, and no-colon headings when making one paragraph', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');

    const result = await rewriteNote({
      sourceInput,
      currentDraft: markdownDraft,
      noteType: 'Outpatient Psych Follow-Up',
      rewriteMode: 'one-paragraph',
    });

    expect(result.note).toMatch(/^Patient reports anxiety is improved/i);
    expect(result.note).toMatch(/goal-directed thought process/i);
    expect(result.note).toMatch(/No final medication change is documented/i);
    expect(result.note).not.toMatch(/##|MENTAL STATUS EXAM|Assessment and Plan|^\d+\./i);
    expect(result.note.split(/\n{2,}/)).toHaveLength(1);
  });

  it('uses heading variants without colons for two-paragraph HPI then MSE/Plan shaping', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');

    const result = await rewriteNote({
      sourceInput,
      currentDraft: markdownDraft,
      noteType: 'Outpatient Psych Follow-Up',
      rewriteMode: 'two-paragraph-hpi-mse-plan',
    });

    const paragraphs = result.note.split(/\n{2,}/);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toMatch(/anxiety is improved/i);
    expect(paragraphs[1]).toMatch(/goal-directed thought process/i);
    expect(paragraphs[1]).toMatch(/No final medication change is documented/i);
    expect(result.note).not.toMatch(/##|MENTAL STATUS EXAM|Assessment and Plan/i);
  });
});
