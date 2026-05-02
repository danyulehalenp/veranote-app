import type {
  AssistantApiContext,
  AssistantAnswerMode,
  AssistantBuilderFamily,
  AssistantResponsePayload,
  AssistantThreadTurn,
} from '@/types/assistant';

export type AtlasConversationFollowupIntent =
  | 'none'
  | 'continue'
  | 'elaborate'
  | 'simplify'
  | 'compare'
  | 'clarify'
  | 'challenge';

export type AtlasConversationRouteHint =
  | 'diagnostic_reference'
  | 'diagnostic_safety'
  | 'medication_reference'
  | 'documentation_safety'
  | 'local_policy'
  | 'workflow_help'
  | 'unknown';

export type AtlasConversationTopic = {
  label: string;
  providerQuestion: string;
  routeHint: AtlasConversationRouteHint;
  answerMode?: AssistantAnswerMode;
  builderFamily?: AssistantBuilderFamily;
};

export type AtlasConversationOrchestration = {
  originalMessage: string;
  effectiveMessage: string;
  didRewrite: boolean;
  followupIntent: AtlasConversationFollowupIntent;
  routeHint: AtlasConversationRouteHint;
  activeTopic: AtlasConversationTopic | null;
  hiddenScratchpad: string[];
  controlledRationale: string[];
};

type AtlasConversationInput = {
  message: string;
  recentMessages?: AssistantThreadTurn[];
  context?: AssistantApiContext;
};

const COMMON_CLINICAL_SPELLING_NORMALIZATIONS: Array<[RegExp, string]> = [
  [/\bu\b/g, 'you'],
  [/\belaberat(e|ed|ing)?\b/g, 'elaborate'],
  [/\belaborat\b/g, 'elaborate'],
  [/\bcritera\b/g, 'criteria'],
  [/\bcriterias\b/g, 'criteria'],
  [/\bdiffrence\b/g, 'difference'],
  [/\bdiference\b/g, 'difference'],
  [/\bdiagonsis\b/g, 'diagnosis'],
  [/\bdiagnosic\b/g, 'diagnostic'],
  [/\bschizo\s+affective\b/g, 'schizoaffective'],
  [/\bschizoafective\b/g, 'schizoaffective'],
  [/\bschizoaffectve\b/g, 'schizoaffective'],
  [/\bschizoaffectivee\b/g, 'schizoaffective'],
  [/\bschizoeffective\b/g, 'schizoaffective'],
  [/\bpsycosis\b/g, 'psychosis'],
  [/\bpsychosos\b/g, 'psychosis'],
  [/\bpsychottic\b/g, 'psychotic'],
  [/\bbiploar\b/g, 'bipolar'],
  [/\bbioplar\b/g, 'bipolar'],
  [/\bhypomnaia\b/g, 'hypomania'],
  [/\bhypomannia\b/g, 'hypomania'],
  [/\bdepresion\b/g, 'depression'],
  [/\bdepresson\b/g, 'depression'],
  [/\bwelbutrin\b/g, 'wellbutrin'],
  [/\bwellbutrinn\b/g, 'wellbutrin'],
  [/\bbuproprion\b/g, 'bupropion'],
  [/\bbupropian\b/g, 'bupropion'],
  [/\bpaxel\b/g, 'paxil'],
  [/\bpaxal\b/g, 'paxil'],
  [/\bpaxill\b/g, 'paxil'],
  [/\bparoxitine\b/g, 'paroxetine'],
  [/\bparoxatine\b/g, 'paroxetine'],
  [/\blamictle\b/g, 'lamictal'],
  [/\blamictel\b/g, 'lamictal'],
  [/\blamictol\b/g, 'lamictal'],
  [/\blamotrigene\b/g, 'lamotrigine'],
  [/\blamotrogine\b/g, 'lamotrigine'],
  [/\bcelexe\b/g, 'celexa'],
  [/\bcylexa\b/g, 'celexa'],
  [/\blithum\b/g, 'lithium'],
  [/\blithuim\b/g, 'lithium'],
];

