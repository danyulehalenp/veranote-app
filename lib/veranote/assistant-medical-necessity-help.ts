import { evaluateLevelOfCare } from '@/lib/veranote/defensibility/level-of-care-evaluator';
import { evaluateLOS } from '@/lib/veranote/defensibility/los-evaluator';
import { evaluateMedicalNecessity } from '@/lib/veranote/defensibility/medical-necessity-engine';
import { evaluateMedicalNecessitySupport } from '@/lib/note/medical-necessity-support';
import type { AssistantApiContext, AssistantReferenceSource, AssistantResponsePayload } from '@/types/assistant';

function hasKeyword(message: string, keywords: string[]) {
  return keywords.some((keyword) => message.includes(keyword));
}

function looksLikeInpatientMedicalNecessityQuestion(normalized: string) {
  if (
    hasKeyword(normalized, [
      'what does louisiana need for inpatient psych approval',
      'what does louisiana need for inpatient psych',
      'what does louisiana need for approval',
      'louisiana medicaid inpatient psych',
    ])
  ) {
    return false;
  }

  return (
    hasKeyword(normalized, [
      'does this admission read strong enough',
      'does this read strong enough',
      'is this strong enough for inpatient psych',
      'is this enough for inpatient psych',
      'does this note justify inpatient psych',
      'does this support inpatient psych',
      'does this support psychiatric admission',
      'any inpatient concerns before i sign',
      'any medical necessity concerns before i sign',
      'any inpatient medical necessity concerns before i sign',
      'does this justify admission',
      'does this support admission',
    ])
    || (
      hasKeyword(normalized, ['this', 'draft', 'note', 'admission'])
      && hasKeyword(normalized, ['inpatient psych', 'psychiatric admission', 'continued inpatient', 'medical necessity'])
      && hasKeyword(normalized, ['strong enough', 'enough', 'justify', 'support', 'concern', 'concerns', 'sign'])
    )
  );
}

function looksLikeMonitoringDocumentationQuestion(normalized: string) {
  return (
    hasKeyword(normalized, [
      'does my current wording support continued monitoring clearly enough',
      'does this support continued monitoring',
      'does this wording support continued monitoring',
      'does this note support continued monitoring',
      'does this justify continued monitoring',
      'continued monitoring clearly enough',
      'monitoring clearly enough',
      'does this support keeping the patient for monitoring',
      'does this justify keeping the patient for monitoring',
    ])
    || (
      hasKeyword(normalized, ['monitoring'])
      && hasKeyword(normalized, ['support', 'justify', 'clearly enough', 'wording', 'note', 'draft'])
    )
  );
}

function looksLikeReassessmentOrWhyNowQuestion(normalized: string) {
  return (
    hasKeyword(normalized, [
      'does this note show enough reassessment',
      'does this show enough reassessment',
      'does my wording show enough reassessment',
      'does this wording show enough reassessment',
      'does this note explain why continued inpatient is still needed now',
      'does this explain why continued inpatient is still needed now',
      'does this show why continued inpatient is still needed now',
      'does this wording explain why continued inpatient is still needed now',
      'why continued inpatient now',
      'enough reassessment',
    ])
    || (
      hasKeyword(normalized, ['reassessment', 'why now', 'continued inpatient'])
      && hasKeyword(normalized, ['enough', 'show', 'wording', 'note', 'draft', 'explain'])
    )
  );
}

function looksLikeGapSummaryQuestion(normalized: string) {
  return (
    hasKeyword(normalized, [
      'what exactly is still missing from this inpatient note',
      'what is still missing from this inpatient note',
      'what is still missing from this admission note',
      'what exactly is still missing from this admission note',
      'what are the top gaps in this inpatient note',
      'what are the top gaps in this admission note',
      'what are the biggest gaps in this inpatient note',
      'what are the biggest gaps in this admission note',
      'top gaps in this inpatient note',
      'top gaps in this admission note',
    ])
    || (
      hasKeyword(normalized, ['missing', 'gap', 'gaps'])
      && hasKeyword(normalized, ['inpatient', 'admission'])
      && hasKeyword(normalized, ['note', 'draft', 'wording', 'this'])
    )
  );
}

