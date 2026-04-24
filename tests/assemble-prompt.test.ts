import { describe, expect, it } from 'vitest';
import { assembleAssistantKnowledgePrompt, assemblePrompt } from '@/lib/ai/assemble-prompt';

describe('assemblePrompt', () => {
  const baseInput = {
    templatePrompt: 'Template prompt here',
    stylePrompt: 'Style prompt here',
    specialty: 'Psychiatry',
    noteType: 'Psychiatry follow-up',
    outputStyle: 'Standard',
    format: 'Labeled Sections',
    keepCloserToSource: true,
    flagMissingInfo: true,
    sourceInput: 'Follow-up for anxiety. About the same. Denies SI/HI.',
  };

  it('includes provider-specific saved preferences when supplied', () => {
    const prompt = assemblePrompt({
      ...baseInput,
      customInstructions: 'In WellSky, only generate HPI and keep psych observations inside HPI.',
    });

    expect(prompt).toContain('Provider-specific saved preferences:');
    expect(prompt).toContain('only generate HPI');
  });

  it('includes psych MSE requirements when supplied', () => {
    const prompt = assemblePrompt({
      ...baseInput,
      mseGuidanceLines: [
        'Output scope: full-note.',
        'A standalone Mental Status / Observations section is required for this output scope.',
      ],
    });

    expect(prompt).toContain('Psych MSE requirements:');
    expect(prompt).toContain('standalone Mental Status / Observations section is required');
  });

  it('omits provider preferences block when no custom instructions are provided', () => {
    const prompt = assemblePrompt(baseInput);
    expect(prompt).not.toContain('Provider-specific saved preferences:');
  });

  it('preserves scope guidance that says not to force standalone MSE in HPI-only mode', () => {
    const prompt = assemblePrompt({
      ...baseInput,
      mseGuidanceLines: [
        'Output scope: hpi-only.',
        'Do not force a standalone Mental Status / Observations section for this output scope. If pertinent psych observations belong in HPI/assessment, include them there without inventing a full MSE block.',
      ],
    });

    expect(prompt).toContain('Output scope: hpi-only.');
    expect(prompt).toContain('Do not force a standalone Mental Status / Observations section');
  });

  it('adds anti-adjudication wording for unresolved substance conflicts', () => {
    const prompt = assemblePrompt({
      ...baseInput,
      sourceInput: `### Clinician note
- Patient denies recent cocaine use.

### Transcript
- "I didn't use anything."
- Girlfriend: "You were up for two days and using."

### Objective data
- Urine drug screen positive for cocaine.`,
    });

    expect(prompt).toContain('the denial exists, collateral concern exists, and the conflict remains unresolved');
    expect(prompt).toContain('Do not use conflict-softening rhetoric');
  });

  it('adds refill-only restraint when source documents a refill need without completion', () => {
    const prompt = assemblePrompt({
      ...baseInput,
      sourceInput: `### Clinician note
- Needs refill of lamotrigine.

### Objective data
- Medication list: lamotrigine 100 mg daily.
- Refill status not documented.`,
    });

    expect(prompt).toContain('document only the refill request');
    expect(prompt).toContain('A refill request alone does not prove the refill was sent');
  });

  it('tightens literal handling for sparse "about the same" status language', () => {
    const prompt = assemblePrompt({
      ...baseInput,
      sourceInput: `### Clinician note
- Brief med check.
- Needs refill of lamotrigine.
- Mood "about the same."

### Transcript
- "Otherwise things are about the same."`,
    });

    expect(prompt).toContain('preserve the patient-shaped wording as literally as possible');
    expect(prompt).toContain('do not justify adding "stable," "unchanged," "no new symptoms,"');
  });

  it('makes medication-conflict guidance explicitly source-attributed', () => {
    const prompt = assemblePrompt({
      ...baseInput,
      sourceInput: `### Clinician note
- Last visit plan was to increase sertraline to 100 mg daily.
- Patient says she has actually kept taking 50 mg because she was nervous about increasing.

### Objective data
- Medication list shows sertraline 100 mg daily.
- Pharmacy refill history not reviewed today.`,
    });

    expect(prompt).toContain('prior plan/chart med list says one thing while the patient reports another');
    expect(prompt).toContain('the current documentation does not resolve the actual regimen today');
    expect(prompt).toContain('a prior plan or chart list says one dose, the patient reports still taking another dose');
  });

  it('treats incomplete structured medication profiles as an uncertainty guardrail', () => {
    const prompt = assemblePrompt({
      ...baseInput,
      sourceInput: `### Clinician note
- Patient thinks she is taking lithium at night but forgot bottle.
- Chart still lists lithium 300 mg BID.`,
      medicationProfileLines: [
        'Medication/profile label: Lithium | status: current | normalized medication match: lithium',
      ],
    });

    expect(prompt).toContain('If dose, schedule, route, or the normalized medication name remains incomplete or uncertain in that profile');
    expect(prompt).toContain('keep the regimen wording incomplete or uncertain in the draft rather than guessing the missing detail');
    expect(prompt).toContain('If the structured medication profile itself is incomplete, do not use cleaner prose to fill the missing dose, schedule, route, or exact active regimen.');
  });

  it('keeps diagnosis framing conservative when structured diagnosis guidance is present', () => {
    const prompt = assemblePrompt({
      ...baseInput,
      sourceInput: `### Clinician note
- Outside records list bipolar disorder but current evaluation is still exploring trauma-related disorder versus depressive disorder.`,
      diagnosisProfileLines: [
        'Diagnosis/profile label: Bipolar disorder | status: historical | certainty: unclear',
        'Diagnosis/profile label: Trauma-related disorder | status: differential | certainty: possible',
      ],
    });

    expect(prompt).toContain('If an entry is marked historical, rule-out, differential, or symptom-level, do not upgrade it into a current confirmed diagnosis');
    expect(prompt).toContain('If diagnosis profile evidence or timeframe notes are sparse, keep Assessment conservative');
    expect(prompt).toContain('Do not promote historical, rule-out, differential, or symptom-level formulations into current confirmed diagnoses unless the source explicitly supports that promotion.');
  });

  it('adds emerging drug guardrails when the source names a gas-station drug', () => {
    const prompt = assemblePrompt({
      ...baseInput,
      sourceInput: `### Clinician note
- Patient reports using Neptune's Fix from a gas station.
- Now has confusion, sweats, and withdrawal-like symptoms.
- Routine UDS negative.`,
    });

    expect(prompt).toContain('Emerging drug / NPS guardrails:');
    expect(prompt).toContain('tianeptine or gas-station heroin products may be clinically relevant');
    expect(prompt).toContain('do not reframe it as a harmless supplement');
  });

});

