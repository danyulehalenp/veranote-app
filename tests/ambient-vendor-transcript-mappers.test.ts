import { describe, expect, it } from 'vitest';
import {
  buildOpenAIRealtimeAmbientIngressEventsFromMockTurns,
  OPENAI_REALTIME_AMBIENT_ADAPTER_DESCRIPTOR,
} from '@/lib/ambient-listening/openai-realtime-ambient-adapter';
import {
  mapOpenAIRealtimeSegmentsToAmbientIngressEvents,
  mapVendorTranscriptSegmentsToAmbientIngressEvents,
} from '@/lib/ambient-listening/vendor-transcript-mappers';

describe('ambient vendor transcript mappers', () => {
  it('maps vendor role hints into ambient speaker roles and review hints', () => {
    const events = mapVendorTranscriptSegmentsToAmbientIngressEvents({
      segments: [
        {
          segmentId: 'seg-provider',
          startMs: 0,
          endMs: 1200,
          text: 'Let me ask about sleep first.',
          isFinal: true,
          textConfidence: 0.98,
          speaker: {
            label: 'Speaker A',
            roleHint: 'clinician',
            confidence: 0.96,
          },
        },
        {
          segmentId: 'seg-patient',
          startMs: 1250,
          endMs: 3600,
          text: 'I still do not feel safe going home.',
          isFinal: true,
          textConfidence: 0.95,
          speaker: {
            label: 'Speaker B',
            roleHint: 'patient',
            confidence: 0.81,
          },
          riskMarkers: ['not safe going home'],
        },
      ],
    });

    expect(events).toHaveLength(2);
    expect(events[0].turn.speakerRole).toBe('provider');
    expect(events[0].turn.reviewHints?.attributionNeedsReview).toBe(false);
    expect(events[1].turn.speakerRole).toBe('patient');
    expect(events[1].turn.reviewHints?.attributionNeedsReview).toBe(true);
    expect(events[1].turn.reviewHints?.severityBadges).toContain('speaker review');
    expect(events[1].turn.riskMarkers).toContain('not safe going home');
  });

  it('maps unknown vendor speakers conservatively', () => {
    const [event] = mapVendorTranscriptSegmentsToAmbientIngressEvents({
      segments: [
        {
          segmentId: 'seg-unknown',
          startMs: 0,
          endMs: 900,
          text: 'Speaker uncertain from source audio.',
          isFinal: false,
          speaker: {
            label: 'Speaker ?',
            roleHint: 'unknown',
            confidence: 0.88,
          },
        },
      ],
    });

    expect(event.turn.speakerRole).toBe('unknown');
    expect(event.turn.reviewHints?.attributionNeedsReview).toBe(true);
    expect(event.turn.reviewHints?.severityBadges).toEqual(['speaker review']);
  });

  it('maps OpenAI realtime-shaped segments into ambient ingress events', () => {
    const [event] = mapOpenAIRealtimeSegmentsToAmbientIngressEvents({
      segments: [
        {
          itemId: 'item-1',
          responseId: 'resp-1',
          startMs: 0,
          endMs: 1000,
          text: 'He texted goodbye last night.',
          normalizedText: 'He texted goodbye last night.',
          isFinal: true,
          textConfidence: 0.93,
          speaker: {
            label: 'Speaker C',
            roleHint: 'family',
            confidence: 0.92,
          },
          clinicalConcepts: ['collateral concern'],
          riskMarkers: ['goodbye text'],
        },
      ],
    });

    expect(event.id).toBe('item-1');
    expect(event.eventType).toBe('final_turn');
    expect(event.turn.speakerRole).toBe('family_member');
    expect(event.turn.reviewHints?.attributionNeedsReview).toBe(false);
    expect(event.turn.clinicalConcepts).toContain('collateral concern');
    expect(event.turn.riskMarkers).toContain('goodbye text');
  });

  it('builds OpenAI realtime stub ingress events from the shared mock turns', () => {
    const events = buildOpenAIRealtimeAmbientIngressEventsFromMockTurns();

    expect(OPENAI_REALTIME_AMBIENT_ADAPTER_DESCRIPTOR.adapterId).toBe('ambient-openai-realtime-stub');
    expect(events).toHaveLength(6);
    expect(events[0].eventType).toBe('interim_turn');
    expect(events[1].eventType).toBe('final_turn');
    expect(events[1].turn.speakerRole).toBe('provider');

    const patientFinal = events.find((event) => event.eventType === 'final_turn' && event.turn.speakerRole === 'patient');
    expect(patientFinal).toBeDefined();
    expect(patientFinal?.turn.reviewHints?.attributionNeedsReview).toBe(true);
    expect(patientFinal?.turn.reviewHints?.severityBadges).toContain('speaker review');
  });
});
