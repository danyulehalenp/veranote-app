export type BetaWorkflowDefinition = {
  id: string;
  label: string;
  noteTypes: string[];
  careSettings: string[];
  priority: 'Primary' | 'Secondary';
  reviewFocus: string[];
};

export type BetaCohortSlot = {
  id: string;
  label: string;
  targetRole: string;
  primaryWorkflowIds: string[];
  secondaryWorkflowIds: string[];
  biggestRisk: string;
};

export type BetaIssueCategory =
  | 'trust / hallucination'
  | 'medication truth'
  | 'objective / lab conflict'
  | 'risk wording'
  | 'diagnosis overstatement'
  | 'missing nuance'
  | 'structure / formatting'
  | 'workflow friction'
  | 'speed / convenience'
  | 'customization gap';

export type BetaOutreachStatus =
  | 'target'
  | 'contacted'
  | 'interested'
  | 'scheduled'
  | 'active'
  | 'paused'
  | 'completed'
  | 'declined';
