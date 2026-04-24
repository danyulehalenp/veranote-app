export const DIAGNOSIS_ALIAS_OVERRIDES: Record<string, {
  extraAliases?: string[];
  hallmarkFeatures?: string[];
  overlapFeatures?: string[];
  ruleOutCautions?: string[];
  documentationCautions?: string[];
  mseSignals?: string[];
  riskSignals?: string[];
}> = {
  dx_mdd: {
    extraAliases: ['major depression', 'depressive episode'],
    hallmarkFeatures: ['depressed mood', 'anhedonia', 'neurovegetative symptoms'],
    overlapFeatures: ['persistent depressive disorder', 'substance-induced depressive symptoms'],
    ruleOutCautions: ['bipolar spectrum history', 'substance/medication effects'],
    documentationCautions: ['do not upgrade symptoms to MDD without enough episode support'],
    riskSignals: ['suicidal ideation', 'hopelessness'],
  },
  dx_pdd: {
    extraAliases: ['persistent depression', 'dysthymia'],
    hallmarkFeatures: ['chronic depressive symptoms', 'longstanding low mood'],
    overlapFeatures: ['major depressive episodes', 'adjustment disorder'],
    ruleOutCautions: ['episode duration ambiguity', 'bipolar exclusion'],
  },
  dx_bipolar1: {
    extraAliases: ['bipolar one', 'bipolar i disorder'],
    hallmarkFeatures: ['mania', 'decreased need for sleep', 'grandiosity'],
    overlapFeatures: ['substance-induced mania', 'schizoaffective disorder'],
    ruleOutCautions: ['stimulant exposure', 'sleep-deprivation-only presentations'],
    mseSignals: ['pressured speech', 'flight of ideas'],
    riskSignals: ['psychosis', 'severe impulsivity'],
  },
  dx_bipolar2: {
    extraAliases: ['bipolar two', 'bipolar ii disorder'],
    hallmarkFeatures: ['hypomania', 'major depressive episode history'],
    overlapFeatures: ['major depressive disorder', 'cyclothymic spectrum'],
    ruleOutCautions: ['no full manic history', 'substance-induced mood symptoms'],
  },
  dx_schizophrenia: {
    extraAliases: ['schizophrenic disorder'],
    hallmarkFeatures: ['persistent psychosis', 'functional decline'],
    overlapFeatures: ['schizoaffective disorder', 'substance-induced psychosis'],
    ruleOutCautions: ['mood-linked psychosis', 'delirium', 'substance exposure'],
    mseSignals: ['disorganized thought process', 'negative symptoms'],
    riskSignals: ['grave disability', 'command hallucinations'],
  },
  dx_schizoaffective: {
    hallmarkFeatures: ['psychosis with major mood episodes', 'period of psychosis without mood symptoms'],
    overlapFeatures: ['bipolar disorder with psychosis', 'schizophrenia'],
    ruleOutCautions: ['insufficient longitudinal history'],
  },
  dx_gad: {
    extraAliases: ['general anxiety', 'generalized anxiety'],
    hallmarkFeatures: ['diffuse worry', 'muscle tension', 'restlessness'],
    overlapFeatures: ['panic disorder', 'trauma-related anxiety', 'substance-related anxiety'],
  },
  dx_panic_disorder: {
    hallmarkFeatures: ['recurrent panic attacks', 'anticipatory anxiety', 'avoidance'],
    overlapFeatures: ['medical causes of panic-like symptoms', 'substance-induced anxiety'],
  },
  dx_aud: {
    extraAliases: ['alcohol dependence', 'alcohol abuse'],
    hallmarkFeatures: ['problematic alcohol pattern', 'tolerance', 'withdrawal risk'],
    overlapFeatures: ['alcohol intoxication', 'alcohol withdrawal', 'substance-induced depression'],
    ruleOutCautions: ['do not equate acute withdrawal with 12-month disorder automatically'],
    riskSignals: ['withdrawal seizures', 'delirium tremens', 'suicide risk during withdrawal'],
  },
  dx_oud: {
    extraAliases: ['opioid dependence', 'opioid abuse'],
    hallmarkFeatures: ['compulsive opioid use', 'withdrawal dysphoria', 'overdose risk'],
    overlapFeatures: ['prescribed exposure', 'withdrawal state', 'substance-induced mood symptoms'],
    riskSignals: ['overdose history', 'no naloxone access'],
  },
  dx_cannabis_use_disorder: {
    hallmarkFeatures: ['ongoing cannabis pattern', 'functional impairment', 'tolerance'],
    overlapFeatures: ['synthetic cannabinoid exposure', 'cannabis-induced anxiety or psychosis'],
  },
  dx_stimulant_use_disorder: {
    hallmarkFeatures: ['problematic stimulant pattern', 'sleep collapse', 'paranoia or agitation'],
    overlapFeatures: ['primary psychosis', 'primary bipolar disorder', 'stimulant intoxication/withdrawal'],
    riskSignals: ['severe agitation', 'psychosis', 'suicidality in crash/withdrawal'],
  },
  dx_substance_induced_psychotic: {
    extraAliases: ['drug-induced psychosis', 'substance psychosis'],
    hallmarkFeatures: ['psychosis temporally linked to intoxication, withdrawal, or exposure'],
    overlapFeatures: ['schizophrenia spectrum', 'mood disorders with psychosis'],
    ruleOutCautions: ['symptoms predating use', 'symptoms persisting beyond expected window'],
    documentationCautions: ['timeline is more important than the label'],
  },
  dx_substance_induced_depressive: {
    hallmarkFeatures: ['depressive symptoms temporally linked to exposure or withdrawal'],
    overlapFeatures: ['major depressive disorder', 'adjustment disorder'],
    ruleOutCautions: ['symptoms clearly predating heavy use', 'persistence outside exposure cycle'],
  },
};
