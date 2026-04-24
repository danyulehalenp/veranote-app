import { beforeEach, describe, expect, it, vi } from 'vitest';

type AsyncTaskRow = {
  id: string;
  type: string | null;
  payload: Record<string, unknown> | null;
  status: string | null;
  created_at: string | null;
  attempts?: number | null;
  last_error?: string | null;
  updated_at?: string | null;
};

type FakeDb = {
  async_tasks: AsyncTaskRow[];
  model_usage: Array<Record<string, unknown>>;
};

let fakeDb: FakeDb;

function buildRowMatcher(field: string, expected: unknown) {
  return (row: Record<string, unknown>) => row[field] === expected;
}

class FakeQueryBuilder {
  private op: 'select' | 'update' | 'delete' | 'insert' | null = null;

  private filters: Array<(row: Record<string, unknown>) => boolean> = [];

  private sortField: string | null = null;

  private sortAscending = true;

  private rowLimit: number | null = null;

  private updatePayload: Record<string, unknown> | null = null;

  private insertPayload: Record<string, unknown> | Record<string, unknown>[] | null = null;

  private maybeSingleMode = false;

  private selectOptions: { count?: string; head?: boolean } | undefined;

  constructor(
    private readonly db: FakeDb,
    private readonly table: keyof FakeDb,
  ) {}

  select(_columns: string, options?: { count?: string; head?: boolean }) {
    this.op = 'select';
    this.selectOptions = options;
    return this;
  }

  update(values: Record<string, unknown>) {
    this.op = 'update';
    this.updatePayload = values;
    return this;
  }

  delete() {
    this.op = 'delete';
    return this;
  }

  insert(values: Record<string, unknown> | Record<string, unknown>[]) {
    this.op = 'insert';
    this.insertPayload = values;
    return this;
  }

  eq(field: string, expected: unknown) {
    this.filters.push(buildRowMatcher(field, expected));
    return this;
  }

  lt(field: string, expected: unknown) {
    this.filters.push((row) => {
      const value = row[field];
      return typeof value === 'string' && typeof expected === 'string'
        ? value < expected
        : false;
    });
    return this;
  }

  order(field: string, options: { ascending: boolean }) {
    this.sortField = field;
    this.sortAscending = options.ascending;
    return this;
  }

  limit(count: number) {
    this.rowLimit = count;
    return this;
  }

  maybeSingle() {
    this.maybeSingleMode = true;
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
    if (this.op === 'insert') {
      const rows = Array.isArray(this.insertPayload) ? this.insertPayload : [this.insertPayload];
      for (const row of rows) {
        if (row) {
          (this.db[this.table] as Array<Record<string, unknown>>).push(structuredClone(row));
        }
      }
      return { data: rows, error: null };
    }

    const tableRows = this.db[this.table] as Array<Record<string, unknown>>;
    let matchedRows = tableRows.filter((row) => this.filters.every((filter) => filter(row)));

    if (this.sortField) {
      const sortField = this.sortField;
      matchedRows = [...matchedRows].sort((left, right) => {
        const leftValue = left[sortField];
        const rightValue = right[sortField];
        if (leftValue === rightValue) {
          return 0;
        }
        if (leftValue == null) {
          return this.sortAscending ? -1 : 1;
        }
        if (rightValue == null) {
          return this.sortAscending ? 1 : -1;
        }
        return (leftValue < rightValue ? -1 : 1) * (this.sortAscending ? 1 : -1);
      });
    }

    if (typeof this.rowLimit === 'number') {
      matchedRows = matchedRows.slice(0, this.rowLimit);
    }

    if (this.op === 'select') {
      if (this.selectOptions?.head && this.selectOptions?.count === 'exact') {
        return { data: null, error: null, count: tableRows.filter((row) => this.filters.every((filter) => filter(row))).length };
      }

      if (this.maybeSingleMode) {
        return { data: matchedRows[0] || null, error: null };
      }

      return { data: matchedRows, error: null };
    }

    if (this.op === 'update') {
      for (const row of tableRows) {
        if (this.filters.every((filter) => filter(row))) {
          Object.assign(row, this.updatePayload);
        }
      }
      return { data: null, error: null };
    }

    if (this.op === 'delete') {
      const idsToDelete = new Set(matchedRows.map((row) => row.id));
      const keptRows = tableRows.filter((row) => !idsToDelete.has(row.id));
      this.db[this.table] = keptRows as never;
      return { data: null, error: null };
    }

    throw new Error('Unsupported fake query operation.');
  }
}

function createFakeSupabase(db: FakeDb) {
  return {
    from(table: keyof FakeDb) {
      return new FakeQueryBuilder(db, table);
    },
  };
}

