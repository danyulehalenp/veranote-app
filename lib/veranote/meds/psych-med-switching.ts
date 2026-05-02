import {
  PSYCH_MEDICATION_LIBRARY,
  PSYCH_MEDICATION_LOOKUP_TERMS,
} from '@/lib/veranote/meds/psych-med-library';
import type {
  PsychMedicationAnswer,
  PsychMedicationProfile,
  PsychMedicationSwitchRule,
  PsychMedicationSwitchStrategy,
  PsychMedicationSwitchStrategyType,
} from '@/lib/veranote/meds/psych-med-types';

const SWITCHING_CAVEAT =
  'This is a provider-review switching framework, not a patient-specific order. Verify with current prescribing references, interaction checking, and patient-specific factors.';

const SWITCHING_STRATEGIES: Record<PsychMedicationSwitchStrategyType, PsychMedicationSwitchStrategy> = {
  direct_switch: {
    id: 'direct_switch',
    label: 'Direct switch',
    description: 'Stopping one agent and starting the new agent without a prolonged overlap when a direct transition is often feasible.',
    whenUsed: ['Lower-risk transitions where interaction and discontinuation risk are limited', 'When prolonged overlap is not preferred'],
    safetyNotes: ['Still verify half-life, discontinuation burden, and target indication', 'Not appropriate for all serotonergic, MAOI, or medically complex transitions'],
    monitoring: ['Withdrawal symptoms', 'Early activation or adverse effects', 'Relapse or symptom rebound'],
    verificationRequired: ['Exact dose and formulation', 'Interaction burden', 'Patient-specific relapse or withdrawal risk'],
  },
  taper_then_switch: {
    id: 'taper_then_switch',
    label: 'Taper then switch',
    description: 'Reducing the original agent first, then starting the new agent once discontinuation burden or interaction risk is lower.',
    whenUsed: ['When discontinuation symptoms matter', 'When overlap is possible but not preferred'],
    safetyNotes: ['Slower taper may be needed for high-discontinuation agents', 'Do not assume a standard taper speed from memory'],
    monitoring: ['Withdrawal symptoms', 'Return of target symptoms', 'Activation or intolerance after the new start'],
    verificationRequired: ['Current dose and duration', 'Risk of withdrawal or relapse', 'Current prescribing guidance for the pair'],
  },
  cross_taper: {
    id: 'cross_taper',
    label: 'Cross-taper',
    description: 'Gradually lowering one medication while cautiously starting and increasing another when overlap may be reasonable.',
    whenUsed: ['Some antidepressant or antipsychotic transitions with manageable interaction risk', 'When abrupt discontinuation may destabilize the patient'],
    safetyNotes: ['Avoid routine cross-taper when serotonergic toxicity or washout concerns are high', 'Cross-taper speed is patient and product specific'],
    monitoring: ['Withdrawal symptoms', 'Additive adverse effects', 'Toxicity, activation, EPS, or relapse'],
    verificationRequired: ['Interaction checking', 'Dose equivalence assumptions', 'Current product guidance'],
  },
  taper_washout_switch: {
    id: 'taper_washout_switch',
    label: 'Taper, washout, then switch',
    description: 'Reducing and stopping the first medication, allowing a washout interval, then starting the next medication.',
    whenUsed: ['When residual interaction risk persists after discontinuation', 'When serotonergic or sympathomimetic interactions are clinically important'],
    safetyNotes: ['Washout length depends on the medication pair', 'Do not treat this as a standard same-day substitution'],
    monitoring: ['Withdrawal symptoms', 'Emergent toxicity during overlap tail', 'Return of target symptoms during washout'],
    verificationRequired: ['Half-life and active metabolite review', 'Interaction reference', 'Current prescribing guidance'],
  },
  washout_required: {
    id: 'washout_required',
    label: 'Washout required',
    description: 'A washout period is central to the transition and routine cross-taper should be avoided.',
    whenUsed: ['MAOI transitions', 'Certain high-risk serotonergic or sympathomimetic switches'],
    safetyNotes: ['Specialist or current-reference guidance is often required', 'Avoid casual cross-taper framing'],
    monitoring: ['Serotonin syndrome symptoms', 'Hypertensive symptoms', 'Withdrawal or relapse during the gap'],
    verificationRequired: ['Current product labeling', 'Interaction checker', 'Medication-specific washout rules'],
  },
  overlap_bridge: {
    id: 'overlap_bridge',
    label: 'Overlap bridge',
    description: 'Temporary overlap while the new medication is started and the old medication is reduced more cautiously.',
    whenUsed: ['When relapse risk from abrupt discontinuation may be high', 'Some mood stabilizer or antipsychotic transitions'],
    safetyNotes: ['Overlap increases additive adverse-effect burden', 'Do not assume overlap is harmless without interaction review'],
    monitoring: ['Relapse or withdrawal', 'Sedation, EPS, metabolic burden, or toxicity', 'Relevant labs or levels'],
    verificationRequired: ['Interaction checker', 'Current dose and adherence', 'Current prescribing guidance'],
  },
  oral_to_lai_transition: {
    id: 'oral_to_lai_transition',
    label: 'Oral-to-LAI transition',
    description: 'Transitioning from an oral antipsychotic to a long-acting injectable using product-specific loading and oral-overlap rules.',
    whenUsed: ['When moving from oral antipsychotic therapy to a specific LAI product'],
    safetyNotes: ['Oral overlap and loading differ by LAI product', 'Missed-dose and initiation rules are product specific'],
    monitoring: ['Oral overlap status', 'Injection tolerability', 'EPS, sedation, and relapse symptoms'],
    verificationRequired: ['Exact LAI product labeling', 'Oral overlap requirements', 'Missed-dose guidance'],
  },
  taper_only: {
    id: 'taper_only',
    label: 'Taper only',
    description: 'Reducing and stopping a medication without committing to a new replacement medication in the same framework.',
    whenUsed: ['Benzodiazepine tapers', 'Sedative-hypnotic reduction', 'When the question is only about weaning off'],
    safetyNotes: ['Abrupt discontinuation can be dangerous for some agents', 'Taper speed is individualized'],
    monitoring: ['Withdrawal symptoms', 'Seizure risk when relevant', 'Rebound anxiety or insomnia'],
    verificationRequired: ['Duration of use', 'Current dose and formulation', 'Withdrawal-risk guidance'],
  },
  specialist_reference_required: {
    id: 'specialist_reference_required',
    label: 'Specialist/current-reference required',
    description: 'The switch is high enough risk that current labeling or specialist review should guide the exact transition.',
    whenUsed: ['MAOIs', 'Clomipramine or complex serotonergic switches', 'Valproate-lamotrigine transitions', 'Carbamazepine interaction-heavy transitions'],
    safetyNotes: ['Do not present a routine cross-taper as if it is standardized', 'High-risk interaction and toxicity issues may be product specific'],
    monitoring: ['Toxicity, withdrawal, relapse, and any medication-specific high-risk effects'],
    verificationRequired: ['Current prescribing references', 'Interaction checker', 'Product-specific conversion or titration guidance'],
  },
  avoid_cross_taper: {
    id: 'avoid_cross_taper',
    label: 'Avoid routine cross-taper',
    description: 'A switch where routine overlap is discouraged because toxicity, washout, or cardiac/serotonergic risk may be too high.',
    whenUsed: ['MAOI to serotonergic switches', 'Clomipramine or TCA serotonergic transitions', 'Some high-risk antidepressant transitions'],
    safetyNotes: ['Do not casually overlap these agents', 'Washout or delayed-start logic may matter'],
    monitoring: ['Serotonin syndrome symptoms', 'Cardiac effects when relevant', 'Withdrawal or relapse during the transition'],
    verificationRequired: ['Current labeling', 'Interaction checker', 'Specialist input when needed'],
  },
};

