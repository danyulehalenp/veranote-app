import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'assistant-route-memory-provider',
      role: 'provider',
      email: 'assistant-route-memory@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'assistant-route-memory-provider',
    tokenSource: 'header',
  }),
}));

vi.mock('@/lib/resilience/rate-limiter', () => ({
  checkRateLimit: async () => {},
}));

import { POST } from '@/app/api/assistant/respond/route';

describe('assistant route memory usage', () => {
  it('uses remembered provider preferences in a later workflow answer', async () => {
    const providerIdentityId = `provider-route-memory-${Date.now()}`;

    await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'Remember that I prefer concise assessment language.',
        context: { providerIdentityId, providerAddressingName: 'Daniel', noteType: 'Inpatient Psych Progress Note' },
      }),
    }));

    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'Help me shape this note lane and assessment.',
        context: { providerIdentityId, providerAddressingName: 'Daniel', noteType: 'Inpatient Psych Progress Note' },
      }),
    }));

    const payload = await response.json();
    const rememberedText = [payload.message, ...(payload.suggestions || [])].join(' ');
    expect(rememberedText).toContain('concise assessment language');
  });
});