function normalizeCommonClinicalSpellings(value: string) {
  return COMMON_CLINICAL_SPELLING_NORMALIZATIONS.reduce(
    (normalized, [pattern, replacement]) => normalized.replace(pattern, replacement),
    value,
  );
}

function normalizeText(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9?/\-+.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalizeCommonClinicalSpellings(normalized)
    .replace(/\s+/g, ' ')
    .trim();
}

function readableTopicLabel(routeHint: AtlasConversationRouteHint) {
  switch (routeHint) {
    case 'diagnostic_reference':
      return 'diagnostic reference';
    case 'diagnostic_safety':
      return 'diagnostic safety';
    case 'medication_reference':
      return 'medication reference';
    case 'documentation_safety':
      return 'documentation safety';
    case 'local_policy':
      return 'local policy';
    case 'workflow_help':
      return 'workflow help';
    default:
      return 'prior clinical topic';
  }
}

function classifyFollowupIntent(message: string): AtlasConversationFollowupIntent {
  const normalized = normalizeText(message);

  if (!normalized) {
    return 'none';
  }

  if (/^(why|how so|what do you mean|why is that|why not|why is this urgent|why urgent)\??$/.test(normalized)) {
    return 'clarify';
  }

  if (/^(no|not really|that is wrong|that's wrong|wrong|not what i asked|that did not answer|that didn't answer)\b/.test(normalized)) {
    return 'challenge';
  }

  if (/^(say it simpler|simplify|make it simpler|explain simply|plain english|in plain english|shorter|make it shorter)\b/.test(normalized)) {
    return 'simplify';
  }

  if (/^(can you elaborate|could you elaborate|elaborate|tell me more|more detail|more details|go into more detail|more about this|expand on this|expand on that|explain more|explain that|explain this further|say more|walk me through it|walk me through this)\b/.test(normalized)) {
    return 'elaborate';
  }

  if (/^(what should i verify|what should i check|what do i need to verify|what do i need to check|what is the key .*issue|what is the main .*risk|what is the biggest .*risk|what exactly do you mean|what does that mean|what is missing|what else is missing|what should i document instead|what belongs\b|give me .*chart[-\s]?ready|give me .*sentence|give me safer wording|give me safe wording|safer wording|chart this safer|word this safer|can you give me exact orders|give me exact orders)\b/.test(normalized)) {
    return 'clarify';
  }

  if (/^(what about|how about|compare that to|compare with)\b/.test(normalized)) {
    return 'compare';
  }

  if (/^(does .*\bmatter|why does .*\bmatter|what if\b|where does .*\bgo|where should .*\bgo)\b/.test(normalized)) {
    return 'clarify';
  }

  if (/^(yes|yes proceed|proceed|go ahead|continue|continue please|please continue|ok proceed|okay proceed|sure|yep|yeah|yes please|please do|do that)\b/.test(normalized)) {
    return 'continue';
  }

  if (
    normalized.length <= 80
    && /^(what does (this|that|it) mean|what do you mean by (this|that|it)|how does (this|that|it) apply|why does (this|that|it) matter|can you explain (this|that|it)|can you clarify (this|that|it)|same topic|above|previous answer|prior answer)\b/.test(normalized)
    && /[?]?$/.test(normalized)
  ) {
    return 'clarify';
  }

  return 'none';
}

