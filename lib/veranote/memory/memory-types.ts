export type ProviderMemoryCategory =
  | 'style'
  | 'structure'
  | 'phrasing'
  | 'workflow'
  | 'template';

export type ProviderMemoryConfidence = 'low' | 'medium' | 'high';
export type ProviderMemorySource = 'learned' | 'manual';

export type ProviderMemoryItem = {
  id: string;
  providerId: string;
  category: ProviderMemoryCategory;
  content: string;
  tags: string[];
  confidence: ProviderMemoryConfidence;
  source: ProviderMemorySource;
  createdAt: string;
  updatedAt: string;
};

export type ProviderMemoryResolveContext = {
  intent?: string;
  noteType?: string;
  tags?: string[];
};

export type ProviderMemoryCandidate = ProviderMemoryItem & {
  rationale?: string;
};
