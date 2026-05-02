import type { AssistantResponsePayload } from '@/types/assistant';
import {
  detectReasoningExposureMode,
  formatStructuredReasoningHints,
} from '@/lib/veranote/assistant-reasoning-exposure';

type DiagnosticSafetyProfile = {
  restraint: string;
  missing: string[];
  ruleOuts: string[];
  documentation?: string;
};

const DIAGNOSTIC_TERMS =
  /\b(bipolar|mania|manic|hypomania|major depression|major depressive|mdd|schizophrenia|psychosis|psychotic|hallucinations?|panic disorder|panic attack|generalized anxiety|gad\b|agoraphobia|phobia|ptsd|acute stress|borderline|bpd\b|narcissistic|personality disorder|conduct disorder|antisocial|substance-induced|adhd|autism|intellectual disability|tourette|oppositional|odd\b|dmdd|separation anxiety|dementia|neurocognitive|delirium|malingering|drug[-\s]?seeking|noncompliant|no risk|low risk|medically cleared)\b/i;

const DIAGNOSTIC_INFERENCE_CUES = [
  /\bis (this|that)\b/i,
  /\bdoes (this|that)\s+(meet|count as)\b/i,
  /\bcan i\s+(diagnose|call|say|list|write|chart)\b/i,
  /\bshould i\s+(document|call|write|chart)\b/i,
  /\b(before diagnosing|before i diagnose|what am i missing before diagnos)\b/i,
  /\bwhy not\b.*\b(bipolar|mania|mdd|depression|schizophrenia|psychosis|ptsd|panic disorder|gad|adhd|autism|personality disorder|delirium|dementia|diagnosis)\b/i,
  /\bwhat should atlas say\b/i,
  /\b(diagnosis|diagnose)\?\s*$/i,
];

const NON_DIAGNOSTIC_DIRECT_REFERENCE =
  /\b(fda[-\s]?approved|approved for|approved in|approved to|approved medication|approved treatment|which medications are approved|which drugs are approved|max(?:imum)? dose|starting dose|half-life|therapeutic range|therapeutic level|serum level|renal dosing|dose adjustment|food|calories|washout|monitoring|side effects?|interaction|contraindicated|combine|taken together|safe for|safe in|safe with)\b/i;

const PURE_DIAGNOSTIC_CONCEPT_CUE =
  /^(what is|what are|difference between|how is|how long|duration requirement|criteria for|symptoms of)\b/i;

const MEDICATION_USE_SAFETY_CUE =
  /\b(can i|should i|could i)\s+(use|give|start|restart|prescribe|try)\b.*\b(stimulant|antidepressant|antipsychotic|lamotrigine|lamictal|lithium|valproate|depakote|clozapine|ssri|snri|maoi|benzo|benzodiazepine)\b/i;

function normalizeMessage(message: string) {
  return message.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function hasAny(message: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(message));
}

function compactList(items: string[], maxItems: number) {
  return unique(items).slice(0, maxItems);
}

function buildReasoningHints(normalized: string, profile: DiagnosticSafetyProfile) {
  const hints = [...profile.missing];

  if (/\bbipolar|mania|manic|hypomania|talks fast|racing thoughts|slept\b/.test(normalized)) {
    hints.push('baseline change', 'sustained episode pattern', 'substance or medication effects');
  } else if (/\bschizophrenia|psychosis|paranoia|hallucinations?|voices?\b/.test(normalized)) {
    hints.push('timeline of psychosis', 'substance/medical rule-outs', 'collateral');
  } else if (/\bptsd|trauma|nightmares|hypervigilance\b/.test(normalized)) {
    hints.push('trauma exposure details', 'duration', 'current impairment');
  } else if (/\bdelirium|dementia|confusion|confused|low sodium|febrile|uti\b/.test(normalized)) {
    hints.push('baseline cognition', 'fluctuation', 'medical contributors');
  } else {
    hints.push('rule-outs', 'observed versus reported findings');
  }

  return compactList(hints, 4);
}

