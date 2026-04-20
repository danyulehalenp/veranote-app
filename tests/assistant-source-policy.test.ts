import { describe, expect, it } from 'vitest';
import { describeAssistantReferencePolicy, getAssistantReferencePolicy } from '@/lib/veranote/assistant-source-policy';

describe('assistant source policy', () => {
  it('keeps coding queries inside CDC and CMS domains', () => {
    const policy = getAssistantReferencePolicy('what modifier do i use for recurrent severe mdd billing?');

    expect(policy.categories).toContain('coding-reference');
    expect(policy.allowedDomains).toEqual(expect.arrayContaining(['cdc.gov', 'cms.gov']));
    expect(policy.allowedDomains).not.toContain('nimh.nih.gov');
    expect(policy.allowedDomains).not.toContain('medlineplus.gov');
  });

  it('keeps lab queries inside MedlinePlus domains', () => {
    const policy = getAssistantReferencePolicy('what is A1c?');

    expect(policy.categories).toContain('lab-reference');
    expect(policy.allowedDomains).toEqual(['medlineplus.gov']);
  });

  it('keeps psych screening queries inside NIMH domains', () => {
    const policy = getAssistantReferencePolicy('what is PHQ-9?');

    expect(policy.categories).toContain('psych-reference');
    expect(policy.allowedDomains).toEqual(['nimh.nih.gov']);
  });

  it('keeps psych medication queries inside MedlinePlus domains', () => {
    const policy = getAssistantReferencePolicy('what are the side effects of olanzapine?');

    expect(policy.categories).toContain('psych-med-reference');
    expect(policy.allowedDomains).toEqual(['medlineplus.gov']);
  });

  it('keeps documentation structure queries inside CMS domains', () => {
    const policy = getAssistantReferencePolicy('what is the difference between h&p and consult?');

    expect(policy.categories).toContain('documentation-structure');
    expect(policy.allowedDomains).toEqual(['cms.gov']);
  });

  it('keeps newer psych diagnosis coding queries inside CDC and CMS domains', () => {
    const policy = getAssistantReferencePolicy('what is the icd 10 for dissociative identity disorder?');

    expect(policy.categories).toContain('coding-reference');
    expect(policy.allowedDomains).toEqual(expect.arrayContaining(['cdc.gov', 'cms.gov']));
  });

  it('keeps expanded psych-family coding queries inside CDC and CMS domains', () => {
    const policy = getAssistantReferencePolicy('what is the diagnosis code for gender dysphoria?');

    expect(policy.categories).toContain('coding-reference');
    expect(policy.allowedDomains).toEqual(expect.arrayContaining(['cdc.gov', 'cms.gov']));
  });

  it('keeps mood, disruptive, and substance branch coding queries inside CDC and CMS domains', () => {
    const policy = getAssistantReferencePolicy('what is the icd 10 for oppositional defiant disorder and alcohol dependence in remission?');

    expect(policy.categories).toContain('coding-reference');
    expect(policy.allowedDomains).toEqual(expect.arrayContaining(['cdc.gov', 'cms.gov']));
  });

  it('keeps remission and impulse-control coding queries inside CDC and CMS domains', () => {
    const policy = getAssistantReferencePolicy('what is the diagnosis code for recurrent major depressive disorder in full remission and intermittent explosive disorder?');

    expect(policy.categories).toContain('coding-reference');
    expect(policy.allowedDomains).toEqual(expect.arrayContaining(['cdc.gov', 'cms.gov']));
  });

  it('builds a readable policy preview for a concrete lookup', () => {
    const preview = describeAssistantReferencePolicy('what is A1c?');

    expect(preview.title).toBe('Lab reference');
    expect(preview.domainLabels).toEqual(['MedlinePlus']);
  });

  it('builds a generic policy preview when no query is active yet', () => {
    const preview = describeAssistantReferencePolicy();

    expect(preview.title).toBe('Trusted lookup only');
    expect(preview.domainLabels).toEqual(expect.arrayContaining(['CDC', 'CMS', 'MedlinePlus', 'NIMH']));
  });
});
