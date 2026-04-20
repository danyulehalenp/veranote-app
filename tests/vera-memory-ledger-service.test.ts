import { describe, expect, it } from 'vitest';
import {
  describeAcceptedLedgerReopenTarget,
  parseObservedLaneDescriptor,
  resolveAcceptedLedgerReopenTarget,
} from '@/lib/veranote/vera-memory-ledger-service';

describe('vera memory ledger service', () => {
  it('parses observed lane descriptors', () => {
    expect(
      parseObservedLaneDescriptor('observed-lane:Inpatient Psych Progress Note:focused:narrative:WellSky'),
    ).toEqual({
      noteType: 'Inpatient Psych Progress Note',
      outputScope: 'focused',
      outputStyle: 'narrative',
      format: 'WellSky',
    });
  });

  it('resolves accepted ledger reopen targets by item id', () => {
    expect(resolveAcceptedLedgerReopenTarget({ id: 'accepted-rewrite:Inpatient Psych Progress Note:balanced' })).toEqual({
      kind: 'rewrite',
      noteType: 'Inpatient Psych Progress Note',
      tone: 'balanced',
    });

    expect(resolveAcceptedLedgerReopenTarget({ id: 'accepted-prompt:Inpatient Psych Progress Note:brevity-pattern' })).toEqual({
      kind: 'prompt',
      noteType: 'Inpatient Psych Progress Note',
      key: 'brevity-pattern',
    });
  });

  it('describes accepted reopen targets in provider-facing language', () => {
    expect(
      describeAcceptedLedgerReopenTarget({
        kind: 'profile',
        profileId: 'profile-1',
        key: 'pattern-1',
      }),
    ).toContain('provider-level pattern');
  });
});
