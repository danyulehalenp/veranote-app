import { describe, it, expect } from 'vitest';
import { validateClaim, NoteClaim } from '../types/session';

// Test case for a claim marked as supported but has empty source_refs
it('validateClaim - Supported claim with empty source_refs', () => {
    const claim: NoteClaim = {
        claim_id: "1",
        claim_text: "Patient denies missed doses.",
        section: "medications",
        source_refs: [],
        evidence_status: "supported",
        review_required: false
    };

    const errors = validateClaim(claim);
    expect(errors).toContain("Supported claims must have source_refs.");
});

// Test case for a valid supported medication claim
it('validateClaim - Valid supported claim', () => {
    const claim: NoteClaim = {
        claim_id: "2",
        claim_text: "Patient is compliant with their medication regimen.",
        section: "medications",
        source_refs: [
            {
                span_id: "123",
                source_type: "transcript",
                text_excerpt: "No missed doses reported in the last month."
            }
        ],
        evidence_status: "supported",
        review_required: false
    };

    const errors = validateClaim(claim);
    expect(errors.length).toBe(0);
});