function buildDeepReasoningOutline(normalized: string, profile: DiagnosticSafetyProfile) {
  if (/\bbipolar|mania|manic|hypomania|talks fast|racing thoughts|slept\b/.test(normalized)) {
    return 'Clinical reasoning: - Bipolar disorder remains only a possibility until there is a sustained episode pattern, baseline change, and impairment. - Sleep deprivation, substances, medications, trauma/stressor context, and medical causes can mimic manic-spectrum symptoms. - Document the observed symptoms while keeping the diagnosis provisional.';
  }

  if (/\bschizophrenia|psychosis|paranoia|hallucinations?|voices?\b/.test(normalized)) {
    return 'Clinical reasoning: - Primary psychotic disorder requires a timeline that is not better explained by substances, mood episodes, delirium, or medical causes. - Collateral, sobriety or stabilization, and longitudinal pattern help separate transient psychosis from a primary disorder. - Document the psychotic symptoms and uncertainty separately.';
  }

  if (/\bptsd|trauma|nightmares|hypervigilance\b/.test(normalized)) {
    return 'Clinical reasoning: - Trauma-related diagnoses depend on exposure details, symptom clusters, duration, impairment, and differential diagnosis. - Acute stress, sleep disruption, substances, and other anxiety disorders can overlap. - Document symptoms and trauma context without overcalling the diagnosis.';
  }

  const missing = profile.missing.length ? profile.missing.join(', ') : 'duration, impairment, baseline, and context';
  return `Clinical reasoning: - The diagnosis remains only a possibility until ${missing} are clear. - Rule-outs should stay visible when symptoms could be substance-induced, medication-induced, medical, trauma-related, or developmental. - Document observed/reported findings rather than assigning a diagnosis from limited data.`;
}

