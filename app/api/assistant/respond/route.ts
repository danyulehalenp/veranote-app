import { NextResponse } from 'next/server';
import { buildInternalKnowledgeHelp } from '@/lib/veranote/assistant-internal-knowledge';
import { buildGeneralKnowledgeHelp, buildReferenceLookupHelp } from '@/lib/veranote/assistant-knowledge';
import { buildExternalAnswerMeta, hydrateTrustedReferenceSources } from '@/lib/veranote/assistant-reference-lookup';
import { buildAssistantModeMeta } from '@/lib/veranote/assistant-mode';
import { orchestrateAssistantResponse } from '@/lib/veranote/vera-orchestrator';
import { buildAssistantPresetName, buildPreferenceAssistantDraft } from '@/lib/veranote/preference-draft';
import {
  buildSectionDraft,
  inferDraftSection,
  looksLikeRawClinicalDetail,
  looksMedicalFocused,
  looksPsychFocused,
  normalizeDraftText,
} from '@/lib/veranote/assistant-drafting';
import { SECTION_LABELS, type NoteSectionKey } from '@/lib/note/section-profiles';
import type { AssistantApiContext, AssistantMode, AssistantResponsePayload, AssistantStage, AssistantThreadTurn } from '@/types/assistant';

type AssistantRequest = {
  stage?: AssistantStage;
  mode?: AssistantMode;
  message?: string;
  context?: AssistantApiContext;
  recentMessages?: AssistantThreadTurn[];
};

function hasKeyword(message: string, keywords: string[]) {
  return keywords.some((keyword) => message.includes(keyword));
}

function joinGuidance(lines: string[]) {
  return lines.filter(Boolean).join(' ');
}

function shortProviderName(address?: string) {
  if (!address?.trim()) {
    return null;
  }

  const cleaned = address.replace(/,.*$/, '').trim();
  if (!cleaned) {
    return null;
  }

  if (cleaned.startsWith('Dr. ')) {
    return cleaned;
  }

  return cleaned.split(/\s+/)[0] || cleaned;
}

function maybeQuestion(text: string) {
  const trimmed = text.trim();
  return /[?.!]$/.test(trimmed) ? trimmed : `${trimmed}?`;
}

function looksLikeQuestion(message: string) {
  const trimmed = message.trim();
  return (
    /[?]$/.test(trimmed)
    || /^(can you|could you|would you|will you|do you|did you|what|why|how|when|where|who|which|is|are|am|does|should)\b/i.test(trimmed)
  );
}

function extractDetailAfterDirective(rawMessage: string) {
  const afterColon = rawMessage.split(/:\s*/);
  if (afterColon.length > 1) {
    return afterColon.slice(1).join(': ').trim();
  }

  return rawMessage
    .replace(/^(can you|could you|please|vera|help me|write|draft|turn|make|put|start with|create)\s+/i, '')
    .replace(/\b(?:the\s+)?(?:hpi|history of present illness|assessment|plan|progress note|overall note|note)\b/i, '')
    .trim();
}

function findLastProviderDetail(recentMessages?: AssistantThreadTurn[]) {
  if (!recentMessages?.length) {
    return null;
  }

  return [...recentMessages]
    .reverse()
    .find((item) => item.role === 'provider' && looksLikeRawClinicalDetail(item.content))?.content || null;
}

const EXPLICIT_REVISION_SECTION_MATCHERS: Array<{ patterns: RegExp[]; section: NoteSectionKey }> = [
  { patterns: [/\b(hpi|history of present illness|interval update)\b/i], section: 'intervalUpdate' },
  { patterns: [/\b(assessment|formulation|impression)\b/i], section: 'assessment' },
  { patterns: [/\b(plan|next steps?)\b/i], section: 'plan' },
  { patterns: [/\b(meds?|medications?|adherence|side effects?)\b/i], section: 'medications' },
  { patterns: [/\b(risk|safety|si|hi|suicid|homicid)\b/i], section: 'safetyRisk' },
  { patterns: [/\b(mental status|mse|observations?)\b/i], section: 'mentalStatus' },
  { patterns: [/\b(insight|judgment)\b/i], section: 'insightJudgment' },
  { patterns: [/\b(substance history|substance use)\b/i], section: 'substanceHistory' },
  { patterns: [/\b(social history)\b/i], section: 'socialHistory' },
  { patterns: [/\b(family history)\b/i], section: 'familyHistory' },
  { patterns: [/\b(trauma history)\b/i], section: 'traumaHistory' },
  { patterns: [/\b(psychiatric history|psych history)\b/i], section: 'psychHistory' },
  { patterns: [/\b(chief complaint|chief concern)\b/i], section: 'chiefConcern' },
  { patterns: [/\b(diagnosis|diagnostic impression)\b/i], section: 'diagnosis' },
];

function inferExplicitRevisionSectionHeading(fragment: string) {
  for (const matcher of EXPLICIT_REVISION_SECTION_MATCHERS) {
    if (matcher.patterns.some((pattern) => pattern.test(fragment))) {
      return SECTION_LABELS[matcher.section];
    }
  }

  if (/\b(objective|labs?|tox|uds|upt|vitals?)\b/i.test(fragment)) {
    return 'Objective';
  }

  return undefined;
}

function cleanupRevisionFragment(value: string) {
  return value
    .replace(/^(can you|could you|please|vera|i forgot to|forgot to|add that|include that|revise the note to say|revise note to say|put in the note|put that in the note)\s+/i, '')
    .replace(/\b(?:to|in|under|within)\s+(?:the\s+)?(?:hpi|history of present illness|interval update|assessment|formulation|impression|plan|next steps?|meds?|medications?|adherence|side effects?|risk|safety|mental status|mse|observations?|insight|judgment|substance history|substance use|social history|family history|trauma history|psychiatric history|psych history|chief complaint|chief concern|diagnosis|diagnostic impression|objective|labs?|tox|uds|upt|vitals?)\b/gi, '')
    .replace(/\b(?:more\s+conservative(?:ly)?|conservative(?:ly)?|briefly|more briefly|closer to source|source[-\s]?close|more literally|more literal)\b/gi, '')
    .replace(/^\s*that\s+/i, '')
    .replace(/^(that|the patient told me|patient told me|patient reports?|she reports?|he reports?|they report|they told me)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.]+$/, '');
}

function inferRevisionSectionHeading(fragment: string, context?: AssistantApiContext) {
  const explicitHeading = inferExplicitRevisionSectionHeading(fragment);
  if (explicitHeading) {
    return explicitHeading;
  }

  const lowered = fragment.toLowerCase();

  if (/(uds|upt|urine|tox|thc|meth|amphetamine|pregnan|lab|positive|negative)/.test(lowered)) {
    return 'Objective';
  }

  if (/(med|medication|adherence|compliance|off meds|off medication|ran out|stopped taking)/.test(lowered)) {
    return SECTION_LABELS.medications;
  }

  if (/(si|hi|suicid|homicid|self-harm|safety|risk)/.test(lowered)) {
    return SECTION_LABELS.safetyRisk;
  }

  if (/(sleep|appetite|anxiety|depression|mood|hallucinat|psychosis|symptom)/.test(lowered)) {
    return SECTION_LABELS.intervalUpdate;
  }

  return context?.focusedSectionHeading;
}

