import type { NoteClaim } from '@/types/session';

function normalize(text: string): string {
 return text
 .toLowerCase()
 .replace(/[^a-z0-9\s]/g, ' ')
 .replace(/\s+/g, ' ')
 .trim();
}

function hasAny(text: string, phrases: string[]): boolean {
 return phrases.some((phrase) => text.includes(normalize(phrase)));
}

function buildEvidenceText(claim: NoteClaim, sourceInput = ''): string {
 const sourceRefsText = claim.source_refs
 .map((ref) => ref.text_excerpt ?? '')
 .join(' ');

 return normalize(`${sourceRefsText} ${sourceInput}`);
}

export function evaluateClaim(claim: NoteClaim, sourceInput = ''): NoteClaim {
 const claimText = normalize(claim.claim_text);
 const evidenceText = buildEvidenceText(claim, sourceInput);

 if (!evidenceText) {
 return {
 ...claim,
 evidence_status: 'missing',
 review_required: true,
 rationale: 'No source evidence available for this claim.',
 };
 }

 const claimPositiveAdherence = hasAny(claimText, [
 'taking medications as prescribed',
 'medication compliant',
 'compliant with medication',
 'denies missed doses',
 'no missed doses',
 ]);

 const evidencePositiveAdherence = hasAny(evidenceText, [
 'taking medications as prescribed',
 'medication compliant',
 'no missed doses',
 'denies missed doses',
 ]);

 const evidenceNegativeAdherence = hasAny(evidenceText, [
 'missed doses',
 'missing doses',
 'missed medication',
 'out of medication',
 'missed refills',
 'missed medication refills',
 ]);

 if (claimPositiveAdherence && evidenceNegativeAdherence) {
 return {
 ...claim,
 evidence_status: 'contradicted',
 review_required: true,
 rationale: 'Source text conflicts with the claim.',
 };
 }

 if (claimText && evidenceText.includes(claimText)) {
 return {
 ...claim,
 evidence_status: 'supported',
 review_required: false,
 rationale: undefined,
 };
 }

 if (claimPositiveAdherence && evidencePositiveAdherence) {
 return {
 ...claim,
 evidence_status: 'supported',
 review_required: false,
 rationale: undefined,
 };
 }

 const claimInstructionDifficulty = hasAny(claimText, [
 'difficulty understanding medication instructions',
 'struggling with medication instructions',
 'difficulty understanding dosing schedule',
 'difficulty with medication schedule',
 ]);

 const evidenceConfusionAboutMeds =
 hasAny(evidenceText, ['confused', 'confusion', 'unsure']) &&
 hasAny(evidenceText, ['medication', 'dosing', 'dose', 'schedule', 'instructions']);

 if (claimInstructionDifficulty && evidenceConfusionAboutMeds) {
 return {
 ...claim,
 evidence_status: 'inferred',
 review_required: true,
 rationale: 'Claim is a reasonable interpretation of the source text but not directly stated.',
 };
 }

 return {
 ...claim,
 evidence_status: 'missing',
 review_required: true,
 rationale: 'No meaningful support or contradiction found in source text.',
 };
}

export function evaluateClaims(claims: NoteClaim[], sourceInput = ''): NoteClaim[] {
 return claims.map((claim) => evaluateClaim(claim, sourceInput));
}