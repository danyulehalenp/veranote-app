'use client';

import { useEffect, useState } from 'react';

export type MonitoringErrorItem = {
  timestamp: string;
  route: string;
  errorType: string;
  message: string;
};

export type MonitoringQueueTaskItem = {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  attempts?: number;
  lastError?: string;
};

export type MonitoringSummary = {
  requestCount: number;
  successCount: number;
  failureCount: number;
  errorCount: number;
  modelUsageCount: number;
  failedTaskCount: number;
  requestsByModel: Record<string, number>;
  modelUsageByModel: Record<string, number>;
  recentErrors: MonitoringErrorItem[];
  recentFailedTasks: MonitoringQueueTaskItem[];
};

export type EvalMetric = {
  timestamp: string;
  passed: number;
  failed: number;
};

export type EvalMetricsResponse = {
  evalHistory: EvalMetric[];
  latest: EvalMetric | null;
};

type HookState<T> = {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
  });

  const data = await response.json() as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Request failed for ${url}`);
  }

  return data;
}

function useMonitoringResource<T>(url: string): HookState<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      const next = await fetchJson<T>(url);
      setData(next);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load monitoring data.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isCancelled = false;

    async function loadWithGuard() {
      try {
        const next = await fetchJson<T>(url);
        if (!isCancelled) {
          setData(next);
          setError(null);
        }
      } catch (loadError) {
        if (!isCancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load monitoring data.');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadWithGuard();
    const intervalId = window.setInterval(() => {
      void loadWithGuard();
    }, 30000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [url]);

  return {
    data,
    isLoading,
    error,
    refresh: load,
  };
}

export function useMonitoringSummary() {
  return useMonitoringResource<MonitoringSummary>('/api/monitoring/summary');
}

export function useEvalMetrics() {
  return useMonitoringResource<EvalMetricsResponse>('/api/monitoring/evals');
}