const HIGH_RISK_SWITCH_RULES: PsychMedicationSwitchRule[] = [
  {
    id: 'maoi_switch',
    severity: 'critical',
    strategy: 'washout_required',
    summary: 'MAOI transitions should not be treated as routine cross-tapers.',
    appliesWhen: ['MAOI to serotonergic antidepressant', 'Serotonergic antidepressant to MAOI', 'MAOI to stimulant or sympathomimetic exposure'],
    doNotLine: 'Do not cross-taper MAOI or MAOI-like combinations without specialist/current-reference guidance.',
    monitoring: ['Serotonin syndrome symptoms', 'Hypertensive symptoms', 'Withdrawal or relapse during washout'],
    verificationRequired: ['Current product labeling', 'Washout timing', 'Interaction checker'],
  },
  {
    id: 'fluoxetine_long_half_life',
    severity: 'high',
    strategy: 'taper_washout_switch',
    summary: 'Fluoxetine can continue to matter after stopping because of its long half-life.',
    appliesWhen: ['Fluoxetine to another antidepressant', 'Another serotonergic antidepressant to fluoxetine when interaction timing matters'],
    doNotLine: 'Do not assume same-day equivalence just because fluoxetine has been stopped.',
    monitoring: ['Activation, serotonin toxicity, and delayed interaction tail', 'Withdrawal or relapse symptoms'],
    verificationRequired: ['Half-life review', 'Target medication interaction profile', 'Current prescribing guidance'],
  },
  {
    id: 'paroxetine_venlafaxine_discontinuation',
    severity: 'high',
    strategy: 'taper_then_switch',
    summary: 'Paroxetine and venlafaxine can have clinically significant discontinuation symptoms.',
    appliesWhen: ['Paroxetine switch', 'Venlafaxine switch'],
    doNotLine: 'Do not frame paroxetine or venlafaxine discontinuation as a casual abrupt stop.',
    monitoring: ['Discontinuation symptoms', 'Anxiety, dizziness, GI symptoms, and symptom rebound'],
    verificationRequired: ['Current dose and duration', 'Taper pace', 'Current prescribing guidance'],
  },
  {
    id: 'clomipramine_tca_serotonergic_switch',
    severity: 'critical',
    strategy: 'avoid_cross_taper',
    summary: 'Clomipramine or TCA serotonergic switches deserve extra caution because toxicity and cardiac risk can rise quickly.',
    appliesWhen: ['Sertraline to clomipramine', 'Clomipramine to another serotonergic antidepressant', 'Other TCA-serotonergic switches with cardiac/toxicity concern'],
    doNotLine: 'Do not routine-cross-taper clomipramine or other high-risk TCA-serotonergic combinations without current-reference guidance.',
    monitoring: ['Serotonergic toxicity', 'Cardiac symptoms or EKG concern', 'Anticholinergic burden and withdrawal'],
    verificationRequired: ['Current prescribing reference', 'Interaction checker', 'Cardiac risk review'],
  },
  {
    id: 'antidepressant_general_switch',
    severity: 'moderate',
    strategy: 'cross_taper',
    summary: 'Some lower-risk antidepressant pairs may allow a cautious cross-taper, but interaction and discontinuation burden still matter.',
    appliesWhen: ['SSRI to SNRI', 'SSRI to SSRI', 'SNRI to non-serotonergic antidepressant'],
    doNotLine: 'Do not assume every antidepressant pair can be safely cross-tapered without checking discontinuation and serotonergic risk.',
    monitoring: ['Withdrawal symptoms', 'Serotonin toxicity', 'Activation, suicidality, and relapse symptoms'],
    verificationRequired: ['Interaction checker', 'Half-life review', 'Current prescribing guidance'],
  },
  {
    id: 'antipsychotic_switch',
    severity: 'high',
    strategy: 'overlap_bridge',
    summary: 'Antipsychotic switches should account for relapse risk, EPS, sedation, QT, anticholinergic burden, and metabolic burden.',
    appliesWhen: ['One oral antipsychotic to another oral antipsychotic'],
    doNotLine: 'Do not frame antipsychotic switching as a simple milligram-for-milligram substitution.',
    monitoring: ['Relapse or rebound psychosis', 'EPS or akathisia', 'Sedation, orthostasis, QT concern, and metabolic burden'],
    verificationRequired: ['Current dose and adherence', 'Equivalent exposure assumptions', 'Current prescribing guidance'],
  },
  {
    id: 'oral_to_lai',
    severity: 'high',
    strategy: 'oral_to_lai_transition',
    summary: 'Oral-to-LAI transitions require exact product labeling for loading and oral overlap.',
    appliesWhen: ['Oral risperidone to risperidone LAI', 'Any oral antipsychotic to a specific LAI product'],
    doNotLine: 'Do not assume LAI oral-overlap or loading rules across products.',
    monitoring: ['Injection tolerability', 'Oral overlap adherence', 'Relapse symptoms, EPS, and sedation'],
    verificationRequired: ['Exact LAI labeling', 'Oral overlap requirements', 'Missed-dose guidance'],
  },
  {
    id: 'lithium_transition',
    severity: 'high',
    strategy: 'overlap_bridge',
    summary: 'Lithium transitions deserve caution because abrupt discontinuation can destabilize mood and lithium monitoring remains relevant.',
    appliesWhen: ['Lithium to another mood stabilizer', 'Another mood stabilizer to lithium'],
    doNotLine: 'Do not abruptly stop lithium or treat the transition as routine without checking relapse and monitoring needs.',
    monitoring: ['Relapse symptoms', 'Lithium level when relevant', 'Renal function, thyroid function, and adverse effects'],
    verificationRequired: ['Current dose and level context', 'Renal/thyroid status', 'Current prescribing guidance'],
  },
  {
    id: 'valproate_lamotrigine_transition',
    severity: 'critical',
    strategy: 'specialist_reference_required',
    summary: 'Valproate-lamotrigine transitions are high risk because valproate changes lamotrigine exposure and rash risk.',
    appliesWhen: ['Valproate to lamotrigine', 'Lamotrigine to valproate', 'Concurrent transition involving both'],
    doNotLine: 'Do not give a routine lamotrigine titration or cross-taper schedule from memory when valproate is involved.',
    monitoring: ['Rash or mucosal symptoms', 'Withdrawal or relapse', 'Sedation and tolerability'],
    verificationRequired: ['Current titration guidance', 'Product labeling', 'Interaction checker'],
  },
  {
    id: 'carbamazepine_transition',
    severity: 'high',
    strategy: 'specialist_reference_required',
    summary: 'Carbamazepine transitions need interaction review because enzyme induction changes levels of many medications.',
    appliesWhen: ['Carbamazepine to another psych medication', 'Another psych medication to carbamazepine'],
    doNotLine: 'Do not assume target-medication levels or timing without current interaction review when carbamazepine is involved.',
    monitoring: ['Withdrawal or relapse', 'Interaction-related loss of effect or toxicity', 'Relevant labs when applicable'],
    verificationRequired: ['Interaction checker', 'Current prescribing guidance', 'Agent-specific level/titration review'],
  },
  {
    id: 'benzodiazepine_taper',
    severity: 'critical',
    strategy: 'taper_only',
    summary: 'Benzodiazepine tapers are individualized because withdrawal and seizure risk can be significant.',
    appliesWhen: ['Alprazolam taper', 'Lorazepam to clonazepam transition', 'General benzodiazepine taper requests'],
    doNotLine: 'Do not recommend abrupt benzodiazepine discontinuation.',
    monitoring: ['Withdrawal, rebound anxiety, insomnia, autonomic symptoms, and seizure risk'],
    verificationRequired: ['Current dose and duration', 'Substance use history', 'Current taper guidance'],
  },
  {
    id: 'stimulant_switch_or_restart',
    severity: 'high',
    strategy: 'direct_switch',
    summary: 'Stimulant switches or restarts need screening for mania, psychosis, substance risk, and cardiovascular issues.',
    appliesWhen: ['Adderall to Vyvanse', 'Methylphenidate to amphetamine', 'Stimulant restart in possible mania'],
    doNotLine: 'Do not treat stimulant restart as routine when mania or psychosis remains possible.',
    monitoring: ['Mood activation, psychosis, cardiovascular symptoms, sleep, and misuse risk'],
    verificationRequired: ['Current diagnosis and symptom state', 'Substance risk review', 'Current prescribing guidance'],
  },
  {
    id: 'sedative_hypnotic_switch',
    severity: 'high',
    strategy: 'taper_only',
    summary: 'Sedative-hypnotic switching or tapering can create additive CNS depression and rebound insomnia.',
    appliesWhen: ['Zolpidem taper', 'Sedative/hypnotic switch'],
    doNotLine: 'Do not casually overlap sedative-hypnotics without considering additive CNS depression.',
    monitoring: ['Rebound insomnia', 'Daytime sedation', 'Falls risk and other CNS depressants'],
    verificationRequired: ['Current dose and frequency', 'Other sedatives', 'Current prescribing guidance'],
  },
];

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\bambien\b/g, 'zolpidem')
    .replace(/\bstart ([a-z0-9]+) while stopping ([a-z0-9]+)\b/g, 'stop $2 start $1')
    .replace(/\brisperdal po to consta\b/g, 'risperidone oral to risperidone lai')
    .replace(/\brisperidone po to consta\b/g, 'risperidone oral to risperidone lai')
    .replace(/\boral risperidone to consta\b/g, 'risperidone oral to risperidone lai')
    .replace(/\bprozac\b/g, 'fluoxetine')
    .replace(/\bpaxil\b/g, 'paroxetine')
    .replace(/\blexapro\b/g, 'escitalopram')
    .replace(/\beffexor\b/g, 'venlafaxine')
    .replace(/\bseroquel\b/g, 'quetiapine')
    .replace(/\babilify\b/g, 'aripiprazole')
    .replace(/\brisperdal consta\b/g, 'risperidone lai')
    .replace(/\bconsta\b/g, 'risperidone lai')
    .replace(/\brisperdal po\b/g, 'risperidone oral')
    .replace(/\bdepakote\b/g, 'divalproex')
    .replace(/\blamictal\b/g, 'lamotrigine')
    .replace(/\bxanax\b/g, 'alprazolam')
    .replace(/\bvyvanse\b/g, 'lisdexamfetamine')
    .replace(/\badderall\b/g, 'mixed amphetamine salts')
    .replace(/\bamphetamine\b/g, 'mixed amphetamine salts')
    .replace(/\bzoloft\b/g, 'sertraline')
    .replace(/\beffexor xr\b/g, 'venlafaxine')
    .replace(/\bcross titrate\b/g, 'cross taper')
    .replace(/\bcross titration\b/g, 'cross taper')
    .replace(/\bcross-titrate\b/g, 'cross taper')
    .replace(/\bcross-titration\b/g, 'cross taper')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectPsychMedicationSwitchingIntent(prompt: string) {
  const normalized = normalize(prompt);
  if (/\b(switch from|switch|cross taper|taper off|wean off|discontinue|transition from|convert oral to lai|change antidepressant|change antipsychotic|change mood stabilizer|taper benzodiazepine|taper stimulant|stop and start|washout|taper|restart|cross titrate|cross titration|wean|oral to lai)\b/.test(normalized)) {
    return true;
  }

  if (/\bstop\s+\w+.*\bstart\s+\w+/.test(normalized)) {
    return true;
  }

  if (/\bon\s+\w+.*\bwants\s+\w+/.test(normalized) && /\bhow\b/.test(normalized)) {
    return true;
  }

  return normalized.includes(' to ') && determineSwitchPair(prompt).mentioned.length >= 2;
}