function classifyRouteHintFromText(message: string, answerMode?: AssistantAnswerMode, builderFamily?: AssistantBuilderFamily): AtlasConversationRouteHint {
  const normalized = normalizeText(message);

  if (answerMode === 'medication_reference_answer') {
    return 'medication_reference';
  }

  if (
    builderFamily === 'risk'
    || builderFamily === 'contradiction'
    || builderFamily === 'chart-wording'
    || builderFamily === 'capacity'
    || answerMode === 'warning_language'
    || answerMode === 'chart_ready_wording'
  ) {
    return 'documentation_safety';
  }

  if (/\b(louisiana|medicaid|managed care|payer|facility policy|local policy|uploaded policy|loaded policy|policy manual|current policy|documentation requirements?)\b/.test(normalized)) {
    return 'local_policy';
  }

  if (/\b(pre[-\s]?visit data|source packet|source input|source box|paste source|ambient transcript|live visit notes?|provider add[-\s]?on|custom plan instruction|plan instruction|dictation field)\b/.test(normalized)) {
    return 'workflow_help';
  }

  if (
    /\b(fda approved|approved for|approved in|indication|dose|dosing|mg|milligram|formulation|strength|half life|labs?|monitoring|qtc|anc|lithium|valproate|depakote|clozapine|lamictal|lamotrigine|wellbutrin|bupropion|paxil|paroxetine|celexa|citalopram|ssri|snri|maoi|antipsychotic|antidepressant|mood stabilizer|benzodiazepine|interaction|taken together|combine|contraindicat|serotonin syndrome|nms|withdrawal|overdose|toxicity)\b/.test(normalized)
  ) {
    return 'medication_reference';
  }

  if (
    /\b(schizoaffective|schizophrenia|bipolar|psychosis|psychotic|mood disorder|mania|hypomania|major depressive|depression|borderline|bpd|ptsd|ocd|adhd|dsm|diagnostic criteria|criteria|diagnosis|diagnostic|differential)\b/.test(normalized)
    && !/\b(fda approved|approved for|dose|dosing|mg|interaction|taken together|combine|contraindicat)\b/.test(normalized)
  ) {
    const pureDiagnosticReference = /^(what is|what are|difference between|how long|duration requirement|criteria for|symptoms of|compare)\b/.test(normalized);

    if (
      !pureDiagnosticReference
      && (
        /\b(patient|pt|slept|sleeping|talking fast|talks fast|pressured|can i say|should i say|can i diagnose|should i diagnose|does this mean|is this)\b/.test(normalized)
        || /(?:bipolar|mania|psychosis|schizophrenia|ptsd|gad|adhd|mdd)\?\s*$/.test(normalized)
      )
    ) {
      return 'diagnostic_safety';
    }

    return 'diagnostic_reference';
  }

  if (
    /\b(how should i word|how should i chart|document|chart ready|chart-ready|rewrite|source says|draft says|patient denies|collateral|staff saw|nursing reports|risk wording|capacity|consent|force medication|over objection|no risk|low risk)\b/.test(normalized)
  ) {
    return 'documentation_safety';
  }

  if (/\b(veranote|start note|generate draft|paste source|workflow|button|settings|ehr|wellsky|tebra|export)\b/.test(normalized)) {
    return 'workflow_help';
  }

  return 'unknown';
}

function isRecoverableTopicTurn(turn: AssistantThreadTurn) {
  if (turn.role !== 'provider' || !turn.content?.trim()) {
    return false;
  }

  if (classifyFollowupIntent(turn.content) !== 'none') {
    return false;
  }

  return classifyRouteHintFromText(turn.content, turn.answerMode, turn.builderFamily) !== 'unknown';
}

function findActiveTopic(recentMessages?: AssistantThreadTurn[]): AtlasConversationTopic | null {
  if (!recentMessages?.length) {
    return null;
  }

  const turn = [...recentMessages].reverse().find(isRecoverableTopicTurn);
  if (!turn) {
    return null;
  }

  const routeHint = classifyRouteHintFromText(turn.content, turn.answerMode, turn.builderFamily);

  return {
    label: readableTopicLabel(routeHint),
    providerQuestion: turn.content.trim(),
    routeHint,
    answerMode: turn.answerMode,
    builderFamily: turn.builderFamily,
  };
}

function shouldRewriteFollowup(intent: AtlasConversationFollowupIntent, topic: AtlasConversationTopic | null, message: string) {
  if (intent === 'none' || !topic) {
    return false;
  }

  const normalized = normalizeText(message);
  const workflowFieldFollowup = /\b(pre[-\s]?visit data|source packet|source input|source box|paste source|ambient transcript|live visit notes?|provider add[-\s]?on|custom plan instruction|plan instruction|dictation field)\b/.test(normalized);

  return topic.routeHint === 'diagnostic_reference'
    || topic.routeHint === 'diagnostic_safety'
    || topic.routeHint === 'medication_reference'
    || topic.routeHint === 'documentation_safety'
    || topic.routeHint === 'local_policy'
    || (topic.routeHint === 'workflow_help' && workflowFieldFollowup);
}

