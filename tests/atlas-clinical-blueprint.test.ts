import { describe, expect, it, vi } from 'vitest';
import {
  ATLAS_CLINICIAN_REVIEW_RUBRIC,
  ATLAS_FAILURE_TAXONOMY,
  ATLAS_LANE_REGISTRY,
  arbitrateAtlasLane,
  buildAtlasBlueprintResponse,
  getAtlasAnswerContract,
  getAtlasSourceProvenance,
  validateAtlasAnswerAgainstContract,
} from '@/lib/veranote/atlas-clinical-blueprint';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'atlas-blueprint-provider',
      role: 'provider',
      email: 'atlas-blueprint@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'atlas-blueprint-provider',
    tokenSource: 'header',
  }),
}));

vi.mock('@/lib/resilience/rate-limiter', () => ({
  checkRateLimit: async () => {},
}));

import { POST } from '@/app/api/assistant/respond/route';

async function ask(message: string) {
  const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      stage: 'review',
      mode: 'workflow-help',
      message,
      context: {
        providerAddressingName: 'Atlas Blueprint Provider',
        noteType: 'Atlas Blueprint QA',
        currentDraftText: '',
      },
      recentMessages: [],
    }),
  }));

  expect(response.status).toBe(200);
  return response.json() as Promise<{
    message: string;
    answerMode?: string;
    builderFamily?: string;
    references?: Array<{ label: string; sourceType?: string }>;
    eval?: { routePriority?: string; atlasLane?: string; answerMode?: string };
  }>;
}

describe('Atlas clinical blueprint architecture', () => {
  it('defines a single lane registry with explicit precedence and contracts', () => {
    expect(ATLAS_LANE_REGISTRY[0].id).toBe('urgent_crisis');
    expect(ATLAS_LANE_REGISTRY.at(-1)?.id).toBe('abstain_clarify');
    expect(ATLAS_LANE_REGISTRY.map((lane) => lane.id)).toEqual(expect.arrayContaining([
      'medication_facts',
      'fda_approval',
      'med_lab_safety',
      'diagnostic_safety',
      'risk_suicide_documentation',
      'capacity_consent',
      'local_policy_documentation',
    ]));

    for (const lane of ATLAS_LANE_REGISTRY) {
      expect(getAtlasAnswerContract(lane.contractId).laneId).toBe(lane.id);
    }
  });

  it('keeps failure taxonomy and clinician review rubric available for QA gates', () => {
    expect(ATLAS_FAILURE_TAXONOMY).toContain('wrong_lane');
    expect(ATLAS_FAILURE_TAXONOMY).toContain('unsafe_directive');
    expect(ATLAS_FAILURE_TAXONOMY).toContain('ui_backend_mismatch');
    expect(ATLAS_CLINICIAN_REVIEW_RUBRIC).toContain('Evidence/source concordance');
    expect(ATLAS_CLINICIAN_REVIEW_RUBRIC).toContain('Potential patient harm if blindly followed');
  });

  it('arbitrates high-risk medication/lab context ahead of diagnostic labels', () => {
    const result = arbitrateAtlasLane({
      message: 'Lithium level 1.6 and confused. Is this bipolar worsening or delirium?',
    });

    expect(result.laneId).toBe('med_lab_safety');
    expect(result.confidence).toBe('high');
    expect(result.reason).toContain('Urgent safety');
  });

  it('routes direct FDA approval questions ahead of product-framework or diagnosis lanes', () => {
    const result = arbitrateAtlasLane({
      message: 'Is esketamine FDA-approved for treatment-resistant depression?',
    });

    expect(result.laneId).toBe('fda_approval');
    expect(result.suppressedFollowUp).toBe(true);
  });

  it('separates patient-specific diagnostic inference from pure concept reference', () => {
    expect(arbitrateAtlasLane({
      message: 'Patient slept 2 hours and talks fast. Bipolar?',
    }).laneId).toBe('diagnostic_safety');

    expect(arbitrateAtlasLane({
      message: 'What is bipolar II hypomania?',
    }).laneId).toBe('diagnostic_concept');
  });

  it('provides source provenance for governance and local policy lanes', () => {
    const localPolicySources = getAtlasSourceProvenance('local_policy_documentation');
    const governanceSources = getAtlasSourceProvenance('workflow_help');

    expect(localPolicySources.some((source) => source.label.includes('Louisiana'))).toBe(true);
    expect(governanceSources.some((source) => source.label.includes('FDA'))).toBe(true);
    expect(governanceSources.some((source) => source.label.includes('CHAI'))).toBe(true);
  });

  it('validates answer contracts against forbidden language', () => {
    const failure = validateAtlasAnswerAgainstContract(
      'risk_suicide_documentation',
      'The patient denies SI, so this is low risk and safe to discharge.',
    );
    const pass = validateAtlasAnswerAgainstContract(
      'risk_suicide_documentation',
      'Denial alone does not establish absence of risk. Keep denial and collateral concern side by side.',
    );

    expect(failure.passed).toBe(false);
    expect(failure.violations).toEqual(expect.arrayContaining([
      'forbidden phrase: low risk',
      'forbidden phrase: safe to discharge',
    ]));
    expect(pass.passed).toBe(true);
  });

  it('builds contracted risk documentation payloads without false reassurance', () => {
    const { arbitration, payload } = buildAtlasBlueprintResponse({
      message: 'Draft risk wording: patient denies SI but collateral reports goodbye texts. Can I use low-risk wording?',
    });

    expect(arbitration.laneId).toBe('risk_suicide_documentation');
    expect(payload?.message).toContain('low suicide-risk wording is not supported here');
    expect(payload?.message).toContain('Current uncertainty or denial does not erase the higher-risk statements');
    expect(payload?.message).not.toContain('safe to discharge');
    expect(payload?.builderFamily).toBe('risk');
  });

  it('routes local-policy questions through the live assistant endpoint with internal and source references', async () => {
    const payload = await ask('What does Louisiana need for inpatient psych approval?');

    expect(payload.eval?.routePriority).toBe('atlas-blueprint:local_policy_documentation');
    expect(payload.eval?.atlasLane).toBe('local_policy_documentation');
    expect(payload.message).toContain('Louisiana reviewers usually need more than broad risk language');
    expect(payload.references?.some((reference) => reference.sourceType === 'internal' && reference.label.includes('Louisiana'))).toBe(true);
  });

  it('routes documentation-capacity questions through the decision-specific contract', async () => {
    const payload = await ask('Help me document capacity: patient refuses admission, family says unsafe, patient says fine.');

    expect(payload.eval?.routePriority).toBe('atlas-blueprint:capacity_consent');
    expect(payload.answerMode).toBe('clinical_explanation');
    expect(payload.builderFamily).toBe('capacity');
    expect(payload.message).toContain('capacity and consent wording should stay decision-specific');
    expect(payload.message).not.toContain('no capacity full stop');
  });

  it('does not hijack existing direct medication approval answers', async () => {
    const payload = await ask('Is esketamine FDA-approved for treatment-resistant depression?');

    expect(payload.eval?.routePriority).toBe('medication-reference-direct');
    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('FDA-approved');
    expect(payload.message).not.toContain('Local-policy documentation lane');
  });
});
