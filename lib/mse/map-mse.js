// map-mse.js

export function mapMSE(mseExtracted) {
   const mapped = {};

   mseExtracted.forEach(item => {
       // Basic deterministic mappings based on existing phrases
       let domain;
       if (item.phrase.includes('flat affect')) {
           domain = 'Affect';
       } else if (item.phrase.includes('rapid speech')) {
           domain = 'Speech';
       } else if (item.phrase.includes('paranoia')) {
           domain = 'Thought Content';
       } else if (item.phrase.includes('hyperreligious thoughts')) {
           domain = 'Thought Content';
       }
       // Only map if a valid domain has been identified
       if (domain) {
           if (!mapped[domain]) {
               mapped[domain] = [];
           }
           mapped[domain].push(item.phrase);
       }
   });
   return mapped;
}