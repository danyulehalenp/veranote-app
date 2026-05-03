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
 provider: 'openai' | 'none';
 model: string | null;
 reason: 'live' | 'missing_api_key' | 'runtime_error';
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
 'Interval Events / Patient Report (Subjective)': [/^\s*Interval (?:Events|History).*Subjective\s*:/im, /^\s*Subjective\s*:/im],
 'Staff / Nursing / Collateral Observations (Objective)': [/^\s*Staff \/ Nursing \/ Collateral Observations.*Objective\s*:/im, /^\s*Objective\s*:/im],
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

function removeProviderAddOnInstructionEcho(note: string) {
 return note
  .replace(/\s*,?\s*(?:and\s+)?provider add[-\s]?on(?:\s+instructions?)?/gi, '')
  .replace(/\bprovider add[-\s]?on(?:\s+instructions?)?\b/gi, 'provider guidance')
  .replace(/(?:^|\n)\s*provider guidance\s*:\s*[\s\S]*?(?=\n\n[A-Z][^\n]{1,90}:|$)/gim, '')
  .replace(/(?:^|\n)\s*provider guidance\s+(?:instructs|says|notes?|states)[^\n.]*(?:\.\s*)?/gim, '\n')
  .replace(/(?:^|[\s.])instructs?\s+to\s+(?:preserve|keep|avoid|not|use)[^\n.]*(?:\.\s*)?/gi, ' ')
  .replace(/(?:^|\n)\s*Billing code[^.\n]*(?:\.\s*)?/gim, '')
  .replace(/\bdo not summarize as low[-\s]?risk\b/gi, '')
  .replace(/\bdo not state confirmed hallucinations\b/gi, '')
  .replace(/\bdo not diagnose substance-induced psychosis\b/gi, '')
  .replace(/[ \t]{2,}/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();
}

export async function generateNote(input: GenerateNoteInput): Promise<GenerateNoteWithMetaResult> {
 const apiKey = process.env.OPENAI_API_KEY;
 const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

 if (!apiKey) {
 const fallback = generateMockNote(input.sourceInput, input.noteType, input.flagMissingInfo);
 const fallbackNote = removeProviderAddOnInstructionEcho(hardenRiskReassuranceWording(
  enforceProgressNoteHeadings(fallback.note, input.noteType),
  input.noteType,
 ));
 return {
 ...fallback,
 note: fallbackNote,
 flags: mergeFlags(input, fallback.flags),
 claims: stubClaims,
 copilotSuggestions: buildSuggestions(input),
 mode: 'fallback',
 warning: 'No OpenAI API key found, so the app used the local fallback draft.',
 generationMeta: {
 pathUsed: 'fallback',
 provider: 'none',
 model: model || null,
 reason: 'missing_api_key',
 },
 };
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

 const client = new OpenAI({ apiKey });

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

	 const liveNote = removeProviderAddOnInstructionEcho(hardenRiskReassuranceWording(
	  enforceProgressNoteHeadings(validated.note, input.noteType),
	  input.noteType,
	 ));

	 return {
	 note: liveNote,
 flags: mergeFlags(input, validated.flags),
 claims: stubClaims,
 copilotSuggestions: buildSuggestions(input),
 mode: 'live',
 generationMeta: {
 pathUsed: 'live',
 provider: 'openai',
 model,
 reason: 'live',
 },
 };
 } catch (error) {
 const fallback = generateMockNote(input.sourceInput, input.noteType, input.flagMissingInfo);
 const fallbackNote = removeProviderAddOnInstructionEcho(hardenRiskReassuranceWording(
  enforceProgressNoteHeadings(fallback.note, input.noteType),
  input.noteType,
 ));

 return {
 ...fallback,
 note: fallbackNote,
 flags: mergeFlags(input, fallback.flags),
 claims: stubClaims,
 copilotSuggestions: buildSuggestions(input),
 mode: 'fallback',
 warning: asMessage(error),
 generationMeta: {
 pathUsed: 'fallback',
 provider: 'openai',
 model,
 reason: 'runtime_error',
 },
 };
 }
}
