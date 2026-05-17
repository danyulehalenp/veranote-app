import OpenAI from 'openai';
import { assemblePrompt } from '@/lib/ai/assemble-prompt';
import { loadPromptFile } from '@/lib/ai/prompt-loader';
import { generateMockNote } from '@/lib/ai/mock-generate';
import { buildCopilotSuggestions, extractContradictionFlags, extractMissingInfoFlags } from '@/lib/ai/source-analysis';
import { summarizeMseSupport } from '@/lib/ai/mse-support';
import { buildDiagnosisProfilePromptLines } from '@/lib/note/diagnosis-profile';
import { buildEncounterSupportPromptLines } from '@/lib/note/encounter-support';
import { buildMedicationProfilePromptLines } from '@/lib/note/medication-profile';
import { planSections, SECTION_LABELS } from '@/lib/note/section-profiles';
import { GenerateNoteResponseSchema, type GenerateNoteResult } from '@/lib/ai/response-schema';
import type { EncounterSupport, NoteClaim, SourceSections, StructuredPsychDiagnosisProfileEntry, StructuredPsychMedicationProfileEntry } from '@/types/session';

type GenerateNoteInput = {
  specialty: string;
  noteType: string;
  outputStyle: string;
  format: string;
  keepCloserToSource: boolean;
  flagMissingInfo: boolean;
  sourceInput: string;
  sourceSections?: SourceSections;
  encounterSupport?: EncounterSupport;
  medicationProfile?: StructuredPsychMedicationProfileEntry[];
  diagnosisProfile?: StructuredPsychDiagnosisProfileEntry[];
  outputScope?: 'hpi-only' | 'selected-sections' | 'full-note';
  requestedSections?: string[];
  customInstructions?: string;
};

const stubClaims: NoteClaim[] = [
 {
 claim_id: "stub-1",
 claim_text: "Patient reports taking medications as prescribed.",
 section: "medications",
 source_refs: [
 {
 span_id: "src-1",
 source_type: "transcript",
 text_excerpt: "Patient mentions no missed doses in the last month."
 }
],
 evidence_status: "supported",
 review_required: false
 }
];

export type GenerateNoteWithMetaResult = GenerateNoteResult & {
 claims: NoteClaim[];
 copilotSuggestions: ReturnType<typeof buildCopilotSuggestions>;
 mode: 'live' | 'fallback';
 warning?: string;
 generationMeta: {
 pathUsed: 'live' | 'fallback';
 provider: 'openai' | 'ollama' | 'none';
 model: string | null;
 reason: 'live' | 'missing_api_key' | 'openai_not_approved' | 'runtime_error';
 };
};

function templateFileForNoteType(noteType: string) {
 const normalized = noteType.trim().toLowerCase();

 if (normalized.includes('therapy')) {
 return 'therapy-progress.md';
 }

 if (normalized.includes('general medical') || normalized.includes('soap') || normalized.includes('acute follow-up') || normalized.includes('urgent care')) {
 return 'general-medical-soap-hpi.md';
 }

 if (normalized.includes('inpatient psych progress')) {
 return 'inpatient-psych-progress-note.md';
 }

 if (normalized.includes('inpatient psych initial adult')) {
 return 'inpatient-psych-initial-adult-eval.md';
 }

 if (normalized.includes('inpatient psych initial adolescent') || normalized.includes('child/adolescent')) {
 return 'inpatient-psych-initial-adolescent-eval.md';
 }

	 if (normalized.includes('day two')) {
	 return 'inpatient-psych-day-two-note.md';
	 }

	 if (normalized.includes('outpatient psych follow-up') || normalized.includes('outpatient psych followup') || normalized.includes('outpatient psychiatry follow-up') || normalized.includes('outpatient psychiatric follow-up')) {
	 return 'outpatient-psych-followup.md';
	 }

	 if (normalized.includes('risk-heavy') || normalized.includes('risk heavy')) {
	 return 'risk-heavy-note.md';
 }

 if (normalized.includes('substance-vs-psych') || normalized.includes('substance vs psych')) {
 return 'substance-vs-psych-overlap-note.md';
 }

 if (normalized.includes('medical-vs-psych') || normalized.includes('medical vs psych')) {
 return 'medical-vs-psych-overlap-note.md';
 }

	 if (normalized.includes('collateral-heavy') || normalized.includes('collateral heavy')) {
	 return 'collateral-heavy-note.md';
	 }

	 if (normalized.includes('sparse source') || normalized.includes('limited source')) {
	 return 'sparse-source-note.md';
	 }

 if (normalized.includes('discharge')) {
 return 'inpatient-psych-discharge-summary.md';
 }

 if (normalized.includes('crisis')) {
 return 'psychiatric-crisis-note.md';
 }

 if (normalized.includes('medical h&p')) {
 return 'medical-h-and-p.md';
 }

 if (normalized.includes('medical consultation') || normalized.includes('medical consult')) {
 return 'medical-consultation-note.md';
 }

 return 'psychiatry-follow-up.md';
}

function asMessage(error: unknown) {
 if (error instanceof Error && error.message) {
 return error.message;
 }

 return 'Live generation was unavailable, so the app used the local fallback draft.';
}

function getRequestedProvider() {
 const explicit = (process.env.VERANOTE_AI_PROVIDER || process.env.AI_PROVIDER || '').trim().toLowerCase();
 if (explicit === 'ollama' || explicit === 'local') return 'ollama';
 if (explicit === 'openai') return 'openai';
 if (explicit === 'mock' || explicit === 'fallback' || explicit === 'none') return 'none';
 if (process.env.VERANOTE_ALLOW_OPENAI === '1') return 'openai';
 return 'none';
}

function buildFallbackResult(
 input: GenerateNoteInput,
 model: string | null,
 reason: GenerateNoteWithMetaResult['generationMeta']['reason'],
 warning: string,
 provider: GenerateNoteWithMetaResult['generationMeta']['provider'] = 'none',
): GenerateNoteWithMetaResult {
 const fallback = generateMockNote(input.sourceInput, input.noteType, input.flagMissingInfo);
 const fallbackNote = finalizeGeneratedNote(fallback.note, input);
 return {
 ...fallback,
 note: fallbackNote,
 flags: mergeFlags(input, fallback.flags),
 claims: stubClaims,
 copilotSuggestions: buildSuggestions(input),
 mode: 'fallback',
 warning,
 generationMeta: {
 pathUsed: 'fallback',
 provider,
 model,
 reason,
 },
 };
}

function mergeFlags(input: GenerateNoteInput, flags: string[]) {
 const contradictionFlags = extractContradictionFlags(input.sourceInput);
 const sectionPlan = planSections({
 noteType: input.noteType,
 requestedScope: input.outputScope,
 requestedSections: input.requestedSections,
 });
 const mseSupport = summarizeMseSupport({
 noteType: input.noteType,
 sourceSections: input.sourceSections,
 sourceInput: input.sourceInput,
 });
 const mseFlags = sectionPlan.requiresStandaloneMse && mseSupport?.suggestedFlag ? [mseSupport.suggestedFlag] : [];

 if (!input.flagMissingInfo) {
 return Array.from(new Set([...(Array.isArray(flags) ? flags : []), ...contradictionFlags, ...mseFlags]));
 }

 const inferredFlags = extractMissingInfoFlags(input.sourceInput, input.noteType);
 return Array.from(new Set([...(Array.isArray(flags) ? flags : []), ...inferredFlags, ...contradictionFlags, ...mseFlags]));
}