function extractMentionedProfiles(prompt: string) {
  const normalized = normalize(prompt);
  const matches: Array<{ profile: PsychMedicationProfile; index: number }> = [];
  const mentionsLaiSpecific =
    /\b(lai|long acting|long acting injectable|injectable|injection|maintena|aristada|consta|sustenna|invega|decanoate)\b/.test(normalized);

  for (const profile of PSYCH_MEDICATION_LIBRARY) {
    const isLaiProfile = profile.subclass === 'long_acting_injectable_antipsychotic';
    const aliases = [profile.id, profile.genericName, ...profile.brandNames, ...(profile.aliases ?? [])];
    for (const alias of aliases) {
      const normalizedAlias = normalize(alias);
      const index = normalized.indexOf(normalizedAlias);
      if (index >= 0) {
        if (isLaiProfile && !mentionsLaiSpecific) {
          continue;
        }
        matches.push({ profile, index });
        break;
      }
    }
  }

  return [...new Map(matches.sort((a, b) => a.index - b.index).map((item) => [item.profile.id, item])).values()];
}

function describeClasses(profile?: PsychMedicationProfile | null) {
  if (!profile) {
    return null;
  }

  return `${profile.genericName} (${profile.class}${profile.subclass ? `, ${profile.subclass.replace(/_/g, ' ')}` : ''})`;
}

