import { describe, expect, it } from 'vitest';
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
