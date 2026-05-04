import { describe, expect, it } from 'vitest';
import {
  applyAtlasConversationTone,
  buildAtlasConversationEvalMeta,
  orchestrateAtlasConversation,
} from '@/lib/veranote/atlas-conversation-orchestrator';
import type { AssistantThreadTurn } from '@/types/assistant';

describe('Atlas conversation orchestrator', () => {
  it('rewrites short diagnostic follow-ups using the active prior topic', () => {
    const recentMessages: AssistantThreadTurn[] = [
      {
        role: 'provider',
        content: 'what is the difference between schizoaffective disorder and bipolar with psychosis?',
      },
      {
        role: 'assistant',
        content: 'The practical distinction is whether psychosis occurs outside mood episodes.',
        answerMode: 'direct_reference_answer',
      },
    ];

    const result = orchestrateAtlasConversation({
      message: 'can you elaborate on this?',
      recentMessages,
    });

    expect(result.didRewrite).toBe(true);
    expect(result.followupIntent).toBe('elaborate');
    expect(result.routeHint).toBe('diagnostic_reference');
    expect(result.effectiveMessage).toContain('schizoaffective disorder and bipolar with psychosis');
    expect(result.effectiveMessage).toContain('Follow-up request: can you elaborate on this?');
    expect(result.hiddenScratchpad).toContain('safety:existing_clinical_lanes_remain_authoritative');
    expect(result.controlledRationale).toContain('Continuing the prior diagnostic reference topic.');
  });

  it('rewrites medication follow-ups without exposing private scratchpad text', () => {
    const result = orchestrateAtlasConversation({
      message: 'tell me more',
      recentMessages: [
        { role: 'provider', content: 'can wellbutrin be taken with paxil?' },
        { role: 'assistant', content: 'Bupropion with an SSRI should be reviewed for interaction risk.', answerMode: 'medication_reference_answer' },
      ],
    });
    const payload = applyAtlasConversationTone({
      message: 'Bupropion can inhibit CYP2D6 and Paxil has SSRI-specific interaction considerations.',
      answerMode: 'medication_reference_answer',
    }, result);
    const evalMeta = buildAtlasConversationEvalMeta(result);

    expect(result.didRewrite).toBe(true);
    expect(result.routeHint).toBe('medication_reference');
    expect(payload.message).toContain('Sure.');
    expect(payload.message).not.toMatch(/hidden scratchpad|chain-of-thought|step 1/i);
    expect(payload.suggestions).toContain('Continuing the prior medication reference topic.');
    expect(evalMeta).toMatchObject({
      didRewrite: true,
      followupIntent: 'elaborate',
      routeHint: 'medication_reference',
    });
  });

  it('does not rewrite workflow-only follow-ups into clinical answers', () => {
    const result = orchestrateAtlasConversation({
      message: 'yes proceed',
      recentMessages: [
        { role: 'provider', content: 'how do I start a note in Veranote?' },
        { role: 'assistant', content: 'Use Start Note from Source.', answerMode: 'workflow_guidance' },
      ],
    });

    expect(result.didRewrite).toBe(false);
    expect(result.effectiveMessage).toBe('yes proceed');
    expect(result.routeHint).toBe('workflow_help');
  });

  it('does not treat practical provider commands as same-topic clarification just because they contain it/this', () => {
    const recentMessages: AssistantThreadTurn[] = [
      { role: 'provider', content: 'short: labs for lithium-ish start?; pt; denies' },
      {
        role: 'assistant',
        content: 'Use a medication monitoring framework, not a patient-specific order.',
        answerMode: 'medication_reference_answer',
        builderFamily: 'medication-boundary',
      },
    ];

    expect(orchestrateAtlasConversation({
      message: 'baseline and followup; keep it usable',
      recentMessages,
    }).didRewrite).toBe(false);

    expect(orchestrateAtlasConversation({
      message: 'can u tell me what dose for this pt',
      recentMessages,
    }).didRewrite).toBe(false);
  });

  it('leaves standalone direct questions unchanged', () => {
    const result = orchestrateAtlasConversation({
      message: 'what is schizoaffective disorder criteria?',
      recentMessages: [],
    });

    expect(result.didRewrite).toBe(false);
    expect(result.followupIntent).toBe('none');
    expect(result.routeHint).toBe('diagnostic_reference');
    expect(result.effectiveMessage).toBe('what is schizoaffective disorder criteria?');
  });

  it('switches from a medication thread to a new risk-documentation topic', () => {
    const recentMessages: AssistantThreadTurn[] = [
      { role: 'provider', content: 'Can Wellbutrin be taken with Paxil?' },
      {
        role: 'assistant',
        content: 'Bupropion plus paroxetine needs interaction review.',
        answerMode: 'medication_reference_answer',
      },
    ];

    const newTopic = orchestrateAtlasConversation({
      message: 'New question: patient denies SI but mother reports suicidal texts. How chart?',
      recentMessages,
    });

    expect(newTopic.didRewrite).toBe(false);
    expect(newTopic.routeHint).toBe('documentation_safety');

    const followUp = orchestrateAtlasConversation({
      message: 'what if I just write denies SI and no concerns?',
      recentMessages: [
        ...recentMessages,
        { role: 'provider', content: newTopic.originalMessage },
        {
          role: 'assistant',
          content: 'Keep denial and collateral report visible side by side.',
          answerMode: 'warning_language',
          builderFamily: 'risk',
        },
      ],
    });

    expect(followUp.didRewrite).toBe(true);
    expect(followUp.routeHint).toBe('documentation_safety');
    expect(followUp.effectiveMessage).toContain('patient denies SI but mother reports suicidal texts');
  });
});
