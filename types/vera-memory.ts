export type VeraMemoryCategory =
  | 'relationship'
  | 'accepted-preference'
  | 'observed-workflow'
  | 'safety';

export type VeraMemoryLedgerItem = {
  id: string;
  category: VeraMemoryCategory;
  label: string;
  detail: string;
  source: 'provider-settings' | 'assistant-learning';
  status: 'active' | 'accepted' | 'observed';
  confidence: 'emerging' | 'established' | 'strong';
  originSummary: string;
  reinforcementSummary?: string;
  lastUpdatedAt?: string;
};

export type VeraMemoryLedger = {
  providerId: string;
  generatedAt: string;
  items: VeraMemoryLedgerItem[];
};
