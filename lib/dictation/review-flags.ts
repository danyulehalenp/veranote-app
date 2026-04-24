import type { DictationReviewFlagType, TranscriptReviewFlag } from '@/types/dictation';

const FLAG_PATTERNS: Array<{
  flagType: DictationReviewFlagType;
  severity: TranscriptReviewFlag['severity'];
  pattern: RegExp;
  message: string;
  suggestedAction?: string;
}> = [
  {
    flagType: 'negation',
    severity: 'high',
    pattern: /\b(denies?|denied|no|not|without|never)\b/i,
    message: 'Negation language can flip the meaning of psychiatric symptoms or risk statements.',
    suggestedAction: 'Confirm the dictated phrase matches the source meaning exactly.',
  },
  {
    flagType: 'risk_language',
    severity: 'critical',
    pattern: /\b(si|hi|suicid(?:al|e)|self-harm|kill myself|homicid(?:al|e)|violent)\b/i,
    message: 'Risk language should be reviewed before it is used as source truth.',
    suggestedAction: 'Review the exact wording before accepting this segment.',
  },
  {
    flagType: 'medication',
    severity: 'moderate',
    pattern: /\b(lithium|lamotrigine|sertraline|prozac|fluoxetine|abilify|aripiprazole|clonazepam|alprazolam|adderall|vyvanse)\b/i,
    message: 'Medication names were detected in dictated text.',
    suggestedAction: 'Verify medication names, schedules, and changes against the source.',
  },
  {
    flagType: 'dose',
    severity: 'high',
    pattern: /\b\d+(?:\.\d+)?\s?(mg|mcg|g|ml|units?)\b/i,
    message: 'Dose-like wording was detected in dictated text.',
    suggestedAction: 'Confirm the dose and units before inserting.',
  },
  {
    flagType: 'legal_status',
    severity: 'high',
    pattern: /\b(5150|involuntary|hold|commitment|conservatorship|court ordered|probation|custody)\b/i,
    message: 'Legal-status language can change the clinical meaning of the note.',
    suggestedAction: 'Review legal-status wording before it is accepted.',
  },
];

export function detectDictationReviewFlags(text: string): TranscriptReviewFlag[] {
  if (!text.trim()) {
    return [];
  }

  return FLAG_PATTERNS.flatMap((flag) => {
    const match = text.match(flag.pattern);
    if (!match) {
      return [];
    }

    return [{
      flagType: flag.flagType,
      severity: flag.severity,
      matchedText: match[0],
      message: flag.message,
      suggestedAction: flag.suggestedAction,
    }];
  });
}
