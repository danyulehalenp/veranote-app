import type { AssistantReferenceSource, AssistantResponsePayload } from '@/types/assistant';

function hasKeyword(message: string, keywords: string[]) {
  return keywords.some((keyword) => message.includes(keyword));
}

function buildPsychCptReferences(): AssistantReferenceSource[] {
  return [
    {
      label: 'CMS Evaluation and Management visits overview',
      url: 'https://www.cms.gov/medicare/payment/fee-schedules/physician/evaluation-management-visits',
      sourceType: 'external',
    },
    {
      label: 'CMS Psychotherapy for crisis',
      url: 'https://www.cms.gov/medicare/payment/fee-schedules/physician-fee-schedule/psychotherapy-crisis',
      sourceType: 'external',
    },
    {
      label: 'CMS Medicare mental health coverage',
      url: 'https://www.cms.gov/files/document/medicare-mental-health.pdf',
      sourceType: 'external',
    },
    {
      label: 'CMS Psychiatry and Psychology billing article',
      url: 'https://www.cms.gov/medicare-coverage-database/view/article.aspx?articleid=56937',
      sourceType: 'external',
    },
  ];
}

function payload(message: string, suggestions: string[]): AssistantResponsePayload {
  return {
    message,
    suggestions,
    references: buildPsychCptReferences(),
  };
}

function hasDocumentationCue(normalized: string) {
  return hasKeyword(normalized, ['document', 'documentation', 'documented', 'support', 'supported', 'read like', 'red flag', 'red flags', 'insufficient', 'not enough', 'justify']);
}

function wantsBillingChecklist(normalized: string) {
  return (
    hasKeyword(normalized, ['billing support checklist', 'billing checklist', 'billing sanity check', 'sanity check', 'before i sign', 'before signing', 'pre-sign', 'pre sign', 'quick billing check', 'what should i verify before signing', 'quick pre-sign check'])
  );
}

function looksLikePastedBillingNote(normalized: string) {
  return normalized.length > 110
    || hasKeyword(normalized, ['hpi:', 'assessment:', 'plan:', 'interval update:', 'session:', 'note:'])
    || /[.;].+[.;]/.test(normalized);
}

function asksIfNoteSupportsFamily(normalized: string) {
  return hasKeyword(normalized, ['does this note support', 'does this support', 'does this justify', 'is this enough for', 'is this note enough for', 'does this read like']);
}

function hasPsychotherapyContentCue(normalized: string) {
  return hasKeyword(normalized, ['psychotherapy', 'therapy time', 'minutes of psychotherapy', 'supportive therapy', 'cbt', 'dbt', 'motivational interviewing', 'mi', 'intervention', 'processed', 'explored', 'reframed', 'coping skills']);
}

function hasTimeCue(normalized: string) {
  return /\b\d+\s*(min|mins|minute|minutes)\b/.test(normalized);
}

function hasCommunicationComplexityCue(normalized: string) {
  return hasKeyword(normalized, ['interpreter', 'translator', 'third party', 'caregiver conflict', 'guardian conflict', 'reportable', 'sentinel event', 'communication barrier', 'maladaptive communication', 'disruptive communication']);
}

function hasFamilyPsychotherapyCue(normalized: string) {
  return hasKeyword(normalized, ['family therapy', 'family psychotherapy', 'patient and family', 'mother', 'father', 'parent', 'spouse', 'partner', 'family dynamics', 'therapeutic work with family']);
}

function hasGroupPsychotherapyCue(normalized: string) {
  return hasKeyword(normalized, ['group psychotherapy', 'group therapy', 'group members', 'peer feedback', 'group discussion', 'group intervention', 'participants']);
}

function hasCrisisPsychotherapyCue(normalized: string) {
  return hasKeyword(normalized, ['crisis intervention', 'acute crisis', 'emergent', 'de-escalation', 'safety planning', 'suicidal', 'homicidal', 'imminent risk', 'unable to maintain safety']);
}

