// generate-note.js

export function generateNote({ sourceInput, evaluatedClaims, mse }) {
   // Assemble and format the final note
   const note = `Clinical Note:\nSource Input: ${sourceInput}\nClaims: ${JSON.stringify(evaluatedClaims)}\nMSE: ${JSON.stringify(mse)}`;
   return note;
}