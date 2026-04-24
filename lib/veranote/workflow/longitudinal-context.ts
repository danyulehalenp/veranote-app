import type { LongitudinalContextSummary } from '@/lib/veranote/workflow/workflow-types';

function hasMatch(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

export function summarizeTrends(previousNotes: string[]): LongitudinalContextSummary {
  const normalizedNotes = previousNotes
    .map((note) => note.trim())
    .filter(Boolean)
    .slice(-5);

  if (!normalizedNotes.length) {
    return {
      symptomTrends: [],
      riskTrends: [],
      responseToTreatment: [],
      recurringIssues: [],
    };
  }

  const symptomTrends: string[] = [];
  const riskTrends: string[] = [];
  const responseToTreatment: string[] = [];
  const recurringIssues: string[] = [];

  const anxiousCount = normalizedNotes.filter((note) => /\b(anxiety|anxious|panic)\b/i.test(note)).length;
  const psychosisCount = normalizedNotes.filter((note) => /\b(psychosis|hallucinat|internally preoccupied|paranoid)\b/i.test(note)).length;
  const substanceCount = normalizedNotes.filter((note) => /\b(substance|alcohol|opioid|cannabis|meth|fentanyl|kratom|tianeptine)\b/i.test(note)).length;

  if (anxiousCount >= 2) {
    symptomTrends.push('Anxiety-related symptoms recur across multiple recent notes.');
  }
  if (psychosisCount >= 2) {
    symptomTrends.push('Psychosis-related observations recur across multiple recent notes.');
  }
  if (substanceCount >= 2) {
    recurringIssues.push('Substance-related concerns recur across recent documentation.');
  }

  const acuteRiskCount = normalizedNotes.filter((note) => /\b(suicid(?:al|e)?|self-harm|overdose|unable to contract for safety|unsafe if discharged)\b/i.test(note)).length;
  const denialCount = normalizedNotes.filter((note) => /\b(denies si|denies hi|no self-harm|no suicidal ideation)\b/i.test(note)).length;

  if (acuteRiskCount >= 2) {
    riskTrends.push('Acute safety language appears across multiple recent notes.');
  }
  if (acuteRiskCount && denialCount) {
    riskTrends.push('Risk documentation varies across recent notes and may need temporal clarification.');
  }

  const improvementCount = normalizedNotes.filter((note) => /\b(improved|better|calmer|sleeping better|eating better)\b/i.test(note)).length;
  const worseningCount = normalizedNotes.filter((note) => /\b(worse|worsening|decompensat|returned to ed|relapse|failed outpatient)\b/i.test(note)).length;
  const adherenceCount = normalizedNotes.filter((note) => /\b(adherent|taking medication|continued medication|benefit from therapy)\b/i.test(note)).length;

  if (improvementCount >= 2 && worseningCount === 0) {
    responseToTreatment.push('Recent notes include repeated partial-improvement language.');
  }
  if (worseningCount >= 2) {
    responseToTreatment.push('Recent notes show recurrent worsening or failed stabilization attempts.');
  }
  if (adherenceCount >= 2) {
    responseToTreatment.push('Treatment-engagement language appears repeatedly across recent notes.');
  }

  const recurringMseGap = normalizedNotes.filter((note) => !hasMatch(note, [/\b(mood|affect|thought process|speech|insight|judgment)\b/i])).length;
  if (recurringMseGap >= 2) {
    recurringIssues.push('Recent notes repeatedly omit core MSE domains.');
  }

  return {
    symptomTrends,
    riskTrends,
    responseToTreatment,
    recurringIssues,
  };
}
