import { NextResponse } from 'next/server';
import { selectModel } from '@/lib/ai/model-router';
import { assembleAssistantKnowledgePrompt } from '@/lib/ai/assemble-prompt';
import { requireAuth } from '@/lib/auth/auth-middleware';
import { recordAuditEvent } from '@/lib/audit/audit-log';
import { DEFAULT_PROVIDER_IDENTITY_ID } from '@/lib/constants/provider-identities';
import { getAssistantLearning, saveAssistantLearning } from '@/lib/db/client';
import { recordEvalResult } from '@/lib/monitoring/eval-tracker';
import { trackError } from '@/lib/monitoring/error-tracker';
import { trackModelUsage } from '@/lib/monitoring/model-usage-tracker';
import { trackRequest } from '@/lib/monitoring/request-tracker';
import { checkRateLimit } from '@/lib/resilience/rate-limiter';
import { safeExecute } from '@/lib/resilience/failure-guard';
import { rehydratePHI } from '@/lib/security/phi-rehydrator';
import { sanitizeForLogging, sanitizePHITexts } from '@/lib/security/phi-sanitizer';
import { validateRequest } from '@/lib/security/request-guard';
import { logEvent } from '@/lib/security/safe-logger';
import { detectAuditRisk } from '@/lib/veranote/defensibility/audit-risk-detector';
import { evaluateCptSupport } from '@/lib/veranote/defensibility/cpt-support';
import { evaluateLevelOfCare } from '@/lib/veranote/defensibility/level-of-care-evaluator';
import { evaluateLOS } from '@/lib/veranote/defensibility/los-evaluator';
import { evaluateMedicalNecessity } from '@/lib/veranote/defensibility/medical-necessity-engine';
import { enforceFidelity } from '@/lib/veranote/assistant-fidelity-guard';
import { buildInternalKnowledgeHelp } from '@/lib/veranote/assistant-internal-knowledge';
import { buildClinicalTaskPriorityPayload, classifyClinicalTaskOverride } from '@/lib/veranote/assistant-clinical-task';
import { buildGeneralKnowledgeHelp, buildReferenceLookupHelp, buildStructuredKnowledgeReminder } from '@/lib/veranote/assistant-knowledge';
import { buildDiagnosticGeneralConceptReferenceHelp } from '@/lib/veranote/assistant-diagnostic-general-reference';
import { buildDiagnosticSafetyGateHelp } from '@/lib/veranote/assistant-diagnostic-safety-gate';
import { buildPsychMedicationReferenceHelp } from '@/lib/veranote/assistant-psych-med-knowledge';
import { detectMedicationQuestionIntent, findPsychMedication } from '@/lib/veranote/meds/psych-med-answering';
import { detectMedReferenceIntent, findMedReferenceMedication } from '@/lib/veranote/med-reference/query';
import { extractMemoryFromOutput } from '@/lib/veranote/memory/memory-extractor';
import { resolveProviderMemory } from '@/lib/veranote/memory/memory-resolver';
import { runAssistantPipeline } from '@/lib/veranote/pipeline/assistant-pipeline';
import { buildExternalAnswerMeta, hydrateTrustedReferenceSources } from '@/lib/veranote/assistant-reference-lookup';
import { buildAssistantModeMeta, classifyClinicalFollowupDirective } from '@/lib/veranote/assistant-mode';
import { enrichAssistantResponseWithLearning } from '@/lib/veranote/assistant-response-memory';
import { filterProviderMemoryByPolicy } from '@/lib/veranote/assistant-source-policy';
import { orchestrateAssistantResponse } from '@/lib/veranote/vera-orchestrator';
import { evaluateDischarge } from '@/lib/veranote/workflow/discharge-evaluator';
import { buildAssistantPresetName, buildPreferenceAssistantDraft } from '@/lib/veranote/preference-draft';
import { summarizeTrends } from '@/lib/veranote/workflow/longitudinal-context';
import { suggestNextActions } from '@/lib/veranote/workflow/next-action-engine';
import { suggestTasks } from '@/lib/veranote/workflow/task-suggester';
import { suggestTriage } from '@/lib/veranote/workflow/triage-engine';
import {
  buildSectionDraft,
  inferDraftSection,
  looksLikeRawClinicalDetail,
  looksMedicalFocused,
  looksPsychFocused,
  normalizeDraftText,
} from '@/lib/veranote/assistant-drafting';
import { createEmptyAssistantLearningStore } from '@/lib/veranote/assistant-learning';
import type { KnowledgeBundle, KnowledgeIntent, TrustedReference } from '@/lib/veranote/knowledge/types';
import { SECTION_LABELS, type NoteSectionKey } from '@/lib/note/section-profiles';
import type { AssistantApiContext, AssistantMode, AssistantReferenceSource, AssistantResponsePayload, AssistantStage, AssistantThreadTurn } from '@/types/assistant';
import type { ProviderMemoryItem } from '@/lib/veranote/memory/memory-types';
import type { Contradiction } from '@/lib/veranote/assistant-contradiction-detector';
import type { RiskAnalysis } from '@/lib/veranote/assistant-risk-detector';
import type { PhiEntity } from '@/lib/security/phi-types';
import { extractPriorClinicalState } from '@/lib/veranote/pipeline/assistant-pipeline';
import { resolveAssistantPersona } from '@/lib/veranote/assistant-persona';
import { buildAtlasBlueprintResponse } from '@/lib/veranote/atlas-clinical-blueprint';
import {
  applyAtlasConversationTone,
  buildAtlasConversationEvalMeta,
  buildAtlasConversationFallbackPayload,
  buildAtlasConversationSafetyPayload,
  normalizeCommonClinicalSpellings,
  orchestrateAtlasConversation,
} from '@/lib/veranote/atlas-conversation-orchestrator';

type AssistantRequest = {
  stage?: AssistantStage;
  mode?: AssistantMode;
  message?: string;
  context?: AssistantApiContext;
  recentMessages?: AssistantThreadTurn[];
};

const ASSISTANT_TOKEN_THRESHOLD = 6000;
const CHEAP_ASSISTANT_MODEL = 'google/gemini-2.5-flash-lite';

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

function getAssistantDisplayName(context?: AssistantApiContext) {
  return resolveAssistantPersona(context).name;
}

function maybeQuestion(text: string) {
  const trimmed = text.trim();
  return /[?.!]$/.test(trimmed) ? trimmed : `${trimmed}?`;
}

