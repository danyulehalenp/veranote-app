export type RequestMetric = {
  timestamp: string;
  route: string;
  model: string;
  latencyMs: number;
  success: boolean;
};

export type ErrorMetric = {
  timestamp: string;
  route: string;
  errorType: string;
  message: string;
};

export type EvalMetric = {
  timestamp: string;
  passed: number;
  failed: number;
};

export type ModelUsageMetric = {
  timestamp: string;
  model: string;
  tokens?: number;
};
