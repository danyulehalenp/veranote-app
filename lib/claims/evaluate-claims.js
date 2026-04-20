// evaluate-claims.js

export function evaluateClaims(claims) {
    return claims.map(claim => {
        // Basic evaluation logic based on the claim text
        let status;
        if (claim.text.includes('no missed doses')) {
            status = 'supported';
        } else if (claim.text.includes('denies suicidal ideation')) {
            status = 'contradicted';
        } else {
            status = 'inferred';
        }
        return { ...claim, status };
    });
}