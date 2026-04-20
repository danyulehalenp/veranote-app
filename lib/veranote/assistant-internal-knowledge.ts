import type { AssistantApiContext, AssistantReferenceSource, AssistantResponsePayload } from '@/types/assistant';
import { buildRetrievedInternalKnowledgeHelp } from '@/lib/veranote/assistant-internal-retrieval';

type InternalKnowledgeEntry = {
  id: string;
  title: string;
  match: (normalizedMessage: string) => boolean;
  build: (context?: AssistantApiContext) => AssistantResponsePayload;
};

const INTERNAL_REFS = {
  scenarioMatrix: makeInternalReference('assistant-scenario-matrix', 'Veranote Assistant Scenario Matrix'),
  v1Scope: makeInternalReference('v1-scope', 'Veranote V1 Scope'),
  providerProfiles: makeInternalReference('provider-profile-model', 'Provider Profile Model'),
  outpatientRequirements: makeInternalReference('outpatient-psych-requirements', 'Outpatient Psych Requirements'),
  inpatientMedicalNecessity: makeInternalReference('inpatient-psych-medical-necessity-national', 'Inpatient Psych Medical Necessity Documentation Standards'),
  louisianaInpatientPsych: makeInternalReference('louisiana-inpatient-psych-documentation', 'Louisiana Inpatient Psych Documentation Phrasing'),
  louisianaPecCec: makeInternalReference('louisiana-pec-cec-workflow', 'Louisiana PEC and CEC Workflow Boundaries'),
  veraPlan: makeInternalReference('vera-implementation-plan', 'Vera Implementation Action Plan'),
} satisfies Record<string, AssistantReferenceSource>;