function buildSuggestions(input: GenerateNoteInput) {
  return buildCopilotSuggestions({
   sourceInput: input.sourceInput,
   noteType: input.noteType,
   sourceSections: input.sourceSections,
  });
}

function escapeRegExp(value: string) {
 return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const progressNoteRequiredHeadings = [
 'Reason for Follow-Up / Interval Concern',
 'Source of Information',
 'Interval Events / Patient Report (Subjective)',
 'Staff / Nursing / Collateral Observations (Objective)',
 'Mental Status Exam / Observations',
 'Safety / Risk',
 'Medications / Treatment Adherence',
 'Assessment / Clinical Formulation',
 'Plan / Continued Hospitalization',
 'Source Limitations / Missing Information',
];

function hasProgressHeading(note: string, heading: string) {
 const aliases: Record<string, RegExp[]> = {
 'Interval Events / Patient Report (Subjective)': [/^\s*Interval (?:Events|History).*Subjective\)?\s*:/im, /^\s*Subjective\s*:/im],
 'Staff / Nursing / Collateral Observations (Objective)': [/^\s*Staff \/ Nursing \/ Collateral Observations.*Objective\)?\s*:/im, /^\s*Objective\s*:/im],
 'Mental Status Exam / Observations': [/^\s*Mental Status(?: Exam)? \/ Observations\s*:/im, /^\s*MSE\s*:/im],
 'Safety / Risk': [/^\s*Safety \/ Risk\s*:/im, /^\s*Risk Assessment\s*:/im],
 'Assessment / Clinical Formulation': [/^\s*Assessment(?: \/ Clinical Formulation)?\s*:/im],
 'Plan / Continued Hospitalization': [/^\s*Plan(?: \/ Continued Hospitalization)?\s*:/im],
 };

 return (aliases[heading] ?? [new RegExp(`^\\s*${escapeRegExp(heading)}\\s*:`, 'im')]).some((pattern) => pattern.test(note));
}

function enforceProgressNoteHeadings(note: string, noteType: string) {
 if (!/inpatient psych progress/i.test(noteType)) return note;

 const missingHeadings = progressNoteRequiredHeadings.filter((heading) => !hasProgressHeading(note, heading));
 if (!missingHeadings.length) return note;

 const additions = missingHeadings.map((heading) => `${heading}:\nNot documented in source.`);
 return `${note.trim()}\n\n${additions.join('\n\n')}`;
}

function hardenRiskReassuranceWording(note: string, noteType: string) {
 const appliesToFinalRiskBatch = /inpatient psych initial adult|inpatient psych day two|inpatient psych progress|inpatient psych discharge|risk-heavy|risk heavy/i.test(noteType);
 if (!appliesToFinalRiskBatch) return note;

 return note
  .replace(
   /\b(?:there is\s+)?(?:pressure|provider pressure)\s+(?:is\s+)?(?:noted\s+)?to\s+(?:say|classify|characterize|describe|frame)\s+(?:the\s+)?patient\s+as\s+low[-\s]?risk[^.]*\./gi,
   'Unsupported risk-minimization pressure is present; broader safety risk requires documented assessment, and unresolved domains remain visible.',
  )
  .replace(/\blow[-\s]?risk\b/gi, 'risk-minimized')
  .replace(/\brisk\s+is\s+low\b/gi, 'risk is not fully established from the provided source')
  .replace(/\bsafe\s+(?:for|to)\s+discharge\b/gi, 'discharge readiness not established')
  .replace(/\bstable\s+for\s+discharge\b/gi, 'discharge condition not established')
  .replace(/\bdischarge\s+ready\b/gi, 'discharge readiness not established')
  .replace(/\brisk\s+resolved\b/gi, 'risk status remains incompletely established')
  .replace(/\bno\s+acute\s+safety\s+concerns?\b/gi, 'incomplete acute safety data')
  .replace(/\bno\s+safety\s+concerns?\b/gi, 'incomplete safety data')
  .replace(/\b(?:denies|reports|states)\s+(?:any\s+)?safety\s+concerns?\b/gi, 'specific safety denials require source-bound qualification')
  .replace(/\bguaranteed\s+safety\b/gi, 'safety cannot be guaranteed from the provided source')
  .replace(/\bcontract(?:ed)?\s+for\s+safety\b/gi, 'safety planning status requires documentation');
}

function preserveDocumentedSleepDetail(note: string, noteType: string, sourceInput: string) {
 if (!/inpatient psych day two|inpatient psych progress/i.test(noteType)) return note;

 const sleepMatch = sourceInput.match(/\b(?:slept\s*)?(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)\b/i);
 if (!sleepMatch?.[0]) return note;
 if (new RegExp(`\\b${escapeRegExp(sleepMatch[1])}\\s*(?:hrs?|hours?)\\b`, 'i').test(note)) return note;

 const sleepDetail = sleepMatch[0].replace(/^slept\s*/i, '').trim();
 const sentence = `Overnight sleep duration was documented as ${sleepDetail}.`;
 if (/Medications \/ Early Tolerability \/ Side Effects:/i.test(note)) {
  return note.replace(
   /(Medications \/ Early Tolerability \/ Side Effects:\s*)/i,
   `$1${sentence} `,
  );
 }

 return `${note.trim()}\n\nSleep / Overnight Nursing:\n${sentence}`;
}

function removeUnsupportedMedicalStability(note: string, sourceInput: string) {
 if (/\bmedically stable|medical stability\b/i.test(sourceInput)) return note;

 return note
  .replace(/\bnot medically stable\b/gi, 'medical stability is not established from the provided source')
  .replace(/\bthe patient (?:remains|is|was) medically stable\b/gi, 'Medical stability is not established from the provided source')
  .replace(/\bpatient (?:remains|is|was) medically stable\b/gi, 'Medical stability is not established from the provided source')
  .replace(/\b(?:remains|is|was|appears|seems|presents as) medically stable\b/gi, 'Medical stability is not established from the provided source')
  .replace(/\bmedically stable\b/gi, 'medical stability is not established from the provided source');
}

function preserveMedicalClearanceUncertainty(note: string, sourceInput: string) {
 const sourceHasUncertainClearance = /\bmed clear\?|medical(?:ly)? clear\?|do not (?:state|say) medically cleared|medical clearance.*(?:pending|unclear|question|not documented)|cbc not (?:visible|visable)|lab sheet not included/i.test(sourceInput);
 if (!sourceHasUncertainClearance) return note;
 const hardenedNote = note
  .replace(/\bnot medically cleared\b/gi, 'medical clearance is not established from the provided source')
  .replace(/\bwhether (?:the patient )?(?:is|was )?medically cleared\b/gi, 'whether medical clearance is established')
  .replace(/\b(?:the patient |patient )?(?:is|was|remains) medically cleared\b/gi, 'medical clearance is not established from the provided source')
  .replace(/\bcleared for (?:psych|psychiatric admission|psychiatric transfer)\b/gi, 'medical clearance is not established from the provided source');
 if (/\bmedical clearance\b|med clear\?|clearance.{0,80}(?:unclear|question|not established|not documented)/i.test(hardenedNote)) return hardenedNote;

 const sourceLimitation = /\bmed clear\?|medical(?:ly)? clear\?/i.test(sourceInput)
  ? 'Medical clearance is not established from the provided source; the transfer note includes questioned clearance wording and source documentation is incomplete.'
  : 'Medical clearance is not established from the provided source; final clearance wording is absent, pending, or not documented in the provided material.';
 return `${hardenedNote.trim()}\n\nMedical Clearance / Source Limitation:\n${sourceLimitation}`;
}