function determineSwitchPair(prompt: string) {
  const normalized = normalize(prompt);
  const mentioned = extractMentionedProfiles(prompt);
  const only = mentioned.map((item) => item.profile);

  if (only.length >= 2) {
    return {
      fromMedication: only[0],
      toMedication: only[1],
      mentioned: only,
      normalized,
    };
  }

  if (only.length === 1) {
    const stimulantClassProfiles: PsychMedicationProfile[] = [];
    if (/\bmethylphenidate\b/.test(normalized) && only[0].id !== 'methylphenidate') {
      const methylphenidate = PSYCH_MEDICATION_LOOKUP_TERMS.get('methylphenidate');
      if (methylphenidate) stimulantClassProfiles.push(methylphenidate);
    }
    if (/\bmixed amphetamine salts\b/.test(normalized) && only[0].id !== 'mixed_amphetamine_salts') {
      const amphetamine = PSYCH_MEDICATION_LOOKUP_TERMS.get('mixed amphetamine salts');
      if (amphetamine) stimulantClassProfiles.push(amphetamine);
    }

    if (stimulantClassProfiles.length === 1) {
      return {
        fromMedication: only[0],
        toMedication: stimulantClassProfiles[0],
        mentioned: [only[0], stimulantClassProfiles[0]],
        normalized,
      };
    }

    return {
      fromMedication: only[0],
      toMedication: null,
      mentioned: only,
      normalized,
    };
  }

  return {
    fromMedication: /\bmethylphenidate\b/.test(normalized) ? PSYCH_MEDICATION_LOOKUP_TERMS.get('methylphenidate') ?? null : null,
    toMedication: /\bmixed amphetamine salts\b/.test(normalized) ? PSYCH_MEDICATION_LOOKUP_TERMS.get('mixed amphetamine salts') ?? null : null,
    mentioned: [
      /\bmethylphenidate\b/.test(normalized) ? PSYCH_MEDICATION_LOOKUP_TERMS.get('methylphenidate') ?? null : null,
      /\bmixed amphetamine salts\b/.test(normalized) ? PSYCH_MEDICATION_LOOKUP_TERMS.get('mixed amphetamine salts') ?? null : null,
    ].filter((profile): profile is PsychMedicationProfile => Boolean(profile)),
    normalized,
  };
}

