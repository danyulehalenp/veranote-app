import OpenAI from 'openai';
import { assemblePrompt } from '@/lib/ai/assemble-prompt';
import { loadPromptFile } from '@/lib/ai/prompt-loader';
import { generateMockNote } from '@/lib/ai/mock-generate';
import { buildCopilotSuggestions, extractContradictionFlags, extractMissingInfoFlags } from '@/lib/ai/source-analysis';
import { summarizeMseSupport } from '@/lib/ai/mse-support';
import { buildDiagnosisProfilePromptLines } from '@/lib/note/diagnosis-profile';
import { buildEncounterSupportPromptLines } from '@/lib/note/encounter-support';
import { buildMedicationProfilePromptLines } from '@/lib/note/medication-profile';
import { planSections } from '@/lib/note/section-profiles';
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

 if (normalized.includes('discharge')) {
 return 'inpatient-psych-discharge-summary.md';
 }

 if (normalized.includes('crisis')) {
 return 'psychiatry-follow-up.md';
 }

 if (normalized.includes('medical h&p')) {
 return 'psych-admission-medical-hp.md';
 }

 if (normalized.includes('consultation')) {
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

export async function generateNote(input: GenerateNoteInput): Promise<GenerateNoteWithMetaResult> {
 const apiKey = process.env.OPENAI_API_KEY;
 const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

 if (!apiKey) {
 const fallback = generateMockNote(input.sourceInput, input.noteType, input.flagMissingInfo);
 return {
 ...fallback,
 flags: mergeFlags(input, fallback.flags),
 claims: stubClaims,
 copilotSuggestions: buildSuggestions(input),
 mode: 'fallback',
 warning: 'No OpenAI API key found, so the app used the local fallback draft.',
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
 `Render only these sections unless the source or requested scope clearly requires less: ${sectionPlan.sections.join(', ') || 'none specified'}.`,
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

 return {
 note: validated.note,
 flags: mergeFlags(input, validated.flags),
 claims: stubClaims,
 copilotSuggestions: buildSuggestions(input),
 mode: 'live',
 };
 } catch (error) {
 const fallback = generateMockNote(input.sourceInput, input.noteType, input.flagMissingInfo);

 return {
 ...fallback,
 flags: mergeFlags(input, fallback.flags),
 claims: stubClaims,
 copilotSuggestions: buildSuggestions(input),
 mode: 'fallback',
 warning: asMessage(error),
 };
 }
}
