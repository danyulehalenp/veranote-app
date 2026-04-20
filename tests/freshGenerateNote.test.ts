import { describe, it, expect } from 'vitest';
import { generateNote } from '../lib/ai/generate-note';

describe('Fresh test for generateNote function', () => {
    it('should return a note object', async () => {
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
        expect(response).toBeDefined();
    });
});