function inferStrategyType(normalized: string, fromMedication?: PsychMedicationProfile | null, toMedication?: PsychMedicationProfile | null): PsychMedicationSwitchStrategyType {
  if (/\b(lai|long acting|long acting injectable|injectable|injection|maintena|aristada|consta|sustenna|invega|decanoate)\b/.test(normalized) || (toMedication?.subclass?.includes('injectable'))) {
    return 'oral_to_lai_transition';
  }
  if (/\bmaoi\b/.test(normalized) || fromMedication?.subclass === 'MAOI' || toMedication?.subclass === 'MAOI') {
    return 'washout_required';
  }
  if (/\balprazolam\b|\blorazepam\b|\bclonazepam\b|\bbenzodiazepine\b|\bbenzo\b/.test(normalized) && !toMedication) {
    return 'taper_only';
  }
  if (/\bzolpidem\b/.test(normalized) && !toMedication) {
    return 'taper_only';
  }
  if (/\bcross taper\b/.test(normalized)) {
    return 'cross_taper';
  }
  if (/\bwashout\b/.test(normalized)) {
    return 'taper_washout_switch';
  }
  if (/\btaper off\b|\bwean off\b|\bdiscontinue\b/.test(normalized) && toMedication) {
    return 'taper_then_switch';
  }
  if (/\bswitch\b|\btransition\b|\bconvert\b|\bstart\b/.test(normalized) && toMedication) {
    return 'direct_switch';
  }
  return 'specialist_reference_required';
}

