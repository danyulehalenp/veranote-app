import { describe, expect, it, vi } from 'vitest';
import { requireRole } from '@/lib/auth/role-check';
import { recordAuditEvent } from '@/lib/audit/audit-log';
import { rehydratePHI } from '@/lib/security/phi-rehydrator';
import { sanitizeForLogging, sanitizePHI } from '@/lib/security/phi-sanitizer';
import { validateRequest } from '@/lib/security/request-guard';
import { logEvent } from '@/lib/security/safe-logger';

vi.mock('@/lib/db/audit-repo', () => ({
  saveAuditEvent: vi.fn(async () => {}),
}));

describe('HIPAA-safe foundation', () => {
  it('sanitizes obvious PHI patterns for logging', () => {
    const input = 'John Smith DOB 01/02/1980 MRN 123456789 patient id 987654321';
    const result = sanitizeForLogging(input);

    expect(result).not.toContain('John Smith');
    expect(result).not.toContain('01/02/1980');
    expect(result).not.toContain('123456789');
    expect(result).toContain('[NAME_1]');
  });

  it('sanitizes and rehydrates deterministic PHI placeholders', () => {
    const input = 'John Smith DOB 01/01/1980 reports SI. Call 555-123-4567 or jane@example.com.';
    const result = sanitizePHI(input);

    expect(result.sanitizedText).toContain('[NAME_1]');
    expect(result.sanitizedText).toContain('[DOB_1]');
    expect(result.sanitizedText).toContain('[PHONE_1]');
    expect(result.sanitizedText).toContain('[EMAIL_1]');
    expect(result.sanitizedText).not.toContain('John Smith');

    expect(rehydratePHI(result.sanitizedText, result.entities)).toBe(input);
  });

  it('rejects direct model-injection request fields', () => {
    expect(() => validateRequest({
      message: 'hello',
      model: 'gpt-test',
    })).toThrow(/Forbidden request field/i);
  });

  it('logs metadata only', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const entry = logEvent({
      route: 'assistant/respond',
      action: 'assistant_respond',
      userId: 'provider-daniel-hale-beta',
      model: 'veranote-server-route',
      metadata: {
        providerId: 'provider-daniel-hale-beta',
        prompt: 'John Smith reported suicidal ideation',
      },
    });

    expect(entry.route).toBe('assistant/respond');
    expect(entry.metadata?.prompt).not.toContain('John Smith');
    expect(infoSpy).toHaveBeenCalledOnce();
    infoSpy.mockRestore();
  });

  it('enforces role checks conservatively', () => {
    expect(() => requireRole({
      id: 'provider-1',
      role: 'provider',
      email: 'provider@example.com',
    }, 'admin')).toThrow(/requires admin role/i);
  });

  it('records audit metadata without note content', () => {
    const entry = recordAuditEvent({
      userId: 'provider-daniel-hale-beta',
      action: 'assistant_respond',
      route: 'assistant/respond',
      metadata: {
        providerId: 'provider-daniel-hale-beta',
        mode: 'workflow-help',
      },
    });

    expect(entry.userId).toBe('provider-daniel-hale-beta');
    expect(entry.action).toBe('assistant_respond');
    expect(entry.metadata?.mode).toBe('workflow-help');
  });
});
