import {
  getOutputDestinationFieldTargets,
  getOutputDestinationMeta,
  type OutputDestination,
  type OutputNoteFocus,
} from '@/lib/veranote/output-destinations';

export type DictationInsertionWorkflowProfile = {
  destination: OutputDestination;
  destinationLabel: string;
  speechBoxMode: 'floating-source-box' | 'floating-field-box';
  supportsDirectFieldInsertion: boolean;
  directFieldGuidance: string;
  fieldTargets: Array<{
    id: string;
    label: string;
    note: string;
  }>;
};

export function buildDictationInsertionWorkflowProfile(
  destination: OutputDestination,
  noteFocus: OutputNoteFocus = 'general',
) {
  const meta = getOutputDestinationMeta(destination);
  const fieldTargets = getOutputDestinationFieldTargets(destination, noteFocus);
  const supportsDirectFieldInsertion = destination !== 'Generic';

  return {
    destination,
    destinationLabel: meta.label,
    speechBoxMode: supportsDirectFieldInsertion ? 'floating-field-box' : 'floating-source-box',
    supportsDirectFieldInsertion,
    directFieldGuidance: supportsDirectFieldInsertion
      ? `Aim the speech box at named ${meta.label} note fields one at a time, starting with ${fieldTargets[0]?.label || 'the main note body'}.`
      : 'Keep the speech box in source-capture mode and move text into the destination note after review.',
    fieldTargets: fieldTargets.map((target) => ({
      id: target.id,
      label: target.label,
      note: target.note,
    })),
  } satisfies DictationInsertionWorkflowProfile;
}
