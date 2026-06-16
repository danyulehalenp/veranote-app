import { describe, it, expect } from 'vitest';
import { generateNote } from '../lib/ai/generate-note';

describe('Integration test for generateNote function', () => {
    it('returns valid note', async () => {
        const mockInput = {
            specialty: 'Psychiatry',
            noteType: 'Psychiatric Follow-Up',
            outputStyle: 'Standard',
            format: 'Labeled Sections',
            keepCloserToSource: true,
            flagMissingInfo: true,
            sourceInput: 'Patient shows no missed doses.',
        }; 

        const response = await generateNote(mockInput);
        expect(response).toHaveProperty('note');
    });

    it('hardens vague adherence wording when missed doses are documented', async () => {
        const response = await generateNote({
            specialty: 'Psychiatry',
            noteType: 'Psychiatric Follow-Up',
            outputStyle: 'Standard',
            format: 'Labeled Sections',
            keepCloserToSource: true,
            flagMissingInfo: true,
            sourceInput: [
                'Patient reports medication adherence is not perfect.',
                'Patient missed two doses of sertraline this week.',
            ].join(' '),
        });

        expect(response.note).toContain('missed medication doses are documented');
        expect(response.note).not.toMatch(/adherence is not perfect/i);
    });
});
