// process-note.js

import { extractClaims } from '/Users/danielhale/.openclaw/projects/clinical-documentation-transformer/app-prototype/lib/claims/extract-claims.js';
import { evaluateClaims } from '/Users/danielhale/.openclaw/projects/clinical-documentation-transformer/app-prototype/lib/claims/evaluate-claims.js';
import { extractMSE } from '/Users/danielhale/.openclaw/projects/clinical-documentation-transformer/app-prototype/lib/mse/extract-mse.js';
import { mapMSE } from '/Users/danielhale/.openclaw/projects/clinical-documentation-transformer/app-prototype/lib/mse/map-mse.js';
import { generateNote } from '/Users/danielhale/.openclaw/projects/clinical-documentation-transformer/app-prototype/lib/note/generate-note.js';

console.log('FILE IS RUNNING'); // Added for testing execution

export function processNote(sourceInput) {
    // Initialize the pipeline state object
    const pipelineState = {
        sourceInput,
        claims: [],
        evaluatedClaims: [],
        mse: {
            extracted: [],
            mapped: {},
        },
        finalNote: null,
    };

    // Execute pipeline stages
    pipelineState.claims = extractClaims(pipelineState.sourceInput);
    pipelineState.evaluatedClaims = evaluateClaims(pipelineState.claims);
    pipelineState.mse.extracted = extractMSE(pipelineState.sourceInput);
    pipelineState.mse.mapped = mapMSE(pipelineState.mse.extracted);
    pipelineState.finalNote = generateNote({
        sourceInput: pipelineState.sourceInput,
        evaluatedClaims: pipelineState.evaluatedClaims,
        mse: pipelineState.mse.mapped,
    });

    console.log(pipelineState);  // Output the full pipeline state for verification

    return pipelineState.finalNote;
}