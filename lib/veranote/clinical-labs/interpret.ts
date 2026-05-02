import { CLINICAL_LAB_REFERENCES } from '@/lib/veranote/clinical-labs/reference-ranges';
import type {
  ClinicalLabInterpretation,
  ClinicalLabRange,
  ClinicalLabReference,
} from '@/lib/veranote/clinical-labs/types';

export function getClinicalLabReference(refId: string) {
  return CLINICAL_LAB_REFERENCES[refId] ?? null;
}

export function classifyClinicalLabValue(refId: string, value: number | null) {
  if (value === null) {
    return null;
  }

  const ref = getClinicalLabReference(refId);
  if (!ref) {
    return null;
  }

  return ref.ranges.find((range) => {
    const aboveMin = range.min === undefined || value >= range.min;
    const belowMax = range.max === undefined || value <= range.max;
    return aboveMin && belowMax;
  }) ?? null;
}

export function interpretClinicalLabValue(refId: string, value: number | null): ClinicalLabInterpretation | null {
  const reference = getClinicalLabReference(refId);
  if (!reference) {
    return null;
  }

  const range = classifyClinicalLabValue(refId, value);

  return {
    reference,
    range,
    value,
    rangeContext: formatClinicalLabRangeContext(reference),
    classificationText: formatClinicalLabClassification(value, range),
  };
}

export function formatClinicalLabRangeContext(ref: ClinicalLabReference) {
  const rangeText = ref.ranges
    .map((range) => {
      const bounds = formatRangeBounds(range);
      return `${range.label}: ${bounds}. ${range.context}`;
    })
    .join(' ');

  return `${ref.label} range context: ${rangeText}`;
}

function formatClinicalLabClassification(value: number | null, range: ClinicalLabRange | null) {
  if (value === null || !range) {
    return null;
  }

  return `A value of ${value} falls in the general ${range.label.toLowerCase()} category (${range.context})`;
}

function formatRangeBounds(range: ClinicalLabRange) {
  if (range.min !== undefined && range.max !== undefined) {
    return `${range.min}-${range.max} ${range.unit}`;
  }

  if (range.min !== undefined) {
    return `>=${range.min} ${range.unit}`;
  }

  if (range.max !== undefined) {
    return `<=${range.max} ${range.unit}`;
  }

  return range.unit;
}