function looksLikeCategoryTighteningQuestion(normalized: string) {
  const asksToTighten = hasKeyword(normalized, [
    'how do i tighten',
    'how do i make',
    'help me tighten',
    'help me make',
    'how should i word',
    'how do i word',
    'make this more objective',
    'rewrite this more objectively',
  ]);

  const categoryMentioned = hasKeyword(normalized, [
    'risk wording',
    'risk language',
    'adl',
    'functional impairment',
    'lower level of care',
    'lower-level care',
    'grave disability',
    'why now',
  ]);

  return asksToTighten && categoryMentioned;
}

function looksLikeRewriteQuestion(normalized: string) {
  const asksToRewrite = hasKeyword(normalized, [
    'rewrite this',
    'rewrite the',
    'rewrite this sentence',
    'rewrite this wording',
    'rewrite this more objectively',
    'rewrite this so it reads stronger',
  ]);

  const categoryMentioned = hasKeyword(normalized, [
    'risk',
    'grave disability',
    'lower-level care',
    'lower level of care',
    'why now',
  ]);

  return asksToRewrite && categoryMentioned;
}

function looksLikePastedAdmissionNote(normalized: string) {
  return normalized.length > 140
    || hasKeyword(normalized, [
      'hpi:',
      'assessment:',
      'plan:',
      'reason for admission',
      'current risk assessment',
      'need for inpatient level of care',
    ]);
}

function buildInternalReferences(): AssistantReferenceSource[] {
  return [
    {
      label: 'Inpatient Psych Medical Necessity Documentation Standards',
      url: 'internal://inpatient-psych-medical-necessity-national',
      sourceType: 'internal',
    },
    {
      label: 'Louisiana Inpatient Psych Documentation Phrasing',
      url: 'internal://louisiana-inpatient-psych-documentation',
      sourceType: 'internal',
    },
  ];
}

function payload(message: string, suggestions: string[]): AssistantResponsePayload {
  return {
    message,
    suggestions,
    references: buildInternalReferences(),
  };
}

function inferGapSummary(result: ReturnType<typeof evaluateMedicalNecessitySupport>) {
  const gaps = [...result.nationalCues, ...result.louisianaCues].slice(0, 2);
  if (!gaps.length) {
    return 'the main inpatient anchors clearly';
  }

  return gaps.map((item) => item.label.toLowerCase()).join(' and ');
}

