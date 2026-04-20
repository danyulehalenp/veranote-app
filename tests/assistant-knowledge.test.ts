import { describe, expect, it } from 'vitest';
import { buildGeneralKnowledgeHelp, buildReferenceLookupHelp } from '@/lib/veranote/assistant-knowledge';
import { POST } from '@/app/api/assistant/respond/route';

describe('assistant knowledge helper', () => {
  it('answers MDD ICD-10 questions directly instead of falling back to workflow help', () => {
    const response = buildGeneralKnowledgeHelp(
      'do you know the diagnosis icd 10 for mdd?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('ICD-10-CM code for major depressive disorder depends on whether the episode is single or recurrent');
    expect(response?.message).toContain('F32.A');
    expect(response?.message).toContain('F33.9');
    expect(response?.suggestions?.[0]).toContain('single episode or recurrent');
  });

  it('answers general depression diagnosis code questions directly', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what is the diagnosis code for depression?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Inpatient Psych Progress Note' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('ICD-10-CM code for major depressive disorder depends on whether the episode is single or recurrent');
    expect(payload.message).toContain('F32.A');
    expect(payload.message).toContain('F33.9');
  });

  it('answers plain-language depression knowledge questions through the live endpoint', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what do you know about depression?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Inpatient Psych Progress Note' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('When providers say depression broadly');
    expect(payload.message).toContain('major depressive disorder');
    expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
  });

  it('answers broad anxiety concept questions through the live endpoint', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what do you know about anxiety?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Inpatient Psych Progress Note' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('separate chronic diffuse worry from panic');
    expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
  });

  it('answers bipolar I versus bipolar II concept questions through the live endpoint', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'bipolar i vs bipolar ii',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Inpatient Psych Progress Note' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('mania versus hypomania');
    expect(payload.message).toContain('Bipolar I requires at least one manic episode');
    expect(payload.message).toContain('Bipolar II requires hypomania');
  });

  it('answers psychosis versus substance-induced psychosis concept questions through the live endpoint', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'psychosis versus substance induced psychosis',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Inpatient Psych Progress Note' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('timing is everything');
    expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
  });

  it('answers psych med-management cpt family questions through the live endpoint', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what cpt code do i use for psych med management?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Inpatient Psych Progress Note' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('office or outpatient E/M family');
    expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
  });

  it('answers psychotherapy add-on questions through the live endpoint', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'when do i use 90833?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Inpatient Psych Progress Note' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('90833, 90836, and 90838');
    expect(payload.message).toContain('used with an E/M service on the same day');
  });

  it('answers psychotherapy crisis cpt questions through the live endpoint', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what cpt code is psychotherapy crisis?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Inpatient Psych Progress Note' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('90839 and 90840');
    expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
  });

  it('answers interactive complexity and therapy-specific cpt questions through the live endpoint', async () => {
    const interactiveResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'when do i use 90785?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Psych Follow-Up' },
      }),
    }));

    const interactivePayload = await interactiveResponse.json();
    expect(interactivePayload.message).toContain('interactive complexity add-on code');

    const familyResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what is 90847?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Therapy Note' },
      }),
    }));

    const familyPayload = await familyResponse.json();
    expect(familyPayload.message).toContain('family psychotherapy with the patient present');

    const groupResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what is 90853?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Group Therapy Note' },
      }),
    }));

    const groupPayload = await groupResponse.json();
    expect(groupPayload.message).toContain('group psychotherapy');
  }, 15000);

  it('answers compare-style outpatient psych and therapy cpt questions through the live endpoint', async () => {
    const intakeCompareResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: '90791 vs 90792',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Psych Intake Note' },
      }),
    }));

    const intakeComparePayload = await intakeCompareResponse.json();
    expect(intakeComparePayload.message).toContain('difference between 90791 and 90792');

    const therapyCompareResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: '90834 vs 90837',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Therapy Note' },
      }),
    }));

    const therapyComparePayload = await therapyCompareResponse.json();
    expect(therapyComparePayload.message).toContain('difference between 90834 and 90837');

    const emCompareResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'when do i use e/m alone vs e/m + 90833?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Psych Follow-Up' },
      }),
    }));

    const emComparePayload = await emCompareResponse.json();
    expect(emComparePayload.message).toContain('E/M alone versus E/M plus 90833');

    const familyGroupCompareResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'family therapy vs group therapy',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Therapy Note' },
      }),
    }));

    const familyGroupComparePayload = await familyGroupCompareResponse.json();
    expect(familyGroupComparePayload.message).toContain('Family therapy and group therapy are different psychotherapy families');
  }, 15000);

  it('answers follow-up, telehealth, and therapy-boundary cpt questions through the live endpoint', async () => {
    const intakeFollowupResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'intake vs follow-up for psych med management',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Psych Follow-Up' },
      }),
    }));

    const intakeFollowupPayload = await intakeFollowupResponse.json();
    expect(intakeFollowupPayload.message).toContain('intake families and follow-up families should stay separate');

    const therapyBoundaryResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'psychotherapy-only vs med management follow-up',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Therapy Note' },
      }),
    }));

    const therapyBoundaryPayload = await therapyBoundaryResponse.json();
    expect(therapyBoundaryPayload.message).toContain('Psychotherapy-only follow-up and med-management follow-up are different billing families');

    const crisisBoundaryResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'crisis psychotherapy vs regular psychotherapy',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Therapy Note' },
      }),
    }));

    const crisisBoundaryPayload = await crisisBoundaryResponse.json();
    expect(crisisBoundaryPayload.message).toContain('Crisis psychotherapy and standard psychotherapy should stay clearly separated');

    const telehealthResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what do i do with psych telehealth cpt coding?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Psych Follow-Up' },
      }),
    }));

    const telehealthPayload = await telehealthResponse.json();
    expect(telehealthPayload.message).toContain('For psych telehealth');
  }, 15000);

  it('answers documentation-support and billing red-flag cpt questions through the live endpoint', async () => {
    const addOnSupportResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what has to be documented to support 90833?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Psych Follow-Up' },
      }),
    }));

    const addOnSupportPayload = await addOnSupportResponse.json();
    expect(addOnSupportPayload.message).toContain('both services truly happened');

    const emVsComboResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what makes a note read like e/m only vs e/m + psychotherapy?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Psych Follow-Up' },
      }),
    }));

    const emVsComboPayload = await emVsComboResponse.json();
    expect(emVsComboPayload.message).toContain('E/M only versus E/M plus psychotherapy');

    const redFlagsResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what are red flags that a group therapy or crisis psychotherapy note is not enough for billing support?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Therapy Note' },
      }),
    }));

    const redFlagsPayload = await redFlagsResponse.json();
    expect(redFlagsPayload.message).toContain('Documentation red flags matter a lot');
  }, 15000);

  it('answers quick billing-support checklist questions through the live endpoint', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'before i sign this, give me a quick billing support checklist for 90833',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Psych Follow-Up' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('quick billing-support checklist');
    expect(payload.suggestions?.some((item: string) => item.includes('Likely family'))).toBe(true);
    expect(payload.suggestions?.some((item: string) => item.includes('verify before signing'))).toBe(true);
  }, 15000);

  it('answers scenario-aware outpatient billing sanity checks through the live endpoint', async () => {
    const newVsEstablishedResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'new vs established e/m for psych med management follow-up',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Psych Follow-Up' },
      }),
    }));

    const newVsEstablishedPayload = await newVsEstablishedResponse.json();
    expect(newVsEstablishedPayload.message).toContain('new versus established status');

    const collateralResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'collateral vs family therapy billing',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Therapy Note' },
      }),
    }));

    const collateralPayload = await collateralResponse.json();
    expect(collateralPayload.message).toContain('Collateral gathering or family discussion is not automatically family psychotherapy');

    const interactiveResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'interactive complexity red flags',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Therapy Note' },
      }),
    }));

    const interactivePayload = await interactiveResponse.json();
    expect(interactivePayload.message).toContain('Interactive complexity should be treated cautiously');

    const addOnResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: '90833 misuse warnings',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Psych Follow-Up' },
      }),
    }));

    const addOnPayload = await addOnResponse.json();
    expect(addOnPayload.message).toContain('Psychotherapy add-on misuse');

    const briefMedCheckResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'quick med management follow-up billing check',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Psych Follow-Up' },
      }),
    }));

    const briefMedCheckPayload = await briefMedCheckResponse.json();
    expect(briefMedCheckPayload.message).toContain('short outpatient med-management follow-up');
  }, 15000);

  it('flags pasted-note billing support concerns through the live endpoint', async () => {
    const addOnResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'does this note support 90833? Interval update: anxiety a little better. Medications reviewed. Continue sertraline 100 mg. Follow up in 4 weeks.',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Psych Follow-Up' },
      }),
    }));

    const addOnPayload = await addOnResponse.json();
    expect(addOnPayload.message).toContain('thin for a psychotherapy add-on family');

    const crisisResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'does this note support crisis psychotherapy 90839? Session note: patient was anxious and upset. Safety discussed. Follow up tomorrow.',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Therapy Note' },
      }),
    }));

    const crisisPayload = await crisisResponse.json();
    expect(crisisPayload.message).toContain('thin for crisis psychotherapy');
  }, 15000);

  it('uses review-context draft text for billing support concerns through the live endpoint', async () => {
    const familySpecificResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'does this note support 90833?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Outpatient Psych Follow-Up',
          currentDraftText: 'Interval update: anxiety a little better. Medications reviewed. Continue sertraline 100 mg. Follow up in 4 weeks.',
        },
      }),
    }));

    const familySpecificPayload = await familySpecificResponse.json();
    expect(familySpecificPayload.message).toContain('thin for a psychotherapy add-on family');

    const genericConcernResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'any billing concerns before i sign this?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Outpatient Psych Follow-Up',
          currentDraftText: 'Interval update: anxiety a little better. Medications reviewed. Continue sertraline 100 mg. Follow up in 4 weeks.',
        },
      }),
    }));

    const genericConcernPayload = await genericConcernResponse.json();
    expect(genericConcernPayload.message).toContain('billing-support concern');
  }, 15000);

  it('uses review-context draft text for inpatient psych medical-necessity questions through the live endpoint', async () => {
    const strongResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'does this admission read strong enough for inpatient psych?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          currentDraftText: 'Patient reports suicidal ideation with plan to overdose tonight and access to medications at home. Attempted hanging 2 days ago and returned to the ED today after outpatient safety planning failed. Has not eaten in 3 days, is not showering, missed 5 days of lithium, and was wandering outside unable to state address. Requires 24-hour inpatient observation because lower levels of care were insufficient.',
        },
      }),
    }));

    const strongPayload = await strongResponse.json();
    expect(strongPayload.message).toContain('reads strong');
    expect(strongPayload.references?.some((reference: { sourceType?: string }) => reference.sourceType === 'internal')).toBe(true);

    const thinResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'any inpatient medical necessity concerns before i sign?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          currentDraftText: 'Patient is unsafe and needs structure for stabilization. Admission recommended.',
        },
      }),
    }));

    const thinPayload = await thinResponse.json();
    expect(thinPayload.message).toContain('reads thin');
    expect(thinPayload.suggestions?.[0]).toContain('objective');
  }, 15000);

  it('answers explicit continued-monitoring wording questions conservatively through the live endpoint', async () => {
    const strongResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'does my current wording support continued monitoring clearly enough?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          currentDraftText: 'On interview today, patient continues to endorse suicidal ideation with plan to overdose if discharged, remains unable to contract for safety, and requires continued close observation with q15 checks while risk is reassessed.',
        },
      }),
    }));

    const strongPayload = await strongResponse.json();
    expect(strongPayload.message).toContain('reads reasonably supportive of continued monitoring');

    const thinResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'does this wording support continued monitoring clearly enough?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          currentDraftText: 'Patient remains on PEC. Continue monitoring.',
        },
      }),
    }));

    const thinPayload = await thinResponse.json();
    expect(thinPayload.message).toContain('Not clearly yet');
    expect(thinPayload.suggestions?.[1]).toContain('hold status');
  }, 15000);

  it('answers explicit reassessment and why-now inpatient wording questions through the live endpoint', async () => {
    const strongResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'does this note explain why continued inpatient is still needed now?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          currentDraftText: 'On interview today, patient still endorses suicidal ideation with plan and remains unable to contract for safety. Returned to the ED again within 24 hours of failed outpatient safety planning and continues to require inpatient close observation because less restrictive care remains insufficient.',
        },
      }),
    }));

    const strongPayload = await strongResponse.json();
    expect(strongPayload.message).toContain('solid first pass of reassessment');

    const thinResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'does this note show enough reassessment?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          currentDraftText: 'Patient was admitted yesterday for safety. Continue inpatient treatment.',
        },
      }),
    }));

    const thinPayload = await thinResponse.json();
    expect(thinPayload.message).toContain('Not clearly yet');
    expect(thinPayload.suggestions?.[0]).toContain('current reassessment frame');
  }, 15000);

  it('answers general anxiety diagnosis code questions directly', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what is the icd-10 for anxiety?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Inpatient Psych Progress Note' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('ICD-10-CM code for anxiety depends on the documented anxiety disorder');
    expect(payload.message).toContain('F41.9');
    expect(payload.message).toContain('F41.1');
  });

  it('answers generalized anxiety diagnosis code questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the diagnosis code for generalized anxiety disorder?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F41.1');
  });

  it('answers bipolar diagnosis code questions directly', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what is the icd 10 for bipolar disorder?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Inpatient Psych Progress Note' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('F31.9');
    expect(payload.message).toContain('F31.81');
  });

  it('answers PTSD diagnosis code questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the diagnosis code for ptsd?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F43.10');
    expect(response?.message).toContain('F43.11');
    expect(response?.message).toContain('F43.12');
  });

  it('answers ADHD diagnosis code questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the icd-10 for adhd?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F90.9');
    expect(response?.message).toContain('F90.0');
    expect(response?.message).toContain('F90.2');
  });

  it('answers insomnia diagnosis code questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the diagnosis code for insomnia?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('G47.00');
    expect(response?.message).toContain('F51.01');
  });

  it('answers substance use disorder diagnosis code questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the icd 10 for alcohol use disorder?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F10.90');
    expect(response?.message).toContain('F10.20');
  });

  it('answers ocd diagnosis code questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the icd 10 for ocd?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F42.9');
    expect(response?.message).toContain('F42.2');
  });

  it('answers adjustment disorder diagnosis code questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the diagnosis code for adjustment disorder?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F43.20');
    expect(response?.message).toContain('F43.23');
  });

  it('answers schizophrenia-spectrum diagnosis code questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the icd 10 for schizoaffective disorder?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F25.0');
    expect(response?.message).toContain('F25.1');
  });

  it('answers personality disorder diagnosis code questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the diagnosis code for borderline personality disorder?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F60.3');
  });

  it('answers stimulant use disorder diagnosis code questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the icd 10 for stimulant use disorder?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F15.90');
  });

  it('answers eating disorder diagnosis code questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the icd 10 for anorexia nervosa?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F50.00');
    expect(response?.message).toContain('F50.01');
    expect(response?.message).toContain('F50.02');
  });

  it('answers broader personality subtype questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the diagnosis code for narcissistic personality disorder?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F60.81');
  });

  it('answers delusional disorder questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the icd 10 for delusional disorder?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F22');
  });

  it('answers cocaine use disorder questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the diagnosis code for cocaine use disorder?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F14.10');
    expect(response?.message).toContain('F14.20');
  });

  it('answers acute stress disorder questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the icd 10 for acute stress disorder?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F43.0');
  });

  it('answers autism spectrum disorder questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the diagnosis code for autism spectrum disorder?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F84.0');
  });

  it('answers dissociative identity disorder questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the icd 10 for dissociative identity disorder?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F44.81');
  });

  it('answers somatic symptom disorder questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the diagnosis code for somatic symptom disorder?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F45.1');
  });

  it('answers nightmare disorder questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the icd 10 for nightmare disorder?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F51.5');
  });

  it('answers neurocognitive disorder questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the diagnosis code for dementia?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F03.A0');
    expect(response?.message).toContain('F03.B0');
    expect(response?.message).toContain('F03.C0');
  });

  it('answers elimination disorder questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the icd 10 for enuresis?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F98.0');
  });

  it('answers gender-dysphoria-related questions with a terminology caveat', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the diagnosis code for gender dysphoria?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F64.0');
    expect(response?.message).toContain('F64.9');
  });

  it('answers sexual dysfunction questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the icd 10 for premature ejaculation?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F52.4');
  });

  it('answers paraphilic disorder questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the diagnosis code for voyeurism?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F65.3');
  });

  it('answers persistent depressive disorder questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the icd 10 for dysthymia?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F34.1');
  });

  it('answers agoraphobia and panic subtype questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the diagnosis code for panic disorder with agoraphobia?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F40.01');
    expect(response?.message).toContain('F40.00');
  });

  it('answers bipolar severe depressive episode questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the icd 10 for bipolar disorder current episode depressed severe without psychotic features?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F31.4');
  });

  it('routes bipolar severe depressive episode coding through the live endpoint correctly', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what is the icd 10 for bipolar disorder current episode depressed severe without psychotic features?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Inpatient Psych Progress Note' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('F31.4');
  });

  it('answers learning and language disorder questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the diagnosis code for expressive language disorder?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F80.1');
  });

  it('answers disruptive disorder questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the icd 10 for oppositional defiant disorder?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F91.3');
  });

  it('answers alcohol remission branch questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the diagnosis code for alcohol dependence in remission?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F10.21');
    expect(response?.message).toContain('F10.11');
  });

  it('answers opioid withdrawal branch questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the icd 10 for opioid dependence with withdrawal?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F11.23');
  });

  it('answers MDD remission branch questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the diagnosis code for recurrent major depressive disorder in full remission?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F33.42');
  });

  it('answers cyclothymic disorder questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the icd 10 for cyclothymic disorder?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F34.0');
  });

  it('answers bipolar remission specifier questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the diagnosis code for bipolar disorder in partial remission most recent episode depressed?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F31.75');
  });

  it('answers body dysmorphic disorder questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the icd 10 for body dysmorphic disorder?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F45.22');
  });

  it('answers impulse-control disorder questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the diagnosis code for intermittent explosive disorder?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F63.81');
  });

  it('answers glossary-style HPI questions directly', () => {
    const response = buildGeneralKnowledgeHelp('what does hpi mean?', {});

    expect(response?.message).toContain('HPI means History of Present Illness');
  });

  it('answers glossary-style H&P questions directly', () => {
    const response = buildGeneralKnowledgeHelp('what does h&p mean?', {});

    expect(response?.message).toContain('H&P means History and Physical');
  });

  it('answers specific recurrent severe MDD coding questions directly', () => {
    const response = buildGeneralKnowledgeHelp(
      'what is the icd 10 code for recurrent severe mdd without psychotic features?',
      { providerAddressingName: 'Daniel Hale' }
    );

    expect(response?.message).toContain('F33.2');
  });

  it('answers H&P versus consult questions directly', () => {
    const response = buildGeneralKnowledgeHelp('what is the difference between h&p and consult?', {});

    expect(response?.message).toContain('An H&P is the primary history and physical');
    expect(response?.message).toContain('A consult note is narrower');
  });

  it('answers A1c questions directly', () => {
    const response = buildGeneralKnowledgeHelp('what is A1c?', {});

    expect(response?.message).toContain('hemoglobin A1c');
  });

  it('answers PHQ-9 questions directly', () => {
    const response = buildReferenceLookupHelp('what is PHQ-9?', {});

    expect(response?.message).toContain('nine-item depression screening questionnaire');
    expect((response?.references?.length || 0) > 0).toBe(true);
  });

  it('answers psych medication reference questions directly', () => {
    const response = buildReferenceLookupHelp('what are the side effects of olanzapine?', {});

    expect(response?.message).toContain('weight gain');
    expect(response?.references?.[0]?.url).toContain('medlineplus.gov');
  });

  it('returns trusted references in reference lookup mode', () => {
    const response = buildReferenceLookupHelp('what is the icd 10 code for recurrent severe mdd without psychotic features?', {
      providerAddressingName: 'Daniel Hale',
    });

    expect(response?.message).toContain('F33.2');
    expect(response?.references?.[0]?.url).toContain('cdc.gov');
    expect(response?.suggestions?.some((item) => item.includes('reference lookup'))).toBe(true);
  });

  it('uses the explicit unknown-question fallback instead of generic workflow guidance', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'Do you know how to code zebras in ICD-10?',
        context: { noteType: 'Inpatient Psych Progress Note', providerAddressingName: 'Daniel Hale' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toBe("No, but I'll find out how I can learn how to.");
    expect(payload.suggestions?.[0]).toContain('Beta Feedback');
    expect(payload.actions?.[0]?.type).toBe('send-beta-feedback');
    expect(payload.actions?.[0]?.label).toBe('Teach Vera this');
  });

  it('recognizes abbreviation-heavy route questions through the live endpoint', async () => {
    const hpResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'reference-lookup',
        message: 'what does h & p mean?',
        context: { providerAddressingName: 'Daniel Hale' },
      }),
    }));
    const hpPayload = await hpResponse.json();
    expect(hpPayload.message).toContain('H&P means History and Physical');

    const dxResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'can you help me with dx coding for mdd?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Inpatient Psych Progress Note' },
      }),
    }));
    const dxPayload = await dxResponse.json();
    expect(dxPayload.message).toContain('ICD-10-CM code for major depressive disorder');
  });

  it('uses the structured diagnosis catalog when a psych coding question is not explicitly hardcoded yet', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what is the icd 10 for catatonia?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Inpatient Psych Progress Note' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('Catatonia');
    expect(payload.message).toContain('F06.1');
    expect(payload.modeMeta?.mode).toBe('workflow-help');
  });

  it('uses the structured diagnosis catalog for substance-induced psychosis coding questions in the live endpoint', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what is the diagnosis code for substance induced psychosis?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Inpatient Psych Progress Note' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('Substance/medication-induced psychotic disorder');
    expect(payload.message).toContain('F1x.95');
    expect(payload.modeMeta?.mode).toBe('workflow-help');
  });

  it('uses the priority structured diagnosis path for hoarding disorder in the live endpoint', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what is the diagnosis code for hoarding disorder?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Inpatient Psych Progress Note' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('Hoarding disorder');
    expect(payload.message).toContain('F42.3');
  });

  it('uses the priority structured diagnosis path for bipolar I disorder in the live endpoint', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what is the diagnosis code for bipolar I disorder?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Inpatient Psych Progress Note' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('Bipolar I disorder');
    expect(payload.message).toContain('F31.x');
  });

  it('uses the priority structured diagnosis path for substance-induced depressive disorder in the live endpoint', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what is the diagnosis code for substance induced depressive disorder?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Inpatient Psych Progress Note' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('Substance/medication-induced depressive disorder');
    expect(payload.message).toContain('F1x.94');
  });

  it('uses the priority structured diagnosis path for conduct disorder in the live endpoint', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what is the diagnosis code for conduct disorder?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Inpatient Psych Progress Note' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('Conduct disorder');
    expect(payload.message).toContain('F91.x');
  });

  it('uses the priority structured diagnosis path for specific learning disorder in the live endpoint', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what is the diagnosis code for specific learning disorder?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Inpatient Psych Progress Note' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('Specific learning disorder');
    expect(payload.message).toContain('F81.x');
  });

  it('uses the priority structured diagnosis path for PMDD in the live endpoint', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what is the diagnosis code for pmdd?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Inpatient Psych Progress Note' },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('Premenstrual dysphoric disorder');
    expect(payload.message).toContain('N94.3');
  });

  it('answers outpatient-heavy adjustment and anxiety subtype questions through the live endpoint', async () => {
    const adjustmentResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what is the diagnosis code for adjustment disorder with mixed disturbance of emotions and conduct?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Therapy Note' },
      }),
    }));

    const adjustmentPayload = await adjustmentResponse.json();
    expect(adjustmentPayload.message).toContain('F43.25');

    const socialAnxietyResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what is the diagnosis code for social anxiety disorder?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Therapy Note' },
      }),
    }));

    const socialAnxietyPayload = await socialAnxietyResponse.json();
    expect(socialAnxietyPayload.message).toContain('F40.10');
    expect(socialAnxietyPayload.message).toContain('F40.11');

    const phobiaResponse = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'what is the diagnosis code for specific phobia?',
        context: { providerAddressingName: 'Daniel Hale', noteType: 'Outpatient Therapy Note' },
      }),
    }));

    const phobiaPayload = await phobiaResponse.json();
    expect(phobiaPayload.message).toContain('F40.298');
  });
});
