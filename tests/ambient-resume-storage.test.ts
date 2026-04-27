import { describe, expect, it } from 'vitest';
import {
  buildAmbientResumeSnapshot,
  isAmbientResumeTerminalState,
  parseAmbientResumeSnapshot,
  shouldIgnoreAmbientResumeClearDuringHydration,
} from '@/lib/ambient-listening/resume-storage';

describe('ambient resume storage helpers', () => {
  it('parses valid stored resume snapshots and rejects malformed ones', () => {
    expect(parseAmbientResumeSnapshot(JSON.stringify({
      sessionId: 'ambient-1',
      encounterId: 'encounter-1',
      sessionState: 'consent_pending',
      updatedAt: '2026-04-26T20:00:00.000Z',
    }))).toEqual({
      sessionId: 'ambient-1',
      encounterId: 'encounter-1',
      sessionState: 'consent_pending',
      updatedAt: '2026-04-26T20:00:00.000Z',
    });

    expect(parseAmbientResumeSnapshot(null)).toBeNull();
    expect(parseAmbientResumeSnapshot('{"bad":true}')).toBeNull();
    expect(parseAmbientResumeSnapshot('not json')).toBeNull();
  });

  it('keeps resumable ambient sessions and drops terminal ones', () => {
    expect(buildAmbientResumeSnapshot({
      sessionId: 'ambient-2',
      encounterId: 'encounter-2',
      sessionState: 'recording',
      updatedAt: '2026-04-26T20:05:00.000Z',
    })).toEqual({
      sessionId: 'ambient-2',
      encounterId: 'encounter-2',
      sessionState: 'recording',
      updatedAt: '2026-04-26T20:05:00.000Z',
    });

    expect(buildAmbientResumeSnapshot({
      sessionId: 'ambient-3',
      encounterId: 'encounter-3',
      sessionState: 'accepted_into_note',
      updatedAt: '2026-04-26T20:05:00.000Z',
    })).toBeNull();

    expect(isAmbientResumeTerminalState('discarded')).toBe(true);
    expect(isAmbientResumeTerminalState('ready_to_record')).toBe(false);
  });

  it('preserves an existing resume pointer while hydration is still in flight', () => {
    expect(shouldIgnoreAmbientResumeClearDuringHydration({
      hydrated: false,
      sessionId: null,
    })).toBe(true);

    expect(shouldIgnoreAmbientResumeClearDuringHydration({
      hydrated: true,
      sessionId: null,
    })).toBe(false);

    expect(shouldIgnoreAmbientResumeClearDuringHydration({
      hydrated: false,
      sessionId: 'ambient-4',
    })).toBe(false);
  });
});