function formatGapLabels(labels: string[]) {
  if (labels.length <= 1) {
    return labels[0] || 'the main inpatient anchors';
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
}

function hasReassessmentCue(text: string) {
  return /\b(reassess|reassessment|remains|continues to endorse|still endorses|still reports|current risk|current safety|on interview today|today on exam)\b/.test(text);
}

function hasMonitoringCue(text: string) {
  return /\b(monitoring|observe|observation|continued observation|q15|15 minute checks|close observation|watch|supervision)\b/.test(text);
}

function buildRiskRewrite(normalizedText: string) {
  const clauses: string[] = [];

  if (/\b(suicid(?:e|al) ideation|si)\b/.test(normalizedText)) {
    clauses.push('Patient reports suicidal ideation');
  } else if (/\b(homicid(?:e|al) ideation|hi)\b/.test(normalizedText)) {
    clauses.push('Patient reports homicidal ideation');
  } else if (/\bpsychosis\b/.test(normalizedText)) {
    clauses.push('Patient continues to show psychosis impairing reality testing');
  }

  if (/\bplan\b/.test(normalizedText)) {
    clauses.push('with a documented plan');
  }

  if (/\bintent\b/.test(normalizedText)) {
    clauses.push('and stated intent');
  }

  if (/\b(access|means|medications at home)\b/.test(normalizedText)) {
    clauses.push('and access to means');
  }

  if (/\bunable to contract for safety\b/.test(normalizedText)) {
    clauses.push('and remains unable to contract for safety');
  }

  if (/\b(attempted|recent attempt|overdose|hanging)\b/.test(normalizedText)) {
    clauses.push('Recent dangerous behavior or attempt is also documented');
  }

  if (!clauses.length) {
    return null;
  }

  const sentence = clauses.join(' ').replace(/\s+/g, ' ').trim();
  return sentence.endsWith('.') ? sentence : `${sentence}.`;
}

function buildGraveDisabilityRewrite(normalizedText: string) {
  const clauses: string[] = [];

  if (/\b(not eating|not eaten|has not eaten|unable to eat)\b/.test(normalizedText)) {
    clauses.push('Patient has not been eating adequately');
  }

  if (/\b(not showering|poor hygiene|unable to bathe)\b/.test(normalizedText)) {
    clauses.push('is not maintaining hygiene');
  }

  if (/\b(wandering|unable to state address)\b/.test(normalizedText)) {
    clauses.push('was wandering and unable to state address');
  }

  if (/\b(unable to obtain shelter|no shelter)\b/.test(normalizedText)) {
    clauses.push('is unable to obtain shelter safely');
  }

  if (/\b(unable to manage medications|missed \d+ days|medication nonadherence)\b/.test(normalizedText)) {
    clauses.push('is unable to manage medications safely');
  }

  if (!clauses.length) {
    return null;
  }

  const sentence = `${clauses.join(', ')}. These findings support current grave disability.`;
  return sentence.replace(/\s+/g, ' ').trim();
}

function buildRewriteHelp(normalizedQuestion: string, noteText: string): AssistantResponsePayload {
  const normalizedText = noteText.toLowerCase();

  if (hasKeyword(normalizedQuestion, ['risk'])) {
    const rewrite = buildRiskRewrite(normalizedText);
    if (!rewrite) {
      return payload(
        'I can help rewrite that, but this draft does not yet show enough specific risk facts for a truly objective rewrite.',
        [
          'Add the actual observed risk facts first, such as plan, intent, means, timeframe, recent behavior, or inability to contract for safety if those facts are present.',
          'Once those facts are in the wording, I can help tighten the sentence without making it more aggressive than the source supports.',
        ],
      );
    }

    return payload(
      `A tighter risk version could read: "${rewrite}"`,
      [
        'Keep the rewrite tied to the exact facts already documented rather than upgrading the level of risk by wording alone.',
      ],
    );
  }

  if (hasKeyword(normalizedQuestion, ['grave disability'])) {
    const rewrite = buildGraveDisabilityRewrite(normalizedText);
    if (!rewrite) {
      return payload(
        'I can help rewrite that, but the draft still needs concrete self-care or basic-needs deficits before a grave-disability sentence will read strongly.',
        [
          'Add the actual observed deficit first, such as not eating, not bathing, wandering, inability to state address, or inability to manage medications safely if those facts are present.',
          'Then I can tighten the grave-disability wording without relying on the label alone.',
        ],
      );
    }

    return payload(
      `A tighter grave-disability version could read: "${rewrite}"`,
      [
        'For a Louisiana-facing note, this works best when the self-care failure is visible enough that the reader does not have to infer it from the diagnosis alone.',
      ],
    );
  }

  return payload(
    'I can help tighten that wording, but for rewrite-style inpatient help I work best when the draft already contains the concrete facts I can preserve.',
    [
      'Send the exact sentence or make the factual anchors visible first, and I can keep the rewrite brief and source-faithful.',
    ],
  );
}

function buildCategoryTighteningHelp(normalizedQuestion: string, noteText: string): AssistantResponsePayload {
  const normalizedText = noteText.toLowerCase();

  if (hasKeyword(normalizedQuestion, ['risk wording', 'risk language', 'more objective'])) {
    const riskExample = /\bunsafe\b/.test(normalizedText)
      ? 'Replace words like unsafe with the actual observed risk facts, such as plan, intent, means, recent attempt, psychosis, or inability to contract for safety if those facts are truly present.'
      : 'Use the concrete risk facts rather than summary labels. Spell out plan, intent, means, timeframe, recent behavior, or reality-testing failure if those are actually documented.';

    return payload(
      'To tighten the risk wording, make it more observable and time-anchored instead of relying on summary labels.',
      [
        riskExample,
        'If the concern is current, say what is active today. If it is based on a recent event, give the timing clearly.',
      ],
    );
  }

  if (hasKeyword(normalizedQuestion, ['adl', 'functional impairment'])) {
    return payload(
      'To tighten ADL or functional-impairment support, move from general decline language to concrete self-care or safety deficits.',
      [
        'Name the actual deficit if it is present: not eating, not showering, staying in bed, wandering, inability to manage medications, or inability to maintain safety independently.',
        'Tie the impairment back to why the patient cannot safely function in a less restrictive setting right now.',
      ],
    );
  }

  if (hasKeyword(normalizedQuestion, ['lower level of care', 'lower-level care'])) {
    return payload(
      'To tighten the lower-level-care section, show what was tried, when it was tried, and why it did not stabilize the patient.',
      [
        'Use the actual recent steps if they exist: outpatient follow-up, ED discharge, safety planning, crisis work, IOP, PHP, or medication adjustment.',
        'Then say why inpatient is still needed now instead of leaving the failure history implied.',
      ],
    );
  }

  if (hasKeyword(normalizedQuestion, ['grave disability'])) {
    return payload(
      'To tighten grave-disability wording, prove the basic-needs or self-care failure instead of naming the label alone.',
      [
        'Document the concrete deficit if it is present: inability to eat, bathe, obtain shelter, state address, manage medications, or seek care safely because of psychiatric impairment.',
        'If this is a Louisiana-facing note, make the current self-care failure visible enough that the reader does not have to infer it from the diagnosis alone.',
      ],
    );
  }

  return payload(
    'To tighten the why-now wording, make the recent change from baseline and the current inpatient need explicit.',
    [
      'Anchor the recent timeline with dates or short time windows such as today, within 24 hours, or after a recent failed lower-level intervention.',
      'Then connect that timeline to why continued inpatient monitoring or treatment is still needed now.',
    ],
  );
}

function buildReassessmentOrWhyNowHelp(noteText: string): AssistantResponsePayload {
  const normalizedText = noteText.toLowerCase();
  const support = evaluateMedicalNecessitySupport({
    noteType: 'Inpatient Psych Progress Note',
    draftText: noteText,
  });
  const combinedCues = [...support.nationalCues, ...support.louisianaCues];
  const hasCurrentReassessment = hasReassessmentCue(normalizedText);
  const hasRecentEscalationCue = /\b(today|yesterday|24 hours|48 hours|72 hours|returned|again|worsening|continues to endorse|still endorses|on interview today)\b/.test(normalizedText);
  const hasInpatientNeedCue = /\b(inpatient|24 hour|24-hour|continued admission|continued hospitalization|requires supervision|close observation|cannot be managed outpatient|less restrictive .* insufficient)\b/.test(normalizedText);
  const hasCurrentRiskCue = /\b(suicid(?:e|al)|homicid(?:e|al)|unable to contract for safety|grave disability|psychosis|unsafe if discharged)\b/.test(normalizedText);

  if (hasCurrentReassessment && hasRecentEscalationCue && hasInpatientNeedCue && hasCurrentRiskCue) {
    return payload(
      'Yes, this wording shows a solid first pass of reassessment and why continued inpatient care is still needed now. The note already ties today’s clinical picture to a visible ongoing inpatient rationale.',
      [
        combinedCues[0]
          ? `Still worth tightening: ${combinedCues[0].label}.`
          : 'Keep today’s reassessment frame and the lower-level-care boundary explicit when you finalize the note.',
        'This remains documentation support, not a final utilization-review command from Atlas.',
      ],
    );
  }

  return payload(
    'Not clearly yet. The wording still looks thin on either today’s reassessment, the why-now timeline, or the explicit reason continued inpatient care is still needed.',
    [
      hasCurrentReassessment
        ? (combinedCues[0]?.detail || 'Make today’s ongoing risk, instability, or grave-disability picture more concrete if those facts are truly present.')
        : 'Add a clearer current reassessment frame so the note shows what is active today rather than relying on the original hold status.',
      hasInpatientNeedCue
        ? (combinedCues[1]?.detail || 'Make the lower-level-care boundary more explicit so the note shows why continued inpatient treatment is still necessary now.')
        : 'Say why continued inpatient care is still needed now instead of assuming the reader will infer it from the setting alone.',
    ],
  );
}

function buildMonitoringDocumentationHelp(noteText: string): AssistantResponsePayload {
  const normalizedText = noteText.toLowerCase();
  const support = evaluateMedicalNecessitySupport({
    noteType: 'Inpatient Psych Progress Note',
    draftText: noteText,
  });
  const combinedCues = [...support.nationalCues, ...support.louisianaCues];
  const hasCurrentReassessment = hasReassessmentCue(normalizedText);
  const hasMonitoringRationale = hasMonitoringCue(normalizedText);
  const hasOngoingRiskCue = /\b(suicid(?:e|al)|homicid(?:e|al)|unable to contract for safety|current risk|grave disability|psychosis|unsafe if discharged)\b/.test(normalizedText);

  if (hasCurrentReassessment && hasMonitoringRationale && hasOngoingRiskCue) {
    return payload(
      'Yes, this wording reads reasonably supportive of continued monitoring on a first pass. The note already shows current reassessment language plus a visible monitoring rationale, which is the right shape for this kind of review question.',
      [
        combinedCues[0]
          ? `Still worth tightening: ${combinedCues[0].label}.`
          : 'Keep the current risk picture and why-now monitoring rationale explicit when you finalize it.',
        'This stays as documentation support, not a legal or disposition command from Atlas.',
      ],
    );
  }

  return payload(
    'Not clearly yet. The current wording still looks thin for continued-monitoring support on a first pass because the draft should usually make today’s reassessment and the monitoring rationale more explicit.',
    [
      hasCurrentReassessment
        ? (combinedCues[0]?.detail || 'Make the current risk picture or functional instability more concrete if those facts are truly present.')
        : 'Add a clearer current reassessment frame so the note shows what is still active today, not only what happened earlier.',
      (!hasOngoingRiskCue || /\bpec\b|\bcec\b/.test(normalizedText))
        ? 'Say why continued monitoring is still needed now rather than assuming the hold status speaks for itself.'
        : hasMonitoringRationale
          ? (combinedCues[1]?.detail || 'Tie the continued monitoring need to concrete ongoing risk, grave-disability, or instability facts.')
          : 'Say why continued monitoring is still needed now rather than assuming the hold status speaks for itself.',
    ],
  );
}

function buildGapSummaryHelp(noteText: string): AssistantResponsePayload {
  const support = evaluateMedicalNecessitySupport({
    noteType: 'Inpatient Psych Progress Note',
    draftText: noteText,
  });
  const combinedCues = [...support.nationalCues, ...support.louisianaCues];
  const topCues = combinedCues.slice(0, 3);

  if (!topCues.length) {
    return payload(
      'There is not much obviously missing on a first pass. This inpatient note already reads fairly well on the core medical-necessity anchors.',
      [
        support.louisianaBoosts[0]
          ? `Louisiana-specific support already visible: ${support.louisianaBoosts[0]}`
          : 'Keep the why-now timeline, current reassessment, and 24-hour-care rationale explicit when you finalize it.',
        'This is still a documentation-support read, not a final utilization-review command from Atlas.',
      ],
    );
  }

  const gapLabels = topCues.map((cue) => cue.label.toLowerCase());

  if ((support.status === 'strong-approval-case' || support.status === 'likely-approval') && topCues.length <= 2) {
    return payload(
      `There is not much obviously missing on a first pass. The main tightening points are ${formatGapLabels(gapLabels)}.`,
      topCues.map((cue) => cue.detail).slice(0, 2),
    );
  }

  return payload(
    `The top inpatient documentation gaps on a first pass are ${formatGapLabels(gapLabels)}.`,
    topCues.map((cue) => cue.detail).slice(0, 3),
  );
}

export function buildMedicalNecessityHelp(normalizedMessage: string, context?: AssistantApiContext): AssistantResponsePayload | null {
  const normalized = normalizedMessage.toLowerCase().trim();
  if (!normalized) {
    return null;
  }

  const noteType = context?.noteType || '';
  const reviewText = context?.currentDraftText?.trim() || '';
  const wantsMonitoringHelp = looksLikeMonitoringDocumentationQuestion(normalized);
  const wantsReassessmentHelp = looksLikeReassessmentOrWhyNowQuestion(normalized);
  const wantsGapSummaryHelp = looksLikeGapSummaryQuestion(normalized);
  const wantsRewriteHelp = looksLikeRewriteQuestion(normalized);
  const wantsCategoryTighteningHelp = looksLikeCategoryTighteningQuestion(normalized);
  const wantsMedicalNecessityHelp = looksLikeInpatientMedicalNecessityQuestion(normalized);

  if (!wantsMonitoringHelp && !wantsReassessmentHelp && !wantsGapSummaryHelp && !wantsRewriteHelp && !wantsCategoryTighteningHelp && !wantsMedicalNecessityHelp) {
    return null;
  }

  const noteText = looksLikePastedAdmissionNote(normalized) ? normalizedMessage : reviewText;

  if (!noteText) {
    return payload(
      'I can help with that, but I need the admission wording or the current review draft to judge whether the inpatient case reads strong enough. When I look at it, I stay focused on concrete risk or grave-disability facts, why-now timing, failed lower-level care, and why 24-hour treatment is necessary.',
      [
        'Send the admission wording or ask again from Review and I can point out the main medical-necessity gaps.',
      ],
    );
  }

  if (wantsMonitoringHelp) {
    return buildMonitoringDocumentationHelp(noteText);
  }

  if (wantsReassessmentHelp) {
    return buildReassessmentOrWhyNowHelp(noteText);
  }

  if (wantsGapSummaryHelp) {
    return buildGapSummaryHelp(noteText);
  }

  if (wantsRewriteHelp) {
    return buildRewriteHelp(normalized, noteText);
  }

  if (wantsCategoryTighteningHelp) {
    return buildCategoryTighteningHelp(normalized, noteText);
  }

  const result = evaluateMedicalNecessitySupport({
    noteType: /inpatient psych/i.test(noteType) ? noteType : 'Inpatient Psych Progress Note',
    draftText: noteText,
  });
  const necessity = evaluateMedicalNecessity(noteText);
  const levelOfCare = evaluateLevelOfCare(noteText);
  const losAssessment = evaluateLOS(noteText);

  if (!result.applies) {
    return null;
  }

  const combinedCues = [...result.nationalCues, ...result.louisianaCues];

  if (result.status === 'strong-approval-case' || result.status === 'likely-approval') {
    return payload(
      `This admission reads ${result.status === 'strong-approval-case' ? 'strong' : 'reasonably strong'} for inpatient psych medical necessity on a first pass. The draft already shows ${inferGapSummary(result)}.`,
      [
        result.louisianaBoosts.length
          ? `Louisiana-specific support already visible: ${result.louisianaBoosts[0]}`
          : 'Keep the why-now timeline and 24-hour-care justification explicit when you finalize the note.',
        `Level-of-care read: ${levelOfCare.suggestedLevel}.`,
        ...(losAssessment.barriersToDischarge[0] ? [`Discharge barrier still visible: ${losAssessment.barriersToDischarge[0]}`] : []),
        combinedCues[0]
          ? `Still worth tightening: ${combinedCues[0].label}.`
          : 'This is documentation support, not a final payer-certainty answer.',
      ],
    );
  }

  return payload(
    `This admission still reads ${result.status === 'borderline' ? 'borderline' : 'thin'} for inpatient psych medical necessity on a first pass. The biggest gaps are around ${inferGapSummary(result)}.`,
    [
      combinedCues[0]
        ? `Use more objective language here: ${combinedCues[0].detail}`
        : 'Make the acute-risk or grave-disability facts more objective if they are truly present.',
      combinedCues[1]?.detail || 'Show why-now escalation, failed lower-level care, and why 24-hour treatment is needed now.',
      ...(necessity.missingElements[0] ? [necessity.missingElements[0]] : []),
    ],
  );
}