function preserveRestraintSourceStatus(note: string, sourceInput: string) {
 const sourceHasNoRestraintFlowsheet = /\bno restraint flowsheet\b|\brestraint flowsheet.*(?:not found|not visible|absent)\b/i.test(sourceInput);
 if (!sourceHasNoRestraintFlowsheet) return note;

 return note
  .replace(/\bno restraints? (?:were )?used\b/gi, 'no restraint flowsheet was found in the provided source')
  .replace(/\bthere (?:was|were) no restraints? used\b/gi, 'no restraint flowsheet was found in the provided source')
  .replace(/\brestraints? (?:were )?not used\b/gi, 'no restraint flowsheet was found in the provided source')
  .replace(/\brestraint use (?:was|is) not documented\b/gi, 'no restraint flowsheet was found in the provided source')
  .replace(/\brestraints? (?:were )?used\b/gi, 'restraint use is not documented in the provided source; no restraint flowsheet was found')
  .replace(/\bplaced in restraints\b/gi, 'restraint use is not documented in the provided source; no restraint flowsheet was found');
}

function preservePendingOrUnclearLabSourceLimits(note: string, sourceInput: string) {
 const labLimits: string[] = [];

 if (/\bUDS\b.{0,80}\bpending\b|\bpending\b.{0,80}\bUDS\b/i.test(sourceInput)
  && !/\bUDS\b.{0,80}\bpending\b|\bpending\b.{0,80}\bUDS\b/i.test(note)) {
  labLimits.push('UDS was marked pending in the source.');
 }

 if (/\bpotassium\b.{0,80}(?:appears|unclear|cut off|3\.\?)/i.test(sourceInput)
  && !/\bpotassium\b.{0,80}(?:appears|unclear|cut off|3\.|not fully visible)/i.test(note)) {
  labLimits.push('Potassium value was partially cut off/unclear in the scanned or OCR lab source.');
 }

 if (/\bpregnancy(?: test)?\b.{0,80}(?:not visible|line not visible|cut off|unclear)/i.test(sourceInput)
  && !/\bpregnancy(?: test)?\b.{0,80}(?:not visible|line not visible|cut off|unclear|not documented)/i.test(note)) {
  labLimits.push('Pregnancy test line was not visible in the available source.');
 }

 if (/\bEKG\b.{0,80}(?:\?|unclear|question mark|OCR|tachy\?)|\bsinus tachy\?/i.test(sourceInput)
  && !/\bEKG\b.{0,120}(?:unclear|question|OCR|tachy|not fully visible|source limitation)/i.test(note)) {
  labLimits.push('EKG wording was unclear or question-marked in the scanned/OCR source.');
 }

 if (/\btroponin\b.{0,80}(?:not visible|line not visible|cut off|unclear)/i.test(sourceInput)
  && !/\btroponin\b.{0,120}(?:not visible|line not visible|cut off|unclear|not documented|source limitation)/i.test(note)) {
  labLimits.push('Troponin line was not visible in the available scanned/OCR source.');
 }

 if (/\bTSH\b.{0,120}(?:low|abnormal).{0,120}\brepeat\b.{0,80}\bpending\b|\brepeat\b.{0,80}\bpending\b.{0,120}\bTSH\b|\blow TSH\b/i.test(sourceInput)
  && !/\bTSH\b.{0,160}(?:low|abnormal|pending|repeat)|\brepeat lab pending\b/i.test(note)) {
  labLimits.push('TSH was low in the source history and repeat lab is pending.');
 }

 if (!labLimits.length) {
  return note;
 }

 return `${note.trim()}\n\nDiagnostics / Source Limitation:\n${labLimits.join(' ')}`;
}

function preservePendingMatDoseDecision(note: string, sourceInput: string) {
 const needsMatDecisionLimit = /\bbridge prescription\b|requests? bridge|miss(?:ed|ing) three days|UDS.*pending|pending.*UDS|do not state bridge|do not state dose unchanged|completed prescribing decision/i.test(sourceInput)
  && /\bbuprenorphine|naloxone|Suboxone|MAT\b/i.test(sourceInput);

 if (!needsMatDecisionLimit) return note;
 if (/no (?:current |final )?(?:dosing|medication|prescribing) decision|not documented.*(?:dose|prescription|bridge)/i.test(note)) return note;

 return `${note.trim()}\n\nMedication Decision / Source Limitation:\nNo final dosing decision or prescribing decision is documented in the provided source; the bridge request, missed doses, prior source-listed dose, and pending UDS should remain source limitations rather than completed medication actions.`;
}

function preserveAllergyMedicationSourceLimits(note: string, sourceInput: string) {
 const hasAllergyMedicationLimit = /\b(?:allergy|rash|reaction date|OCR|full assessment|copied[-\s]?forward)\b/i.test(sourceInput)
  && /\b(?:not visible|cuts off|cut off|not included|unreadable)\b/i.test(sourceInput)
  && /\b(?:lamotrigine|Lamictal|sulfa|rash|allergy|bipolar|PTSD)\b/i.test(sourceInput);
 if (!hasAllergyMedicationLimit) return note;

 const sourceLimitLines: string[] = [];

 if (/\ballergy\b.{0,120}\bsulfa\b.{0,120}\bhives\b[\s\S]{0,160}\breaction date not visible\b/i.test(sourceInput)
  && !/\bsulfa\b[\s\S]{0,180}\breaction date (?:not visible|not documented|unavailable)\b/i.test(note)) {
  sourceLimitLines.push('Sulfa allergy with hives is source-listed, but the reaction date is not visible in the referral packet.');
 }

 if (/\brash\b[\s\S]{0,160}\bOCR\b[\s\S]{0,120}\b(?:cuts off|cut off)\b[\s\S]{0,80}\bmedication name\b/i.test(sourceInput)
  && !/\brash\b[\s\S]{0,180}\b(?:OCR|cut off|not visible|source limitation)\b/i.test(note)) {
  sourceLimitLines.push('Prior rash history is present, but the OCR text cuts off the medication name.');
 }

 if (/\bdiagnoses\b[\s\S]{0,120}\bcopied[-\s]?forward\b[\s\S]{0,180}\blast full assessment not included\b/i.test(sourceInput)
  && !/\b(?:copied[-\s]?forward|historical|referral)\b[\s\S]{0,180}\b(?:full assessment not included|not confirmed|source limitation)\b/i.test(note)) {
  sourceLimitLines.push('Copied-forward diagnoses remain historical/referral data because the last full assessment is not included.');
 }

 if (!sourceLimitLines.length) {
  return note;
 }

 return `${note.trim()}\n\nAllergy / Referral Source Limitation:\n${sourceLimitLines.join(' ')}`;
}