function applicableSwitchRules(normalized: string, fromMedication?: PsychMedicationProfile | null, toMedication?: PsychMedicationProfile | null) {
  const isAntidepressant = (profile?: PsychMedicationProfile | null) => profile?.class === 'Antidepressant';
  const isAntipsychotic = (profile?: PsychMedicationProfile | null) => profile?.class === 'Antipsychotic';
  const isMoodStabilizer = (profile?: PsychMedicationProfile | null) => profile?.class.includes('Mood stabilizer');

  const rules: PsychMedicationSwitchRule[] = [];

  if (fromMedication?.subclass === 'MAOI' || toMedication?.subclass === 'MAOI' || /\bphenelzine\b/.test(normalized)) {
    rules.push(HIGH_RISK_SWITCH_RULES.find((rule) => rule.id === 'maoi_switch')!);
  }
  if (fromMedication?.id === 'fluoxetine' || toMedication?.id === 'fluoxetine') {
    rules.push(HIGH_RISK_SWITCH_RULES.find((rule) => rule.id === 'fluoxetine_long_half_life')!);
  }
  if (fromMedication?.id === 'paroxetine' || fromMedication?.id === 'venlafaxine') {
    rules.push(HIGH_RISK_SWITCH_RULES.find((rule) => rule.id === 'paroxetine_venlafaxine_discontinuation')!);
  }
  if (fromMedication?.id === 'clomipramine' || toMedication?.id === 'clomipramine') {
    rules.push(HIGH_RISK_SWITCH_RULES.find((rule) => rule.id === 'clomipramine_tca_serotonergic_switch')!);
  }
  if ((isAntidepressant(fromMedication) || isAntidepressant(toMedication)) && fromMedication && toMedication) {
    rules.push(HIGH_RISK_SWITCH_RULES.find((rule) => rule.id === 'antidepressant_general_switch')!);
  }
  if (isAntipsychotic(fromMedication) && isAntipsychotic(toMedication) && !/\blai\b/.test(normalized)) {
    rules.push(HIGH_RISK_SWITCH_RULES.find((rule) => rule.id === 'antipsychotic_switch')!);
  }
  if (/\b(lai|long acting|long acting injectable|injectable|injection|maintena|aristada|consta|sustenna|invega|decanoate)\b/.test(normalized) || toMedication?.subclass === 'long_acting_injectable_antipsychotic') {
    rules.push(HIGH_RISK_SWITCH_RULES.find((rule) => rule.id === 'oral_to_lai')!);
  }
  if ((fromMedication?.id === 'lithium' || toMedication?.id === 'lithium') && (isMoodStabilizer(fromMedication) || isMoodStabilizer(toMedication))) {
    rules.push(HIGH_RISK_SWITCH_RULES.find((rule) => rule.id === 'lithium_transition')!);
  }
  if ((fromMedication?.id === 'divalproex' || fromMedication?.id === 'valproic_acid' || fromMedication?.genericName.includes('valpro')) && toMedication?.id === 'lamotrigine'
    || (toMedication?.id === 'divalproex' || toMedication?.id === 'valproic_acid' || toMedication?.genericName.includes('valpro')) && fromMedication?.id === 'lamotrigine'
    || /\bdivalproex\b|\bvalproate\b|\bvalproic acid\b/.test(normalized) && /\blamotrigine\b/.test(normalized)) {
    rules.push(HIGH_RISK_SWITCH_RULES.find((rule) => rule.id === 'valproate_lamotrigine_transition')!);
  }
  if (fromMedication?.id === 'carbamazepine' || toMedication?.id === 'carbamazepine') {
    rules.push(HIGH_RISK_SWITCH_RULES.find((rule) => rule.id === 'carbamazepine_transition')!);
  }
  if (/\balprazolam\b|\blorazepam\b|\bclonazepam\b|\bxanax\b|\bbenzo\b|\bbenzodiazepine\b/.test(normalized)) {
    rules.push(HIGH_RISK_SWITCH_RULES.find((rule) => rule.id === 'benzodiazepine_taper')!);
  }
  if (/\bvyvanse\b|\badderall\b|\bmethylphenidate\b|\bamphetamine\b|\bstimulant\b/.test(normalized)) {
    rules.push(HIGH_RISK_SWITCH_RULES.find((rule) => rule.id === 'stimulant_switch_or_restart')!);
  }
  if (/\bzolpidem\b/.test(normalized)) {
    rules.push(HIGH_RISK_SWITCH_RULES.find((rule) => rule.id === 'sedative_hypnotic_switch')!);
  }

  return [...new Map(rules.filter(Boolean).map((rule) => [rule.id, rule])).values()];
}

function buildDirectLead(strategy: PsychMedicationSwitchStrategy, rules: PsychMedicationSwitchRule[]) {
  if (rules.some((rule) => rule.strategy === 'washout_required' || rule.strategy === 'avoid_cross_taper' || rule.strategy === 'specialist_reference_required')) {
    return 'I would not frame this as a routine cross-taper.';
  }
  if (strategy.id === 'cross_taper' || strategy.id === 'overlap_bridge') {
    return 'A cautious cross-taper or overlap may be a possible strategy.';
  }
  if (strategy.id === 'oral_to_lai_transition') {
    return 'This requires product-specific verification.';
  }
  if (strategy.id === 'taper_only') {
    return 'A cautious taper framework may be appropriate.';
  }
  return 'A cautious switch framework may be possible.';
}