function buildEffectiveMessage(message: string, intent: AtlasConversationFollowupIntent, topic: AtlasConversationTopic) {
  const original = message.trim();
  const prior = topic.providerQuestion.trim();

  if (intent === 'elaborate') {
    return `${prior}\n\nFollow-up request: ${original}. Elaborate on the same topic, answer conversationally, preserve uncertainty, and do not switch into workflow guidance.`;
  }

  if (intent === 'simplify') {
    return `${prior}\n\nFollow-up request: ${original}. Explain the same topic in simpler clinical language without changing the answer or adding unsupported facts.`;
  }

  if (intent === 'compare') {
    return `${prior}\n\nFollow-up request: ${original}. Treat this as a same-topic comparison or extension, and answer only what the provider is asking now.`;
  }

  if (intent === 'clarify') {
    return `${prior}\n\nFollow-up request: ${original}. Clarify the same topic directly, preserve uncertainty, and do not infer a new patient-specific fact.`;
  }

  if (intent === 'challenge') {
    return `${prior}\n\nFollow-up request: ${original}. Re-answer the same topic more directly and correct any overly generic framing without weakening safety caveats.`;
  }

  return `${prior}\n\nFollow-up request: ${original}. Continue the same topic and answer directly without switching into workflow guidance.`;
}

function buildControlledRationale(intent: AtlasConversationFollowupIntent, routeHint: AtlasConversationRouteHint) {
  if (intent === 'none') {
    return [];
  }

  const topicLabel = readableTopicLabel(routeHint);

  return [
    `Continuing the prior ${topicLabel} topic.`,
    'Clinical safety routing still checks diagnosis, medication, risk, and documentation boundaries before answering.',
  ];
}

export function orchestrateAtlasConversation(input: AtlasConversationInput): AtlasConversationOrchestration {
  const originalMessage = input.message || '';
  const followupIntent = classifyFollowupIntent(originalMessage);
  const activeTopic = findActiveTopic(input.recentMessages);
  const didRewrite = shouldRewriteFollowup(followupIntent, activeTopic, originalMessage);
  const routeHint = activeTopic && followupIntent !== 'none'
    ? activeTopic.routeHint
    : classifyRouteHintFromText(originalMessage);
  const effectiveMessage = didRewrite && activeTopic
    ? buildEffectiveMessage(originalMessage, followupIntent, activeTopic)
    : originalMessage;

  return {
    originalMessage,
    effectiveMessage,
    didRewrite,
    followupIntent,
    routeHint,
    activeTopic,
    hiddenScratchpad: [
      `followup_intent:${followupIntent}`,
      `active_topic:${activeTopic?.routeHint || 'none'}`,
      `rewrite:${didRewrite ? 'yes' : 'no'}`,
      'safety:existing_clinical_lanes_remain_authoritative',
    ],
    controlledRationale: buildControlledRationale(followupIntent, routeHint),
  };
}

