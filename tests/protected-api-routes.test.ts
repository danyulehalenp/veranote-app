import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  generateNote: vi.fn(),
  rewriteNote: vi.fn(),
  listBetaFeedback: vi.fn(),
  saveBetaFeedback: vi.fn(),
  updateBetaFeedback: vi.fn(),
  listVeranoteBuildTasks: vi.fn(),
  saveVeranoteBuildTasks: vi.fn(),
  sendFeedbackNotification: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock('@/lib/ai/generate-note', () => ({
  generateNote: mocks.generateNote,
}));

vi.mock('@/lib/ai/rewrite-note', () => ({
  REWRITE_MODES: ['regenerate-full-note', 'one-paragraph', 'two-paragraph-hpi-mse-plan', 'story-flow'],
  rewriteNote: mocks.rewriteNote,
}));

vi.mock('@/lib/db/client', () => ({
  listBetaFeedback: mocks.listBetaFeedback,
  saveBetaFeedback: mocks.saveBetaFeedback,
  updateBetaFeedback: mocks.updateBetaFeedback,
  listVeranoteBuildTasks: mocks.listVeranoteBuildTasks,
  saveVeranoteBuildTasks: mocks.saveVeranoteBuildTasks,
}));

vi.mock('@/lib/beta/feedback-email', () => ({
  isFeedbackEmailConfigured: () => false,
  sendFeedbackNotification: mocks.sendFeedbackNotification,
}));

vi.mock('@/lib/veranote/access-mode', () => ({
  INTERNAL_MODE_ENABLED: true,
}));

vi.mock('fs', () => ({
  promises: {
    mkdir: mocks.mkdir,
    writeFile: mocks.writeFile,
  },
}));

vi.mock('child_process', () => ({
  spawn: mocks.spawn,
}));

const providerAuth = {
  user: {
    id: 'provider-route-security',
    role: 'provider' as const,
    email: 'provider-route-security@veranote.local',
  },
  isAuthenticated: true,
  providerIdentityId: 'provider-route-security',
  tokenSource: 'header' as const,
};

const adminAuth = {
  user: {
    id: 'admin-route-security',
    role: 'admin' as const,
    email: 'admin-route-security@veranote.local',
  },
  isAuthenticated: true,
  tokenSource: 'header' as const,
};

