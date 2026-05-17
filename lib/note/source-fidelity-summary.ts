import type { SectionEvidenceMap } from '@/lib/note/source-linking';
import type { SourceFidelityReviewState, SourceFidelityReviewStatus } from '@/types/session';

export type SourceFidelitySeverity = 'info' | 'review' | 'caution';

export type SourceFidelitySection = {
  anchor: string;
  heading: string;
};

export type SourceFidelityReviewItem = {
  id: string;
  category: 'Evidence' | 'Conflict' | 'Continuity' | 'Risk' | 'Medication' | 'MSE' | 'Missing data';
  severity: SourceFidelitySeverity;
  label: string;
  detail: string;
  targetId: string;
  reviewStatus: SourceFidelityReviewStatus;
  reviewedAt?: string;
};

export type SourceFidelityChecklistTone = 'supported' | 'review' | 'caution';

export type SourceFidelityChecklistItem = {
  id: 'supported-sections' | 'source-gaps' | 'source-conflicts' | 'safety-wording';
  label: string;
  value: string;
  detail: string;
  tone: SourceFidelityChecklistTone;
};

export type SourceFidelitySummary = {
  totalSections: number;
  linkedSections: number;
  noEvidenceSections: number;
  weakOnlySections: number;
  confirmedSections: number;
  totalSourceBlocks: number;
  openReviewItems: number;
  reviewedReviewItems: number;
  dismissedReviewItems: number;
  statusLabel: string;
  statusDetail: string;
  evidenceChecklist: SourceFidelityChecklistItem[];
  reviewItems: SourceFidelityReviewItem[];
};

type BuildSourceFidelitySummaryInput = {
  sections: SourceFidelitySection[];
  evidenceMap: SectionEvidenceMap;
  confirmedEvidenceBySection?: Record<string, string[]>;
  totalSourceBlocks: number;
  missingInfoFlags?: string[];
  contradictionFlags?: string[];
  objectiveConflictBullets?: string[];
  highRiskWarningLabels?: string[];
  medicationWarningLabels?: string[];
  mseReviewLabels?: string[];
  continuityFlags?: string[];
  reviewState?: SourceFidelityReviewState;
};

const SEVERITY_ORDER: Record<SourceFidelitySeverity, number> = {
  caution: 0,
  review: 1,
  info: 2,
};