function buildRequestedRevisionText(fragment: string) {
  const lowered = fragment.toLowerCase();

  if (/(off meds|off medication|off their meds|stopped taking meds|stopped taking medication)/.test(lowered)) {
    const durationMatch = fragment.match(/\bfor\s+([^.]+?)(?:[.]\s*)?$/i);
    const duration = durationMatch?.[1]?.trim();
    return duration
      ? `Patient reports being off medications for ${duration}.`
      : 'Patient reports being off medications.';
  }

  if (/(uds|urine drug|tox)/.test(lowered) || (/(thc|meth|amphetamine)/.test(lowered) && /positive|\+/.test(lowered))) {
    const positives: string[] = [];
    if (/\+?\s*thc|positive for thc/i.test(fragment)) {
      positives.push('THC');
    }
    if (/\+?\s*meth|positive for meth|methamphetamine/i.test(fragment)) {
      positives.push('methamphetamine');
    }
    if (/\+?\s*cocaine|positive for cocaine/i.test(fragment)) {
      positives.push('cocaine');
    }
    if (/\+?\s*opiates|positive for opiates/i.test(fragment)) {
      positives.push('opiates');
    }

    const lines: string[] = [];
    if (positives.length) {
      lines.push(`UDS was positive for ${positives.join(' and ')}.`);
    } else if (/uds|urine drug|tox/i.test(fragment)) {
      lines.push('UDS results should be added exactly as documented in source.');
    }

    if (/(upt|pregnancy test)/.test(lowered)) {
      if (/negative/i.test(lowered)) {
        lines.push('UPT was negative.');
      } else if (/positive/i.test(lowered)) {
        lines.push('UPT was positive.');
      }
    }

    return lines.join(' ').trim();
  }

  if (/(patient told me|patient reports?|they report|she reports?|he reports?)/.test(lowered)) {
    const sentence = cleanupRevisionFragment(fragment);
    if (!sentence) {
      return 'Add the missing patient-reported detail exactly as documented in source.';
    }

    const normalized = sentence.charAt(0).toUpperCase() + sentence.slice(1);
    return `Patient reports ${normalized.replace(/^being\s+/i, 'being ')}.`;
  }

  const cleaned = cleanupRevisionFragment(fragment);
  if (!cleaned) {
    return 'Add the missing source-supported detail exactly as documented before finalizing the note.';
  }

  const normalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return normalized.endsWith('.') ? normalized : `${normalized}.`;
}

function buildRequestedRevisionHelp(normalizedMessage: string, rawMessage: string, stage: AssistantStage, context?: AssistantApiContext): AssistantResponsePayload | null {
  if (stage !== 'review') {
    return null;
  }

  if (!hasKeyword(normalizedMessage, ['can you add', 'could you add', 'i forgot to', 'forgot to', 'include that', 'add that', 'add this to', 'put that in the note', 'revise the note to say', 'revise note to say'])) {
    return null;
  }

  const revisionText = buildRequestedRevisionText(rawMessage);
  const targetSectionHeading = inferRevisionSectionHeading(rawMessage, context);

  return {
    message: joinGuidance([
      'I drafted that missing note detail as a provider-requested revision.',
      targetSectionHeading ? `I will place it into ${targetSectionHeading} so you can review it in context.` : 'I will place it into the current draft so you can review it in context.',
      'Please confirm the wording still matches your source before final use.',
    ]),
    suggestions: [
      `Suggested revision: ${revisionText}`,
      'Use this when you forgot to include a source-supported detail after the draft was generated.',
      'If this kind of addition repeats often, Vera can help turn it into a reusable workflow preference later.',
    ],
    actions: [
      {
        type: 'apply-note-revision',
        label: targetSectionHeading ? `Apply revision in ${targetSectionHeading}` : 'Apply requested note revision',
        instructions: `Suggested revision: ${revisionText}`,
        revisionText,
        targetSectionHeading,
      },
    ],
  };
}

function buildWorkflowHelp(stage: AssistantStage, context?: AssistantApiContext): AssistantResponsePayload {
  const noteLine = context?.noteType ? ` for ${context.noteType}` : '';
  const destinationLine = context?.outputDestination && context.outputDestination !== 'Generic'
    ? ` Keep the intended ${context.outputDestination} output in view while you work.`
    : '';
  const reviewSummary = stage === 'review'
    ? [
        context?.focusedSectionHeading ? `Focused section: ${context.focusedSectionHeading}.` : '',
        typeof context?.needsReviewCount === 'number' && context.needsReviewCount > 0
          ? `${context.needsReviewCount} section${context.needsReviewCount === 1 ? '' : 's'} still need review.`
          : '',
        typeof context?.unreviewedCount === 'number' && context.unreviewedCount > 0
          ? `${context.unreviewedCount} section${context.unreviewedCount === 1 ? '' : 's'} are still unreviewed.`
          : '',
      ].filter(Boolean).join(' ')
    : '';

  if (stage === 'review') {
    return {
      message: `Start with the highest-signal trust issue${noteLine}, then tighten wording only after the source reads cleanly.${destinationLine}${reviewSummary ? ` ${reviewSummary}` : ''}`,
      suggestions: [
        context?.focusedSectionHeading ? `Start with ${context.focusedSectionHeading} and check it directly against source.` : 'Start with warnings before polishing style.',
        typeof context?.contradictionCount === 'number' && context.contradictionCount > 0
          ? `${context.contradictionCount} contradiction cue${context.contradictionCount === 1 ? '' : 's'} still need clinician judgment.`
          : 'Keep review tied to the actual evidence blocks.',
        context?.highRiskWarningTitles?.length
          ? `Highest-signal warning right now: ${context.highRiskWarningTitles[0]}.`
          : 'Keep psych-risk wording literal and time-aware.',
        context?.destinationConstraintActive
          ? 'Destination formatting is active, so make sure cleanup did not change meaning.'
          : 'If the source is thin, keep the wording uncertain instead of cleaner-sounding.',
      ],
    };
  }

  return {
    message: `Get the source in cleanly${noteLine}, keep the note lane right, and generate only after the setup feels true to how you want this note to read.${destinationLine}`,
    suggestions: [
      context?.presetName ? `You already have an active preset here: ${context.presetName}.` : 'Use note preferences only when they actually help this lane fit your workflow.',
      'Keep clinician, intake, transcript, and objective data separated when possible.',
    ],
  };
}

