import type { BetaFeedbackItem, BetaFeedbackStatus, VeraGapType } from '@/types/beta-feedback';

export function inferVeraGapType(question?: string): VeraGapType {
  const normalized = (question || '').toLowerCase();

  if (/(icd|cpt|code|coding|modifier|diagnosis code|billing|dsm)/.test(normalized)) {
    return 'coding-reference';
  }

  if (/(rewrite|revise|less certain|more conservative|change this wording|reword)/.test(normalized)) {
    return 'revision';
  }

  if (/(draft|write|start the note|do the hpi|do the assessment|do the plan|whole note|progress note)/.test(normalized)) {
    return 'drafting';
  }

  if (/(where|how do i|what do i do first|saved drafts|workflow|navigate|find|which page|full review|export)/.test(normalized)) {
    return 'workflow';
  }

  return 'knowledge';
}

export function normalizeVeraGapQuestion(question?: string) {
  return (question || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[?.!]+$/, '');
}

export function summarizeVeraGaps(feedback: BetaFeedbackItem[]) {
  const gaps = feedback.filter((item) => item.metadata?.source === 'vera-gap');
  const grouped = new Map<string, {
    key: string;
    question: string;
    count: number;
    latestAt: string;
    statuses: BetaFeedbackStatus[];
    gapType: VeraGapType;
    sample: BetaFeedbackItem;
  }>();

  for (const item of gaps) {
    const question = item.metadata?.originalQuestion || item.message;
    const key = normalizeVeraGapQuestion(question);
    const existing = grouped.get(key);

    if (existing) {
      existing.count += 1;
      existing.statuses.push(item.status);
      if (new Date(item.createdAt).getTime() > new Date(existing.latestAt).getTime()) {
        existing.latestAt = item.createdAt;
        existing.sample = item;
      }
      continue;
    }

    grouped.set(key, {
      key,
      question,
      count: 1,
      latestAt: item.createdAt,
      statuses: [item.status],
      gapType: item.metadata?.gapType || 'knowledge',
      sample: item,
    });
  }

  return [...grouped.values()].sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }

    return new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime();
  });
}