vi.mock('@/lib/db/supabase-client', () => ({
  getSupabaseAdminClient: vi.fn(() => createFakeSupabase(fakeDb)),
}));

vi.mock('@/lib/resilience/backoff-retry', () => ({
  withBackoffRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

describe('persistent queue reliability', () => {
  beforeEach(() => {
    fakeDb = {
      async_tasks: [],
      model_usage: [],
    };
    vi.resetModules();
  });

  it('processes a pending task and deletes it after success', async () => {
    const now = new Date().toISOString();
    fakeDb.async_tasks.push({
      id: 'task-1',
      type: 'metric_insert',
      payload: {
        table: 'model_usage',
        payload: {
          model: 'queued-model',
          tokens: 12,
          timestamp: now,
        },
      },
      status: 'pending',
      created_at: now,
      attempts: 0,
      last_error: null,
      updated_at: now,
    });

    const { processQueue } = await import('@/lib/resilience/persistent-queue');
    const result = await processQueue();

    expect(result.processedCount).toBe(1);
    expect(fakeDb.async_tasks).toHaveLength(0);
    expect(fakeDb.model_usage).toHaveLength(1);
    expect(fakeDb.model_usage[0].model).toBe('queued-model');
  });

  it('increments attempts and preserves the task for retry on failure below max attempts', async () => {
    const now = new Date().toISOString();
    fakeDb.async_tasks.push({
      id: 'task-2',
      type: 'metric_insert',
      payload: {
        table: null,
        payload: {
          bad: true,
        },
      },
      status: 'pending',
      created_at: now,
      attempts: 0,
      last_error: null,
      updated_at: now,
    });

    const { processQueue } = await import('@/lib/resilience/persistent-queue');
    const result = await processQueue();

    expect(result.processedCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(fakeDb.async_tasks[0].status).toBe('pending');
    expect(fakeDb.async_tasks[0].attempts).toBe(1);
    expect(String(fakeDb.async_tasks[0].last_error)).toContain('Invalid metric_insert task payload');
  });

  it('resets a stuck processing task back to pending and increments attempts', async () => {
    const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    fakeDb.async_tasks.push({
      id: 'task-3',
      type: 'metric_insert',
      payload: {
        table: 'model_usage',
        payload: {
          model: 'stuck-task',
          tokens: 1,
          timestamp: oldTimestamp,
        },
      },
      status: 'processing',
      created_at: oldTimestamp,
      attempts: 1,
      last_error: 'previous failure',
      updated_at: oldTimestamp,
    });

    const { recoverStuckProcessingTasks } = await import('@/lib/resilience/persistent-queue');
    const result = await recoverStuckProcessingTasks();

    expect(result.retriedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(fakeDb.async_tasks[0].status).toBe('pending');
    expect(fakeDb.async_tasks[0].attempts).toBe(2);
    expect(fakeDb.async_tasks[0].last_error).toBe('previous failure');
  });

  it('marks a task failed once max attempts is reached', async () => {
    const now = new Date().toISOString();
    fakeDb.async_tasks.push({
      id: 'task-4',
      type: 'metric_insert',
      payload: {
        table: null,
        payload: {
          bad: true,
        },
      },
      status: 'pending',
      created_at: now,
      attempts: 4,
      last_error: null,
      updated_at: now,
    });

    const { processQueue } = await import('@/lib/resilience/persistent-queue');
    const result = await processQueue();

    expect(result.failedCount).toBe(1);
    expect(fakeDb.async_tasks[0].status).toBe('failed');
    expect(fakeDb.async_tasks[0].attempts).toBe(5);
  });

  it('drains multiple batches but stops at the max batch limit', async () => {
    const baseTime = Date.now();
    for (let index = 0; index < 60; index += 1) {
      const timestamp = new Date(baseTime + index).toISOString();
      fakeDb.async_tasks.push({
        id: `task-${index}`,
        type: 'metric_insert',
        payload: {
          table: 'model_usage',
          payload: {
            model: `queued-${index}`,
            tokens: index,
            timestamp,
          },
        },
        status: 'pending',
        created_at: timestamp,
        attempts: 0,
        last_error: null,
        updated_at: timestamp,
      });
    }

    const { drainQueue } = await import('@/lib/resilience/persistent-queue');
    const result = await drainQueue(2);

    expect(result.processedCount).toBe(50);
    expect(result.batchesRun).toBe(2);
    expect(result.remainingPendingCount).toBe(10);
    expect(fakeDb.async_tasks).toHaveLength(10);
    expect(fakeDb.model_usage).toHaveLength(50);
  });
});