function buildComposeScenarioHelp(normalizedMessage: string, context?: AssistantApiContext): AssistantResponsePayload | null {
  const noteLine = context?.noteType ? ` for ${context.noteType}` : '';

  if (hasKeyword(normalizedMessage, ['organize', 'messy source', 'source material'])) {
    return {
      message: `Before draft generation${noteLine}, separate source by provenance first: clinician notes, intake or collateral, transcript material, and objective data. That gives review a cleaner evidence trail and keeps the draft closer to source.`,
      suggestions: [
        'Put collateral in Intake / Collateral, not into the transcript lane.',
        'Keep quoted or near-quoted patient language in the transcript lane when possible.',
        'Leave objective data literal so the draft does not smooth it into narrative certainty.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['collateral', 'transcript'])) {
    return {
      message: `Use collateral for information coming from family, supports, schools, outside clinicians, or intake summaries. Use transcript for the patient conversation itself, especially if you want review to preserve who said what and where wording should stay closer to source.`,
      suggestions: [
        'Keep second-hand reports in the collateral lane.',
        'Keep patient statements and visit dialogue in the transcript lane.',
        'If the source is mixed, separate the parts you trust most before generating.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['section', 'include'])) {
    return {
      message: `Only include sections that this note actually supports${noteLine}. A good rule is to include what the source can defend, then let your prompt and note preferences decide how that material is organized for this note lane.`,
      suggestions: [
        'Use the note type first, then trim unsupported sections.',
        'Do not force a standalone MSE or assessment structure if the source is too thin.',
        'If a section keeps getting removed, consider saving that as a reusable preference.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['preset', 'workflow', 'fit the way i practice'])) {
    return {
      message: `Save a preset when the instruction pattern is repeatable${noteLine}: section plan, output scope, destination behavior, and tone constraints. Keep one-off patient-specific instructions out of the preset and in the current note only.`,
      suggestions: [
        'Save repeatable note-lane behavior, not visit-specific details.',
        'Use note-type-specific presets instead of one generic preset for everything.',
        'If you keep editing the same thing in review, turn that into a preset candidate.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['destination', 'ehr', 'wellsky'])) {
    return {
      message: `Destination-specific setup should act like an output layer${noteLine}, not permission to change meaning. Use prompt and note preferences to say what sections to include, how brief to be, and what formatting style works best for your destination.`,
      suggestions: [
        'Keep clinical meaning and uncertainty separate from formatting preferences.',
        'Save destination-specific behavior as a note-type-aware preset if it repeats often.',
        'If the destination needs shorter output, ask for concise structure without dropping source fidelity.',
      ],
    };
  }

  return null;
}

function buildDirectComposeHelp(normalizedMessage: string, context?: AssistantApiContext): AssistantResponsePayload | null {
  const noteType = context?.noteType || 'this note';
  const providerName = shortProviderName(context?.providerAddressingName);
  const greetingLead = providerName ? `Yes, ${providerName}.` : 'Yes.';

  if (
    hasKeyword(normalizedMessage, ['can you help me with', 'help me with', 'can you help with'])
    && hasKeyword(normalizedMessage, ['progress note'])
  ) {
    return {
      message: `${greetingLead} Send me the patient update, current symptoms, meds, safety issues, and plan changes, and I’ll start the progress note.`,
      suggestions: [
        'If you want to start smaller, tell me to do HPI, assessment, plan, meds, or risk first.',
      ],
    };
  }

  if (
    hasKeyword(normalizedMessage, ['can you help me with', 'help me with', 'help me start', 'can you help me start'])
    && hasKeyword(normalizedMessage, ['progress note', 'note', 'write this', 'start this'])
  ) {
    return {
      message: `${greetingLead} Send me the patient details you want in ${noteType.toLowerCase()}, or tell me which section you want first.`,
      suggestions: [
        'You can ask me to start with HPI, assessment, plan, or another section.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['start the note', 'start this note', 'help me write this note'])) {
    return {
      message: `Send me the patient details you want in ${noteType.toLowerCase()}, and I’ll help you start it.`,
      suggestions: [
        'You can also tell me which section you want first.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['can you help me', 'help me']) && hasKeyword(normalizedMessage, ['progress'])) {
    return {
      message: `${greetingLead} Send me the patient details, or tell me which section you want to work on first.`,
      suggestions: [
        'Or tell me to help with HPI, assessment, plan, meds, or risk.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['can you start', 'start a note', 'start this progress note', 'write a progress note'])) {
    return {
      message: `Send me the patient details, and I’ll help you build ${noteType.toLowerCase()} step by step.`,
      suggestions: [
        'If you want, tell me which section to draft first.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['help me with hpi', 'start with hpi', 'write the hpi'])) {
    return {
      message: 'Send me the patient update, symptoms, timeline, and any meds or recent events you want included, and I’ll shape the HPI first.',
      suggestions: [
        'Include what changed, what stayed the same, and any key interval events.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['help me with assessment', 'start with assessment', 'write the assessment'])) {
    return {
      message: 'Send me the clinical picture you want reflected in the assessment, and I’ll keep it concise and appropriately conservative.',
      suggestions: [
        'You can include symptoms, risk, response to treatment, and what still feels uncertain.',
      ],
    };
  }

  if (
    hasKeyword(normalizedMessage, ['revise', 'rewrite', 'less certain', 'more conservative'])
    && hasKeyword(normalizedMessage, ['assessment'])
  ) {
    return {
      message: 'Yes. Paste the assessment wording you want changed, and I’ll help make it sound less certain and more source-faithful.',
      suggestions: [
        'If you already have the wording, send it exactly as it reads now.',
      ],
    };
  }

  if (
    hasKeyword(normalizedMessage, ['revise', 'rewrite', 'less certain', 'more conservative'])
    && hasKeyword(normalizedMessage, ['hpi', 'history of present illness', 'plan'])
  ) {
    return {
      message: 'Yes. Paste the wording you want changed, and I’ll help revise it so it stays more conservative and source-close.',
      suggestions: [
        'If you want, tell me which section it belongs to as you paste it.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['help me with the plan', 'start with the plan', 'write the plan'])) {
    return {
      message: 'Send me the plan details you want included, and I’ll keep them clear, brief, and source-faithful.',
      suggestions: [
        'Include meds, follow-up, monitoring, safety steps, and anything you do not want overstated.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['what do you need from me', 'what do you need', 'what should i send'])) {
    return {
      message: `Send me the core patient details you want in ${noteType.toLowerCase()}, or just send the section you want to start with and I’ll work from there.`,
      suggestions: [
        'A quick update, symptoms, meds, labs, risk, and plan is enough to start.',
      ],
    };
  }

  return null;
}

function buildContextualSectionDraftHelp(
  normalizedMessage: string,
  rawMessage: string,
  recentMessages: AssistantThreadTurn[] | undefined,
  context?: AssistantApiContext,
): AssistantResponsePayload | null {
  const section = inferDraftSection(normalizedMessage);
  if (!section) {
    return null;
  }

  const directDetail = extractDetailAfterDirective(rawMessage);
  const usableDirectDetail = looksLikeRawClinicalDetail(directDetail) ? directDetail : null;
  const priorDetail = findLastProviderDetail(recentMessages);
  const detail = usableDirectDetail || priorDetail;

  if (!detail) {
    return null;
  }

  return {
    message: buildSectionDraft(section, detail, context),
    suggestions: [
      `Tell me if you want this ${section.toLowerCase()} shorter, more conservative, or moved into another section.`,
    ],
  };
}

function buildRawDetailComposeHelp(rawMessage: string, context?: AssistantApiContext): AssistantResponsePayload | null {
  if (!looksLikeRawClinicalDetail(rawMessage)) {
    return null;
  }

  const noteType = context?.noteType || 'this note';
  const mixedDomain = looksPsychFocused(rawMessage) && looksMedicalFocused(rawMessage);

  return {
    message: mixedDomain
      ? `I can work with both the psych and medical pieces for ${noteType.toLowerCase()}. Do you want me to shape this into HPI, assessment, plan, or the overall note first?`
      : `I can work with that for ${noteType.toLowerCase()}. Do you want me to shape it into HPI, assessment, plan, or the overall note first?`,
    suggestions: [
      'If you want, send one more detail and I can help section by section instead of all at once.',
    ],
  };
}

function buildDirectReviewHelp(normalizedMessage: string, context?: AssistantApiContext): AssistantResponsePayload | null {
  const focusedSection = context?.focusedSectionHeading;

  if (hasKeyword(normalizedMessage, ['can you help me review', 'help me review', 'can you help with review'])) {
    return {
      message: focusedSection
        ? `Yes. Do you want to start with ${focusedSection}, the top warning, or the exact wording you want to change?`
        : 'Yes. Do you want to start with the top warning, the section that feels off, or the wording you want to change?',
      suggestions: [
        'Ask why a warning appeared.',
        'Ask me to make wording more conservative.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['what should i fix first', 'where should i start', 'what should i review first'])) {
    return {
      message: focusedSection
        ? `Start with ${focusedSection} or the highest-signal warning, whichever feels riskier.`
        : 'Start with the highest-signal warning or the section that feels most overconfident.',
      suggestions: [
        'Ask why the warning appeared if it is not obvious.',
      ],
    };
  }

  return null;
}

function buildMixedDomainComposeHelp(normalizedMessage: string, rawMessage: string, context?: AssistantApiContext): AssistantResponsePayload | null {
  if (!looksPsychFocused(rawMessage) || !looksMedicalFocused(rawMessage)) {
    return null;
  }

  if (hasKeyword(normalizedMessage, ['consult', 'medical', 'h&p', 'admission', 'progress note', 'note'])) {
    return {
      message: `I can help keep both the medical and psych parts clear here. Do you want me to organize this as a mixed HPI, assessment, plan, or a fuller note draft first?`,
      suggestions: [
        'If there are labs, vitals, or medication changes, keep those explicit so they do not get buried in the psych narrative.',
      ],
    };
  }

  return null;
}

function buildSupportAndTrainingHelp(normalizedMessage: string): AssistantResponsePayload | null {
  if (hasKeyword(normalizedMessage, ['saved drafts', 'saved draft'])) {
    return {
      message: 'Saved drafts live on the Saved Drafts page. Use that surface to reopen unfinished notes and continue review without losing where trust work stopped.',
      suggestions: [
        'Open Saved Drafts from the top navigation when you want to resume work.',
        'Use saved drafts when review is incomplete and you want to preserve where you stopped.',
        'If a draft is already active in the workspace, stay there unless you need the dedicated drafts list.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['review workspace', 'open review', 'full review'])) {
    return {
      message: 'Review opens automatically after generation inside the main workspace, and there is also a dedicated Full Review page when you want a larger, high-visibility pass.',
      suggestions: [
        'Use the in-workspace review when you want one continuous flow.',
        'Use Full Review when you want more space to work through warnings and section evidence.',
        'Do trust work before copy or export, not after.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['switch note type', 'change note type'])) {
    return {
      message: 'Change note type from the compose setup area before generation. Veranote treats note types as different working lanes, so presets, section behavior, and prompt and note preferences can shift with the selected lane.',
      suggestions: [
        'If you change note type, recheck prompt and note preferences before generating.',
        'Use note-type-specific presets instead of one generic default for everything.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['feedback', 'report issue', 'share feedback'])) {
    return {
      message: 'Use the Beta Feedback link in the top navigation or the feedback panel built into the app to report workflow friction, bugs, and requests. That feedback is saved for review instead of disappearing into a one-off conversation.',
      suggestions: [
        'Report issues like “this should be easier to reach” or “I do not like the way this reads.”',
        'Keep feedback specific so it can be worked on quickly.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['open assistant', 'keyboard shortcut', 'shortcut'])) {
    return {
      message: 'The assistant is currently opened from the floating Open assistant control. There is not a dedicated keyboard shortcut wired into this build yet.',
      suggestions: [
        'Use the floating assistant control on workspace and review pages.',
        'If a shortcut would help your workflow, submit it through Beta Feedback so it can be prioritized.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['why isn t my note saving', "why isn't my note saving", 'note saving', 'unable to save'])) {
    return {
      message: 'If a note is not saving, first check whether the problem is draft generation, saved drafts, or export. In this build, saved drafts and provider settings use the app data layer, so refreshes or API failures can affect what you see.',
      suggestions: [
        'Reopen Saved Drafts to see whether the note persisted there.',
        'If the problem repeats, send Beta Feedback with the page and action that failed.',
        'Do not assume exported text and saved draft state are the same thing.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['mobile'])) {
    return {
      message: 'Veranote is responsive enough to load on smaller screens, but this build is still optimized primarily for desktop workspace and review use.',
      suggestions: [
        'Use desktop when you need the most visibility into source, warnings, and review layers.',
        'If a mobile-specific blocker affects your workflow, report it through Beta Feedback.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['export pdf', 'pdf'])) {
    return {
      message: 'This review flow currently supports copy and export actions from the review surface, including text export. A dedicated PDF workflow is not the main export path in the current build.',
      suggestions: [
        'Finish review before using copy or export actions.',
        'If PDF is important to your workflow, log it as an export request through Beta Feedback.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['password', 'change my password'])) {
    return {
      message: 'This build does not yet expose a provider-facing password-change workflow inside the workspace. Account and profile infrastructure are still evolving separately from note drafting.',
      suggestions: [
        'Treat password and account controls as outside the current note workflow for now.',
        'If provider login and profile management are urgent for beta, log that through Beta Feedback.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['browser', 'supported browsers'])) {
    return {
      message: 'This build is intended for modern desktop browsers, especially where copy, export, and rich workspace interactions are reliable. If a browser-specific issue appears, capture it as feedback so it can be reproduced.',
      suggestions: [
        'If copy or export fails, note the browser and action that failed.',
        'Use a modern desktop browser for the most stable review experience.',
      ],
    };
  }

  return null;
}

function buildConversationalHelp(normalizedMessage: string, context?: AssistantApiContext): AssistantResponsePayload | null {
  const providerName = shortProviderName(context?.providerAddressingName);

  if (hasKeyword(normalizedMessage, ['how are you', 'howre you', "how're you"])) {
    return {
      message: `I’m doing well${providerName ? `, ${providerName}` : ''}. How can I help?`,
      suggestions: [
        'You can ask me to start a note or revise a section.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['hello', 'hi vera', 'hey vera', 'good morning', 'good afternoon', 'good evening'])) {
    return {
      message: `Hi${providerName ? `, ${providerName}` : ''}. How can I help you today?`,
      suggestions: [
        'You can ask me to start a note or revise a section.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['thank you', 'thanks'])) {
    return {
      message: 'You’re welcome.',
      suggestions: [
        'Ask for a revision or the next section when you’re ready.',
      ],
    };
  }

  return null;
}

function buildPrivacyTrustHelp(normalizedMessage: string): AssistantResponsePayload | null {
  if (hasKeyword(normalizedMessage, ['hipaa', 'compliant'])) {
    return {
      message: 'Treat the current beta as a controlled product-shaping environment, not silent proof of full production compliance. Providers should follow the documented beta data rules and avoid assuming every future safeguard is already complete just because the assistant is available.',
      suggestions: [
        'Use the beta data policy as the source of truth for what is allowed in testing.',
        'Do not rely on the assistant alone to answer institutional compliance questions.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['protect my data', 'patient confidentiality', 'confidentiality', 'protect data'])) {
    return {
      message: 'Veranote’s trust posture is to keep provider control visible, preserve source fidelity, and avoid hidden reuse of note content. The beta feedback loop captures explicit provider feedback messages, not silent harvesting of clinical note text for product training.',
      suggestions: [
        'Keep feedback intentional and separate from note content reuse.',
        'Keep privacy-sensitive workflow decisions visible rather than assumed.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['shared with external', 'external services', 'third party', 'third-party'])) {
    return {
      message: 'The assistant should not imply that notes or audio are freely shared outward. In this build, provider feedback is captured explicitly through the app, and source-trust work stays inside the product workflow rather than being silently pushed into a generic public chatbot pattern.',
      suggestions: [
        'Assume data-sharing boundaries should be explicit, not inferred.',
        'Use institution-approved policy and product documentation for final data-handling confirmation.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['used to improve the assistant', 'used to improve', 'how is my data used'])) {
    return {
      message: 'The safest current answer is that product improvement should rely on explicit provider feedback, de-identified learning where appropriate, and visible preference or preset actions rather than silent reuse of raw clinical note content.',
      suggestions: [
        'Prefer explicit feedback and accepted preference signals over hidden note harvesting.',
        'Keep provider learning transparent, reviewable, and editable.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['phi', 'protected health information'])) {
    return {
      message: 'Do not treat prompt fields as a place to casually move PHI into uncontrolled external workflows. Keep note setup inside Veranote’s provider workflow and follow your institution’s privacy rules for what data is allowed in testing and product use.',
      suggestions: [
        'Use prompt and note preferences for workflow behavior, not as a dumping ground for external prompting.',
        'Keep privacy-sensitive handling aligned with institutional policy.',
      ],
    };
  }

  return null;
}

function buildBoundaryHelp(normalizedMessage: string): AssistantResponsePayload | null {
  if (hasKeyword(normalizedMessage, ['what diagnosis should i assign', 'what diagnosis should i use', 'diagnosis should i'])) {
    return {
      message: 'I can help preserve differential framing, source fidelity, and conservative wording, but I cannot assign a diagnosis for you. Diagnostic judgment stays with the provider.',
      suggestions: [
        'Ask for help preserving uncertainty or differential language instead.',
        'Use review to check whether diagnosis wording is stronger than the source supports.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['what medication should i prescribe', 'what should i prescribe', 'what medication should i use'])) {
    return {
      message: 'I cannot recommend what medication to prescribe. I can help you review how medication details are documented, how to keep wording source-close, or how to preserve uncertainty in the note.',
      suggestions: [
        'Ask for help reviewing medication wording or warning cues instead.',
        'Use the medication review layers to verify names, doses, adherence, and side effects before export.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['write the entire evaluation', 'write the whole evaluation', 'write the whole note', 'write the entire note'])) {
    return {
      message: 'I can help structure the note, shape prompt preferences, and explain review issues, but I should not author a full evaluation from thin or minimally supported source. Veranote is designed to help the provider, not replace provider judgment.',
      suggestions: [
        'Ask for section planning, prompt setup, or conservative rewrite help instead.',
        'If the source is sparse, prefer a sparse but faithful note over a richer-looking draft.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['ignore this uncertainty flag', 'ignore the warning', 'finalise the note for me', 'finalize the note for me'])) {
    return {
      message: 'I cannot override trust warnings for you. Those flags exist to slow the workflow down where the source may not support the current wording, and any override should remain a visible provider decision.',
      suggestions: [
        'Ask why the warning appeared or what to review first.',
        'If the warning reflects a recurring pattern, send that lesson back to compose as a reusable preference.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['decide on a treatment plan', 'what treatment plan', 'treatment plan'])) {
    return {
      message: 'I cannot decide on a treatment plan. I can help keep the documentation truthful to source, clarify section structure, and make wording more conservative where needed.',
      suggestions: [
        'Ask for note-structuring help or safer wording instead.',
        'Keep treatment decisions with the provider and use the assistant for documentation support.',
      ],
    };
  }

  return null;
}

function buildProvenanceHelp(normalizedMessage: string, stage: AssistantStage, context?: AssistantApiContext): AssistantResponsePayload | null {
  const focusedSection = context?.focusedSectionHeading;
  const evidenceAction = stage === 'review'
    ? [{
        type: 'jump-to-source-evidence' as const,
        label: 'Jump to source evidence',
        instructions: focusedSection
          ? `Open the Source Evidence area and review the linked support for ${focusedSection}.`
          : 'Open the Source Evidence area and review the linked support for the active review context.',
      }]
    : undefined;

  if (hasKeyword(normalizedMessage, ['show me the source', 'what source material', 'where does this recommendation come from', 'source for this warning', 'source for this statement'])) {
    return {
      message: joinGuidance([
        focusedSection
          ? `Use the focused evidence for ${focusedSection} as your first provenance check.`
          : 'Use the section evidence and source blocks as your first provenance check.',
        typeof context?.focusedEvidenceCount === 'number' && context.focusedEvidenceCount > 0
          ? `The current focus has ${context.focusedEvidenceCount} linked source block${context.focusedEvidenceCount === 1 ? '' : 's'} available for review.`
          : '',
        stage === 'review'
          ? 'The safest way to answer “where did this come from?” is to compare the flagged wording back to the linked source before changing anything.'
          : 'Before generation, keep source lanes separated so provenance stays inspectable later in review.',
      ]),
      suggestions: [
        focusedSection
          ? `Start by reviewing the source support attached to ${focusedSection}.`
          : 'Start with the section evidence and attached source support.',
        context?.topHighRiskWarningTitle
          ? `If the warning is ${context.topHighRiskWarningTitle}, compare that wording directly to the linked evidence.`
          : 'Compare the draft wording directly to the linked evidence instead of trusting the summary alone.',
        'If the source still does not support the wording cleanly, revise the note rather than forcing a cleaner interpretation.',
      ],
      actions: evidenceAction,
    };
  }

  if (hasKeyword(normalizedMessage, ['confidence for this statement', 'how is the system determining confidence', 'why is confidence low', 'confidence'])) {
    return {
      message: joinGuidance([
        'Confidence should be treated as a review aid, not as truth.',
        'In Veranote, lower confidence usually means the wording may not align tightly enough with source, attribution, timing, or risk detail to be trusted without clinician review.',
        focusedSection ? `Use ${focusedSection} as the anchor when checking whether the statement is actually supported.` : '',
      ]),
      suggestions: [
        'Read the statement against the source rather than trusting the confidence proxy by itself.',
        'Look for drift in timing, attribution, certainty, or psych-risk language.',
        'If the source support is mixed, preserve uncertainty instead of trying to raise confidence cosmetically.',
      ],
      actions: evidenceAction,
    };
  }

  return null;
}

function buildCloserToSourceReviewAction(context?: AssistantApiContext) {
  const focusedSection = context?.focusedSectionHeading;
  const topWarning = context?.topHighRiskWarningTitle;
  const evidenceLine = typeof context?.focusedEvidenceCount === 'number' && context.focusedEvidenceCount > 0
    ? `Then compare it against the ${context.focusedEvidenceCount} linked source block${context.focusedEvidenceCount === 1 ? '' : 's'} for that section.`
    : 'Then compare it directly against the linked source support.';

  return [
    {
      type: 'run-review-rewrite' as const,
      label: focusedSection ? `Run closer-to-source rewrite for ${focusedSection}` : 'Run closer-to-source rewrite',
      instructions: joinGuidance([
        'Use the safer rewrite path first.',
        focusedSection ? `After it finishes, re-check ${focusedSection} sentence by sentence.` : 'After it finishes, re-check the active review section sentence by sentence.',
        topWarning ? `Pay extra attention to the warning pattern: ${topWarning}.` : '',
        evidenceLine,
        'If the wording still feels cleaner than the source, soften it again instead of accepting the polished version.',
      ]),
      rewriteMode: 'closer-to-source' as const,
    },
  ];
}

function buildFocusedSentenceConservativeAction(context?: AssistantApiContext) {
  const originalSentence = context?.focusedSectionSentence?.trim();

  if (!originalSentence) {
    return [];
  }

  const heading = (context?.focusedSectionHeading || '').toLowerCase();
  const topWarningId = context?.topHighRiskWarningId;
  const topWarning = context?.topHighRiskWarningTitle;
  let replacementOptions = [
    'This section should stay closer to source and avoid stronger certainty than the available support allows.',
    'This wording should remain qualified unless the source clearly supports a firmer statement.',
    'Keep this sentence narrow, source-faithful, and explicitly limited to what the available evidence supports.',
  ];

  if (topWarningId === 'passive-death-wish' || topWarningId === 'current-denial-recent-risk') {
    replacementOptions = [
      'Suicidality wording should preserve passive thoughts, current denial, and any recent or conflicting risk detail without collapsing them into one cleaner statement.',
      'This sentence should keep passive death-wish language separate from denial of active plan or intent and should leave recent risk detail visible.',
      'Risk wording here should stay qualified so passive thoughts, present denial, and recent or conflicting concern are not flattened into one summary.',
    ];
  } else if (topWarningId === 'global-negation') {
    replacementOptions = [
      'Denial wording should stay bounded and should not erase qualifying risk, behavior, or conflicting source detail.',
      'This sentence should preserve the denial while keeping any recent, observed, or collateral concern visible.',
      'Use narrower denial wording here so the note does not read cleaner or safer than the source supports.',
    ];
  } else if (topWarningId === 'attribution-conflict' || topWarningId === 'conflict-adjudication-language') {
    replacementOptions = [
      'This sentence should keep patient, collateral, and objective attribution explicit instead of implying that one source cleanly settled the conflict.',
      'Attribution should stay visible here so differing source perspectives do not collapse into one narrative voice.',
      'This wording should name the source of the claim rather than making the conflict sound resolved.',
    ];
  } else if (topWarningId === 'subjective-objective-mismatch') {
    replacementOptions = [
      'This wording should preserve the mismatch between subjective report and objective findings rather than smoothing it into one settled narrative.',
      'Keep patient report and objective findings distinct here so the mismatch remains visible.',
      'This sentence should stay qualified where subjective and objective information do not line up cleanly.',
    ];
  } else if (topWarningId === 'timeline-drift-risk' || topWarningId === 'partial-improvement-flattened') {
    replacementOptions = [
      'This sentence should preserve timeline anchors and partial improvement instead of sounding globally current, stable, or resolved.',
      'Keep old-versus-current wording explicit here so the note does not blur timing or overstate improvement.',
      'This wording should stay time-aware and should preserve partial or qualified improvement rather than implying full resolution.',
    ];
  } else if (topWarningId === 'medication-reconciliation' || topWarningId === 'medication-plan-overreach' || topWarningId === 'medication-side-effect-overstatement') {
    replacementOptions = [
      'Medication wording should stay limited to the regimen detail directly supported in source, with unresolved conflict, adherence uncertainty, or side-effect nuance left visible.',
      'This sentence should keep medication detail narrow and should not resolve dose, plan, or side-effect uncertainty more cleanly than the source does.',
      'Use conservative medication wording here so unresolved regimen or tolerability detail remains explicit.',
    ];
  } else if (topWarningId === 'plan-overreach') {
    replacementOptions = [
      'Plan wording should stay limited to the actions clearly documented in source and should not add routine follow-up language that is not actually present.',
      'This sentence should keep the plan narrow and should avoid adding undocumented next steps.',
      'Use only the plan actions clearly supported in source here, without smoothing in routine follow-up wording.',
    ];
  } else if (topWarningId === 'sparse-input-richness') {
    replacementOptions = [
      'This sentence should stay sparse and source-faithful rather than sounding more complete or certain than the available input supports.',
      'Keep this wording minimal here so thin source does not turn into richer certainty.',
      'This sentence should remain narrow and explicitly limited by the sparse input available.',
    ];
  } else if (/risk|safety/.test(heading)) {
    replacementOptions = [
      'Risk wording should stay limited to what is directly documented in source and remain explicitly qualified where uncertainty is still present.',
      'This risk sentence should stay literal and time-aware rather than globally reassuring.',
      'Use narrower risk wording here so denial, concern, and uncertainty do not blur together.',
    ];
  } else if (/med/.test(heading)) {
    replacementOptions = [
      'Medication wording should stay limited to the regimen details directly supported in source, with unresolved conflict left visible.',
      'This medication sentence should keep dose, adherence, or side-effect uncertainty explicit.',
      'Use conservative medication wording here so the note does not sound more reconciled than the source supports.',
    ];
  } else if (/plan/.test(heading)) {
    replacementOptions = [
      'Plan wording should stay limited to the actions clearly documented in source.',
      'This plan sentence should avoid adding routine follow-up or monitoring language that is not explicitly present.',
      'Use narrower plan wording here so only supported next steps remain.',
    ];
  } else if (/assessment|impression|formulation|diagnos/.test(heading)) {
    replacementOptions = [
      'Assessment wording should stay narrow, source-faithful, and explicitly qualified where uncertainty remains.',
      'This assessment sentence should preserve differential or uncertainty language instead of sounding settled.',
      'Use a more conservative assessment phrasing here so the conclusion does not outrun the source.',
    ];
  } else if (/history|hpi|interval/.test(heading)) {
    replacementOptions = [
      'History wording should stay close to the available source and keep unclear timing or attribution explicitly qualified.',
      'This history sentence should preserve who reported what and when instead of collapsing the timeline.',
      'Use narrower history wording here so source and chronology remain visible.',
    ];
  }

  const optionTones = ['most-conservative', 'balanced', 'closest-to-source'] as const;

  return replacementOptions.slice(0, 3).map((replacementText, index) => ({
    type: 'apply-conservative-rewrite' as const,
    label: context?.focusedSectionHeading
      ? `${index === 0 ? 'Most conservative' : index === 1 ? 'Balanced' : 'Closest to source'} rewrite in ${context.focusedSectionHeading}`
      : `${index === 0 ? 'Most conservative' : index === 1 ? 'Balanced' : 'Closest to source'} rewrite`,
    instructions: joinGuidance([
      `Original: ${originalSentence}`,
      `${index === 0 ? 'Most conservative' : index === 1 ? 'Balanced' : 'Closest to source'} option: ${replacementText}`,
      topWarning ? `Use this when the current warning pattern is ${topWarning}.` : '',
    ]),
    originalText: originalSentence,
    replacementText,
    optionTone: optionTones[index] ?? 'balanced',
  }));
}

function buildReviewScenarioHelp(normalizedMessage: string, context?: AssistantApiContext): AssistantResponsePayload | null {
  const focusedSection = context?.focusedSectionHeading;
  const topWarning = context?.topHighRiskWarningTitle || context?.highRiskWarningTitles?.[0];
  const closerToSourceAction = buildCloserToSourceReviewAction(context);
  const focusedSentenceAction = buildFocusedSentenceConservativeAction(context);

  if (hasKeyword(normalizedMessage, ['warning', 'why did this', 'why did that', 'why did'])) {
    return {
      message: joinGuidance([
        'Warnings usually appear because the draft is reading more confidently than the available source, because contradiction cues are present, or because psych-risk wording still needs clinician judgment.',
        focusedSection ? `Right now the assistant sees review focus in ${focusedSection}.` : '',
        topWarning ? `The highest-signal warning currently published is ${topWarning}.` : '',
        context?.topHighRiskWarningDetail ? context.topHighRiskWarningDetail : '',
      ]),
      suggestions: [
        typeof context?.focusedEvidenceCount === 'number' && context.focusedEvidenceCount > 0
          ? `Compare the flagged wording against the ${context.focusedEvidenceCount} linked source block${context.focusedEvidenceCount === 1 ? '' : 's'} for this section.`
          : 'Compare the flagged section directly against the underlying source material.',
        'Check whether certainty, timing, or attribution drifted during generation.',
        context?.topHighRiskWarningReviewHint ? context.topHighRiskWarningReviewHint : 'Check whether certainty, timing, or attribution drifted during generation.',
        'If this is a repeat edit pattern, send it back to compose as a reusable preference.',
      ],
      actions: closerToSourceAction,
    };
  }

  if (hasKeyword(normalizedMessage, ['fix first', 'focus on first', 'first in review'])) {
    return {
      message: joinGuidance([
        'Start with the highest-signal trust issues before polishing style.',
        typeof context?.needsReviewCount === 'number' && context.needsReviewCount > 0
          ? `${context.needsReviewCount} section${context.needsReviewCount === 1 ? '' : 's'} still need review.`
          : '',
        typeof context?.contradictionCount === 'number' && context.contradictionCount > 0
          ? `${context.contradictionCount} contradiction cue${context.contradictionCount === 1 ? '' : 's'} still need clinician judgment.`
          : '',
        focusedSection ? `After the highest-signal warnings, stay with ${focusedSection} until it reads truthfully.` : '',
      ]),
      suggestions: [
        topWarning ? `Start with ${topWarning}.` : 'Start with warnings and contradictions before tone cleanup.',
        focusedSection ? `Then re-read ${focusedSection} against its source support before moving on.` : 'Then fix sections that still feel more certain than the source supports.',
        'Leave cosmetic phrasing until the trust work is done.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['conservative', 'safer wording', 'more conservative'])) {
    return {
      message: `To make wording more conservative, anchor it back to what the source actually supports, preserve uncertainty, and avoid upgrading historical or tentative information into current settled facts${focusedSection ? ` in ${focusedSection}` : ''}.`,
      suggestions: [
        'Prefer literal symptom or risk descriptions over polished summary claims.',
        'Use uncertainty language when chronology, attribution, or severity is still thin.',
        context?.topHighRiskWarningReviewHint || 'Keep psych-risk statements specific and time-aware instead of globally reassuring.',
      ],
      actions: [...focusedSentenceAction, ...closerToSourceAction],
    };
  }

  if (hasKeyword(normalizedMessage, ['uncertain', 'stay uncertain', 'uncertainty'])) {
    return {
      message: `Keep uncertainty wherever the source is incomplete, mixed, second-hand, or not time-qualified. Review should protect ambiguity when ambiguity is clinically honest.`,
      suggestions: [
        'Preserve differentials, rule-outs, and historical labels explicitly.',
        'Do not convert collateral-only claims into settled current findings.',
        'If severity, timing, or attribution are unclear, keep them qualified.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['contradiction', 'contradiction cue'])) {
    return {
      message: joinGuidance([
        'Contradiction cues mean parts of the note may not line up cleanly across source, draft, or review logic.',
        typeof context?.contradictionCount === 'number' && context.contradictionCount > 0
          ? `${context.contradictionCount} contradiction cue${context.contradictionCount === 1 ? '' : 's'} are currently active.`
          : '',
        'Treat those as places for explicit clinician judgment rather than automatic cleanup.',
      ]),
      suggestions: [
        'Check whether timeline, risk status, or medication details disagree across sections.',
        'Prefer clarifying the wording over smoothing the contradiction away.',
        'If the contradiction reflects real uncertainty, keep that uncertainty visible.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['destination constraint', 'destination constraints', 'destination', 'export'])) {
    return {
      message: context?.destinationConstraintActive
        ? 'Destination constraints are active in this review, so treat formatting cleanup as an export layer only. The goal is to make the note fit the destination without changing meaning, certainty, or attribution.'
        : 'Even when destination constraints are light, keep formatting changes separate from clinical meaning. Review should still protect source fidelity before export.',
      suggestions: [
        'Check that concise formatting did not erase uncertainty or provenance.',
        'Keep psych-risk wording explicit even if the destination prefers shorter output.',
        'If the same destination edits repeat often, turn them into a saved preference instead of redoing them manually.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['before export', 'finish this note', 'check before export'])) {
    return {
      message: 'Before export, confirm the highest-signal warnings are addressed, key sections match source, destination formatting did not change meaning, and any repeatable edits have been captured as preferences instead of left as one-off fixes.',
      suggestions: [
        'Recheck psych-risk wording, meds, labs, and contradiction cues first.',
        focusedSection
          ? `Confirm that ${focusedSection} still reads truthfully against source.`
          : 'Confirm the focused section still reads truthfully against source.',
        'If you keep making the same edit, save it as a reusable preference before leaving review.',
      ],
      actions: closerToSourceAction,
    };
  }

  return null;
}

function buildPromptBuilderHelp(stage: AssistantStage, rawMessage: string, context?: AssistantApiContext): AssistantResponsePayload {
  const normalizedMessage = rawMessage.toLowerCase();
  const noteLine = context?.noteType ? ` for ${context.noteType}` : '';
  const destinationSuggestion = context?.outputDestination && context.outputDestination !== 'Generic'
    ? `Format the final note so it works cleanly in ${context.outputDestination} without changing the clinical meaning.`
    : 'Keep destination-specific cleanup separate from the clinical meaning of the note.';
  const noteType = context?.noteType || 'this note';
  const specialty = context?.specialty || 'Psychiatry';
  const outputDestination = context?.outputDestination || 'Generic';
  const draftedInstructions = buildPreferenceAssistantDraft({
    noteType,
    specialty,
    outputDestination,
    request: rawMessage,
  });
  const actions = [ 
        {
          type: 'replace-preferences' as const,
          label: stage === 'review' ? 'Send review guidance into current preferences' : 'Replace current preferences',
          instructions: draftedInstructions,
        },
        {
          type: 'append-preferences' as const,
          label: stage === 'review' ? 'Append review guidance to preferences' : 'Append to current preferences',
          instructions: draftedInstructions,
        },
        {
          type: 'create-preset-draft' as const,
          label: stage === 'review' ? 'Create preset draft from review guidance' : 'Create preset draft',
          instructions: draftedInstructions,
          presetName: buildAssistantPresetName(noteType),
        },
      ];

  if (normalizedMessage.includes('eval')) {
    return {
      message: `For eval-style notes${noteLine}, ask Veranote to stay differential-aware, preserve uncertainty, and avoid turning historical labels into current settled diagnoses unless the source clearly supports that move.`,
      suggestions: [
        'Keep assessment conservative and source-close.',
        'Preserve historical labels, differentials, and rule-outs explicitly.',
        'Only include sections that this eval truly supports.',
      ],
      actions,
    };
  }

  if (normalizedMessage.includes('progress') || normalizedMessage.includes('follow-up')) {
    return {
      message: `For progress or follow-up notes${noteLine}, it usually helps to ask for a shorter plan, clearer symptom-change language, and tighter organization around medications, side effects, and safety.`,
      suggestions: [
        'Keep the plan brief and easy to scan.',
        'Be literal about what changed since the last visit.',
        'Do not overstate improvement when the source remains mixed.',
      ],
      actions,
    };
  }

  if (stage === 'review') {
    return {
      message: `In review${noteLine}, use prompt preferences only for repeat patterns you actually want Vera to remember later, like overly polished wording or destination-specific cleanup.`,
      suggestions: [
        'Capture repeatable review edits as reusable note preferences.',
        'Avoid preferences that hide source ambiguity.',
        'Save only the changes you would want on the next note of this type.',
      ],
      actions,
    };
  }

  return {
    message: `Use the prompt builder${noteLine} to tell Vera how you want this note lane to behave. Focus on tone, section structure, destination formatting, and how conservative the wording should be.`,
    suggestions: [
      'Describe the note lane, not one patient.',
      'Say what to keep brief, what to keep literal, and what should stay uncertain.',
      destinationSuggestion,
      'Turn recurring instructions into a saved preset for this note type.',
    ],
    actions,
  };
}

function buildUnknownQuestionFallback(message: string): AssistantResponsePayload | null {
  if (!looksLikeQuestion(message)) {
    return null;
  }

  return {
    message: "No, but I'll find out how I can learn how to.",
    suggestions: [
      'Please send this through Beta Feedback so we can teach Vera this skill.',
    ],
    actions: [
      {
        type: 'send-beta-feedback',
        label: 'Teach Vera this',
        instructions: 'Send this unanswered question into the Vera gaps queue so it can be reviewed and added to Vera’s abilities.',
        feedbackCategory: 'feature-request',
        pageContext: 'Vera assistant gap',
        feedbackMessage: `Vera could not answer this provider question: ${message}`,
      },
    ],
  };
}

export async function POST(request: Request) {
  const body = (await request.json()) as AssistantRequest;
  const { stage, mode, message, context, recentMessages, intentTrace, payload } = orchestrateAssistantResponse(body, {
    buildBoundaryHelp,
    buildConversationalHelp,
    buildInternalKnowledgeHelp,
    buildReferenceLookupHelp,
    buildGeneralKnowledgeHelp,
    buildPrivacyTrustHelp,
    buildSupportAndTrainingHelp,
    buildRequestedRevisionHelp,
    buildProvenanceHelp,
    buildPromptBuilderHelp,
    buildDirectReviewHelp,
    buildReviewScenarioHelp,
    buildUnknownQuestionFallback,
    buildWorkflowHelp,
    buildContextualSectionDraftHelp,
    buildDirectComposeHelp,
    buildMixedDomainComposeHelp,
    buildRawDetailComposeHelp,
    buildComposeScenarioHelp,
  });

  const hydratedReferences = (mode === 'reference-lookup' || payload.references?.length)
    ? await hydrateTrustedReferenceSources(message, payload.references || [])
    : payload.references;
  const externalAnswerMeta = mode === 'reference-lookup'
    ? buildExternalAnswerMeta(payload.message, hydratedReferences || [])
    : payload.externalAnswerMeta;

  console.info('[veranote-assistant] respond', {
    stage,
    mode,
    message,
    context,
    recentMessagesCount: recentMessages.length,
    intentTrace,
    referenceCount: hydratedReferences?.length || 0,
    externalAnswerConfidence: externalAnswerMeta?.level,
  });

  return NextResponse.json({
    ...payload,
    references: hydratedReferences,
    externalAnswerMeta,
    modeMeta: buildAssistantModeMeta(mode, stage),
  });
}
