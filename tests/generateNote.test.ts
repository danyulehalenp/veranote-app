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
});