function buildProfile(normalized: string): DiagnosticSafetyProfile {
  const missing = ['duration', 'impairment', 'context'];
  const ruleOuts: string[] = [];
  let restraint = 'This is not enough to diagnose the condition.';
  let documentation = 'Document observed/reported findings and avoid assigning diagnosis from limited data.';

  if (/\b(denies hallucinations|internal preoccupation|staff saw)\b/.test(normalized)) {
    return {
      restraint: 'This is not enough to document as hallucinations.',
      missing: ['collateral', 'context'],
      ruleOuts: ['The patient denies hallucinations, while staff observed behavior concerning for internal preoccupation.'],
      documentation: 'Document observed/reported findings separately and avoid assigning diagnosis from limited data.',
    };
  }

  if (/\b(no risk|low risk|absence of risk|say no risk|write low risk)\b/.test(normalized) && /\b(denies|collateral|texts?|gun|weapon|access)\b/.test(normalized)) {
    return {
      restraint: 'This is not enough to document absence of risk.',
      missing: ['collateral', 'access to means', 'context'],
      ruleOuts: ['Contradictions, weapon-access uncertainty, and other risk-context gaps must remain visible.'],
      documentation: 'Document observed/reported findings and avoid assigning diagnosis from limited data.',
    };
  }

  if (/\bmedically cleared\b/.test(normalized)) {
    return {
      restraint: 'This is not enough to document medical clearance.',
      missing: ['pending labs', 'context'],
      ruleOuts: ['Pending results and medical causes should remain unresolved until reviewed.'],
      documentation: 'Document observed/reported findings and avoid assigning diagnosis from limited data.',
    };
  }

  if (/\bmalingering\b/.test(normalized)) {
    return {
      restraint: 'This is not enough to document as a symptom-validity conclusion.',
      missing: ['collateral', 'longitudinal pattern', 'context'],
      ruleOuts: ['Alternative explanations and incentives should remain hypotheses rather than conclusions.'],
      documentation: 'Document observable observed/reported findings and avoid assigning diagnosis from limited data.',
    };
  }

  if (/\bdrug[-\s]?seeking|stimulants?\b/.test(normalized) && /\basked|request|write|chart\b/.test(normalized)) {
    return {
      restraint: 'This is not enough to document a motive label.',
      missing: ['context', 'collateral'],
      ruleOuts: ['Substance use, ADHD history, risk, and treatment context may matter.'],
      documentation: 'Document observable observed/reported findings and avoid assigning diagnosis from limited data.',
    };
  }

  if (/\bnoncompliant|med refusal|refusal\b/.test(normalized)) {
    return {
      restraint: 'This is not enough to document a personality diagnosis.',
      missing: ['longitudinal pattern', 'context'],
      ruleOuts: ['Refusal may reflect barriers, concerns, side effects, capacity, or preference.'],
      documentation: 'Document observable refusal and observed/reported findings, and avoid assigning diagnosis from limited data.',
    };
  }

  if (/\bbipolar|mania|manic|hypomania|racing thoughts|talks fast|elevated mood|mood swings\b/.test(normalized)) {
    restraint = 'This is not enough to diagnose bipolar disorder.';
    missing.splice(0, missing.length, 'duration', 'baseline', 'impairment', 'context');
    ruleOuts.push('Substance-induced, medication-induced, sleep-deprivation, trauma/stressor, and medical causes should remain rule-outs when relevant.');
    if (/\b(child|teen|adolescent|pediatric)\b/.test(normalized)) {
      missing.unshift('developmental history');
    }
  }

  if (/\bprednisone|steroid|medication|stimulant increase|benadryl|diphenhydramine\b/.test(normalized)) {
    ruleOuts.push('Medication-induced symptoms are an important rule-out.');
    if (!missing.includes('medication')) {
      missing.push('medication');
    }
  }

  if (/\bmdd|major depression|major depressive|depressed mood|tearfulness|depression\b/.test(normalized)) {
    restraint = 'This is not enough to diagnose major depressive disorder.';
    missing.splice(0, missing.length, 'duration', 'impairment', 'context');
    ruleOuts.push('Substance-induced, medication-induced, grief/stressor, bipolar-spectrum, and medical causes should remain rule-outs when relevant.');
  }

  if (/\bschizophrenia|psychosis|psychotic|paranoia|hallucinations?|voice|bizarre behavior|primary psychotic\b/.test(normalized)) {
    restraint = 'This is not enough to diagnose a primary psychotic disorder.';
    missing.splice(0, missing.length, 'duration', 'baseline', 'collateral', 'context');
    ruleOuts.push('Substance-induced, medication-induced, mood-related, trauma-related, delirium, and other medical causes should remain rule-outs when relevant.');
  }

  if (/\bpanic disorder|panic attack|panicked\b/.test(normalized)) {
    restraint = 'This is not enough to diagnose panic disorder.';
    missing.splice(0, missing.length, 'recurrent attacks', 'duration', 'impairment', 'context');
    ruleOuts.push('Substance-induced, medication-induced, medical, trauma/stressor, and other anxiety causes should remain rule-outs when relevant.');
  }

  if (/\bgeneralized anxiety|\bgad\b|worries|worry\b/.test(normalized)) {
    restraint = 'This is not enough to diagnose generalized anxiety disorder.';
    missing.splice(0, missing.length, 'duration', 'impairment', 'context');
    ruleOuts.push('A current stressor, substance/medication effects, medical causes, and other anxiety disorders should remain rule-outs when relevant.');
  }

  if (/\bagoraphobia|social anxiety|fear of being judged|crowds\b/.test(normalized)) {
    restraint = 'This is not enough to diagnose agoraphobia.';
    missing.splice(0, missing.length, 'duration', 'impairment', 'context');
    ruleOuts.push('Social anxiety, agoraphobia, trauma/stressor, substance-induced, and medical explanations should stay in the differential.');
  }

  if (/\bptsd|acute stress|trauma|nightmares|hypervigilance|crash\b/.test(normalized)) {
    restraint = 'This is not enough to diagnose PTSD or acute stress disorder.';
    missing.splice(0, missing.length, 'duration', 'impairment', 'context');
    ruleOuts.push('Trauma exposure details, acute stress timing, substance effects, sleep disturbance, and other differential diagnoses should remain visible.');
  }

  if (/\bno current symptoms|symptoms documented\b/.test(normalized) && !missing.includes('symptoms')) {
    missing.push('symptoms');
  }

  if (/\bfunctioning is unclear|ptsd or phobia|differential\b/.test(normalized)) {
    if (!missing.includes('impairment')) {
      missing.push('impairment');
    }
    ruleOuts.push('Differential diagnosis should remain open until functioning, avoidance pattern, and trauma/stressor context are clearer.');
  }

  if (/\bborderline|bpd\b|narcissistic|personality disorder|antisocial|conduct disorder|legal history|self-harm|grandiose|angry with staff|demanding discharge|steals|violates rules\b/.test(normalized)) {
    restraint = 'This is not enough to diagnose a personality or conduct disorder.';
    missing.splice(0, missing.length, 'longitudinal pattern', 'duration', 'context');
    ruleOuts.push('Substance-induced symptoms, trauma/stressor effects, mood disorder, developmental history, and situational behavior should remain rule-outs when relevant.');
    if (/\b(noncompliant|refus(?:e|al|ing)|med refusal|medication refusal)\b/.test(normalized)) {
      documentation = 'Document observable refusal behavior and the clinical context; avoid labeling refusal as personality disorder from limited data.';
    }
  }

  if (/\bchildhood\b/.test(normalized) && !missing.includes('childhood')) {
    missing.push('childhood');
  }

  if (/\bone interview\b/.test(normalized) && !missing.includes('one interview')) {
    missing.push('one interview');
  }

  if (/\bsubstance-induced|meth|cocaine|alcohol|cannabis|edibles|opioid|withdrawal|detox|intoxicated|synthetic cannabinoid|stimulant binges|binges|uds\b/.test(normalized)) {
    if (!/\bpsychosis|psychotic|schizophrenia/.test(normalized) && /\bsubstance-induced\b/.test(normalized)) {
      restraint = 'This is not enough to diagnose the cause of the symptoms.';
    }
    ruleOuts.push('Substance-induced and withdrawal-related symptoms require timeline, sobriety, and reassessment context.');
    if (!missing.includes('timeline')) {
      missing.push('timeline');
    }
  }

  if (/\bsobriety|stimulant binges|binges\b/.test(normalized) && !missing.includes('sobriety')) {
    missing.push('sobriety');
  }

  if (/\breassessment\b/.test(normalized) && !ruleOuts.some((item) => item.includes('reassessment'))) {
    ruleOuts.push('Reassessment after stabilization is needed before diagnostic certainty.');
  }

  if (/\badhd|autism|intellectual disability|tourette|tics|low iq|adaptive|eye contact|poor grades|inattentive\b/.test(normalized)) {
    restraint = 'This is not enough to diagnose a neurodevelopmental disorder.';
    missing.splice(0, missing.length, 'developmental history', 'settings', 'impairment', 'duration');
    ruleOuts.push('Sleep, mood, anxiety, trauma/stressor, medication effects, substance effects, and medical causes should remain rule-outs when relevant.');
    if (/\b(telehealth|eye contact|one visit)\b/.test(normalized)) {
      missing.unshift('collateral');
    }
  }

  if (/\badaptive\b/.test(normalized) && !missing.includes('adaptive functioning')) {
    missing.unshift('adaptive functioning');
  }

  if (/\bcollateral\b/.test(normalized) && !missing.includes('collateral')) {
    missing.push('collateral');
  }

  if (/\boppositional|odd\b|tantrum|aggressive|dmdd|separation anxiety|school refusal|outbursts|irritability\b/.test(normalized)) {
    restraint = 'This is not enough to diagnose a pediatric behavior disorder.';
    missing.splice(0, missing.length, 'pattern', 'settings', 'duration', 'context');
    ruleOuts.push('Developmental conditions, trauma/stressor, mood disorder, anxiety, substance/medication effects, and environment should remain rule-outs when relevant.');
  }

  if (/\bdevelopmental\b/.test(normalized) && !missing.some((item) => item.includes('developmental'))) {
    missing.push('developmental history');
  }

  if (/\bstressor|eviction|bullying\b/.test(normalized)) {
    ruleOuts.push('Trauma/stressor context matters before assigning a diagnosis.');
    if (!missing.includes('stressor')) {
      missing.push('stressor');
    }
  }

  if (/\b(dementia|neurocognitive|delirium|confused|confusion|disoriented|uti|low sodium|febrile|fever|moca|memory|fluctuating attention|urinary retention)\b/.test(normalized)) {
    restraint = 'This is not enough to diagnose a neurocognitive or primary psychiatric disorder.';
    missing.splice(0, missing.length, 'baseline', 'duration', 'medical context');
    ruleOuts.push('Delirium, medical causes, medication effects, intoxication or withdrawal, depression, and metabolic contributors should remain rule-outs when relevant.');
  }

  if (/\bintoxication|intoxicated\b/.test(normalized) && !ruleOuts.some((item) => item.includes('intoxication'))) {
    ruleOuts.push('Intoxication can invalidate a stable diagnostic interpretation.');
  }

  if (/\bdepression severe|memory complaints\b/.test(normalized) && !ruleOuts.some((item) => item.includes('depression'))) {
    ruleOuts.push('Depression can affect cognition and should remain in the differential.');
  }

  if (/\bmedical|low sodium|chest pain|febrile|fever|uti|confused|confusion|delirium|metabolic\b/.test(normalized)) {
    ruleOuts.push('Medical causes, including delirium or metabolic contributors, must be considered.');
  }

  return {
    restraint,
    missing: compactList(missing, 4),
    ruleOuts: compactList(ruleOuts, 2),
    documentation,
  };
}

