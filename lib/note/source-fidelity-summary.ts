import type { SectionEvidenceMap } from '@/lib/note/source-linking';

export type SourceFidelitySeverity = 'info' | 'review' | 'caution';

export type SourceFidelitySection = {
  anchor: string;
  heading: string;
};

export type SourceFidelityReviewItem = {
  id: string;
  category: 'Evidence' | 'Conflict' | 'Risk' | 'Medication' | 'MSE' | 'Missing data';
  severity: SourceFidelitySeverity;
  label: string;
  detail: string;
  targetId: string;
};

export type SourceFidelitySummary = {
  totalSections: number;
  linkedSections: number;
  noEvidenceSections: number;
  weakOnlySections: number;
  confirmedSections: number;
  totalSourceBlocks: number;
  openReviewItems: number;
  statusLabel: string;
  statusDetail: string;
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

function item(input: SourceFidelityReviewItem) {
  return input;
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
    }));
  }

  if (weakOnlySections.length) {
    reviewItems.push(item({
      id: 'section-evidence-weak',
      category: 'Evidence',
      severity: 'review',
      label: `${weakOnlySections.length} section${weakOnlySections.length === 1 ? '' : 's'} only have weak source clues`,
      detail: compactList(weakOnlySections.map((section) => section.heading)),
      targetId: 'source-evidence-layer',
    }));
  }

  if (unconfirmedLinkedSections.length) {
    reviewItems.push(item({
      id: 'section-evidence-unconfirmed',
      category: 'Evidence',
      severity: 'info',
      label: `${unconfirmedLinkedSections.length} linked section${unconfirmedLinkedSections.length === 1 ? '' : 's'} still need reviewer confirmation`,
      detail: 'Suggested links are review aids only until the clinician confirms the source block.',
      targetId: 'source-evidence-layer',
    }));
  }

  unique(input.contradictionFlags || []).slice(0, 3).forEach((flag, index) => {
    reviewItems.push(item({
      id: `source-conflict-${index}`,
      category: 'Conflict',
      severity: 'caution',
      label: 'Source conflict needs preservation',
      detail: flag.replace(/^Possible contradiction:\s*/i, ''),
      targetId: 'source-evidence-layer',
    }));
  });

  unique(input.objectiveConflictBullets || []).slice(0, 3).forEach((bullet, index) => {
    reviewItems.push(item({
      id: `objective-conflict-${index}`,
      category: 'Conflict',
      severity: 'caution',
      label: 'Objective/source mismatch cue',
      detail: bullet,
      targetId: 'objective-warning-layer',
    }));
  });

  unique(input.highRiskWarningLabels || []).slice(0, 3).forEach((label, index) => {
    reviewItems.push(item({
      id: `risk-warning-${index}`,
      category: 'Risk',
      severity: 'caution',
      label: 'Risk wording needs review',
      detail: label,
      targetId: 'high-risk-warning-layer',
    }));
  });

  unique(input.medicationWarningLabels || []).slice(0, 3).forEach((label, index) => {
    reviewItems.push(item({
      id: `medication-warning-${index}`,
      category: 'Medication',
      severity: 'review',
      label: 'Medication facts need verification',
      detail: label,
      targetId: 'medication-warning-layer',
    }));
  });

  unique(input.mseReviewLabels || []).slice(0, 3).forEach((label, index) => {
    reviewItems.push(item({
      id: `mse-review-${index}`,
      category: 'MSE',
      severity: 'review',
      label: 'MSE wording needs source support',
      detail: label,
      targetId: 'terminology-warning-layer',
    }));
  });

  unique(input.missingInfoFlags || []).slice(0, 3).forEach((flag, index) => {
    reviewItems.push(item({
      id: `missing-source-data-${index}`,
      category: 'Missing data',
      severity: 'review',
      label: 'Missing or unclear source item',
      detail: flag,
      targetId: 'source-evidence-layer',
    }));
  });

  reviewItems.sort((left, right) => {
    const severity = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    return severity || left.category.localeCompare(right.category) || left.label.localeCompare(right.label);
  });

  const openReviewItems = reviewItems.filter((reviewItem) => reviewItem.severity !== 'info').length;
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
    statusLabel,
    statusDetail,
    reviewItems,
  };
}