function buildFrameworkLines(strategy: PsychMedicationSwitchStrategy, rules: PsychMedicationSwitchRule[], fromMedication?: PsychMedicationProfile | null, toMedication?: PsychMedicationProfile | null) {
  const monitoring = [...new Set([
    ...strategy.monitoring,
    ...rules.flatMap((rule) => rule.monitoring),
  ])].slice(0, 5);

  const verification = [...new Set([
    ...strategy.verificationRequired,
    ...rules.flatMap((rule) => rule.verificationRequired),
  ])].slice(0, 5);

  return [
    'Step 1: verify current dose, indication, duration, adherence, adverse effects, and risk factors.',
    'Step 2: identify interaction, washout, and discontinuation-risk issues before changing the regimen.',
    `Step 3: ${fromMedication ? `taper or discontinue ${fromMedication.genericName} cautiously` : 'taper the current medication cautiously'} in a way that fits the product and withdrawal risk.`,
    `Step 4: ${toMedication ? `start ${toMedication.genericName} cautiously if appropriate` : 'start the replacement agent cautiously if one is being used'} and verify formulation-specific guidance before titrating.`,
    `Step 5: monitor ${monitoring.join(', ') || 'withdrawal, relapse, toxicity, and adverse effects'} and verify ${verification.join(', ') || 'current prescribing references'}.`,
  ];
}

function classLabel(profile?: PsychMedicationProfile | null) {
  if (!profile) {
    return null;
  }

  if (profile.subclass === 'SSRI' || profile.subclass === 'SNRI' || profile.subclass === 'MAOI' || profile.subclass === 'TCA') {
    return profile.subclass;
  }

  if (profile.class === 'Antidepressant') {
    return 'antidepressant';
  }

  if (profile.class === 'Antipsychotic') {
    return profile.subclass === 'long_acting_injectable_antipsychotic' ? 'long-acting injectable antipsychotic' : 'antipsychotic';
  }

  if (profile.class.includes('Mood stabilizer')) {
    return 'mood stabilizer';
  }

  if (profile.class === 'ADHD medication') {
    return 'stimulant/ADHD medication';
  }

  if (profile.class === 'Anxiolytic / sedative') {
    return 'sedative/anxiolytic';
  }

  return profile.class.toLowerCase();
}

function buildPlainSwitchCategory(fromMedication?: PsychMedicationProfile | null, toMedication?: PsychMedicationProfile | null) {
  const fromClass = classLabel(fromMedication);
  const toClass = classLabel(toMedication);

  if (fromClass && toClass) {
    const pairLabel = `${fromClass}-to-${toClass}`;
    const article = /^(SSRI|SNRI|MAOI|antidepressant|antipsychotic|oral|anxiolytic)/i.test(pairLabel) ? 'an' : 'a';
    return `This is ${article} ${pairLabel} switch.`;
  }

  if (fromMedication && !toMedication) {
    return `This is a ${classLabel(fromMedication) ?? 'medication'} taper question.`;
  }

  return 'This is a medication switching question, but the medication pair is not fully identified from the prompt.';
}

function buildGeneralSwitchOption(strategy: PsychMedicationSwitchStrategy, rules: PsychMedicationSwitchRule[]) {
  if (rules.some((rule) => rule.id === 'maoi_switch')) {
    return 'Do not treat this as a routine cross-taper; washout and current-reference guidance are required.';
  }

  if (rules.some((rule) => rule.id === 'valproate_lamotrigine_transition')) {
    return 'The transition should be checked against product-specific lamotrigine titration guidance because valproate changes lamotrigine exposure and rash risk.';
  }

  if (rules.some((rule) => rule.id === 'oral_to_lai')) {
    return 'Oral-to-LAI transitions require product-specific labeling for loading, oral overlap, and missed-dose rules.';
  }

  if (rules.some((rule) => rule.id === 'benzodiazepine_taper')) {
    return 'A benzodiazepine taper is individualized; avoid abrupt discontinuation and monitor withdrawal and seizure risk.';
  }

  if (rules.some((rule) => rule.id === 'stimulant_switch_or_restart')) {
    return 'Screen for mania, psychosis, substance-use risk, cardiovascular history, sleep disruption, and misuse risk before choosing a stimulant transition.';
  }

  if (strategy.id === 'cross_taper') {
    return 'Depending on dose and tolerability, a cautious cross-taper may be considered, but interaction and discontinuation risk still need review.';
  }

  if (strategy.id === 'taper_then_switch') {
    return 'Depending on the current dose, duration, and tolerability, a taper-then-switch approach may be considered.';
  }

  if (strategy.id === 'taper_only') {
    return 'The taper pace depends on dose, duration, formulation, withdrawal history, and clinical stability.';
  }

  return 'Depending on current dose and tolerability, a direct switch, taper-then-switch, or cautious overlap strategy may be considered.';
}

