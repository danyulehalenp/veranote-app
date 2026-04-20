import type { NoteSectionKey, OutputScope } from '@/lib/note/section-profiles';
import { SECTION_LABELS } from '@/lib/note/section-profiles';

type PreferenceDraftInput = {
  noteType: string;
  specialty: string;
  outputDestination: string;
  request: string;
};

export function buildPreferenceAssistantDraft(input: PreferenceDraftInput) {
  const normalizedNoteType = input.noteType.toLowerCase();
  const request = input.request.trim();
  const lines: string[] = [];

  if (normalizedNoteType.includes('evaluation')) {
    lines.push('Keep this evaluation differential-aware, source-close, and explicit about what remains uncertain or still needs clarification.');
  } else if (normalizedNoteType.includes('progress') || normalizedNoteType.includes('follow-up') || normalizedNoteType.includes('day two')) {
    lines.push('Keep this follow-up note concise, clinically useful, and literal about symptom change, medication response, and next-step planning.');
  } else if (normalizedNoteType.includes('discharge')) {
    lines.push('Keep discharge details organized around hospital course, current discharge status, follow-up plan, and risk-sensitive continuity language without inventing stability.');
  } else if (normalizedNoteType.includes('crisis')) {
    lines.push('Keep crisis wording time-aware, safety-specific, and explicit about interventions, disposition boundaries, and current acute versus non-acute risk.');
  } else if (input.specialty === 'Therapy') {
    lines.push('Keep therapy wording restrained, process-aware, and close to the actual interventions, themes, and patient statements documented in source.');
  } else {
    lines.push('Keep the note practical, source-close, and conservative about any detail that is not directly supported by the source material.');
  }

  lines.push('Preserve uncertainty, avoid invented facts, and prefer cleaner organization over more confident language.');

  if (input.outputDestination && input.outputDestination !== 'Generic') {
    lines.push(`Format the final note so it works cleanly in ${input.outputDestination} without changing the clinical meaning.`);
  }

  if (request) {
    lines.push(`Additional provider preference: ${request}`);
  }

  return lines.join(' ');
}

export function buildAssistantPresetName(noteType: string) {
  return `${noteType} Assistant Preset`;
}

export function buildLanePreferencePrompt(input: {
  noteType: string;
  outputScope: OutputScope;
  outputStyle: string;
  format: string;
  requestedSections: NoteSectionKey[];
}) {
  const sectionSummary = input.requestedSections.length
    ? input.requestedSections.map((section) => SECTION_LABELS[section]).join(', ')
    : 'use the default section plan for this note type';

  return [
    `For ${input.noteType}, make this my default note lane setup.`,
    `Use ${input.outputStyle.toLowerCase()} output with ${input.format.toLowerCase()} formatting.`,
    input.outputScope === 'selected-sections'
      ? `When I use selected sections, prefer: ${sectionSummary}.`
      : `Default output scope: ${input.outputScope.replace('-', ' ')}.`,
    'Keep this reusable as a prompt and note preference suggestion, not a silent automatic change.',
  ].join(' ');
}