describe('assembleAssistantKnowledgePrompt', () => {
  it('labels provider preferences separately from clinical knowledge', () => {
    const prompt = assembleAssistantKnowledgePrompt({
      task: 'Help me phrase this note.',
      sourceNote: 'Patient reports anxiety and denies SI.',
      knowledgeBundle: {
        query: {
          text: 'Help me phrase this note.',
          intent: 'draft_support',
        },
        matchedIntents: ['draft_support'],
        diagnosisConcepts: [],
        codingEntries: [],
        medicationConcepts: [],
        emergingDrugConcepts: [],
        workflowGuidance: [],
        trustedReferences: [],
        memoryItems: [],
      },
      providerMemory: [
        {
          id: 'memory-1',
          providerId: 'provider-daniel-hale-beta',
          category: 'phrasing',
          content: 'Use "Patient reports ..." phrasing when summarizing subjective content supported by source.',
          tags: ['draft_support', 'Outpatient Psych Follow-Up'],
          confidence: 'high',
          source: 'manual',
          createdAt: '2026-04-21T00:00:00.000Z',
          updatedAt: '2026-04-21T00:00:00.000Z',
        },
      ],
    });

    expect(prompt).toContain('[PROVIDER PREFERENCES]');
    expect(prompt).toContain('Provider style preferences (NOT clinical facts)');
    expect(prompt).toContain('Use "Patient reports ..." phrasing');
  });

  it('adds defensibility sections separately from clinical facts', () => {
    const prompt = assembleAssistantKnowledgePrompt({
      task: 'Does this justify continued inpatient care?',
      sourceNote: 'Patient has suicidal ideation with a plan to overdose and no safe discharge environment.',
      knowledgeBundle: {
        query: {
          text: 'Does this justify continued inpatient care?',
          intent: 'workflow_help',
        },
        matchedIntents: ['workflow_help'],
        diagnosisConcepts: [],
        codingEntries: [],
        medicationConcepts: [],
        emergingDrugConcepts: [],
        workflowGuidance: [],
        trustedReferences: [],
        memoryItems: [],
      },
      medicalNecessity: {
        signals: [
          {
            category: 'risk',
            evidence: ['Suicidal ideation or self-harm language documented.'],
            strength: 'strong',
          },
        ],
        missingElements: ['Failure of lower level of care is not clearly documented.'],
      },
      levelOfCare: {
        suggestedLevel: 'inpatient',
        justification: ['Plan or intent language documented.'],
        missingJustification: ['Level-of-care boundary is not fully supported by failed lower-level care history.'],
      },
      cptSupport: {
        summary: 'Documentation is too thin to support confident CPT-family guidance.',
        documentationElements: ['Psychotherapy content is not clearly distinct yet.'],
        timeHints: ['Time-based documentation is not clearly visible; avoid implying time-dependent billing support.'],
        riskComplexityIndicators: ['Risk-sensitive content may support higher documentation complexity if clearly described.'],
        cautions: ['Do not present CPT or billing family selection as definitive based on partial source alone.'],
      },
      losAssessment: {
        reasonsForContinuedStay: ['Ongoing safety risk remains documented.'],
        barriersToDischarge: ['Safe discharge environment is not clearly established.'],
        stabilityIndicators: [],
        missingDischargeCriteria: ['Discharge criteria or disposition readiness are not clearly documented.'],
      },
      auditFlags: [
        {
          type: 'insufficient_justification',
          severity: 'high',
          message: 'Level-of-care support may be vulnerable because documentation is missing around failure of lower level of care.',
        },
      ],
      nextActions: [
        {
          suggestion: 'Consider clarifying suicide risk directly in the note.',
          rationale: 'Plan-level language is not fully separated from current denial language.',
          confidence: 'high',
        },
      ],
      triageSuggestion: {
        level: 'urgent',
        reasoning: ['Documented instability may warrant urgent reassessment or closer follow-up.'],
        confidence: 'moderate',
      },
      dischargeStatus: {
        readiness: 'possibly_ready',
        supportingFactors: ['Some stabilization language is documented in the source.'],
        barriers: ['Safe discharge environment is not clearly established.'],
      },
      workflowTasks: [
        {
          task: 'Clarify discharge supports and disposition plan',
          reason: 'Discharge readiness appears limited by support or environment gaps.',
          priority: 'medium',
        },
      ],
      longitudinalSummary: {
        symptomTrends: ['Anxiety-related symptoms recur across multiple recent notes.'],
        riskTrends: ['Risk documentation varies across recent notes and may need temporal clarification.'],
        responseToTreatment: [],
        recurringIssues: [],
      },
    });

    expect(prompt).toContain('[MEDICAL NECESSITY]');
    expect(prompt).toContain('[LEVEL OF CARE]');
    expect(prompt).toContain('[NEXT STEPS]');
    expect(prompt).toContain('[TRIAGE CONSIDERATION]');
    expect(prompt).toContain('[DISCHARGE STATUS]');
    expect(prompt).toContain('[WORKFLOW TASKS]');
    expect(prompt).toContain('[BILLING / CPT SUPPORT]');
    expect(prompt).toContain('[LOS CONSIDERATIONS]');
    expect(prompt).toContain('[LONGITUDINAL CONTEXT]');
    expect(prompt).toContain('[AUDIT FLAGS]');
  });

  it('keeps PHI out of assistant prompts', () => {
    const prompt = assembleAssistantKnowledgePrompt({
      task: 'Help rewrite John Smith DOB 01/01/1980 note.',
      sourceNote: 'John Smith DOB 01/01/1980 reports suicidal ideation.',
      knowledgeBundle: {
        query: {
          text: 'Help rewrite John Smith DOB 01/01/1980 note.',
          intent: 'draft_support',
        },
        matchedIntents: ['draft_support'],
        diagnosisConcepts: [],
        codingEntries: [],
        medicationConcepts: [],
        emergingDrugConcepts: [],
        workflowGuidance: [],
        trustedReferences: [],
        memoryItems: [],
      },
    });

    expect(prompt).not.toContain('John Smith');
    expect(prompt).not.toContain('01/01/1980');
    expect(prompt).toContain('[NAME_1]');
    expect(prompt).toContain('[DOB_1]');
  });
});
