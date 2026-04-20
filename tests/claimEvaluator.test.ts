import { describe, it, expect } from 'vitest';
import type { NoteClaim } from '@/types/session';
import { evaluateClaim } from '@/lib/note/claim-evaluator';

function makeClaim(
 claim_text: string,
 text_excerpt: string
): NoteClaim {
 return {
 claim_id: 'test-1',
 claim_text,
 section: 'medications',
 source_refs: [
 {
 span_id: 'src-1',
 source_type: 'transcript',
 text_excerpt,
 },
 ],
 evidence_status: 'missing',
 review_required: true,
 };
}

describe('evaluateClaim', () => {
 it('classifies a supported claim', () => {
 const claim = makeClaim(
 'Patient reports taking medications as prescribed.',
 'Patient reports taking medications as prescribed.'
 );

 const result = evaluateClaim(claim);

 expect(result.evidence_status).toBe('supported');
 expect(result.review_required).toBe(false);
 });

 it('classifies an inferred claim', () => {
 const claim = makeClaim(
 'Patient may have difficulty understanding medication instructions.',
 'Patient appeared confused when describing the dosing schedule.'
 );

 const result = evaluateClaim(claim);

 expect(result.evidence_status).toBe('inferred');
 expect(result.review_required).toBe(true);
 });

 it('classifies a contradicted claim', () => {
 const claim = makeClaim(
 'Patient denies missed doses.',
 'Patient reports missing doses twice this week.'
 );

 const result = evaluateClaim(claim);

 expect(result.evidence_status).toBe('contradicted');
 expect(result.review_required).toBe(true);
 });

 it('classifies a missing claim', () => {
 const claim = makeClaim(
 'No history of anxiety is reported.',
 'Patient discussed sleep problems.'
 );

 const result = evaluateClaim(claim);

 expect(result.evidence_status).toBe('missing');
 expect(result.review_required).toBe(true);
 });
});