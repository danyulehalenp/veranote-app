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

function looksLikePastedAdmissionNote(normalized: string) {
  return normalized.length > 140
    || hasKeyword(normalized, [
      'hpi:',
      'assessment:',
      'plan:',
      'reason for admission',
      'current risk assessment',
      'need for inpatient level of care',
      'grave disability',
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

function hasReassessmentCue(text: string) {
  return /\b(reassess|reassessment|remains|continues to endorse|still endorses|still reports|current risk|current safety|on interview today|today on exam)\b/.test(text);
}

function hasMonitoringCue(text: string) {
  return /\b(monitoring|observe|observation|continued observation|q15|15 minute checks|close observation|watch|supervision)\b/.test(text);
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
        'This remains documentation support, not a final utilization-review command from Vera.',
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
        'This stays as documentation support, not a legal or disposition command from Vera.',
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

export function buildMedicalNecessityHelp(normalizedMessage: string, context?: AssistantApiContext): AssistantResponsePayload | null {
  const normalized = normalizedMessage.toLowerCase().trim();
  if (!normalized) {
    return null;
  }

  const noteType = context?.noteType || '';
  const reviewText = context?.currentDraftText?.trim() || '';
  const wantsMonitoringHelp = looksLikeMonitoringDocumentationQuestion(normalized);
  const wantsReassessmentHelp = looksLikeReassessmentOrWhyNowQuestion(normalized);
  const wantsMedicalNecessityHelp = looksLikeInpatientMedicalNecessityQuestion(normalized);

  if (!wantsMonitoringHelp && !wantsReassessmentHelp && !wantsMedicalNecessityHelp) {
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

  const result = evaluateMedicalNecessitySupport({
    noteType: /inpatient psych/i.test(noteType) ? noteType : 'Inpatient Psych Progress Note',
    draftText: noteText,
  });

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
    ],
  );
}
