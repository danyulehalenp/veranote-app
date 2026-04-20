import { generateNote } from '../lib/ai/generate-note';
import { NoteClaim } from '../types/session';

describe('Direct tests for generateNote function', () => {
    it('should return note and valid claims metadata', async () => {
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
        expect(response).toHaveProperty('claims');

        expect(Array.isArray(response.claims)).toBe(true);
        expect(response.claims.length).toBeGreaterThan(0);
        
        const claim: NoteClaim = response.claims[0];
        expect(claim).toHaveProperty('claim_id');
        expect(claim).toHaveProperty('claim_text');
        expect(claim).toHaveProperty('section');
        expect(claim).toHaveProperty('source_refs');
        expect(claim).toHaveProperty('evidence_status');
        expect(claim).toHaveProperty('review_required');

        // Source refs should not be empty for a supported claim
        if (claim.evidence_status === 'supported') {
            expect(claim.source_refs.length).toBeGreaterThan(0);
        }
    });
});