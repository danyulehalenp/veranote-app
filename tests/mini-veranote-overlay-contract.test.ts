import { describe, expect, it } from 'vitest';
import {
  buildMiniVeranoteDesktopHandoff,
  parseMiniVeranoteLayout,
  parseMiniVeranotePreferences,
  selectMiniVeranoteEhrPayload,
} from '@/lib/veranote/mini-veranote-overlay';

describe('Mini Veranote overlay contract', () => {
  it('parses persisted preferences and falls back for invalid target or payload mode', () => {
    expect(parseMiniVeranotePreferences(JSON.stringify({
      targetSection: 'objectiveData',
      ehrPayloadMode: 'target-source',
      selectedFieldTargetId: 'tebra-plan',
    }))).toEqual({
      targetSection: 'objectiveData',
      ehrPayloadMode: 'target-source',
      selectedFieldTargetId: 'tebra-plan',
    });

    expect(parseMiniVeranotePreferences(JSON.stringify({
      targetSection: 'unknown',
      ehrPayloadMode: 'unsafe',
      selectedFieldTargetId: 123,
    }))).toEqual({
      targetSection: 'clinicianNotes',
      ehrPayloadMode: 'smart',
      selectedFieldTargetId: '',
    });

    expect(parseMiniVeranotePreferences('not-json')).toBeNull();
  });

  it('parses persisted layout without trusting malformed coordinates', () => {
    expect(parseMiniVeranoteLayout(JSON.stringify({
      x: 120,
      y: 220,
      minimized: true,
    }))).toEqual({
      x: 120,
      y: 220,
      minimized: true,
    });

    expect(parseMiniVeranoteLayout(JSON.stringify({
      x: '120',
      y: 220,
      minimized: true,
    }))).toBeNull();
  });

  it('selects the EHR payload by explicit copy mode', () => {
    const baseInput = {
      currentDraftText: ' Draft note ',
      miniText: ' Scratch capture ',
      targetSourceText: ' Selected source ',
      sourceInput: ' Combined source ',
    };

    expect(selectMiniVeranoteEhrPayload({ ...baseInput, mode: 'draft' })).toBe('Draft note');
    expect(selectMiniVeranoteEhrPayload({ ...baseInput, mode: 'scratch' })).toBe('Scratch capture');
    expect(selectMiniVeranoteEhrPayload({ ...baseInput, mode: 'target-source' })).toBe('Selected source');
  });

  it('uses draft, scratch, selected source, then combined source for smart EHR payloads', () => {
    expect(selectMiniVeranoteEhrPayload({
      mode: 'smart',
      currentDraftText: ' Draft note ',
      miniText: ' Scratch capture ',
      targetSourceText: ' Selected source ',
      sourceInput: ' Combined source ',
    })).toBe('Draft note');

    expect(selectMiniVeranoteEhrPayload({
      mode: 'smart',
      currentDraftText: ' ',
      miniText: ' Scratch capture ',
      targetSourceText: ' Selected source ',
      sourceInput: ' Combined source ',
    })).toBe('Scratch capture');

    expect(selectMiniVeranoteEhrPayload({
      mode: 'smart',
      currentDraftText: ' ',
      miniText: ' ',
      targetSourceText: ' Selected source ',
      sourceInput: ' Combined source ',
    })).toBe('Selected source');

    expect(selectMiniVeranoteEhrPayload({
      mode: 'smart',
      currentDraftText: ' ',
      miniText: ' ',
      targetSourceText: ' ',
      sourceInput: ' Combined source ',
    })).toBe('Combined source');
  });

  it('builds a desktop handoff with destination, field, source, and payload metadata', () => {
    expect(buildMiniVeranoteDesktopHandoff({
      providerIdentityId: 'provider-1',
      createdAt: '2026-06-02T12:00:00.000Z',
      workflowProfile: {
        destination: 'Tebra/Kareo',
        destinationLabel: 'Tebra/Kareo',
        speechBoxMode: 'floating-field-box',
      },
      selectedFieldTarget: {
        id: 'tebra-plan',
        label: 'Plan',
      },
      sourceTarget: 'objectiveData',
      payloadMode: 'target-source',
      text: 'Labs reviewed.',
    })).toEqual({
      providerIdentityId: 'provider-1',
      createdAt: '2026-06-02T12:00:00.000Z',
      destination: 'Tebra/Kareo',
      destinationLabel: 'Tebra/Kareo',
      destinationMode: 'floating-field-box',
      fieldTargetId: 'tebra-plan',
      fieldTargetLabel: 'Plan',
      sourceTarget: 'objectiveData',
      sourceTargetLabel: 'Add-On',
      payloadMode: 'target-source',
      text: 'Labs reviewed.',
    });
  });
});
