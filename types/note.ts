export type GenerateNoteRequest = {
  specialty: 'Psychiatry' | 'Therapy' | 'General Medical';
  noteType: string;
  templateId?: string;
  outputStyle: 'Concise' | 'Standard' | 'Polished';
  format: 'Paragraph Style' | 'Labeled Sections' | 'Minimal Headings';
  keepCloserToSource: boolean;
  flagMissingInfo: boolean;
  sourceInput: string;
};

export type GenerateNoteResponse = {
  note: string;
  flags: string[];
  mode?: 'live' | 'fallback';
  warning?: string;
};

export type RewriteNoteRequest = {
  sourceInput: string;
  currentDraft: string;
  noteType: string;
  rewriteMode: 'more-concise' | 'more-formal' | 'closer-to-source' | 'regenerate-full-note';
};

export type RewriteNoteResponse = {
  note: string;
  mode?: 'live' | 'fallback';
  warning?: string;
};
