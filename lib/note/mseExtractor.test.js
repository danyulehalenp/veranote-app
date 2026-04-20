const { extractMSEPhrases, mapMSEPhrases } = require('./mseExtractor');

describe('MSE Extraction and Mapping', () => {

  test('extractMSEPhrases should extract explicit observations', () => {
    const sourceInput = 'The patient presents with flat affect and reports hearing voices.';
    const expectedPhrases = ['flat affect', 'reports hearing voices'];
    const extracted = extractMSEPhrases(sourceInput);
    expect(extracted).toEqual(expect.arrayContaining(expectedPhrases));
  });

  test('mapMSEPhrases should correctly map extracted phrases to domains', () => {
    const phrases = ['speech rapid', 'flat affect'];
    const mapped = mapMSEPhrases(phrases);
    expect(mapped).toHaveProperty('Speech');
    expect(mapped.Speech).toEqual(expect.arrayContaining(['speech rapid']));
    expect(mapped).toHaveProperty('Affect');
    expect(mapped.Affect).toEqual(expect.arrayContaining(['flat affect']));
  });

  test('mapping should not include uncertain phrases', () => {
    const phrases = ['mood dysregulated']; // Not clearly defined
    const mapped = mapMSEPhrases(phrases);
    expect(mapped).toEqual({});
  });

});