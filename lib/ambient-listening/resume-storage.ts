import type { AmbientSessionState } from '@/types/ambient-listening';

export type AmbientResumeSnapshot = {
  sessionId: string;
  encounterId: string;
  sessionState: AmbientSessionState;
  updatedAt: string;
};

export type AmbientResumePersistenceInput = {
  sessionId: string | null;
  encounterId: string;
  sessionState: AmbientSessionState;
  updatedAt: string;
};

export function isAmbientResumeTerminalState(state: AmbientSessionState) {
  return state === 'accepted_into_note' || state === 'finalized' || state === 'discarded';
}

export function parseAmbientResumeSnapshot(raw: string | null) {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AmbientResumeSnapshot>;
    if (
      typeof parsed?.sessionId !== 'string'
      || typeof parsed?.encounterId !== 'string'
      || typeof parsed?.sessionState !== 'string'
      || typeof parsed?.updatedAt !== 'string'
    ) {
      return null;
    }

    return {
      sessionId: parsed.sessionId,
      encounterId: parsed.encounterId,
      sessionState: parsed.sessionState as AmbientSessionState,
      updatedAt: parsed.updatedAt,
    } satisfies AmbientResumeSnapshot;
  } catch {
    return null;
  }
}

export function buildAmbientResumeSnapshot(input: AmbientResumePersistenceInput) {
  if (!input.sessionId || isAmbientResumeTerminalState(input.sessionState)) {
    return null;
  }

  return {
    sessionId: input.sessionId,
    encounterId: input.encounterId,
    sessionState: input.sessionState,
    updatedAt: input.updatedAt,
  } satisfies AmbientResumeSnapshot;
}

export function shouldIgnoreAmbientResumeClearDuringHydration(input: {
  hydrated: boolean;
  sessionId: string | null;
}) {
  return !input.hydrated && !input.sessionId;
}
