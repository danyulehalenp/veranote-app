// extract-mse.js

export function extractMSE(sourceInput) {
   const phrases = [];
   // Logic to extract MSE-related phrases from sourceInput
   const regex = /\b(flat affect|rapid speech|paranoia|hyperreligious thoughts)\b/g;
   let match;
   while ((match = regex.exec(sourceInput)) !== null) {
       phrases.push({
           phrase: match[0],
           sourceRef: match.index,
       });
   }
   return phrases;
}