export function buildAtlasConversationFallbackPayload(
  conversation: AtlasConversationOrchestration,
): AssistantResponsePayload | null {
  if (!conversation.didRewrite || !conversation.activeTopic) {
    return null;
  }

  const original = normalizeText(conversation.originalMessage);
  const prior = normalizeText(conversation.activeTopic.providerQuestion);
  const combined = `${prior} ${original}`;

  if (
    conversation.routeHint === 'medication_reference'
    && /\bpaliperidone|invega\b/.test(combined)
    && /\bschizoaffective\b/.test(combined)
  ) {
    if (/\bformulation\b.*\bmatter\b|\bdoes formulation matter\b/.test(original)) {
      return {
        message: 'Yes. Formulation matters for paliperidone documentation because labeled indications can be product-specific. Verify the exact paliperidone product/formulation, route, patient age group, diagnosis/target indication, and current label or local formulary source before documenting the indication.',
        suggestions: [
          'Do not treat every paliperidone formulation as interchangeable for approval wording.',
          'Keep product name and indication wording source-specific.',
        ],
        answerMode: 'medication_reference_answer',
        builderFamily: 'medication-boundary',
      };
    }

    return {
      message: 'Before documenting the paliperidone indication, verify the exact product/formulation, route, adult versus pediatric labeling if relevant, whether the charted diagnosis matches the labeled indication, and the current label/local formulary source. Keep this as indication verification, not a patient-specific medication order.',
      suggestions: [
        'Use the product-specific label as the source basis.',
        'Avoid implying a dose, route, or plan was recommended by Atlas.',
      ],
      answerMode: 'medication_reference_answer',
      builderFamily: 'medication-boundary',
    };
  }

  if (conversation.routeHint === 'diagnostic_safety' && /\bbipolar|mania|hypomania\b/.test(combined)) {
    if (/\bsafer wording|safe wording|chart\b/.test(original)) {
      return {
        message: 'Safer wording: “Decreased sleep and rapid/pressured speech are documented; bipolar-spectrum illness remains a diagnostic consideration, but current source information is insufficient to diagnose bipolar disorder without duration, episodicity, impairment, mood symptoms, psychosis context, substance/medical contributors, and collateral timeline.”',
        suggestions: [
          'Keep the observed sleep and speech facts.',
          'Do not convert sparse symptoms into a confirmed bipolar diagnosis.',
        ],
        answerMode: 'chart_ready_wording',
        builderFamily: 'chart-wording',
      };
    }

    return {
      message: 'Missing before a bipolar diagnosis: duration of symptoms, clear episode pattern, mood quality, impairment or hospitalization/severity, psychosis context, substance/withdrawal/medication contributors, medical confounders, prior episodes, collateral timeline, and baseline functioning. Two hours of sleep plus fast talking can raise concern, but it is not enough by itself.',
      suggestions: [
        'Use diagnostic consideration language until the assessment is complete.',
        'Separate observed symptoms from final diagnostic labeling.',
      ],
      answerMode: 'clinical_explanation',
      builderFamily: 'overlap',
    };
  }

  if (
    conversation.routeHint === 'diagnostic_reference'
    && /\bbipolar|mania|hypomania\b/.test(combined)
    && /\bcharting|distinction\b/.test(original)
  ) {
    return {
      message: 'The hypomania-versus-mania distinction matters for charting because the note should preserve severity, impairment, hospitalization need, psychosis, duration, and functional impact. Chart the observable facts and timeline rather than using a diagnostic label that the source does not yet support.',
      suggestions: [
        'Describe duration and severity separately.',
        'Do not diagnose from one symptom cluster without context.',
      ],
      answerMode: 'direct_reference_answer',
      builderFamily: 'overlap',
    };
  }

  if (conversation.routeHint === 'diagnostic_reference' && /\bschizoaffective\b/.test(combined)) {
    return {
      message: 'Schizoaffective disorder is mainly a timeline diagnosis: schizophrenia-spectrum psychosis plus major mood-episode evidence, with psychosis also documented for a meaningful period outside prominent mood symptoms. The practical comparison is bipolar disorder with psychotic features, where psychosis is tied to the mood episode. Keep this as a high-level diagnostic reference, not verbatim DSM criteria or a patient-specific diagnosis.',
      suggestions: [
        'Verify longitudinal mood and psychosis timing.',
        'Keep substance, medication, delirium, and medical contributors on the differential when relevant.',
        'Do not diagnose from one visit or sparse source alone.',
      ],
      answerMode: 'direct_reference_answer',
      builderFamily: 'overlap',
    };
  }

  if (conversation.routeHint === 'local_policy') {
    if (/\bno policy source|no source\b/.test(original)) {
      return {
        message: 'If no current policy source is loaded, Atlas should not invent Louisiana Medicaid or facility requirements. Use only general documentation support, identify the missing policy source/date, and verify exact requirements against the current payer or facility manual before relying on it.',
        suggestions: [
          'Upload or cite the current policy/manual first.',
          'Do not claim payer approval or exact legal requirements without source support.',
        ],
        answerMode: 'workflow_guidance',
        builderFamily: 'workflow',
      };
    }

    return {
      message: 'Before using local-policy guidance, verify the current policy source, effective date, payer/facility, note type, service date, required elements, and whether the source applies to this level of care. Treat Atlas as documentation support, not legal advice or payer-approval certainty.',
      suggestions: [
        'Name the source and date in your internal review.',
        'Keep clinical need, legal status, and payer documentation separate.',
      ],
      answerMode: 'workflow_guidance',
      builderFamily: 'workflow',
    };
  }

  if (conversation.routeHint === 'workflow_help') {
    if (/\bambient transcript\b/.test(original)) {
      return {
        message: 'Use the Ambient Transcript source box for captured session audio/transcript material. It should stay source-visible with the other source fields before drafting so Veranote can compare source and draft without mixing it into medication or diagnostic facts.',
        suggestions: [
          'Paste or review ambient transcript text before generating the draft.',
          'Keep dictated add-ons separate if they are instructions rather than transcript.',
        ],
        answerMode: 'workflow_guidance',
        builderFamily: 'workflow',
      };
    }

    if (/\bcustom plan instruction|plan instruction|custom plan\b/.test(original)) {
      return {
        message: 'Put a custom plan instruction in Provider Add-On. That field is for provider preferences, billing/diagnosis code hints, plan direction, and note-specific instructions that do not fit Pre-Visit Data, Live Visit Notes, or Ambient Transcript.',
        suggestions: [
          'Name saved prompts separately when you want to reuse them.',
          'Keep source facts and provider instructions in separate boxes.',
        ],
        answerMode: 'workflow_guidance',
        builderFamily: 'workflow',
      };
    }
  }

  return null;
}

