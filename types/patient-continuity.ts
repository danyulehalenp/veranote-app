export type PatientContinuityPrivacyMode = 'neutral-id' | 'patient-name' | 'description-only';

export type PatientContinuityFactCategory =
  | 'active-theme'
  | 'medication'
  | 'risk-safety'
  | 'open-loop'
  | 'prior-intervention'
  | 'source-conflict'
  | 'other';

export type PatientContinuityFactStatus =
  | 'previously-documented'
  | 'needs-confirmation-today'
  | 'conflicts-with-today-source'
  | 'resolved'
  | 'archived';

export interface PatientContinuityFact {
  id: string;
  category: PatientContinuityFactCategory;
  summary: string;
  status: PatientContinuityFactStatus;
  sourceDraftId?: string;
  sourceNoteType?: string;
  sourceDate?: string;
  sourceExcerpt?: string;
  lastConfirmedAt?: string;
}

export interface PatientContinuityRecord {
  id: string;
  providerIdentityId: string;
  patientLabel: string;
  patientDescription?: string;
  privacyMode: PatientContinuityPrivacyMode;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  archivedAt?: string;
  sourceDraftIds: string[];
  sourceNoteTypes: string[];
  lastSourceDate?: string;
  continuityFacts: PatientContinuityFact[];
  todayPrepChecklist: string[];
  recallSummary: string;
  safetySummary?: string;
  medicationSummary?: string;
  openLoopSummary?: string;
}

export interface PatientContinuityInput {
  patientLabel?: string;
  patientDescription?: string;
  privacyMode?: PatientContinuityPrivacyMode;
  sourceDraftId?: string;
  sourceNoteType?: string;
  sourceDate?: string;
  noteText?: string;
  sourceText?: string;
  existingRecord?: PatientContinuityRecord | null;
}

export interface PatientContinuityTodaySignal {
  id: string;
  tone: 'info' | 'review' | 'caution';
  label: string;
  detail: string;
}

export interface PatientContinuitySearchInput {
  query?: string;
  dateFrom?: string;
  dateTo?: string;
  noteType?: string;
  category?: PatientContinuityFactCategory | 'all';
  includeArchived?: boolean;
}
