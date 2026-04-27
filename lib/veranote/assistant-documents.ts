import type { AssistantReferenceSource } from '@/types/assistant';

export type VeranoteDocument = {
  id: string;
  title: string;
  summary: string;
  bullets: string[];
  keywords: string[];
  reference: AssistantReferenceSource;
};

function makeInternalReference(slug: string, label: string): AssistantReferenceSource {
  return {
    label,
    url: `internal://${slug}`,
    sourceType: 'internal',
  };
}

export const VERANOTE_INTERNAL_DOCUMENTS: VeranoteDocument[] = [
  {
    id: 'assistant-scenario-matrix',
    title: 'Veranote Assistant Scenario Matrix',
    summary: 'The built-in assistant should stay embedded in Veranote, keep providers in control, preserve source fidelity, and refuse unsafe clinical-decision requests.',
    bullets: [
      'Workflow navigation, prompt preferences, review explanation, privacy/trust FAQ, and unsafe request refusal are current-priority assistant jobs.',
      'Structured actions are preferred over silent edits.',
      'The assistant should explain, guide, suggest, and help providers save reusable preferences.',
    ],
    keywords: ['assistant', 'vera', 'workflow help', 'prompt builder', 'review help', 'source fidelity', 'unsafe requests', 'presets', 'preferences'],
    reference: makeInternalReference('assistant-scenario-matrix', 'Veranote Assistant Scenario Matrix'),
  },
  {
    id: 'v1-scope',
    title: 'Veranote V1 Scope',
    summary: 'Veranote V1 should transform rough clinical input into a reviewable draft without inventing facts, replacing clinical judgment, or becoming a full EHR.',
    bullets: [
      'Visible evidence beats hidden magic.',
      'Missing is better than fabricated.',
      'One-click finalization without clinician review is out of scope.',
    ],
    keywords: ['v1', 'scope', 'reviewable draft', 'source grounded', 'review required', 'medical notes', 'psych notes', 'soap note', 'ehr'],
    reference: makeInternalReference('v1-scope', 'Veranote V1 Scope'),
  },
  {
    id: 'provider-profile-model',
    title: 'Provider Profile Model',
    summary: 'Provider profiles exist so Veranote does not assume one universal documentation style and can start from workflow-aware defaults and review emphasis.',
    bullets: [
      'Profiles shape workflow focus, review emphasis, and default starter behavior.',
      'The direction is provider-specific behavior with visible, reviewable memory.',
      'Different providers should not be forced into the same documentation lane.',
    ],
    keywords: ['provider profile', 'workflow defaults', 'review emphasis', 'provider identity', 'personalization', 'memory', 'outpatient', 'psych', 'workflow starters'],
    reference: makeInternalReference('provider-profile-model', 'Provider Profile Model'),
  },
  {
    id: 'outpatient-psych-requirements',
    title: 'Outpatient Psych Requirements',
    summary: 'Psych-first should explicitly include outpatient psych workflows and not treat inpatient admission framing as the dominant psych workflow forever.',
    bullets: [
      'Outpatient providers need different workflow starters and review emphasis.',
      'Outpatient follow-up work should not be forced into inpatient-shaped note logic.',
      'The current founder workflow is still more inpatient-heavy than ideal.',
    ],
    keywords: ['outpatient', 'psych', 'follow-up', 'workflow starters', 'inpatient heavy', 'telehealth'],
    reference: makeInternalReference('outpatient-psych-requirements', 'Outpatient Psych Requirements'),
  },
  {
    id: 'inpatient-psych-medical-necessity-national',
    title: 'Inpatient Psych Medical Necessity Documentation Standards',
    summary: 'Inpatient psychiatric approval generally depends on specific, time-anchored risk or grave-disability evidence, failed lower levels of care, concrete functional impairment, and a clear reason 24-hour treatment is needed now.',
    bullets: [
      'Avoid vague wording like unsafe or for structure without observable risk details, recent escalation, ADL impairment, or lower-level-care failure.',
      'Document why now with dates, recent events, failed outpatient or crisis attempts, and why less restrictive settings are insufficient.',
      'Functional impairment should be concrete: eating, sleep, hygiene, medication adherence, judgment, or inability to remain safe independently.',
    ],
    keywords: ['medical necessity', 'inpatient psych', 'inpatient psychiatric', 'approval', 'admission criteria', 'severity of illness', 'intensity of service', 'adl impairment', 'failed lower level of care', '24 hour care', 'why now', 'time anchoring'],
    reference: makeInternalReference('inpatient-psych-medical-necessity-national', 'Inpatient Psych Medical Necessity Documentation Standards'),
  },
  {
    id: 'louisiana-inpatient-psych-documentation',
    title: 'Louisiana Inpatient Psych Documentation Phrasing',
    summary: 'Louisiana Medicaid and managed-care inpatient psych reviews rely on documented severity of illness plus intensity of service, with concrete evidence of acute risk, grave disability, recent failed lower-level care, and why inpatient treatment is necessary now.',
    bullets: [
      'Louisiana reviewers expect objective proof for grave disability, not just the label: inability to eat, bathe, obtain shelter, manage medications, or seek care because of psychiatric impairment.',
      'Recent ED visits, crisis contacts, law-enforcement involvement, prior admissions, and failed outpatient stabilization attempts materially strengthen the medical-necessity case when dated and described.',
      'Common denial triggers are vague risk language, missing timelines, missing failed-lower-level-care history, and no clear explanation of why 24-hour inpatient treatment is required now.',
    ],
    keywords: ['louisiana', 'louisiana medicaid', 'louisiana inpatient psych', 'grave disability', 'medical necessity', 'severity of illness', 'intensity of service', 'law enforcement', 'ed visits', 'managed care', 'acute worsening'],
    reference: makeInternalReference('louisiana-inpatient-psych-documentation', 'Louisiana Inpatient Psych Documentation Phrasing'),
  },
  {
    id: 'louisiana-pec-cec-workflow',
    title: 'Louisiana PEC and CEC Workflow Boundaries',
    summary: 'PEC and CEC questions should be treated as Louisiana workflow-reference support, not automatic disposition advice. The safer Atlas role is to help providers document the risk picture, reassessment, and legal-workflow rationale clearly when they explicitly ask.',
    bullets: [
      'If a patient is already under PEC or CEC workflow, Atlas should not volunteer keep-versus-discharge advice without a direct provider question.',
      'When asked, Atlas should focus on documentation support: current risk, why-now changes, reassessment findings, monitoring rationale, and any concrete facts supporting continued hold or transition decisions.',
      'PEC and CEC answers should stay conservative, Louisiana-specific, and clearly framed as workflow/documentation support rather than legal command or final disposition authority.',
    ],
    keywords: ['louisiana', 'pec', 'cec', 'physician emergency certificate', 'coroner emergency certificate', 'emergency certificate', 'hold workflow', 'hold documentation', 'already pecd', 'already pec\'d', 'already on pec', 'louisiana hold'],
    reference: makeInternalReference('louisiana-pec-cec-workflow', 'Louisiana PEC and CEC Workflow Boundaries'),
  },
  {
    id: 'vera-implementation-plan',
    title: 'Atlas Implementation Action Plan',
    summary: 'Atlas should evolve into a durable, provider-specific assistant with provider-scoped memory, clearer safety boundaries, and inspectable long-term memory.',
    bullets: [
      'Provider-scoped Atlas memory is foundational to long-term trust.',
      'Observed workflow memory should remain reviewable and editable.',
      'Safety and context assembly should be explicit instead of hidden.',
    ],
    keywords: ['vera memory', 'provider memory', 'relationship memory', 'accepted preferences', 'observed workflow', 'safety memory'],
    reference: makeInternalReference('vera-implementation-plan', 'Atlas Implementation Action Plan'),
  },
];
