import { describe, expect, it, vi } from 'vitest';
import { buildExternalAnswerMeta, hydrateTrustedReferenceSources } from '@/lib/veranote/assistant-reference-lookup';
import { getAssistantReferencePolicy } from '@/lib/veranote/assistant-source-policy';

describe('assistant reference lookup', () => {
  it('hydrates trusted reference labels from live page titles when available', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      text: async () => '<html><head><title>CDC ICD-10-CM | Classification of Diseases, Functioning, and Disability | CDC</title></head></html>',
    })) as unknown as typeof fetch;

    const references = await hydrateTrustedReferenceSources(
      'what is the icd 10 code for recurrent severe mdd without psychotic features?',
      [{ label: 'CDC ICD-10-CM browser and overview', url: 'https://www.cdc.gov/nchs/icd/icd-10-cm/' }],
      fetcher,
    );

    expect(references[0]?.label).toContain('CDC ICD-10-CM');
    expect(fetcher).toHaveBeenCalled();
  });

  it('adds trusted search references when no direct references are provided', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => ({
      ok: true,
      text: async () => `<html><head><title>${String(url)}</title></head></html>`,
    })) as unknown as typeof fetch;

    const references = await hydrateTrustedReferenceSources(
      'what modifier do i use for recurrent severe mdd billing?',
      [],
      fetcher,
    );

    expect(references.some((reference) => reference.url.includes('cdc.gov'))).toBe(true);
    expect(references.some((reference) => reference.url.includes('cms.gov'))).toBe(true);
  });

  it('keeps curated labels when fetched titles are generic', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      text: async () => '<html><head><title>Search</title></head></html>',
    })) as unknown as typeof fetch;

    const references = await hydrateTrustedReferenceSources(
      'what is the difference between h&p and consult?',
      [{ label: 'CMS Evaluation and Management visits overview', url: 'https://www.cms.gov/medicare/payment/fee-schedules/physician/evaluation-management-visits' }],
      fetcher,
    );

    expect(references[0]?.label).toBe('CMS Evaluation and Management visits overview');
  });

  it('classifies direct trusted page answers correctly', () => {
    const meta = buildExternalAnswerMeta(
      'A1c, or hemoglobin A1c, reflects average blood glucose over roughly the last 2 to 3 months.',
      [{ label: 'MedlinePlus Hemoglobin A1C test', url: 'https://medlineplus.gov/lab-tests/hemoglobin-a1c-hba1c-test/' }],
    );

    expect(meta.level).toBe('direct-trusted-page');
  });

  it('classifies not-yet-taught answers correctly', () => {
    const meta = buildExternalAnswerMeta(
      "I don't have a trusted reference answer for that yet. Use Teach Atlas this if you want me to learn this lookup next.",
      [{ label: 'CDC ICD-10-CM site search', url: 'https://search.cdc.gov/search/?query=test&affiliate=cdc-main' }],
    );

    expect(meta.level).toBe('not-yet-taught');
  });

  it('matches emerging drug reference policy for tianeptine topics', () => {
    const policy = getAssistantReferencePolicy("what is Neptune's Fix?");

    expect(policy.categories).toContain('emerging-drug-reference');
    expect(policy.directReferences.some((reference) => reference.url.includes('fda.gov'))).toBe(true);
    expect(policy.allowedDomains).toContain('fda.gov');
  });
});