function unique(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function compactList(items: string[], max = 3) {
  const compacted = unique(items).slice(0, max);
  const remaining = Math.max(unique(items).length - compacted.length, 0);
  return remaining ? `${compacted.join('; ')}; +${remaining} more` : compacted.join('; ');
}

function item(input: Omit<SourceFidelityReviewItem, 'reviewStatus' | 'reviewedAt'>, reviewState?: SourceFidelityReviewState) {
  const entry = reviewState?.[input.id];

  return {
    ...input,
    reviewStatus: entry?.status || 'open',
    reviewedAt: entry?.updatedAt,
  } satisfies SourceFidelityReviewItem;
}

function isOpenSafetyItem(reviewItem: SourceFidelityReviewItem) {
  return reviewItem.severity !== 'info'
    && reviewItem.reviewStatus !== 'reviewed'
    && reviewItem.reviewStatus !== 'dismissed';
}

export function buildSourceFidelitySummary(input: BuildSourceFidelitySummaryInput): SourceFidelitySummary {
  const sections = input.sections;
  const confirmedEvidenceBySection = input.confirmedEvidenceBySection || {};
  const noEvidenceSections = sections.filter((section) => !(input.evidenceMap[section.anchor]?.links.length));
  const linkedSections = sections.filter((section) => input.evidenceMap[section.anchor]?.links.length);
  const weakOnlySections = linkedSections.filter((section) => {
    const links = input.evidenceMap[section.anchor]?.links || [];
    return links.length > 0 && links.every((link) => link.signal === 'weak-overlap');
  });
  const confirmedSections = sections.filter((section) => (confirmedEvidenceBySection[section.anchor] || []).length > 0);
  const unconfirmedLinkedSections = linkedSections.filter((section) => !(confirmedEvidenceBySection[section.anchor] || []).length);

  const reviewItems: SourceFidelityReviewItem[] = [];

  if (noEvidenceSections.length) {
    reviewItems.push(item({
      id: 'section-evidence-missing',
      category: 'Evidence',
      severity: 'review',
      label: `${noEvidenceSections.length} section${noEvidenceSections.length === 1 ? '' : 's'} without linked source`,
      detail: compactList(noEvidenceSections.map((section) => section.heading)),
      targetId: 'source-evidence-layer',
    }, input.reviewState));
  }

  if (weakOnlySections.length) {
    reviewItems.push(item({
      id: 'section-evidence-weak',
      category: 'Evidence',
      severity: 'review',
      label: `${weakOnlySections.length} section${weakOnlySections.length === 1 ? '' : 's'} only have weak source clues`,
      detail: compactList(weakOnlySections.map((section) => section.heading)),
      targetId: 'source-evidence-layer',
    }, input.reviewState));
  }

  if (unconfirmedLinkedSections.length) {
    reviewItems.push(item({
      id: 'section-evidence-unconfirmed',
      category: 'Evidence',
      severity: 'info',
      label: `${unconfirmedLinkedSections.length} linked section${unconfirmedLinkedSections.length === 1 ? '' : 's'} still need reviewer confirmation`,
      detail: 'Suggested links are review aids only until the clinician confirms the source block.',
      targetId: 'source-evidence-layer',
    }, input.reviewState));
  }

  unique(input.contradictionFlags || []).slice(0, 3).forEach((flag, index) => {
    reviewItems.push(item({
      id: `source-conflict-${index}`,
      category: 'Conflict',
      severity: 'caution',
      label: 'Source conflict needs preservation',
      detail: flag.replace(/^Possible contradiction:\s*/i, ''),
      targetId: 'source-evidence-layer',
    }, input.reviewState));
  });

  unique(input.objectiveConflictBullets || []).slice(0, 3).forEach((bullet, index) => {
    reviewItems.push(item({
      id: `objective-conflict-${index}`,
      category: 'Conflict',
      severity: 'caution',
      label: 'Objective/source mismatch cue',
      detail: bullet,
      targetId: 'objective-warning-layer',
    }, input.reviewState));
  });

  unique(input.continuityFlags || []).slice(0, 3).forEach((flag, index) => {
    reviewItems.push(item({
      id: `continuity-review-${index}`,
      category: 'Continuity',
      severity: 'review',
      label: 'Prior context needs today verification',
      detail: flag,
      targetId: 'source-evidence-layer',
    }, input.reviewState));
  });

  unique(input.highRiskWarningLabels || []).slice(0, 3).forEach((label, index) => {
    reviewItems.push(item({
      id: `risk-warning-${index}`,
      category: 'Risk',
      severity: 'caution',
      label: 'Risk wording needs review',
      detail: label,
      targetId: 'high-risk-warning-layer',
    }, input.reviewState));
  });

  unique(input.medicationWarningLabels || []).slice(0, 3).forEach((label, index) => {
    reviewItems.push(item({
      id: `medication-warning-${index}`,
      category: 'Medication',
      severity: 'review',
      label: 'Medication facts need verification',
      detail: label,
      targetId: 'medication-warning-layer',
    }, input.reviewState));
  });

  unique(input.mseReviewLabels || []).slice(0, 3).forEach((label, index) => {
    reviewItems.push(item({
      id: `mse-review-${index}`,
      category: 'MSE',
      severity: 'review',
      label: 'MSE wording needs source support',
      detail: label,
      targetId: 'terminology-warning-layer',
    }, input.reviewState));
  });

  unique(input.missingInfoFlags || []).slice(0, 3).forEach((flag, index) => {
    reviewItems.push(item({
      id: `missing-source-data-${index}`,
      category: 'Missing data',
      severity: 'review',
      label: 'Missing or unclear source item',
      detail: flag,
      targetId: 'source-evidence-layer',
    }, input.reviewState));
  });

  reviewItems.sort((left, right) => {
    const severity = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    return severity || left.category.localeCompare(right.category) || left.label.localeCompare(right.label);
  });

  const openReviewItems = reviewItems.filter(isOpenSafetyItem).length;
  const reviewedReviewItems = reviewItems.filter((reviewItem) => reviewItem.reviewStatus === 'reviewed').length;
  const dismissedReviewItems = reviewItems.filter((reviewItem) => reviewItem.reviewStatus === 'dismissed').length;
  const openConflictItems = reviewItems.filter((reviewItem) => (
    isOpenSafetyItem(reviewItem)
    && (reviewItem.category === 'Conflict' || reviewItem.category === 'Continuity')
  ));
  const openMissingDataItems = reviewItems.filter((reviewItem) => (
    isOpenSafetyItem(reviewItem)
    && reviewItem.category === 'Missing data'
  ));
  const openSafetyWordingItems = reviewItems.filter((reviewItem) => (
    isOpenSafetyItem(reviewItem)
    && (reviewItem.category === 'Risk' || reviewItem.category === 'Medication' || reviewItem.category === 'MSE')
  ));
  const sourceGapCount = noEvidenceSections.length + weakOnlySections.length + openMissingDataItems.length;
  const evidenceChecklist: SourceFidelityChecklistItem[] = [
    {
      id: 'supported-sections',
      label: 'Supported sections',
      value: `${confirmedSections.length}/${sections.length || 0}`,
      detail: sections.length
        ? `${linkedSections.length} have suggested links; ${confirmedSections.length} confirmed by reviewer.`
        : 'Generate a draft before source support can be checked.',
      tone: sections.length > 0 && confirmedSections.length === sections.length ? 'supported' : 'review',
    },
    {
      id: 'source-gaps',
      label: 'Source gaps',
      value: String(sourceGapCount),
      detail: sourceGapCount
        ? 'Missing, weak, or unclear source support needs a clinician look.'
        : 'No missing or weak source-support cues are currently surfaced.',
      tone: sourceGapCount ? 'review' : 'supported',
    },
    {
      id: 'source-conflicts',
      label: 'Conflicts',
      value: String(openConflictItems.length),
      detail: openConflictItems.length
        ? 'Preserve patient, collateral, staff, and chart conflicts instead of flattening them.'
        : 'No active source conflicts are currently surfaced.',
      tone: openConflictItems.length ? 'caution' : 'supported',
    },
    {
      id: 'safety-wording',
      label: 'Safety wording',
      value: String(openSafetyWordingItems.length),
      detail: openSafetyWordingItems.length
        ? 'Risk, medication, or MSE wording needs source-faithful review.'
        : 'No active risk, medication, or MSE wording cues are currently surfaced.',
      tone: openSafetyWordingItems.length ? 'caution' : 'supported',
    },
  ];
  const statusLabel = openReviewItems
    ? `${openReviewItems} source safety item${openReviewItems === 1 ? '' : 's'}`
    : linkedSections.length === sections.length && sections.length > 0
      ? 'Source trace ready'
      : 'Source trace starting';

  const statusDetail = sections.length
    ? `${linkedSections.length}/${sections.length} draft section${sections.length === 1 ? '' : 's'} have suggested source links; ${confirmedSections} confirmed by reviewer.`
    : 'No draft sections were detected yet.';

  return {
    totalSections: sections.length,
    linkedSections: linkedSections.length,
    noEvidenceSections: noEvidenceSections.length,
    weakOnlySections: weakOnlySections.length,
    confirmedSections: confirmedSections.length,
    totalSourceBlocks: input.totalSourceBlocks,
    openReviewItems,
    reviewedReviewItems,
    dismissedReviewItems,
    statusLabel,
    statusDetail,
    evidenceChecklist,
    reviewItems,
  };
}