function buildMedSpecificCautions(rules: PsychMedicationSwitchRule[], fromMedication?: PsychMedicationProfile | null, toMedication?: PsychMedicationProfile | null) {
  const cautions = new Set<string>();

  if (fromMedication?.id === 'paroxetine' || toMedication?.id === 'paroxetine') {
    cautions.add('Paroxetine can have more discontinuation burden if later stopped.');
  }

  if (fromMedication?.id === 'venlafaxine' || toMedication?.id === 'venlafaxine') {
    cautions.add('Venlafaxine can have meaningful discontinuation symptoms if stopped abruptly.');
  }

  if (fromMedication?.id === 'fluoxetine' || toMedication?.id === 'fluoxetine' || rules.some((rule) => rule.id === 'fluoxetine_long_half_life')) {
    cautions.add('Fluoxetine has a long half-life, so delayed interaction effects may matter.');
  }

  if (rules.some((rule) => rule.id === 'clomipramine_tca_serotonergic_switch')) {
    cautions.add('Clomipramine/TCA serotonergic switches need current-reference review because serotonin-toxicity and cardiac risk can be higher.');
  }

  if (rules.some((rule) => rule.id === 'carbamazepine_transition')) {
    cautions.add('Carbamazepine can change levels of many medications through enzyme induction, so interaction checking matters.');
  }

  if (rules.some((rule) => rule.id === 'lithium_transition')) {
    cautions.add('Lithium transitions should account for relapse risk and renal, thyroid, and lithium-level monitoring when relevant.');
  }

  if (rules.some((rule) => rule.id === 'sedative_hypnotic_switch')) {
    cautions.add('Watch additive sedation, falls risk, other CNS depressants, and rebound insomnia.');
  }

  return [...cautions];
}

function buildConciseMonitoringLine(rules: PsychMedicationSwitchRule[]) {
  if (rules.some((rule) => rule.id === 'maoi_switch')) {
    return 'Monitor for serotonin toxicity, hypertensive symptoms, withdrawal, and relapse during any washout period.';
  }

  if (rules.some((rule) => rule.id === 'valproate_lamotrigine_transition')) {
    return 'Monitor closely for rash or mucosal symptoms, withdrawal, relapse, and tolerability.';
  }

  if (rules.some((rule) => rule.id === 'oral_to_lai')) {
    return 'Monitor oral overlap, injection tolerability, relapse symptoms, EPS, and sedation.';
  }

  if (rules.some((rule) => rule.id === 'benzodiazepine_taper')) {
    return 'Monitor withdrawal, rebound anxiety or insomnia, autonomic symptoms, and seizure risk.';
  }

  if (rules.some((rule) => rule.id === 'stimulant_switch_or_restart')) {
    return 'Monitor mood activation, psychosis, sleep, cardiovascular symptoms, and misuse risk.';
  }

  if (rules.some((rule) => rule.id === 'sedative_hypnotic_switch')) {
    return 'Monitor rebound insomnia, daytime sedation, falls risk, and other CNS depressants.';
  }

  if (rules.some((rule) => rule.id === 'paroxetine_venlafaxine_discontinuation')) {
    return 'Watch for discontinuation symptoms and symptom rebound.';
  }

  return null;
}

function buildProviderFacingSwitchText(
  strategy: PsychMedicationSwitchStrategy,
  rules: PsychMedicationSwitchRule[],
  fromMedication?: PsychMedicationProfile | null,
  toMedication?: PsychMedicationProfile | null,
) {
  const setup = 'First confirm current dose, duration, reason for switch, adherence, side effects, withdrawal history, interaction risks, and clinical stability.';
  const category = buildPlainSwitchCategory(fromMedication, toMedication);
  const framework = buildGeneralSwitchOption(strategy, rules);
  const cautions = buildMedSpecificCautions(rules, fromMedication, toMedication);
  const monitor = buildConciseMonitoringLine(rules);

  return [
    setup,
    `${category} ${framework}`,
    ...cautions,
    monitor,
    SWITCHING_CAVEAT,
  ].filter(Boolean).join(' ');
}

export function answerPsychMedicationSwitchQuestion(prompt: string): PsychMedicationAnswer | null {
  if (!detectPsychMedicationSwitchingIntent(prompt)) {
    return null;
  }

  const { fromMedication, toMedication, mentioned, normalized } = determineSwitchPair(prompt);
  const strategyId = inferStrategyType(normalized, fromMedication, toMedication);
  const strategy = SWITCHING_STRATEGIES[strategyId];
  const rules = applicableSwitchRules(normalized, fromMedication, toMedication);
  const text = buildProviderFacingSwitchText(strategy, rules, fromMedication, toMedication);

  return {
    intent: 'switching_framework',
    medication: fromMedication ?? toMedication ?? null,
    matchedMedications: mentioned,
    fromMedication,
    toMedication,
    switchStrategy: strategy,
    switchRuleIds: rules.map((rule) => rule.id),
    text,
  };
}

export function getPsychMedicationSwitchStrategies() {
  return Object.values(SWITCHING_STRATEGIES);
}

export function getPsychMedicationSwitchRules() {
  return HIGH_RISK_SWITCH_RULES;
}

export function getPsychMedicationSwitchingCaveat() {
  return SWITCHING_CAVEAT;
}