export function buildDiagnosticSafetyGateHelp(message: string): AssistantResponsePayload | null {
  const normalized = normalizeMessage(message);
  if (!normalized || NON_DIAGNOSTIC_DIRECT_REFERENCE.test(normalized) || MEDICATION_USE_SAFETY_CUE.test(normalized)) {
    return null;
  }

  if (PURE_DIAGNOSTIC_CONCEPT_CUE.test(normalized) && !/\b(can i|should i|does this|is this|before diagnosing|from this|from one|after)\b/i.test(normalized)) {
    return null;
  }

  const inferenceCue = hasAny(normalized, DIAGNOSTIC_INFERENCE_CUES);
  const standaloneDiagnosisQuestion =
    !/^(what|how|which|is the|are|does)\b/.test(normalized)
    && /\b(bipolar|schizophrenia|psychosis|psychotic disorder|ptsd|acute stress|panic disorder|gad|generalized anxiety|agoraphobia|phobia|personality disorder|conduct disorder|antisocial personality disorder|adhd|autism|intellectual disability|tourette syndrome|oppositional defiant disorder|odd|dmdd|separation anxiety|dementia|delirium|neurocognitive disorder)\?\s*$/.test(normalized);
  const diagnosticTerm = DIAGNOSTIC_TERMS.test(normalized);
  const diagnosticDocumentationCue =
    /\b(how should i word|wording)\b.*\b(malingering|drug[-\s]?seeking|noncompliant|personality disorder|bipolar|schizophrenia|psychotic disorder|ptsd|adhd|autism|intellectual disability)\b/i.test(normalized);
  const conflictOrConfound =
    /\b(collateral|staff|uds|meth|cocaine|alcohol|cannabis|withdrawal|detox|intoxicated|prednisone|steroid|benadryl|low sodium|febrile|confused|uti|fluctuating attention|pending labs)\b/i.test(normalized)
    && diagnosticTerm;

  if (!diagnosticTerm || (!inferenceCue && !diagnosticDocumentationCue && !standaloneDiagnosisQuestion && !conflictOrConfound)) {
    return null;
  }

  const profile = buildProfile(normalized);
  const reasoningMode = detectReasoningExposureMode(message, {
    diagnosticSafetyTriggered: true,
    ambiguousOrIncompleteScenario: true,
  });
  const missing = profile.missing.length
    ? `Key missing context: ${profile.missing.join(', ')}.`
    : 'Key missing context: duration, impairment, baseline, and context.';
  const ruleOuts = profile.ruleOuts.length
    ? profile.ruleOuts.join(' ')
    : 'Substance-induced, medication-induced, medical, trauma/stressor, and developmental explanations should remain rule-outs when relevant.';
  const documentation = profile.documentation || 'Document observed/reported findings and avoid assigning diagnosis from limited data.';
  const exposure =
    reasoningMode === 'deep'
      ? buildDeepReasoningOutline(normalized, profile)
      : reasoningMode === 'clarification'
        ? formatStructuredReasoningHints(buildReasoningHints(normalized, profile))
        : '';

  return {
    message: `Diagnostic reference summary: ${profile.restraint} ${missing} ${ruleOuts} ${exposure ? `${exposure} ` : ''}${documentation}`,
    suggestions: [],
    answerMode: 'direct_reference_answer',
  };
}
