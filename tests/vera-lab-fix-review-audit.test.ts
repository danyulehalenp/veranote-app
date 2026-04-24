import { describe, expect, it } from 'vitest';
import { buildFixTaskReviewAuditUpdate } from '@/lib/db/vera-lab-repo';

describe('buildFixTaskReviewAuditUpdate', () => {
  it('builds approval audit updates with actor and timestamp', () => {
    const update = buildFixTaskReviewAuditUpdate({
      status: 'approved',
      actor: 'admin@example.com',
      timestamp: '2026-04-23T12:00:00.000Z',
    });

    expect(update).toEqual({
      status: 'approved',
      approved_by: 'admin@example.com',
      approved_at: '2026-04-23T12:00:00.000Z',
    });
  });

  it('builds rejection audit updates with actor and timestamp', () => {
    const update = buildFixTaskReviewAuditUpdate({
      status: 'rejected',
      actor: 'admin@example.com',
      timestamp: '2026-04-23T12:00:00.000Z',
    });

    expect(update).toEqual({
      status: 'rejected',
      rejected_by: 'admin@example.com',
      rejected_at: '2026-04-23T12:00:00.000Z',
    });
  });
});