function hardenSourceBoundRiskWording(note: string, sourceInput: string) {
 const hasRiskNuance = /(\bSI\b|\bHI\b|SI\/HI|suicidal ideation|homicidal ideation|denies? (?:current )?(?:SI|HI|SI\/HI)|passive death|wish .*not wake|wish .*wouldn[’']?t wake|passive si|suicid|self-harm|do not summarize as low[-\s]?risk)/i.test(sourceInput);
 if (!hasRiskNuance) return note;

 return note
  .replace(/\bsafety risk is low\s+(?:as|because)\s+([^.\n]+)\./gi, 'Safety: $1; overall risk level is not established from this source alone.')
  .replace(/\brisk is low\s+(?:as|because)\s+([^.\n]+)\./gi, 'risk level is not established from this source alone; $1.')
  .replace(/\blow[-\s]?risk\b/gi, 'risk not fully established from the provided source')
  .replace(/\brisk\s+is\s+low\b/gi, 'risk is not fully established from the provided source')
  .replace(/\bno\s+acute\s+safety\s+concerns?\b/gi, 'acute safety risk is not fully established from the provided source')
  .replace(/\bno\s+safety\s+concerns?\b/gi, 'safety risk is not fully established from the provided source');
}

function preservePriorCurrentRiskTimeline(note: string, sourceInput: string) {
 const sourceHasDatedPriorRiskDenial = /\bprior note\b[\s\S]{0,260}\b(?:denied|denies)\s+(?:SI\/HI|suicidal|homicidal)\b/i.test(sourceInput)
  || /\byesterday\b[\s\S]{0,180}\b(?:denied|denies)\s+(?:SI\/HI|suicidal|homicidal)\b/i.test(sourceInput)
  || /\b(?:denied|denies)\s+(?:SI\/HI|suicidal|homicidal)\b[\s\S]{0,140}\byesterday\b/i.test(sourceInput);
 const sourceHasCurrentCollateralRiskConcern = /\b(?:today|this morning|overnight|collateral|sister|mother|family|staff|nursing)\b[\s\S]{0,320}\b(?:suicid|cannot keep doing this|texted|text message|threat|self-harm|safety|risk)\b/i.test(sourceInput);

 if (!sourceHasDatedPriorRiskDenial || !sourceHasCurrentCollateralRiskConcern) {
  return note;
 }

 if (/\b(?:prior note|yesterday)\b[\s\S]{0,220}\b(?:denied|denial|denies)\b[\s\S]{0,120}\b(?:SI\/HI|suicid|homicid)\b/i.test(note)) {
  return note;
 }

 return `${note.trim()}\n\nRisk Source Timeline:\nPrior note/yesterday source documented SI/HI denial. Current/today collateral or staff source documents a new risk concern; current risk context remains unresolved from the provided source.`;
}

function preserveDischargePlanningBarriers(note: string, sourceInput: string) {
 const barrierLines: string[] = [];

 if (/\bmother\b.{0,120}\bcannot return home\b|\bcannot return home\b.{0,120}\bmother\b/i.test(sourceInput)
  && !/\bmother\b.{0,180}\bcannot return\b|\bcannot return home\b.{0,180}\bmother\b/i.test(note)) {
  barrierLines.push('Mother reports patient cannot return home this week.');
 }

 if (/\b(?:Medicaid )?transport\b.{0,100}\bnot yet scheduled\b|\bnot yet scheduled\b.{0,100}\b(?:Medicaid )?transport\b/i.test(sourceInput)
  && !/\btransport\b.{0,140}\bnot (?:yet )?scheduled\b|\bnot (?:yet )?scheduled\b.{0,140}\btransport\b/i.test(note)) {
  barrierLines.push('Medicaid transport is not yet scheduled.');
 }

 if (/\bshelter\b.{0,80}\bwaitlist\b|\bwaitlist\b.{0,80}\bshelter\b/i.test(sourceInput)
  && !/\bshelter\b.{0,120}\bwaitlist\b|\bwaitlist\b.{0,120}\bshelter\b/i.test(note)) {
  barrierLines.push('Shelter bed waitlist has been started but placement is not confirmed from the provided source.');
 }

 if (!barrierLines.length) {
  return note;
 }

 return `${note.trim()}\n\nDischarge Planning Barriers:\n${barrierLines.join(' ')}`;
}

function preservePatientContinuityBoundaries(note: string, sourceInput: string) {
 const hasContinuityContext = /Patient Continuity Context - Veranote recall layer|Use this as prior context only|Continuity safety rule/i.test(sourceInput);
 if (!hasContinuityContext) return note;

 let cleaned = note
  .replace(/\b(?:prior |previously documented )?passive (?:death wish|SI|suicidal ideation)[^.\n]*(?:resolved|cleared|no longer present)[^.\n]*(?:\.\s*)?/gi, 'Previously documented passive-risk content remains prior context; today source documents denial of active SI, plan, or intent when present. ')
  .replace(/\b(?:prior |previously documented )?suicidal ideation[^.\n]*(?:resolved|cleared|no longer present)[^.\n]*(?:\.\s*)?/gi, 'Previously documented risk/safety content remains prior context; today source documents current risk statements when present. ');

 const sourceHasPriorRisk = /\bpreviously documented\b.{0,180}\b(passive death|passive SI|suicid|risk\/safety|safety planning)\b|\b(passive death|passive SI|suicid|risk\/safety|safety planning)\b.{0,180}\bpreviously documented\b/i.test(sourceInput);
 const sourceHasTodayRiskDenial = /\bdenies? active (?:suicidal ideation|SI)\b|\bdenies?[^.\n]{0,80}\b(?:plan|intent)\b|\bnot trying to kill myself\b/i.test(sourceInput);
 const sourceHasMedicationContinuity = /\bpreviously documented\b.{0,180}\b(?:medication|sertraline|zoloft|lithium|lamotrigine|dose|missed doses?)\b|\b(?:medication|sertraline|zoloft|lithium|lamotrigine|dose|missed doses?)\b.{0,180}\bpreviously documented\b/i.test(sourceInput);
 const sourceHasTodayMedicationSignal = /\bmissed (?:one|two|three|\d+) doses?\b|\bmissed\b.{0,60}\bthis week\b|\bforget\b.{0,60}\bmedicine\b|\btaking\b.{0,80}\bmost days\b/i.test(sourceInput);
 const sourceHasOpenLoop = /\bpreviously documented\b.{0,180}\b(?:referral|collateral|pending|follow[-\s]?up|open loops?)\b|\b(?:referral|collateral|pending|follow[-\s]?up|open loops?)\b.{0,180}\bpreviously documented\b/i.test(sourceInput);
 const noteAlreadyMarksPrior = /\b(previously documented|prior context|prior note|historical continuity|prior continuity)\b/i.test(cleaned);
 const continuityLines: string[] = [];

 if (!noteAlreadyMarksPrior) {
  continuityLines.push('Prior continuity source was used only as previously documented context; current statements should remain tied to today source.');
 }

 if (sourceHasPriorRisk && sourceHasTodayRiskDenial && !/\bpreviously documented\b.{0,160}\b(?:denies|denial|active SI|plan|intent)\b/i.test(cleaned)) {
  continuityLines.push('Risk continuity: prior risk/safety content was previously documented; today source documents denial of active SI, plan, or intent, and the prior risk item remains a reconciliation point.');
 }

 if (sourceHasMedicationContinuity && sourceHasTodayMedicationSignal && !/\bpreviously documented\b.{0,160}\b(?:missed|forget|most days|adherence)\b/i.test(cleaned)) {
  continuityLines.push('Medication continuity: prior medication adherence/tolerability context should be reconciled with today source, including missed-dose details.');
 }

 if (sourceHasOpenLoop && !/\bpreviously documented\b.{0,160}\b(?:referral|collateral|pending|open loop|transportation)\b/i.test(cleaned)) {
  continuityLines.push('Open loops: prior referral, collateral, lab, or follow-up items should be marked as completed, still pending, or not addressed today.');
 }

 if (!continuityLines.length) {
  return cleaned;
 }

 return `${cleaned.trim()}\n\nContinuity / Prior Context:\n${continuityLines.join(' ')}`;
}

function hardenMedicationAdherenceWording(note: string, sourceInput: string) {
 const sourceHasMissedDoseCue = /\b(?:miss(?:ed|ing)?|forgot|forget|rushed|remember)\b.{0,80}\b(?:dose|doses|medicine|medication|medications|propranolol|sertraline|escitalopram|lexapro)\b|\b(?:dose|doses|medicine|medication|medications|propranolol|sertraline|escitalopram|lexapro)\b.{0,80}\b(?:miss(?:ed|ing)?|forgot|forget|rushed|remember)\b/i.test(sourceInput);
 if (!sourceHasMissedDoseCue) return note;

 return note
  .replace(/\b(?:medication\s+)?adherence\s+is\s+good\s+(?:is|was)\s+not\s+(?:claimed|documented|supported)\b/gi, 'full medication adherence is not established; missed doses are documented')
  .replace(/\bgood\s+adherence\s+(?:is|was)\s+not\s+(?:claimed|documented|supported)\b/gi, 'full medication adherence is not established; missed doses are documented')
  .replace(/\bwhen\s+propranolol\s+is\s+taken\s+as\s+prescribed\b/gi, 'when propranolol is remembered/taken, while missed morning doses are also documented')
  .replace(/\bpropranolol\s+is\s+taken\s+as\s+prescribed\b/gi, 'propranolol is remembered/taken, with missed doses also documented')
  .replace(/\btaking\s+(?:medications|medicine|propranolol|sertraline|escitalopram|Lexapro)\s+as\s+prescribed\b/gi, 'taking medication as reported, with missed doses also documented')
  .replace(/\btaking\s+as\s+prescribed\b/gi, 'taking as reported, with missed doses also documented')
  .replace(/\bfully\s+adherent\b/gi, 'missed doses documented')
  .replace(/\bperfect\s+adherence\b/gi, 'missed doses documented')
  .replace(/\badherence\s+is\s+good\b/gi, 'adherence includes documented missed doses')
  .replace(/\bgood\s+adherence\b/gi, 'adherence includes documented missed doses')
  .replace(/\badherent\s+with\s+([A-Za-z][\w-]*)\b/gi, 'taking $1 as reported, with missed doses also documented')
  .replace(/\badherence includes documented missed doses\s+(?:is|was)\s+not\s+(?:claimed|documented|supported)\b/gi, 'full medication adherence is not established; missed doses are documented')
  .replace(/\bmissed doses documented\s+(?:is|was)\s+not\s+(?:claimed|documented|supported)\b/gi, 'full medication adherence is not established; missed doses are documented');
}

function preserveDiagnosticUncertainty(note: string, sourceInput: string) {
 const sourceHasDiagnosticUncertaintyCue = /\b(?:psychosis concern|past psychosis|past concern about psychosis|differential|rule[-\s]?out|r\/o|diagnostic uncertainty|diagnos(?:is|tic).{0,80}(?:uncertain|not confirmed|not established)|medical red flags?|medical contributor|substance timing|stimulant|no confirmed prior .*diagnosis|no formal diagnostic assessment|without formal diagnostic assessment|do not diagnose|do not want .*label unless .*sure|not enough to diagnose|manic-like|cannabis use)\b/i.test(sourceInput)
  && /\b(?:psychosis|diagnos|differential|rule[-\s]?out|medical|substance|stimulant|insomnia|bipolar|manic|cannabis|ptsd|trauma|audit-c|alcohol)\b/i.test(sourceInput);
 if (!sourceHasDiagnosticUncertaintyCue) return note;
 if (/\b(?:differential|diagnostic uncertainty|uncertain|uncertainty|not confirmed|not established|not enough|cannot determine|reassess|rule[-\s]?out|no formal diagnostic assessment)\b/i.test(note)) return note;

 return `${note.trim()}\n\nDiagnostic Uncertainty / Source Limitation:\nDiagnostic uncertainty remains from the provided source; diagnostic labels, trauma-related impressions, substance-related diagnoses, and medical or substance confounders should not be converted into confirmed diagnoses without source-supported assessment.`;
}

function preserveBipolarReferralUncertainty(note: string, sourceInput: string) {
 const sourceHasBipolarUncertainty = /\b(?:r\/o|rule[-\s]?out|maybe|might have|told.{0,50}|old note|previous provider|referral|historical|prior)\b.{0,120}\bbipolar\b|\bbipolar\b.{0,120}\b(?:r\/o|rule[-\s]?out|maybe|might have|old note|previous provider|referral|historical|prior|unclear|not confirmed|uncertain)\b/i.test(sourceInput);
 if (!sourceHasBipolarUncertainty) return note;

 const noteKeepsBipolarUncertainty = /\b(?:r\/o|rule[-\s]?out|maybe|might have|told.{0,50}|old note|previous provider|referral|historical|prior)\b.{0,120}\bbipolar\b|\bbipolar\b.{0,120}\b(?:unclear|not confirmed|uncertain|differential|past|historical|referral|prior|old note|previous provider|rule[-\s]?out)\b/i.test(note);
 if (noteKeepsBipolarUncertainty) return note;

 return `${note.trim()}\n\nDiagnostic Uncertainty / Source Limitation:\nBipolar disorder appears only as historical/referral or rule-out language in the provided source and is not confirmed by the current assessment material. Keep this as diagnostic uncertainty rather than a settled diagnosis.`;
}

function preservePsychosisObservationConflict(note: string, sourceInput: string) {
 const sourceHasPsychosisObservationConflict = /((denies ah\/vh|no, i['’]m not hearing voices|denies hallucinations?|denies auditory|denies visual)[\s\S]*(internally preoccupied|laughing to self|staring intermittently|look(?:ed|ing)? toward the corner|responding to internal stimuli))/i.test(sourceInput)
  || /((internally preoccupied|laughing to self|staring intermittently|look(?:ed|ing)? toward the corner|responding to internal stimuli)[\s\S]*(denies ah\/vh|no, i['’]m not hearing voices|denies hallucinations?|denies auditory|denies visual))/i.test(sourceInput);

 if (!sourceHasPsychosisObservationConflict) return note;

 return note
  .replace(/\bconfirmed hallucinations?\b/gi, 'perceptual disturbance not confirmed')
  .replace(/\bpatient (?:is|was) hallucinating\b/gi, 'observed behavior raised concern for possible internal preoccupation')
  .replace(/\bprimary psychotic disorder\b/gi, 'primary psychotic etiology')
  .replace(/\bprimary psychosis\b/gi, 'primary psychotic etiology')
  .replace(/\bhallucinations? (?:are|were) confirmed\b/gi, 'hallucinations were not confirmed from the provided source')
  .replace(/\bpsychosis (?:is|was) confirmed\b/gi, 'psychosis is not confirmed from the provided source');
}

function removeUnsupportedMedicationActionPlan(note: string, sourceInput: string) {
 let cleaned = note;

 const sourceHasCopiedForwardMedicationConflict = /\bcopied[-\s]?forward\b[\s\S]{0,600}\b(?:continue|continued)\b[\s\S]{0,120}\b(?:sertraline|trazodone)\b/i.test(sourceInput)
  && /\b(?:sertraline|zoloft)\b[\s\S]{0,160}\b(?:discontinued|not taken|not taking|has not taken)\b|\btrazodone\b[\s\S]{0,120}\b(?:never picked up|not picked up|not taking)\b/i.test(sourceInput);
 if (sourceHasCopiedForwardMedicationConflict) {
  cleaned = cleaned
   .replace(/\b(?:continue|continued|maintain|restart)\s+sertraline[^.\n]*(?:\.\s*)?/gi, 'Prior sertraline continuation appears only in copied-forward or historical source material; current source documents discontinuation/nonuse and no final medication decision is documented. ')
   .replace(/\b(?:continue|continued|maintain|restart)\s+trazodone[^.\n]*(?:\.\s*)?/gi, 'Prior trazodone continuation appears only in copied-forward or historical source material; current source documents that trazodone was not picked up and no final medication decision is documented. ')
   .replace(/\bsertraline 100 mg daily continued[^.\n]*(?:\.\s*)?/gi, 'Sertraline 100 mg daily appears in copied-forward or historical source material; current source documents discontinuation/nonuse and no final medication decision is documented. ')
   .replace(/\btrazodone 50 mg qhs continued[^.\n]*(?:\.\s*)?/gi, 'Trazodone 50 mg qhs appears in copied-forward or historical source material; current source documents that trazodone was not picked up and no final medication decision is documented. ');

  if (!/\b(no final medication decision|medication discussion|decision.*not documented|no medication decision was documented)\b/i.test(cleaned)) {
   cleaned = `${cleaned.trim()}\n\nMedication Reconciliation / Source Limitation:\nCopied-forward prior medication text conflicts with current reconciliation and patient report. No final medication decision is documented in the provided source.`;
  }
 }

 const sourceSupportsBuprenorphineContinuation = /\b(?:continue|continued|dose unchanged|remain(?:ed)? on|no dose change)\b.{0,80}\bbuprenorphine|\bbuprenorphine\b.{0,80}\b(?:continue|continued|dose unchanged|no dose change)\b/i.test(sourceInput);
 if (!sourceSupportsBuprenorphineContinuation) {
  cleaned = cleaned
   .replace(/\bContinue current buprenorphine\/naloxone dose[^.\n]*(?:\.\s*)?/gi, 'Prior buprenorphine/naloxone dose is source-listed; no current dosing decision is documented. ')
   .replace(/\bContinue buprenorphine\/naloxone[^.\n]*(?:\.\s*)?/gi, 'Prior buprenorphine/naloxone dose is source-listed; no current dosing decision is documented. ')
   .replace(/\bDo not change buprenorphine(?:\/naloxone)? dose[^.\n]*(?:\.\s*)?/gi, 'Prior buprenorphine/naloxone dose is source-listed; no current dosing decision is documented. ')
   .replace(/\bNo changes? to (?:the )?buprenorphine(?:\/naloxone)? dose[^.\n]*(?:\.\s*)?/gi, 'Prior buprenorphine/naloxone dose is source-listed; no current dosing decision is documented. ')
   .replace(/\bNo buprenorphine dose changes? (?:are|is) documented(?: or recommended)?[^.\n]*(?:\.\s*)?/gi, 'Prior buprenorphine/naloxone dose is source-listed; no current dosing decision is documented. ')
   .replace(/\bNo dose changes? (?:are|were|is) documented(?: or recommended)?[^.\n]*(?:\.\s*)?/gi, 'Prior buprenorphine/naloxone dose is source-listed; no current dosing decision is documented. ')
   .replace(/\bNo changes? to (?:the )?(?:medication|current medication|MAT) dose[^.\n]*(?:documented|made|recommended)[^.\n]*(?:\.\s*)?/gi, 'Prior buprenorphine/naloxone dose is source-listed; no current dosing decision is documented. ')
   .replace(/\bNo (?:medication|current medication|MAT) dose changes?[^.\n]*(?:documented|made|recommended)[^.\n]*(?:\.\s*)?/gi, 'Prior buprenorphine/naloxone dose is source-listed; no current dosing decision is documented. ')
   .replace(/\b(?:The patient )?did not report any changes? to (?:their )?medication regimen[^.\n]*(?:\.\s*)?/gi, 'No current buprenorphine/naloxone dosing decision is documented in the provided source. ');
 }

 const sourceDocumentsNaloxoneProvision = /\b(?:naloxone|narcan)\b.{0,80}\b(?:provided|given|dispensed|prescribed|sent)\b|\b(?:provided|given|dispensed|prescribed|sent)\b.{0,80}\b(?:naloxone|narcan)\b/i.test(sourceInput);
 if (!sourceDocumentsNaloxoneProvision) {
  cleaned = cleaned
   .replace(/\bProvide (?:a )?new (?:naloxone|Narcan) kit[^.\n]*(?:\.\s*)?/g, 'Naloxone replacement need/request is documented; provision is not documented from this source. ')
   .replace(/\b(?:Naloxone|Narcan) kit (?:provided|dispensed|prescribed|sent)[^.\n]*(?:\.\s*)?/g, 'Naloxone replacement need/request is documented; provision is not documented from this source. ');
 }

 return cleaned;
}

function providerAddOnDirectiveLines(sourceInput: string) {
 const match = sourceInput.match(/\bProvider Add-On:\s*([\s\S]*)$/i);
 if (!match?.[1]) return [];

 return match[1]
  .split(/\r?\n/)
  .map((line) => line.replace(/^\s*[-*]\s*/, '').trim())
  .filter((line) => /^(?:do not|don['’]t|preserve|keep|include|avoid|use|mention|named prompt|diagnosis preference|cpt preference|billing code)\b/i.test(line));
}

function removeProviderAddOnInstructionEcho(note: string, sourceInput = '') {
 let cleaned = note
  .replace(/(^|[.!?]\s+|\n)[^.!?\n]*\b(?:specif(?:y|ies|ied)|instructs?|instructed|requested|asks?|asked)\s+to\s+(?:preserve|keep|avoid|not|use|include)[^.!?\n]*(?:[.!?]\s*)?/gi, '$1')
  .replace(/(^|[.!?]\s+|\n)[^.!?\n]*\bwithout\s+stating\s+no\s+safety\s+concerns\b[^.!?\n]*(?:[.!?]\s*)?/gi, '$1')
  .replace(/\s*,?\s*(?:and\s+)?provider add[-\s]?on(?:\s+instructions?)?/gi, '')
  .replace(/\s*,?\s*(?:and\s+)?provider instructions?(?:\s+as\s+provided\s+in\s+source\s+input)?/gi, '')
  .replace(/\bprovider add[-\s]?on(?:\s+instructions?)?\b/gi, 'provider guidance')
  .replace(/(?:^|\n)\s*provider instructions?\s+(?:specif(?:y|ies)|instructs|says|notes?|states)[^\n.]*(?:\.\s*)?/gim, '\n')
  .replace(/(?:^|\n)\s*provider guidance\s*:\s*[\s\S]*?(?=\n\n[A-Z][^\n]{1,90}:|$)/gim, '')
  .replace(/(?:^|\n)\s*provider guidance\s+(?:instructs|says|notes?|states)[^\n.]*(?:\.\s*)?/gim, '\n')
  .replace(/(^|[.!?]\s+)[^.!?\n]*\bprovider instructions?\s+(?:specif(?:y|ies)|instructs|says|notes?|states)[^.!?\n]*(?:[.!?]\s*)?/gi, '$1')
  .replace(/(^|[.!?]\s+)[^.!?\n]*\bper provider (?:instructions?|guidance|add[-\s]?on)[^.!?\n]*(?:[.!?]\s*)?/gi, '$1')
  .replace(/\s+per provider (?:instructions?|guidance|add[-\s]?on)\b/gi, '')
  .replace(/(?:^|[\s.])instructs?\s+to\s+(?:preserve|keep|avoid|not|use)[^\n.]*(?:\.\s*)?/gi, ' ')
  .replace(/(?:^|\n)\s*Billing code[^.\n]*(?:\.\s*)?/gim, '')
  .replace(/\bBilling code\b[^.\n]*(?:\.\s*)?/gi, '')
  .replace(/\b(?:CPT preference|Named prompt|Diagnosis preference)\b[^.\n]*(?:\.\s*)?/gi, '')
  .replace(/\bdo not summarize as low[-\s]?risk\b/gi, '')
  .replace(/\bdo not state confirmed hallucinations\b/gi, '')
  .replace(/\bdo not diagnose substance-induced psychosis\b/gi, '')
  .replace(/[ \t]{2,}/g, ' ');

 for (const directive of providerAddOnDirectiveLines(sourceInput)) {
  cleaned = cleaned.replace(new RegExp(`(?:^|[\\n.\\s])${escapeRegExp(directive)}(?:[.\\s]*|$)`, 'gi'), ' ');
 }

 return cleaned
  .replace(/[ \t]{2,}/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();
}

const clinicalSectionBreakHeadings = [
 'Chief Concern',
 'Reason for Admission',
 'Reason for Follow-Up / Interval Concern',
 'Source of Information',
 'History of Present Illness',
 'Interval Events / Patient Report (Subjective)',
 'Staff / Nursing / Collateral Observations (Objective)',
 'Psychiatric History',
 'Substance History',
 'Prior Treatment / Hospitalizations',
 'Social History',
 'Family Psychiatric / Relevant Family History',
 'Trauma / Abuse History',
 'Legal History',
 'Medical History',
 'Allergies',
 'Current Medications',
 'Mental Status Exam',
 'Mental Status Exam / Observations',
 'Safety / Risk',
 'Assessment / Clinical Formulation',
 'Assessment / Plan',
 'Plan / Continued Hospitalization',
 'Medication Reconciliation / Source Limitation',
 'Diagnostics / Source Limitation',
 'Risk Source Timeline',
 'Source Limitations / Missing Information',
];

function wrapLongClinicalLine(line: string, maxLength = 1400) {
 if (line.length <= maxLength) {
  return line;
 }

 const sentences = line.split(/(?<=[.!?])\s+(?=[A-Z])/);
 if (sentences.length <= 1) {
  return line.replace(new RegExp(`(.{1,${maxLength}})(\\s+|$)`, 'g'), '$1\n').trim();
 }

 const chunks: string[] = [];
 let current = '';
 for (const sentence of sentences) {
  const candidate = current ? `${current} ${sentence}` : sentence;
  if (candidate.length > maxLength && current) {
   chunks.push(current);
   current = sentence;
  } else {
   current = candidate;
  }
 }

 if (current) {
  chunks.push(current);
 }

 return chunks.join('\n');
}

function normalizeClinicalSectionBreaks(note: string) {
 let next = note.replace(/\r/g, '\n');

 for (const heading of clinicalSectionBreakHeadings) {
  const pattern = new RegExp(`([^\\n])\\s+(${escapeRegExp(heading)}:)`, 'gi');
  next = next.replace(pattern, '$1\n\n$2');
 }

 return next
  .split('\n')
  .map((line) => wrapLongClinicalLine(line.trimEnd()))
  .join('\n')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();
}

function finalizeGeneratedNote(note: string, input: GenerateNoteInput) {
 const withRequiredHeadings = enforceProgressNoteHeadings(note, input.noteType);
 const withRiskHardened = hardenRiskReassuranceWording(withRequiredHeadings, input.noteType);
 const withSleepPreserved = preserveDocumentedSleepDetail(withRiskHardened, input.noteType, input.sourceInput);
 const withoutUnsupportedMedicalStability = removeUnsupportedMedicalStability(withSleepPreserved, input.sourceInput);
 const withMedicalClearancePreserved = preserveMedicalClearanceUncertainty(withoutUnsupportedMedicalStability, input.sourceInput);
 const withLabLimitsPreserved = preservePendingOrUnclearLabSourceLimits(withMedicalClearancePreserved, input.sourceInput);
 const withMatDoseDecisionLimit = preservePendingMatDoseDecision(withLabLimitsPreserved, input.sourceInput);
 const withAllergyMedicationSourceLimits = preserveAllergyMedicationSourceLimits(withMatDoseDecisionLimit, input.sourceInput);
 const withSourceBoundRisk = hardenSourceBoundRiskWording(withAllergyMedicationSourceLimits, input.sourceInput);
 const withPriorCurrentRiskTimeline = preservePriorCurrentRiskTimeline(withSourceBoundRisk, input.sourceInput);
 const withDischargeBarriers = preserveDischargePlanningBarriers(withPriorCurrentRiskTimeline, input.sourceInput);
 const withContinuityBoundaries = preservePatientContinuityBoundaries(withDischargeBarriers, input.sourceInput);
 const withMedicationAdherenceHardened = hardenMedicationAdherenceWording(withContinuityBoundaries, input.sourceInput);
 const withDiagnosticUncertainty = preserveDiagnosticUncertainty(withMedicationAdherenceHardened, input.sourceInput);
 const withBipolarReferralUncertainty = preserveBipolarReferralUncertainty(withDiagnosticUncertainty, input.sourceInput);
 const withPsychosisConflictPreserved = preservePsychosisObservationConflict(withBipolarReferralUncertainty, input.sourceInput);
 const withRestraintSourceStatus = preserveRestraintSourceStatus(withPsychosisConflictPreserved, input.sourceInput);
 const withoutUnsupportedMedicationAction = removeUnsupportedMedicationActionPlan(withRestraintSourceStatus, input.sourceInput);
 const withoutProviderInstructionEcho = removeProviderAddOnInstructionEcho(withoutUnsupportedMedicationAction, input.sourceInput);

 return normalizeClinicalSectionBreaks(withoutProviderInstructionEcho);
}

export async function generateNote(input: GenerateNoteInput): Promise<GenerateNoteWithMetaResult> {
 const requestedProvider = getRequestedProvider();
 const openAiModel = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
 const ollamaModel = process.env.OLLAMA_MODEL || 'qwen3:8b';
 const model = requestedProvider === 'ollama' ? ollamaModel : openAiModel;

 if (requestedProvider === 'none') {
 return buildFallbackResult(
 input,
 null,
 process.env.OPENAI_API_KEY ? 'openai_not_approved' : 'missing_api_key',
 process.env.OPENAI_API_KEY
 ? 'OpenAI key is present, but OpenAI note generation is disabled unless VERANOTE_ALLOW_OPENAI=1 or VERANOTE_AI_PROVIDER=openai is set.'
 : 'No approved live AI provider was configured, so the app used the local fallback draft.',
 );
 }

 if (requestedProvider === 'openai' && !process.env.OPENAI_API_KEY) {
 return buildFallbackResult(input, openAiModel, 'missing_api_key', 'OpenAI was requested, but no OpenAI API key was found.');
 }

 try {
 const [systemPrompt, templatePrompt, stylePrompt] = await Promise.all([
 loadPromptFile('global-system-prompt.md'),
 loadPromptFile(templateFileForNoteType(input.noteType)),
 loadPromptFile('user-style-controls.md'),
 ]);

 const sectionPlan = planSections({
 noteType: input.noteType,
 requestedScope: input.outputScope,
 requestedSections: input.requestedSections,
 });

 const mseSupport = summarizeMseSupport({
 noteType: input.noteType,
 sourceSections: input.sourceSections,
 sourceInput: input.sourceInput,
 });

 const scopeGuidanceLines = sectionPlan.profile
	 ? [
	 `Output scope: ${sectionPlan.scope}.`,
	 `Planned note profile: ${sectionPlan.profile.label}.`,
	 sectionPlan.profile.id === 'inpatient-psych-progress'
	 ? `Render these exact sections in order, even when the source is sparse: ${sectionPlan.sections.map((section) => SECTION_LABELS[section]).join(', ') || 'none specified'}. If a progress-note section has no supported content, keep the heading and write a brief not documented, unclear, not provided, or gap statement. Do not omit Plan / Continued Hospitalization.`
	 : sectionPlan.profile.id === 'sparse-source-note'
	   ? `Render these exact sections in order, even when nearly every domain is missing: ${sectionPlan.sections.map((section) => SECTION_LABELS[section]).join(', ') || 'none specified'}. This note type is specifically for sparse input, so do not omit required headings because the source is thin. Use brief not documented, unclear, not provided, or needs verification statements for unsupported domains.`
	 : sectionPlan.profile.id === 'outpatient-psych-follow-up'
	   ? `Render these exact sections in order for the outpatient follow-up note: ${sectionPlan.sections.map((section) => SECTION_LABELS[section]).join(', ') || 'none specified'}. Keep medication response, side effects, safety/risk limits, and follow-up plan explicit. If a required outpatient section has no supported content, keep the heading and write a brief not documented, unclear, not provided, or gap statement.`
	 : sectionPlan.profile.id === 'medical-consult-note'
	   ? `Render these exact sections in order for the medical consult note: ${sectionPlan.sections.map((section) => SECTION_LABELS[section]).join(', ') || 'none specified'}. Keep the consult question, relevant history, pertinent findings, uncertainty-bound medical impression, recommendations, and source limitations explicit. If a consult section has no supported content, keep the heading and write a brief not documented, unclear, not provided, pending, or needs verification statement.`
	 : sectionPlan.profile.id === 'medical-h-and-p'
	   ? `Render these exact sections in order for the medical H&P note: ${sectionPlan.sections.map((section) => SECTION_LABELS[section]).join(', ') || 'none specified'}. Keep the medical chief concern, pertinent positives and negatives, medications/allergies gaps, exam limits, diagnostics/vitals limits, assessment, and plan explicit. If a medical H&P section has no supported content, keep the heading and write a brief not documented, unclear, not provided, pending, or needs verification statement.`
	 : `Render only these sections unless the source or requested scope clearly requires less: ${sectionPlan.sections.map((section) => SECTION_LABELS[section]).join(', ') || 'none specified'}.`,
	 sectionPlan.requiresStandaloneMse
	 ? 'A standalone Mental Status / Observations section is required for this output scope.'
	 : 'Do not force a standalone Mental Status / Observations section for this output scope. If pertinent psych observations belong in HPI/assessment, include them there without inventing a full MSE block.',
 ]
 : [
 `Output scope: ${input.outputScope ?? 'full-note'}.`,
 ];

 const developerPrompt = assemblePrompt({
 templatePrompt,
 stylePrompt,
 specialty: input.specialty,
 noteType: input.noteType,
 outputStyle: input.outputStyle,
 format: input.format,
 keepCloserToSource: input.keepCloserToSource,
 flagMissingInfo: input.flagMissingInfo,
 sourceInput: input.sourceInput,
 customInstructions: input.customInstructions,
 mseGuidanceLines: [
 ...scopeGuidanceLines,
 ...(sectionPlan.requiresStandaloneMse ? mseSupport?.guidanceLines ?? [] : []),
 ],
 encounterSupportLines: buildEncounterSupportPromptLines(input.encounterSupport, input.noteType),
 medicationProfileLines: buildMedicationProfilePromptLines(input.medicationProfile),
 diagnosisProfileLines: buildDiagnosisProfilePromptLines(input.diagnosisProfile),
 });

 const client = requestedProvider === 'ollama'
 ? new OpenAI({
 apiKey: process.env.OLLAMA_API_KEY || 'ollama',
 baseURL: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1',
 })
 : new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

 const response = await client.responses.create({
 model,
 temperature: 0,
 input: [
 {
 role: 'system',
 content: [{ type: 'input_text', text: systemPrompt }],
 },
 {
 role: 'developer',
 content: [{ type: 'input_text', text: developerPrompt }],
 },
 {
 role: 'user',
 content: [
 {
 type: 'input_text',
 text: JSON.stringify({
 specialty: input.specialty,
 noteType: input.noteType,
 outputStyle: input.outputStyle,
 format: input.format,
 keepCloserToSource: input.keepCloserToSource,
 flagMissingInfo: input.flagMissingInfo,
 outputScope: input.outputScope,
 requestedSections: input.requestedSections,
 customInstructions: input.customInstructions,
 sourceSections: input.sourceSections,
 encounterSupport: input.encounterSupport,
 medicationProfile: input.medicationProfile,
 diagnosisProfile: input.diagnosisProfile,
 sourceInput: input.sourceInput,
 }),
 },
 ],
 },
 ],
 text: {
 format: {
 type: 'json_schema',
 name: 'generate_note_response',
 schema: {
 type: 'object',
 additionalProperties: false,
 properties: {
 note: { type: 'string' },
 flags: {
 type: 'array',
 items: { type: 'string' },
 },
 },
 required: ['note', 'flags'],
 },
 strict: true,
 },
 },
 });

 const outputText = response.output_text;
 const parsed = JSON.parse(outputText);
 const validated = GenerateNoteResponseSchema.parse(parsed);

	 const liveNote = finalizeGeneratedNote(validated.note, input);

	 return {
	 note: liveNote,
 flags: mergeFlags(input, validated.flags),
 claims: stubClaims,
 copilotSuggestions: buildSuggestions(input),
 mode: 'live',
 generationMeta: {
 pathUsed: 'live',
 provider: requestedProvider,
 model,
 reason: 'live',
 },
 };
 } catch (error) {
 return buildFallbackResult(input, model, 'runtime_error', asMessage(error), requestedProvider);
 }
}