function jsonRequest(url: string, body: unknown, method = 'POST') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('protected API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue(providerAuth);
    mocks.generateNote.mockResolvedValue({ note: 'Generated note text', mode: 'mock' });
    mocks.rewriteNote.mockResolvedValue({ note: 'Rewritten note text', mode: 'fallback' });
    mocks.listBetaFeedback.mockResolvedValue([{ id: 'feedback-1', status: 'new' }]);
    mocks.saveBetaFeedback.mockImplementation(async (feedback) => ({
      id: 'feedback-1',
      createdAt: '2026-06-16T00:00:00.000Z',
      status: 'new',
      ...feedback,
    }));
    mocks.updateBetaFeedback.mockResolvedValue({ id: 'feedback-1', status: 'reviewed' });
    mocks.listVeranoteBuildTasks.mockResolvedValue([{ id: 'task-1', status: 'todo' }]);
    mocks.saveVeranoteBuildTasks.mockImplementation(async (tasks) => tasks);
    mocks.sendFeedbackNotification.mockResolvedValue({ sent: false, reason: 'not_configured' });
    mocks.mkdir.mockResolvedValue(undefined);
    mocks.writeFile.mockResolvedValue(undefined);
    mocks.spawn.mockImplementation(() => {
      const child = {
        stdin: {
          write: vi.fn(),
          end: vi.fn(),
        },
        on: vi.fn((event: string, callback: (code?: number) => void) => {
          if (event === 'close') {
            callback(0);
          }
          return child;
        }),
      };
      return child;
    });
  });

  it('blocks unauthorized note generation before parsing body or generating text', async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error('Unauthorized'));

    const { POST } = await import('@/app/api/generate-note/route');
    const response = await POST(new Request('http://localhost/api/generate-note', {
      method: 'POST',
      body: '{',
    }));

    expect(response.status).toBe(401);
    expect(mocks.generateNote).not.toHaveBeenCalled();
  });

  it('preserves authenticated note generation', async () => {
    const { POST } = await import('@/app/api/generate-note/route');
    const response = await POST(jsonRequest('http://localhost/api/generate-note', {
      sourceInput: 'Source summary text.',
      noteType: 'Psychiatry Follow-Up',
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.note).toBe('Generated note text');
    expect(mocks.generateNote).toHaveBeenCalledWith(expect.objectContaining({
      sourceInput: 'Source summary text.',
      noteType: 'Psychiatry Follow-Up',
    }));
  });

  it('blocks unauthorized note rewriting before parsing body or rewriting text', async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error('Unauthorized'));

    const { POST } = await import('@/app/api/rewrite-note/route');
    const response = await POST(new Request('http://localhost/api/rewrite-note', {
      method: 'POST',
      body: '{',
    }));

    expect(response.status).toBe(401);
    expect(mocks.rewriteNote).not.toHaveBeenCalled();
  });

  it('preserves authenticated note rewriting', async () => {
    const { POST } = await import('@/app/api/rewrite-note/route');
    const response = await POST(jsonRequest('http://localhost/api/rewrite-note', {
      sourceInput: 'Source summary text.',
      currentDraft: 'Current draft text.',
      noteType: 'Psychiatry Follow-Up',
      rewriteMode: 'one-paragraph',
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.note).toBe('Rewritten note text');
    expect(mocks.rewriteNote).toHaveBeenCalledWith(expect.objectContaining({
      sourceInput: 'Source summary text.',
      currentDraft: 'Current draft text.',
      rewriteMode: 'one-paragraph',
    }));
  });

  it('blocks unauthorized beta feedback submission before saving', async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error('Unauthorized'));

    const { POST } = await import('@/app/api/beta-feedback/route');
    const response = await POST(jsonRequest('http://localhost/api/beta-feedback', {
      pageContext: 'Note builder review',
      feedbackLabel: 'helpful',
    }));

    expect(response.status).toBe(401);
    expect(mocks.saveBetaFeedback).not.toHaveBeenCalled();
  });

  it('preserves authenticated provider beta feedback submission', async () => {
    const { POST } = await import('@/app/api/beta-feedback/route');
    const response = await POST(jsonRequest('http://localhost/api/beta-feedback', {
      pageContext: 'Note builder review',
      workflowArea: 'note_builder',
      feedbackLabel: 'helpful',
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.feedback.feedbackLabel).toBe('helpful');
    expect(mocks.saveBetaFeedback).toHaveBeenCalledOnce();
  });

  it('requires admin auth for beta feedback listing and updates', async () => {
    mocks.requireAuth.mockResolvedValue(adminAuth);

    const route = await import('@/app/api/beta-feedback/route');
    const listResponse = await route.GET(new Request('http://localhost/api/beta-feedback'));
    const updateResponse = await route.PATCH(jsonRequest('http://localhost/api/beta-feedback', {
      id: 'feedback-1',
      status: 'reviewed',
    }, 'PATCH'));

    expect(listResponse.status).toBe(200);
    expect(updateResponse.status).toBe(200);
    expect(mocks.listBetaFeedback).toHaveBeenCalledOnce();
    expect(mocks.updateBetaFeedback).toHaveBeenCalledWith('feedback-1', expect.objectContaining({
      status: 'reviewed',
    }));
  });

  it('blocks non-admin beta feedback listing and updates', async () => {
    const route = await import('@/app/api/beta-feedback/route');
    const listResponse = await route.GET(new Request('http://localhost/api/beta-feedback'));
    const updateResponse = await route.PATCH(jsonRequest('http://localhost/api/beta-feedback', {
      id: 'feedback-1',
      status: 'reviewed',
    }, 'PATCH'));

    expect(listResponse.status).toBe(403);
    expect(updateResponse.status).toBe(403);
    expect(mocks.listBetaFeedback).not.toHaveBeenCalled();
    expect(mocks.updateBetaFeedback).not.toHaveBeenCalled();
  });

  it('requires admin auth for build task reads and writes', async () => {
    mocks.requireAuth.mockResolvedValue(adminAuth);

    const route = await import('@/app/api/build-tasks/route');
    const readResponse = await route.GET(new Request('http://localhost/api/build-tasks'));
    const writeResponse = await route.POST(jsonRequest('http://localhost/api/build-tasks', {
      tasks: [{ id: 'task-1', status: 'todo', title: 'Security follow-up' }],
    }));
    const writePayload = await writeResponse.json();

    expect(readResponse.status).toBe(200);
    expect(writeResponse.status).toBe(200);
    expect(writePayload.syncedToImac).toBe(true);
    expect(mocks.listVeranoteBuildTasks).toHaveBeenCalledOnce();
    expect(mocks.saveVeranoteBuildTasks).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'task-1' }),
    ]);
    expect(mocks.writeFile).toHaveBeenCalledOnce();
  });

  it('blocks non-admin build task reads and writes before storage or sync work', async () => {
    const route = await import('@/app/api/build-tasks/route');
    const readResponse = await route.GET(new Request('http://localhost/api/build-tasks'));
    const writeResponse = await route.POST(jsonRequest('http://localhost/api/build-tasks', {
      tasks: [{ id: 'task-1', status: 'todo' }],
    }));

    expect(readResponse.status).toBe(403);
    expect(writeResponse.status).toBe(403);
    expect(mocks.listVeranoteBuildTasks).not.toHaveBeenCalled();
    expect(mocks.saveVeranoteBuildTasks).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
