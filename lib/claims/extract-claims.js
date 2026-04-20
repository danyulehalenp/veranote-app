// extract-claims.js

export function extractClaims(sourceInput) {
    const claims = [];
    // Logic to extract explicit claims from sourceInput
    const regex = /\b(patient shows no missed doses|denies suicidal ideation|reports feeling anxious)\b/g;
    let match;
    while ((match = regex.exec(sourceInput)) !== null) {
        claims.push({
            text: match[0],
            sourceRef: match.index // Store the index as reference
        });
    }
    return claims;
}