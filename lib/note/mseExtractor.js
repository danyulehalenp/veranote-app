// MSE Extraction Function

const MSE_DOMAINS = [
  'Appearance',
  'Behavior',
  'Speech',
  'Mood',
  'Affect',
  'Thought Process',
  'Thought Content',
  'Perception',
  'Cognition',
  'Insight',
  'Judgment'
];

// Function to extract explicit observation phrases
function extractMSEPhrases(sourceInput) {
  const phrases = [];

  // Logic to scan sourceInput and extract explicit observations
  // Example pseudocode:
  const regex = /\b(patient pacing|speech rapid|flat affect|reports hearing voices)\b/g;
  let match;
 while ((match = regex.exec(sourceInput)) !== null) {
    phrases.push(match[0]);
  }

  return phrases;
}

// Function to map extracted phrases to MSE domains
function mapMSEPhrases(phrases) {
  const mapped = {};

  phrases.forEach(phrase => {
    // Determine the domain based on controlled mapping rules
    let domain;
    if (/speech rapid/.test(phrase)) {
      domain = 'Speech';
    } else if (/flat affect/.test(phrase)) {
      domain = 'Affect';
    } // Add more mappings based on context

    // Assign to mapped structure only if domain is identified
    if (domain) {
      if (!mapped[domain]) {
        mapped[domain] = [];
      }
      mapped[domain].push(phrase);
    }
  });

  return mapped;
}

module.exports = { extractMSEPhrases, mapMSEPhrases };