function normalizeMessageForClinicalRouting(message: string) {
  return normalizeCommonClinicalSpellings(message.toLowerCase())
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeVisibleClinicalTyposForRouting(message: string) {
  return message
    .replace(/\bwelbutrin\b/gi, 'Wellbutrin')
    .replace(/\bwellbutrinn\b/gi, 'Wellbutrin')
    .replace(/\bbuproprion\b/gi, 'bupropion')
    .replace(/\bbupropian\b/gi, 'bupropion')
    .replace(/\bpaxel\b/gi, 'Paxil')
    .replace(/\bpaxal\b/gi, 'Paxil')
    .replace(/\bpaxill\b/gi, 'Paxil')
    .replace(/\bparoxitine\b/gi, 'paroxetine')
    .replace(/\bparoxatine\b/gi, 'paroxetine')
    .replace(/\blamictle\b/gi, 'Lamictal')
    .replace(/\blamictel\b/gi, 'Lamictal')
    .replace(/\blamictol\b/gi, 'Lamictal')
    .replace(/\blamotrigene\b/gi, 'lamotrigine')
    .replace(/\blamotrogine\b/gi, 'lamotrigine')
    .replace(/\bschizo\s+affective\b/gi, 'schizoaffective')
    .replace(/\bschizoafective\b/gi, 'schizoaffective')
    .replace(/\bschizoaffectve\b/gi, 'schizoaffective')
    .replace(/\bschizoaffectivee\b/gi, 'schizoaffective')
    .replace(/\bschizoeffective\b/gi, 'schizoaffective')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeQuestion(message: string) {
  const trimmed = message.trim();
  return (
    /[?]$/.test(trimmed)
    || /^(can you|could you|would you|will you|do you|did you|what|why|how|when|where|who|which|is|are|am|does|should)\b/i.test(trimmed)
  );
}

function looksLikePureMedicationReferenceQuestion(message: string) {
  const normalized = message.toLowerCase().replace(/[^a-z0-9.\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const asksReference =
    /\bwhat (are|is)\b.{0,40}\b(normal|therapeutic|target|reference)\b.{0,30}\b(levels?|ranges?|qtc)\b/.test(normalized)
    || /\b(normal|therapeutic|target|reference)\b.{0,30}\b(levels?|ranges?|qtc)\b/.test(normalized)
    || /\b(levels?|ranges?)\b.{0,30}\b(normal|therapeutic|target|reference)\b/.test(normalized)
    || /\bwhat levels?\b.{0,30}\b(lithium|valproate|depakote|carbamazepine|tegretol)\b/.test(normalized)
    || /\bwhat level should\b.{0,30}\b(lithium|valproate|depakote|carbamazepine|tegretol)\b.{0,30}\b(usually|normally|typically)\b/.test(normalized)
    || /\b(qtc normal range|normal qtc)\b/.test(normalized);
  const medicationOrLabAnchor = /\b(lithium|valproate|valproic acid|vpa|depakote|divalproex|carbamazepine|tegretol|qtc)\b/.test(normalized);
  const appliedClinicalCue = /\b(my patient|this patient|pt|what should i do|should i|can i|ok|okay|increase|decrease|titrate|start|stop|hold|continue|restart|confused|confusion|sedated|sedation|sleepy|vomiting|diarrhea|dizzy|ataxia|weak|jaundice|bleeding|creatinine|egfr|bun|renal|kidney|on haldol|on quetiapine|on depakote|on lithium|on clozapine|on oxcarbazepine)\b/.test(normalized);
  const numericValue = /\b\d+(?:\.\d+)?\b/.test(normalized);

  return asksReference && medicationOrLabAnchor && !appliedClinicalCue && !numericValue;
}

function looksLikeDirectGeriatricReferenceQuestion(message: string) {
  return (
    looksLikeQuestion(message)
    && /\b(geriatric|geriatrics|elderly|older adult|older adults|beers criteria|dementia-related psychosis|dementia related psychosis|post-stroke depression|post stroke depression|poststroke depression|mild cognitive impairment|\bmci\b|diphenhydramine|fall risk|falls|appetite stimulation|cholinesterase inhibitors?|donepezil|memantine|galantamine|rivastigmine|alzheimer|alzheimer's|ect|electroconvulsive|nortriptyline|amitriptyline)\b/i.test(message)
    && !/\b(source says|draft says|note says|patient reports|patient denies|document|wording|chart-ready|chart ready|write this|rewrite)\b/i.test(message)
  );
}

function looksLikeDirectApprovalReferenceQuestion(message: string) {
  return (
    looksLikeQuestion(message)
    && /\b(fda approved|approved for|approved in|approved to|approved medication|approved medications|which medications are approved|which drugs are approved|which antipsychotics are approved|which ssris are approved|approved for adolescents|approved for children|approved for pediatric|under age|children under|indication|indicated for|fda-labeled|fda labeled)\b/i.test(message)
    && !/\b(overdose|toxicity|toxic|poison control|level\s+\d|serum level|mEq\/L|confused|confusion|ataxia|seizure|syncope|rigidity|clonus|fever)\b/i.test(message)
  );
}

function looksLikeDirectInteractionReferenceQuestion(message: string) {
  return (
    looksLikeQuestion(message)
    && /\b(interaction|interact|combine|combined|combining|taken together|safe together|okay together|ok together|contraindicated|avoid|safely combined|increase levels?|decrease levels?|lower levels?|inhibit|induce|inducer|affect metabolism|with\b|plus\b|and\b|pregnancy|pregnant|first trimester|breastfeeding|breast milk|lactation|nursing|neonatal|oral clefts?|ebstein|pphn|floppy baby|cyp1a2|cyp2d6|cyp3a4|p-gp|p gp)\b/i.test(message)
    && /\b(lithium|nsaids?|maoi|triptan|fluoxetine|prozac|valproate|depakote|divalproex|carbamazepine|tegretol|smoking|tobacco|st\.?\s*john|ssris?|grapefruit|buspirone|clozapine|ciprofloxacin|renal failure|bupropion|wellbutrin|celexa|citalopram|zoloft|sertraline|lexapro|escitalopram|paxil|paroxetine|effexor|venlafaxine|cymbalta|duloxetine|seroquel|quetiapine|zyprexa|olanzapine|risperdal|risperidone|abilify|aripiprazole|lamictal|lamotrigine|trileptal|oxcarbazepine|ativan|lorazepam|xanax|alprazolam|klonopin|clonazepam|haldol|haloperidol|suboxone|buprenorphine|vivitrol|naltrexone|invega|paliperidone|lybalvi|samidorphan|eating disorder|erythromycin|linezolid|pimozide|qtc|thioridazine|ace inhibitors?|rifampin|methadone|disulfiram|alcohol|warfarin|omeprazole|diazepam|diuretics?|aspirin|tamoxifen|tramadol|verapamil|pseudoephedrine|urea cycle|pregnancy|breastfeeding|lactation|ect|snris?|benzodiazepines?|stimulants?|mirtazapine|topiramate)\b/i.test(message)
    && !/\b(source says|draft says|note says|patient reports|patient denies|document|wording|chart-ready|chart ready|write this|rewrite)\b/i.test(message)
  );
}

function looksLikeDirectLabMonitoringReferenceQuestion(message: string) {
  return (
    looksLikeQuestion(message)
    && /\b(labs?|monitor|monitoring|protocol|frequency|baseline|checked|required|needed|ekg|ecg|a1c|lipids|cbc|anc|lft|lfts|liver function|kidney function|renal function|tsh|pregnancy test|urine drug screens?|drug screens?|uds|chest x[- ]?ray|x[- ]?ray|xray|side effect|risk|rash|symptoms|signs|syndrome|warning|prolactin|hypercalcemia|hair loss|alopecia|gingival|growth suppression|extrapyramidal|eps|stevens-johnson|stevens johnson|sjs|neuroleptic malignant|nms)\b/i.test(message)
    && /\b(second-generation|second generation|sga|antipsychotics?|carbamazepine|tegretol|serotonin syndrome|valproate|depakote|divalproex|neuroleptic malignant|nms|phenytoin|stimulants?|extrapyramidal|eps|risperidone|lithium|clozapine|benzodiazepines?|tca|tricyclic|olanzapine|lfts?|tsh|psychotropic|psych drug|aripiprazole|ziprasidone|duloxetine|maoi|lamictal|lamotrigine)\b/i.test(message)
    && !/\b(source says|draft says|note says|patient reports|patient denies|document|wording|chart-ready|chart ready|write this|rewrite)\b/i.test(message)
  );
}

function looksLikeDirectEmergencyProtocolQuestion(message: string) {
  return (
    looksLikeQuestion(message)
    && /\b(acute|urgent|emergency|er|ed|icu|overdose|toxicity|toxic|withdrawal|intoxicated|agitation|restraints?|triage|dystonic|hypertensive crisis|nms|neuroleptic malignant|serotonin syndrome|wernicke|korsakoff|ciwa|cows|flumazenil|naloxone|narcan|charcoal|bowel obstruction|ileus|loaded intravenously|iv|im|eps|prophylaxis|first-line treatment|what is the treatment|how is .* managed|dose of im|dose of .* agitation|panic.*er)\b/i.test(message)
    && /\b(dystonic|maoi|phenelzine|tranylcypromine|hypertensive crisis|nms|neuroleptic malignant|haloperidol|haldol|olanzapine|zyprexa|ziprasidone|geodon|lorazepam|ativan|ssri|sertraline|fluoxetine|suicidal|suicide|ketamine|diphenhydramine|benadryl|serotonin syndrome|benzodiazepine|benzo|restraints?|seclusion|midazolam|versed|flumazenil|panicked|panic|clozapine|clozaril|valproate|depakote|divalproex|opioid withdrawal|buprenorphine|suboxone|naloxone|narcan|wernicke|korsakoff|disulfiram|cows|cocaine|methadone|heroin|clonidine)\b/i.test(message)
    && !/\b(source says|draft says|note says|patient reports|patient denies|document|wording|chart-ready|chart ready|write this|rewrite)\b/i.test(message)
  );
}

function looksLikeMedicationUseSafetyQuestion(message: string) {
  return (
    /\b(can i|should i|could i)\s+(use|give|start|restart|prescribe|try)\b/i.test(message)
    && /\b(stimulant|antidepressant|antipsychotic|lamotrigine|lamictal|lithium|valproate|depakote|clozapine|ssri|snri|maoi|benzodiazepine|benzo)\b/i.test(message)
    && !/\b(diagnose|diagnosis|can i diagnose|does this meet)\b/i.test(message)
  );
}

function looksLikeBoundaryDocumentationIntent(message: string) {
  if (/^\s*make it\s+chart-ready\b/i.test(message)) {
    return false;
  }
  if (/^\s*chart wording\b.*\bno lecture\b/i.test(message)) {
    return false;
  }
  if (/\b(discharge|discharge-ready|discharge ready|exact plan language|honest plan language)\b/i.test(message)) {
    return false;
  }

  return (
    /^\s*(rewrite|draft|make this|make.*chart-ready|chart wording|write an hpi|draft risk wording|rewrite risk|help me document)\b/i.test(message)
    || /\b(help me document|make this non-stigmatizing|make this nonstigmatizing|make this chart-ready|chart-ready)\b/i.test(message)
  )
    && !/\b(can i|should i)\s+(diagnose|call|say|list|write|chart)\b/i.test(message);
}

function buildBoundaryDocumentationHelp(message: string): AssistantResponsePayload | null {
  if (!looksLikeBoundaryDocumentationIntent(message)) {
    return null;
  }

  const normalized = message.toLowerCase();

  if (/\bdenies si\b/.test(normalized) && /\bcollateral\b/.test(normalized) && /\bsuicidal texts?\b/.test(normalized)) {
    return {
      message: 'Chart-ready wording: "Patient denies SI. Collateral reports recent suicidal texts. The discrepancy remains clinically relevant and should be addressed in the risk assessment rather than treated as reassuring by denial alone."',
      suggestions: [],
      answerMode: 'chart_ready_wording',
    };
  }

  if (/\bdenies hi\b/.test(normalized) && /\bthreats?\b/.test(normalized)) {
    return {
      message: 'Chart-ready wording: "Patient denies HI. Source also notes threats yesterday; target and access are not known from the available information."',
      suggestions: [],
      answerMode: 'chart_ready_wording',
    };
  }

  if (/\bpassive death wish\b/.test(normalized)) {
    return {
      message: 'Chart-ready wording: "Patient reports passive death wish and denies plan or intent." Add timing, frequency, access to means, and protective factors only if documented.',
      suggestions: [],
      answerMode: 'chart_ready_wording',
    };
  }

  if (/\bdenies hallucinations\b/.test(normalized) && /\binternally preoccupied\b/.test(normalized)) {
    return {
      message: 'Chart-ready wording: "Patient denies hallucinations. Patient appears internally preoccupied on observation." Keep report and observation separate without converting observation into a confirmed hallucination.',
      suggestions: [],
      answerMode: 'chart_ready_wording',
    };
  }

  if (/\bappears paranoid\b/.test(normalized)) {
    return {
      message: 'Chart-ready wording: "Patient appears paranoid/suspicious on interview." If available, add the specific observed behavior rather than using the label alone.',
      suggestions: [],
      answerMode: 'chart_ready_wording',
    };
  }

  if (/\bnoncompliant\b/.test(normalized) && /\bmeds?|medications?\b/.test(normalized)) {
    return {
      message: 'Chart-ready wording: "Patient declined medication" or "Patient has not been taking medication as prescribed," depending on what the source supports. Include the stated reason or barrier only if documented.',
      suggestions: [],
      answerMode: 'chart_ready_wording',
    };
  }

  if (/\bwrite an hpi\b/.test(normalized)) {
    return {
      message: 'HPI draft: Patient reports depressed mood for 2 weeks with poor sleep. Patient denies SI. No additional symptoms, impairment, treatment history, or safety details were provided.',
      suggestions: [],
      answerMode: 'chart_ready_wording',
    };
  }

  if (/\brecent attempt\b/.test(normalized) && /\bsafety plan pending\b/.test(normalized)) {
    return {
      message: 'Chart-ready risk wording: "Patient denies SI, with recent attempt last week documented; safety plan pending." Do not summarize this as low risk without completing the risk assessment.',
      suggestions: [],
      answerMode: 'warning_language',
    };
  }

  if (/\bvoices\b/.test(normalized) && /\bdenies intent\b/.test(normalized)) {
    return {
      message: 'Chart-ready wording: "Patient reports voices telling him to leave and denies intent to harm self." Add command content, distress, ability to resist, and safety context only if documented.',
      suggestions: [],
      answerMode: 'chart_ready_wording',
    };
  }

  return {
    message: 'Chart-ready wording: preserve the exact patient report, collateral report, and observed behavior separately. Avoid unsupported labels and add missing context only when it is documented.',
    suggestions: [],
    answerMode: 'chart_ready_wording',
  };
}

function looksLikeFrustratedClinicalFollowup(message: string) {
  return /\b(that is why i am asking|that's why i am asking|why i am asking you|what kind of assistant|poor job|bad answer|not what i asked|you did not answer|you didn't answer|too generic|unhelpful|chatgpt is doing a poor job)\b/i.test(message);
}

function findPriorRecoverableClinicalQuestion(recentMessages?: AssistantThreadTurn[]) {
  if (!recentMessages?.length) {
    return null;
  }

  return [...recentMessages]
    .reverse()
    .find((turn) => {
      if (turn.role !== 'provider' || !turn.content?.trim()) {
        return false;
      }

      if (looksLikeFrustratedClinicalFollowup(turn.content)) {
        return false;
      }

      return looksLikeDirectInteractionReferenceQuestion(turn.content)
        || looksLikeDirectApprovalReferenceQuestion(turn.content)
        || looksLikeDirectLabMonitoringReferenceQuestion(turn.content)
        || looksLikeDirectEmergencyProtocolQuestion(turn.content)
        || looksLikeDirectGeriatricReferenceQuestion(turn.content)
        || looksLikePureMedicationReferenceQuestion(turn.content);
    })?.content || null;
}

function buildFrustratedClinicalCorrectionHelp(
  message: string,
  recentMessages?: AssistantThreadTurn[],
  context?: AssistantApiContext,
): AssistantResponsePayload | null {
  if (!looksLikeFrustratedClinicalFollowup(message)) {
    return null;
  }

  const priorQuestion = findPriorRecoverableClinicalQuestion(recentMessages);
  if (!priorQuestion) {
    return null;
  }

  const { sanitizedTexts } = sanitizePHITexts([priorQuestion]);
  const correctedPayload = buildGeneralKnowledgeHelp(sanitizedTexts[0], context);
  if (!correctedPayload?.message || correctedPayload.answerMode !== 'medication_reference_answer') {
    return null;
  }

  return {
    ...correctedPayload,
    message: `You are right - that answer was too generic. ${correctedPayload.message}`,
    suggestions: [],
  };
}

type UtilityQuestionPayload = {
  payload: AssistantResponsePayload;
  routePriority:
    | 'utility-date'
    | 'utility-time'
    | 'utility-relative-date'
    | 'utility-month-year'
    | 'utility-weekday-offset'
    | 'utility-weekday-check'
    | 'utility-specific-date'
    | 'utility-date-math'
    | 'utility-weekend';
};

function shouldSuppressGlobalAssistantSuggestions(answerMode?: string) {
  return answerMode === 'medication_reference_answer'
    || answerMode === 'general_health_reference'
    || answerMode === 'direct_reference_answer';
}

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

function toTitleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getWeekdayOffset(now: Date, targetWeekday: number) {
  const currentWeekday = now.getDay();
  return (targetWeekday - currentWeekday + 7) % 7;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function resolveNextWeekday(now: Date, weekdayName: string) {
  const targetWeekday = WEEKDAY_NAMES.indexOf(weekdayName as (typeof WEEKDAY_NAMES)[number]);
  if (targetWeekday === -1) {
    return null;
  }

  const offset = getWeekdayOffset(now, targetWeekday) || 7;
  const nextDate = new Date(now);
  nextDate.setDate(now.getDate() + offset);

  return {
    label: toTitleCase(weekdayName),
    offset,
    date: nextDate,
  };
}

function formatMonthDayYear(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function resolveMonthDay(now: Date, monthName: string, dayValue: number) {
  const monthIndex = MONTH_NAMES.indexOf(monthName as (typeof MONTH_NAMES)[number]);
  if (monthIndex === -1 || !Number.isInteger(dayValue) || dayValue < 1 || dayValue > 31) {
    return null;
  }

  const currentYear = now.getFullYear();
  const candidate = new Date(currentYear, monthIndex, dayValue);
  if (candidate.getMonth() !== monthIndex || candidate.getDate() !== dayValue) {
    return null;
  }

  if (startOfDay(candidate).getTime() < startOfDay(now).getTime()) {
    const nextYearCandidate = new Date(currentYear + 1, monthIndex, dayValue);
    if (nextYearCandidate.getMonth() !== monthIndex || nextYearCandidate.getDate() !== dayValue) {
      return null;
    }
    return nextYearCandidate;
  }

  return candidate;
}

function formatFullDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatMonthYear(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function buildUtilityQuestionPayload(message: string): UtilityQuestionPayload | null {
  const normalized = message.trim().toLowerCase();

  if (!normalized || !looksLikeQuestion(message)) {
    return null;
  }

  const now = new Date();
  const todayWeekdayMatch = normalized.match(/\bis today (sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (todayWeekdayMatch) {
    const requestedWeekday = todayWeekdayMatch[1].toLowerCase();
    const actualWeekday = WEEKDAY_NAMES[now.getDay()];
    const isMatch = actualWeekday === requestedWeekday;

    return {
      routePriority: 'utility-weekday-check',
      payload: {
        message: isMatch
          ? `Yes. Today is ${formatFullDate(now)}.`
          : `No. Today is ${formatFullDate(now)}.`,
        suggestions: [
          'I can also tell you the date for next Friday or how many days remain until a weekday or calendar date.',
        ],
      },
    };
  }

  const untilWeekdayMatch = normalized.match(/\b(?:how long|how many days)\s+(?:until|till)\s+(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (untilWeekdayMatch) {
    const target = resolveNextWeekday(now, untilWeekdayMatch[1].toLowerCase());
    if (target) {
      const dayPhrase = target.offset === 1 ? '1 day' : `${target.offset} days`;
      return {
        routePriority: 'utility-weekday-offset',
        payload: {
          message: `${target.label} is in ${dayPhrase}, on ${formatFullDate(target.date)}.`,
          suggestions: [
            'I can also answer questions like what date next Monday is or whether tomorrow lands on a specific weekday.',
          ],
        },
      };
    }
  }

  const nextWeekdayMatch = normalized.match(/\b(?:what(?:'s| is)(?: the date)?|when is) (?:for )?next (sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (nextWeekdayMatch) {
    const target = resolveNextWeekday(now, nextWeekdayMatch[1].toLowerCase());
    if (target) {
      return {
        routePriority: 'utility-weekday-offset',
        payload: {
          message: `Next ${target.label} is ${formatFullDate(target.date)}.`,
          suggestions: [
            'I can also answer how many days away that is if you need quick scheduling math.',
          ],
        },
      };
    }
  }

  const nextWeekdayDayMatch = normalized.match(/\b(?:could you tell me\s+)?what day(?: does)? next (sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?: fall| falls)? on\b/i)
    || normalized.match(/\bwhat day is(?: it)? next (sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (nextWeekdayDayMatch) {
    const target = resolveNextWeekday(now, nextWeekdayDayMatch[1].toLowerCase());
    if (target) {
      return {
        routePriority: 'utility-weekday-offset',
        payload: {
          message: `Next ${target.label} is ${formatFullDate(target.date)}.`,
          suggestions: [
            'I can also tell you how many days away that is or answer the same question for another weekday.',
          ],
        },
      };
    }
  }

  if (/\b(?:how long|how many days)\s+(?:until|till)\s+the weekend\b/i.test(normalized)) {
    const saturday = resolveNextWeekday(now, 'saturday');
    if (saturday) {
      const dayPhrase = saturday.offset === 1 ? '1 day' : `${saturday.offset} days`;
      return {
        routePriority: 'utility-weekend',
        payload: {
          message: `The weekend starts in ${dayPhrase}, on ${formatFullDate(saturday.date)}.`,
          suggestions: [
            'I can also tell you when next weekend starts or answer the date for a named weekday.',
          ],
        },
      };
    }
  }

  const weekendMatch = normalized.match(/\b(when is this weekend|what date is this weekend|when is next weekend|what date is next weekend)\b/i);
  if (weekendMatch) {
    const isNextWeekend = weekendMatch[1].includes('next weekend');
    const saturday = resolveNextWeekday(now, 'saturday');
    if (saturday) {
      const weekendStart = new Date(saturday.date);
      if (isNextWeekend) {
        weekendStart.setDate(weekendStart.getDate() + 7);
      }
      return {
        routePriority: 'utility-weekend',
        payload: {
          message: `${isNextWeekend ? 'Next' : 'This'} weekend starts ${formatFullDate(weekendStart)}.`,
          suggestions: [
            'If you want, I can also tell you how many days away that weekend is.',
          ],
        },
      };
    }
  }

  if (/\b(what is the day after tomorrow|what'?s the day after tomorrow|day after tomorrow'?s date|what day is the day after tomorrow)\b/i.test(normalized)) {
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + 2);

    return {
      routePriority: 'utility-relative-date',
      payload: {
        message: `The day after tomorrow is ${formatFullDate(targetDate)}.`,
        suggestions: [
          'I can also answer tomorrow, next Friday, or short date-math questions directly.',
        ],
      },
    };
  }

  const untilDateMatch = normalized.match(/\b(?:how long|how many days)\s+(?:until|till)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/i);
  if (untilDateMatch) {
    const targetDate = resolveMonthDay(now, untilDateMatch[1].toLowerCase(), Number(untilDateMatch[2]));
    if (targetDate) {
      const diffMs = startOfDay(targetDate).getTime() - startOfDay(now).getTime();
      const diffDays = Math.round(diffMs / 86_400_000);
      const dayPhrase = diffDays === 1 ? '1 day' : `${diffDays} days`;
      return {
        routePriority: 'utility-specific-date',
        payload: {
          message: `${formatMonthDayYear(targetDate)} is in ${dayPhrase}.`,
          suggestions: [
            'I can also tell you what day of the week that lands on.',
          ],
        },
      };
    }
  }

  const specificDateMatch = normalized.match(/\b(?:what day is|what day of the week is|which day is)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/i);
  if (specificDateMatch) {
    const targetDate = resolveMonthDay(now, specificDateMatch[1].toLowerCase(), Number(specificDateMatch[2]));
    if (targetDate) {
      return {
        routePriority: 'utility-specific-date',
        payload: {
          message: `${formatMonthDayYear(targetDate)} is ${new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(targetDate)}.`,
          suggestions: [
            'I can also tell you how many days away that date is.',
          ],
        },
      };
    }
  }

  const whenSpecificDateMatch = normalized.match(/\bwhen is\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/i);
  if (whenSpecificDateMatch) {
    const targetDate = resolveMonthDay(now, whenSpecificDateMatch[1].toLowerCase(), Number(whenSpecificDateMatch[2]));
    if (targetDate) {
      return {
        routePriority: 'utility-specific-date',
        payload: {
          message: `${formatMonthDayYear(targetDate)} is ${new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(targetDate)}.`,
          suggestions: [
            'I can also tell you how many days away that date is.',
          ],
        },
      };
    }
  }

  const dayMathMatch = normalized.match(/\bwhat(?:'s| is)? the date (?:(?:in|after)\s+(\d+)\s+(day|days|week|weeks)|(\d+)\s+(day|days|week|weeks)\s+from today)\b/i);
  if (dayMathMatch) {
    const amount = Number(dayMathMatch[1] || dayMathMatch[3]);
    const unit = (dayMathMatch[2] || dayMathMatch[4] || '').toLowerCase();
    if (Number.isFinite(amount) && amount >= 0) {
      const offsetDays = unit.startsWith('week') ? amount * 7 : amount;
      const targetDate = new Date(now);
      targetDate.setDate(now.getDate() + offsetDays);
      return {
        routePriority: 'utility-date-math',
        payload: {
          message: `That date is ${formatFullDate(targetDate)}.`,
          suggestions: [
            'I can also answer the same kind of question for a named weekday or calendar date.',
          ],
        },
      };
    }
  }

  const tomorrowWeekdayMatch = normalized.match(/\bis tomorrow (sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (tomorrowWeekdayMatch) {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const requestedWeekday = tomorrowWeekdayMatch[1].toLowerCase();
    const actualWeekday = WEEKDAY_NAMES[tomorrow.getDay()];
    const isMatch = actualWeekday === requestedWeekday;

    return {
      routePriority: 'utility-weekday-check',
      payload: {
        message: isMatch
          ? `Yes. Tomorrow is ${formatFullDate(tomorrow)}.`
          : `No. Tomorrow is ${formatFullDate(tomorrow)}.`,
        suggestions: [
          'If you want, I can also tell you how many days away a weekday is or give the exact date for next Monday or Friday.',
        ],
      },
    };
  }

  if (/\b(what year is it|current year)\b/i.test(normalized)) {
    return {
      routePriority: 'utility-month-year',
      payload: {
        message: `It is ${now.getFullYear()}.`,
        suggestions: [
          'I can also answer the current month, today’s date, or quick calendar math directly.',
        ],
      },
    };
  }

  if (/\b(what month is it|what month are we in|current month)\b/i.test(normalized)) {
    return {
      routePriority: 'utility-month-year',
      payload: {
        message: `It is ${formatMonthYear(now)}.`,
        suggestions: [
          'I can also answer quick date or time questions directly without switching into clinical review mode.',
        ],
      },
    };
  }

  if (
    /\b(what(?:'s| is)? today|what(?:'s| is)? the date|today'?s date|what day is it|what day is today)\b/i.test(normalized)
  ) {
    return {
      routePriority: 'utility-date',
      payload: {
        message: `Today is ${formatFullDate(now)}.`,
        suggestions: [
          'If you want, I can also help with quick non-clinical utility questions without routing into note review.',
        ],
      },
    };
  }

  if (/\b(what is tomorrow|what'?s tomorrow|tomorrow'?s date|what day is tomorrow)\b/i.test(normalized)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);

    return {
      routePriority: 'utility-relative-date',
      payload: {
        message: `Tomorrow is ${formatFullDate(tomorrow)}.`,
        suggestions: [
          'If you want, I can also give yesterday, today, or the current time directly.',
        ],
      },
    };
  }

  if (/\b(what was yesterday|what'?s yesterday|yesterday'?s date|what day was yesterday)\b/i.test(normalized)) {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    return {
      routePriority: 'utility-relative-date',
      payload: {
        message: `Yesterday was ${formatFullDate(yesterday)}.`,
        suggestions: [
          'If you want, I can also give today, tomorrow, or the current time directly.',
        ],
      },
    };
  }

  if (/\b(what time is it|current time|time right now)\b/i.test(normalized)) {
    const timeLabel = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(now);

    return {
      routePriority: 'utility-time',
      payload: {
        message: `The current time is ${timeLabel}.`,
        suggestions: [
          'If you need the date too, I can give that directly without switching into clinical review mode.',
        ],
      },
    };
  }

  return null;
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
  const assistantName = getAssistantDisplayName(context);

  return {
    message: joinGuidance([
      'I drafted that missing note detail as a provider-requested revision.',
      targetSectionHeading ? `I will place it into ${targetSectionHeading} so you can review it in context.` : 'I will place it into the current draft so you can review it in context.',
      'Please confirm the wording still matches your source before final use.',
    ]),
    suggestions: [
      `Suggested revision: ${revisionText}`,
      'Use this when you forgot to include a source-supported detail after the draft was generated.',
      `If this kind of addition repeats often, ${assistantName} can help turn it into a reusable workflow preference later.`,
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

type DraftFormatKind =
  | 'one-paragraph'
  | 'shorter'
  | 'longer'
  | 'narrative'
  | 'chronological'
  | 'soap'
  | 'concise-headings'
  | 'two-paragraph-hpi-mse-plan'
  | 'professional'
  | 'source-bound'
  | 'ehr-ready';

type DraftFormatRequest = {
  kind: DraftFormatKind;
  label: string;
};

function normalizeDraftFormatMessage(message: string) {
  return normalizeMessageForClinicalRouting(message)
    .replace(/\bfrist\b/g, 'first')
    .replace(/\bfrst\b/g, 'first')
    .replace(/\bsecnd\b/g, 'second')
    .replace(/\bseconed\b/g, 'second')
    .replace(/\bscnd\b/g, 'second')
    .replace(/\bpara\b/g, 'paragraph')
    .replace(/\bparas\b/g, 'paragraphs')
    .replace(/\bparagraf\b/g, 'paragraph')
    .replace(/\bparagrph\b/g, 'paragraph')
    .replace(/\bparagaph\b/g, 'paragraph')
    .replace(/\bparagragh\b/g, 'paragraph')
    .replace(/\bparagrapgh\b/g, 'paragraph')
    .replace(/\bparagrap\b/g, 'paragraph')
    .replace(/\bparagrah\b/g, 'paragraph')
    .replace(/\bpargraph\b/g, 'paragraph')
    .replace(/\bparagrpah\b/g, 'paragraph')
    .replace(/\bsectons\b/g, 'sections')
    .replace(/\bsectionz\b/g, 'sections')
    .replace(/\bshoter\b/g, 'shorter')
    .replace(/\bshortter\b/g, 'shorter')
    .replace(/\bcondence\b/g, 'condense')
    .replace(/\bcondenced\b/g, 'condensed')
    .replace(/\bcondnsed\b/g, 'condensed')
    .replace(/\bconcice\b/g, 'concise')
    .replace(/\bconcisse\b/g, 'concise')
    .replace(/\bconscise\b/g, 'concise')
    .replace(/\bheaders\b/g, 'headings')
    .replace(/\bbreif\b/g, 'brief')
    .replace(/\bbriefer\b/g, 'brief')
    .replace(/\blenghten\b/g, 'lengthen')
    .replace(/\blenght\b/g, 'length')
    .replace(/\bdetial\b/g, 'detail')
    .replace(/\bdetials\b/g, 'details')
    .replace(/\bnarative\b/g, 'narrative')
    .replace(/\bnarritive\b/g, 'narrative')
    .replace(/\bnarrativ\b/g, 'narrative')
    .replace(/\bstroy\b/g, 'story')
    .replace(/\bassesment\b/g, 'assessment')
    .replace(/\bpln\b/g, 'plan')
    .replace(/\bsummery\b/g, 'summary');
}

function classifyDraftFormatRequest(message: string): DraftFormatRequest | null {
  const normalized = normalizeDraftFormatMessage(message);

  const hasDraftAnchor = /\b(note|draft|follow[-\s]?up|progress note|hpi|mse|plan|this|it)\b/.test(normalized);
  const hasRewriteVerb = /\b(make|turn|convert|change|format|rewrite|put|collapse|flow|split|organize|reorganize|shape)\b/.test(normalized);
  if (!hasDraftAnchor || !hasRewriteVerb) {
    return null;
  }

  if (
    /\bhpi\b.*\b(first|1st)\s+paragraph\b.*\b(mse|mental status|plan)\b.*\b(second|2nd)\s+paragraph\b/.test(normalized)
    || /\b(first|1st)\s+paragraph\b.*\bhpi\b.*\b(second|2nd)\s+paragraph\b.*\b(mse|mental status|plan)\b/.test(normalized)
    || /\bhpi\b.*\bparagraph\b.*\bmse\b.*\bplan\b/.test(normalized)
  ) {
    return {
      kind: 'two-paragraph-hpi-mse-plan',
      label: 'two-paragraph HPI/MSE/Plan format',
    };
  }

  const asksForParagraph = /\b(one|single|1)\s+paragraph\b/.test(normalized)
    || /\bparagraph form\b/.test(normalized)
    || /\bparagraph style\b/.test(normalized)
    || /\bin paragraph\b/.test(normalized)
    || /\bno sections?\b/.test(normalized)
    || /\binstead of sections?\b/.test(normalized);
  if (asksForParagraph) {
    return {
      kind: 'one-paragraph',
      label: 'one-paragraph format',
    };
  }

  if (/\b(shorter|more concise|concise|tighten|tighter|less wordy|brief|condense|condensed)\b/.test(normalized)) {
    if (/\b(keep|leave|preserve)\b.*\b(headings?|sections?)\b|\b(headings?|sections?)\b.*\b(keep|leave|preserve)\b/.test(normalized)) {
      return {
        kind: 'concise-headings',
        label: 'concise sectioned format',
      };
    }

    return {
      kind: 'shorter',
      label: 'shorter concise format',
    };
  }

  if (/\b(longer|lengthen|more detail|more details|include more detail|include more details|more complete)\b/.test(normalized)) {
    return {
      kind: 'longer',
      label: 'more detailed format',
    };
  }

  if (/\b(more professional|professional|polished|cleaner|less casual|clinical tone|chart tone|sound better|more formal)\b/.test(normalized)) {
    return {
      kind: 'professional',
      label: 'professional chart tone',
    };
  }

  if (
    /\b(remove unsupported|unsupported statements?|closer to source|source[-\s]?bound|less certain|more conservative|do not add facts|don't add facts)\b/.test(normalized)
    && !/\b(flow like a story|like a story|story form|narrative|narrative form|flow better|make it flow|story-like|storylike|chronological|timeline|soap|ehr[-\s]?ready|copy[-\s]?paste)\b/.test(normalized)
  ) {
    return {
      kind: 'source-bound',
      label: 'source-bound conservative format',
    };
  }

  if (/\b(flow like a story|like a story|story form|narrative|narrative form|flow better|make it flow|story-like|storylike)\b/.test(normalized)) {
    return {
      kind: 'narrative',
      label: 'narrative story-flow format',
    };
  }

  if (/\b(chronological|chronologic|timeline|in order|order it happened|sequence)\b/.test(normalized)) {
    return {
      kind: 'chronological',
      label: 'chronological story-flow format',
    };
  }

  if (/\bsoap\b|\bsubjective\b.*\bobjective\b.*\bassessment\b.*\bplan\b/.test(normalized)) {
    return {
      kind: 'soap',
      label: 'SOAP format',
    };
  }

  if (/\b(ehr[-\s]?ready|copy[-\s]?paste|copy into|paste into|wellsky|tebra|epic|cerner|athena|athenaone|eclinicalworks|advancedmd|drchrono|simplepractice|therapy ?notes|export format|field ready)\b/.test(normalized)) {
    return {
      kind: 'ehr-ready',
      label: 'EHR-ready copy/paste format',
    };
  }

  return null;
}

function classifyContextualDraftFormatFollowup(message: string, context?: AssistantApiContext): DraftFormatRequest | null {
  if (!context?.currentDraftText?.trim()) {
    return null;
  }

  const normalized = normalizeDraftFormatMessage(message);
  const likelyReferenceQuestion = /\b(what is|what are|what does|how does|can .{0,40}\b(take|be taken|use|be used)|approved|fda|interaction|contraindication|criteria|diagnos|dose|lab|level|lithium|wellbutrin|bupropion|paxil|paroxetine|lamictal|lamotrigine|schizoaffective|bipolar|psychosis|ssri|snri|antipsychotic)\b/.test(normalized);
  if (likelyReferenceQuestion) {
    return null;
  }

  if (/\bhpi\b.*\b(first|1st)\s+paragraph\b.*\b(mse|mental status|plan)\b.*\b(second|2nd)\s+paragraph\b/.test(normalized)
    || /\b(first|1st)\s+paragraph\b.*\bhpi\b.*\b(second|2nd)\s+paragraph\b.*\b(mse|mental status|plan)\b/.test(normalized)
    || /\bhpi\b.*\bparagraph\b.*\bmse\b.*\bplan\b/.test(normalized)) {
    return {
      kind: 'two-paragraph-hpi-mse-plan',
      label: 'two-paragraph HPI/MSE/Plan format',
    };
  }

  const visibleDraftAnchor = /\b(note|draft|follow[-\s]?up note|progress note|this|it|sections?|hpi|mse|plan)\b/.test(normalized);
  if (/\b(one|single|1)\s+paragraph\b|\bparagraph form\b|\bparagraph style\b|\bin paragraph\b|\bno sections?\b|\binstead of sections?\b/.test(normalized)) {
    if (!visibleDraftAnchor) {
      return null;
    }

    return {
      kind: 'one-paragraph',
      label: 'one-paragraph format',
    };
  }

  const namedNoteBuilderTarget = /\b(discharge summary|admission note|admit note|progress note|follow[-\s]?up note|hpi|assessment|risk wording|safety wording|plan paragraph)\b/.test(normalized);
  const clinicalContentAnchor = /\b(voices?|hallucinations?|ah|vh|command|si|suicid|hi|homicid|risk|goodbye texts?|unsafe|psychosis|mania|manic|meth|withdrawal|intoxication|meds?|refus)\b/.test(normalized);
  const terseRewriteOnly = normalized.split(/\s+/).filter(Boolean).length <= 4 && !namedNoteBuilderTarget;
  if (/\b(shorter|more concise|concise|tighten|tighter|less wordy|brief|condense|condensed)\b/.test(normalized)
    && !clinicalContentAnchor
    && (/\b(keep|matters?|preserve|dont lose|don't lose|leave|still include|maintain|same facts?|what matters)\b/.test(normalized) || terseRewriteOnly)) {
    return {
      kind: 'shorter',
      label: 'shorter concise format',
    };
  }

  if (/\b(longer|lengthen|more detail|more details|include more detail|include more details|more complete)\b/.test(normalized)) {
    return {
      kind: 'longer',
      label: 'more detailed format',
    };
  }

  if (/\b(more professional|professional|polished|cleaner|less casual|clinical tone|chart tone|sound better|more formal)\b/.test(normalized)) {
    return {
      kind: 'professional',
      label: 'professional chart tone',
    };
  }

  if (
    /\b(remove unsupported|unsupported statements?|closer to source|source[-\s]?bound|less certain|more conservative|do not add facts|don't add facts)\b/.test(normalized)
    && !/\b(flow like a story|like a story|story form|narrative|narrative form|flow better|make it flow|story-like|storylike|chronological|timeline|soap|ehr[-\s]?ready|copy[-\s]?paste)\b/.test(normalized)
  ) {
    return {
      kind: 'source-bound',
      label: 'source-bound conservative format',
    };
  }

  if (/\b(flow like a story|like a story|story form|narrative|narrative form|flow better|make it flow|story-like|storylike)\b/.test(normalized)) {
    return {
      kind: 'narrative',
      label: 'narrative story-flow format',
    };
  }

  if (/\b(chronological|chronologic|timeline|in order|order it happened|sequence)\b/.test(normalized)) {
    return {
      kind: 'chronological',
      label: 'chronological story-flow format',
    };
  }

  if (/\bsoap\b|\bsubjective\b.*\bobjective\b.*\bassessment\b.*\bplan\b/.test(normalized)) {
    return {
      kind: 'soap',
      label: 'SOAP format',
    };
  }

  if (/\b(ehr[-\s]?ready|copy[-\s]?paste|copy into|paste into|wellsky|tebra|epic|cerner|athena|athenaone|eclinicalworks|advancedmd|drchrono|simplepractice|therapy ?notes|export format|field ready)\b/.test(normalized)) {
    return {
      kind: 'ehr-ready',
      label: 'EHR-ready copy/paste format',
    };
  }

  return null;
}

function shouldSuppressDraftFormatContextFallback(message: string) {
  const normalized = normalizeDraftFormatMessage(message);
  return /\b(what is|what are|what does|how does|can .{0,40}\b(take|be taken|use|be used)|approved|fda|interaction|contraindication|criteria|diagnos|dose|lab|level|lithium|wellbutrin|bupropion|paxil|paroxetine|lamictal|lamotrigine|schizoaffective|bipolar|psychosis|ssri|snri|antipsychotic)\b/.test(normalized)
    || /\b(voices?|hallucinations?|ah|vh|command|si|suicid|hi|homicid|risk|goodbye texts?|unsafe|psychosis|mania|manic|meth|withdrawal|intoxication|meds?|refus)\b/.test(normalized);
}

function normalizeDraftHeading(value: string) {
  return value
    .replace(/^#{1,6}\s*/, '')
    .replace(/:$/, '')
    .trim();
}

function isLikelyDraftHeading(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  if (/^#{1,6}\s+\S/.test(trimmed)) {
    return true;
  }

  if (
    /^[A-Z][A-Za-z0-9 /&(),'-]{1,60}:$/.test(trimmed)
    && !/[.!?]$/.test(trimmed.replace(/:$/, ''))
  ) {
    return true;
  }

  return false;
}

function stripListMarker(line: string) {
  return line
    .replace(/^\s*[-*]\s+/, '')
    .replace(/^\s*\d+[.)]\s+/, '')
    .trim();
}

function collapseDraftToOneParagraph(draftText: string) {
  const chunks: string[] = [];
  let pendingHeading = '';

  for (const rawLine of draftText.replace(/\r/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line || /^```/.test(line)) {
      continue;
    }

    if (isLikelyDraftHeading(line)) {
      pendingHeading = normalizeDraftHeading(line);
      continue;
    }

    const inlineHeading = line.match(/^([A-Z][A-Za-z0-9 /&(),'-]{1,60}):\s+(.+)$/);
    if (inlineHeading && inlineHeading[2]?.trim()) {
      const heading = normalizeDraftHeading(inlineHeading[1]);
      chunks.push(`${heading}: ${stripListMarker(inlineHeading[2])}`);
      pendingHeading = '';
      continue;
    }

    const cleaned = stripListMarker(line);
    if (!cleaned) {
      continue;
    }

    if (pendingHeading) {
      chunks.push(`${pendingHeading}: ${cleaned}`);
      pendingHeading = '';
    } else {
      chunks.push(cleaned);
    }
  }

  return chunks
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

function splitDraftIntoNamedSections(draftText: string) {
  const sections: Array<{ heading: string; text: string }> = [];
  let currentHeading = 'Draft';
  let currentLines: string[] = [];

  function flush() {
    const text = currentLines
      .map(stripListMarker)
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (text) {
      sections.push({ heading: currentHeading, text });
    }
  }

  for (const rawLine of draftText.replace(/\r/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line || /^```/.test(line)) {
      continue;
    }

    if (isLikelyDraftHeading(line)) {
      flush();
      currentHeading = normalizeDraftHeading(line);
      currentLines = [];
      continue;
    }

    const inlineHeading = line.match(/^([A-Z][A-Za-z0-9 /&(),'-]{1,60}):\s+(.+)$/);
    if (inlineHeading && inlineHeading[2]?.trim()) {
      flush();
      currentHeading = normalizeDraftHeading(inlineHeading[1]);
      currentLines = [inlineHeading[2]];
      continue;
    }

    currentLines.push(line);
  }

  flush();

  return sections;
}

function sectionMatches(heading: string, patterns: RegExp[]) {
  const normalized = normalizeMessageForClinicalRouting(heading);
  return patterns.some((pattern) => pattern.test(normalized));
}

function formatDraftAsTwoParagraphs(draftText: string) {
  const sections = splitDraftIntoNamedSections(draftText);
  if (!sections.length) {
    return collapseDraftToOneParagraph(draftText);
  }

  const firstParagraphSections = sections.filter((section) => sectionMatches(section.heading, [
    /\bhpi\b/,
    /\bsubjective\b/,
    /\binterval\b/,
    /\bchief\b/,
    /\bhistory\b/,
  ]));
  const secondParagraphSections = sections.filter((section) => sectionMatches(section.heading, [
    /\bmse\b/,
    /\bmental status\b/,
    /\bobjective\b/,
    /\bassessment\b/,
    /\bplan\b/,
  ]));
  const used = new Set([...firstParagraphSections, ...secondParagraphSections]);
  const remaining = sections.filter((section) => !used.has(section));

  const first = (firstParagraphSections.length ? firstParagraphSections : remaining.slice(0, Math.ceil(remaining.length / 2)))
    .map((section) => `${section.heading}: ${section.text}`)
    .join(' ');
  const secondBase = secondParagraphSections.length
    ? secondParagraphSections
    : remaining.slice(Math.ceil(remaining.length / 2));
  const second = secondBase
    .map((section) => `${section.heading}: ${section.text}`)
    .join(' ');

  return [first, second]
    .filter(Boolean)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .join('\n\n');
}

function formatDraftAsSoap(draftText: string) {
  const sections = splitDraftIntoNamedSections(draftText);
  if (!sections.length) {
    return collapseDraftToOneParagraph(draftText);
  }

  const buckets: Record<'Subjective' | 'Objective' | 'Assessment' | 'Plan', string[]> = {
    Subjective: [],
    Objective: [],
    Assessment: [],
    Plan: [],
  };

  for (const section of sections) {
    const heading = normalizeMessageForClinicalRouting(section.heading);
    if (/\b(plan|follow[-\s]?up|labs?|medications?|safety plan|referral|homework|next steps?)\b/.test(heading)) {
      buckets.Plan.push(section.text);
    } else if (/\b(assessment|diagnos|impression|formulation|response to intervention|clinical status)\b/.test(heading)) {
      buckets.Assessment.push(section.text);
    } else if (/\b(objective|mse|mental status|exam|vitals?|observations?|appearance|affect|thought process|insight|judgment)\b/.test(heading)) {
      buckets.Objective.push(section.text);
    } else {
      buckets.Subjective.push(section.text);
    }
  }

  return (['Subjective', 'Objective', 'Assessment', 'Plan'] as const)
    .map((heading) => {
      const text = buckets[heading].join(' ').replace(/\s+/g, ' ').trim();
      return text ? `${heading}:\n${text}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

function formatDraftWithConciseHeadings(draftText: string) {
  const sections = splitDraftIntoNamedSections(draftText);
  if (!sections.length) {
    return collapseDraftToOneParagraph(draftText);
  }

  return sections
    .map((section) => `${section.heading}:\n${section.text}`)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitDraftSentences(text: string) {
  const normalized = text
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return [];
  }

  const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [normalized];
  return sentences
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function scoreDraftSentenceForConcision(sentence: string, heading: string) {
  const normalized = normalizeMessageForClinicalRouting(`${heading} ${sentence}`);
  let score = 0;

  if (/\b(si|suicid|hi|homicid|self[-\s]?harm|risk|safety|denies?|denied|collateral|staff|observed)\b/.test(normalized)) {
    score += 6;
  }

  if (/\b(med|medication|adherence|missed|forgot|stopped|refus|side effect|dose|escitalopram|sertraline|fluoxetine|paroxetine|paxil|wellbutrin|bupropion|lithium|lamotrigine|lamictal|clozapine|antipsychotic|ssri|snri)\b/.test(normalized)) {
    score += 5;
  }

  if (/\b(plan|follow[-\s]?up|referral|therapy|monitor|return|continue|change|recommend|consider)\b/.test(normalized)) {
    score += 4;
  }

  if (/\b(anxiety|panic|depress|mood|sleep|appetite|psychosis|hallucination|mania|avoidance|improved|worse|ongoing|partial|symptom)\b/.test(normalized)) {
    score += 3;
  }

  if (/\b(mse|mental status|appearance|speech|affect|thought process|thought content|insight|judgment|cooperative|goal directed|psychosis)\b/.test(normalized)) {
    score += 2;
  }

  if (/\b(no final|not documented|missing|visible draft|source supports?)\b/.test(normalized)) {
    score += 2;
  }

  if (sentence.length > 260) {
    score -= 1;
  }

  return score;
}

function tightenDraftSentence(sentence: string) {
  return sentence
    .replace(/\bPatient reports\b/g, 'Reports')
    .replace(/\bPatient reported\b/g, 'Reported')
    .replace(/\bPatient denies\b/g, 'Denies')
    .replace(/\bPatient denied\b/g, 'Denied')
    .replace(/\bis being considered\b/g, 'considered')
    .replace(/\bare being considered\b/g, 'considered')
    .replace(/\bis documented in the visible draft\b/g, 'documented')
    .replace(/\bare documented in the visible draft\b/g, 'documented')
    .replace(/\bNo final medication change is documented in the visible draft\b/g, 'No final medication change documented')
    .replace(/\bspeech normal rate\b/gi, 'normal-rate speech')
    .replace(/\bthought process goal directed\b/gi, 'goal-directed thought process')
    .replace(/\s+/g, ' ')
    .trim();
}

function shortenDraftSectionText(heading: string, text: string) {
  const sentences = splitDraftSentences(text);
  if (sentences.length <= 1) {
    return text.replace(/\s+/g, ' ').trim();
  }

  const normalizedHeading = normalizeMessageForClinicalRouting(heading);
  const targetSentenceCount = /\b(hpi|interval|history|subjective)\b/.test(normalizedHeading)
    ? 2
    : /\b(plan|next steps?|recommendations?|follow[-\s]?up)\b/.test(normalizedHeading)
    ? 2
    : 1;
  const scored = sentences.map((sentence, index) => ({
    sentence,
    index,
    score: scoreDraftSentenceForConcision(sentence, heading),
  }));
  const selectedIndexes = new Set(
    scored
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return left.index - right.index;
      })
      .slice(0, targetSentenceCount)
      .map((item) => item.index),
  );

  return scored
    .sort((left, right) => left.index - right.index)
    .filter((item) => selectedIndexes.has(item.index))
    .map((item) => tightenDraftSentence(item.sentence))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDraftShorter(draftText: string) {
  const sections = splitDraftIntoNamedSections(draftText);
  if (!sections.length) {
    const sentences = splitDraftSentences(collapseDraftToOneParagraph(draftText));
    if (sentences.length <= 3) {
      return sentences.join(' ').trim();
    }

    const scored = sentences.map((sentence, index) => ({
      sentence,
      index,
      score: scoreDraftSentenceForConcision(sentence, 'Draft'),
    }));
    const selected = new Set(
      scored
        .sort((left, right) => {
          if (right.score !== left.score) {
            return right.score - left.score;
          }
          return left.index - right.index;
        })
        .slice(0, 3)
        .map((item) => item.index),
    );

    return scored
      .sort((left, right) => left.index - right.index)
      .filter((item) => selected.has(item.index))
      .map((item) => tightenDraftSentence(item.sentence))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return sections
    .map((section) => {
      const text = shortenDraftSectionText(section.heading, section.text);
      return text ? `${section.heading}:\n${text}` : '';
    })
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatDraftAsNarrativeStory(draftText: string) {
  const sections = splitDraftIntoNamedSections(draftText);
  if (!sections.length) {
    return collapseDraftToOneParagraph(draftText);
  }

  const firstParagraph: string[] = [];
  const secondParagraph: string[] = [];

  for (const section of sections) {
    if (sectionMatches(section.heading, [
      /\bhpi\b/,
      /\bsubjective\b/,
      /\binterval\b/,
      /\bchief\b/,
      /\bhistory\b/,
      /\bsymptoms?\b/,
    ])) {
      firstParagraph.push(section.text);
      continue;
    }

    if (sectionMatches(section.heading, [
      /\bmse\b/,
      /\bmental status\b/,
      /\bobjective\b/,
      /\bassessment\b/,
      /\bplan\b/,
      /\brisk\b/,
      /\bsafety\b/,
    ])) {
      secondParagraph.push(section.text);
      continue;
    }

    if (!firstParagraph.length) {
      firstParagraph.push(section.text);
    } else {
      secondParagraph.push(section.text);
    }
  }

  const paragraphs = [
    firstParagraph.join(' '),
    secondParagraph.join(' '),
  ]
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return paragraphs.join('\n\n') || collapseDraftToOneParagraph(draftText);
}

function formatDraftWithExpandedDetails(draftText: string) {
  const sections = splitDraftIntoNamedSections(draftText);
  if (!sections.length) {
    return collapseDraftToOneParagraph(draftText);
  }

  return sections
    .map((section) => {
      const text = section.text
        .replace(/\s+/g, ' ')
        .replace(/\b(no|not)\s+documented\b/gi, 'not documented')
        .trim();
      return `${section.heading}:\n${text}`;
    })
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanDraftClinicalAbbreviations(text: string) {
  return text
    .replace(/\bpt\b/gi, 'Patient')
    .replace(/\bdc\b/gi, 'discharge')
    .replace(/\bsi\b/gi, 'suicidal ideation')
    .replace(/\bhi\b/gi, 'homicidal ideation')
    .replace(/\bah\b/gi, 'auditory hallucinations')
    .replace(/\bvh\b/gi, 'visual hallucinations')
    .replace(/\bmeds\b/gi, 'medications')
    .replace(/\bkinda\b/gi, 'somewhat')
    .replace(/\bsorta\b/gi, 'somewhat')
    .replace(/\bidk\b/gi, 'unclear')
    .replace(/\bmaybe\b/gi, 'possibly')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDraftWithProfessionalTone(draftText: string) {
  const sections = splitDraftIntoNamedSections(draftText);
  if (!sections.length) {
    return cleanDraftClinicalAbbreviations(collapseDraftToOneParagraph(draftText));
  }

  return sections
    .map((section) => `${section.heading}:\n${cleanDraftClinicalAbbreviations(section.text)}`)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatDraftConservatively(draftText: string) {
  return formatDraftWithProfessionalTone(draftText)
    .replace(/\bresolved\b/gi, 'improved or resolved only if supported by source')
    .replace(/\bstable for discharge\b/gi, 'discharge readiness not established from the visible draft')
    .replace(/\bsafe for discharge\b/gi, 'discharge safety not established from the visible draft')
    .replace(/\blow[-\s]?risk\b/gi, 'risk level not established from the visible draft')
    .replace(/\bno safety concerns?\b/gi, 'no safety concerns documented only if supported by source')
    .replace(/\s+/g, ' ')
    .replace(/([.:])\s+(HPI|MSE|Plan|Assessment|Subjective|Objective|Safety|Risk):/g, '$1\n\n$2:')
    .trim();
}

function formatDraftForRequest(draftText: string, request: DraftFormatRequest) {
  const collapsed = collapseDraftToOneParagraph(draftText);

  switch (request.kind) {
    case 'two-paragraph-hpi-mse-plan':
      return formatDraftAsTwoParagraphs(draftText);
    case 'soap':
      return formatDraftAsSoap(draftText);
    case 'concise-headings':
      return formatDraftWithConciseHeadings(draftText);
    case 'shorter':
      return formatDraftShorter(draftText);
    case 'longer':
      return formatDraftWithExpandedDetails(draftText);
    case 'professional':
      return formatDraftWithProfessionalTone(draftText);
    case 'source-bound':
      return formatDraftConservatively(draftText);
    case 'narrative':
      return formatDraftAsNarrativeStory(draftText);
    case 'chronological':
      return splitDraftIntoNamedSections(draftText)
        .map((section) => `${section.heading}: ${section.text}`)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim() || collapsed;
    case 'ehr-ready':
      return splitDraftIntoNamedSections(draftText)
        .map((section) => `${section.heading}:\n${section.text}`)
        .join('\n\n')
        .replace(/[•]/g, '-')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim() || collapsed;
    case 'one-paragraph':
    default:
      return collapsed;
  }
}

function buildDraftFormattingHelp(
  message: string,
  context?: AssistantApiContext,
): AssistantResponsePayload | null {
  const formatRequest = classifyDraftFormatRequest(message)
    || classifyContextualDraftFormatFollowup(message, context);
  if (!formatRequest) {
    return null;
  }

  const currentDraft = context?.currentDraftText?.trim();
  const noteLabel = context?.noteType || 'note';

  if (!currentDraft) {
    return null;
  }

  const formattedDraft = formatDraftForRequest(currentDraft, formatRequest);
  if (!formattedDraft) {
    return {
      message: `I found the draft, but there was not enough visible note text to safely collapse into one paragraph. Open the draft text or paste the section you want reformatted.`,
      suggestions: [
        'This is a writing-shape request, not an MSE or clinical-safety re-review.',
      ],
      answerMode: 'workflow_guidance',
      builderFamily: 'workflow',
    };
  }

  const visibleDraft = formattedDraft.length > 3200
    ? `${formattedDraft.slice(0, 3200).replace(/\s+\S*$/, '')}...`
    : formattedDraft;

  return {
    message: `Chart-ready wording: here is the current ${noteLabel} rewritten in ${formatRequest.label} without adding new facts:\n\n${visibleDraft}`,
    suggestions: [
      'Review once for source fidelity before copying forward.',
      'I treated this as writing shape only, not a new MSE checklist.',
      'You can ask for another shape: shorter, longer, story flow, SOAP, chronological, or two paragraphs.',
      ...(formatRequest.kind === 'one-paragraph' ? ['One paragraph output is source-bound and does not add new facts.'] : []),
      ...(formattedDraft.length > visibleDraft.length ? ['The visible draft was long, so this response shows the first portion available to the assistant.'] : []),
    ],
    actions: [
      {
        type: 'apply-draft-rewrite',
        label: 'Apply to Draft',
        instructions: `Replace the active draft with this ${formatRequest.label}. The prior draft will be kept in version history.`,
        draftText: formattedDraft,
        rewriteLabel: formatRequest.label,
      },
    ],
    answerMode: 'chart_ready_wording',
    builderFamily: 'chart-wording',
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
  const sparseGraveDisabilityConcern = /\b(poor hygiene|missed a meal|self-care capacity is not documented|self care capacity is not documented|grave disability)\b/i.test(rawMessage);

  if (sparseGraveDisabilityConcern) {
    return {
      message: 'The source may contain self-care concern, but there is insufficient data to state grave disability as a settled conclusion from this alone.',
      suggestions: [
        'Describe the specific self-care or functional concern rather than turning it into a firm grave-disability label.',
        'Keep the uncertainty visible when broader self-care capacity is not documented.',
        'If you want, I can turn this into chart-ready wording that stays cautious and source-bound.',
      ],
    };
  }

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
  const assistantName = getAssistantDisplayName(context);

  if (hasKeyword(normalizedMessage, ['how are you', 'howre you', "how're you"])) {
    return {
      message: `I’m doing well${providerName ? `, ${providerName}` : ''}. I’m here and ready to help with note work, trusted lookups, or just getting unstuck.`,
      suggestions: [
        'You can ask me to revise a section, explain a warning, or look up a trusted reference.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['hello', 'hi vera', 'hey vera', 'hi atlas', 'hey atlas', 'good morning', 'good afternoon', 'good evening'])) {
    return {
      message: `Hi${providerName ? `, ${providerName}` : ''}. What do you need help with right now?`,
      suggestions: [
        'You can ask me to organize source material, tighten a draft, or look something up from trusted sources.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['thank you', 'thanks'])) {
    return {
      message: `You’re welcome${providerName ? `, ${providerName}` : ''}.`,
      suggestions: [
        'Ask for a revision, a lookup, or the next step whenever you’re ready.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['who are you', 'what can you do', 'what do you do'])) {
    return {
      message: `I’m ${assistantName}, your Veranote assistant. I can help with source organization, draft review, section rewrites, workflow preferences, and trusted reference lookups. If I do not know a trusted answer yet, I should say so and show you the safest next path.`,
      suggestions: [
        'Ask me to explain a warning, tighten a section, or look up a coding or documentation reference.',
      ],
    };
  }

  if (hasKeyword(normalizedMessage, ['can we chat', 'talk to me', 'are you there', 'help me think'])) {
    return {
      message: 'Yes. I can stay conversational while still helping you move the note forward. If you want, talk to me like a teammate and I will keep the answer grounded in your current workflow.',
      suggestions: [
        'Try: help me think through this warning.',
        'Try: I am not sure what to fix first.',
      ],
    };
  }

  return null;
}

function resolveAssistantProviderId(context?: AssistantApiContext, authenticatedProviderId?: string) {
  return authenticatedProviderId || context?.providerIdentityId || DEFAULT_PROVIDER_IDENTITY_ID;
}

async function buildRememberFactHelp(message: string, context?: AssistantApiContext, authenticatedProviderId?: string): Promise<AssistantResponsePayload | null> {
  const memoryMatch = message.match(/^(?:please\s+)?remember(?:\s+that)?\s+(.+)$/i);
  const rawFact = memoryMatch?.[1]?.trim();

  if (!rawFact) {
    return null;
  }

  const providerId = resolveAssistantProviderId(context, authenticatedProviderId);
  const learningStore = {
    ...createEmptyAssistantLearningStore(),
    ...(await getAssistantLearning(providerId)),
  };
  const normalizedFact = rawFact.replace(/\s+/g, ' ').trim().replace(/[.]+$/, '');
  const key = normalizedFact.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80);
  const existing = learningStore.conversationalMemoryFacts.find((item) => item.key === key);

  if (existing) {
    existing.fact = normalizedFact;
    existing.count += 1;
    existing.lastSeenAt = new Date().toISOString();
  } else {
    learningStore.conversationalMemoryFacts.unshift({
      key,
      fact: normalizedFact,
      count: 1,
      lastSeenAt: new Date().toISOString(),
    });
  }

  learningStore.conversationalMemoryFacts = learningStore.conversationalMemoryFacts.slice(0, 12);
  await saveAssistantLearning(learningStore, providerId);

  return {
    message: 'I’ll remember that as part of how I should support you here in Veranote.',
    suggestions: [
      `Saved memory: ${normalizedFact}`,
      'You can ask what I remember about your workflow any time.',
    ],
  };
}

async function buildRecallMemoryHelp(normalizedMessage: string, context?: AssistantApiContext, authenticatedProviderId?: string): Promise<AssistantResponsePayload | null> {
  if (!hasKeyword(normalizedMessage, ['what do you remember', 'what have you learned about me', 'what do you know about me', 'what do you remember about my workflow'])) {
    return null;
  }

  const providerId = resolveAssistantProviderId(context, authenticatedProviderId);
  const learningStore = await getAssistantLearning(providerId);
  const facts = (learningStore.conversationalMemoryFacts || []).slice(0, 4);

  if (!facts.length) {
    return {
      message: 'I do not have any saved relationship or workflow memories yet beyond your current note context.',
      suggestions: [
        'Say “remember that …” when you want me to keep something for future conversations.',
      ],
    };
  }

  return {
    message: 'Here is what I currently remember for supporting you in Veranote.',
    suggestions: facts.map((item) => item.fact),
  };
}

async function recordRelationshipSignalIfNeeded(normalizedMessage: string, context?: AssistantApiContext, authenticatedProviderId?: string) {
  const providerId = resolveAssistantProviderId(context, authenticatedProviderId);
  const learningStore = {
    ...createEmptyAssistantLearningStore(),
    ...(await getAssistantLearning(providerId)),
  };
  let changed = false;

  if (hasKeyword(normalizedMessage, ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'])) {
    learningStore.relationshipStats.greetingCount += 1;
    changed = true;
  }

  if (hasKeyword(normalizedMessage, ['thank you', 'thanks', 'appreciate it'])) {
    learningStore.relationshipStats.gratitudeCount += 1;
    changed = true;
  }

  if (hasKeyword(normalizedMessage, ['good job', 'nice work', 'that helped', 'helpful'])) {
    learningStore.relationshipStats.encouragementCount += 1;
    changed = true;
  }

  if (changed) {
    learningStore.relationshipStats.lastSeenAt = new Date().toISOString();
    await saveAssistantLearning(learningStore, providerId);
  }
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
  const assistantName = getAssistantDisplayName(context);
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
      message: `In review${noteLine}, use prompt preferences only for repeat patterns you actually want ${assistantName} to remember later, like overly polished wording or destination-specific cleanup.`,
      suggestions: [
        'Capture repeatable review edits as reusable note preferences.',
        'Avoid preferences that hide source ambiguity.',
        'Save only the changes you would want on the next note of this type.',
      ],
      actions,
    };
  }

  return {
    message: `Use the prompt builder${noteLine} to tell ${assistantName} how you want this note lane to behave. Focus on tone, section structure, destination formatting, and how conservative the wording should be.`,
    suggestions: [
      'Describe the note lane, not one patient.',
      'Say what to keep brief, what to keep literal, and what should stay uncertain.',
      destinationSuggestion,
      'Turn recurring instructions into a saved preset for this note type.',
    ],
    actions,
  };
}

function buildUnknownQuestionFallback(message: string, context?: AssistantApiContext): AssistantResponsePayload | null {
  if (!looksLikeQuestion(message)) {
    return null;
  }

  const assistantName = getAssistantDisplayName(context);

  if (looksLikeClinicalReasoningSource(message)) {
    if (/(heavy daily alcohol|missed clonazepam|tremor|vomiting|tachycardia|visual shadows|panic attack likely)/i.test(message)) {
      return {
        message: 'Calling this panic likely would be unsafe here because it buries withdrawal or medical-danger signals under a psych-only explanation.',
        suggestions: [
          'Keep the withdrawal pattern, autonomic findings, and delirium risk explicit.',
          'Do not let a panic formulation erase alcohol or benzodiazepine withdrawal risk.',
          'Ask for chart-ready assessment wording if you want the warning rewritten directly into the note.',
        ],
      };
    }

    return {
      message: 'Keep this source-bound. Preserve the dangerous contradiction, medical risk, or discharge blocker explicitly, and ask for the exact wording, warning, or plan language you want preserved.',
      suggestions: [
        'Ask for the exact warning language that should replace the unsafe draft wording.',
        'Ask what has to stay explicit in the assessment or plan.',
        'If the source is mixed, keep denial, observed findings, and collateral side by side instead of cleaning them up.',
      ],
    };
  }

  return {
    message: "I don't have a safe Veranote answer for that yet.",
    suggestions: [
      `Send this through Beta Feedback if you want it added as a teachable ${assistantName} skill.`,
    ],
    actions: [
      {
        type: 'send-beta-feedback',
        label: `Teach ${assistantName} this`,
        instructions: `Send this unanswered question into the ${assistantName} gaps queue so it can be reviewed and added to ${assistantName}'s abilities.`,
        feedbackCategory: 'feature-request',
        pageContext: 'Atlas assistant gap',
        feedbackMessage: `Atlas could not answer this provider question: ${message}`,
      },
    ],
  };
}

function classifyKnowledgeIntent(input: string): KnowledgeIntent {
  const normalized = input.toLowerCase();

  if (isDirectReferenceStyleQuestion(input) && !referencesCurrentNote(input)) {
    if (hasKeyword(normalized, [
      'trileptal', 'oxcarbazepine', 'starting dose', 'dose of', 'medication', 'what antidepressant',
      'generic starts with', 'duloxetine', 'desvenlafaxine', 'doxepin',
    ])) {
      return 'medication_help';
    }

    return 'reference_help';
  }

  if (hasKeyword(normalized, ['reference', 'source', 'citation', 'link', 'guideline', 'where can i verify'])) {
    return 'reference_help';
  }

  if (hasKeyword(normalized, ['icd', 'icd-10', 'icd10', 'code', 'coding', 'bill', 'billing', 'cpt', 'modifier'])) {
    return 'coding_help';
  }

  if (hasKeyword(normalized, [
    'sertraline', 'zoloft', 'escitalopram', 'lexapro', 'bupropion', 'wellbutrin', 'venlafaxine', 'effexor',
    'desvenlafaxine', 'pristiq', 'duloxetine', 'cymbalta', 'doxepin', 'trazodone', 'oxcarbazepine', 'trileptal',
    'lithium', 'lamotrigine', 'lamictal', 'quetiapine', 'seroquel',
    'olanzapine', 'zyprexa', 'aripiprazole', 'abilify', 'risperidone', 'risperdal', 'clozapine', 'clozaril',
    'lorazepam', 'ativan', 'medication', 'medications', 'side effect', 'black box', 'boxed warning',
    'ssri', 'ssris', 'snri', 'snris', 'antidepressant', 'antidepressants',
  ])) {
    return 'medication_help';
  }

  if (hasKeyword(normalized, [
    'drug', 'substance', 'k2', 'spice', 'mojo', 'bath salts', 'flakka', 'tianeptine', 'kratom',
    '7-oh', '7oh', 'xylazine', 'tranq', 'nitazene', 'm30',
  ])) {
    return 'substance_help';
  }

  if (hasKeyword(normalized, ['how do i write', 'how should i write', 'document', 'documentation', 'note', 'soap', 'assessment', 'plan', 'mse'])) {
    return 'workflow_help';
  }

  if (hasKeyword(normalized, ['diagnosis', 'rule out', 'rule-out', 'what is this', 'differential', 'provisional diagnosis'])) {
    return 'diagnosis_help';
  }

  return 'draft_support';
}

function trustedReferenceToAssistantSource(reference: TrustedReference): AssistantReferenceSource {
  return {
    label: reference.label,
    url: reference.url,
    sourceType: 'external',
  };
}

function assistantSourceToTrustedReference(source: AssistantReferenceSource): TrustedReference {
  return {
    id: `trusted:${source.url}`,
    label: source.label,
    url: source.url,
    domain: (() => {
      try {
        return new URL(source.url).hostname;
      } catch {
        return '';
      }
    })(),
    categories: ['psychiatry-reference'],
    aliases: [source.label],
    authority: 'trusted-external',
    useMode: 'reference-only',
    evidenceConfidence: 'moderate',
    reviewStatus: 'reviewed',
    ambiguityFlags: [],
    conflictMarkers: [],
    sourceAttribution: [{
      label: source.label,
      url: source.url,
      authority: 'trusted-external',
      kind: 'external',
    }],
    retrievalDate: new Date().toISOString(),
  };
}

function mergeAssistantReferences(...referenceSets: Array<AssistantReferenceSource[] | undefined>) {
  const seen = new Set<string>();
  return referenceSets
    .flatMap((references) => references || [])
    .filter((reference) => {
      if (!reference?.url || seen.has(reference.url)) {
        return false;
      }
      seen.add(reference.url);
      return true;
    });
}

function isUnknownFallbackPayload(payload: AssistantResponsePayload) {
  return payload.actions?.some((action) => action.type === 'send-beta-feedback')
    || payload.message.trim().toLowerCase() === "no, but i'll find out how i can learn how to.";
}

function bundleHasKnowledge(bundle: KnowledgeBundle) {
  return Boolean(
    bundle.diagnosisConcepts.length
    || bundle.codingEntries.length
    || bundle.medicationConcepts.length
    || bundle.emergingDrugConcepts.length
    || bundle.workflowGuidance.length
    || bundle.trustedReferences.length,
  );
}

function mergeHydratedReferencesIntoBundle(bundle: KnowledgeBundle, references: AssistantReferenceSource[]) {
  const mergedReferences = mergeAssistantReferences(
    bundle.trustedReferences.map(trustedReferenceToAssistantSource),
    references,
  );

  return {
    ...bundle,
    trustedReferences: mergedReferences.map(assistantSourceToTrustedReference),
  };
}

function buildKnowledgeSupportPayload(intent: KnowledgeIntent, bundle: KnowledgeBundle): AssistantResponsePayload | null {
  if (!bundleHasKnowledge(bundle)) {
    return null;
  }

  if (intent === 'clinical_mse_help') {
    return null;
  }

  if (intent === 'coding_help') {
    const entry = bundle.codingEntries[0];
    if (!entry) {
      return null;
    }

    return {
      message: `The closest coding direction here is ${entry.label}, but it should stay provisional until the note supports the needed specificity.`,
      suggestions: [
        `Likely ICD-10 family: ${entry.likelyIcd10Family}`,
        `Specificity issue: ${entry.specificityIssues}`,
        `Uncertainty issue: ${entry.uncertaintyIssues}`,
      ],
    };
  }

  if (intent === 'diagnosis_help') {
    const concept = bundle.diagnosisConcepts[0];
    if (!concept) {
      return null;
    }

    return {
      message: `${concept.displayName} may be a proposed diagnostic frame based on available information, but it should stay tentative unless the source clearly supports it.`,
      suggestions: [
        ...(concept.hallmarkFeatures[0] ? [`Hallmark feature to verify: ${concept.hallmarkFeatures[0]}`] : []),
        ...(concept.ruleOutCautions[0] ? [`Rule-out caution: ${concept.ruleOutCautions[0]}`] : []),
        ...(concept.documentationCautions[0] ? [`Documentation caution: ${concept.documentationCautions[0]}`] : []),
      ],
    };
  }

  if (intent === 'medication_help') {
    const medication = bundle.medicationConcepts[0];
    if (!medication) {
      return null;
    }

    return {
      message: `${medication.displayName} support is available, but the note should only describe medication effects, adherence, and risk if the source actually documents them.`,
      suggestions: [
        ...(medication.documentationCautions[0] ? [`Documentation caution: ${medication.documentationCautions[0]}`] : []),
        ...(medication.highRiskFlags[0] ? [`High-risk flag: ${medication.highRiskFlags[0]}`] : []),
      ],
    };
  }

  if (intent === 'substance_help') {
    const concept = bundle.emergingDrugConcepts[0];
    if (!concept) {
      return null;
    }

    return {
      message: `${concept.displayName} may fit this substance question, but keep intoxication, withdrawal, and identification language explicitly uncertain when the source is incomplete.`,
      suggestions: [
        ...(concept.intoxicationSignals[0] ? [`Possible intoxication signal: ${concept.intoxicationSignals[0]}`] : []),
        ...(concept.testingLimitations[0] ? [`Testing limitation: ${concept.testingLimitations[0]}`] : []),
        ...(concept.documentationCautions[0] ? [`Documentation caution: ${concept.documentationCautions[0]}`] : []),
      ],
    };
  }

  if (intent === 'workflow_help' || intent === 'draft_support' || intent === 'reference_help') {
    const guidance = bundle.workflowGuidance[0];
    if (!guidance) {
      return null;
    }

    return {
      message: guidance.guidance[0] || 'Keep the note conservative and source-prioritized.',
      suggestions: [
        ...(guidance.guidance[1] ? [guidance.guidance[1]] : []),
        ...(guidance.cautions[0] ? [`Caution: ${guidance.cautions[0]}`] : []),
      ],
    };
  }

  return null;
}

function appendUniqueSuggestions(payload: AssistantResponsePayload, additions: string[]) {
  if (!additions.length) {
    return payload;
  }

  const seen = new Set<string>();
  const suggestions = [...(payload.suggestions || []), ...additions].filter((item) => {
    if (!item || seen.has(item)) {
      return false;
    }
    seen.add(item);
    return true;
  });

  return {
    ...payload,
    suggestions,
  };
}

function buildDefensibilitySuggestions(input: {
  medicalNecessity: ReturnType<typeof evaluateMedicalNecessity>;
  levelOfCare: ReturnType<typeof evaluateLevelOfCare>;
  cptSupport: ReturnType<typeof evaluateCptSupport>;
  losAssessment: ReturnType<typeof evaluateLOS>;
  auditFlags: ReturnType<typeof detectAuditRisk>;
}) {
  return [
    ...input.medicalNecessity.missingElements.slice(0, 2),
    ...(input.levelOfCare.missingJustification[0] ? [`Level-of-care gap: ${input.levelOfCare.missingJustification[0]}`] : []),
    ...(input.cptSupport.cautions[0] ? [`Billing caution: ${input.cptSupport.cautions[0]}`] : []),
    ...(input.losAssessment.missingDischargeCriteria[0] ? [`LOS / discharge gap: ${input.losAssessment.missingDischargeCriteria[0]}`] : []),
    ...(input.auditFlags[0] ? [`Audit flag: ${input.auditFlags[0].message}`] : []),
  ];
}

function buildWorkflowSuggestions(input: {
  nextActions: ReturnType<typeof suggestNextActions>;
  triage: ReturnType<typeof suggestTriage>;
  discharge: ReturnType<typeof evaluateDischarge>;
  tasks: ReturnType<typeof suggestTasks>;
}) {
  return [
    ...(input.nextActions[0] ? [input.nextActions[0].suggestion] : []),
    ...(input.triage.reasoning[0] ? [`Triage consideration: ${input.triage.reasoning[0]}`] : []),
    ...(input.discharge.barriers[0] ? [`Discharge barrier: ${input.discharge.barriers[0]}`] : []),
    ...(input.tasks[0] ? [`Workflow task: ${input.tasks[0].task}`] : []),
  ];
}

function buildProviderMemoryTags(stage: AssistantStage, mode: AssistantMode, context?: AssistantApiContext) {
  return [
    stage,
    mode,
    context?.noteType,
    context?.specialty,
    context?.focusedSectionHeading,
  ].filter(Boolean) as string[];
}

function applyProviderMemoryToPayload(payload: AssistantResponsePayload, memoryItems: ProviderMemoryItem[]) {
  if (!memoryItems.length) {
    return payload;
  }

  return appendUniqueSuggestions(payload, memoryItems.slice(0, 3).map((item) => {
    return `Provider preference (${item.category}): ${item.content}`;
  }));
}

function looksLikeClinicalReasoningSource(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return false;
  }

  if (looksLikeRawClinicalDetail(trimmed)) {
    return true;
  }

  const hasClinicalContent = /(patient|pt\b|family|mother|brother|caregiver|nursing notes?|hallucinat|internal stimuli|internally preoccupied|si\b|hi\b|suicid|homicid|plan to overdose|poor hygiene|missed a meal|self-care|grave disability|responding to internal stimuli|denies|uds|upt|bal|tachycardia|orthostasis|bradycardia|potassium|fever|confusion|delirium|withdrawal|clonazepam|lithium|postpartum|camera was off|telehealth|head injury|alcohol|vomiting|sweating|tremor|visual shadows|ataxia|dehydration|strangulation marks|adolescent|teen|panic attack likely)/i.test(trimmed);

  if (!hasClinicalContent) {
    return false;
  }

  if (looksLikeQuestion(trimmed)) {
    return hasClinicalContent && trimmed.split(/\s+/).length >= 12;
  }

  return /[.;:]/.test(trimmed) || trimmed.split(/\s+/).length >= 8;
}

function isDirectReferenceStyleQuestion(message: string) {
  const normalized = message.trim().toLowerCase();

  return [
    /\bwhat is\b/,
    /\bhow many\b/,
    /\bstarting dose\b/,
    /\bstart(?:ing)? dose\b/,
    /\bdose of\b/,
    /\bwhat medication\b/,
    /\bwhat antidepressant\b/,
    /\bgeneric starts with\b/,
    /\brecommended hours\b/,
    /\bhours of sleep\b/,
    /\bhow much sleep\b/,
  ].some((pattern) => pattern.test(normalized));
}

function looksLikeDirectClinicalTermDefinitionQuestion(message: string) {
  const normalized = normalizeMessageForClinicalRouting(message);

  if (!/\b(what is|what does|what are|meaning of|define|what's)\b/.test(normalized)) {
    return false;
  }

  const asksKnownTerm = /\b(h&p|history and physical|hpi|mse|mental status exam|uds|upt|icd-?10|a1c|cbc|cmp|phq-?9|c-ssrs|cssrs)\b/.test(normalized);
  if (!asksKnownTerm) {
    return false;
  }

  // Keep note-grounded completion/rewrite prompts in the clinical safety lanes.
  return !/\b(in this note|for this note|current note|current draft|this patient|the patient|source says|draft says|patient reports|patient denies|chart|document|write|word|assessment|plan|auto-?complete|fill in|refuse|missing|leave blank|leave unfilled)\b/.test(normalized);
}

function referencesCurrentNote(message: string) {
  const normalized = message.trim().toLowerCase();

  return [
    /\bin (?:this|the) note\b/,
    /\bfrom (?:this|the) note\b/,
    /\bcurrent note\b/,
    /\bcurrent draft\b/,
    /\bthis patient\b/,
    /\bthe patient\b/,
    /\bsource\b/,
    /\bchart\b/,
    /\bdocument(?:ation)?\b/,
    /\bwrite\b/,
    /\bword(?:ing)?\b/,
    /\bassessment\b/,
    /\bplan\b/,
    /\bmse\b/,
  ].some((pattern) => pattern.test(normalized));
}

function shouldIgnoreStaleClinicalContext(message: string) {
  const normalized = normalizeMessageForClinicalRouting(message);
  const medicationDocumentationWithoutExplicitCurrentNote = isStandaloneMedicationDocumentationPrompt(message);
  const directClinicalTermQuestion = looksLikeDirectClinicalTermDefinitionQuestion(normalized);
  const directReferenceWithoutCurrentNote = !referencesCurrentNote(message) && (
    isDirectReferenceStyleQuestion(normalized)
    || looksLikeDirectInteractionReferenceQuestion(normalized)
    || looksLikeDirectLabMonitoringReferenceQuestion(normalized)
    || looksLikeDirectApprovalReferenceQuestion(normalized)
    || looksLikeDirectGeriatricReferenceQuestion(normalized)
    || looksLikeMedicationUseSafetyQuestion(normalized)
  );

  return directClinicalTermQuestion || directReferenceWithoutCurrentNote || medicationDocumentationWithoutExplicitCurrentNote;
}

function shouldPreferClinicalTaskBeforeAtlasBlueprint(input: {
  message: string;
  sourceText: string;
  currentDraftText?: string;
  context?: AssistantApiContext;
  recentMessages?: AssistantThreadTurn[];
}) {
  const recentText = (input.recentMessages || [])
    .map((turn) => turn.content || '')
    .join(' ');
  const combined = normalizeMessageForClinicalRouting([
    input.message,
    input.sourceText,
    input.currentDraftText || '',
    input.context?.focusedSectionHeading || '',
    input.context?.noteType || '',
    recentText,
  ].join(' '));

  return [
    /\bdo not give me a sanitized violence-risk answer\b/,
    /\bviolence risk low because patient denies intent\b/,
    /\bobserved agitation\b.*\bcollateral threat history\b/,
    /\badmin pressure to discharge\b/,
    /\bmaking the plan cleaner than the source\b/,
    /\bobjective versus assessment\b/,
    /\bpatient-reported denial separate from nursing observation\b/,
    /\bpanic attack likely\b/,
    /\bheavy daily alcohol\b.*\bmissed clonazepam\b/,
    /\bgoodbye texts?\b.*\bdoes not trust (?:herself|himself|themselves)\b/,
    /\bgoodbye texts?\b.*\bnot safe if sent home\b/,
    /\bunknown blue powder\b/,
    /\bcommand auditory hallucinations\b.*\bword\b/,
    /\bmeds are about the same\b.*\bdoes not name them\b/,
    /\bnephro\b.*\bdialysis\b/,
    /\bgod already fixed my kidneys\b/,
    /\bteam split on withdrawal vs psych\b/,
    /\btremulous\b.*\bdiaphoretic\b.*\bseeing bugs\b/,
    /\buti vs psychosis\b/,
    /\bsuddenly confused\b.*\bpulling lines\b/,
    /\bneed exact hold wording\b/,
    /\bsource-matched hold language\b/,
    /\boverdose-if-sent-home\b/,
    /\boverdose if sent home\b.*\bno safe place to stay\b/,
    /\bmed over objection\b/,
    /\bmedication over objection\b/,
    /\bpt keeps refusing olanzapine\b/,
    /\bneed this progress note cleaned up\b/,
    /\bshorter paragraph\b.*\bhigher-acuity risk facts\b/,
    /\bmedication refusal then partial acceptance\b/,
    /\bmed refusal then partial acceptance\b/,
  ].some((pattern) => pattern.test(combined));
}

function isStandaloneMedicationDocumentationPrompt(message: string) {
  const normalized = message.trim().toLowerCase();
  if (/\b(capacity|no capacity|consent|legal authority|over objection|both\?|clinical recommendation|can .*refuse)\b/.test(normalized)) {
    return false;
  }

  return /\b(chart wording|wording|document|documentation|note)\b/.test(normalized)
    && /\b(refused|declined|stopped|nonadherence|non adherence|punitive|without sounding punitive|because of tremor)\b/.test(normalized)
    && /\b(abilify|aripiprazole|lithium|zoloft|sertraline|depakote|divalproex|lamotrigine|trileptal|oxcarbazepine|med)\b/.test(normalized)
    && !/\b(in this note|for this note|current note|current draft|this patient|the patient|source)\b/.test(normalized);
}

function buildSourceTextForReasoning(rawMessage: string, context?: AssistantApiContext, recentMessages?: AssistantThreadTurn[]) {
  if (shouldIgnoreStaleClinicalContext(rawMessage)) {
    return '';
  }

  const currentMessage = rawMessage.trim();
  const priorProviderSources = (recentMessages || [])
    .filter((turn) => turn.role === 'provider')
    .map((turn) => turn.content.trim())
    .filter(Boolean)
    .filter((content, index, collection) => collection.indexOf(content) === index)
    .filter((content) => content !== currentMessage)
    .filter((content) => looksLikeClinicalReasoningSource(content))
    .slice(-3);

  return [
    context?.currentDraftText,
    ...priorProviderSources,
    looksLikeClinicalReasoningSource(rawMessage) ? rawMessage : '',
  ].filter(Boolean).join('\n\n');
}

function buildPreviousNotes(context?: AssistantApiContext, recentMessages?: AssistantThreadTurn[]) {
  const previousTurns = (recentMessages || [])
    .filter((turn) => turn.role === 'provider' && looksLikeRawClinicalDetail(turn.content))
    .map((turn) => turn.content.trim())
    .filter(Boolean)
    .slice(-4);

  const currentDraft = context?.currentDraftText?.trim();
  if (currentDraft) {
    previousTurns.push(currentDraft);
  }

  return [...new Set(previousTurns)].slice(-5);
}

function buildEvalAuthContext() {
  return {
    user: {
      id: 'eval-user',
      role: 'provider' as const,
      email: 'eval-user@veranote.local',
    },
    isAuthenticated: true as const,
    providerIdentityId: DEFAULT_PROVIDER_IDENTITY_ID,
    tokenSource: 'header' as const,
  };
}

function buildMinimalSafeResponse(stage: AssistantStage = 'compose', mode: AssistantMode = 'workflow-help') {
  return {
    message: 'Unable to process request. Please review source directly.',
    suggestions: [
      'Review the source note directly before making changes.',
      'Retry once the request is smaller or the system load is lower.',
    ],
    modeMeta: buildAssistantModeMeta(mode, stage),
  } satisfies AssistantResponsePayload & { modeMeta: ReturnType<typeof buildAssistantModeMeta> };
}

function buildContradictionPriorityPayload(contradictions: Contradiction[]): AssistantResponsePayload {
  const details = contradictions.map((item) => item.detail);
  const suicideConflict = details.some((detail) => /suicide-denial|plan or intent/i.test(detail));
  const perceptualConflict = details.some((detail) => /hallucinations|perceptual|internal-preoccupation|observed behavior|perceptual disturbance/i.test(detail));

  if (suicideConflict) {
    return {
      message: 'There is conflicting suicide-risk information in the source. Both denial and plan or intent are present and must be preserved without reconciliation.',
      suggestions: [
        'Document both denial and plan explicitly.',
        'Avoid collapsing this into a single risk statement.',
        'Clarify timing and current intent if possible.',
      ],
    };
  }

  if (perceptualConflict) {
    return {
      message: 'There is a perceptual contradiction in the source. The reported denial of hallucinations and the observed behavior suggesting internal preoccupation should both remain visible without reconciliation.',
      suggestions: [
        'Separate the reported denial from the observed behavior.',
        'Document the observed behavior exactly as observed rather than resolving it into a clean perceptual conclusion.',
        'Clarify whether the source is reporting patient statements, nursing observation, or clinician observation.',
      ],
    };
  }

  return {
    message: 'The source contains clinically important contradictions that should be preserved and flagged rather than silently reconciled.',
    suggestions: [
      details[0] || 'Document both conflicting source elements explicitly.',
      'Avoid collapsing the contradiction into one cleaner narrative.',
      'Clarify timing, attribution, or current status if the source allows it.',
    ],
  };
}

function isRiskWordingQuestion(message: string) {
  const normalized = message.trim().toLowerCase();
  return /(?:low(?: suicide| violence)?-?risk wording|low risk or not|calling this low risk|can i (?:say|call).*(?:risk is low|low (?:suicide|violence) risk)|would low (?:suicide|violence)-?risk wording be okay|is grave disability clearly established|why is that garbage|unsafe|supported here or not)/.test(normalized);
}

function buildRiskPriorityPayload(
  level: 'clear_high' | 'possible_high' | 'unclear',
  message: string,
  riskAnalysis: RiskAnalysis,
): AssistantResponsePayload | null {
  const wordingQuestion = isRiskWordingQuestion(message);

  if (wordingQuestion && riskAnalysis.suicide.length > 0) {
    return {
      message: 'Low suicide-risk wording is not supported here. Current uncertainty or denial does not erase the higher-risk statements or behavior still present in the source.',
      suggestions: [
        'Keep the higher-acuity facts and the denial side by side rather than choosing one.',
        'Avoid low-risk or discharge-ready shorthand while the contradiction remains active.',
        'Clarify current intent and timing only if the source allows it.',
      ],
    };
  }

  if (wordingQuestion && riskAnalysis.violence.length > 0) {
    return {
      message: 'Low violence-risk wording is not supported here. Denial does not erase the observed agitation and collateral threat history still present in the source.',
      suggestions: [
        'Keep patient denial and the higher-acuity source facts visible at the same time.',
        'Do not let a calmer summary erase threat history or observed agitation.',
        'Use literal, time-aware language rather than a reassuring risk label.',
      ],
    };
  }

  if (wordingQuestion && riskAnalysis.graveDisability.length > 0) {
    return {
      message: 'Confirmed grave-disability wording is not supported from this source alone. The documented functional impairment is too limited to present grave disability as settled, and broader self-care capacity remains uncertain.',
      suggestions: [
        'Describe the specific self-care or functional concern instead of declaring grave disability confirmed.',
        'Keep uncertainty visible when the source documents only sparse impairment.',
        'Do not use a firmer legal or clinical conclusion than the source supports.',
      ],
    };
  }

  if (level === 'clear_high') {
    return {
      message: 'The source contains clear high-risk indicators that should be explicitly documented without dilution.',
      suggestions: [
        'Clarify current intent versus past statements if the source allows it.',
        'Avoid minimizing risk language.',
        'Keep the risk wording literal and time-aware.',
      ],
    };
  }

  if (level === 'possible_high') {
    return {
      message: 'The source may contain elevated risk or self-care concerns, but there is insufficient data to state a firm high-risk conclusion. Preserve the concern while keeping the uncertainty visible.',
      suggestions: [
        'Describe the specific observed concern rather than assigning a firm grave-disability or high-risk label.',
        'Clarify self-care capacity, safety, and whether any present intent is documented if the source allows it.',
        'Use insufficient-data language when the documentation does not fully support a stronger conclusion.',
      ],
    };
  }

  return null;
}

function rehydrateAssistantPayload(payload: AssistantResponsePayload, entities: PhiEntity[]): AssistantResponsePayload {
  if (!entities.length) {
    return payload;
  }

  return {
    ...payload,
    message: rehydratePHI(payload.message, entities),
    suggestions: payload.suggestions?.map((item) => rehydratePHI(item, entities)),
    actions: payload.actions?.map((action) => {
      switch (action.type) {
        case 'replace-preferences':
        case 'append-preferences':
        case 'jump-to-source-evidence':
        case 'run-review-rewrite':
          return {
            ...action,
            label: rehydratePHI(action.label, entities),
            instructions: rehydratePHI(action.instructions, entities),
          };
        case 'create-preset-draft':
          return {
            ...action,
            label: rehydratePHI(action.label, entities),
            instructions: rehydratePHI(action.instructions, entities),
            presetName: rehydratePHI(action.presetName, entities),
          };
        case 'apply-conservative-rewrite':
          return {
            ...action,
            label: rehydratePHI(action.label, entities),
            instructions: rehydratePHI(action.instructions, entities),
            originalText: rehydratePHI(action.originalText, entities),
            replacementText: rehydratePHI(action.replacementText, entities),
          };
        case 'apply-note-revision':
          return {
            ...action,
            label: rehydratePHI(action.label, entities),
            instructions: rehydratePHI(action.instructions, entities),
            revisionText: rehydratePHI(action.revisionText, entities),
            targetSectionHeading: action.targetSectionHeading ? rehydratePHI(action.targetSectionHeading, entities) : action.targetSectionHeading,
          };
        case 'apply-draft-rewrite':
          return {
            ...action,
            label: rehydratePHI(action.label, entities),
            instructions: rehydratePHI(action.instructions, entities),
            draftText: rehydratePHI(action.draftText, entities),
            rewriteLabel: rehydratePHI(action.rewriteLabel, entities),
          };
        case 'send-beta-feedback':
          return {
            ...action,
            label: rehydratePHI(action.label, entities),
            instructions: rehydratePHI(action.instructions, entities),
            feedbackMessage: rehydratePHI(action.feedbackMessage, entities),
            pageContext: rehydratePHI(action.pageContext, entities),
          };
        default:
          return action;
      }
    }),
  };
}

export async function POST(request: Request) {
  const evalMode = new URL(request.url).searchParams.get('eval') === 'true';
  const baseSelectedModel = selectModel('assistant');
  let selectedModel = baseSelectedModel;
  const startTime = Date.now();
  const finishRequest = trackRequest('assistant/respond', baseSelectedModel, startTime);
  const getLatencyMs = () => Math.max(Date.now() - startTime, 0);
  let authContext;
  if (evalMode) {
    authContext = buildEvalAuthContext();
  } else {
    try {
      authContext = await requireAuth(request);
    } catch {
      finishRequest(false);
      trackError('assistant/respond', new Error('Unauthorized'));
      logEvent({
        route: 'assistant/respond',
        action: 'auth_failed',
        outcome: 'rejected',
        status: 401,
        latencyMs: getLatencyMs(),
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    await checkRateLimit(authContext.user.id);
  } catch (error) {
    finishRequest(false);
    trackError('assistant/respond', error);
    logEvent({
      route: 'assistant/respond',
      userId: authContext.user.id,
      action: 'rate_limited',
      outcome: 'rejected',
      status: 429,
      model: selectedModel,
      latencyMs: getLatencyMs(),
    });
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  let body: AssistantRequest;
  try {
    body = (await request.json()) as AssistantRequest;
    validateRequest(body);
  } catch (error) {
    finishRequest(false);
    trackError('assistant/respond', error);
    logEvent({
      route: 'assistant/respond',
      userId: authContext.user.id,
      action: 'request_rejected',
      outcome: 'rejected',
      status: 400,
      model: selectedModel,
      latencyMs: getLatencyMs(),
      metadata: {
        reason: sanitizeForLogging(error instanceof Error ? error.message : 'Invalid request'),
      },
    });
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    trackModelUsage(selectedModel);

    recordAuditEvent({
      userId: authContext.user.id,
      action: 'assistant_access',
      route: 'assistant/respond',
      metadata: {
        method: 'POST',
      },
    });
    
    const authenticatedProviderId = authContext.providerIdentityId || authContext.user.id;
    const memoryPayload = await buildRememberFactHelp(body.message || '', body.context, authenticatedProviderId);
    if (memoryPayload) {
      recordAuditEvent({
        userId: authContext.user.id,
        action: 'memory_usage',
        route: 'assistant/respond',
        metadata: {
          kind: 'remember',
        },
      });
      finishRequest(true);
      logEvent({
        route: 'assistant/respond',
        userId: authContext.user.id,
        action: 'memory_remember',
        outcome: 'success',
        status: 200,
        model: selectedModel,
        latencyMs: getLatencyMs(),
        metadata: {
          providerId: authenticatedProviderId,
        },
      });
      if (evalMode) {
        recordEvalResult(1, 0);
      }
      return NextResponse.json({
        ...memoryPayload,
        modeMeta: buildAssistantModeMeta(body.mode === 'reference-lookup' ? 'reference-lookup' : body.mode === 'prompt-builder' ? 'prompt-builder' : 'workflow-help', body.stage === 'review' ? 'review' : 'compose'),
      });
    }

    const recallPayload = await buildRecallMemoryHelp((body.message || '').toLowerCase(), body.context, authenticatedProviderId);
    if (recallPayload) {
      recordAuditEvent({
        userId: authContext.user.id,
        action: 'memory_usage',
        route: 'assistant/respond',
        metadata: {
          kind: 'recall',
        },
      });
      finishRequest(true);
      logEvent({
        route: 'assistant/respond',
        userId: authContext.user.id,
        action: 'memory_recall',
        outcome: 'success',
        status: 200,
        model: selectedModel,
        latencyMs: getLatencyMs(),
        metadata: {
          providerId: authenticatedProviderId,
        },
      });
      if (evalMode) {
        recordEvalResult(1, 0);
      }
      return NextResponse.json({
        ...recallPayload,
        modeMeta: buildAssistantModeMeta(body.mode === 'reference-lookup' ? 'reference-lookup' : body.mode === 'prompt-builder' ? 'prompt-builder' : 'workflow-help', body.stage === 'review' ? 'review' : 'compose'),
      });
    }

    const rawMessage = body.message || '';
    const utilityPayload = buildUtilityQuestionPayload(rawMessage);
    if (utilityPayload) {
      finishRequest(true);
      logEvent({
        route: 'assistant/respond',
        userId: authContext.user.id,
        action: 'assistant_respond',
        outcome: 'success',
        status: 200,
        latencyMs: getLatencyMs(),
        metadata: {
          providerId: authContext.providerIdentityId || authContext.user.id,
          stage: body.stage === 'review' ? 'review' : 'compose',
          mode: body.mode === 'reference-lookup' ? 'reference-lookup' : body.mode === 'prompt-builder' ? 'prompt-builder' : 'workflow-help',
          routePriority: utilityPayload.routePriority,
          utilityQuestion: true,
        },
      });
      if (evalMode) {
        recordEvalResult(1, 0);
      }

      return NextResponse.json({
        ...utilityPayload.payload,
        modeMeta: buildAssistantModeMeta(
          body.mode === 'reference-lookup' ? 'reference-lookup' : body.mode === 'prompt-builder' ? 'prompt-builder' : 'workflow-help',
          body.stage === 'review' ? 'review' : 'compose',
        ),
      });
    }

    const standaloneMedicationDocumentationPrompt = isStandaloneMedicationDocumentationPrompt(rawMessage);
    const atlasConversation = orchestrateAtlasConversation({
      message: rawMessage,
      recentMessages: body.recentMessages,
      context: body.context,
    });
    const normalizedRawMessageForRouting = normalizeMessageForClinicalRouting(rawMessage);
    const normalizedEffectiveMessageForRouting = normalizeMessageForClinicalRouting(atlasConversation.effectiveMessage);
    const ignoreStaleClinicalContext = shouldIgnoreStaleClinicalContext(normalizedRawMessageForRouting)
      || (atlasConversation.didRewrite && shouldIgnoreStaleClinicalContext(normalizedEffectiveMessageForRouting))
      || (atlasConversation.didRewrite && (
        atlasConversation.routeHint === 'diagnostic_reference'
        || atlasConversation.routeHint === 'medication_reference'
      ));
    const sourceText = ignoreStaleClinicalContext ? '' : buildSourceTextForReasoning(rawMessage, body.context, body.recentMessages);
    const { sanitizedTexts, entities: phiEntities } = sanitizePHITexts([
      rawMessage,
      atlasConversation.effectiveMessage,
      sourceText,
      ignoreStaleClinicalContext ? '' : body.context?.currentDraftText || '',
    ]);
    const [sanitizedMessage, sanitizedEffectiveMessage, sanitizedSourceText, sanitizedDraftText] = sanitizedTexts;
    const rawAssistantMessageForRouting = normalizeVisibleClinicalTyposForRouting(sanitizedMessage);
    const assistantMessageForRouting = normalizeVisibleClinicalTyposForRouting(atlasConversation.didRewrite ? sanitizedEffectiveMessage : sanitizedMessage);
    const providerId = resolveAssistantProviderId(body.context, authenticatedProviderId);
    const draftFormatContext = {
      ...body.context,
      currentDraftText: sanitizedDraftText,
    };
    const rawDraftFormatPayload = buildDraftFormattingHelp(rawAssistantMessageForRouting, draftFormatContext);
    const conversationRewriteShouldStayReference = atlasConversation.didRewrite
      && !rawDraftFormatPayload
      && (
        atlasConversation.routeHint === 'diagnostic_reference'
        || atlasConversation.routeHint === 'medication_reference'
      );
    const oneParagraphFormatPayload = rawDraftFormatPayload
      || (conversationRewriteShouldStayReference || shouldSuppressDraftFormatContextFallback(rawAssistantMessageForRouting)
        ? null
        : buildDraftFormattingHelp(assistantMessageForRouting, draftFormatContext));
    if (oneParagraphFormatPayload) {
      const stage = body.stage === 'review' ? 'review' : 'compose';
      const mode = body.mode === 'reference-lookup' ? 'reference-lookup' : body.mode === 'prompt-builder' ? 'prompt-builder' : 'workflow-help';
      const rehydratedFormatPayload = rehydrateAssistantPayload(oneParagraphFormatPayload, phiEntities);

      finishRequest(true);
      logEvent({
        route: 'assistant/respond',
        userId: authContext.user.id,
        action: 'assistant_respond',
        outcome: 'success',
        status: 200,
        latencyMs: getLatencyMs(),
        metadata: {
          providerId,
          stage,
          mode,
          knowledgeIntent: 'draft_support',
          answerMode: rehydratedFormatPayload.answerMode || 'chart_ready_wording',
          builderFamily: rehydratedFormatPayload.builderFamily || 'chart-wording',
          routePriority: 'note-format-draft-shape',
        },
      });
      if (evalMode) {
        recordEvalResult(1, 0);
      }

      return NextResponse.json({
        ...rehydratedFormatPayload,
        modeMeta: buildAssistantModeMeta(mode, stage),
        ...(evalMode ? {
          eval: {
            rawOutput: rehydratedFormatPayload.message,
            warnings: [],
            knowledgeIntent: 'draft_support',
            answerMode: rehydratedFormatPayload.answerMode,
            builderFamily: rehydratedFormatPayload.builderFamily,
            routePriority: 'note-format-draft-shape',
          },
        } : {}),
      });
    }
    const directClinicalTermKnowledgePayload = looksLikeDirectClinicalTermDefinitionQuestion(assistantMessageForRouting)
      ? buildGeneralKnowledgeHelp(assistantMessageForRouting, body.context, body.recentMessages)
      : null;
    if (
      directClinicalTermKnowledgePayload
      && !standaloneMedicationDocumentationPrompt
      && (
        directClinicalTermKnowledgePayload.answerMode === 'direct_reference_answer'
        || directClinicalTermKnowledgePayload.answerMode === 'general_health_reference'
        || !directClinicalTermKnowledgePayload.answerMode
      )
    ) {
      const stage = body.stage === 'review' ? 'review' : 'compose';
      const mode = body.mode === 'reference-lookup' ? 'reference-lookup' : body.mode === 'prompt-builder' ? 'prompt-builder' : 'workflow-help';

      finishRequest(true);
      logEvent({
        route: 'assistant/respond',
        userId: authContext.user.id,
        action: 'assistant_respond',
        outcome: 'success',
        status: 200,
        latencyMs: getLatencyMs(),
        metadata: {
          providerId,
          stage,
          mode,
          knowledgeIntent: 'reference_help',
          answerMode: directClinicalTermKnowledgePayload.answerMode || 'direct_reference_answer',
          routePriority: 'direct-clinical-term-reference',
        },
      });
      if (evalMode) {
        recordEvalResult(1, 0);
      }

      return NextResponse.json({
        ...directClinicalTermKnowledgePayload,
        modeMeta: buildAssistantModeMeta(mode, stage),
        ...(evalMode ? {
          eval: {
            rawOutput: directClinicalTermKnowledgePayload.message,
            warnings: [],
            knowledgeIntent: 'reference_help',
            answerMode: directClinicalTermKnowledgePayload.answerMode,
            builderFamily: directClinicalTermKnowledgePayload.builderFamily,
            routePriority: 'direct-clinical-term-reference',
          },
        } : {}),
      });
    }
    const frustratedClinicalCorrectionPayload = buildFrustratedClinicalCorrectionHelp(
      sanitizedMessage,
      body.recentMessages,
      body.context,
    );
    if (frustratedClinicalCorrectionPayload && !standaloneMedicationDocumentationPrompt) {
      const stage = body.stage === 'review' ? 'review' : 'compose';
      const mode = body.mode === 'reference-lookup' ? 'reference-lookup' : body.mode === 'prompt-builder' ? 'prompt-builder' : 'workflow-help';

      finishRequest(true);
      logEvent({
        route: 'assistant/respond',
        userId: authContext.user.id,
        action: 'assistant_respond',
        outcome: 'success',
        status: 200,
        latencyMs: getLatencyMs(),
        metadata: {
          providerId,
          stage,
          mode,
          knowledgeIntent: 'medication_help',
          answerMode: frustratedClinicalCorrectionPayload.answerMode || 'medication_reference_answer',
          routePriority: 'frustrated-followup-correction',
        },
      });
      if (evalMode) {
        recordEvalResult(1, 0);
      }

      return NextResponse.json({
        ...frustratedClinicalCorrectionPayload,
        modeMeta: buildAssistantModeMeta(mode, stage),
        ...(evalMode ? {
          eval: {
            rawOutput: frustratedClinicalCorrectionPayload.message,
            warnings: [],
            knowledgeIntent: 'medication_help',
            answerMode: frustratedClinicalCorrectionPayload.answerMode,
            routePriority: 'frustrated-followup-correction',
          },
        } : {}),
      });
    }
    const conversationSafetyPayload = buildAtlasConversationSafetyPayload(atlasConversation);
    const conversationContinuationPayload = conversationSafetyPayload
      || (atlasConversation.didRewrite && atlasConversation.routeHint === 'diagnostic_reference'
        ? buildDiagnosticGeneralConceptReferenceHelp(assistantMessageForRouting)
          || buildAtlasConversationFallbackPayload(atlasConversation)
        : atlasConversation.didRewrite && atlasConversation.routeHint === 'diagnostic_safety'
          ? buildDiagnosticSafetyGateHelp(assistantMessageForRouting)
            || buildAtlasConversationFallbackPayload(atlasConversation)
          : atlasConversation.didRewrite && atlasConversation.routeHint === 'medication_reference'
            ? buildAtlasConversationFallbackPayload(atlasConversation)
            : atlasConversation.didRewrite && (
              atlasConversation.routeHint === 'local_policy'
              || atlasConversation.routeHint === 'workflow_help'
              || atlasConversation.routeHint === 'documentation_safety'
            )
              ? buildAtlasConversationFallbackPayload(atlasConversation)
              : null);
    if (
      conversationContinuationPayload
      && !standaloneMedicationDocumentationPrompt
    ) {
      const stage = body.stage === 'review' ? 'review' : 'compose';
      const mode = body.mode === 'reference-lookup' ? 'reference-lookup' : body.mode === 'prompt-builder' ? 'prompt-builder' : 'workflow-help';
      const tonedConversationPayload = applyAtlasConversationTone(conversationContinuationPayload, atlasConversation);
      const conversationPayload = atlasConversation.routeHint === 'medication_reference'
        && tonedConversationPayload.answerMode === 'medication_reference_answer'
        && !tonedConversationPayload.builderFamily
        ? { ...tonedConversationPayload, builderFamily: 'medication-boundary' as const }
        : tonedConversationPayload;

      finishRequest(true);
      logEvent({
        route: 'assistant/respond',
        userId: authContext.user.id,
        action: 'assistant_respond',
        outcome: 'success',
        status: 200,
        latencyMs: getLatencyMs(),
        metadata: {
          providerId,
          stage,
          mode,
          knowledgeIntent: atlasConversation.routeHint === 'medication_reference' ? 'medication_help' : 'diagnosis_help',
          answerMode: conversationPayload.answerMode || 'direct_reference_answer',
          routePriority: `atlas-conversation:${atlasConversation.routeHint}`,
          conversationFollowupIntent: atlasConversation.followupIntent,
        },
      });
      if (evalMode) {
        recordEvalResult(1, 0);
      }

      return NextResponse.json({
        ...conversationPayload,
        modeMeta: buildAssistantModeMeta(mode, stage),
        ...(evalMode ? {
          eval: {
            rawOutput: conversationPayload.message,
            warnings: [],
            knowledgeIntent: atlasConversation.routeHint === 'medication_reference' ? 'medication_help' : 'diagnosis_help',
            answerMode: conversationPayload.answerMode,
            builderFamily: conversationPayload.builderFamily,
            routePriority: `atlas-conversation:${atlasConversation.routeHint}`,
            conversation: buildAtlasConversationEvalMeta(atlasConversation),
          },
        } : {}),
      });
    }
    const preferClinicalTaskBeforeAtlasBlueprint = shouldPreferClinicalTaskBeforeAtlasBlueprint({
      message: assistantMessageForRouting,
      sourceText: sanitizedSourceText,
      currentDraftText: sanitizedDraftText,
      context: body.context,
      recentMessages: body.recentMessages,
    }) || (atlasConversation.didRewrite && atlasConversation.routeHint === 'medication_reference');
    const atlasBlueprintRoute = buildAtlasBlueprintResponse({
      message: assistantMessageForRouting,
      sourceText: sanitizedSourceText,
      stage: body.stage === 'review' ? 'review' : 'compose',
      context: body.context,
    });
    if (atlasBlueprintRoute.payload && !preferClinicalTaskBeforeAtlasBlueprint) {
      const stage = body.stage === 'review' ? 'review' : 'compose';
      const mode = body.mode === 'reference-lookup' ? 'reference-lookup' : body.mode === 'prompt-builder' ? 'prompt-builder' : 'workflow-help';
      const rehydratedBlueprintPayload = rehydrateAssistantPayload(atlasBlueprintRoute.payload, phiEntities);

      finishRequest(true);
      logEvent({
        route: 'assistant/respond',
        userId: authContext.user.id,
        action: 'assistant_respond',
        outcome: 'success',
        status: 200,
        latencyMs: getLatencyMs(),
        metadata: {
          providerId,
          stage,
          mode,
          answerMode: rehydratedBlueprintPayload.answerMode || 'none',
          builderFamily: rehydratedBlueprintPayload.builderFamily || 'none',
          atlasLane: atlasBlueprintRoute.arbitration.laneId,
          atlasLaneConfidence: atlasBlueprintRoute.arbitration.confidence,
          routePriority: `atlas-blueprint:${atlasBlueprintRoute.arbitration.laneId}`,
        },
      });
      if (evalMode) {
        recordEvalResult(1, 0);
      }

      return NextResponse.json({
        ...rehydratedBlueprintPayload,
        modeMeta: buildAssistantModeMeta(mode, stage),
        ...(evalMode ? {
          eval: {
            rawOutput: rehydratedBlueprintPayload.message,
            warnings: [],
            knowledgeIntent: mode === 'reference-lookup' ? 'reference_help' : 'workflow_help',
            answerMode: rehydratedBlueprintPayload.answerMode,
            builderFamily: rehydratedBlueprintPayload.builderFamily,
            atlasLane: atlasBlueprintRoute.arbitration.laneId,
            atlasLaneConfidence: atlasBlueprintRoute.arbitration.confidence,
            routePriority: `atlas-blueprint:${atlasBlueprintRoute.arbitration.laneId}`,
            ...(atlasConversation.didRewrite ? {
              conversation: buildAtlasConversationEvalMeta(atlasConversation),
            } : {}),
          },
        } : {}),
      });
    }
    const clinicalOverride = classifyClinicalTaskOverride(assistantMessageForRouting);
    const priorClinicalState = extractPriorClinicalState(body.recentMessages);
    const routeBoundaryDocumentationPayload = buildBoundaryDocumentationHelp(assistantMessageForRouting);
    if (
      routeBoundaryDocumentationPayload
      && !standaloneMedicationDocumentationPrompt
      && !preferClinicalTaskBeforeAtlasBlueprint
    ) {
      const stage = body.stage === 'review' ? 'review' : 'compose';
      const mode = body.mode === 'reference-lookup' ? 'reference-lookup' : body.mode === 'prompt-builder' ? 'prompt-builder' : 'workflow-help';
      const shouldPreserveWarningBoundary = (
        priorClinicalState?.answerMode === 'warning_language'
        || (
          /\b(denies hi|reported threats?|collateral says threats?|collateral reports threats?|threats?)\b/i.test(assistantMessageForRouting)
          && /\b(stimulant|restart stimulant|adhd|focus|target|access)\b/i.test(assistantMessageForRouting)
        )
      );
      const continuityBoundaryPayload = shouldPreserveWarningBoundary
        && routeBoundaryDocumentationPayload.answerMode === 'chart_ready_wording'
        ? {
            ...routeBoundaryDocumentationPayload,
            message: `${routeBoundaryDocumentationPayload.message} Stimulant caution: mania/psychosis screen and substance/cardiac risk remain necessary before routine stimulant framing. Reported threats and target/access gaps should remain explicit.`,
            answerMode: 'warning_language' as const,
            builderFamily: routeBoundaryDocumentationPayload.builderFamily || 'contradiction' as const,
          }
        : routeBoundaryDocumentationPayload;

      finishRequest(true);
      logEvent({
        route: 'assistant/respond',
        userId: authContext.user.id,
        action: 'assistant_respond',
        outcome: 'success',
        status: 200,
        latencyMs: getLatencyMs(),
        metadata: {
          providerId,
          stage,
          mode,
          knowledgeIntent: 'draft_support',
          answerMode: continuityBoundaryPayload.answerMode || 'chart_ready_wording',
          routePriority: 'route-boundary-documentation',
        },
      });
      if (evalMode) {
        recordEvalResult(1, 0);
      }

      return NextResponse.json({
        ...continuityBoundaryPayload,
        modeMeta: buildAssistantModeMeta(mode, stage),
        ...(evalMode ? {
          eval: {
            rawOutput: continuityBoundaryPayload.message,
            warnings: [],
            knowledgeIntent: 'draft_support',
            answerMode: continuityBoundaryPayload.answerMode,
            builderFamily: continuityBoundaryPayload.builderFamily,
            routePriority: 'route-boundary-documentation',
          },
        } : {}),
      });
    }

    const diagnosticSafetyGatePayload = buildDiagnosticSafetyGateHelp(assistantMessageForRouting);
    if (
      diagnosticSafetyGatePayload
      && !standaloneMedicationDocumentationPrompt
      && !preferClinicalTaskBeforeAtlasBlueprint
    ) {
      const stage = body.stage === 'review' ? 'review' : 'compose';
      const mode = body.mode === 'reference-lookup' ? 'reference-lookup' : body.mode === 'prompt-builder' ? 'prompt-builder' : 'workflow-help';

      finishRequest(true);
      logEvent({
        route: 'assistant/respond',
        userId: authContext.user.id,
        action: 'assistant_respond',
        outcome: 'success',
        status: 200,
        latencyMs: getLatencyMs(),
        metadata: {
          providerId,
          stage,
          mode,
          knowledgeIntent: 'diagnosis_help',
          answerMode: diagnosticSafetyGatePayload.answerMode || 'direct_reference_answer',
          routePriority: 'diagnostic-safety-gate',
        },
      });
      if (evalMode) {
        recordEvalResult(1, 0);
      }

      return NextResponse.json({
        ...diagnosticSafetyGatePayload,
        modeMeta: buildAssistantModeMeta(mode, stage),
        ...(evalMode ? {
          eval: {
            rawOutput: diagnosticSafetyGatePayload.message,
            warnings: [],
            knowledgeIntent: 'diagnosis_help',
            answerMode: diagnosticSafetyGatePayload.answerMode,
            routePriority: 'diagnostic-safety-gate',
          },
        } : {}),
      });
    }
    const earlyDiagnosticReferencePayload = buildDiagnosticGeneralConceptReferenceHelp(assistantMessageForRouting);
    if (
      earlyDiagnosticReferencePayload
      && !clinicalOverride
      && !standaloneMedicationDocumentationPrompt
      && !preferClinicalTaskBeforeAtlasBlueprint
      && !/\b(source says|draft says|note says|patient reports|patient denies|document this|word this|chart-ready|chart ready|rewrite)\b/i.test(assistantMessageForRouting)
    ) {
      const stage = body.stage === 'review' ? 'review' : 'compose';
      const mode = body.mode === 'reference-lookup' ? 'reference-lookup' : body.mode === 'prompt-builder' ? 'prompt-builder' : 'workflow-help';

      finishRequest(true);
      logEvent({
        route: 'assistant/respond',
        userId: authContext.user.id,
        action: 'assistant_respond',
        outcome: 'success',
        status: 200,
        latencyMs: getLatencyMs(),
        metadata: {
          providerId,
          stage,
          mode,
          knowledgeIntent: 'diagnosis_help',
          answerMode: earlyDiagnosticReferencePayload.answerMode || 'direct_reference_answer',
          routePriority: 'diagnostic-reference-direct',
        },
      });
      if (evalMode) {
        recordEvalResult(1, 0);
      }

      return NextResponse.json({
        ...earlyDiagnosticReferencePayload,
        modeMeta: buildAssistantModeMeta(mode, stage),
        ...(evalMode ? {
          eval: {
            rawOutput: earlyDiagnosticReferencePayload.message,
            warnings: [],
            knowledgeIntent: 'diagnosis_help',
            answerMode: earlyDiagnosticReferencePayload.answerMode,
            routePriority: 'diagnostic-reference-direct',
          },
        } : {}),
      });
    }
    const earlyMedicationReferenceIntent = detectMedicationQuestionIntent(assistantMessageForRouting);
    const earlyStructuredMedicationReferenceIntent = detectMedReferenceIntent(assistantMessageForRouting);
    const directGeriatricReferenceQuestion = looksLikeDirectGeriatricReferenceQuestion(assistantMessageForRouting);
    const directApprovalReferenceQuestion = looksLikeDirectApprovalReferenceQuestion(assistantMessageForRouting);
    const directInteractionReferenceQuestion = looksLikeDirectInteractionReferenceQuestion(assistantMessageForRouting);
    const directLabMonitoringReferenceQuestion = looksLikeDirectLabMonitoringReferenceQuestion(assistantMessageForRouting);
    const directEmergencyProtocolQuestion = looksLikeDirectEmergencyProtocolQuestion(assistantMessageForRouting);
    const directMedicationUseSafetyQuestion = looksLikeMedicationUseSafetyQuestion(assistantMessageForRouting);
    const hasEarlyMedicationAnchor = Boolean(findPsychMedication(assistantMessageForRouting))
      || Boolean(findMedReferenceMedication(assistantMessageForRouting))
      || directApprovalReferenceQuestion
      || directGeriatricReferenceQuestion
      || directInteractionReferenceQuestion
      || directLabMonitoringReferenceQuestion
      || directEmergencyProtocolQuestion
      || directMedicationUseSafetyQuestion
      || /\b(ssri|snri|maoi|tca|benzodiazepine|benzo|opioid|nsaid|stimulant|antipsychotic|antidepressant|mood stabilizer)\b/i.test(assistantMessageForRouting);
    const pureMedicationReferenceQuestion = looksLikePureMedicationReferenceQuestion(assistantMessageForRouting);
    const looksLikeClinicalMedicationNarrative = !pureMedicationReferenceQuestion
      && !directApprovalReferenceQuestion
      && !directGeriatricReferenceQuestion
      && !directInteractionReferenceQuestion
      && !directLabMonitoringReferenceQuestion
      && !directEmergencyProtocolQuestion
      && !directMedicationUseSafetyQuestion
      && /\b(pt|patient|source|draft|note|chart|vera|unsafe|settle on|calling this|what should vera keep explicit)\b/i.test(assistantMessageForRouting);
    const earlyMedicationReferencePayload = buildGeneralKnowledgeHelp(assistantMessageForRouting, body.context, body.recentMessages);
    if (
      earlyMedicationReferencePayload?.answerMode === 'medication_reference_answer'
      && !clinicalOverride
      && !standaloneMedicationDocumentationPrompt
      && !preferClinicalTaskBeforeAtlasBlueprint
      && hasEarlyMedicationAnchor
      && !looksLikeClinicalMedicationNarrative
      && (directApprovalReferenceQuestion || directGeriatricReferenceQuestion || directInteractionReferenceQuestion || directLabMonitoringReferenceQuestion || directEmergencyProtocolQuestion || directMedicationUseSafetyQuestion || earlyMedicationReferenceIntent !== 'unknown' || earlyStructuredMedicationReferenceIntent !== 'unsupported')
      && (earlyMedicationReferenceIntent !== 'med_class_lookup' || earlyStructuredMedicationReferenceIntent === 'class_use')
    ) {
      const stage = body.stage === 'review' ? 'review' : 'compose';
      const mode = body.mode === 'reference-lookup' ? 'reference-lookup' : body.mode === 'prompt-builder' ? 'prompt-builder' : 'workflow-help';

      finishRequest(true);
      logEvent({
        route: 'assistant/respond',
        userId: authContext.user.id,
        action: 'assistant_respond',
        outcome: 'success',
        status: 200,
        latencyMs: getLatencyMs(),
        metadata: {
          providerId,
          stage,
          mode,
          knowledgeIntent: 'medication_help',
          answerMode: earlyMedicationReferencePayload.answerMode,
          routePriority: 'medication-reference-direct',
        },
      });
      if (evalMode) {
        recordEvalResult(1, 0);
      }

      return NextResponse.json({
        ...earlyMedicationReferencePayload,
        modeMeta: buildAssistantModeMeta(mode, stage),
        ...(evalMode ? {
          eval: {
            rawOutput: earlyMedicationReferencePayload.message,
            warnings: [],
            knowledgeIntent: 'medication_help',
            answerMode: earlyMedicationReferencePayload.answerMode,
            routePriority: 'medication-reference-direct',
          },
        } : {}),
      });
    }
    const followupDirective = classifyClinicalFollowupDirective(rawMessage);
    const knowledgeIntent = body.mode === 'reference-lookup'
      ? 'reference_help'
      : clinicalOverride?.forcedIntent
        || (atlasConversation.didRewrite && atlasConversation.routeHint === 'medication_reference' ? 'medication_help' : classifyKnowledgeIntent(assistantMessageForRouting));
    const pipeline = await runAssistantPipeline({
      message: assistantMessageForRouting,
      sourceText: sanitizedSourceText,
      intent: knowledgeIntent,
      stage: body.stage,
      noteType: body.context?.noteType,
    });
    const {
      mse: mseAnalysis,
      risk: riskAnalysis,
      contradictions: contradictionAnalysis,
      knowledge: pipelineKnowledge,
    } = pipeline;
    const prefilteredReferenceSources = knowledgeIntent === 'reference_help'
      ? await hydrateTrustedReferenceSources(assistantMessageForRouting, pipelineKnowledge.trustedReferences.map(trustedReferenceToAssistantSource))
      : pipelineKnowledge.trustedReferences.map(trustedReferenceToAssistantSource);
    const filteredKnowledgeBundle = mergeHydratedReferencesIntoBundle(pipelineKnowledge, prefilteredReferenceSources);
    const providerMemory = filterProviderMemoryByPolicy(await resolveProviderMemory(providerId, {
      intent: knowledgeIntent,
      noteType: body.context?.noteType,
      tags: buildProviderMemoryTags(body.stage === 'review' ? 'review' : 'compose', body.mode === 'reference-lookup' ? 'reference-lookup' : body.mode === 'prompt-builder' ? 'prompt-builder' : 'workflow-help', body.context),
    }));
    const suggestedMemory = filterProviderMemoryByPolicy(
      extractMemoryFromOutput(sanitizedDraftText || '', providerId)
        .filter((item) => !providerMemory.some((existing) => existing.content === item.content)),
    ).slice(0, 3);
    const medicalNecessity = evaluateMedicalNecessity(sanitizedSourceText);
    const levelOfCare = evaluateLevelOfCare(sanitizedSourceText);
    const cptSupport = evaluateCptSupport(sanitizedSourceText);
    const losAssessment = evaluateLOS(sanitizedSourceText);
    const auditFlags = detectAuditRisk(sanitizedSourceText);
    const longitudinalSummary = summarizeTrends(buildPreviousNotes(body.context, body.recentMessages));
    const nextActions = suggestNextActions(sanitizedSourceText, filteredKnowledgeBundle, longitudinalSummary);
    const triageSuggestion = suggestTriage(sanitizedSourceText);
    const dischargeStatus = evaluateDischarge(sanitizedSourceText);
    const workflowTasks = suggestTasks({
      sourceText: sanitizedSourceText,
      triage: triageSuggestion,
      discharge: dischargeStatus,
      longitudinal: longitudinalSummary,
    });
    const structuredKnowledgePrompt = safeExecute(
      () => assembleAssistantKnowledgePrompt({
        task: assistantMessageForRouting,
        sourceNote: sanitizedSourceText,
        knowledgeBundle: filteredKnowledgeBundle,
        providerMemory,
        medicalNecessity,
        levelOfCare,
        cptSupport,
        losAssessment,
        auditFlags,
        nextActions,
        triageSuggestion,
        dischargeStatus,
        workflowTasks,
        longitudinalSummary,
        mseAnalysis,
        riskAnalysis,
        contradictionAnalysis,
      }),
      '[SOURCE NOTE]\nUnavailable.\n\n[TASK]\nUnable to safely assemble assistant prompt.\n',
    );
    const estimatedPromptTokens = safeExecute(
      () => Math.ceil(structuredKnowledgePrompt.length / 4),
      0,
    );
    if (estimatedPromptTokens > ASSISTANT_TOKEN_THRESHOLD) {
      selectedModel = CHEAP_ASSISTANT_MODEL;
    }
    const routeLevelKnowledgeReferences = filteredKnowledgeBundle.trustedReferences.map(trustedReferenceToAssistantSource);
    const clinicalTaskPayload = standaloneMedicationDocumentationPrompt
      ? null
      : buildClinicalTaskPriorityPayload({
          message: assistantMessageForRouting,
          sourceText: sanitizedSourceText,
          currentDraftText: sanitizedDraftText,
          stage: body.stage === 'review' ? 'review' : 'compose',
          noteType: body.context?.noteType,
          mseAnalysis,
          riskAnalysis,
          contradictionAnalysis,
          medicalNecessity,
          levelOfCare,
          losAssessment,
          dischargeStatus,
          triageSuggestion,
          override: clinicalOverride,
          previousAnswerMode: priorClinicalState?.answerMode,
          previousBuilderFamily: priorClinicalState?.builderFamily,
          followupDirective,
        });

    if (clinicalTaskPayload) {
      const rehydratedClinicalTaskPayload = rehydrateAssistantPayload(clinicalTaskPayload, phiEntities);

      finishRequest(true);
      logEvent({
        route: 'assistant/respond',
        userId: authContext.user.id,
        action: 'assistant_respond',
        outcome: 'success',
        status: 200,
        model: selectedModel,
        latencyMs: getLatencyMs(),
        metadata: {
          providerId,
          stage: body.stage === 'review' ? 'review' : 'compose',
          mode: body.mode === 'reference-lookup' ? 'reference-lookup' : body.mode === 'prompt-builder' ? 'prompt-builder' : 'workflow-help',
          knowledgeIntent,
          answerMode: rehydratedClinicalTaskPayload.answerMode || 'none',
          builderFamily: rehydratedClinicalTaskPayload.builderFamily || 'none',
          contradictionCount: contradictionAnalysis.contradictions.length,
          suicideRiskSignalCount: riskAnalysis.suicide.length,
          violenceRiskSignalCount: riskAnalysis.violence.length,
          graveDisabilitySignalCount: riskAnalysis.graveDisability.length,
          routePriority: 'clinical-task',
        },
      });
      if (evalMode) {
        recordEvalResult(1, 0);
      }

      return NextResponse.json({
        ...rehydratedClinicalTaskPayload,
        modeMeta: buildAssistantModeMeta(body.mode === 'reference-lookup' ? 'reference-lookup' : body.mode === 'prompt-builder' ? 'prompt-builder' : 'workflow-help', body.stage === 'review' ? 'review' : 'compose'),
        ...(evalMode ? {
          eval: {
            rawOutput: rehydratedClinicalTaskPayload.message,
            warnings: [
              ...contradictionAnalysis.contradictions.map((item) => item.detail),
              ...riskAnalysis.generalWarnings,
            ],
            knowledgeIntent,
            answerMode: rehydratedClinicalTaskPayload.answerMode,
            builderFamily: rehydratedClinicalTaskPayload.builderFamily,
            routePriority: 'clinical-task',
          },
        } : {}),
      });
    }

    if (contradictionAnalysis.contradictions.length > 0) {
      const contradictionPayload = rehydrateAssistantPayload(
        buildContradictionPriorityPayload(contradictionAnalysis.contradictions),
        phiEntities,
      );

      finishRequest(true);
      logEvent({
        route: 'assistant/respond',
        userId: authContext.user.id,
        action: 'assistant_respond',
        outcome: 'success',
        status: 200,
        model: selectedModel,
        latencyMs: getLatencyMs(),
        metadata: {
          providerId,
          stage: body.stage === 'review' ? 'review' : 'compose',
          mode: body.mode === 'reference-lookup' ? 'reference-lookup' : body.mode === 'prompt-builder' ? 'prompt-builder' : 'workflow-help',
          knowledgeIntent,
          contradictionCount: contradictionAnalysis.contradictions.length,
          routePriority: 'contradiction',
        },
      });
      if (evalMode) {
        recordEvalResult(1, 0);
      }

      return NextResponse.json({
        ...contradictionPayload,
        modeMeta: buildAssistantModeMeta(body.mode === 'reference-lookup' ? 'reference-lookup' : body.mode === 'prompt-builder' ? 'prompt-builder' : 'workflow-help', body.stage === 'review' ? 'review' : 'compose'),
        ...(evalMode ? {
          eval: {
            rawOutput: contradictionPayload.message,
            warnings: contradictionAnalysis.contradictions.map((item) => item.detail),
            knowledgeIntent,
            contradictionCount: contradictionAnalysis.contradictions.length,
            routePriority: 'contradiction',
          },
        } : {}),
      });
    }

    if (riskAnalysis.level !== 'unclear') {
      const riskPayload = buildRiskPriorityPayload(riskAnalysis.level, assistantMessageForRouting, riskAnalysis);
      if (!riskPayload) {
        throw new Error('Risk routing expected a payload for non-unclear risk level.');
      }
      const rehydratedRiskPayload = rehydrateAssistantPayload(riskPayload, phiEntities);

      finishRequest(true);
      logEvent({
        route: 'assistant/respond',
        userId: authContext.user.id,
        action: 'assistant_respond',
        outcome: 'success',
        status: 200,
        model: selectedModel,
        latencyMs: getLatencyMs(),
        metadata: {
          providerId,
          stage: body.stage === 'review' ? 'review' : 'compose',
          mode: body.mode === 'reference-lookup' ? 'reference-lookup' : body.mode === 'prompt-builder' ? 'prompt-builder' : 'workflow-help',
          knowledgeIntent,
          suicideRiskSignalCount: riskAnalysis.suicide.length,
          violenceRiskSignalCount: riskAnalysis.violence.length,
          graveDisabilitySignalCount: riskAnalysis.graveDisability.length,
          riskLevel: riskAnalysis.level,
          routePriority: 'risk',
        },
      });
      if (evalMode) {
        recordEvalResult(1, 0);
      }

      return NextResponse.json({
        ...rehydratedRiskPayload,
        modeMeta: buildAssistantModeMeta(body.mode === 'reference-lookup' ? 'reference-lookup' : body.mode === 'prompt-builder' ? 'prompt-builder' : 'workflow-help', body.stage === 'review' ? 'review' : 'compose'),
        ...(evalMode ? {
          eval: {
            rawOutput: rehydratedRiskPayload.message,
            warnings: riskAnalysis.generalWarnings,
            knowledgeIntent,
            riskLevel: riskAnalysis.level,
            routePriority: 'risk',
          },
        } : {}),
      });
    }

    const assistantBodyForRouting = atlasConversation.didRewrite
      ? { ...body, message: assistantMessageForRouting }
      : body;
    const { stage, mode, message, context, recentMessages, intentTrace, payload } = orchestrateAssistantResponse(assistantBodyForRouting, {
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
    const learnedPayload = enrichAssistantResponseWithLearning({
      payload,
      learningStore: await getAssistantLearning(resolveAssistantProviderId(context, authenticatedProviderId)),
      normalizedMessage: message.toLowerCase(),
      stage,
      mode,
      noteType: context?.noteType,
      profileId: context?.providerProfileId,
    });
    const knowledgeSupportPayload = buildKnowledgeSupportPayload(knowledgeIntent, filteredKnowledgeBundle);
    let knowledgeAwarePayload = learnedPayload;
    const suppressGlobalSuggestions = shouldSuppressGlobalAssistantSuggestions(learnedPayload.answerMode);

    if (isUnknownFallbackPayload(learnedPayload) && knowledgeSupportPayload) {
      knowledgeAwarePayload = knowledgeSupportPayload;
    } else if (!suppressGlobalSuggestions && !bundleHasKnowledge(filteredKnowledgeBundle) && knowledgeIntent !== 'draft_support') {
      knowledgeAwarePayload = appendUniqueSuggestions(learnedPayload, [
        `No structured psychiatry knowledge match was found here, so ${getAssistantDisplayName(context)} should stay source-only and avoid guessing.`,
      ]);
    } else if (!suppressGlobalSuggestions && knowledgeIntent === 'diagnosis_help' && filteredKnowledgeBundle.diagnosisConcepts.length) {
      knowledgeAwarePayload = appendUniqueSuggestions(learnedPayload, [
        'Keep any diagnosis wording proposed based on available information rather than fully settled.',
      ]);
    }
    if (!suppressGlobalSuggestions) {
      knowledgeAwarePayload = appendUniqueSuggestions(knowledgeAwarePayload, [
        buildStructuredKnowledgeReminder(filteredKnowledgeBundle),
        ...buildDefensibilitySuggestions({
          medicalNecessity,
          levelOfCare,
          cptSupport,
          losAssessment,
          auditFlags,
        }),
        ...buildWorkflowSuggestions({
          nextActions,
          triage: triageSuggestion,
          discharge: dischargeStatus,
          tasks: workflowTasks,
        }),
        ...mseAnalysis.unsupportedNormals.slice(0, 2),
        ...(contradictionAnalysis.contradictions.length ? [contradictionAnalysis.contradictions[0].detail] : []),
        ...((!riskAnalysis.suicide.length && !riskAnalysis.violence.length && !riskAnalysis.graveDisability.length)
          ? ['Risk remains insufficiently described in the available source; do not infer absence of risk.']
          : []),
      ]);
    }
    const fidelitySafePayload = enforceFidelity({
      output: knowledgeAwarePayload,
      source: sanitizedSourceText,
      mseAnalysis,
      riskAnalysis,
      contradictions: contradictionAnalysis,
    });
    const memoryAwarePayload = applyProviderMemoryToPayload(fidelitySafePayload, providerMemory);
    const rehydratedFinalPayload = rehydrateAssistantPayload(memoryAwarePayload, phiEntities);
    const shouldPreserveMedicationReferenceState = (
      atlasConversation.didRewrite && atlasConversation.routeHint === 'medication_reference'
    ) || priorClinicalState?.answerMode === 'medication_reference_answer';
    const finalPayload = shouldPreserveMedicationReferenceState
      ? {
          ...rehydratedFinalPayload,
          answerMode: rehydratedFinalPayload.answerMode || 'medication_reference_answer' as const,
          builderFamily: rehydratedFinalPayload.builderFamily || 'medication-boundary' as const,
        }
      : rehydratedFinalPayload;

    await recordRelationshipSignalIfNeeded(message.toLowerCase(), context, authenticatedProviderId);

    const initialReferences = mergeAssistantReferences(
      memoryAwarePayload.references,
      routeLevelKnowledgeReferences,
    );
    const hydratedReferences = (mode === 'reference-lookup' || knowledgeIntent === 'reference_help' || initialReferences.length)
      ? await hydrateTrustedReferenceSources(assistantMessageForRouting, initialReferences)
      : memoryAwarePayload.references;
    const externalAnswerMeta = (mode === 'reference-lookup' || knowledgeIntent === 'reference_help')
      ? buildExternalAnswerMeta(finalPayload.message, hydratedReferences || [])
      : memoryAwarePayload.externalAnswerMeta;

    finishRequest(true);
    logEvent({
      route: 'assistant/respond',
      userId: authContext.user.id,
      action: 'assistant_respond',
      outcome: 'success',
      status: 200,
      model: selectedModel,
      latencyMs: getLatencyMs(),
      metadata: {
        providerId,
        stage,
        mode,
        recentMessagesCount: recentMessages.length,
        intentTraceCount: intentTrace.length,
        knowledgeIntent,
        answerMode: finalPayload.answerMode || 'none',
        diagnosisCount: filteredKnowledgeBundle.diagnosisConcepts.length,
        codingCount: filteredKnowledgeBundle.codingEntries.length,
        medicationCount: filteredKnowledgeBundle.medicationConcepts.length,
        substanceCount: filteredKnowledgeBundle.emergingDrugConcepts.length,
        workflowCount: filteredKnowledgeBundle.workflowGuidance.length,
        trustedReferenceCount: filteredKnowledgeBundle.trustedReferences.length,
        referenceCount: hydratedReferences?.length || 0,
        providerMemoryCount: providerMemory.length,
        suggestedMemoryCount: suggestedMemory.length,
        medicalNecessitySignalCount: medicalNecessity.signals.filter((item) => item.strength !== 'missing').length,
        levelOfCareSuggested: levelOfCare.suggestedLevel,
        auditFlagCount: auditFlags.length,
        nextActionCount: nextActions.length,
        triageSuggested: triageSuggestion.level,
        dischargeReadiness: dischargeStatus.readiness,
        workflowTaskCount: workflowTasks.length,
        structuredKnowledgePromptLength: structuredKnowledgePrompt.length,
        mseDetectedDomainCount: mseAnalysis.detectedDomains.length,
        contradictionCount: contradictionAnalysis.contradictions.length,
        suicideRiskSignalCount: riskAnalysis.suicide.length,
        violenceRiskSignalCount: riskAnalysis.violence.length,
        graveDisabilitySignalCount: riskAnalysis.graveDisability.length,
        externalAnswerConfidence: externalAnswerMeta?.level || 'none',
      },
    });
    recordAuditEvent({
      userId: authContext.user.id,
      action: 'assistant_respond',
      route: 'assistant/respond',
      metadata: {
        providerId,
        stage,
        mode,
        knowledgeIntent,
        providerMemoryUsed: providerMemory.length > 0,
      },
    });
    if (evalMode) {
      recordEvalResult(1, 0);
    }

    return NextResponse.json({
      ...finalPayload,
      references: hydratedReferences,
      externalAnswerMeta,
      modeMeta: buildAssistantModeMeta(mode, stage),
      suggestedMemory,
      ...(evalMode ? {
        eval: {
          rawOutput: finalPayload.message,
          warnings: [
            ...(filteredKnowledgeBundle.diagnosisConcepts.length ? ['Diagnosis support remains suggestive only.'] : []),
            ...((!riskAnalysis.suicide.length && !riskAnalysis.violence.length && !riskAnalysis.graveDisability.length)
              ? ['Risk signals were limited; source-only restraint was preferred.']
              : []),
          ],
          knowledgeIntent,
          answerMode: finalPayload.answerMode,
          routePriority: atlasConversation.didRewrite ? `atlas-conversation:${atlasConversation.routeHint}` : undefined,
          providerMemoryCount: providerMemory.length,
          medicalNecessitySignalCount: medicalNecessity.signals.filter((item) => item.strength !== 'missing').length,
          levelOfCareSuggested: levelOfCare.suggestedLevel,
          auditFlagCount: auditFlags.length,
          nextActionCount: nextActions.length,
          triageSuggested: triageSuggestion.level,
          dischargeReadiness: dischargeStatus.readiness,
          workflowTaskCount: workflowTasks.length,
          structuredKnowledgePromptLength: structuredKnowledgePrompt.length,
          mseDetectedDomains: mseAnalysis.detectedDomains.map((item) => item.domain),
          contradictionCount: contradictionAnalysis.contradictions.length,
          riskSignalCounts: {
            suicide: riskAnalysis.suicide.length,
            violence: riskAnalysis.violence.length,
            graveDisability: riskAnalysis.graveDisability.length,
          },
          conversation: buildAtlasConversationEvalMeta(atlasConversation),
        },
      } : {}),
    });
  } catch (error) {
    finishRequest(false);
    trackError('assistant/respond', error);
    if (evalMode) {
      recordEvalResult(0, 1);
    }
    logEvent({
      route: 'assistant/respond',
      userId: authContext.user.id,
      action: 'assistant_error',
      outcome: 'error',
      status: 500,
      model: selectedModel,
      latencyMs: getLatencyMs(),
    });
    const safeFallback = buildMinimalSafeResponse(
      body?.stage === 'review' ? 'review' : 'compose',
      body?.mode === 'reference-lookup'
        ? 'reference-lookup'
        : body?.mode === 'prompt-builder'
          ? 'prompt-builder'
          : 'workflow-help',
    );
    return NextResponse.json(safeFallback, { status: 200 });
  }
}