const INTERNAL_KNOWLEDGE_ENTRIES: InternalKnowledgeEntry[] = [
  {
    id: 'presets-vs-preferences',
    title: 'Presets versus prompt preferences',
    match: (normalizedMessage) => (
      hasKeyword(normalizedMessage, ['difference between presets and prompt preferences', 'difference between preset and prompt preferences'])
      || (hasKeyword(normalizedMessage, ['preset', 'presets']) && hasKeyword(normalizedMessage, ['prompt preference', 'prompt preferences', 'note preferences']))
    ),
    build: () => ({
      message: 'Prompt and note preferences describe how a note lane should usually behave. A preset packages repeatable setup like section plan, output style, and destination behavior so you can reuse it quickly for the same note type.',
      suggestions: [
        'Use preferences to shape the lane’s behavior over time.',
        'Use presets when you want a reusable ready-to-load setup for that note type.',
      ],
      references: [INTERNAL_REFS.scenarioMatrix],
    }),
  },
  {
    id: 'v1-scope-note-types',
    title: 'V1 scope and supported note lanes',
    match: (normalizedMessage) => (
      hasKeyword(normalizedMessage, ['what note types are in scope', 'what note types are supported', 'what can veranote do', 'what is veranote trying to do'])
      || (hasKeyword(normalizedMessage, ['v1']) && hasKeyword(normalizedMessage, ['scope', 'supported']))
    ),
    build: () => ({
      message: 'Veranote V1 is meant to turn messy source-based input into a more structured, reviewable draft without inventing facts. The current wedge includes psychiatry follow-up notes, therapy or progress notes, general medical follow-up or SOAP-style notes, and inpatient psych progress notes.',
      suggestions: [
        'V1 is focused on grounded drafting and review, not full EHR replacement.',
        'One-click finalization without clinician review is explicitly out of scope.',
      ],
      references: [INTERNAL_REFS.v1Scope],
    }),
  },
  {
    id: 'review-required',
    title: 'Why review is required',
    match: (normalizedMessage) => (
      hasKeyword(normalizedMessage, ['why is review required', 'why do i have to review', 'why does review matter', 'why can t vera finalize'])
      || (hasKeyword(normalizedMessage, ['review']) && hasKeyword(normalizedMessage, ['required', 'matter']))
    ),
    build: () => ({
      message: 'Review is required because Veranote is designed to produce a reviewable draft, not a silent final note. The product promise is visible evidence, source-grounded drafting, and clinician control when wording, timeline, attribution, or uncertainty still need judgment.',
      suggestions: [
        'Visible evidence beats hidden magic in the current product model.',
        'If the source is thin, the note should stay thin instead of sounding more complete than the evidence supports.',
      ],
      references: [INTERNAL_REFS.v1Scope, INTERNAL_REFS.scenarioMatrix],
    }),
  },
  {
    id: 'source-fidelity',
    title: 'Source fidelity',
    match: (normalizedMessage) => (
      hasKeyword(normalizedMessage, ['what does source fidelity mean', 'what is source fidelity', 'what does source-first mean'])
      || (hasKeyword(normalizedMessage, ['source']) && hasKeyword(normalizedMessage, ['fidelity', 'source-first']))
    ),
    build: () => ({
      message: 'In Veranote, source fidelity means the draft should stay anchored to what was actually provided. It should preserve negations, uncertainty, timing, and attribution rather than smoothing them into cleaner but less faithful language.',
      suggestions: [
        'Missing or unclear is better than invented.',
        'Review tools should improve wording, not add unsupported content.',
      ],
      references: [INTERNAL_REFS.v1Scope],
    }),
  },
  {
    id: 'provider-profile',
    title: 'Provider profiles',
    match: (normalizedMessage) => (
      hasKeyword(normalizedMessage, ['what is a provider profile', 'how do provider profiles work', 'what does my provider profile do'])
      || (hasKeyword(normalizedMessage, ['provider profile']) && hasKeyword(normalizedMessage, ['work', 'do']))
    ),
    build: () => ({
      message: 'Provider profiles let Veranote start from different workflow-aware defaults instead of assuming one universal documentation style. They shape things like primary workflow emphasis, review emphasis, and which note lanes feel most native for that provider.',
      suggestions: [
        'Profiles are meant to reflect real differences in provider workflow, not cosmetic labels.',
        'The current direction is provider-specific behavior with visible, reviewable memory rather than hidden adaptation.',
      ],
      references: [INTERNAL_REFS.providerProfiles],
    }),
  },
  {
    id: 'outpatient-psych',
    title: 'Outpatient psych support',
    match: (normalizedMessage) => (
      hasKeyword(normalizedMessage, ['does veranote support outpatient psych', 'is veranote only inpatient', 'outpatient psych'])
      || (hasKeyword(normalizedMessage, ['outpatient']) && hasKeyword(normalizedMessage, ['support', 'psych']))
    ),
    build: () => ({
      message: 'Veranote is psych-first, but that is not supposed to mean inpatient-only. The product direction explicitly says outpatient psych workflows need to be supported well too, with different workflow starters, review emphasis, and note-shaping behavior.',
      suggestions: [
        'Outpatient follow-up work should not be forced into inpatient-shaped note logic.',
        'The current founder workflow is still more inpatient-heavy than ideal, which is a known product correction area.',
      ],
      references: [INTERNAL_REFS.outpatientRequirements, INTERNAL_REFS.providerProfiles],
    }),
  },
  {
    id: 'louisiana-inpatient-psych-documentation',
    title: 'Louisiana inpatient psych documentation guidance',
    match: (normalizedMessage) => (
      hasKeyword(normalizedMessage, ['louisiana inpatient psych', 'louisiana medicaid inpatient psych', 'medical necessity for inpatient psych', 'what does louisiana need for inpatient psych approval'])
      || (hasKeyword(normalizedMessage, ['louisiana']) && hasKeyword(normalizedMessage, ['inpatient psych', 'medical necessity', 'grave disability', 'approval']))
    ),
    build: () => ({
      message: 'For inpatient psych documentation, Louisiana reviewers usually need more than broad risk language. The strongest notes make severity of illness concrete with acute risk or grave-disability facts, show why-now escalation with dates, document failed less-restrictive care, and clearly justify why 24-hour treatment is necessary now.',
      suggestions: [
        'If grave disability is part of the case, show the objective basic-needs failure instead of using the label alone.',
        'Recent ED visits, crisis contacts, prior admissions, or failed outpatient stabilization attempts should be dated and described when they matter.',
      ],
      references: [INTERNAL_REFS.louisianaInpatientPsych, INTERNAL_REFS.inpatientMedicalNecessity],
    }),
  },
  {
    id: 'louisiana-pec-cec-workflow',
    title: 'Louisiana PEC and CEC workflow guidance',
    match: (normalizedMessage) => (
      hasKeyword(normalizedMessage, ['what is a pec', 'what is a cec', 'what does pec mean', 'what does cec mean', 'physician emergency certificate', 'coroner emergency certificate'])
      || (
        hasKeyword(normalizedMessage, ['louisiana'])
        && hasKeyword(normalizedMessage, ['pec', 'cec', 'emergency certificate', 'hold'])
      )
      || hasKeyword(normalizedMessage, ['already pecd', 'already pec\'d', 'already on pec', 'what should i document if the patient is already pecd', 'what should i document if the patient is already on a pec'])
    ),
    build: () => ({
      message: 'For Vera, PEC and CEC should be handled as Louisiana workflow-reference support, not automatic disposition advice. If the provider asks, the safer answer is to focus on the current risk picture, reassessment findings, monitoring rationale, and the concrete facts supporting continued hold workflow or any change in status.',
      suggestions: [
        'If the patient is already under PEC or CEC workflow, keep the documentation focused on current risk, why-now reassessment, and why continued monitoring or transition is being considered.',
        'Vera should not volunteer keep-versus-discharge advice on her own. She should stay in documentation and workflow-support mode unless the provider asks directly.',
      ],
      references: [INTERNAL_REFS.louisianaPecCec, INTERNAL_REFS.louisianaInpatientPsych],
    }),
  },
  {
    id: 'medical-expansion',
    title: 'Medical note support and expansion',
    match: (normalizedMessage) => (
      hasKeyword(normalizedMessage, ['can veranote do medical notes', 'is veranote only psych', 'will veranote expand to medicine'])
      || (hasKeyword(normalizedMessage, ['medical']) && hasKeyword(normalizedMessage, ['notes', 'expand', 'medicine']))
    ),
    build: () => ({
      message: 'Veranote started psych-first, but the current V1 scope already includes general medical follow-up and SOAP-style note support. The broader direction is still to expand across medicine carefully, without losing the review-first, source-faithful core.',
      suggestions: [
        'The expansion goal is broader medicine with specialty-aware workflows, not generic note generation.',
        'The right path is to keep the trustworthy drafting and review model intact as note types expand.',
      ],
      references: [INTERNAL_REFS.v1Scope, INTERNAL_REFS.veraPlan],
    }),
  },
  {
    id: 'vera-memory-model',
    title: 'Vera memory and learning',
    match: (normalizedMessage) => (
      hasKeyword(normalizedMessage, ['how does vera remember me', 'does vera learn my preferences', 'how does vera memory work'])
      || (hasKeyword(normalizedMessage, ['vera']) && hasKeyword(normalizedMessage, ['memory', 'preferences', 'remember']))
    ),
    build: () => ({
      message: 'The Vera direction is provider-specific memory that stays transparent and reviewable. That means relationship memory, accepted preferences, observed workflow patterns, and safety memory should be visible to the provider instead of becoming hidden behavior drift.',
      suggestions: [
        'Observed patterns should still be inspectable, editable, and resettable.',
        'The goal is durable provider memory without silent unsafe adaptation.',
      ],
      references: [INTERNAL_REFS.veraPlan, INTERNAL_REFS.providerProfiles],
    }),
  },
];

export function buildInternalKnowledgeHelp(normalizedMessage: string, context?: AssistantApiContext): AssistantResponsePayload | null {
  const normalized = normalizedMessage.toLowerCase();
  const match = INTERNAL_KNOWLEDGE_ENTRIES.find((entry) => entry.match(normalized));
  if (match) {
    return match.build(context);
  }

  return buildRetrievedInternalKnowledgeHelp(normalized, context);
}

function makeInternalReference(slug: string, label: string): AssistantReferenceSource {
  return {
    label,
    url: `internal://${slug}`,
    sourceType: 'internal',
  };
}

function hasKeyword(message: string, keywords: string[]) {
  return keywords.some((keyword) => message.includes(keyword));
}
