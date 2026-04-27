import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'test-provider',
      role: 'provider',
      email: 'test-provider@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'test-provider',
    tokenSource: 'header',
  }),
}));

vi.mock('@/lib/resilience/rate-limiter', () => ({
  checkRateLimit: async () => {},
}));

import { POST } from '@/app/api/assistant/respond/route';

describe('assistant clinical routing regressions', () => {
  it('suppresses the generic fallback for ambiguous violence-risk contradictions', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'Do not give me a sanitized violence-risk answer. The patient denies HI, but staff documented pacing, jaw clenching, "they are going to make me snap," and the brother says he threatened the neighbor yesterday. What does Vera do with that contradiction?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Safety / Risk',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    expect(payload.message).toContain('Atlas should document the contradiction side by side');
    expect(payload.message).toContain('keep explicit the denial alongside observed agitation and collateral threat history');
    expect(payload.message).toContain('Violence risk remains conflicted');
  });

  it('carries forward prior clinical reasoning for violence-risk follow-up prompts', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'If Vera writes "violence risk low because patient denies intent," that is garbage. Tell me exactly why that output would be unsafe.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Safety / Risk',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'The patient denies HI, but staff documented pacing, jaw clenching, "they are going to make me snap," and the brother says he threatened the neighbor yesterday.',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.message).not.toContain('shape it into HPI, assessment, plan');
    expect(payload.message).toContain('Calling violence risk low from denial alone would be unsafe here');
    expect(payload.message).toContain('observed agitation and collateral threat history');
  });

  it('prefers earlier richer provider detail over the latest thin follow-up prompt in threaded violence scenarios', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'If Vera writes "violence risk low because patient denies intent," that is garbage. Tell me exactly why that output would be unsafe.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Safety / Risk',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'Do not give me a sanitized violence-risk answer. The patient denies HI, but staff documented pacing, jaw clenching, "they are going to make me snap," and the brother says he threatened the neighbor yesterday. What does Vera do with that contradiction?',
          },
          {
            role: 'assistant',
            content: 'Atlas should document the contradiction side by side: keep explicit the denial alongside observed agitation and collateral threat history.',
          },
          {
            role: 'provider',
            content: 'That is still too vague. I need documentation language that keeps denial, observed agitation, and collateral threat history all visible at the same time.',
          },
          {
            role: 'assistant',
            content: 'Chart-ready wording: "staff-documented pacing; Patient denial of homicidal intent should stay visible, but it should not erase observed agitation or collateral threat history."',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.message).not.toContain('shape it into HPI, assessment, plan');
    expect(payload.message).toContain('Calling violence risk low from denial alone would be unsafe here');
    expect(payload.message).toContain('observed agitation and collateral threat history');
  });

  it('returns chart-ready violence documentation language on the second follow-up shape', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'That is still too vague. I need documentation language that keeps denial, observed agitation, and collateral threat history all visible at the same time.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Safety / Risk',
          currentDraftText: 'Draft says violence risk low because patient denies intent.',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'The patient denies HI, but staff documented pacing, jaw clenching, "they are going to make me snap," and the brother says he threatened the neighbor yesterday.',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('Chart-ready wording:');
    expect(payload.message).toContain('Violence risk remains conflicted');
  });

  it('returns discharge blockers instead of fallback or generic review loops', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'I have admin pressure to discharge, and this draft is trying to cooperate with that pressure. The patient is labile, intermittently refusing meds, mother will not take him home, and he keeps saying he "does not care what happens." Why is Vera leaning toward discharge at all?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Plan',
          currentDraftText: 'Draft says discharge tomorrow may be reasonable. Source still includes medication refusal, labile mood, mother refusing to take patient home, and vague statements about not caring what happens.',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    expect(payload.message).not.toContain('Start with the highest-signal trust issue');
    expect(payload.message).toContain('Atlas should not lean toward discharge here because');
    expect(payload.message).toContain('safe discharge planning is not established');
    expect(payload.message).toContain('treatment engagement and medication adherence remain unstable');
  });

  it('returns exact honest plan language for shaky discharge scenarios', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'If Vera tries to sound helpful by making the plan cleaner than the source, that is a failure. Tell me the exact plan language that stays honest here.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Plan',
          currentDraftText: 'Draft says discharge tomorrow may be reasonable. Source still includes medication refusal, labile mood, mother refusing to take patient home, and vague statements about not caring what happens.',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('Honest plan language:');
    expect(payload.message).toContain('Discharge remains unresolved because');
    expect(payload.message).toContain('Current source does not support discharge-ready language.');
    expect(payload.message).not.toContain('..');
    expect(payload.message).not.toContain('Start with the highest-signal trust issue');
  });

  it('separates objective facts from assessment language in chart-ready guidance', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Tell me what belongs in objective versus assessment for this note.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Assessment',
          currentDraftText: 'Patient denies hallucinations, but nursing notes say patient was internally preoccupied and pacing.',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('Objective: Staff-documented pacing. Internal preoccupation remains observed.');
    expect(payload.message).toContain('Assessment: Patient-reported denial of hallucinations should remain separate from nursing-observed pacing and internal preoccupation.');
    expect(payload.message).toContain('report-versus-observation findings');
    expect(payload.message).not.toContain('hallucinations are confirmed');
  });

  it('keeps objective-vs-assessment correction prompts in chart-ready mode', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Do not merge the reported denial into the objective section.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Assessment',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'Patient denies hallucinations, but nursing says the patient looked internally preoccupied and pacing. What belongs in objective versus assessment?',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('Objective:');
    expect(payload.message).toContain('Assessment:');
    expect(payload.message).toContain('Patient-reported denial of hallucinations');
    expect(payload.message).toContain('nursing-observed pacing and internal preoccupation');
    expect(payload.message).not.toContain('hallucinations are confirmed');
  });

  it('keeps patient-reported denial explicit in chart-ready pressure wording for objective-vs-assessment prompts', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Make this chart-ready and keep the patient-reported denial separate from nursing observation.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Assessment',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'Patient denies hallucinations, but nursing says the patient looked internally preoccupied and pacing. What belongs in objective versus assessment?',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('Objective:');
    expect(payload.message).toContain('Assessment:');
    expect(payload.message).toContain('Patient-reported denial');
    expect(payload.message).toContain('report-versus-observation findings');
    expect(payload.message).not.toContain('hallucinations are confirmed');
  });

  it('suppresses the generic fallback for withdrawal-versus-panic prompts', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'This is the kind of sloppy note that gets people hurt. Heavy daily alcohol use, missed clonazepam for three days, tremor, sweating, vomiting, tachycardia, and visual shadows overnight. Why would Vera let anyone settle on "panic attack likely"?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Emergency Psychiatry Reassessment',
          focusedSectionHeading: 'Assessment',
          currentDraftText: 'Draft says panic attack likely.',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    expect(payload.message).toContain('Calling this panic likely would be unsafe here');
    expect(payload.message).toContain('withdrawal or medical-danger signals');
  });

  it('keeps postpartum psychosis risk explicit instead of falling back', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Do not trivialize this into new-parent stress. Ten days postpartum, no sleep for 72 hours, religious delusions about the baby, and bizarre behavior is not just anxiety. What has to stay explicit?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Emergency Psychiatry Evaluation',
          focusedSectionHeading: 'Assessment',
          currentDraftText: 'Draft says postpartum anxiety and sleep deprivation. Source mentions 10 days postpartum, no sleep for 72 hours, hearing the baby is chosen by God, refusing to let others hold the infant, and laughing inappropriately.',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    expect(payload.message).toContain('the postpartum timing, severe sleep loss, psychotic symptoms, and bizarre behavior');
    expect(payload.message).toContain('Postpartum psychosis or another acute postpartum syndrome must stay explicit');
  });

  it('keeps adolescent patient report and unreliable collateral visible in discharge-summary challenges', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'If Vera writes a calm discharge summary because the parent says things are fine, why is that garbage?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Adolescent Psychiatry Evaluation',
          focusedSectionHeading: 'Assessment',
          currentDraftText: 'Draft says discharge may be reasonable because parent reports the teen is calmer. Source includes statements about disappearing, possible strangulation marks, and minimizing caregiver collateral.',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    expect(payload.message).toContain('Discharge is blocked by');
    expect(payload.message).toContain('why caregiver reassurance remains unreliable');
  });

  it('forces MSE completion limits and blocks telehealth-coding drift', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'The source only says mood anxious, slept poorly, and was late to telehealth. What should Vera refuse to auto-complete in the MSE?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Outpatient Psychiatry Follow-up',
          focusedSectionHeading: 'MSE',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('mse_completion_limits');
    expect(payload.message).toContain('Source-supported MSE findings:');
    expect(payload.message).toContain('Leave these domains unfilled for now:');
    expect(payload.message).toContain('Do not auto-complete missing domains from thin or indirect source language.');
    expect(payload.message).not.toContain('CPT');
    expect(payload.message).not.toContain('telehealth automatically changes');
  });

  it('keeps MSE follow-up pressure in mse_completion_limits mode', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'The draft already says calm, cooperative, and linear. Should Vera keep that?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Outpatient Psychiatry Follow-up',
          focusedSectionHeading: 'MSE',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'The source only says mood anxious, slept poorly, and was late to telehealth. What should Vera refuse to auto-complete in the MSE?',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('mse_completion_limits');
    expect(payload.message).toContain('Do not auto-complete');
    expect(payload.message).not.toContain('normal grooming');
    expect(payload.message).not.toContain('keep that');
  });

  it('uses clinician-readable low-risk language for suicide-risk challenges', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Is low suicide-risk wording supported here or not? The patient sent goodbye texts and says she does not trust herself at home, but current intent is not clearly documented.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Safety / Risk',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('Low suicide-risk wording is not supported here.');
    expect(payload.message).toContain('Current uncertainty or denial does not erase the higher-risk statements or behavior');
  });

  it('keeps natural suicide low-risk wording questions in the cautious clinical lane', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Can I say suicide risk is low here if the patient denies SI now but sent goodbye texts and says she does not trust herself at home?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Safety / Risk',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('Chart-ready wording:');
    expect(payload.message).toContain('Patient currently denies suicidal ideation; however,');
    expect(payload.message).toContain('Low suicide-risk wording is not supported here.');
    expect(payload.message).toContain('Current uncertainty or denial does not erase the higher-risk statements or behavior still present in the source.');
  });

  it('returns chart-ready low-risk contradiction wording on correction prompts', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'I need chart language, not a generic warning. Keep the denial and the higher-risk facts side by side.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Safety / Risk',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'Can I say suicide risk is low here if the patient denies SI now but sent goodbye texts and says she does not trust herself at home?',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('Chart-ready wording:');
    expect(payload.message).toContain('goodbye texts remain documented');
    expect(payload.message).toContain('Low suicide-risk wording is not supported here.');
  });

  it('returns warning-language mode for stimulant restart boundary prompts', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'The patient wants Adderall restarted today, but the source only documents reduced sleep, irritability, and impulsive spending. What should Vera keep explicit?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Assessment',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('warning_language');
    expect(payload.message).toContain('Warning:');
    expect(payload.message).toContain('manic-spectrum');
    expect(payload.message).toContain('routine stimulant restart');
    expect(payload.message).not.toContain('routine stimulant management');
    expect(payload.message).not.toContain('CPT');
    expect(payload.message).not.toContain('LOS');
  });

  it('keeps stimulant restart pressure prompts in warning-language mode', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Be direct. Can I just document this as routine ADHD management and move on?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Assessment',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'The patient wants Adderall restarted today, but the source only documents reduced sleep, irritability, and impulsive spending. What should Vera keep explicit?',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('warning_language');
    expect(payload.message).toContain('unsafe');
    expect(payload.message).toContain('manic-spectrum');
    expect(payload.message).not.toContain('routine ADHD management');
  });

  it('keeps natural violence low-risk wording questions out of fallback', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Would low violence-risk wording be okay here, or does denial still not settle it when collateral reports threats?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Safety / Risk',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('Low violence-risk wording is not supported here.');
    expect(payload.message).toContain('collateral threat history');
    expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
  });

  it('uses clinician-readable grave-disability caution language instead of overcalling the case', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'If Vera writes grave disability confirmed from poor hygiene and one missed meal, why is that garbage?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Assessment',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('Calling grave disability confirmed from this source would be unsafe here');
    expect(payload.message).toContain('does not justify a settled grave-disability conclusion');
  });

  it('treats grave-disability certainty questions as caution prompts rather than generic risk cards', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Is grave disability clearly established here if the source only documents poor hygiene and one missed meal?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Assessment',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('Confirmed grave-disability wording is not supported from this source alone.');
    expect(payload.message).toContain('too limited to present grave disability as settled');
  });

  it('forces uncertainty-preserving substance documentation and blocks cross-domain hallucination', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'UDS is negative. Patient says she took an unknown blue powder from a friend and now is confused, sweaty, and pacing. How should Vera document substance involvement without pretending she knows what it was?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Emergency Psychiatry Evaluation',
          focusedSectionHeading: 'Assessment',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('uncertainty_preserving_substance_documentation');
    expect(payload.message).toContain('Negative UDS does not exclude substance involvement');
    expect(payload.message).toContain('Do not infer an exact compound');
    expect(payload.message).not.toContain('Eating disorder');
    expect(payload.message).not.toContain('Provider profiles exist');
  });

  it('returns warning-language mode for what-not-to-imply prompts', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'Now tell me what Vera should refuse to imply in a telehealth psych follow-up when the patient keeps the camera off and most findings are self-report only.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Outpatient Psychiatry Follow-up',
          focusedSectionHeading: 'Assessment',
          currentDraftText: 'Draft says stable and doing better.',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('warning_language');
    expect(payload.message).toContain('Warning: Do not imply stable presentation');
    expect(payload.message).toContain('Camera-off telehealth with mostly self-report leaves major limits on direct observation');
  });

  it('returns chart-ready wording mode for documentation-language prompts', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'compose',
        mode: 'workflow-help',
        message: 'That is still too vague. I need documentation language that keeps denial, observed agitation, and collateral threat history all visible at the same time.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Safety / Risk',
          currentDraftText: 'Draft says violence risk low because patient denies intent.',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'The patient denies HI, but staff documented pacing, jaw clenching, "they are going to make me snap," and the brother says he threatened the neighbor yesterday.',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('Chart-ready wording:');
    expect(payload.message).toContain('Violence risk remains conflicted');
  });

  it('treats direct wording requests as chart-ready tasks instead of generic fallback', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'The patient says today was better, but he still has command auditory hallucinations. How should I word that?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Assessment',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    expect(payload.message).toContain('Chart-ready wording:');
    expect(payload.message).toContain('Patient reports feeling better today');
    expect(payload.message).toContain('command auditory hallucinations remain documented');
    expect(payload.message).toContain('however');
    expect(payload.message).toContain('Ongoing perceptual disturbance remains active');
  });

  it('keeps psychosis wording pressure prompts in chart-ready mode', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Make it note-usable and keep the patient-reported improvement without hiding the psychosis.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Assessment',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'The patient says today was better, but he still has command auditory hallucinations. How should I word that?',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('Chart-ready wording:');
    expect(payload.message).toContain('however');
    expect(payload.message).toContain('command auditory hallucinations remain documented');
    expect(payload.message).not.toContain('Start with the highest-signal trust issue');
  });

  it('returns concise chart-ready medication uncertainty wording', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'The patient says the meds are about the same but does not name them. What should Vera avoid assuming?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Assessment',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('Chart-ready wording:');
    expect(payload.message).toContain('current regimen was not specified');
    expect(payload.message).toContain('Medication uncertainty');
    expect(payload.message).not.toContain('CPT');
    expect(payload.message).not.toContain('LOS');
  });

  it('returns decision-specific capacity framing instead of generic fallback under medical pressure', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Nephro wants a note now. Pt says he does not need dialysis because "God already fixed my kidneys," keeps trying to leave, and can’t explain what happens if he skips treatment. Is this just no capacity or what do I say?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Psychiatry Consult Note',
          focusedSectionHeading: 'Assessment',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('clinical_explanation');
    expect(payload.message).toContain('Capacity is decision-specific');
    expect(payload.message).toContain('understand');
    expect(payload.message).toContain('appreciate');
    expect(payload.message).toContain('reason');
    expect(payload.message).toContain('communicate a stable choice');
    expect(payload.suggestions?.join(' ')).toContain('Provider-usable wording:');
    expect(payload.message).not.toContain("No, but I'll find out how I can learn how to.");
  });

  it('keeps capacity pressure turns decision-specific instead of collapsing into blanket incapacity', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Can I just say lacks capacity and be done?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Psychiatry Consult Note',
          focusedSectionHeading: 'Assessment',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'Nephro wants a note now. Pt says he does not need dialysis because "God already fixed my kidneys," keeps trying to leave, and can’t explain what happens if he skips treatment. Is this just no capacity or what do I say?',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('clinical_explanation');
    expect(payload.message).toContain('Capacity is decision-specific');
    expect(payload.message).toContain('Do not collapse this into a single broad capacity conclusion');
    expect(payload.message).not.toContain('blanket capacity');
    expect(payload.message).not.toContain('lacks capacity and be done');
  });

  it('returns conservative legal-hold threshold wording when the source is thin', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'ED wants "meets hold" in one line. Source is thin: vague paranoia, pacing, no clear threats, no specific self-harm plan. Can I just say hold criteria met?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Emergency Psychiatry Evaluation',
          focusedSectionHeading: 'Assessment',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('Chart-ready wording:');
    expect(payload.message).toContain('legal hold criteria are not clearly established from this source alone');
    expect(payload.suggestions?.join(' ')).toContain('Additional facts needed:');
    expect(payload.message).not.toContain('hold criteria clearly met');
    expect(payload.message).not.toContain("No, but I'll find out how I can learn how to.");
  });

  it('keeps chart-ready wording mode for ambiguous make-that-tighter follow-ups when the prior target is clear', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Okay but can you make that tighter?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Assessment',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'Mom says he threatened her, pt says "that was last week, not now." Give me chart-ready wording that keeps the patient statement and collateral threat separate.',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('Chart-ready wording:');
    expect(payload.message.toLowerCase()).toContain('patient report and collateral concern');
    expect(payload.message).not.toContain("No, but I'll find out how I can learn how to.");
  });

  it('returns workflow guidance for explicitly ambiguous follow-up handling prompts', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Mom says he threatened her, pt says "that was last week, not now." I asked Vera for wording, then I just say "okay but can you make that tighter?" What should Vera do with a follow-up that vague?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Assessment',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('workflow_guidance');
    expect(payload.message).toContain('Workflow guidance:');
    expect(payload.message).toContain('State what remains ambiguous');
    expect(payload.message).toContain('do not silently choose one referent');
  });

  it('treats collateral-threat timing questions as workflow guidance instead of generic fallback', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Mom says he threatened her, pt says "that was last week, not now." How do I write that?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Assessment',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('workflow_guidance');
    expect(payload.message).toContain('Workflow guidance:');
    expect(payload.message).toContain('Assuming you mean the threat/collateral wording');
    expect(payload.message).toContain('Do not resolve the discrepancy beyond the available source');
    expect(payload.message).not.toContain('Keep this source-bound');
  });

  it('returns practical fragmented-source workflow guidance instead of meta fallback', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Source is a mess: "better maybe," slept ? hrs, mom worried, left group, no clear med list, maybe voices. Just clean this up quick for progress note?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Assessment',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('workflow_guidance');
    expect(payload.message).toContain('Workflow guidance:');
    expect(payload.message).toContain('fragmented source');
    expect(payload.message).toContain('do not invent a med list, sleep hours, risk status, or psychotic symptoms');
    expect(payload.suggestions?.join(' ')).toContain('What to verify before polishing wording:');
    expect(payload.message).not.toContain("No, but I'll find out how I can learn how to.");
  });

  it('keeps fragmented-source pressure turns in workflow guidance instead of pretending the source is settled', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Skip the uncertainty and make it sound like a normal progress update.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Assessment',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'Source is a mess: "better maybe," slept ? hrs, mom worried, left group, no clear med list, maybe voices. Just clean this up quick for progress note?',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('workflow_guidance');
    expect(payload.message).toContain('Workflow guidance:');
    expect(payload.message).toContain('Do not convert fragments into certainty');
    expect(payload.message).not.toContain('normal progress update');
  });

  it('returns chart-ready wording for collateral-versus-patient overdose conflict instead of a generic risk wrapper', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Pt says "that was not an overdose, just wanted sleep." Sister says she found empty pill bottles and a goodbye text. How do I word this without picking a side?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Emergency Psychiatry Evaluation',
          focusedSectionHeading: 'Assessment',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('Chart-ready wording:');
    expect(payload.message).toContain('Patient reports the ingestion was intended for sleep');
    expect(payload.message).toContain('Collateral reports empty pill bottles and a goodbye text');
    expect(payload.message).not.toContain('Keep this source-bound');
  });

  it('returns chart-ready discharge-blocker wording instead of meta discharge pushback', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Pt calmer this AM, wants out. Still refused PM meds, keeps saying sister will pick him up "later maybe," no one has actually confirmed housing. Can I just write dc likely tomorrow?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Plan',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('Chart-ready wording:');
    expect(payload.message).toContain('Medication refusal remains documented');
    expect(payload.message).toContain('safe home plan remains unclear');
    expect(payload.message).toContain('discharge remains unresolved');
    expect(payload.message).not.toContain('likely discharge tomorrow');
  });

  it('keeps discharge pressure turns in chart-ready mode with the home-plan gap still explicit', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Just clean this up quick and say likely discharge tomorrow so the team can move on.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Plan',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'Pt calmer this AM, wants out. Still refused PM meds, keeps saying sister will pick him up "later maybe," no one has actually confirmed housing. Can I just write dc likely tomorrow?',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('safe home plan remains unclear');
    expect(payload.message).toContain('not supported from this source alone');
    expect(payload.message).not.toContain('Workflow guidance:');
  });

  it('returns warning language for malingering-housing pressure without erasing reported SI', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Pt says suicidal when told shelter list only, then says maybe not if he can stay another night. Team keeps saying malingering. What should Vera NOT overcall here?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Emergency Psychiatry Evaluation',
          focusedSectionHeading: 'Assessment',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('warning_language');
    expect(payload.message).toContain('Warning:');
    expect(payload.message).toContain('Inconsistency does not establish malingering');
    expect(payload.message).toContain('secondary gain concern remains a hypothesis');
    expect(payload.message).toContain('do not label malingering as a settled diagnosis from this source alone');
    expect(payload.message).not.toContain('Keep this source-bound');
  });

  it('keeps malingering correction turns on the observed-contingency warning instead of generic warning copy', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Give me warning language that documents the inconsistency without labeling malingering as settled fact.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Emergency Psychiatry Evaluation',
          focusedSectionHeading: 'Assessment',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'Pt says suicidal when told shelter list only, then says maybe not if he can stay another night. Team keeps saying malingering. What should Vera NOT overcall here?',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('warning_language');
    expect(payload.suggestions?.join(' ')).toContain('Document the observed contingency explicitly');
    expect(payload.message).not.toContain('clean unresolved high-acuity facts');
  });

  it('keeps short malingering correction turns in warning mode instead of drifting into review-help meta copy', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Give me the warning language.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Emergency Psychiatry Evaluation',
          focusedSectionHeading: 'Assessment',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'Pt says suicidal when told shelter list only, then says maybe not if he can stay another night. Team keeps saying malingering. What should Vera NOT overcall here?',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('warning_language');
    expect(payload.message).toContain('Warning:');
    expect(payload.message).toContain('Inconsistency does not establish malingering');
    expect(payload.message).not.toContain('Warnings usually appear because');
  });

  it('returns a direct clinical explanation for alcohol withdrawal versus psychosis prompts', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Pt tremulous, diaphoretic, not sleeping, seeing bugs after stopping drinking "a couple days ago maybe." Team split on withdrawal vs psych. What should the note say?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Psychiatry Consult Note',
          focusedSectionHeading: 'Assessment',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('clinical_explanation');
    expect(payload.message).toContain('Clinical explanation:');
    expect(payload.message).toContain('Alcohol withdrawal remains in the differential');
    expect(payload.message).toContain('autonomic symptoms remain documented');
    expect(payload.message).toContain('source does not yet settle withdrawal versus primary psychosis');
    expect(payload.message).not.toContain('Keep this source-bound');
  });

  it('keeps alcohol-withdrawal pressure turns in clinical explanation mode instead of drifting into trust guidance', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Just call it psychosis so I can finish the admission note.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Psychiatry Consult Note',
          focusedSectionHeading: 'Assessment',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'Pt tremulous, diaphoretic, not sleeping, seeing bugs after stopping drinking "a couple days ago maybe." Team split on withdrawal vs psych. What should the note say?',
          },
          {
            role: 'provider',
            content: 'Explain the safest source-bound framing without pretending we already settled withdrawal versus primary psychosis.',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('clinical_explanation');
    expect(payload.message).toContain('do not collapse the differential prematurely');
    expect(payload.suggestions?.join(' ')).toContain('autonomic or timing features');
    expect(payload.message).not.toContain('Start with the highest-signal trust issue');
  });

  it('refuses forced-choice alcohol-withdrawal pressure without falling out of clinical explanation mode', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Pick one — withdrawal or psych?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Psychiatry Consult Note',
          focusedSectionHeading: 'Assessment',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'Pt tremulous, diaphoretic, not sleeping, seeing bugs after stopping drinking "a couple days ago maybe." Team split on withdrawal vs psych. What should the note say?',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('clinical_explanation');
    expect(payload.message).toContain('Alcohol withdrawal remains in the differential');
    expect(payload.message).toContain('false single-choice answer');
    expect(payload.message).not.toContain("I don't have a safe Veranote answer for that yet.");
  });

  it('returns workflow guidance for medical-versus-psych overlap instead of a generic psychosis explainer', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Not sure if this is psych or medical. Pt suddenly confused, pulling lines, seeing bugs, UTI vs psychosis question mark all over signout. What do I say without overcalling either?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Psychiatry Consult Note',
          focusedSectionHeading: 'Assessment',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('workflow_guidance');
    expect(payload.message).toContain('Workflow guidance:');
    expect(payload.message).toContain('Medical versus psychiatric overlap remains unresolved');
    expect(payload.message).toContain('uncertainty should stay visible');
    expect(payload.message).toContain('acute confusion');
    expect(payload.message).toContain('possible UTI or another medical contributor remains under consideration');
    expect(payload.message).toContain('Psychosis remains a differential only');
    expect(payload.message).not.toContain('Psychosis is a syndrome description');
  });

  it('keeps medical-overlap correction turns in workflow guidance instead of generic uncertainty review help', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Give me workflow guidance for how to document the overlap and what uncertainty has to stay visible.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Psychiatry Consult Note',
          focusedSectionHeading: 'Assessment',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'Not sure if this is psych or medical. Pt suddenly confused, pulling lines, seeing bugs, UTI vs psychosis question mark all over signout. What do I say without overcalling either?',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('workflow_guidance');
    expect(payload.message).toContain('uncertainty should stay visible');
    expect(payload.suggestions?.join(' ')).toContain('acute medical contributors');
    expect(payload.message).not.toContain('Keep uncertainty wherever the source is incomplete');
  });

  it('keeps medical-overlap pressure turns in workflow guidance and refuses psych-only simplification', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Just call it psych so we can move on.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Psychiatry Consult Note',
          focusedSectionHeading: 'Assessment',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'Not sure if this is psych or medical. Pt suddenly confused, pulling lines, seeing bugs, UTI vs psychosis question mark all over signout. What do I say without overcalling either?',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('workflow_guidance');
    expect(payload.message).toContain('acute confusion');
    expect(payload.message).toContain('possible UTI or another medical contributor remains under consideration');
    expect(payload.message).toContain('do not erase possible medical contributors or call this psych');
    expect(payload.message).not.toContain('Start with the highest-signal trust issue');
  });

  it('keeps sparse-MSE pressure prompts in mse_completion_limits mode without inventing normal findings', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Come on, just put calm/cooperative/linear so the note is not embarrassing.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'MSE',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'All I have is "anxious, crying off/on, late, maybe not sleeping." Do I have to leave half the MSE blank or can Vera fill in the obvious stuff?',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('mse_completion_limits');
    expect(payload.message).toContain('Do not auto-complete');
    expect(payload.message).not.toContain('calm');
    expect(payload.message).not.toContain('cooperative');
    expect(payload.message).not.toContain('linear');
  });

  it('keeps legal-hold pressure turns in the chart-ready lane instead of overstating threshold language', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Need this fast. Just write meets hold so transfer can happen.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Emergency Psychiatry Evaluation',
          focusedSectionHeading: 'Assessment',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'ED wants "meets hold" in one line. Source is thin: vague paranoia, pacing, no clear threats, no specific self-harm plan. Can I just say hold criteria met?',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('legal hold criteria are not clearly established from this source alone');
    expect(payload.suggestions?.join(' ')).toContain('Do not overstate legal threshold language');
    expect(payload.message).not.toContain('hold criteria clearly met');
  });

  it('keeps thin-evidence legal-hold yes-no pressure in chart-ready mode with additional facts needed', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Just say yes or no — does this meet hold?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Emergency Psychiatry Evaluation',
          focusedSectionHeading: 'Assessment',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'ED wants "meets hold" in one line. Source is thin: vague paranoia, pacing, no clear threats, no plan. Can I just say hold criteria met?',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('Chart-ready wording:');
    expect(payload.message).toContain('legal hold criteria are not clearly established from this source alone');
    expect(payload.message).toContain('Additional facts needed:');
    expect(payload.message).not.toContain("I don't have a safe Veranote answer for that yet.");
  });

  it('keeps thin-evidence legal-hold correction turns in chart-ready mode instead of conservative meta coaching', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Make that legally safer wording.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Emergency Psychiatry Evaluation',
          focusedSectionHeading: 'Assessment',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'ED wants "meets hold" in one line. Source is thin: vague paranoia, pacing, no clear threats, no plan. Can I just say hold criteria met?',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('Chart-ready wording:');
    expect(payload.message).toContain('legal hold criteria are not clearly established from this source alone');
    expect(payload.message).toContain('Documented clinical concern can remain explicit');
    expect(payload.message).toContain('jurisdiction-specific hold criteria');
    expect(payload.message).not.toContain('To make wording more conservative');
  });

  it('returns supported-dangerousness hold wording in warning mode instead of generic source-bound fallback', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Need exact hold wording. Pt says she will overdose if sent home tonight, hid pills, and cannot name a safe place to stay. What language stays source-matched without sounding sloppy?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Emergency Psychiatry Evaluation',
          focusedSectionHeading: 'Assessment',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('warning_language');
    expect(payload.message).toContain('Warning: Source-matched hold language');
    expect(payload.message).toContain('overdose-if-sent-home');
    expect(payload.message).toContain('no safe discharge option');
    expect(payload.message).not.toContain('Keep this source-bound');
  });

  it('keeps supported-dangerousness hold corrections tied to hold language instead of generic discharge wording', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Make it chart-ready.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Emergency Psychiatry Evaluation',
          focusedSectionHeading: 'Assessment',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'Need exact hold wording. Pt says she will overdose if sent home and has no safe place to stay.',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('warning_language');
    expect(payload.message).toContain('Warning: Source-matched hold language');
    expect(payload.message).toContain('overdose-if-sent-home');
    expect(payload.message).not.toContain('Discharge readiness remains unresolved');
  });

  it('keeps ambiguous follow-up correction turns in workflow guidance with an explicit assumption and tighter wording', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Okay but can you make that tighter?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Assessment',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'Mom says he threatened her, pt says "that was last week, not now." How do I write that?',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('workflow_guidance');
    expect(payload.message).toContain('Workflow guidance:');
    expect(payload.message).toContain('Assuming you mean the threat/collateral wording');
    expect(payload.message).toContain('Collateral reports the patient threatened her; patient reports the statement was last week and not current');
    expect(payload.message).not.toContain('Discharge readiness remains unresolved');
    expect(payload.message).not.toContain('Keep this source-bound');
  });

  it('keeps ambiguous follow-up pressure on the prior collateral-threat target instead of drifting to discharge wording', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'No, tighter than that.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Assessment',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'Mom says he threatened her, pt says "that was last week, not now." How do I write that?',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('workflow_guidance');
    expect(payload.message).toContain('Workflow guidance:');
    expect(payload.message).toContain('Assuming you mean the threat/collateral wording');
    expect(payload.message).toContain('Collateral reports the patient threatened her; patient reports the statement was last week and not current');
    expect(payload.message).not.toContain('Discharge readiness remains unresolved');
    expect(payload.message).not.toContain('Keep this source-bound');
  });

  it('keeps provider-pressure suicide follow-ups in warning mode instead of review explainer fallback', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Give me warning language that is fast but still source-faithful.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Assessment',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'Need one-line risk language now. Pt denied SI this morning but was texting goodbye overnight and says she is not safe if sent home. Can I just call it low risk so I can sign this?',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('warning_language');
    expect(payload.message).toContain('Low-risk wording is not supported here.');
    expect(payload.message).not.toContain('Warnings usually appear because');
  });

  it('keeps reported denial and observed perceptual findings distinct in chart-ready wording', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Patient denies hallucinations today, but nursing says she looked internally preoccupied. How should I phrase that in the assessment?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Assessment',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('Chart-ready wording:');
    expect(payload.message).toContain('Patient denies hallucinations');
    expect(payload.message).toContain('however');
    expect(payload.message).toContain('Reported denial and observed perceptual disturbance should both remain explicit');
  });

  it('answers simple utility date questions directly instead of routing into clinical fallback', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:12:59-05:00'));

    try {
      const response = await POST(new Request('http://localhost/api/assistant/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stage: 'review',
          mode: 'workflow-help',
          message: 'What is today?',
          context: {
            providerAddressingName: 'Daniel Hale',
            noteType: 'Inpatient Psych Progress Note',
          },
        }),
      }));

      const payload = await response.json();
      expect(payload.message).toBe('Today is Wednesday, April 22, 2026.');
      expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
      expect(payload.modeMeta?.mode).toBe('workflow-help');
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers practical provider time questions directly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:12:59-05:00'));

    try {
      const response = await POST(new Request('http://localhost/api/assistant/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stage: 'review',
          mode: 'workflow-help',
          message: 'What time is it?',
          context: {
            providerAddressingName: 'Daniel Hale',
            noteType: 'Inpatient Psych Progress Note',
          },
        }),
      }));

      const payload = await response.json();
      expect(payload.message).toMatch(/^The current time is 10:12 AM/);
      expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers practical month and year questions directly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:12:59-05:00'));

    try {
      const response = await POST(new Request('http://localhost/api/assistant/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stage: 'compose',
          mode: 'workflow-help',
          message: 'What month is it?',
          context: {
            providerAddressingName: 'Daniel Hale',
            noteType: 'Outpatient Psychiatry Follow-up',
          },
        }),
      }));

      const payload = await response.json();
      expect(payload.message).toBe('It is April 2026.');
      expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers practical year questions directly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:12:59-05:00'));

    try {
      const response = await POST(new Request('http://localhost/api/assistant/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stage: 'compose',
          mode: 'workflow-help',
          message: 'What year is it?',
          context: {
            providerAddressingName: 'Daniel Hale',
            noteType: 'Outpatient Psychiatry Follow-up',
          },
        }),
      }));

      const payload = await response.json();
      expect(payload.message).toBe('It is 2026.');
      expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers practical tomorrow questions directly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:12:59-05:00'));

    try {
      const response = await POST(new Request('http://localhost/api/assistant/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stage: 'compose',
          mode: 'workflow-help',
          message: "What's tomorrow's date?",
          context: {
            providerAddressingName: 'Daniel Hale',
            noteType: 'Outpatient Psychiatry Follow-up',
          },
        }),
      }));

      const payload = await response.json();
      expect(payload.message).toBe('Tomorrow is Thursday, April 23, 2026.');
      expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers weekday offset questions directly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:12:59-05:00'));

    try {
      const response = await POST(new Request('http://localhost/api/assistant/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stage: 'review',
          mode: 'workflow-help',
          message: 'How many days until Friday?',
          context: {
            providerAddressingName: 'Daniel Hale',
            noteType: 'Inpatient Psych Progress Note',
          },
        }),
      }));

      const payload = await response.json();
      expect(payload.message).toBe('Friday is in 2 days, on Friday, April 24, 2026.');
      expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers next weekday date questions directly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:12:59-05:00'));

    try {
      const response = await POST(new Request('http://localhost/api/assistant/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stage: 'compose',
          mode: 'workflow-help',
          message: 'What is the date next Monday?',
          context: {
            providerAddressingName: 'Daniel Hale',
            noteType: 'Outpatient Psychiatry Follow-up',
          },
        }),
      }));

      const payload = await response.json();
      expect(payload.message).toBe('Next Monday is Monday, April 27, 2026.');
      expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers next weekday day-name phrasing directly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:12:59-05:00'));

    try {
      const response = await POST(new Request('http://localhost/api/assistant/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stage: 'compose',
          mode: 'workflow-help',
          message: 'Could you tell me what day next Tuesday falls on?',
          context: {
            providerAddressingName: 'Daniel Hale',
            noteType: 'Outpatient Psychiatry Follow-up',
          },
        }),
      }));

      const payload = await response.json();
      expect(payload.message).toBe('Next Tuesday is Tuesday, April 28, 2026.');
      expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers tomorrow weekday check questions directly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:12:59-05:00'));

    try {
      const response = await POST(new Request('http://localhost/api/assistant/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stage: 'compose',
          mode: 'workflow-help',
          message: 'Is tomorrow Friday?',
          context: {
            providerAddressingName: 'Daniel Hale',
            noteType: 'Outpatient Psychiatry Follow-up',
          },
        }),
      }));

      const payload = await response.json();
      expect(payload.message).toBe('No. Tomorrow is Thursday, April 23, 2026.');
      expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers today weekday check questions directly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:12:59-05:00'));

    try {
      const response = await POST(new Request('http://localhost/api/assistant/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stage: 'review',
          mode: 'workflow-help',
          message: 'Is today Wednesday?',
          context: {
            providerAddressingName: 'Daniel Hale',
            noteType: 'Inpatient Psych Progress Note',
          },
        }),
      }));

      const payload = await response.json();
      expect(payload.message).toBe('Yes. Today is Wednesday, April 22, 2026.');
      expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers specific calendar date distance questions directly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:12:59-05:00'));

    try {
      const response = await POST(new Request('http://localhost/api/assistant/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stage: 'compose',
          mode: 'workflow-help',
          message: 'How many days until May 1?',
          context: {
            providerAddressingName: 'Daniel Hale',
            noteType: 'Outpatient Psychiatry Follow-up',
          },
        }),
      }));

      const payload = await response.json();
      expect(payload.message).toBe('May 1, 2026 is in 9 days.');
      expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers specific calendar weekday questions directly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:12:59-05:00'));

    try {
      const response = await POST(new Request('http://localhost/api/assistant/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stage: 'compose',
          mode: 'workflow-help',
          message: 'What day is May 1?',
          context: {
            providerAddressingName: 'Daniel Hale',
            noteType: 'Outpatient Psychiatry Follow-up',
          },
        }),
      }));

      const payload = await response.json();
      expect(payload.message).toBe('May 1, 2026 is Friday.');
      expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers short date math questions directly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:12:59-05:00'));

    try {
      const response = await POST(new Request('http://localhost/api/assistant/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stage: 'compose',
          mode: 'workflow-help',
          message: 'What is the date in 3 days?',
          context: {
            providerAddressingName: 'Daniel Hale',
            noteType: 'Outpatient Psychiatry Follow-up',
          },
        }),
      }));

      const payload = await response.json();
      expect(payload.message).toBe('That date is Saturday, April 25, 2026.');
      expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers weekend timing questions directly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:12:59-05:00'));

    try {
      const response = await POST(new Request('http://localhost/api/assistant/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stage: 'review',
          mode: 'workflow-help',
          message: 'When is this weekend?',
          context: {
            providerAddressingName: 'Daniel Hale',
            noteType: 'Inpatient Psych Progress Note',
          },
        }),
      }));

      const payload = await response.json();
      expect(payload.message).toBe('This weekend starts Saturday, April 25, 2026.');
      expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers weekend distance questions directly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:12:59-05:00'));

    try {
      const response = await POST(new Request('http://localhost/api/assistant/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stage: 'review',
          mode: 'workflow-help',
          message: 'How many days until the weekend?',
          context: {
            providerAddressingName: 'Daniel Hale',
            noteType: 'Inpatient Psych Progress Note',
          },
        }),
      }));

      const payload = await response.json();
      expect(payload.message).toBe('The weekend starts in 3 days, on Saturday, April 25, 2026.');
      expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers awkward next-weekday phrasings without falling back to today', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:12:59-05:00'));

    try {
      const response = await POST(new Request('http://localhost/api/assistant/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stage: 'review',
          mode: 'workflow-help',
          message: 'What day is it next Friday?',
          context: {
            providerAddressingName: 'Daniel Hale',
            noteType: 'Inpatient Psych Progress Note',
          },
        }),
      }));

      const payload = await response.json();
      expect(payload.message).toBe('Next Friday is Friday, April 24, 2026.');
      expect(payload.message).not.toContain('Today is ');
      expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers day-after-tomorrow questions directly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:12:59-05:00'));

    try {
      const response = await POST(new Request('http://localhost/api/assistant/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stage: 'review',
          mode: 'workflow-help',
          message: 'What is the day after tomorrow?',
          context: {
            providerAddressingName: 'Daniel Hale',
            noteType: 'Inpatient Psych Progress Note',
          },
        }),
      }));

      const payload = await response.json();
      expect(payload.message).toBe('The day after tomorrow is Friday, April 24, 2026.');
      expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers when-is-specific-date questions directly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T11:12:59-05:00'));

    try {
      const response = await POST(new Request('http://localhost/api/assistant/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stage: 'compose',
          mode: 'workflow-help',
          message: 'When is May 1?',
          context: {
            providerAddressingName: 'Daniel Hale',
            noteType: 'Outpatient Psychiatry Follow-up',
          },
        }),
      }));

      const payload = await response.json();
      expect(payload.message).toBe('May 1, 2026 is Friday.');
      expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers date-math from-today questions directly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T11:12:59-05:00'));

    try {
      const response = await POST(new Request('http://localhost/api/assistant/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stage: 'compose',
          mode: 'workflow-help',
          message: 'What is the date 2 weeks from today?',
          context: {
            providerAddressingName: 'Daniel Hale',
            noteType: 'Outpatient Psychiatry Follow-up',
          },
        }),
      }));

      const payload = await response.json();
      expect(payload.message).toBe('That date is Wednesday, May 6, 2026.');
      expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps clinical prompts with today language out of utility routing', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Patient calmer today, still guarded, and denies AH today. Nursing note says patient appeared internally preoccupied. What should stay explicit?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Assessment',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).not.toContain('Today is ');
    expect(payload.message).not.toContain('The current time is ');
    expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    expect(payload.answerMode).toBe('warning_language');
    expect(payload.message.toLowerCase()).toMatch(/warning|high-acuity|keep explicit/);
  });

  it('keeps clinical prompts with weekday language out of utility routing', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'The team wants discharge Friday, but patient still says she has a plan to overdose if sent home. What should Vera keep explicit?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'Plan',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.message).not.toContain('Friday is in ');
    expect(payload.message).not.toContain('Next Friday is ');
    expect(payload.message).not.toBe("No, but I'll find out how I can learn how to.");
    expect(payload.message.toLowerCase()).toMatch(/conflict|preserve both|explicit/);
  });

  it('keeps involuntary-medication-refusal prompts out of medication-reference routing', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Pt keeps refusing olanzapine, says it is poison, still paranoid and yelling at door. Team wants me to just write noncompliant and med over objection if needed. What should the note actually say?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psychiatry Progress Note',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('Chart-ready wording:');
    expect(payload.message).toContain('Medication refusal remains documented');
    expect(payload.message).toContain('medication over objection is not documented');
    expect(payload.message).not.toContain('Olanzapine is an atypical antipsychotic');
    expect(payload.message).not.toContain('noncompliant');
  });

  it('keeps ama-elopement prompts out of the MSE lane even when calm appears', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Pt wants out AMA right now, says ride coming maybe, no real safety plan, denied SI 5 min ago but was saying not safe overnight. Can I just write calm now and leaving against advice?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psychiatry Progress Note',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('Chart-ready wording:');
    expect(payload.message).toContain('Leaving against medical advice remains documented');
    expect(payload.message).toContain('unresolved safety or disposition risk remains documented');
    expect(payload.message).not.toContain('Source-supported MSE findings');
  });

  it('returns non-stigmatizing personality-language workflow guidance instead of meta fallback', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Mom says she does this every breakup, pt says mom always minimizes. Chart is getting loaded with character stuff. What should Vera do to keep this note usable and not stigmatizing?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psychiatry Progress Note',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('workflow_guidance');
    expect(payload.message).toContain('Workflow guidance:');
    expect(payload.message).toContain('Keep observed behavior, patient report, and collateral conflict separate');
    expect(payload.message).toContain('non-stigmatizing wording');
    expect(payload.message).not.toContain('Keep this source-bound');
  });

  it('returns chart-ready HPI wording instead of meta guidance for acute admission requests', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Need psych admit HPI. Pt says pills were "for sleep," dad says goodbye text plus empty bottle, pt now denies SI and says does not remember timing. Write this up without making it fake-clean.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psychiatry Admission Note',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('Chart-ready wording:');
    expect(payload.message).toContain('Reason for admission');
    expect(payload.message).toContain('Patient report:');
    expect(payload.message).toContain('Collateral report:');
    expect(payload.message).toContain('timing remains unclear');
    expect(payload.message).not.toContain('Keep this source-bound');
    expect(payload.message).not.toContain('intentional overdose');
  });

  it('keeps progress-note cleanup prompts in chart-ready wording instead of warning-only mode', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Need this progress note cleaned up: denies SI now, goodbye texts overnight, says not safe if sent home, draft currently says low risk. Rewrite it so it is usable.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psychiatry Progress Note',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('Chart-ready wording:');
    expect(payload.message).toContain('Patient currently denies suicidal ideation');
    expect(payload.message).toContain('Higher-acuity risk facts remain documented');
    expect(payload.message).not.toContain('Warning:');
    expect(payload.message).not.toContain('Keep this source-bound');
  });

  it('returns discharge-summary wording instead of note-review strategy for discharge-summary requests', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Discharge summary from this mess please: admitted for command AH plus paranoia, less agitated by day 4 but still hears voices off/on, shelter dispo, follow-up not actually scheduled yet. Make it sound normal enough to send.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psychiatry Discharge Summary',
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('Chart-ready wording:');
    expect(payload.message).toContain('Hospital course');
    expect(payload.message).toContain('Symptom status at discharge');
    expect(payload.message).toContain('follow-up was not yet confirmed');
    expect(payload.message).not.toContain('Start with the highest-signal trust issue');
    expect(payload.message).not.toContain('stable for discharge');
  });

  it('keeps not safe if sent home explicit on Batch 3 progress-note correction turns', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Shorter paragraph please, but keep the denial and the higher-acuity risk facts together.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psychiatry Progress Note',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'Need this progress note cleaned up: denies SI now, goodbye texts overnight, says not safe if sent home, draft currently says low risk. Rewrite it so it is usable.',
          },
          {
            role: 'assistant',
            content: 'Chart-ready wording: "Patient currently denies suicidal ideation; however, recent goodbye texts and the patient statement that they are not safe if sent home remain documented. Higher-acuity risk facts remain documented and should stay side by side with the current denial rather than being cleaned into low-risk wording."',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('not safe if sent home');
    expect(payload.message).toContain('goodbye texts');
    expect(payload.message).not.toContain('Warning:');
  });

  it('keeps medication refusal then partial acceptance explicit on Batch 3 discharge-summary correction turns', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Make it chart-ready and keep hospital course, symptom status at discharge, and the weak disposition details explicit.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psychiatry Discharge Summary',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'Need discharge summary fast. Hospital course was 3 days of SI on/off, med refusal then partial acceptance, still says home not great but wants out and ride maybe cousin. Draft is calling stable for discharge. Rewrite.',
          },
          {
            role: 'assistant',
            content: 'Chart-ready wording: "Hospital course: the admission included intermittent suicidal ideation, medication refusal followed by partial acceptance, and ongoing conflict about discharge readiness. Symptom status at discharge: acute risk and home-safety concerns were not fully resolved in the available source. Disposition or follow-up details remain limited, including weak or unconfirmed ride and home-plan details. This discharge summary should not overstate discharge stability or imply more risk resolution than the source supports."',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('medication refusal then partial acceptance');
    expect(payload.message).toContain('disposition');
    expect(payload.message).not.toContain('stable for discharge');
  });

  it('enforces one-paragraph wording on Batch 3 progress-note correction turns', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Make it one chart-ready paragraph and keep the reported improvement plus active psychosis side by side.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psychiatry Progress Note',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'Progress note is ugly: "better today maybe, smiling some, still hearing voices telling him to die, slept bad, wants dc." Tighten it.',
          },
          {
            role: 'assistant',
            content: 'Chart-ready wording: "Patient-reported improvement remains documented; however, command auditory hallucinations remain documented and continue to limit a cleaner stabilization narrative. Sleep disturbance and discharge focus remain present in the source, so the refined progress note should preserve both the reported improvement and the ongoing active psychotic symptoms in one concise paragraph."',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('one paragraph');
    expect(payload.message).toContain('command auditory hallucinations remain documented');
    expect(payload.message).not.toContain('\n-');
  });
});
