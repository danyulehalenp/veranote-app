import type { ProviderMemoryItem } from '@/lib/veranote/memory/memory-types';

const CLINICAL_FACT_PATTERNS = [
  /\b(depressed|anxious|psychotic|hallucinat|delusion|mania|hypomania|paranoia)\b/i,
  /\b(suicid|homicid|self-harm|violent|grave disability)\b/i,
  /\b(sertraline|escitalopram|bupropion|lithium|lamotrigine|quetiapine|olanzapine|aripiprazole)\b/i,
  /\b(mdd|bipolar|ptsd|adhd|schizophrenia|substance use disorder)\b/i,
  /\b(hears voices|responding to internal stimuli|plan to overdose|prior attempt)\b/i,
];

function looksClinicalFactLike(content: string) {
  return CLINICAL_FACT_PATTERNS.some((pattern) => pattern.test(content));
}

function looksLikeStyleInstruction(item: ProviderMemoryItem) {
  return item.category === 'style'
    || item.category === 'structure'
    || item.category === 'phrasing'
    || item.category === 'workflow'
    || item.category === 'template';
}

export function filterMemoryForPrompt(memoryItems: ProviderMemoryItem[]) {
  return memoryItems.filter((item) => {
    if (!looksLikeStyleInstruction(item)) {
      return false;
    }

    if (looksClinicalFactLike(item.content)) {
      return false;
    }

    return true;
  }).slice(0, 5);
}