function looksLikePsychCptQuestion(normalized: string) {
  return /\b(cpt|billing|modifier|telehealth|telemental|video visit|virtual visit|follow-up|follow up|intake|em\b|e\/m|evaluation and management|med management|med check|psychotherapy|interactive complexity|family psychotherapy|family therapy|group psychotherapy|group therapy|psychoanalysis|90785|90791|90792|90832|90833|90834|90836|90837|90838|90839|90840|90845|90846|90847|90849|90853|99202|99203|99204|99205|99212|99213|99214|99215|g2211)\b/i.test(normalized);
}

export function buildPsychCptHelp(normalizedMessage: string, currentDraftText?: string): AssistantResponsePayload | null {
  const normalized = normalizedMessage.toLowerCase().trim();
  const normalizedDraftContext = currentDraftText?.toLowerCase().trim() || '';

  if (!normalized || !looksLikePsychCptQuestion(normalized)) {
    return null;
  }

  const familyConcernPrompt = hasKeyword(normalized, ['any billing concerns', 'billing concerns', 'does this note support billing', 'does this draft support billing', 'before i sign this', 'before signing this']);

  if (normalizedDraftContext && familyConcernPrompt) {
    if (hasCrisisPsychotherapyCue(normalizedDraftContext) && !hasTimeCue(normalizedDraftContext)) {
      return payload(
        'This draft has a billing-support concern if anyone is thinking about crisis psychotherapy. The wording suggests urgency or safety work, but it still sounds thin on crisis-intervention timing and explicit crisis-psychotherapy support.',
        [
          'What looks missing: documented crisis psychotherapy time and clearer crisis-intervention content.',
          'Why it matters: safety discussion or urgency alone does not automatically support 90839 or 90840.',
        ],
      );
    }

    if ((hasKeyword(normalizedDraftContext, ['medication', 'medications', 'mg', 'continue', 'increase', 'decrease', 'refill', 'follow up', 'follow-up']) || hasKeyword(normalizedDraftContext, ['assessment:', 'plan:']))
      && !hasPsychotherapyContentCue(normalizedDraftContext)) {
      return payload(
        'This draft has a billing-support concern if anyone is thinking about psychotherapy add-on billing. Right now it mostly reads like outpatient E/M or med-management follow-up, not clearly distinct psychotherapy work.',
        [
          'What looks missing: supportable psychotherapy content and psychotherapy timing that can stand apart from the medical-management portion.',
          'Why it matters: if the draft still reads like straightforward med management after removing a few counseling phrases, that is a warning against implying an add-on family.',
        ],
      );
    }

    if ((hasKeyword(normalizedDraftContext, ['mother', 'father', 'parent', 'spouse', 'partner', 'family']) && !hasFamilyPsychotherapyCue(normalizedDraftContext))
      || hasKeyword(normalizedDraftContext, ['collateral', 'care coordination', 'family update'])) {
      return payload(
        'This draft has a billing-support concern if anyone is thinking about family psychotherapy. It currently reads more like collateral, coordination, or a family update than clearly documented family psychotherapy.',
        [
          'What looks missing: explicit therapeutic work with the family and a family-focused treatment purpose.',
          'Why it matters: family presence or collateral input does not automatically support 90846 or 90847.',
        ],
      );
    }
  }

  if (wantsBillingChecklist(normalized)) {
    return payload(
      'For a quick billing-support checklist, Vera should answer in a short pre-sign format: likely family, what supports it, what is missing, what red flags remain, and what to verify before signing. She should stay documentation-dependent and not pretend final billing certainty from a short prompt alone.',
      [
        'Likely family: decide first whether this reads more like E/M only, E/M plus psychotherapy add-on, psychotherapy-only, family/group psychotherapy, or crisis psychotherapy.',
        'What supports it: distinct service content, supportable timing when relevant, and documentation that matches the family being discussed.',
        'What is missing: vague counseling language, missing psychotherapy detail, absent crisis timing, or notes that never clearly separate medical work from psychotherapy work.',
        'Red flags and verify before signing: watch for notes that sound clinically important but not billable in that family, then confirm payer-specific rules, required modifiers/POS when relevant, and whether another clinician could justify the same family from the note alone.',
      ],
    );
  }

  const noteSupportText = looksLikePastedBillingNote(normalized) ? normalized : normalizedDraftContext;

  if (noteSupportText && asksIfNoteSupportsFamily(normalized)
    && (hasKeyword(normalized, ['90833', '90836', '90838', 'psychotherapy add-on']) || hasKeyword(normalizedDraftContext, ['90833', '90836', '90838', 'psychotherapy add-on']))) {
    const thinPsychotherapy = !hasPsychotherapyContentCue(noteSupportText) || !hasTimeCue(noteSupportText);

    if (thinPsychotherapy) {
      return payload(
        'This note sounds thin for a psychotherapy add-on family like 90833, 90836, or 90838. I do not hear clearly supportable psychotherapy work plus psychotherapy timing yet, so Vera should treat this as a billing-support concern rather than assuming the add-on is justified.',
        [
          'What looks missing: specific psychotherapy content, distinct therapeutic interventions, and supportable psychotherapy time rather than only medication follow-up language.',
          'Why it matters: if the note still reads like straightforward med management after removing a few counseling phrases, that is a red flag against an add-on family.',
        ],
      );
    }
  }

  if (noteSupportText && asksIfNoteSupportsFamily(normalized)
    && (hasKeyword(normalized, ['90785', 'interactive complexity']) || hasKeyword(normalizedDraftContext, ['90785', 'interactive complexity']))
    && !hasCommunicationComplexityCue(noteSupportText)) {
    return payload(
      'This note sounds thin for 90785 based on what is here. I do not hear clearly documented communication-complexity factors yet, so Vera should treat this as a billing-support concern instead of assuming interactive complexity is supported.',
      [
        'What looks missing: a specific communication barrier or complicating communication factor that materially changed the work, not just general acuity or family presence.',
        'Why it matters: a hard visit or emotional intensity alone is not enough for 90785.',
      ],
    );
  }

  if (noteSupportText && asksIfNoteSupportsFamily(normalized)
    && (hasKeyword(normalized, ['90846', '90847', 'family therapy', 'family psychotherapy']) || hasKeyword(normalizedDraftContext, ['90846', '90847', 'family therapy', 'family psychotherapy']))
    && (!hasFamilyPsychotherapyCue(noteSupportText) || hasKeyword(noteSupportText, ['collateral', 'care coordination', 'update to family', 'family update']))) {
    return payload(
      'This note sounds thin for family psychotherapy as written. It reads more like collateral, coordination, or a family update than clearly documented family psychotherapy focused on treatment of the mental disorder.',
      [
        'What looks missing: clear therapeutic work with the family and a family-focused treatment purpose, not just information gathering or support.',
        'Why it matters: family presence or collateral input alone does not automatically support 90846 or 90847.',
      ],
    );
  }

  if (noteSupportText && asksIfNoteSupportsFamily(normalized)
    && (hasKeyword(normalized, ['90849', '90853', 'group therapy', 'group psychotherapy']) || hasKeyword(normalizedDraftContext, ['90849', '90853', 'group therapy', 'group psychotherapy']))
    && !hasGroupPsychotherapyCue(noteSupportText)) {
    return payload(
      'This note sounds thin for group psychotherapy as written. I do not hear enough actual group psychotherapy content yet, so Vera should treat this as a billing-support concern instead of assuming the group family is justified.',
      [
        'What looks missing: group process, therapeutic interventions, or group psychotherapy content rather than simple attendance or participation.',
        'Why it matters: showing that the patient was present in a group is not the same as documenting support for 90849 or 90853.',
      ],
    );
  }

  if (noteSupportText && asksIfNoteSupportsFamily(normalized)
    && (hasKeyword(normalized, ['90839', '90840', 'crisis psychotherapy']) || hasKeyword(normalizedDraftContext, ['90839', '90840', 'crisis psychotherapy']))
    && (!hasCrisisPsychotherapyCue(noteSupportText) || !hasTimeCue(noteSupportText))) {
    return payload(
      'This note sounds thin for crisis psychotherapy as written. I do not hear clearly documented crisis-intervention work plus crisis timing yet, so Vera should treat this as a billing-support concern instead of assuming 90839 or 90840 is supported.',
      [
        'What looks missing: explicit crisis intervention content, crisis acuity/safety context, and supportable crisis psychotherapy timing.',
        'Why it matters: urgent or emotionally intense wording alone does not justify the crisis psychotherapy family.',
      ],
    );
  }

  if ((hasKeyword(normalized, ['new vs established', 'established vs new', 'new patient', 'established patient'])
      && hasKeyword(normalized, ['e/m', 'evaluation and management', 'med management', 'med check', 'follow-up', 'follow up']))
    || (hasKeyword(normalized, ['99202', '99203', '99204', '99205']) && hasKeyword(normalized, ['99212', '99213', '99214', '99215']))) {
    return payload(
      'For outpatient psych E/M, new versus established status changes the office or outpatient family before you even decide whether psychotherapy add-ons belong. Vera should treat that as a relationship-to-the-practice question, not as a complexity shortcut or a synonym for intake versus follow-up.',
      [
        'New versus established should be based on the current E/M rules and prior professional services relationship, not just whether the visit feels like a fresh workup.',
        'Do not let a long psychiatric follow-up be mislabeled as new-patient E/M just because the case is complex or the documentation is thorough.',
      ],
    );
  }

  if ((hasKeyword(normalized, ['collateral', 'care coordination', 'family discussion', 'family meeting']) && hasKeyword(normalized, ['family therapy', 'family psychotherapy', '90846', '90847']))
    || hasKeyword(normalized, ['collateral vs family therapy', 'collateral versus family therapy'])) {
    return payload(
      'Collateral gathering or family discussion is not automatically family psychotherapy. Vera should distinguish true family psychotherapy from collateral history, care coordination, or supportive family conversation unless the documented work clearly reflects psychotherapy focused on treatment of the mental disorder.',
      [
        'If the note mainly shows information gathering, education, or coordination, that is a red flag against automatically treating it as 90846 or 90847.',
        'For true family psychotherapy, the note should make the therapeutic work and the family-focused treatment purpose explicit rather than describing a generic family update.',
      ],
    );
  }

  if ((hasKeyword(normalized, ['interactive complexity']) && hasKeyword(normalized, ['misuse', 'warning', 'warnings', 'red flag', 'red flags', 'not use', 'when not']))
    || hasKeyword(normalized, ['90785 misuse', '90785 red flags'])) {
    return payload(
      'Interactive complexity should be treated cautiously. Vera should warn that 90785 is not a routine add-on for difficult visits, emotional intensity, or general family involvement; it needs documented communication complications that materially changed the work.',
      [
        'Red flags include adding 90785 just because the patient was high acuity, the family was present, or the encounter felt complicated without clear communication-complexity factors.',
        'If the note cannot explain what specifically complicated communication or care delivery, Vera should stay conservative and avoid implying 90785 is supported.',
      ],
    );
  }

  if ((hasKeyword(normalized, ['add-on misuse', 'add on misuse', 'misuse warning', 'misuse warnings']) && hasKeyword(normalized, ['90833', '90836', '90838', 'psychotherapy add-on']))
    || hasKeyword(normalized, ['90833 misuse', '90836 misuse', '90838 misuse'])) {
    return payload(
      'Psychotherapy add-on misuse usually happens when the note really reads like E/M only and then tries to backfill therapy justification. Vera should warn that add-on families require separately supportable psychotherapy plus the medical visit, not just supportive counseling wrapped around prescribing.',
      [
        'Red flags include vague counseling language, no distinct psychotherapy time/content, or notes where the psychotherapy section is interchangeable with routine medication follow-up education.',
        'If the note would still read like straightforward med management after removing a few therapy phrases, Vera should treat that as a warning against implying an add-on code is justified.',
      ],
    );
  }

  if ((hasKeyword(normalized, ['med management follow-up', 'med management follow up', 'med check follow-up', 'med check follow up', 'brief med check', 'short med check', 'brief follow-up', 'brief follow up', 'short follow-up', 'short follow up'])
      && hasKeyword(normalized, ['billing', 'check', 'sanity check', 'what family', 'what code']))
    || hasKeyword(normalized, ['quick med management follow-up billing check', 'quick med management follow up billing check'])) {
    return payload(
      'For a short outpatient med-management follow-up, Vera should start from the office or outpatient E/M family and stay conservative about adding anything else unless the note clearly supports it. Brief follow-up alone does not automatically mean low complexity, and supportive counseling alone does not automatically create psychotherapy billing.',
      [
        'Check whether the note actually supports the E/M level with documented medical decision making or total time before worrying about extra add-ons.',
        'If psychotherapy is being considered too, the note should show distinct psychotherapy work rather than brief medication education or routine follow-up planning.',
      ],
    );
  }

  if (hasDocumentationCue(normalized)
    && hasKeyword(normalized, ['90833', '90836', '90838', 'psychotherapy add-on', 'add on psychotherapy'])) {
    return payload(
      'For psychotherapy add-on support, the note needs to read like both services truly happened: a real E/M visit and separately supportable psychotherapy. Vera should look for clear medical work, clear psychotherapy work, and documentation that does not collapse them into one vague block.',
      [
        'Red flags include generic supportive counseling language with no distinct psychotherapy content or no clear medical decision-making / prescribing work.',
        'The note should make the psychotherapy component and the medical-management component independently understandable instead of blending them into one undifferentiated paragraph.',
      ],
    );
  }

  if (hasDocumentationCue(normalized)
    && ((hasKeyword(normalized, ['e/m', 'evaluation and management', 'med management', 'med check']) && hasKeyword(normalized, ['psychotherapy', '90833', '90836', '90838']))
      || hasKeyword(normalized, ['e/m only', 'em only', 'e/m plus psychotherapy', 'em plus psychotherapy']))) {
    return payload(
      'What makes a note read like E/M only versus E/M plus psychotherapy is whether the psychotherapy work is actually distinct and supportable on its own. Vera should treat E/M-only notes as medication-management / medical follow-up documentation, and treat E/M plus psychotherapy only when there is clearly separate psychotherapy time and therapeutic work in addition to the medical visit.',
      [
        'If the note mostly shows symptom review, medication decisions, and follow-up planning, it reads more like E/M only.',
        'If psychotherapy is being billed too, the note should show specific psychotherapy content, not just counseling-adjacent wording around the medical plan.',
      ],
    );
  }

  if (hasDocumentationCue(normalized)
    && (hasKeyword(normalized, ['family therapy', 'family psychotherapy', '90846', '90847'])
      || hasKeyword(normalized, ['group therapy', 'group psychotherapy', '90849', '90853'])
      || hasKeyword(normalized, ['crisis psychotherapy', '90839', '90840']))) {
    return payload(
      'Documentation red flags matter a lot for family, group, and crisis psychotherapy families. Vera should call out when the note sounds too generic to support the family being discussed instead of pretending the billing family is justified.',
      [
        'Family-therapy red flags: the note reads like simple collateral gathering, care coordination, or brief family discussion rather than psychotherapy focused on treatment of the mental disorder.',
        'Group-therapy red flags: the note shows attendance or participation but not actual group psychotherapy content.',
        'Crisis-psychotherapy red flags: the note sounds urgent or emotionally intense but does not document true crisis intervention work and crisis timing.',
      ],
    );
  }

  if ((hasKeyword(normalized, ['intake']) || hasKeyword(normalized, ['90791', '90792']))
    && hasKeyword(normalized, ['follow-up', 'follow up', 'med management', 'med check', '99213', '99214', '99215'])) {
    return payload(
      'Psychiatric intake families and follow-up families should stay separate. Vera should treat 90791 and 90792 as diagnostic evaluation or intake families, while routine outpatient follow-up usually lives in the E/M family or E/M plus psychotherapy add-on when the documentation supports both.',
      [
        'Use the intake family when the encounter is a true diagnostic evaluation, not just because the visit was longer than usual.',
        'Use follow-up families when the visit is ongoing outpatient management, and keep psychotherapy/add-on logic separate from the intake decision.',
      ],
    );
  }

  if ((hasKeyword(normalized, ['psychotherapy-only', 'psychotherapy only', 'therapy-only', 'therapy only', '90834', '90837', '90832']) || hasKeyword(normalized, ['psychotherapy']))
    && hasKeyword(normalized, ['med management', 'med check', 'follow-up', 'follow up', 'e/m', 'evaluation and management'])) {
    return payload(
      'Psychotherapy-only follow-up and med-management follow-up are different billing families. Vera should keep psychotherapy-only visits in the psychotherapy family, and keep medication-management follow-up in the E/M family unless separately documented psychotherapy supports an add-on code.',
      [
        'Do not let Vera convert a medication visit into psychotherapy-only billing just because counseling language appears in the note.',
        'Do not let Vera imply an E/M plus psychotherapy add-on unless both the medical work and the psychotherapy work are distinctly documented.',
      ],
    );
  }

  if ((hasKeyword(normalized, ['crisis']) || hasKeyword(normalized, ['90839', '90840']))
    && (hasKeyword(normalized, ['regular psychotherapy', 'ordinary psychotherapy', 'non-crisis psychotherapy', '90832', '90834', '90837'])
      || (hasKeyword(normalized, ['psychotherapy']) && hasKeyword(normalized, [' vs ', 'versus'])))) {
    return payload(
      'Crisis psychotherapy and standard psychotherapy should stay clearly separated. Vera should reserve 90839 and 90840 for true crisis psychotherapy with documented crisis intervention time and should not blur that with ordinary psychotherapy follow-up codes like 90832, 90834, or 90837.',
      [
        'Urgency alone is not enough; the note should support crisis intervention work and crisis timing explicitly.',
        'If the visit was emotionally intense but did not meet crisis psychotherapy standards, Vera should stay with the ordinary psychotherapy family instead of upgrading it.',
      ],
    );
  }

  if (hasKeyword(normalized, ['telehealth', 'telemental', 'video visit', 'virtual visit'])) {
    return payload(
      'For psych telehealth, Vera should treat CPT selection as the same underlying service-family question first, then layer payer-specific telehealth rules, modifiers, and place-of-service requirements on top. She should not pretend telehealth automatically changes the underlying psychiatry family code by itself.',
      [
        'Choose the core family first: intake, E/M follow-up, psychotherapy, E/M plus psychotherapy add-on, family therapy, group therapy, or crisis psychotherapy.',
        'Then verify the current payer-specific telehealth modifier, place-of-service, and platform rules before finalizing billing.',
      ],
    );
  }

  if (hasKeyword(normalized, ['90791']) && hasKeyword(normalized, ['90792']) || hasKeyword(normalized, ['90791 vs 90792', '90792 vs 90791'])) {
    return payload(
      'The key difference between 90791 and 90792 is whether medical services are part of the psychiatric diagnostic evaluation. Vera should treat 90791 as diagnostic evaluation without medical services and 90792 as diagnostic evaluation with medical services.',
      [
        'Use the documented work, clinician role, and payer rules to decide whether medical services were truly part of the encounter.',
        'Do not let Vera collapse a medical-services intake into 90791 or a non-medical psychotherapy intake into 90792 just because the visit was comprehensive.',
      ],
    );
  }

  if ((hasKeyword(normalized, ['90834']) && hasKeyword(normalized, ['90837'])) || hasKeyword(normalized, ['90834 vs 90837', '90837 vs 90834'])) {
    return payload(
      'The difference between 90834 and 90837 is primarily psychotherapy time, not just visit complexity. Vera should treat both as psychotherapy-only family codes and keep the distinction tied to the documented therapy duration and actual psychotherapy work.',
      [
        'Do not let Vera infer 90837 just because the visit felt intense or clinically complicated if the documented psychotherapy time does not support it.',
        'If medical decision-making or prescribing also occurred, the note may fit E/M plus a psychotherapy add-on family rather than psychotherapy-only coding.',
      ],
    );
  }

  if ((hasKeyword(normalized, ['e/m']) || hasKeyword(normalized, ['evaluation and management']) || hasKeyword(normalized, ['med management', 'med check']))
    && hasKeyword(normalized, ['90833'])) {
    return payload(
      'E/M alone versus E/M plus 90833 comes down to whether separately supportable psychotherapy was provided and documented in addition to the medical visit. Vera should treat 90833 as an add-on only when the note clearly supports both the E/M work and distinct psychotherapy time/content.',
      [
        'If the visit was primarily medication management, symptom review, and prescribing without separately documented psychotherapy, Vera should stay with the E/M family alone.',
        'Do not let Vera backfill therapy language just to justify 90833 after the fact.',
      ],
    );
  }

  if ((hasKeyword(normalized, ['90846']) || hasKeyword(normalized, ['90847']) || hasKeyword(normalized, ['family therapy', 'family psychotherapy']))
    && (hasKeyword(normalized, ['90853']) || hasKeyword(normalized, ['group therapy', 'group psychotherapy', '90849']))) {
    return payload(
      'Family therapy and group therapy are different psychotherapy families. Vera should treat 90846 and 90847 as family psychotherapy codes, 90849 as multiple-family group psychotherapy, and 90853 as group psychotherapy rather than using them interchangeably.',
      [
        'Keep the note explicit about whether the work was with one family, multiple families together, or a standard psychotherapy group.',
        'Do not let Vera infer family-therapy billing from generic collateral or participation language, and do not let her infer group psychotherapy from attendance alone.',
      ],
    );
  }

  if (hasKeyword(normalized, ['90792'])) {
    return payload(
      'CPT 90792 is psychiatric diagnostic evaluation with medical services. In practice, Vera should treat it as the diagnostic-evaluation family that includes medical assessment or prescribing work, not as a generic psychotherapy follow-up code.',
      [
        'Use 90791 versus 90792 based on whether medical services are part of the encounter.',
        'Final code choice still depends on payer rules, clinician type, and what was actually documented.',
      ],
    );
  }

  if (hasKeyword(normalized, ['90791'])) {
    return payload(
      'CPT 90791 is psychiatric diagnostic evaluation without medical services. Vera should treat it as an intake or diagnostic-evaluation family code, not as routine medication-management or psychotherapy follow-up billing.',
      [
        'If medical services are also part of the encounter, the family may shift to 90792 depending on the clinician and payer rules.',
        'Keep diagnosis formulation, risk assessment, and relevant history explicit in the source before leaning on this family.',
      ],
    );
  }

  if (hasKeyword(normalized, ['90839', '90840', 'psychotherapy crisis', 'crisis psychotherapy'])) {
    return payload(
      'Psychotherapy for crisis uses the 90839 and 90840 family. Vera should frame that family as crisis-specific, time-based, and dependent on clearly documented crisis intervention time rather than ordinary supportive therapy language.',
      [
        'Document crisis timing literally and keep the acuity, intervention, and safety context explicit.',
        'Do not let Vera imply crisis psychotherapy just because the visit was urgent or emotionally intense.',
      ],
    );
  }

  if (hasKeyword(normalized, ['90785', 'interactive complexity'])) {
    return payload(
      'CPT 90785 is the interactive complexity add-on code used with certain psychiatric services when communication factors substantially complicate the work. Vera should treat it as an add-on that requires specific communication-complexity support, not as a routine companion code for every therapy visit.',
      [
        'Interactive complexity should stay tied to what actually complicated communication or care delivery in the encounter.',
        'Vera should stay conservative and avoid implying 90785 unless those complicating factors are clearly documented.',
      ],
    );
  }

  if (hasKeyword(normalized, ['90833', '90836', '90838', 'psychotherapy add-on', 'add on psychotherapy'])) {
    return payload(
      'Codes 90833, 90836, and 90838 are psychotherapy add-on codes used with an E/M service on the same day when psychotherapy is separately documented. Vera should treat them as combination-family codes, not as stand-alone med-management shortcuts.',
      [
        'The psychotherapy time and the E/M work both need to be supportable in the note.',
        'If psychotherapy was not separately documented, Vera should stay conservative and avoid implying an add-on code is justified.',
      ],
    );
  }

  if (hasKeyword(normalized, ['90832', '90834', '90837']) || (hasKeyword(normalized, ['psychotherapy']) && !hasKeyword(normalized, ['add-on', 'add on', '90833', '90836', '90838', 'crisis']))) {
    return payload(
      'The psychotherapy family 90832, 90834, and 90837 is time-based psychotherapy rather than medication-management E/M. Vera should treat that family as dependent on actual documented psychotherapy time and therapy content, not just a psychiatric follow-up visit.',
      [
        'If the encounter also included medical decision-making or prescribing, the note may instead need an E/M service with a psychotherapy add-on family depending on documentation.',
        'Avoid backfilling therapy content just because psychotherapy minutes are present.',
      ],
    );
  }

  if (hasKeyword(normalized, ['90846', 'family psychotherapy without patient', 'family psychotherapy w/o patient'])) {
    return payload(
      'CPT 90846 is family psychotherapy without the patient present. Vera should treat it as a family-therapy code rather than an individual psychotherapy or med-management code.',
      [
        'The note should make it clear that the patient was not present and that the psychotherapy work focused on treatment of the mental disorder through family work.',
        'Do not let Vera blur 90846 with simple collateral gathering or routine care coordination.',
      ],
    );
  }

  if (hasKeyword(normalized, ['90847', 'family psychotherapy with patient', 'family psychotherapy w patient'])) {
    return payload(
      'CPT 90847 is family psychotherapy with the patient present. Vera should keep that separate from individual psychotherapy and from pure family-only sessions.',
      [
        'The note should support that psychotherapy occurred with the patient and family together, not just brief family discussion during another visit type.',
        'If medical decision-making or prescribing also occurred, Vera should stay careful about not collapsing distinct billing families into one undocumented shortcut.',
      ],
    );
  }

  if (hasKeyword(normalized, ['90849', 'multiple family group'])) {
    return payload(
      'CPT 90849 is multiple-family group psychotherapy. Vera should treat it as a group-family psychotherapy family rather than ordinary individual or conjoint family therapy.',
      [
        'Documentation should support group-family psychotherapy rather than a standard individual session.',
        'Vera should not infer 90849 from generic group participation language alone.',
      ],
    );
  }

  if (hasKeyword(normalized, ['90853', 'group psychotherapy'])) {
    return payload(
      'CPT 90853 is group psychotherapy. Vera should treat it as a therapy-group family code rather than med-management or individual psychotherapy.',
      [
        'Documentation should support actual group psychotherapy content rather than generic attendance or class participation.',
        'If interactive complexity is being considered, Vera should keep that as a separate add-on discussion rather than automatically pairing codes.',
      ],
    );
  }

  if (hasKeyword(normalized, ['90845', 'psychoanalysis'])) {
    return payload(
      'CPT 90845 is psychoanalysis. Vera should treat it as a distinct psychotherapy family rather than folding it into routine outpatient psychotherapy or med-management follow-up logic.',
      [
        'This is a therapy-specific family and should not be implied from generic supportive therapy wording.',
        'Keep Vera conservative unless the documentation truly supports that level and type of psychotherapy service.',
      ],
    );
  }

  if (hasKeyword(normalized, ['99202', '99203', '99204', '99205', '99212', '99213', '99214', '99215', 'e/m', 'evaluation and management', 'med management', 'med check'])) {
    return payload(
      'Psych medication-management follow-up usually lives in the office or outpatient E/M family rather than one single psychiatry-specific CPT code. Vera should frame that as depending on new versus established status plus the documented medical decision making or total time.',
      [
        'If separately documented psychotherapy was also furnished on the same day, the billing family may become E/M plus a psychotherapy add-on rather than E/M alone.',
        'Vera should never pretend to choose the final E/M level without the actual documentation support.',
      ],
    );
  }

  if (hasKeyword(normalized, ['g2211'])) {
    return payload(
      'G2211 is an add-on complexity code tied to certain office or outpatient E/M visits rather than a standalone psych therapy code. Vera should treat it as documentation-dependent and payer-rule-sensitive, not something to append automatically.',
      [
        'Use the current CMS guidance to confirm when G2211 may be reported with the underlying E/M family.',
        'Keep Vera conservative unless the continuity and complexity rationale is clearly documented.',
      ],
    );
  }

  if (hasKeyword(normalized, ['cpt', 'billing', 'modifier'])) {
    return payload(
      'For psych billing help, Vera should stay inside bounded families rather than pretending final CPT certainty. The main families are psychiatric diagnostic evaluation, office/outpatient E/M, psychotherapy, psychotherapy add-on with E/M, and psychotherapy for crisis.',
      [
        'If you tell me whether this was intake, med-management follow-up, psychotherapy-only, E/M plus psychotherapy, or crisis work, I can narrow the family safely.',
        'Vera should keep CPT guidance documentation-dependent and avoid implying final billing certainty.',
      ],
    );
  }

  return null;
}