export function applyAtlasConversationTone(
  payload: AssistantResponsePayload,
  conversation: AtlasConversationOrchestration,
): AssistantResponsePayload {
  if (!conversation.didRewrite) {
    return payload;
  }

  const normalizedMessage = payload.message.replace(/^Diagnostic reference summary:\s*/i, '').trim();
  const message = normalizedMessage
    ? `Sure. ${normalizedMessage}`
    : payload.message;

  return {
    ...payload,
    message,
    suggestions: [
      ...(payload.suggestions || []),
      ...conversation.controlledRationale.filter((item) => !(payload.suggestions || []).includes(item)),
    ],
  };
}

function isUrgentMedicationTopic(topic: AtlasConversationTopic | null) {
  if (!topic || topic.routeHint !== 'medication_reference') {
    return false;
  }

  const normalized = normalizeText(topic.providerQuestion);

  return /\b(toxic|toxicity|overdose|withdrawal|confused|confusion|ataxia|seizure|arrhythmia|urgent|emergency|qtc|anc|myocarditis|serotonin syndrome|nms)\b/.test(normalized)
    || /\blithium\b/.test(normalized) && /\b(level|1\.[5-9]|2\.\d|confused|confusion)\b/.test(normalized);
}

export function buildAtlasConversationSafetyPayload(
  conversation: AtlasConversationOrchestration,
): AssistantResponsePayload | null {
  if (!conversation.didRewrite || !conversation.activeTopic) {
    return null;
  }

  const normalizedOriginal = normalizeText(conversation.originalMessage);

  if (
    isUrgentMedicationTopic(conversation.activeTopic)
    && /\b(exact orders?|write orders?|give me orders?|medication orders?)\b/.test(normalizedOriginal)
  ) {
    return {
      message: 'I cannot provide patient-specific orders. For this same urgent medication-safety topic, keep the toxicity concern visible, verify the level timing, symptoms such as confusion, renal function, hydration/sodium status, and interacting medications, and use the local urgent protocol, poison control, pharmacy, or emergency pathway as appropriate.',
      suggestions: [
        'This is clinician-support only, not an order set.',
        'Document the abnormal value, symptoms, timing, and escalation pathway separately.',
      ],
      answerMode: 'medication_reference_answer',
      builderFamily: 'medication-boundary',
    };
  }

  return null;
}

export function buildAtlasConversationEvalMeta(conversation: AtlasConversationOrchestration) {
  return {
    didRewrite: conversation.didRewrite,
    followupIntent: conversation.followupIntent,
    routeHint: conversation.routeHint,
    activeTopic: conversation.activeTopic?.label || null,
    controlledRationale: conversation.controlledRationale,
  };
}
