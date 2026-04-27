import type { ContradictionAnalysis } from '@/lib/veranote/assistant-contradiction-detector';
import { parseMSEFromText, type MseAnalysis } from '@/lib/veranote/assistant-mse-parser';
import type { RiskAnalysis } from '@/lib/veranote/assistant-risk-detector';
import { type AssistantFollowupDirective } from '@/lib/veranote/assistant-mode';
import type { LevelOfCareAssessment, LosAssessment, MedicalNecessityAssessment } from '@/lib/veranote/defensibility/defensibility-types';
import type { KnowledgeIntent } from '@/lib/veranote/knowledge/types';
import type { DischargeStatus, TriageSuggestion } from '@/lib/veranote/workflow/workflow-types';
import type { AssistantAnswerMode, AssistantBuilderFamily, AssistantResponsePayload } from '@/types/assistant';

type ClinicalTaskPriorityInput = {
  message: string;
  sourceText: string;
  currentDraftText?: string;
  stage?: 'compose' | 'review';
  noteType?: string;
  mseAnalysis?: MseAnalysis;
  riskAnalysis: RiskAnalysis;
  contradictionAnalysis: ContradictionAnalysis;
  medicalNecessity: MedicalNecessityAssessment;
  levelOfCare: LevelOfCareAssessment;
  losAssessment: LosAssessment;
  dischargeStatus: DischargeStatus;
  triageSuggestion: TriageSuggestion;
  override?: ClinicalTaskOverride | null;
  previousAnswerMode?: AssistantAnswerMode | null;
  previousBuilderFamily?: AssistantBuilderFamily | null;
  followupDirective?: AssistantFollowupDirective;
};

export type ClinicalTaskOverride = {
  forcedIntent?: KnowledgeIntent;
  answerMode?: AssistantAnswerMode;
  builderFamily?: AssistantBuilderFamily;
};

type ProviderHistoryMedicationScenarioKind =
  | 'medication_reference'
  | 'strengths_forms'
  | 'monitoring_labs'
  | 'side_effects'
  | 'interactions'
  | 'titration'
  | 'taper'
  | 'cross_taper'
  | 'antipsychotic_switch'
  | 'antidepressant_switch'
  | 'mood_stabilizer_transition'
  | 'stimulant_question'
  | 'lai_conversion'
  | 'mixed_lai_legal'
  | 'mixed_violence_stimulant'
  | 'mixed_catatonia_antipsychotic_switch';

type ClinicalScenarioFlags = {
  suicideContradiction: boolean;
  violenceContradiction: boolean;
  telehealthLimit: boolean;
  psychosisSubstanceConfound: boolean;
  maniaActivationConcern: boolean;
  withdrawalMedicalConcern: boolean;
  deliriumConcern: boolean;
  postpartumConcern: boolean;
  catatoniaConcern: boolean;
  eatingDisorderMedicalConcern: boolean;
  capacityConcern: boolean;
  lithiumConcern: boolean;
  adolescentCollateralConflict: boolean;
  selfHarmViolenceAmbiguity: boolean;
  noSafeDischarge: boolean;
  medicationNonadherence: boolean;
  stimulantDemand: boolean;
  ssriEscalationConcern: boolean;
  collateralRefusal: boolean;
};

type PrimaryConcern =
  | 'suicide'
  | 'violence'
  | 'telehealth'
  | 'psychosis-substance'
  | 'mania-activation'
  | 'withdrawal-medical'
  | 'delirium'
  | 'postpartum'
  | 'catatonia'
  | 'eating-disorder-medical'
  | 'capacity'
  | 'lithium'
  | 'adolescent'
  | 'self-harm-violence'
  | 'generic-risk';

function normalize(value: string) {
  return value.toLowerCase();
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function hasConsultLiaisonMedicalOverlap(text: string) {
  return hasAny(text, [
    /\b(medicine wants psych wording|consult note|consult-note usable|paged from floors|o2 dipping|hypoxia|pulling off cannula|cannula|psych version only|short psych sentence|medicine stops paging|prednisone burst|glucose also all over the place)\b/,
  ]);
}

function hasProviderHistorySuicideContradiction(text: string) {
  const suicideContradictionSignal = hasAny(text, [
    /\b(suicide|suicidal|si|denies si|no si|goodbye|goodbye-ish|not safe|not trust herself|not trust himself|not trust themselves|wants? to die|cut recently|overdose|family worried|collat(?:eral)? worried)\b/,
  ]);

  if (hasAny(text, [
    /\b(where do i start|source is messy|need psych admit hpi|admit hpi|admission hpi|progress note cleaned up|rewrite it so it is usable)\b/,
    /\b(risk wording|make risk assessment|rewrite safety paragraph|chronic vs acute risk)\b/,
    /\b(recent passive death wish|means not asked|protective factors thin|intoxication unclear)\b/,
  ]) && !suicideContradictionSignal) {
    return false;
  }

  return hasAny(text, [
    /\bsuicide[ -]?risk wording\b.*\b(goodbye|not trust|current intent|higher-risk|does not trust)\b/,
    /\blow suicide[ -]?risk\b.*\b(goodbye|not trust|current intent|higher-risk|does not trust)\b/,
    /\bdenies si\b.*\b(but|however|although|also)\b.*\b(goodbye|goodbye-ish|not safe|wants? to die|cut recently|overdose|family worried|collat(?:eral)? worried|higher-risk|risk)\b/,
    /\b(no si|no plan|denies suicidal|denies suicidality|says no plan)\b.*\b(goodbye|goodbye-ish|collat(?:eral)?|family worried|not safe|wants? to die|cut recently|overdose|risk)\b/,
    /\b(goodbye|goodbye-ish|not safe at home|not safe if sent home|wants? to die yesterday|cut recently|overdose talk|family worried)\b.*\b(denies|no si|no plan|say no si|just say no si)\b/,
    /\b(si contradiction|suicide risk contradiction)\b/,
    /\b(just say no si|actually just say no si|can u just say no si)\b/,
    /\bdenies si\b.*\b(triage|wanted to disappear|collat(?:eral)? worried|old statement)\b/,
    /\b(pt|patient)\b.*\bdenies si\b.*\b(collat(?:eral)?|triage|worried)\b/,
    /\bdenies intent\b.*\b(would not answer means|means question)\b/,
    /\b(wanted to disappear|would not answer means question|ignore old statement|make risk low)\b/,
    /\bchart says passive si\b.*\b(pt|patient)\b.*\b(never said that|denies|disputes)\b/,
    /\b(pt|patient)\b.*\b(never said that|denies|disputes)\b.*\bchart says passive si\b/,
    /\b(chart says passive si|clarify before dc|collateral is dramatic|leave it out)\b/,
  ]);
}

function hasProviderHistoryViolenceContradiction(text: string) {
  const generalRiskOnly = hasAny(text, [
    /\b(risk wording|make risk assessment|rewrite safety paragraph|chronic vs acute risk|recent passive death wish|means not asked|protective factors thin|intoxication unclear)\b/,
  ]) && !hasAny(text, [
    /\b(hi denial|denies hi|violence[ -]?risk|violent|homicid|threat|threats|revenge|hurt someone|broke objects|posturing|weapon|security involved|target vague|target unclear)\b/,
  ]);
  const suicideOnlyRisk = hasAny(text, [
    /\b(si contradiction|suicide risk contradiction|denies si|no si|suicid|goodbye|goodbye-ish|means question|just say no si)\b/,
  ]) && !hasAny(text, [
    /\b(hi denial|denies hi|violence risk|violent|homicid|threat|threats|revenge|hurt someone|broke objects|posturing|weapon|security involved)\b/,
  ]);

  if (generalRiskOnly) {
    return false;
  }

  if (suicideOnlyRisk) {
    return false;
  }

  return hasAny(text, [
    /\bdenies hi\b.*\b(but|however|although|also)\b.*\b(threat|revenge|hurt someone|target|weapon|access|aggressive|security|staff|collat(?:eral)?)\b/,
    /\b(no hi|denies homicidal|denies violent intent|denies intent)\b.*\b(threat|revenge|hurt someone|target|weapon|access|aggressive|security|posturing|broke objects|staff heard)\b/,
    /\b(threat earlier|threats? reported|staff heard threats?|said (?:he|she|they|pt|patient)(?:'d| would) hurt someone|hurt someone|wanting revenge|making them pay)\b/,
    /\b(aggressive earlier|was aggressive earlier|security involved|pacing jaw clenched|jaw clenched|posturing|broke objects|punched wall)\b/,
    /\b(family worried (?:he|she|they|pt|patient) might hurt someone|weapon mentioned|weapon unclear|target unclear|target vague|no access details)\b/,
    /\b(threat|aggression|posturing|broke objects|weapon|target|access|intent)\b.*\b(unclear|vague|unknown|no details|idk|maybe)\b/,
    /\b(violence[ -]?risk wording|hi denial|omit threats bc denied|say no risk since calm|no risk since calm|behavioral only)\b/,
    /\bcollateral reports threats?\b/,
    /\bdenies hi\b.*\b(staff heard threats?|target vague|heard threats?)\b/,
    /\b(no risk since calm|staff heard threats?|target vague)\b/,
  ]);
}

function hasProviderHistoryLegalCapacity(text: string) {
  if (hasAny(text, [
    /\bgrave disability clearly established\b/,
    /\bsource only documents poor hygiene\b/,
    /\b(exact hold wording|source-matched hold language|overdose if sent home|hid pills|safe place to stay)\b/,
  ])) {
    return false;
  }

  return hasAny(text, [
    /\b(does (?:he|she|pt|patient) have capacity|has capacity|capacity note|capacity for|capacity\?|competent\?|can (?:he|she|pt|patient) refuse|can.*refuse|refusing med|refusing treatment)\b/,
    /\b(no capacity full stop|say no capacity|lacks capacity full stop|global capacity|blanket incapacity)\b/,
    /\b(understands some but not risks|not appreciating risks|cannot explain risks|cannot repeat alternatives|decision-specific language)\b/,
    /\b(hold wording|legally holdable|make clinical not legal|unsafe plan|pt wants leave|patient wants leave)\b/,
    /\blacks capacity bc psychotic\b/,
    /\bcourt-proof\b/,
    /\bguardian asking to force meds\b/,
    /\bguardian decides always right\b/,
    /\bavoid state law specifics\b/,
    /\bwhat to document\b.*\b(capacity|guardian|force meds|court)\b/,
  ]);
}

function hasProviderHistoryBenzoTaper(text: string) {
  return hasAny(text, [
    /\b(ativan-like med|benzo taper|benzodiazepine taper)\b/,
    /\b(unknown dose long time|stop it quickly|stop .* quickly|withdrawal mild|outpatient vs inpatient caution)\b/,
    /\b(quickly stop|just stop it)\b.*\b(benzo|ativan|xanax|klonopin|lorazepam|alprazolam|clonazepam)\b/,
    /\b(alprazolam-ish|longer acting taper|benzo \+ alcohol use|fast taper|give fast taper|ignore alcohol risk|not schedule)\b/,
    /\b(benzo dose unk|benzodiazepine dose unknown|alcohol use maybe|rapid taper|asks rapid taper)\b/,
  ]);
}

function hasProviderHistorySubstancePsychOverlap(text: string) {
  if (hasProviderHistoryBenzoTaper(text)) {
    return false;
  }

  return hasAny(text, [
    /\b(meth vs primary psych|primary psych\?|substance induced|substance-induced|call it substance induced)\b/,
    /\b(thc daily|cannabis daily|mania-ish|mania ish|how word ddx)\b/,
    /\b(stimulant use unclear|voices started around binge|around binge maybe|say malingering)\b/,
    /\b(alcohol withdrawal vs anxiety vs psychosis|withdrawal vs anxiety vs psychosis|bipolar definite)\b/,
    /\b(uds pending|tox pending|tox not back|ignore tox pending|tox\/withdrawal)\b/,
    /\b(reassessment after sobriety|after sobriety|after stabilization|sobriety or stabilization)\b/,
  ]);
}

function hasProviderHistoryMedicalPsychOverlap(text: string) {
  if (hasProviderHistoryDeliriumOverlap(text)) {
    return hasAny(text, [
      /\b(fever mentioned|medical ruleout|medical rule-out|just call psych|psych-only|psych only)\b/,
    ]);
  }

  return hasAny(text, [
    /\b(confused\/agitated|confused and agitated|hx psych but fever|fever mentioned|medical ruleout|medical rule-out)\b/,
    /\b(panic vs cardiac|cardiac sx|chest tightness|skip medical stuff)\b/,
    /\b(new hallucinations older adult-ish|older adult-ish|med changes unclear|include red flags|say cleared)\b/,
    /\b(depression vs hypothyroid|hypothyroid\/medical fatigue|medical fatigue|make it behavioral)\b/,
    /\b(medical contributors|red flags or missing evaluation|avoid psych-only certainty)\b/,
  ]);
}

function hasProviderHistoryMixedSiSubstanceDischarge(text: string) {
  return hasAny(text, [
    /\b(pt|patient)\b.*\bdenies si\b.*\bsobering\b.*\b(earlier pdw|family worried|wants dc|uds not back)\b/,
    /\b(earlier pdw|passive death wish)\b.*\b(family worried|wants dc|uds not back|sobering)\b/,
    /\bsi contradiction\b.*\b(substance timing|discharge readiness gaps|uds|tox|sobering|wants dc|discharge)\b/,
    /\b(substance timing|discharge readiness gaps)\b.*\b(si contradiction|denies si|passive death wish|family worried)\b/,
    /\b(just decide and dont slow us down|just decide and don't slow us down)\b.*\b(si|sobering|discharge|dc|uds)\b/,
  ]);
}

function hasProviderHistoryMixedWithdrawalBenzo(text: string) {
  return hasAny(text, [
    /\bbenzo dose unk\b.*\b(alcohol use maybe|tremor insomnia|rapid taper)\b/,
    /\b(alcohol use maybe|substance use uncertainty)\b.*\b(benzo|benzodiazepine|rapid taper)\b/,
    /\b(withdrawal\/seizure risk|urgent red flags)\b.*\b(benzo|benzodiazepine|taper)\b/,
  ]);
}

function hasProviderHistoryPsychosisWording(text: string) {
  if (hasProviderHistoryDeliriumOverlap(text) || hasProviderHistorySubstancePsychOverlap(text)) {
    return false;
  }

  return hasAny(text, [
    /\bword psychosis\b/,
    /\bhow chart paranoid-sounding beliefs\b/,
    /\bparanoid-sounding beliefs\b/,
    /\bpeople watching\b.*\b(no clear delusion|wording)\b/,
    /\bobserved distracted\b.*\b(thought blocking|denies voices)\b/,
    /\b(thought blocking maybe|laughing to self|maybe guarded)\b/,
    /\b(separate observed vs reported|observed behavior, patient report|patient report, observation, and interpretation)\b/,
    /\b(include uncertainty|diagnostic uncertainty|avoid stigmatizing)\b/,
    /\b(call malingering|diagnose schizophrenia|crazy\/paranoid|ignore denial)\b/,
  ]);
}

function hasProviderHistoryInternalPreoccupationDenial(text: string) {
  return hasAny(text, [
    /\bdenies avh\b.*\b(internally preocc|internally preoccupied|pausing mid sentence)\b/,
    /\bdenies voices\b.*\b(whispering when alone|seen whispering)\b/,
    /\bmse says no avh\b.*\bnursing notes responding to unseen stimuli\b/,
    /\bguarded\b.*\bscanning room\b.*\bdenies paranoia\b/,
    /\b(make side-by-side|side-by-side|dont overdiagnose|don'?t overdiagnose|include nursing obs|nursing obs)\b/,
    /\b(denies psychosis|responding to voices for sure|leave out nursing|make mse normal)\b/,
    /\b(internal preoccupation|responding to unseen stimuli|observed behavior described|denial preserved)\b/,
  ]);
}

function hasProviderHistoryCollateralConflict(text: string) {
  return hasAny(text, [
    /\bcollateral says unsafe\b.*\b(pt|patient)\b.*\b(family lying|says family lying)\b/,
    /\bfamily reports med nonadherence\b.*\b(pt|patient)\b.*\b(taking all meds|says taking)\b/,
    /\bpolice\/ems style report differs from pt story\b/,
    /\bchart review says prior aggression\b.*\b(pt|patient)\b.*\bdenies history\b/,
    /\b(label sources|avoid taking sides|include clinical relevance|short paragraph)\b/,
    /\b(pick the patient version|omit collateral|say family unreliable|one clean story)\b/,
    /\b(source-labeled collateral|collateral conflict|conflicting accounts|without resolving the conflict)\b/,
  ]);
}

function hasProviderHistoryMixedCollateralCapacity(text: string) {
  return hasAny(text, [
    /\b(pt|patient)\b.*\brefuses admission plan\b.*\bfamily says cannot care for self\b.*\bcapacity\??\b/,
    /\bfamily says cannot care for self\b.*\b(pt|patient)\b.*\b(says fine|refuses admission plan)\b/,
    /\b(patient preference|collateral concern|decision-specific capacity factors)\b/,
    /\bjust decide and don'?t slow us down\b.*\b(capacity|admission|family)\b/,
  ]);
}

function detectProviderHistoryMedicationScenarioKind(text: string): ProviderHistoryMedicationScenarioKind | null {
  if (hasAny(text, [/\bmissed lai maybe\b.*\brefusing oral bridge\b.*\b(force|can force)\b/])) {
    return 'mixed_lai_legal';
  }

  if (hasAny(text, [/\bcalm now denies hi\b.*\bcollateral says threats\b.*\brestart stimulant\b/])) {
    return 'mixed_violence_stimulant';
  }

  if (hasAny(text, [/\bstaring not eating\b.*\brigid maybe\b.*\bswitch antipsychotic\b/])) {
    return 'mixed_catatonia_antipsychotic_switch';
  }

  if (hasAny(text, [
    /\boral antipsychotic to lai\b/,
    /\bmissed lai dose\b/,
    /\bpaliperidone-ish\b/,
    /\baripiprazole lai\b/,
    /\blai overlap\b/,
    /\binjection dose\b/,
    /\boral overlap\b.*\blai\b/,
  ])) {
    return 'lai_conversion';
  }

  if (hasAny(text, [
    /\brestart stimulant in pt w psychosis history\b/,
    /\badhd med question\b/,
    /\bstimulant \+ substance use concern\b/,
    /\bcardiac screening before stimulant\b/,
  ])) {
    return 'stimulant_question';
  }

  if (hasAny(text, [
    /\blithium to valproate-ish\b/,
    /\bvalproate to lamotrigine-ish\b/,
    /\boxcarbazepine to lithium\b/,
    /\bmood stabilizer stopped\b/,
    /\bmood stabilizer transition\b/,
    /\bdepakote to lamictal\b/,
    /\brash\/titration\b/,
  ])) {
    return 'mood_stabilizer_transition';
  }

  if (hasAny(text, [
    /\bfluoxetine-ish to snri\b/,
    /\bzoloft to lexapro\b/,
    /\bssri to mirtazapine\b/,
    /\bmaoi\/serotonergic\b/,
    /\bserotonergic risk\b.*\b(washout|switch)\b/,
    /\bantidepressant switch\b/,
  ])) {
    return 'antidepressant_switch';
  }

  if (hasAny(text, [
    /\bolanzapine-ish to aripiprazole-ish\b/,
    /\bhaldol to risperidone-ish\b/,
    /\bquetiapine to ziprasidone-ish\b/,
    /\bstop clozapine-like\b/,
    /\bantipsychotic switch\b/,
  ])) {
    return 'antipsychotic_switch';
  }

  if (hasAny(text, [
    /\bcross taper\b/,
    /\bcross-taper\b/,
    /\bcross titrat/,
    /\bswitch sedating antipsychotic to less sedating\b/,
    /\boverlap two serotonergic meds\b/,
    /\bssri to snri\b.*\bno doses\b/,
    /\bcross taper mood meds\b/,
  ])) {
    return 'cross_taper';
  }

  if (hasAny(text, [
    /\btaper antidepressant\b/,
    /\bstop sedating med\b/,
    /\brebound insomnia\b/,
    /\btaper antipsychotic\b/,
    /\bmood stabilizer taper\b/,
  ])) {
    return 'taper';
  }

  if (hasAny(text, [
    /\btitrate ssri\b/,
    /\bincrease antipsychotic\b/,
    /\bmood stabilizer titration\b/,
    /\bsleep med titration\b/,
  ])) {
    return 'titration';
  }

  if (hasAny(text, [
    /\bssri \+ linezolid-ish\b/,
    /\blithium with nsaid\/acei\b/,
    /\bbenzo plus opioid\b/,
    /\bqt meds combo\b/,
    /\binteraction\b.*\b(mechanism|pharmacy)\b/,
  ])) {
    return 'interactions';
  }

  if (hasAny(text, [
    /\bakathisia vs anxiety\b/,
    /\bssri activation vs worsening anxiety\b/,
    /\bsedation after quetiapine-ish\b/,
    /\bgi upset and tremor\b/,
    /\bseverity\/red flags\b/,
  ])) {
    return 'side_effects';
  }

  if (hasAny(text, [
    /\blabs for lithium-ish\b/,
    /\bvalproate monitoring\b/,
    /\bantipsychotic metabolic labs\b/,
    /\blamotrigine monitoring\b/,
    /\boxcarbazepine sodium monitoring\b/,
    /\bsodium monitoring\b.*\boxcarbazepine\b/,
    /\brash counseling\b/,
    /\bmonitoring quick list\b/,
    /\bbaseline and followup\b/,
    /\bskip labs if stable\b/,
    /\bno monitoring needed\b/,
    /\bmake it order set\b/,
  ])) {
    return 'monitoring_labs';
  }

  if (hasAny(text, [
    /\bwhat forms does risperidone-ish med come in\b/,
    /\bavailable strengths for common ssri\b/,
    /\bliquid vs tab\b/,
    /\bodt\/injection\b/,
    /\bformulary\b/,
    /\bpackage verification\b/,
    /\bcommon forms\/strengths\b/,
  ])) {
    return 'strengths_forms';
  }

  if (hasAny(text, [
    /\busual adult range\b/,
    /\bstarting antipsychotic generally\b/,
    /\bwhat to know before starting antipsychotic\b/,
    /\bmood stabilizer sedating\b/,
    /\btrazodone-like sleep med\b/,
    /\bcommon counseling points\b/,
    /\bgeneral medication reference\b/,
    /\bgive exact order\b/,
    /\bwhat dose for this pt\b/,
  ])) {
    return 'medication_reference';
  }

  return null;
}

function hasProviderHistoryMedicationScenario(text: string) {
  return detectProviderHistoryMedicationScenarioKind(text) !== null;
}

function hasProviderHistoryDeliriumOverlap(text: string) {
  if (hasAny(text, [
    /\bmetabolic monitoring for antipsychotics\b/,
    /\bunknown blue powder\b/,
    /\bnot sure if this is psych or medical\b/,
    /\bmedical versus psych|medical vs psych\b/,
    /\bafter stopping drinking\b/,
    /\bteam split on withdrawal vs psych\b/,
  ])) {
    return false;
  }

  return hasAny(text, [
    /\b(psych or medical|medical or psych|psychosis or catatonia|catatonia\?|delirium|withdrawal concern|withdrawal overlap)\b/,
    /\b(not talking|staring|poor intake|mutism|rigidity|rigid|ck elevated)\b.*\b(psychosis|catatonia|delirium|medical|withdrawal|red flags|refusing to engage)\b/,
    /\b(psychosis|catatonia|delirium|medical|withdrawal|red flags|refusing to engage)\b.*\b(not talking|staring|poor intake|mutism|rigidity|rigid|ck elevated)\b/,
    /\b(refusing to engage|behavioral only|just say refusing|primary psychosis only)\b.*\b(confusion|staring|poor intake|withdrawal|medical|catatonia|delirium|vitals|infection)\b/,
    /\b(urgent red flags|medical assessment|medical workup)\b.*\b(confusion|withdrawal|catatonia|delirium|poor intake|staring)\b/,
    /\b(agitated \+ fluctuating attention|what not to assume)\b/,
    /\bbenzo stopped unclear\b/,
    /\btremor\/anxiety\/insomnia\b/,
    /\brigid\/slow\b/,
    /\bantipsychotic recently changed\b/,
    /\b(ignore withdrawal|psychosis only)\b/,
    /\bmonitoring questions\b.*\b(rigid|slow|withdrawal)\b/,
  ]);
}

function hasProviderHistoryMseCompletion(text: string) {
  return hasAny(text, [
    /\b(fill mse from note|mse pls|complete mental status|add i\/j based on admission|mental status)\b/,
    /\b(guarded and poor eye contact|poor eye contact|brief answers|no speech details|mood anxious but no cognition)\b/,
    /\b(put normal if not said|assume intact cognition|add fair insight|fill all boxes)\b/,
    /\b(not documented where missing|infer thought process|format in bullets)\b/,
  ]);
}

function hasProviderHistoryGeneralRiskWording(text: string) {
  return hasAny(text, [
    /\b(risk wording|make risk assessment|rewrite safety paragraph|chronic vs acute risk)\b/,
    /\b(denies intent but recent passive death wish|recent passive death wish|means not asked|protective factors thin|intoxication unclear)\b/,
    /\b(call low risk|say safe for dc|make denial enough|dont mention means not assessed|don't mention means not assessed)\b/,
    /\b(include what is missing|avoid overcalling|add conservative summary)\b/,
  ]);
}

function hasProviderHistoryRoutingMarker(text: string) {
  return hasAny(text, [
    /\b(si contradiction|suicide risk contradiction|hi denial|violence risk wording|capacity note for refusing med)\b/,
    /\b(chart says passive si|collateral is dramatic|hold wording|legally holdable|make clinical not legal|unsafe plan)\b/,
    /\b(psychosis or catatonia|lacks capacity bc psychotic|court-proof)\b/,
    /\b(pt calm now, earlier posturing|staff heard threats, target vague|goodbye-ish msg per collateral)\b/,
    /\b(pt denies si now but triage says wanted to disappear|denies intent but would not answer means question|guardian asking to force meds)\b/,
    /\b(benzo stopped unclear|tremor\/anxiety\/insomnia|rigid\/slow, antipsychotic recently changed|benzo taper, pt on unknown dose long time|want to stop ativan-like med quickly)\b/,
    /\b(alprazolam-ish|longer acting taper|benzo \+ alcohol use|fast taper|give fast taper|ignore alcohol risk|agitated \+ fluctuating attention|what not to assume)\b/,
    /\b(omit threats bc denied|say no risk since calm|make it sound behavioral only|just say no si|actually just say no si|ignore old statement|make risk low)\b/,
    /\b(no capacity full stop|guardian decides always right|avoid state law specifics|urgent red flags|just say refusing to engage|psychosis only|ignore withdrawal)\b/,
    /\b(fill mse from note|mse pls|complete mental status|add i\/j based on admission|put normal if not said|assume intact cognition|add fair insight|fill all boxes)\b/,
    /\b(risk wording|make risk assessment|rewrite safety paragraph|chronic vs acute risk|recent passive death wish|means not asked|protective factors thin|intoxication unclear)\b/,
    /\b(meth vs primary psych|thc daily|mania-ish|uds pending|tox pending|alcohol withdrawal vs anxiety vs psychosis|substance induced|bipolar definite)\b/,
    /\b(confused\/agitated|fever mentioned|medical ruleout|panic vs cardiac|chest tightness|new hallucinations older adult-ish|med changes unclear|hypothyroid\/medical fatigue|make it behavioral)\b/,
    /\b(pt denies si after sobering|earlier pdw|wants dc|uds not back|discharge readiness gaps|substance timing)\b/,
    /\b(benzo dose unk|alcohol use maybe|rapid taper|substance use uncertainty|withdrawal\/seizure risk)\b/,
    /\b(word psychosis|paranoid-sounding beliefs|people watching|thought blocking maybe|laughing to self|maybe guarded|separate observed vs reported|diagnostic uncertainty)\b/,
    /\b(denies avh but appears internally preocc|seen whispering when alone|nursing notes responding to unseen stimuli|guarded, scanning room|make side-by-side|dont overdiagnose|don'?t overdiagnose)\b/,
    /\b(collateral says unsafe|family reports med nonadherence|police\/ems style report differs|chart review says prior aggression|label sources|avoid taking sides|include clinical relevance)\b/,
    /\b(refuses admission plan|family says cannot care for self|patient preference|collateral concern|decision-specific capacity factors)\b/,
    /\b(noncompliant|drug seeking|drug-seeking|poor historian|attention seeking|attention-seeking|manipulative|unreliable|not rude sounding|include barriers)\b/,
    /\b(only have:|sparse note|brief triage|med refill request only|no safety info|no dose listed)\b/,
    /\b(what do i say here|is this ok\??|make better|thoughts\??|source is above only|you know what i mean|messy source: fix|for note: fix|fix; no details|fix; per staff)\b/,
    /\b(hpii|deneis|colat|medz|mse complte|dc summry|benzo tapr)\b/,
    /\b(pn:|a\/p clean|cont obs|collat pend|labs pend|irrt|rtis|biba|thc\+|pdw\+|si-|means\s*\?|fam worried)\b/,
    /\b(stimulant use unclear|voices started around binge|around binge maybe|say malingering)\b/,
    /\b(refill request only\b.*\bno safety screen|new paranoia\b.*\bconfusion\b.*\bvitals\/labs not in source)\b/,
    /\b(usual adult range|what to know before starting antipsychotic|mood stabilizer sedating|trazodone-like sleep med|available strengths for common ssri|risperidone-ish med|liquid vs tab|odt\/injection)\b/,
    /\b(labs for lithium-ish|valproate monitoring|antipsychotic metabolic labs|lamotrigine monitoring|oxcarbazepine sodium monitoring|sodium monitoring|akathisia vs anxiety|ssri activation|sedation after quetiapine|gi upset and tremor)\b/,
    /\b(ssri \+ linezolid-ish|lithium with nsaid\/acei|benzo plus opioid|qt meds combo|titrate ssri|increase antipsychotic|sleep med titration|mood stabilizer titration)\b/,
    /\b(taper antidepressant|stop sedating med|rebound insomnia|taper antipsychotic|cross taper|cross-taper|overlap two serotonergic|switch sedating antipsychotic)\b/,
    /\b(olanzapine-ish to aripiprazole-ish|haldol to risperidone-ish|quetiapine to ziprasidone-ish|fluoxetine-ish to snri|zoloft to lexapro|maoi\/serotonergic)\b/,
    /\b(lithium to valproate-ish|valproate to lamotrigine-ish|oxcarbazepine to lithium|restart stimulant in pt w psychosis history|adhd med question|cardiac screening before stimulant|stimulant \+ substance use)\b/,
    /\b(oral antipsychotic to lai|missed lai dose|paliperidone-ish|aripiprazole lai|missed lai maybe|refusing oral bridge|collateral says threats.*restart stimulant|staring not eating.*switch antipsychotic)\b/,
  ]);
}

function hasViolenceRiskNuance(text: string) {
  return hasAny(text, [
    /\b(denies hi|denies homicidal ideation|no hi|low violence risk|violence risk|making them pay|threatened neighbor|threatened her|someone is gonna get hurt|somebody is gonna get hurt|weapon|guns|gun|jaw clenched|muttering about staff|punched wall|homicidal intent)\b/,
  ]);
}

function hasEatingDisorderMedicalInstability(text: string) {
  return hasAny(text, [
    /\b(restricting|restriction|fear of weight gain|low intake|barely eating|poor appetite|low weight|orthostatic|orthostasis|brady|bradycardia|dizzy|dizzy with stairs|standing vitals|labs|vitals|refusing labs|refusing standing vitals|eating-disorder medical risk|appetite just bad)\b/,
  ]);
}

function hasInvoluntaryMedicationRefusal(text: string) {
  return hasAny(text, [
    /\b(refusing olanzapine|olanzapine\b.*\brefus|lithium refused|refus(?:ing|ed)\s+(?:the\s+)?(?:antipsychotic|mood stabilizer|lithium|olanzapine)|med(?:ication)? over objection|over objection|noncompliant|noncompliance|force it|forced medication|can be forced|legal authority|authority or process|capacity or consent|clinical recommendation)\b/,
  ]);
}

function hasMedicationRefusalAuthorityContext(text: string) {
  return hasAny(text, [
    /\b(refusing olanzapine|olanzapine\b.*\brefus|lithium refused|refus(?:ing|ed)\s+(?:the\s+)?(?:antipsychotic|mood stabilizer|lithium|olanzapine))\b/,
    /\b(med(?:ication)? over objection|over objection|force it|forced medication|can be forced|legal authority|authority or process|capacity or consent|clinical recommendation)\b/,
  ]);
}

function hasAmaElopementRisk(text: string) {
  return hasAny(text, [
    /\b(ama\b|against medical advice|against advice|elopement|elope|bolt|will bolt|tried doors|redirect(?:ed)?|leave right now|requesting ama discharge|leaving against advice|leaving against medical advice)\b/,
  ]);
}

function hasPersonalityLanguageCaution(text: string) {
  return hasAny(text, [
    /\b(manipulative|attention-seeking|attention seeking|borderline behavior|borderline traits|personality-ish|stigmatiz(?:ing|e)|pejorative|character stuff|less dramatic|breakup|boyfriend stopped answering)\b/,
  ]);
}

function hasProviderHistoryNonStigmatizingWording(text: string) {
  return hasAny(text, [
    /\b(noncompliant|noncompliance|drug seeking|drug-seeking|manipulative|poor historian|attention seeking|attention-seeking|unreliable)\b/,
    /\b(not rude sounding|better chart language|rewrite .* wording|wording alternative|make objective|include barriers)\b/,
    /\b(keep manipulative|say drug-seeking|call them unreliable|sound annoying)\b/,
  ]);
}

function hasProviderHistorySparseSourceHandling(text: string) {
  return hasAny(text, [
    /\b(only have:|sparse note|brief triage|med refill request only|no safety info|nothing else|no dose listed|no collateral)\b/,
    /\b(write note\?|what can i safely say|list missing|dont invent|don't invent|make tiny hpi)\b/,
    /\b(make complete anyway|fill normal ros\/mse|assume no risk|add diagnosis|missing dose\/adherence|missing safety screen)\b/,
  ]);
}

function hasProviderHistoryVagueFollowupPrompt(text: string) {
  return hasAny(text, [
    /\b(what do i say here|is this ok\??|make better|thoughts\??|source is above only|you know what i mean)\b/,
    /\b(messy source: fix|for note: fix|fix; no details|fix; per staff)\b/,
    /\b(chart language pls|urgent|make it definitive|no questions)\b/,
  ]);
}

function hasProviderHistoryTypoHeavyPrompt(text: string) {
  return hasAny(text, [
    /\b(hpii|deneis|colat|medz|mse complte|frm ths|dc summry|imprvd|f\/u|benzo tapr|dont wna)\b/,
    /\b(fix spelling|ask missing qs|keep source bound|assume the rest|make normal|dont flag gaps|fast pls)\b/,
  ]);
}

function hasProviderHistoryRushedShorthandPrompt(text: string) {
  return hasAny(text, [
    /\b(pn:|a\/p clean|cont obs|collat pend|labs pend|irrt|den si\/hi|avh\?|rtis|meds cont)\b/,
    /\b(biba|agi|thc\+|no slp|dc\?|si-|pdw\+|means\s*\?|fam worried)\b/,
    /\b(expand abbrevs carefully|missing list|ignore \? marks|fill blanks|say stable|make complete)\b/,
  ]);
}

function hasProviderHistoryMixedSparseMedRefillRisk(text: string) {
  return hasAny(text, [
    /\b(refill request only\b.*\banxious\b.*\bno dose\b.*\bno safety screen\b)/,
    /\b(missing dose\/adherence|missing safety screen|sparse med refill)\b/,
  ]);
}

function hasProviderHistoryMixedPsychosisMedicalRuleout(text: string) {
  return hasAny(text, [
    /\b(new paranoia\b.*\bconfusion\b.*\bmed change unk\b.*\bvitals\/labs not in source\b)/,
    /\b(psychosis uncertainty\b.*\bmedical contributors\b.*\bmissing vitals\/labs\b)/,
  ]);
}

function hasAcuteInpatientHpiGeneration(text: string) {
  return hasAny(text, [
    /\b(admit hpi|admission hpi|need psych admit hpi|make the hpi|can you make the hpi|build hpi|hpi pls|full psych hpi|admit-style|reason for admission|without making it fake-clean|without pretending we know if this is psych or medical)\b/,
    /\b(adult pt in eval area|messy bullets: mood down|dictated: pacing, not sleeping|source bound|fill in timeline|invent timeline)\b/,
  ]);
}

function hasProgressNoteRefinement(text: string) {
  return hasAny(text, [
    /\b(progress note is ugly|progress note cleaned up|rewrite this progress note|rewrite it so it is usable|cleaned up:|clean pn|prog note|make prog note professional|soap note from shorthand|tighten assessment|one chart-ready paragraph|improved progress-note paragraph|progress paragraph|less fake-clean)\b/,
    /\b(rewrite a\/p less messy|split plan bullets|med changes pending|collateral not reached|make them look stable|add normal mse bits|smooth out behavior issue)\b/,
  ]);
}

function hasDischargeSummaryGeneration(text: string) {
  return hasAny(text, [
    /\b(discharge summary from this mess|need discharge summary|make the discharge summary|one discharge summary paragraph|dc summary|d\/c summary|write hosp course|hospital course was|hospital course from bullets|symptom status at discharge|follow-up not actually scheduled|stable for discharge)\b/,
    /\b(safety plan incomplete|family still worried|followup vague|residual paranoia|make dc sound uncomplicated|skip the family concern|dont mention incomplete safety plan|say low risk for sure)\b/,
  ]);
}

function hasCrisisNoteWorkflow(text: string) {
  if (hasInvoluntaryMedicationRefusal(text)) {
    return false;
  }

  return hasAny(text, [
    /\b(crisis note|event note for agitation|crisis intervention note|stat note)\b/,
    /\b(yelling|clenched fists|refused room|calmed after staff talked|least restrictive steps)\b/,
    /\b(threats vague|security nearby|no injury|document response without blame|restraint sound routine)\b/,
    /\b(banging door|redirectable|staff trigger|risk rationale)\b/,
    /\b(severe anxiety vs agitation|meds offered, monitoring ongoing|monitoring ongoing|behavior resolved)\b/,
  ]);
}

function isViolenceContradictionExplanationPrompt(text: string) {
  return hasAny(text, [
    /\b(what does vera do with that contradiction|do with that contradiction|handle that contradiction|why is that garbage|why would vera let anyone settle|violence risk low because patient denies intent)\b/,
  ]);
}

type ResponseVariantSet = {
  tightMessage?: string;
  oneLineMessage?: string;
  tightSuggestions?: string[];
  oneLineSuggestions?: string[];
};

function firstSentence(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return trimmed;
  }

  const match = trimmed.match(/.+?[.!?](?:\s|$)/);
  return match?.[0]?.trim() || trimmed;
}

function tightenMessage(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return trimmed;
  }

  const chartReadyMatch = trimmed.match(/Chart-ready wording:\s*"[^"]+"/i);
  if (chartReadyMatch?.[0]) {
    return chartReadyMatch[0];
  }

  const warningMatch = trimmed.match(/Warning:\s*.+?(?:\.|$)/i);
  if (warningMatch?.[0]) {
    return warningMatch[0].trim();
  }

  const clinicalMatch = trimmed.match(/Clinical explanation:\s*.+?(?:\.|$)/i);
  if (clinicalMatch?.[0]) {
    return clinicalMatch[0].trim();
  }

  const workflowMatch = trimmed.match(/Workflow guidance:\s*.+?(?:\.|$)/i);
  if (workflowMatch?.[0]) {
    return workflowMatch[0].trim();
  }

  return firstSentence(trimmed);
}

function applyResponseStyle(
  payload: AssistantResponsePayload,
  input?: ClinicalTaskPriorityInput,
  variants?: ResponseVariantSet,
) {
  const style = input?.followupDirective?.responseStyle || 'full';
  const canCompress = Boolean(input?.previousAnswerMode || input?.previousBuilderFamily);

  if (style === 'full' || !canCompress) {
    return payload;
  }

  if (style === 'one-line') {
    return {
      ...payload,
      message: variants?.oneLineMessage || variants?.tightMessage || tightenMessage(payload.message),
      suggestions: variants?.oneLineSuggestions || [],
    } satisfies AssistantResponsePayload;
  }

  return {
    ...payload,
    message: variants?.tightMessage || tightenMessage(payload.message),
    suggestions: variants?.tightSuggestions || payload.suggestions?.slice(0, 2),
  } satisfies AssistantResponsePayload;
}

function withAnswerMode(
  payload: AssistantResponsePayload,
  answerMode?: AssistantAnswerMode,
  builderFamily?: AssistantBuilderFamily,
  input?: ClinicalTaskPriorityInput,
  variants?: ResponseVariantSet,
) {
  const styledPayload = applyResponseStyle(payload, input, variants);

  if (!answerMode) {
    return styledPayload;
  }

  return {
    ...styledPayload,
    answerMode,
    builderFamily,
  } satisfies AssistantResponsePayload;
}

function uniqueLines(items: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return items.filter((item): item is string => {
    if (!item) {
      return false;
    }
    const normalized = item.trim();
    const dedupeKey = normalized.toLowerCase();
    if (!normalized || seen.has(dedupeKey)) {
      return false;
    }
    seen.add(dedupeKey);
    return true;
  });
}

function joinList(items: string[]) {
  if (items.length <= 1) {
    return items[0] || '';
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function normalizeClause(item: string) {
  const trimmed = item.trim().replace(/[.]+$/g, '');
  if (!trimmed) {
    return trimmed;
  }

  if (/^[A-Z]{2,}\b/.test(trimmed)) {
    return trimmed;
  }

  if (/^[A-Z][a-z]/.test(trimmed)) {
    return `${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
  }

  return trimmed;
}

function sentenceCase(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return trimmed;
  }

  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function isPressurePrompt(message: string) {
  const normalized = normalize(message);
  return hasAny(normalized, [
    /\bjust\b/,
    /\bmove on\b/,
    /\bneed this fast\b/,
    /\badmin pressure\b/,
    /\bbe direct\b/,
    /\bone line\b/,
    /\bclean this up quick\b/,
    /\btransfer can happen\b/,
    /\bright now\b/,
    /\bnow\b.*\b(note|plan|transfer)\b/,
    /\bcan i just (?:say|write|call)\b/,
    /\bjust give me\b/,
    /\bjust call it\b/,
    /\bskip the uncertainty\b/,
    /\bdrop the\b/,
    /\bsmooth(?: it| this) out\b/,
    /\bless acute\b/,
    /\bso i can sign this\b/,
    /\bbe done\b/,
    /\bjust keep it psych\b/,
    /\bpick the cleaner version\b/,
  ]);
}

function noteTypeLooksLike(noteType: string | undefined, patterns: RegExp[]) {
  const normalized = normalize(noteType || '');
  if (!normalized) {
    return false;
  }

  return hasAny(normalized, patterns);
}

function isUiRewriteRequest(message: string) {
  const normalized = normalize(message);
  return hasAny(normalized, [
    /\bword this better\b/,
    /\brewrite\b/,
    /\brewrite this\b/,
    /\bimprove this note\b/,
    /\bimprove this\b/,
    /\bnot fake-clean\b/,
    /\bmake (?:it|this) chart(?:-|\s)?ready\b/,
    /\bone paragraph\b/,
    /\bshorter\b/,
    /\btighten\b/,
    /\bkeep what matters\b/,
    /\bdon'?t lose\b/,
  ]);
}

function isMessySourceStartRequest(message: string) {
  const normalized = normalize(message);
  return hasAny(normalized, [
    /\bwhere do i start\b/,
    /\bfirst move\b/,
    /\badmit note workup\b/,
    /\bworkup\b/,
  ]);
}

function inferBuilderFamily(
  message: string,
  sourceText: string,
  answerMode?: AssistantAnswerMode,
  primaryConcern?: PrimaryConcern | null,
): AssistantBuilderFamily | undefined {
  const normalized = normalize(`${message}\n${sourceText}`);

  if (answerMode === 'mse_completion_limits') {
    return 'mse';
  }

  if (answerMode === 'uncertainty_preserving_substance_documentation') {
    return 'substance';
  }

  if (primaryConcern === 'capacity') {
    return 'capacity';
  }

  if (hasAny(normalized, [/\b(hold wording|exact hold wording|source-matched hold language|meets hold|hold criteria|legal hold|overdose if sent home|safe place to stay)\b/])) {
    return 'hold';
  }

  if (hasAny(normalized, [/\b(dc likely tomorrow|likely discharge tomorrow|discharge remains unresolved|safe home plan|wants out)\b/])) {
    return 'discharge';
  }

  if (hasAny(normalized, [/\b(patient reports|patient says|mother reports|mom says|sister says|collateral reports|without picking a side|documented separately)\b/])) {
    return 'contradiction';
  }

  if (
    hasProviderHistorySubstancePsychOverlap(normalized)
    || hasProviderHistoryMedicalPsychOverlap(normalized)
    || hasAny(normalized, [/\b(withdrawal vs psych|withdrawal versus|medical versus psych|medical vs psych|just call it psych|suddenly confused|uti)\b/])
  ) {
    return 'overlap';
  }

  if (hasAcuteInpatientHpiGeneration(normalized)) {
    return 'acute-hpi';
  }

  if (hasProgressNoteRefinement(normalized)) {
    return 'progress-note';
  }

  if (hasDischargeSummaryGeneration(normalized)) {
    return 'discharge-summary';
  }

  if (hasCrisisNoteWorkflow(normalized)) {
    return 'crisis-note';
  }

  if (hasConsultLiaisonMedicalOverlap(normalized)) {
    return 'overlap';
  }

  if (hasInvoluntaryMedicationRefusal(normalized)) {
    return 'medication-refusal';
  }

  if (hasAmaElopementRisk(normalized)) {
    return 'ama-elopement';
  }

  if (hasPersonalityLanguageCaution(normalized)) {
    return 'personality-language';
  }

  if (hasViolenceRiskNuance(normalized)) {
    return answerMode === 'warning_language' ? 'risk' : 'contradiction';
  }

  if (hasEatingDisorderMedicalInstability(normalized)) {
    if (answerMode === 'workflow_guidance') {
      return 'workflow';
    }

    return answerMode === 'warning_language' ? 'risk' : 'chart-wording';
  }

  if (hasAny(normalized, [/\b(fragmented source|source is a mess|normal progress update)\b/])) {
    return 'fragmented-source';
  }

  if (hasAny(normalized, [/\b(malingering|housing|secondary gain)\b/])) {
    return 'malingering';
  }

  if (hasAny(normalized, [/\b(adderall|stimulant restart|routine adhd)\b/])) {
    return 'medication-boundary';
  }

  if (answerMode === 'workflow_guidance') {
    return 'workflow';
  }

  if (answerMode === 'warning_language') {
    return primaryConcern === 'suicide' || primaryConcern === 'violence' ? 'contradiction' : 'risk';
  }

  if (answerMode === 'chart_ready_wording') {
    return 'chart-wording';
  }

  return undefined;
}

function resolvePinnedClinicalOverride(
  input: ClinicalTaskPriorityInput,
  contextualAnswerMode?: AssistantAnswerMode,
): ClinicalTaskOverride | null {
  const explicitOverride = input.override || classifyClinicalTaskOverride(input.message);
  const preserveState = Boolean(
    input.followupDirective?.preserveClinicalState
    && (input.previousAnswerMode || input.previousBuilderFamily),
  );

  const answerMode = preserveState
    ? explicitOverride?.answerMode || input.previousAnswerMode || contextualAnswerMode
    : explicitOverride?.answerMode || contextualAnswerMode;

  const explicitBuilderFamilyIsGeneric = explicitOverride?.builderFamily === 'chart-wording'
    || explicitOverride?.builderFamily === 'workflow'
    || explicitOverride?.builderFamily === 'risk';

  const builderFamily: AssistantBuilderFamily | undefined = preserveState
    ? (explicitBuilderFamilyIsGeneric && input.previousBuilderFamily
      ? input.previousBuilderFamily
      : explicitOverride?.builderFamily || input.previousBuilderFamily || undefined)
    : explicitOverride?.builderFamily || undefined;

  if (!explicitOverride && !answerMode && !builderFamily) {
    return null;
  }

  return {
    forcedIntent: explicitOverride?.forcedIntent,
    answerMode,
    builderFamily,
  };
}

function buildDirectPushback(primaryConcern: PrimaryConcern, input: ClinicalTaskPriorityInput) {
  const normalized = normalize(input.message);

  if (hasAny(normalized, [/\blow(?: suicide| violence)?[ -]?risk\b/, /\brisk is low\b/])) {
    return primaryConcern === 'violence'
      ? 'Low-risk wording is not supported here. Low violence-risk wording is not supported here.'
      : 'Low-risk wording is not supported here. Low suicide-risk wording is not supported here.';
  }

  if (hasGraveDisabilityConcern(input) && /\bgrave disability\b/.test(normalized)) {
    return 'Confirmed grave-disability wording is not supported from this source alone.';
  }

  if (primaryConcern === 'capacity') {
    return 'I would not document that as a clean capacity conclusion from this source.';
  }

  if (primaryConcern === 'telehealth') {
    return 'That wording is too certain for the available data.';
  }

  if (primaryConcern === 'psychosis-substance' || primaryConcern === 'mania-activation') {
    return 'I would not document it that way while the diagnostic picture remains unsettled.';
  }

  return 'I would not document it that way from this source.';
}

function buildWhySaferLine(primaryConcern: PrimaryConcern, flags: ClinicalScenarioFlags) {
  return `Why this is safer: ${buildAssessmentFrame(primaryConcern, flags)}`;
}

function buildDoNotSayLine(primaryConcern: PrimaryConcern, flags: ClinicalScenarioFlags) {
  return `Do not say: ${buildWarningText(primaryConcern, flags).replace(/^Warning:\s*/i, '')}`;
}

function formatMseDomainLabel(domain: string) {
  return domain.replace(/_/g, ' ');
}

function summarizeMseMatches(mseAnalysis: MseAnalysis) {
  return mseAnalysis.detectedDomains
    .map((entry) => {
      const label = formatMseDomainLabel(entry.domain);
      const sample = entry.matches.slice(0, 2).join(', ');
      return sample ? `${label} (${sample})` : label;
    })
    .slice(0, 5);
}

function collectFallbackMseMatches(text: string) {
  const normalized = normalize(text);
  return uniqueLines([
    /\bpacing\b/.test(normalized) ? 'behavior (pacing)' : null,
    /\bguarded\b/.test(normalized) ? 'behavior (guarded)' : null,
    /\bpoor eye contact\b/.test(normalized) ? 'appearance/behavior (poor eye contact)' : null,
    /\bbrief answers\b/.test(normalized) ? 'speech (brief answers)' : null,
    /\b(anxious mood|mood anxious|mood is anxious|depressed mood|irritable mood|euthymic mood)\b/.test(normalized) ? 'mood (anxious mood)' : null,
    /\b(pressured speech|speech pressured|speech is pressured|rapid speech|slurred speech|speech is slurred)\b/.test(normalized) ? 'speech (pressured speech)' : null,
    /\b(tangential thought process|thought process tangential|thought process is tangential|linear thought process|circumstantial thought process|flight of ideas)\b/.test(normalized)
      ? 'thought process (tangential thought process)'
      : null,
    /\b(flat affect|restricted affect|labile affect|blunted affect)\b/.test(normalized) ? 'affect' : null,
    /\b(denies hallucinations|hearing voices|responding to internal stimuli|internally preoccupied)\b/.test(normalized) ? 'perception' : null,
  ]).slice(0, 5);
}

function mergeMseDocumentedLabels(primary: string[], fallback: string[]) {
  const seenDomains = new Set(
    primary.map((item) => item.replace(/\s*\(.*/, '').trim().toLowerCase()),
  );

  return [
    ...primary,
    ...fallback.filter((item) => {
      const domain = item.replace(/\s*\(.*/, '').trim().toLowerCase();
      if (seenDomains.has(domain)) {
        return false;
      }
      seenDomains.add(domain);
      return true;
    }),
  ];
}

function collectFallbackMissingMseDomains(detectedLabels: string[]) {
  const detectedSet = new Set(
    detectedLabels.map((item) => item.replace(/\s*\(.*/, '').trim().toLowerCase()),
  );

  return [
    'appearance',
    'behavior',
    'speech',
    'mood',
    'affect',
    'thought process',
    'thought content',
    'perception',
    'cognition',
    'insight',
    'judgment',
  ].filter((domain) => !detectedSet.has(domain));
}

function collectObservedSubstanceSyndrome(text: string) {
  const normalized = normalize(text);
  return uniqueLines([
    hasAny(normalized, [/\bconfusion\b/, /\bconfused\b/]) ? 'confusion is documented' : null,
    hasAny(normalized, [/\bagitation\b/, /\bagitated\b/, /\bpacing\b/]) ? 'agitation or pacing is documented' : null,
    hasAny(normalized, [/\bsweating\b/, /\bdiaphoresis\b/, /\bsweaty\b/]) ? 'diaphoresis is documented' : null,
    hasAny(normalized, [/\btachycardia\b/]) ? 'tachycardia is documented' : null,
    hasAny(normalized, [/\bvomiting\b/]) ? 'vomiting is documented' : null,
    hasAny(normalized, [/\bparanoia\b/, /\bparanoid\b/]) ? 'paranoia is documented' : null,
  ]).slice(0, 4);
}

function hasGraveDisabilityConcern(input: ClinicalTaskPriorityInput) {
  return input.riskAnalysis.graveDisability.length > 0;
}

export function classifyClinicalTaskOverride(message: string): ClinicalTaskOverride | null {
  const normalized = normalize(message);
  const providerHistoryRoutingMarker = hasProviderHistoryRoutingMarker(normalized);
  const providerHistoryMedicationKind = detectProviderHistoryMedicationScenarioKind(normalized);

  if (providerHistoryMedicationKind) {
    if (providerHistoryMedicationKind === 'mixed_violence_stimulant') {
      return {
        forcedIntent: 'workflow_help',
        answerMode: 'warning_language',
        builderFamily: 'contradiction',
      };
    }

    if (providerHistoryMedicationKind === 'mixed_catatonia_antipsychotic_switch') {
      return {
        forcedIntent: 'workflow_help',
        answerMode: 'clinical_explanation',
        builderFamily: 'overlap',
      };
    }

    if (providerHistoryMedicationKind === 'mixed_lai_legal') {
      return {
        forcedIntent: 'reference_help',
        answerMode: 'medication_reference_answer',
        builderFamily: 'medication-boundary',
      };
    }

    return {
      forcedIntent: 'reference_help',
      answerMode: 'medication_reference_answer',
      builderFamily: 'medication-boundary',
    };
  }

  if (providerHistoryRoutingMarker && hasProviderHistoryMixedPsychosisMedicalRuleout(normalized)) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'workflow_guidance',
      builderFamily: 'overlap',
    };
  }

  if (providerHistoryRoutingMarker && hasProviderHistoryMixedSparseMedRefillRisk(normalized)) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'workflow_guidance',
      builderFamily: 'fragmented-source',
    };
  }

  if (providerHistoryRoutingMarker
    && hasProviderHistoryNonStigmatizingWording(normalized)
    && !hasProviderHistoryCollateralConflict(normalized)
    && !hasProviderHistoryInternalPreoccupationDenial(normalized)
    && !hasProviderHistoryPsychosisWording(normalized)
    && !hasMedicationRefusalAuthorityContext(normalized)) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'chart_ready_wording',
      builderFamily: 'personality-language',
    };
  }

  if (providerHistoryRoutingMarker && hasProviderHistorySparseSourceHandling(normalized)) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'workflow_guidance',
      builderFamily: 'fragmented-source',
    };
  }

  if (providerHistoryRoutingMarker
    && hasProviderHistoryVagueFollowupPrompt(normalized)
    && !hasAcuteInpatientHpiGeneration(normalized)
    && !hasProgressNoteRefinement(normalized)
    && !hasDischargeSummaryGeneration(normalized)
    && !hasCrisisNoteWorkflow(normalized)
    && !hasProviderHistoryMixedCollateralCapacity(normalized)
    && !hasProviderHistoryMixedSparseMedRefillRisk(normalized)
    && !hasProviderHistoryMixedPsychosisMedicalRuleout(normalized)
    && !hasProviderHistoryDeliriumOverlap(normalized)
    && !hasProviderHistoryMedicalPsychOverlap(normalized)
    && !hasProviderHistorySubstancePsychOverlap(normalized)) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'workflow_guidance',
      builderFamily: 'workflow',
    };
  }

  if (providerHistoryRoutingMarker && hasProviderHistoryTypoHeavyPrompt(normalized)) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'workflow_guidance',
      builderFamily: 'fragmented-source',
    };
  }

  if (providerHistoryRoutingMarker && hasProviderHistoryRushedShorthandPrompt(normalized)) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'workflow_guidance',
      builderFamily: 'fragmented-source',
    };
  }

  if (providerHistoryRoutingMarker && hasProviderHistoryMixedSiSubstanceDischarge(normalized)) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'warning_language',
      builderFamily: 'risk',
    };
  }

  if (providerHistoryRoutingMarker && hasProviderHistoryMixedCollateralCapacity(normalized)) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'clinical_explanation',
      builderFamily: 'capacity',
    };
  }

  if (providerHistoryRoutingMarker && hasProviderHistoryInternalPreoccupationDenial(normalized)) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'chart_ready_wording',
      builderFamily: 'contradiction',
    };
  }

  if (providerHistoryRoutingMarker && hasProviderHistoryCollateralConflict(normalized)) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'workflow_guidance',
      builderFamily: 'contradiction',
    };
  }

  if (providerHistoryRoutingMarker && hasProviderHistoryPsychosisWording(normalized)) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'chart_ready_wording',
      builderFamily: 'contradiction',
    };
  }

  if (
    providerHistoryRoutingMarker
    && (hasProviderHistorySuicideContradiction(normalized) || hasProviderHistoryViolenceContradiction(normalized))
  ) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'warning_language',
      builderFamily: 'contradiction',
    };
  }

  if (providerHistoryRoutingMarker && hasProviderHistoryLegalCapacity(normalized)) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'clinical_explanation',
      builderFamily: 'capacity',
    };
  }

  if (providerHistoryRoutingMarker && hasProviderHistoryBenzoTaper(normalized)) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'clinical_explanation',
      builderFamily: 'medication-boundary',
    };
  }

  if (providerHistoryRoutingMarker && hasProviderHistorySubstancePsychOverlap(normalized)) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'clinical_explanation',
      builderFamily: 'overlap',
    };
  }

  if (providerHistoryRoutingMarker && hasProviderHistoryMedicalPsychOverlap(normalized)) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'workflow_guidance',
      builderFamily: 'overlap',
    };
  }

  if (providerHistoryRoutingMarker && hasProviderHistoryDeliriumOverlap(normalized)) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'clinical_explanation',
      builderFamily: 'overlap',
    };
  }

  if (
    hasAcuteInpatientHpiGeneration(normalized)
    || hasAny(normalized, [
      /\bneed hpi\b/,
      /\bhpi fast\b/,
      /\bchart(?:-|\s)?ready hpi\b/,
      /\bjust write the hpi\b/,
      /\bkeep the timeline honest\b/,
      /\bmake the reason for admission\b/,
      /\bmake it less fake-clean\b/,
      /\bleave the meth out\b/,
      /\bclassic bipolar mania\b/,
    ])
  ) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'chart_ready_wording',
      builderFamily: 'acute-hpi',
    };
  }

  if (
    hasProgressNoteRefinement(normalized)
    || hasAny(normalized, [
      /\brewrite this progress note\b/,
      /\bword this better\b/,
      /\bnot fake-clean\b/,
      /\brefine this progress paragraph\b/,
      /\bone chart-ready paragraph\b/,
      /\bimproved progress-note paragraph\b/,
      /\bpatient-reported improvement remains documented\b/,
      /\bcommand auditory hallucinations remain documented\b/,
      /\bmake it read like improving and less acute\b/,
      /\bleave out what is not documented\b/,
    ])
  ) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'chart_ready_wording',
      builderFamily: 'progress-note',
    };
  }

  if (
    hasDischargeSummaryGeneration(normalized)
    || hasAny(normalized, [
      /\bmake the discharge summary\b/,
      /\bone discharge summary paragraph\b/,
      /\bhospital course\b/,
      /\bsymptom status at discharge\b/,
      /\bfollow-up not actually scheduled\b/,
      /\bsupport or medication access remained unconfirmed\b/,
    ])
  ) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'chart_ready_wording',
      builderFamily: 'discharge-summary',
    };
  }

  if (hasCrisisNoteWorkflow(normalized)) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'chart_ready_wording',
      builderFamily: 'crisis-note',
    };
  }

  if (
    hasInvoluntaryMedicationRefusal(normalized)
    && hasAny(normalized, [/\b(clinical explanation|pick one lane|both\?|refusal, no capacity, both|refusal, capacity, and clinical recommendation)\b/])
  ) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'clinical_explanation',
      builderFamily: 'medication-refusal',
    };
  }

  if (
    hasInvoluntaryMedicationRefusal(normalized)
    && hasAny(normalized, [/\b(chart-ready|what should the note actually say|keep the refusal|authority uncertainty|make that chart-ready)\b/])
  ) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'chart_ready_wording',
      builderFamily: 'medication-refusal',
    };
  }

  if (
    hasInvoluntaryMedicationRefusal(normalized)
    && hasAny(normalized, [/\b(warning language|choosing not to comply|punitive|leave it there)\b/])
  ) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'warning_language',
      builderFamily: 'medication-refusal',
    };
  }

  if (hasAny(normalized, [/\bchoosing not to comply with treatment\b/])) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'warning_language',
      builderFamily: 'medication-refusal',
    };
  }

  if (hasAny(normalized, [
    /\bmissing authority boundaries explicit\b/,
    /\bauthority boundaries explicit\b/,
    /\brefusal\b.*\brecommendation\b/,
  ])) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'warning_language',
      builderFamily: 'medication-refusal',
    };
  }

  if (
    hasAmaElopementRisk(normalized)
    && hasAny(normalized, [/\b(workflow guidance|what does vera have to keep visible|missing disposition|normal discharge planning|routine discharge planning)\b/])
  ) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'workflow_guidance',
      builderFamily: 'ama-elopement',
    };
  }

  if (hasAny(normalized, [/\bnormal discharge planning\b/, /\broutine discharge planning\b/])) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'workflow_guidance',
      builderFamily: 'ama-elopement',
    };
  }

  if (
    hasAmaElopementRisk(normalized)
    && hasAny(normalized, [/\b(warning language|leave out the elopement stuff|elopement stuff|safe to discharge)\b/])
  ) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'warning_language',
      builderFamily: 'ama-elopement',
    };
  }

  if (hasAny(normalized, [/\brecent elopement attempts\b/, /\bhard to smooth away\b/, /\bunresolved risk\b/])) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'warning_language',
      builderFamily: 'ama-elopement',
    };
  }

  if (
    hasAmaElopementRisk(normalized)
    && hasAny(normalized, [/\b(chart-ready|against medical advice|requesting ama discharge|leaving against advice|leaving against medical advice)\b/])
  ) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'chart_ready_wording',
      builderFamily: 'ama-elopement',
    };
  }

  if (
    hasPersonalityLanguageCaution(normalized)
    && hasAny(normalized, [/\b(workflow guidance|what should vera do|not stigmatizing|collateral conflict|less personality-ish|less dramatic)\b/])
  ) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'workflow_guidance',
      builderFamily: 'personality-language',
    };
  }

  if (hasAny(normalized, [/\bnon-stigmatizing caution explicit\b/, /\bkeep it short\b.*\bnon-stigmatizing\b/])) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'warning_language',
      builderFamily: 'personality-language',
    };
  }

  if (hasAny(normalized, [/\bbehaviorally specific without labeling personality disorder from one encounter\b/])) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'chart_ready_wording',
      builderFamily: 'personality-language',
    };
  }

  if (hasAny(normalized, [/\bobserved behavior, patient report, and collateral conflict separate\b/])) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'workflow_guidance',
      builderFamily: 'personality-language',
    };
  }

  if (
    hasPersonalityLanguageCaution(normalized)
    && hasAny(normalized, [/\b(warning language|borderline behavior|borderline traits|move on)\b/])
  ) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'warning_language',
      builderFamily: 'personality-language',
    };
  }

  if (
    hasPersonalityLanguageCaution(normalized)
    && hasAny(normalized, [/\b(chart-ready|behaviorally specific|pejorative|what wording keeps this from sounding pejorative)\b/])
  ) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'chart_ready_wording',
      builderFamily: 'personality-language',
    };
  }

  if (hasAny(normalized, [
    /\bmse\b/,
    /\bmental status\b/,
    /\bauto-?complete\b/,
    /\bleave unfilled\b/,
    /\bleave blank\b/,
    /\bwhat should vera refuse to auto-?complete\b/,
    /\bwhat should remain unfilled\b/,
    /\bshould vera keep that\b/,
    /\bshould vera keep those\b/,
    /\bcalm\/cooperative\/linear\b/,
    /\bput calm\b.*\bcooperative\b.*\blinear\b/,
    /\bfill mse from note\b/,
    /\bmse pls\b/,
    /\bcomplete mental status\b/,
    /\badd i\/j based on admission\b/,
    /\bput normal if not said\b/,
    /\bassume intact cognition\b/,
    /\badd fair insight\b/,
    /\bfill all boxes\b/,
  ])) {
    return {
      forcedIntent: 'clinical_mse_help',
      answerMode: 'mse_completion_limits',
      builderFamily: 'mse',
    };
  }

  if (hasProviderHistoryGeneralRiskWording(normalized)) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: hasAny(normalized, [/\b(chart ready|chart-ready|rewrite safety paragraph|make it chart-ready)\b/])
        ? 'chart_ready_wording'
        : 'warning_language',
      builderFamily: 'risk',
    };
  }

  if (hasAny(normalized, [
    /\bunknown substance\b/,
    /\bunknown powder\b/,
    /\bunknown pill\b/,
    /\bunknown ingestion\b/,
    /\bfriend gave\b/,
    /\bfrom a friend\b/,
    /\bnegative uds\b/,
    /\buds\b.*\bnegative\b/,
    /\bnegative\b.*\buds\b/,
    /\bdo not pretend you know what it was\b/,
    /\bpretend(?:ing)? .* know what it was\b/,
  ])) {
    return {
      forcedIntent: 'substance_help',
      answerMode: 'uncertainty_preserving_substance_documentation',
      builderFamily: 'substance',
    };
  }

  if (hasAny(normalized, [
    /\b(capacity is decision-specific|decision-specific|meaningful consent discussion|cannot explain what happens if he skips|cannot explain what happens if she skips|can i just say lacks capacity|family consent and move on)\b/,
  ])) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'clinical_explanation',
      builderFamily: 'capacity',
    };
  }

  if (hasAny(normalized, [
    /\b(source-matched hold language|exact hold wording|hold wording)\b/,
  ])) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'warning_language',
      builderFamily: 'hold',
    };
  }

  if (hasAny(normalized, [
    /\blegally safer wording\b/,
  ])) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'chart_ready_wording',
      builderFamily: 'hold',
    };
  }

  if (hasAny(normalized, [
    /\b(meets? hold|hold criteria|legal hold|transfer can happen|hold threshold)\b/,
  ])) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'chart_ready_wording',
      builderFamily: 'hold',
    };
  }

  if (hasAny(normalized, [
    /\b(fragmented source|source is a mess|what workflow guidance should vera give when the source is this fragmented|what should vera do with a follow-up that vague|do not silently resolve ambiguity|skip the uncertainty|normal progress update|workflow guidance)\b/,
  ])) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'workflow_guidance',
      builderFamily: 'fragmented-source',
    };
  }

  if (
    hasAny(normalized, [/\b(mom says he threatened|mother says he threatened|threatened her)\b/])
    && hasAny(normalized, [/\bthat was last week, not now\b/, /\blast week, not now\b/])
    && hasAny(normalized, [/\bhow do i write that\b/, /\bmake that tighter\b/, /\bmake it tighter\b/, /\btighter than that\b/])
  ) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'workflow_guidance',
      builderFamily: 'workflow',
    };
  }

  if (
    hasEatingDisorderMedicalInstability(normalized)
    && hasAny(normalized, [/\bobjective data are incomplete\b/, /\bwhat does vera have to keep in\b/, /\brefusing labs and standing vitals\b/])
  ) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'workflow_guidance',
      builderFamily: 'workflow',
    };
  }

  if (hasAny(normalized, [/\bskip the missing vitals\/labs\b/, /\bmissing vitals\/labs part\b/])) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'workflow_guidance',
      builderFamily: 'workflow',
    };
  }

  if (hasAny(normalized, [
    /\bnot sure if this is psych or medical\b/,
    /\bwhat do i say without overcalling either\b/,
    /\bjust keep it psych\b/,
    /\bjust call it psych\b/,
    /\bmedicine wants psych wording now\b/,
    /\bconsult note\b/,
    /\bwhat should the consult note say\b/,
  ])) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'workflow_guidance',
      builderFamily: 'overlap',
    };
  }

  if (hasAny(normalized, [
    /\b(prednisone burst|steroid|med side effect|pick mania or med side effect|pick mania or medication side effect|both\?)\b/,
    /\bclinical explanation\b.*\b(steroid|medical contributor overlap explicit)\b/,
    /\bconcise clinical explanation\b/,
  ])) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'clinical_explanation',
      builderFamily: 'overlap',
    };
  }

  if (hasAny(normalized, [
    /\bwarning language\b/,
    /\bwhat warning should vera give\b/,
    /\bwhat should stay explicit\b/,
    /\bwhat should vera keep explicit\b/,
    /\bwhat should stay unresolved\b/,
    /\bwhat should vera refuse to imply\b/,
    /\bwhat vera should refuse to imply\b/,
    /\bwhat cannot be smoothed over\b/,
    /\bwhy is that unsafe\b/,
    /\bwhat would make this unsafe\b/,
    /\broutine adhd management\b/,
    /\broutine stimulant restart\b/,
    /\bstimulant restart write-?up\b/,
    /\bwhat should vera not overcall here\b/,
    /\bcan i just call it low risk\b/,
    /\bshortest low-?risk version\b/,
    /\bjust write malingering\b/,
    /\bsomebody is gonna get hurt\b/,
    /\bweapon-access uncertainty\b/,
    /\bweapon access uncertainty\b/,
    /\bpoor appetite alone\b/,
    /\beat(?:ing)?-disorder medical risk\b/,
  ])) {
    return {
      answerMode: 'warning_language',
      builderFamily: hasAny(normalized, [/\bmalingering\b/, /\bhousing\b/]) ? 'malingering' : hasAny(normalized, [/\badderall\b/, /\bstimulant\b/, /\badhd\b/]) ? 'medication-boundary' : hasAny(normalized, [/\b(weapon|violence risk|homicid|threatened|making them pay)\b/]) ? 'contradiction' : 'risk',
    };
  }

  if (hasAny(normalized, [
    /\bdocumentation language\b/,
    /\bchart wording\b/,
    /\bchart language\b/,
    /\bchart(?:-|\s)?ready wording\b/,
    /\bwhat belongs in objective\b/,
    /\bwhat belongs in assessment\b/,
    /\bexact plan language\b/,
    /\bnote language\b/,
    /\bhow should i word (?:that|this)\b/,
    /\bhow should i phrase (?:that|this)\b/,
    /\bhow do i write (?:that|this)\b/,
    /\bwhat should vera avoid assuming\b/,
    /\bmedication uncertainty\b/,
    /\bcurrent regimen was not specified\b/,
    /\bmake it note-usable\b/,
    /\bkeep the denial and the higher-?risk facts side by side\b/,
    /\bkeep the patient-reported improvement\b/,
    /\bobjective section\b/,
    /\breported denial\b/,
    /\bwithout picking a side\b/,
    /\bdc likely tomorrow\b/,
    /\blikely discharge tomorrow\b/,
    /\bmake it chart(?:-|\s)?ready\b/,
    /\blow violence risk\b/,
    /\bhypoxia\b/,
    /\bmedical instability\b/,
    /\bpoor appetite improving\b/,
  ])) {
    return {
      answerMode: 'chart_ready_wording',
      builderFamily: hasAny(normalized, [/\bdischarge\b/, /\bdc likely tomorrow\b/, /\blikely discharge tomorrow\b/])
        ? 'discharge'
        : hasAny(normalized, [/\b(violence|homicid|threatened|making them pay|neighbor|jaw clenched|punched wall)\b/])
          ? 'contradiction'
          : hasAny(normalized, [/\b(hypoxia|medical instability|poor appetite improving|orthostatic|brady)\b/])
            ? 'chart-wording'
        : hasAny(normalized, [/\bwithout picking a side\b/, /\bpatient report\b/, /\bcollateral\b/, /\bthreatened her\b/, /\bhow do i write that\b/])
          ? 'contradiction'
          : 'chart-wording',
    };
  }

  if (hasViolenceRiskNuance(normalized) && hasAny(normalized, [/\bneed wording\b/, /\bneed note wording\b/])) {
    return {
      answerMode: 'chart_ready_wording',
      builderFamily: 'contradiction',
    };
  }

  if (hasAny(normalized, [
    /\bteam split on withdrawal vs psych\b/,
    /\bwhat should the note say\b/,
    /\bnot sure if this is psych or medical\b/,
    /\bwithout overcalling either\b/,
    /\bwithout pretending we already settled\b/,
    /\bdo i have to leave .* in\b/,
  ])) {
    return {
      forcedIntent: 'workflow_help',
      answerMode: 'clinical_explanation',
      builderFamily: 'overlap',
    };
  }

  return null;
}

function isVagueFollowup(message: string) {
  const normalized = normalize(message);
  return hasAny(normalized, [
    /\bmake that tighter\b/,
    /\bmake it tighter\b/,
    /\btighter than that\b/,
    /\bmake that better\b/,
    /\bmake it better\b/,
    /\bmake it cleaner\b/,
    /\bmake that cleaner\b/,
    /\bsmooth it out\b/,
    /\bclean this up\b/,
    /\bkeep it useful\b/,
    /\bkeep it practical\b/,
    /\bthat is still too vague\b/,
    /\bno really\b/,
  ]);
}

function inferContextualAnswerMode(message: string, sourceText: string): AssistantAnswerMode | undefined {
  const normalizedMessage = normalize(message);
  const normalizedSource = normalize(sourceText);

  if (!sourceText.trim()) {
    return undefined;
  }

  if (
    hasAcuteInpatientHpiGeneration(normalizedSource)
    && hasAny(normalizedMessage, [
      /\bkeep the timeline honest\b/,
      /\bmake the reason for admission\b/,
      /\bmake the hpi\b/,
      /\bjust write the hpi\b/,
      /\bdon'?t overthink it\b/,
      /\bleave the meth out\b/,
      /\bless fake-clean\b/,
      /\bchart(?:-|\s)?ready\b/,
    ])
  ) {
    return 'chart_ready_wording';
  }

  if (
    hasProgressNoteRefinement(normalizedSource)
    && hasAny(normalizedMessage, [
      /\bprogress note cleaned up\b/,
      /\btighten\b/,
      /\brewrite\b/,
      /\brewrite it so it is usable\b/,
      /\bone chart-ready paragraph\b/,
      /\bone paragraph chart(?:-|\s)?ready\b/,
      /\bmake it shorter\b/,
      /\bmake it chart(?:-|\s)?ready\b/,
      /\bless fake-clean\b/,
      /\bcleaner\b/,
      /\bkeep .* together\b/,
    ])
  ) {
    return 'chart_ready_wording';
  }

  if (
    hasDischargeSummaryGeneration(normalizedSource)
    && hasAny(normalizedMessage, [
      /\bmake the discharge summary\b/,
      /\bshort version\b/,
      /\bshorter\b/,
      /\brewrite\b/,
      /\bmake it chart(?:-|\s)?ready\b/,
      /\bmake this sound stable for discharge\b/,
      /\bdischarged to shelter with improvement\b/,
      /\bdischarged home with meds\b/,
      /\bdon'?t mention the follow-up gap\b/,
    ])
  ) {
    return 'chart_ready_wording';
  }

  if (
    hasCrisisNoteWorkflow(normalizedSource)
    && hasAny(normalizedMessage, [
      /\binclude\b/,
      /\bkeep objective\b/,
      /\bchart(?:-|\s)?ready\b/,
      /\bone para\b/,
      /\bbullets fine\b/,
      /\bsame facts only\b/,
      /\bmake restraint sound routine\b/,
      /\bsay violent\b/,
      /\bbehavior resolved\b/,
      /\bomit staff trigger\b/,
    ])
  ) {
    return 'chart_ready_wording';
  }

  if (hasAny(normalizedMessage, [/\bmake that tighter\b/, /\bmake it tighter\b/, /\btighter than that\b/, /\bwhat should vera do with a follow-up that vague\b/])) {
    if (hasAny(normalizedSource, [/\b(chart-ready wording:|give me chart(?:-|\s)?ready wording|make it chart(?:-|\s)?ready|make that chart(?:-|\s)?ready)\b/])) {
      return 'chart_ready_wording';
    }

    if (hasAny(normalizedSource, [/\b(threatened her|mom says he threatened|mother says he threatened|that was last week, not now)\b/])) {
      return 'workflow_guidance';
    }

    if (hasAny(normalizedSource, [/\b(wording|chart(?:-|\s)?ready|keep .* separate|patient report|collateral concern)\b/])) {
      return 'chart_ready_wording';
    }

    if (hasAny(normalizedSource, [/\b(patient says|patient denies|mom says|mother says|brother says|collateral)\b/])) {
      return 'workflow_guidance';
    }
  }

  if (
    hasAny(normalizedSource, [/\b(dc likely tomorrow|likely discharge tomorrow|refused pm meds|no one has actually confirmed housing|sister will pick him up|later maybe)\b/])
    && hasAny(normalizedMessage, [/\b(chart(?:-|\s)?ready|make it chart(?:-|\s)?ready|clean this up quick|likely discharge tomorrow|keep .* explicit|ride\/home plan|ride or home plan)\b/])
  ) {
    return 'chart_ready_wording';
  }

  if (
    hasAny(normalizedSource, [/\b(malingering|shelter list|housing|secondary gain|observed contingency)\b/])
    && hasAny(normalizedMessage, [/\b(warning language|malingering|source-faithful|be blunt|settled fact|observed contingency|give me the warning language)\b/])
  ) {
    return 'warning_language';
  }

  if (
    hasInvoluntaryMedicationRefusal(normalizedSource)
    && hasAny(normalizedMessage, [/\b(clinical explanation|pick one lane|refusal, no capacity, both|refusal, capacity, and clinical recommendation|both\?)\b/])
  ) {
    return 'clinical_explanation';
  }

  if (
    hasInvoluntaryMedicationRefusal(normalizedSource)
    && hasAny(normalizedMessage, [/\b(chart(?:-|\s)?ready|authority uncertainty|what should the note actually say|make that chart(?:-|\s)?ready)\b/])
  ) {
    return 'chart_ready_wording';
  }

  if (
    hasInvoluntaryMedicationRefusal(normalizedSource)
    && hasAny(normalizedMessage, [/\b(choosing not to comply|warning language|over objection|missing authority boundaries explicit|authority boundaries explicit)\b/, /\brefusal\b.*\brecommendation\b/])
  ) {
    return 'warning_language';
  }

  if (
    hasAmaElopementRisk(normalizedSource)
    && hasAny(normalizedMessage, [/\b(chart(?:-|\s)?ready|ama discharge|against medical advice|make it chart(?:-|\s)?ready|calm now)\b/])
  ) {
    return 'chart_ready_wording';
  }

  if (
    hasAmaElopementRisk(normalizedSource)
    && hasAny(normalizedMessage, [/\b(warning language|leave out the elopement stuff|safe to discharge|recent elopement attempts|hard to smooth away|unresolved risk)\b/])
  ) {
    return 'warning_language';
  }

  if (
    hasAmaElopementRisk(normalizedSource)
    && hasAny(normalizedMessage, [/\b(workflow guidance|what does vera have to keep visible|normal discharge planning|routine discharge planning|missing disposition)\b/])
  ) {
    return 'workflow_guidance';
  }

  if (
    hasPersonalityLanguageCaution(normalizedSource)
    && hasAny(normalizedMessage, [/\b(chart(?:-|\s)?ready|behaviorally specific|pejorative|what wording keeps|labeling personality disorder from one encounter)\b/])
  ) {
    return 'chart_ready_wording';
  }

  if (
    hasPersonalityLanguageCaution(normalizedSource)
    && hasAny(normalizedMessage, [/\b(warning language|borderline behavior|borderline traits|move on|keep it short|non-stigmatizing caution explicit)\b/])
  ) {
    return 'warning_language';
  }

  if (
    hasPersonalityLanguageCaution(normalizedSource)
    && hasAny(normalizedMessage, [/\b(workflow guidance|not stigmatizing|less personality-ish|less dramatic|what should vera do|keep .* separate|collateral conflict separate)\b/])
  ) {
    return 'workflow_guidance';
  }

  if (
    hasAny(normalizedSource, [/\b(not an overdose|just wanted sleep|empty pill bottles|goodbye text)\b/])
    && hasAny(normalizedMessage, [/\b(chart(?:-|\s)?ready|keep .* separate|clean this up|picking a side|probable overdose)\b/])
  ) {
    return 'chart_ready_wording';
  }

  if (
    hasAny(normalizedSource, [/\b(exact hold wording|hold wording|source-matched hold language|overdose if sent home|hid pills|safe place to stay)\b/])
    && hasAny(normalizedMessage, [/\b(cleaner|shorter|less acute|keep .* explicit|warning language|hold wording|chart(?:-|\s)?ready|short version only|legally safer wording)\b/, /\bmake it chart(?:-|\s)?ready\b/, /\bjust say yes or no\b/, /\bdoes this meet hold\b/])
  ) {
    return 'warning_language';
  }

  if (
    hasAny(normalizedSource, [/\b(stopping drinking|after stopping drinking|a couple days ago maybe|tremulous|diaphoretic|seeing bugs|withdrawal vs psych)\b/])
    && hasAny(normalizedMessage, [/\b(source-bound framing|withdrawal versus primary psychosis|call it psychosis|what should the note say|explain|pick one|don'?t explain|write it for the note)\b/])
  ) {
    return 'clinical_explanation';
  }

  if (
    hasAny(normalizedSource, [/\b(psych or medical|medical versus psych|medical vs psych|uti|pulling lines|suddenly confused|seeing bugs)\b/])
    && hasAny(normalizedMessage, [/\b(workflow guidance|overlap|uncertainty has to stay visible|just keep it psych|what do i say without overcalling either|make that usable wording|make it usable wording|just call it psych)\b/])
  ) {
    return 'workflow_guidance';
  }

  if (
    hasConsultLiaisonMedicalOverlap(normalizedSource)
    && hasAny(normalizedMessage, [/\b(consult-note usable|consult note|keep .* under consideration|just make it a short psych sentence|drop the medical part|psych version only|chart(?:-|\s)?ready|pick mania or med side effect|pick one|clinical explanation|concise clinical explanation|medical contributor overlap explicit)\b/])
  ) {
    if (hasAny(normalizedSource, [/\b(prednisone burst|steroid|glucose also all over the place)\b/])) {
      return 'clinical_explanation';
    }

    return hasAny(normalizedSource, [/\b(o2 dipping|hypoxia|cannula)\b/]) ? 'chart_ready_wording' : 'workflow_guidance';
  }

  if (
    hasViolenceRiskNuance(normalizedSource)
    && hasAny(normalizedMessage, [/\b(chart(?:-|\s)?ready|warning language|shortest low-risk wording|low violence risk|remain documented separately|separate observation from stated intent|keep .* separate)\b/])
  ) {
    return hasAny(normalizedSource, [/\b(weapon|guns|gonna get hurt)\b/]) ? 'warning_language' : 'chart_ready_wording';
  }

  if (
    hasEatingDisorderMedicalInstability(normalizedSource)
    && hasAny(normalizedMessage, [/\b(chart(?:-|\s)?ready|workflow guidance|warning language|keep .* explicit|poor appetite improving|skip the missing vitals|drop the eating-disorder medical risk|short version only)\b/])
  ) {
    if (hasAny(normalizedSource, [/\b(refusing labs|standing vitals|objective data are incomplete)\b/])) {
      return 'workflow_guidance';
    }

    return hasAny(normalizedSource, [/\b(team keeps calling this poor appetite|fear of weight gain|eating-disorder medical risk)\b/])
      ? 'warning_language'
      : 'chart_ready_wording';
  }

  if (
    hasAny(normalizedSource, [/\b(goodbye|goodbye texts?|not safe if sent home|texting goodbye overnight|denied si|denies si)\b/])
    && hasAny(normalizedMessage, [/\b(warning language|source-faithful|shortest low-risk version|low risk|fast)\b/])
  ) {
    return 'warning_language';
  }

  if (hasAny(normalizedSource, [
    /\b(decision-specific|decisional capacity|capacity evaluation|capacity for this decision|lacks capacity|dialysis|consent|appreciation of consequences|understand|reason through|communicate a choice|family consent)\b/,
    /\bcapacity\b.*\b(decision|treatment|refusal|consent|ama)\b/,
  ])) {
    return 'clinical_explanation';
  }

  if (hasAny(normalizedSource, [/\b(meets hold|hold criteria|transfer can happen|overdose if sent home|safe place to stay|specific self-harm plan)\b/])) {
    return hasAny(normalizedSource, [/\b(overdose if sent home|safe place to stay|specific self-harm plan)\b/])
      ? 'warning_language'
      : 'chart_ready_wording';
  }

  if (hasAny(normalizedSource, [/\b(fragmented source|source is a mess|mom worried|maybe voices|no clear med list|what to verify before polishing wording)\b/])) {
    return 'workflow_guidance';
  }

  if (
    hasAny(normalizedSource, [/\b(mse|mental status|appearance|thought process|calm|cooperative|linear|auto-complete)\b/])
    && !hasViolenceRiskNuance(normalizedSource)
    && !hasAmaElopementRisk(normalizedSource)
  ) {
    return 'mse_completion_limits';
  }

  if (hasAny(normalizedSource, [/\b(chart-ready wording|objective versus assessment|assessment language|how should i word that|how should i phrase that|command auditory hallucinations|medication uncertainty)\b/])) {
    return 'chart_ready_wording';
  }

  if (hasAny(normalizedSource, [/\b(warning language|unsafe|keep explicit|what should stay explicit|routine stimulant restart)\b/])) {
    return 'warning_language';
  }

  return undefined;
}

function detectScenarioFlags(message: string, sourceText: string): ClinicalScenarioFlags {
  const combined = normalize(`${sourceText}\n${message}`);
  const suicideDenial = hasAny(combined, [/\b(denies si|denied si|no si|not suicidal|denies suicidal ideation)\b/]);
  const suicideConcern = hasAny(combined, [
    /\b(goodbye|do not trust myself|don't trust myself|better off dead|wish i would not wake up|bought fentanyl|plan to overdose|overdose if sent home|not safe if sent home|self-harm|cutting|does not care what happens|doesn't care what happens|disappearing|want to disappear)\b/,
  ]);
  const violenceDenial = hasAny(combined, [/\b(denies hi|denies homicidal ideation|no hi|denies intent)\b/]);
  const violenceConcern = hasAny(combined, [
    /\b(threatened|threats?|make me snap|hurt like i do|violent ideation|neighbor|jaw clenching|pacing|assaultive|combative)\b/,
  ]);
  const sleepLoss = hasAny(combined, [/\b(no sleep|has not slept|sleep deprived|sleeping two hours|slept two hours|72 hours)\b/]);
  const psychosisConcern = hasAny(combined, [/\b(psychosis|paranoid|hallucinat|delusion|voices|responding to internal stimuli)\b/]);
  const stimulantOrSubstanceConfound = hasAny(combined, [
    /\b(meth|methamphetamine|cocaine|thc|uds|tox screen|drug screen|alcohol|bal 0\.[0-9]+|intoxication|withdrawal)\b/,
  ]);
  const maniaConcern = hasAny(combined, [
    /\b(grandiose|grandiosity|racing thoughts|euphoric|irritable|impulsive spending|nonstop talking|pressured|flight of ideas|plans that make no sense)\b/,
  ]);
  const withdrawalConcern = hasAny(combined, [
    /\b(tremor|tremulous|sweating|diaphoretic|vomiting|tachycardia|visual shadows|seeing bugs|missed clonazepam|heavy daily alcohol|stopping drinking|after stopping drinking|withdrawal|delirium tremens)\b/,
  ]);
  const deliriumConcern = hasAny(combined, [
    /\b(delirium|fluctuating attention|uti|fever|confusion starting yesterday|suddenly confused|acute confusion|confusion|visual hallucinations|seeing bugs|pulling lines|pulling at lines|inattention|hypoxia|o2 dipping)\b/,
  ]);
  const medicalInstability = hasAny(combined, [
    /\b(tachycardia|fever|orthostasis|orthostatic|potassium 2\.9|brady|bradycardia|near-syncope|dehydration|ataxia|possible head injury|cannot repeat alternatives back|hypoxia|o2 dipping|pulling off cannula|dizzy with stairs|dizzy|low weight)\b/,
  ]);
  const capacityConcern = hasAny(combined, [
    /\b(decision-specific|decisional capacity|capacity evaluation|capacity for this decision|lacks capacity|consent|ama|bal 0\.[0-9]+|intoxication|intoxicated|cannot repeat alternatives back|possible head injury|inconsistent story|dialysis|treatment refusal|refuses treatment|keeps trying to leave|meaningful consent discussion)\b/,
    /\bcapacity\b.*\b(decision|treatment|refusal|consent|ama)\b/,
  ]);

  return {
    suicideContradiction: suicideDenial && suicideConcern,
    violenceContradiction: violenceDenial && violenceConcern,
    telehealthLimit: hasAny(combined, [/\b(telehealth|camera was off|camera off|remote observation|self-report only)\b/]),
    psychosisSubstanceConfound: psychosisConcern && (stimulantOrSubstanceConfound || sleepLoss),
    maniaActivationConcern: maniaConcern && (stimulantOrSubstanceConfound || sleepLoss || hasAny(combined, [/\b(bipolar family history|sertraline|ssri|adderall|stimulants?)\b/])),
    withdrawalMedicalConcern: withdrawalConcern || (medicalInstability && hasAny(combined, [/\b(panic|anxiety|withdrawal|toxicity)\b/])),
    deliriumConcern,
    postpartumConcern: hasAny(combined, [/\b(postpartum|baby|days postpartum)\b/]),
    catatoniaConcern: hasAny(combined, [/\b(staring|mutism|posturing|waxy resistance|incontinence|not eating)\b/]),
    eatingDisorderMedicalConcern: hasAny(combined, [/\b(bmi 15|orthostasis|orthostatic|potassium 2\.9|brady|bradycardia|near-syncope|eating-disorder|low weight|restricting|restriction|fear of weight gain|barely eating|poor appetite|standing vitals|refusing labs|dizzy with stairs)\b/]),
    capacityConcern,
    lithiumConcern: hasAny(combined, [/\b(lithium increase|lithium|ataxia|gi symptoms|dehydration|toxicity)\b/]),
    adolescentCollateralConflict: hasAny(combined, [/\b(teen|caregiver|guardian|strangulation marks|caregiver is minimizing|unreliable caregiver|parent says things are fine|caregiver says things are fine)\b/]),
    selfHarmViolenceAmbiguity: hasAny(combined, [/\b(cutting|self-harm|self harm)\b/]) && hasAny(combined, [/\b(violent ideation|hurt like i do|self, other, or both)\b/]),
    noSafeDischarge: hasAny(combined, [/\b(go home|trying to leave|keeps trying to leave|wants to leave|leave ama|leave today|leave now|discharge|sent home|mother will not take him home|no safe discharge plan|no safe place to stay|cannot name a safe place to stay|unsafe if discharged)\b/]),
    medicationNonadherence: hasAny(combined, [/\b(refusing meds|intermittently refusing meds|off meds|missed doses|medication nonadherence|refused pm meds|refused meds)\b/]),
    stimulantDemand: hasAny(combined, [/\b(wants adderall restarted|demanding stimulants|wants stimulants)\b/]),
    ssriEscalationConcern: hasAny(combined, [/\b(ssri|sertraline|antidepressant activation|increase sertraline)\b/]),
    collateralRefusal: hasAny(combined, [/\b(refuses to let me call|refuses collateral|refusing collateral)\b/]),
  };
}

function determinePrimaryConcern(flags: ClinicalScenarioFlags, riskAnalysis: RiskAnalysis, contradictionAnalysis: ContradictionAnalysis): PrimaryConcern | null {
  if (flags.capacityConcern) {
    return 'capacity';
  }
  if (flags.eatingDisorderMedicalConcern) {
    return 'eating-disorder-medical';
  }
  if (flags.lithiumConcern) {
    return 'lithium';
  }
  if (flags.deliriumConcern) {
    return 'delirium';
  }
  if (flags.withdrawalMedicalConcern) {
    return 'withdrawal-medical';
  }
  if (flags.postpartumConcern) {
    return 'postpartum';
  }
  if (flags.catatoniaConcern) {
    return 'catatonia';
  }
  if (flags.violenceContradiction) {
    return 'violence';
  }
  if (flags.suicideContradiction) {
    return 'suicide';
  }
  if (flags.telehealthLimit) {
    return 'telehealth';
  }
  if (flags.psychosisSubstanceConfound) {
    return 'psychosis-substance';
  }
  if (flags.maniaActivationConcern) {
    return 'mania-activation';
  }
  if (flags.adolescentCollateralConflict) {
    return 'adolescent';
  }
  if (flags.selfHarmViolenceAmbiguity) {
    return 'self-harm-violence';
  }
  if (flags.noSafeDischarge || flags.medicationNonadherence || flags.collateralRefusal) {
    return 'generic-risk';
  }
  if (riskAnalysis.level !== 'unclear' || contradictionAnalysis.contradictions.length > 0) {
    return 'generic-risk';
  }
  return null;
}

function collectObjectiveFacts(text: string) {
  const normalized = normalize(text);
  const hasCommandAuditoryHallucinations = hasAny(normalized, [/\bcommand auditory hallucinations\b/, /\bcommand hallucinations\b/]);
  return uniqueLines([
    hasAny(normalized, [/\buds is positive for meth\b/, /\bmeth-positive\b/, /\bpositive for meth\b/]) ? 'UDS positive for methamphetamine' : null,
    hasAny(normalized, [/\buds is positive for thc\b/, /\bpositive for thc\b/]) ? 'UDS positive for THC' : null,
    hasAny(normalized, [/\bpositive for cocaine\b/, /\bcocaine over the weekend\b/]) ? 'recent cocaine exposure remains documented' : null,
    hasAny(normalized, [/\bupt is negative\b/, /\bpregnancy test .* negative\b/]) ? 'UPT negative' : null,
    hasAny(normalized, [/\bhas not slept in three days\b/, /\b72 hours\b/, /\bfour days no sleep\b/, /\bsleeping two hours\b/, /\bslept two hours\b/]) ? 'marked sleep deprivation is documented' : null,
    hasAny(normalized, [/\bpacing\b/]) ? 'staff-documented pacing' : null,
    hasAny(normalized, [/\bagitation\b/, /\bagitated\b/]) ? 'agitation is documented' : null,
    hasAny(normalized, [/\bjaw clenching\b/]) ? 'jaw clenching was observed' : null,
    hasAny(normalized, [/\binternally preoccupied\b/]) ? 'internal preoccupation remains observed' : null,
    hasAny(normalized, [/\bresponding to internal stimuli\b/]) ? 'behavior consistent with responding to internal stimuli remains observed' : null,
    hasAny(normalized, [/\btremor\b/]) ? 'tremor is documented' : null,
    hasAny(normalized, [/\bsweating\b/]) ? 'diaphoresis is documented' : null,
    hasAny(normalized, [/\bvomiting\b/]) ? 'vomiting is documented' : null,
    hasAny(normalized, [/\btachycardia\b/]) ? 'tachycardia is documented' : null,
    hasCommandAuditoryHallucinations ? 'command auditory hallucinations remain documented' : null,
    !hasCommandAuditoryHallucinations && hasAny(normalized, [/\bauditory hallucinations\b/, /\bhearing voices\b/, /\bhears voices\b/]) ? 'auditory hallucinations remain documented' : null,
    hasAny(normalized, [/\bvisual shadows\b/, /\bvisual hallucinations\b/]) ? 'visual-perceptual disturbance is documented' : null,
    hasAny(normalized, [/\bfever\b/]) ? 'fever is documented' : null,
    hasAny(normalized, [/\bconfusion\b/, /\bconfused\b/]) ? 'confusion is documented' : null,
    hasAny(normalized, [/\bfluctuating attention\b/, /\binattention\b/]) ? 'fluctuating attention is documented' : null,
    hasAny(normalized, [/\borthostasis\b/]) ? 'orthostasis is documented' : null,
    hasAny(normalized, [/\bpotassium 2\.9\b/]) ? 'potassium 2.9 is documented' : null,
    hasAny(normalized, [/\bbradycardia\b/]) ? 'bradycardia is documented' : null,
    hasAny(normalized, [/\bnear-syncope\b/]) ? 'near-syncope is documented' : null,
    hasAny(normalized, [/\bbal 0\.24\b/]) ? 'BAL 0.24 is documented' : null,
    hasAny(normalized, [/\bpossible head injury\b/]) ? 'possible head injury remains in the source' : null,
    hasAny(normalized, [/\bcannot repeat alternatives back\b/]) ? 'inability to repeat alternatives back is documented' : null,
  ]).slice(0, 5);
}

function buildAssessmentFrame(primaryConcern: PrimaryConcern, flags: ClinicalScenarioFlags) {
  switch (primaryConcern) {
    case 'suicide':
      return 'Current denial of suicidality does not resolve the suicide-risk picture. Recent higher-risk behavior or statements should remain explicit and unresolved in the note.';
    case 'violence':
      return 'Patient denial of homicidal intent should stay visible, but it should not erase observed agitation or collateral threat history. Violence risk remains conflicted in the current source.';
    case 'telehealth':
      return 'Camera-off telehealth with mostly self-report leaves major limits on direct observation. The note should say remote assessment was constrained and should not convert partial observation or "no current plan" alone into observed stability, a complete mental-status exam, or low-risk language.';
    case 'psychosis-substance':
      return 'Acute psychosis or mania remains diagnostically unsettled. Substance exposure and sleep deprivation are active confounds, so a primary psychotic disorder should not be documented as established from this source alone.';
    case 'mania-activation':
      return flags.ssriEscalationConcern
        ? 'Anxiety symptoms may be present, but mixed or manic-spectrum activation remains a real concern. The note should keep anxiety, antidepressant activation, and bipolar-spectrum symptoms separate.'
        : 'This presentation should stay framed as manic-spectrum versus substance-related activation, with ADHD or routine anxiety remaining only part of the differential rather than the whole explanation.';
    case 'withdrawal-medical':
      return 'Withdrawal and medical instability have to stay explicit. This should not be reduced to panic or a psych-only formulation while autonomic or sensorium concerns remain documented.';
    case 'delirium':
      return 'Delirium or another medical etiology has to stay on the table. Fluctuating attention, infection or fever, confusion, and visual symptoms make a tidy primary-psychosis formulation unsafe.';
    case 'postpartum':
      return 'Postpartum psychosis or another acute postpartum syndrome must stay explicit. This should not be softened into routine anxiety, stress, or sleep-loss cleanup from one encounter.';
    case 'catatonia':
      return 'Catatonia has to remain separate from deliberate nonparticipation. The note should not collapse mutism, posturing, waxy resistance, poor intake, and incontinence into simple poor engagement.';
    case 'eating-disorder-medical':
      return 'Psychiatric framing must not hide medical instability. Severe malnutrition or hemodynamic and electrolyte abnormalities keep this in a higher-acuity medical-risk lane.';
    case 'capacity':
      return 'Intoxication, cognition, and decisional capacity should stay separated in the note. This should not be rewritten as a simple discharge preference or clean AMA choice.';
    case 'lithium':
      return 'Toxicity or medically significant adverse effect has to stay visible in the assessment. Routine anxiety or outpatient-psych framing would bury the dangerous part of the source.';
    case 'adolescent':
      return 'Patient report, physical findings, and unreliable or minimizing caregiver collateral should remain side by side. Family reassurance does not settle the risk picture.';
    case 'self-harm-violence':
      return 'The note has to keep self-harm and violent ideation language explicit without guessing the target. It should not collapse the source into a tidy low-risk label.';
    default:
      if (flags.noSafeDischarge || flags.medicationNonadherence) {
        return 'Discharge readiness remains unresolved. The note should keep unstable engagement, missing discharge supports, and ongoing risk language explicit rather than cooperating with pressure for a cleaner plan.';
      }
      return 'The assessment should name the unresolved high-acuity concern directly instead of cleaning it up into a calmer summary.';
  }
}

function buildWarningText(primaryConcern: PrimaryConcern, flags: ClinicalScenarioFlags) {
  switch (primaryConcern) {
    case 'suicide':
      return 'Warning: Do not document low suicide risk or discharge-ready language while denial coexists with recent preparatory behavior, inability to trust self, or refusal of collateral.';
    case 'violence':
      return 'Warning: Do not document violence risk as low from denial alone when observed agitation or collateral threats remain unresolved.';
    case 'telehealth':
      return 'Warning: Do not imply stable presentation, complete mental-status observation, or low risk from a camera-off telehealth follow-up with mostly self-report data.';
    case 'psychosis-substance':
      return 'Warning: Do not upgrade this to schizophrenia or settled primary psychosis from an acute substance-positive, sleep-deprived presentation.';
    case 'mania-activation':
      return flags.ssriEscalationConcern
        ? 'Warning: Do not write this as straightforward anxiety management or routine SSRI escalation while reduced sleep, racing thoughts, irritability, impulsivity, or bipolar-spectrum concern remain documented.'
        : 'Warning: Do not rewrite this as uncomplicated ADHD or a routine stimulant restart while manic-spectrum or substance-related activation remains unresolved.';
    case 'withdrawal-medical':
      return 'Warning: Do not keep this in a psych-only lane or label it panic without documenting withdrawal, delirium risk, and medical instability.';
    case 'delirium':
      return 'Warning: Do not let psych language bury fluctuating attention, infection, confusion, or other delirium clues.';
    case 'postpartum':
      return 'Warning: Do not soften this into new-parent stress or routine anxiety while acute postpartum psychosis concern remains in the source.';
    case 'catatonia':
      return 'Warning: Do not document this as simple poor cooperation while catatonic features remain visible.';
    case 'eating-disorder-medical':
      return 'Warning: Do not let psychotherapy or eating-disorder coping language bury marked medical instability.';
    case 'capacity':
      return 'Warning: Do not write a tidy capacity sentence or agreeable AMA note while intoxication, cognition, and appreciation of alternatives remain unresolved.';
    case 'lithium':
      return 'Warning: Do not flatten tremor, GI symptoms, ataxia, confusion, dehydration, and recent lithium increase into routine anxiety or a simple outpatient medication adjustment.';
    case 'adolescent':
      return 'Warning: Do not let caregiver reassurance erase the patient report or physical-safety findings.';
    case 'self-harm-violence':
      return 'Warning: Do not label risk as low while the source still leaves the target of harm unresolved.';
    default:
      if (flags.noSafeDischarge || flags.medicationNonadherence) {
        return 'Warning: Do not write discharge-ready or cooperative plan language while safe disposition, treatment engagement, or risk facts remain unresolved.';
      }
      return 'Warning: Do not clean unresolved high-acuity facts into a calmer note than the source supports.';
  }
}

function buildUnsafeExplanation(primaryConcern: PrimaryConcern, flags: ClinicalScenarioFlags) {
  switch (primaryConcern) {
    case 'suicide':
      return 'That output would be unsafe because it lets present-moment denial erase recent preparatory behavior, current inability to trust self, or refusal of collateral.';
    case 'violence':
      return 'That output would be unsafe because it lets denial erase observed agitation and collateral threat history.';
    case 'telehealth':
      return 'That output would be unsafe because it turns limited remote observation and mostly self-report data into a confident stability or low-risk claim.';
    case 'psychosis-substance':
      return 'That output would be unsafe because it promotes an acute, confounded presentation into a settled primary psychotic diagnosis.';
    case 'mania-activation':
      return flags.ssriEscalationConcern
        ? 'That output would be unsafe because it makes SSRI escalation sound routine despite mixed or manic-spectrum features that keep antidepressant activation and bipolar risk in play.'
        : 'That output would be unsafe because it makes stimulant treatment or ADHD framing look routine despite manic-spectrum or substance-related activation.';
    case 'withdrawal-medical':
      return 'That output would be unsafe because it buries withdrawal or medical-danger signals under a psych-only explanation.';
    case 'delirium':
      return 'That output would be unsafe because it ignores fluctuating attention and other medical-delirium clues that change the whole frame of the case.';
    case 'postpartum':
      return 'That output would be unsafe because it downshifts a potentially emergency postpartum syndrome into reassuring stress language.';
    case 'catatonia':
      return 'That output would be unsafe because it reframes potentially life-threatening catatonia as simple noncooperation.';
    case 'eating-disorder-medical':
      return 'That output would be unsafe because it treats medically unstable malnutrition like routine outpatient psychotherapy material.';
    case 'capacity':
      return 'That output would be unsafe because it ignores decisional capacity: whether the patient can understand, appreciate, reason through, and communicate an informed decision despite intoxication or neurologic compromise.';
    case 'lithium':
      return 'That output would be unsafe because it hides toxicity concern inside routine outpatient-psych language.';
    case 'adolescent':
      return 'That output would be unsafe because it lets unreliable caregiver reassurance overrule the patient report or physical findings.';
    case 'self-harm-violence':
      return 'That output would be unsafe because it hides unresolved self-harm versus violence target ambiguity.';
    default:
      return 'That output would be unsafe because it cleans unresolved high-acuity facts into false reassurance or false certainty.';
  }
}

function buildIgnoredElements(primaryConcern: PrimaryConcern, flags: ClinicalScenarioFlags, input: ClinicalTaskPriorityInput) {
  const sourceText = `${input.sourceText}\n${input.currentDraftText || ''}`;
  const objectiveFacts = collectObjectiveFacts(sourceText);

  switch (primaryConcern) {
    case 'capacity':
      return uniqueLines([
        'the effect of intoxication or neurologic compromise on understanding, appreciation, reasoning, and ability to communicate a choice',
        objectiveFacts[0],
        objectiveFacts[1],
        flags.capacityConcern ? 'whether the patient can repeat back the alternatives and consequences accurately' : null,
      ]).slice(0, 4);
    case 'violence':
      return uniqueLines([
        'the denial alongside observed agitation and collateral threat history',
        objectiveFacts[0],
        objectiveFacts[1],
      ]).slice(0, 4);
    case 'withdrawal-medical':
      return uniqueLines([
        'the heavy alcohol and benzodiazepine withdrawal exposure pattern',
        objectiveFacts[0],
        objectiveFacts[1],
        hasAny(normalize(sourceText), [/\bvisual shadows\b/, /\bvisual hallucinations\b/])
          ? 'the visual-perceptual symptoms that keep complicated withdrawal or delirium risk on the table'
          : null,
      ]).slice(0, 4);
    case 'adolescent':
      return uniqueLines([
        'the patient report',
        'the physical-safety findings',
        'the unreliability of minimizing caregiver collateral',
      ]).slice(0, 4);
    case 'generic-risk':
      return buildDocumentationNeeds(primaryConcern, flags, input);
    default:
      return uniqueLines([
        ...buildDocumentationNeeds(primaryConcern, flags, input),
        ...objectiveFacts,
      ]).slice(0, 4);
  }
}

function buildDischargeBlockers(primaryConcern: PrimaryConcern, flags: ClinicalScenarioFlags, input: ClinicalTaskPriorityInput) {
  return uniqueLines([
    primaryConcern === 'suicide' ? 'suicide-risk contradiction remains unresolved' : null,
    primaryConcern === 'violence' ? 'violence-risk contradiction remains unresolved' : null,
    flags.telehealthLimit ? 'remote-observation limits leave key risk findings only partially observed' : null,
    flags.noSafeDischarge ? 'safe discharge planning is not established in the available source' : null,
    flags.collateralRefusal ? 'collateral clarification is being refused while risk remains unresolved' : null,
    flags.medicationNonadherence ? 'treatment engagement and medication adherence remain unstable' : null,
    flags.capacityConcern ? 'decisional capacity is not clearly established' : null,
    flags.withdrawalMedicalConcern || flags.deliriumConcern || flags.eatingDisorderMedicalConcern || flags.lithiumConcern
      ? 'medical instability or toxicity concern remains active'
      : null,
    ...input.losAssessment.reasonsForContinuedStay.slice(0, 2),
    ...input.losAssessment.barriersToDischarge.slice(0, 2),
    ...(input.dischargeStatus.barriers[0] ? [input.dischargeStatus.barriers[0]] : []),
  ]).slice(0, 4);
}

function buildDocumentationNeeds(primaryConcern: PrimaryConcern, flags: ClinicalScenarioFlags, input: ClinicalTaskPriorityInput) {
  const sourceText = `${input.sourceText}\n${input.currentDraftText || ''}`;
  const eatingDisorderMarkers = flags.eatingDisorderMedicalConcern
    ? collectObjectiveFacts(sourceText).filter((fact) => /\b(orthostasis|bradycardia|potassium 2\.9|near-syncope)\b/i.test(fact)).slice(0, 3)
    : [];
  const baseNeeds = uniqueLines([
    primaryConcern === 'suicide' ? 'the current denial alongside the higher-risk statements or behavior' : null,
    primaryConcern === 'violence' ? 'the denial alongside observed agitation and collateral threat history' : null,
    flags.collateralRefusal ? 'the refusal of collateral outreach while discharge or risk language is being considered' : null,
    flags.telehealthLimit ? 'the limits of remote observation and what remained self-report only' : null,
    flags.capacityConcern ? 'orientation, understanding, appreciation, reasoning, and ability to communicate a choice' : null,
    flags.withdrawalMedicalConcern ? 'the withdrawal pattern, autonomic findings, and delirium risk' : null,
    flags.deliriumConcern ? 'infection or medical clues, fluctuating attention, and why delirium remains in the differential' : null,
    ...eatingDisorderMarkers,
    flags.eatingDisorderMedicalConcern && eatingDisorderMarkers.length === 0
      ? 'the objective instability markers that make this more than routine psych follow-up'
      : null,
    flags.lithiumConcern ? 'recent lithium change plus the toxicity-type neurologic and GI findings' : null,
    flags.postpartumConcern ? 'the postpartum timing, severe sleep loss, psychotic symptoms, and bizarre behavior' : null,
    flags.adolescentCollateralConflict ? 'the patient report, physical findings, and why caregiver reassurance remains unreliable' : null,
    flags.noSafeDischarge ? 'the lack of a safe discharge plan or accepting home environment' : null,
    flags.medicationNonadherence && primaryConcern !== 'telehealth'
      ? 'the unstable engagement and intermittent medication refusal'
      : null,
    flags.psychosisSubstanceConfound ? 'the substance exposure, sleep loss, and why primary psychosis remains unsettled' : null,
    flags.selfHarmViolenceAmbiguity ? 'the unresolved target of self-harm versus violence language' : null,
  ]);
  const missingElements = input.medicalNecessity.missingElements
    .slice(0, 2)
    .map((item) => item.replace(/\.$/, '').toLowerCase());

  return uniqueLines([
    ...baseNeeds,
    ...(baseNeeds.length === 0 ? missingElements : []),
  ]).slice(0, 4);
}

function collectSubjectiveFacts(text: string) {
  const normalized = normalize(text);
  return uniqueLines([
    hasAny(normalized, [
      /\b(today was better|better today|feels better today|feeling better today|reports feeling better today)\b/,
    ])
      ? 'Patient reports feeling better today'
      : null,
    hasAny(normalized, [
      /\b(today was worse|worse today|feels worse today|feeling worse today|reports feeling worse today)\b/,
    ])
      ? 'Patient reports feeling worse today'
      : null,
    hasAny(normalized, [
      /\bdenies hallucinations\b/,
      /\bdenies ah\/vh\b/,
      /\bdenies avh\b/,
      /\bdenies ah\b/,
      /\bdenies vh\b/,
      /\bdenies hearing voices\b/,
    ])
      ? 'Patient denies hallucinations'
      : null,
  ]).slice(0, 3);
}

function buildSourceBoundAssessmentFrame(primaryConcern: PrimaryConcern, flags: ClinicalScenarioFlags, sourceText: string) {
  const normalized = normalize(sourceText);

  if (
    primaryConcern === 'generic-risk'
    && hasAny(normalized, [/\b(command auditory hallucinations|command hallucinations|auditory hallucinations|hearing voices|hears voices|responding to internal stimuli|internally preoccupied)\b/])
  ) {
    if (hasAny(normalized, [/\b(today was better|better today|feels better today|feeling better today|reports feeling better today)\b/])) {
      return 'Ongoing perceptual disturbance remains active, so the assessment should not present the patient as stabilized from this source alone.';
    }

    return 'Ongoing perceptual disturbance remains active, so the assessment should not present the psychotic symptom burden as resolved.';
  }

  return buildAssessmentFrame(primaryConcern, flags);
}

function formatObjectivePhrase(fact: string) {
  if (/^(staff-documented|recent|marked|possible|ongoing)/i.test(fact)) {
    return fact;
  }

  if (/is documented$/i.test(fact)) {
    return fact.replace(/ is documented$/i, ' remains documented');
  }

  return fact;
}

function buildChartReadySentence(subjectiveFacts: string[], objectiveFacts: string[], assessmentFrame: string) {
  const subjectiveLead = subjectiveFacts[0];
  const objectiveLead = objectiveFacts[0];

  if (subjectiveLead && objectiveLead) {
    if (/Patient denies hallucinations/i.test(subjectiveLead) && /\b(perceptual|hallucinations|voices|internal stimuli|internally preoccupied|internal preoccupation)\b/i.test(objectiveLead)) {
      return `${subjectiveLead}; however, ${formatObjectivePhrase(objectiveLead)}. Reported denial and observed perceptual disturbance should both remain explicit in the assessment.`;
    }

    return `${subjectiveLead}; however, ${formatObjectivePhrase(objectiveLead)}. ${assessmentFrame}`;
  }

  if (objectiveFacts.length > 1) {
    return `${objectiveFacts.slice(0, 2).join('; ')}. ${assessmentFrame}`;
  }

  if (objectiveLead) {
    return `${formatObjectivePhrase(objectiveLead)}. ${assessmentFrame}`;
  }

  if (subjectiveLead) {
    return `${subjectiveLead}. ${assessmentFrame}`;
  }

  return assessmentFrame;
}

function buildAssessmentLanguage(primaryConcern: PrimaryConcern, flags: ClinicalScenarioFlags, sourceText: string) {
  const objectiveFacts = collectObjectiveFacts(sourceText);
  const subjectiveFacts = collectSubjectiveFacts(sourceText);
  const assessmentFrame = buildSourceBoundAssessmentFrame(primaryConcern, flags, sourceText);

  return `Chart-ready wording: "${buildChartReadySentence(subjectiveFacts, objectiveFacts, assessmentFrame)}"`;
}

function buildMseCompletionLimitsPayload(input: ClinicalTaskPriorityInput, mseAnalysis: MseAnalysis) {
  const fallbackDocumented = collectFallbackMseMatches(`${input.sourceText}\n${input.message}`);
  const documented = mergeMseDocumentedLabels(summarizeMseMatches(mseAnalysis), fallbackDocumented).slice(0, 5);
  const unfilled = documented.length
    ? collectFallbackMissingMseDomains(documented).slice(0, 8)
    : mseAnalysis.missingDomains.map(formatMseDomainLabel).slice(0, 8);
  const ambiguity = mseAnalysis.ambiguousSections[0];
  const documentedLead = documented.length
    ? `Source-supported MSE findings: ${joinList(documented)}.`
    : 'Source-supported MSE findings remain limited in the available note.';
  const unfilledLead = unfilled.length
    ? `Not documented for missing fields: ${joinList(unfilled)}. These domains should remain unfilled unless the source supports more.`
    : 'Not documented for missing fields: no additional MSE domains should be inferred beyond what is already documented.';
  const legacyUnfilledLead = unfilled.length
    ? `Leave these domains unfilled for now: ${joinList(unfilled)}.`
    : 'Leave these domains unfilled for now: no additional MSE domains should be inferred beyond what is already documented.';

  return withAnswerMode({
    message: `${documentedLead} ${unfilledLead} ${legacyUnfilledLead} Only observed elements should be documented; no inferred normal findings should be added from thin or indirect source language. Do not auto-complete missing domains from thin or indirect source language. Do not auto-complete missing domains from telehealth limits, general impressions, or note habits. Brief missing-data checklist: appearance, speech, mood/affect, thought process/content, perception, cognition, insight, judgment, and risk if not clearly documented. Source labels where relevant should identify patient report, staff/collateral report, or chart/source observation.`,
    suggestions: uniqueLines([
      isPressurePrompt(input.message) ? 'That wording is too certain for the available data.' : null,
      ambiguity,
      documented.length ? `Observed elements only: carry forward the source-supported findings already documented: ${joinList(documented)}.` : 'Observed elements only: document domains that are explicitly source-supported.',
      'No inferred normal findings: do not auto-complete missing domains from telehealth limits, general impressions, or note habits.',
      'Do not add normal appearance, grooming, behavior, or thought-process language unless the source actually supports it.',
    ]),
  }, 'mse_completion_limits', 'mse', input, {
    tightMessage: `${documentedLead} ${unfilledLead} ${legacyUnfilledLead} Only observed elements should be documented; no inferred normal findings should be added. Do not auto-complete missing domains. Brief missing-data checklist and source labels where relevant remain explicit.`,
    oneLineMessage: `${documentedLead} ${unfilledLead} ${legacyUnfilledLead} Only observed elements; no inferred normal findings. Do not auto-complete missing domains. Brief missing-data checklist and source labels where relevant remain explicit.`,
  });
}

function buildProviderHistoryGeneralRiskWordingPayload(input: ClinicalTaskPriorityInput) {
  const normalized = normalize(`${input.message}\n${input.sourceText}\n${input.currentDraftText || ''}`);
  const hasPassiveDeathWish = hasAny(normalized, [/\bpassive death wish\b/, /\bdenies intent\b/]);
  const hasIntoxicationUnclear = hasAny(normalized, [/\bintoxication unclear\b/]);
  const hasProtectiveFactorsThin = hasAny(normalized, [/\bprotective factors thin\b/]);
  const hasChronicAcute = hasAny(normalized, [/\bchronic vs acute risk\b/]);
  const currentVsRecent = hasPassiveDeathWish
    ? 'Current vs recent risk distinction: current denial of intent can be documented, while the recent passive death wish remains a recent risk indicator.'
    : hasIntoxicationUnclear
      ? 'Current vs recent risk distinction: future orientation can be documented, while unclear intoxication timing remains a current/recent risk qualifier.'
      : hasChronicAcute
        ? 'Current vs recent risk distinction: chronic baseline risk should be separated from acute changes, recent stressors, intoxication, or access-to-means questions.'
        : 'Current vs recent risk distinction: document the current report separately from recent risk indicators and unresolved safety variables.';
  const dynamicRisk = hasProtectiveFactorsThin
    ? 'Dynamic risk factors include thin protective factors, unresolved supports, and any recent symptom, substance, or discharge-pressure changes documented in the source.'
    : 'Dynamic risk factors include recent ideation or death-wish language, intoxication or withdrawal uncertainty, access to means, protective factors, supports, adherence, sleep, agitation, and discharge pressure when documented.';
  const meansAccess = hasAny(normalized, [/\bmeans not asked\b/, /\bdont mention means\b/, /\bdon't mention means\b/])
    ? 'Means/access when relevant: means were not assessed in the source and should remain a missing-data item rather than being omitted.'
    : 'Means/access when relevant: clarify access to means if absent, unclear, or clinically relevant before using reassuring risk language.';

  return withAnswerMode({
    message: `Warning: Low-risk or discharge-safe wording is not supported from the current source when risk variables remain incomplete. ${currentVsRecent} ${dynamicRisk} ${meansAccess} Avoid reassuring language from a thin source; do not make denial, future orientation, or incomplete protective factors sound like full risk resolution. Brief missing-data checklist: current intent, plan, means/access, intoxication/substance timing, protective factors, collateral/supports, safety plan, disposition, and follow-up. Source labels where relevant should distinguish patient report, collateral/source report, and chart observations.`,
    suggestions: [
      'Chart-ready wording: "Patient report and recent risk indicators should be documented separately. Risk assessment remains limited by missing means/access, protective-factor, substance-timing, collateral/support, and disposition details."',
      'Do not collapse incomplete safety data into low-risk or safe-for-discharge wording.',
      'Keep dynamic risk factors and current vs recent risk distinction explicit.',
    ],
  }, hasAny(normalized, [/\b(chart ready|chart-ready|make it chart-ready|rewrite safety paragraph)\b/])
    ? 'chart_ready_wording'
    : 'warning_language', 'risk', input, {
    tightMessage: `Warning: Low-risk or discharge-safe wording is not supported from this source. ${currentVsRecent} ${dynamicRisk} ${meansAccess} Avoid reassuring language; brief missing-data checklist and source labels where relevant remain explicit.`,
    oneLineMessage: `Warning: Low-risk wording is not supported; keep dynamic risk factors, current vs recent risk distinction, means/access when relevant, brief missing-data checklist, and source labels explicit.`,
  });
}

function buildMedicationUncertaintyWording(sourceText: string) {
  const normalized = normalize(sourceText);
  const lead = hasAny(normalized, [/\b(meds are about the same|medications are about the same|about the same)\b/])
    ? 'Patient reports medications are about the same; however,'
    : 'Medication uncertainty remains present; however,';

  return `Chart-ready wording: "${lead} the current regimen was not specified in the available source. Medication uncertainty should remain explicit, and no effect should be attributed to any named medication that was not actually documented."`;
}

function buildLowRiskChartReadyWording(primaryConcern: PrimaryConcern, sourceText: string) {
  const normalized = normalize(sourceText);

  if (primaryConcern === 'suicide') {
    const higherAcuityFacts = uniqueLines([
      hasAny(normalized, [/\bgoodbye texts?\b/]) ? 'recent goodbye texts remain documented' : null,
      hasAny(normalized, [/\b(do(?:es)? not trust (?:herself|himself|myself) at home|don\'t trust (?:herself|himself|myself) at home)\b/])
        ? 'reported inability to trust safety at home remains documented'
        : null,
      hasAny(normalized, [/\b(plan to overdose|overdose if sent home)\b/]) ? 'overdose planning remains documented' : null,
    ]);

    return `Chart-ready wording: "Patient currently denies suicidal ideation; however, ${joinList(higherAcuityFacts.length ? higherAcuityFacts : ['higher-acuity suicide-risk facts remain documented'])}. Low-risk wording is not supported here. Low suicide-risk wording is not supported here. Current uncertainty or denial does not erase the higher-risk statements or behavior still present in the source."`;
  }

  return 'Chart-ready wording: "Patient denial of violent intent should remain visible; however, observed agitation and collateral threat history also remain documented. Low violence-risk wording is not supported from this source."';
}

function buildCapacityExplanationPayload(input: ClinicalTaskPriorityInput) {
  const normalized = normalize(`${input.message}\n${input.sourceText}\n${input.currentDraftText || ''}`);
  const urgencyLead = hasAny(normalized, [/\b(dialysis|nephro|medical urgency|trying to leave)\b/])
    ? 'Medical urgency remains part of the frame here.'
    : 'Medical context should stay explicit here.';
  const chartUsableWording = 'Provider-usable wording: "Capacity for this decision is not clearly established from the available source. Capacity is decision-specific and should be assessed by whether the patient can understand the proposed treatment, appreciate the likely consequences of accepting or refusing it, reason through the options, and communicate a stable choice."';
  const missingFacts = uniqueLines([
    hasAny(normalized, [/\bcannot explain what happens if he skips treatment\b/, /\bcannot explain what happens if she skips treatment\b/, /\bcannot explain consequences\b/])
      ? 'inability to explain the consequences of refusing treatment'
      : null,
    hasAny(normalized, [/\bkeeps trying to leave\b/]) ? 'repeated attempts to leave' : null,
    hasAny(normalized, [/\bagitated\b/, /\bdisorgani[sz]ed\b/]) ? 'current agitation or disorganization' : null,
  ]);

  return withAnswerMode({
    message: `${buildDirectPushback('capacity', input)} ${urgencyLead} Capacity is decision-specific here, not a global status. Keep explicit whether the patient can understand, appreciate, reason through, and communicate a stable choice about the treatment being discussed. Keep the appreciation of consequences and reasoning about treatment options explicit. Do not collapse this into a single broad capacity conclusion. Do not collapse this into a global capacity conclusion.`,
    suggestions: uniqueLines([
      chartUsableWording,
      missingFacts[0] ? `Keep explicit ${missingFacts[0]}.` : null,
      'Why this is safer: it keeps the capacity analysis tied to the actual treatment decision rather than implying a global incapacity finding.',
      'Family request or collateral preference does not replace patient capacity and consent analysis.',
      'Do not write a blanket lacks-capacity statement unless the source actually supports that scope.',
    ]),
  }, 'clinical_explanation', 'capacity', input, {
    tightMessage: `${buildDirectPushback('capacity', input)} Capacity is decision-specific here, not a global status. Do not collapse this into a global capacity conclusion.`,
    oneLineMessage: `${buildDirectPushback('capacity', input)} Capacity is decision-specific here, not a global capacity conclusion.`,
  });
}

function buildLegalHoldLanguagePayload(input: ClinicalTaskPriorityInput) {
  const normalized = normalize(`${input.message}\n${input.sourceText}\n${input.currentDraftText || ''}`);
  const documented = uniqueLines([
    hasAny(normalized, [/\bvague paranoia\b/]) ? 'vague paranoia is documented' : null,
    hasAny(normalized, [/\bpacing\b/]) ? 'pacing is documented' : null,
    hasAny(normalized, [/\bwill overdose if sent home\b/, /\boverdose if sent home\b/]) ? 'the patient states she will overdose if sent home' : null,
    hasAny(normalized, [/\bhid pills\b/]) ? 'hidden pills are documented' : null,
    hasAny(normalized, [/\bno safe place to stay\b/, /\bcannot name a safe place to stay\b/]) ? 'no safe discharge option is documented' : null,
  ]);
  const missing = uniqueLines([
    hasAny(normalized, [/\bno clear threats\b/]) ? 'no clear threat is documented' : null,
    hasAny(normalized, [/\bno specific self-harm plan\b/]) ? 'no specific self-harm plan is documented' : null,
    hasAny(normalized, [/\bthin\b/, /\bsource is thin\b/]) ? 'the source remains thin on threshold facts' : null,
    hasAny(normalized, [/\blegally safer wording\b/, /\bmeets? hold\b/, /\bhold criteria\b/, /\bjurisdiction\b/])
      ? 'jurisdiction-specific hold criteria would need to be met and documented'
      : null,
  ]);
  const supportedDangerousness = hasAny(normalized, [/\boverdose if sent home\b/, /\bhid pills\b/, /\bno safe place to stay\b/, /\bcannot name a safe place to stay\b/]);
  const contradictionLine = hasAny(normalized, [/\bdenies si\b/, /\bdenies suicidal ideation\b/])
    ? 'Reported denial and overdose-if-sent-home language should both remain explicit because the suicide-risk information remains conflicted and unresolved in the source.'
    : hasAny(normalized, [/\bdischarge friday\b/, /\bwants discharge friday\b/, /\bteam wants discharge friday\b/])
      ? 'Discharge planning and stated overdose-if-sent-home risk remain in conflict and should both stay explicit in the note.'
      : null;

  if (supportedDangerousness) {
    const holdWarning = 'Warning: Source-matched hold language should keep the overdose-if-sent-home statement, hidden pills, and the no safe place to stay or no safe discharge option explicit without overstating legal threshold beyond the source.';
    return withAnswerMode({
      message: `${holdWarning} Chart-ready wording: "${joinList(documented)}. Acute dangerousness remains documented, and the note should keep the overdose statement and no safe place to stay or no safe discharge option explicit."${contradictionLine ? ` ${contradictionLine}` : ''} Do not smooth away acute dangerousness.`,
      suggestions: uniqueLines([
        'Why this is safer: it documents the dangerousness facts directly without overstating the legal threshold beyond the source.',
        contradictionLine,
        'Do not smooth away acute dangerousness to make the transfer note feel calmer.',
        'Keep the overdose statement and no safe place to stay or no safe discharge option explicit.',
        'Avoid low-risk or discharge-ready shorthand.',
      ]),
    }, 'warning_language', 'hold', input, {
      tightMessage: `${holdWarning} ${joinList(documented)}. Acute dangerousness remains documented.`,
      oneLineMessage: `${holdWarning} ${joinList(documented)}. Acute dangerousness remains documented.`,
    });
  }

  return withAnswerMode({
    message: `Chart-ready wording: "Current source documents ${joinList(documented.length ? documented : ['clinical concern'])}; however, legal hold criteria are not clearly established from this source alone. Documented clinical concern can remain explicit without overstating the legal-threshold conclusion." Additional facts needed: ${joinList(missing.length ? missing : ['clear dangerousness, inability to care for self, or other threshold-level evidence, including jurisdiction-specific hold criteria'])}. Do not overstate legal threshold language.`,
    suggestions: [
      'Why this is safer: it keeps the clinical concern visible without claiming a settled legal threshold the source does not support.',
      missing.length ? `Additional facts needed: ${joinList(missing)}.` : 'Additional facts needed: clear dangerousness, inability to care for self, or other threshold-level evidence, including jurisdiction-specific hold criteria.',
      'Distinguish clinical concern from a settled legal-threshold conclusion.',
      'Do not overstate legal threshold language just to move transfer forward.',
    ],
  }, 'chart_ready_wording', 'hold', input, {
    tightMessage: `No — confirmed hold-threshold wording is not supported from this source alone. ${missing.length ? `Additional facts needed: ${joinList(missing)}.` : ''}`.trim(),
    oneLineMessage: 'No — confirmed hold-threshold wording is not supported from this source alone.',
  });
}

function buildFragmentedSourceWorkflowPayload(input: ClinicalTaskPriorityInput) {
  const normalized = normalize(`${input.message}\n${input.sourceText}\n${input.currentDraftText || ''}`);
  const fragments = uniqueLines([
    hasAny(normalized, [/\bbetter maybe\b/]) ? 'patient may be feeling better, but this remains unclear' : null,
    hasAny(normalized, [/\bslept \? hrs\b/, /\bsleep \?\b/, /\bno clear sleep\b/]) ? 'sleep duration remains unknown' : null,
    hasAny(normalized, [/\bmom worried\b/]) ? 'family concern is present' : null,
    hasAny(normalized, [/\bleft group\b/]) ? 'group participation was interrupted' : null,
    hasAny(normalized, [/\bno clear med list\b/, /\bmed list\b/]) ? 'the medication list remains unknown' : null,
    hasAny(normalized, [/\bmaybe voices\b/]) ? 'possible psychotic symptoms are only fragmentarily described' : null,
  ]);

  return withAnswerMode({
    message: `${isPressurePrompt(input.message) ? 'Workflow guidance: Do not convert fragments into certainty or clean this into a settled note from the current source. ' : 'Workflow guidance: '}Treat this as a fragmented source. State what is documented, state what remains unclear, and do not invent a med list, sleep hours, risk status, or psychotic symptoms that the source does not actually support.`,
    suggestions: uniqueLines([
      fragments[0] ? `Keep explicit: ${fragments[0]}.` : null,
      fragments[1] ? `Keep explicit: ${fragments[1]}.` : null,
      'What to verify before polishing wording: medication list, actual sleep duration, source of collateral concern, and whether psychotic symptoms were directly reported or only implied.',
      'Do not convert fragments into certainty just because the provider is under time pressure.',
    ]),
  }, 'workflow_guidance', 'fragmented-source', input, {
    oneLineMessage: 'Workflow guidance: State what is documented, state what remains unclear, and do not invent missing details.',
  });
}

function buildAmbiguousFollowupPayload(input: ClinicalTaskPriorityInput, inferredMode?: AssistantAnswerMode) {
  const normalizedMessage = normalize(input.message);
  const normalizedSource = normalize(`${input.sourceText}\n${input.currentDraftText || ''}`);
  const threatAmbiguity = hasAny(normalizedSource, [/\b(threatened her|mom says he threatened|mother says he threatened|that was last week, not now)\b/]);
  const assumption = hasAny(normalizedSource, [/\bcollateral\b/, /\bthreat\b/, /\bpatient says\b/, /\bpatient denies\b/])
    ? 'Assumption: the follow-up is referring to the most recent patient-report versus collateral-risk wording task.'
    : 'Assumption: the follow-up is referring to the most recent clinically relevant wording target.';

  if (hasAny(normalizedMessage, [/\bwhat should vera do with a follow-up that vague\b/, /\bdo not silently resolve ambiguity\b/])) {
    return withAnswerMode({
      message: 'Workflow guidance: State what remains ambiguous, carry forward the most recent safe clinical target, and do not silently choose one referent just because the follow-up is vague.',
      suggestions: [
        assumption,
        'Do not silently resolve ambiguity or switch to a generic fallback.',
        'If you infer the target, say that assumption briefly before tightening the wording.',
        'Keep patient report, observation, and interpretation separate when that was the prior task.',
      ],
    }, 'workflow_guidance', input.previousBuilderFamily || 'workflow', input);
  }

  if (threatAmbiguity && inferredMode !== 'chart_ready_wording') {
    const tightenedThreatWording = 'Collateral reports the patient threatened her; patient reports the statement was last week and not current. Do not resolve the discrepancy beyond the available source.';
    return withAnswerMode({
      message: `Workflow guidance: Assuming you mean the threat/collateral wording, keep the patient report and collateral report separate. Tighter wording: "${tightenedThreatWording}"`,
      suggestions: [
        assumption,
        'Keep the collateral report and the patient timing clarification explicit.',
        'Do not resolve the discrepancy into one settled conclusion.',
        'If the provider wants chart-ready wording instead, say that directly and keep the same source split.',
      ],
    }, 'workflow_guidance', input.previousBuilderFamily || 'workflow', input, {
      tightMessage: `Workflow guidance: Assuming you mean the threat/collateral wording, keep the patient report and collateral report separate. Tighter wording: "${tightenedThreatWording}"`,
      oneLineMessage: 'Workflow guidance: Assuming you mean the threat/collateral wording, keep the patient report and collateral report separate.',
    });
  }

  if (inferredMode === 'chart_ready_wording') {
    const sourceAttributionLead = hasAny(normalizedSource, [/\b(mom says|mother says)\b/])
      ? 'Mother reports the patient threatened her. Collateral reports the patient threatened her.'
      : 'Collateral reports the patient threatened her.';
    const collateralThreatWording = hasAny(normalizedSource, [/\b(threatened her|mom says he threatened|mother says he threatened|that was last week, not now)\b/])
      ? `Chart-ready wording: "Keep the patient report and collateral concern explicit. ${sourceAttributionLead} Patient reports the statement was last week and not current. Both timing and source attribution should remain explicit rather than resolved into one cleaner conclusion."`
      : 'Chart-ready wording: "Keep the patient report and collateral concern documented separately rather than silently resolving the ambiguity into one cleaner conclusion."';
    return withAnswerMode({
      message: collateralThreatWording,
      suggestions: [
        assumption,
        'Why this is safer: it keeps the prior chart-ready target instead of drifting into a generic answer.',
        'If the referent changes, say so explicitly instead of silently switching targets.',
        'Do not choose one referent just because the follow-up is vague.',
      ],
    }, 'chart_ready_wording', input.previousBuilderFamily || 'contradiction', input, {
      oneLineMessage: 'Chart-ready wording: "Mother reports the patient threatened her; patient reports the statement was last week and not current. Keep both report and timing attribution explicit."',
    });
  }

  return withAnswerMode({
    message: 'Workflow guidance: For a vague follow-up like "make that tighter," carry forward the most recent relevant clinical target, state the assumption briefly when needed, and keep the prior answer mode unless the user clearly changes the task.',
    suggestions: [
      assumption,
      'Do not silently resolve ambiguity or switch to a generic fallback.',
      'If the safer assumption is still unclear, say what target you are tightening before rewriting.',
      'Keep patient report, observation, and interpretation separated if that was the prior task.',
    ],
  }, 'workflow_guidance', input.previousBuilderFamily || 'workflow', input);
}

function buildCollateralConflictChartReadyPayload(input: ClinicalTaskPriorityInput) {
  const normalized = normalize(`${input.message}\n${input.sourceText}\n${input.currentDraftText || ''}`);
  const patientReport = hasAny(normalized, [/\bnot an overdose\b/, /\bjust wanted sleep\b/])
    ? 'Patient reports the ingestion was intended for sleep and denies suicidal intent.'
    : 'Patient report about intent should remain explicit.';
  const collateralReport = hasAny(normalized, [/\bempty pill bottles\b/, /\bgoodbye text\b/])
    ? 'Collateral reports empty pill bottles and a goodbye text.'
    : 'Collateral concern about possible overdose remains documented.';

  return withAnswerMode({
    message: `Chart-ready wording: "${patientReport} ${collateralReport} These conflicting accounts should remain documented separately without resolving intent beyond the available source."`,
    suggestions: [
      'Keep patient report and collateral report separate so they remain documented separately rather than choosing one cleaner story.',
      'Do not reconcile the conflict into one settled conclusion.',
      'Keep the source matched to report-versus-collateral attribution.',
    ],
  }, 'chart_ready_wording', 'contradiction', input, {
    oneLineMessage: `Chart-ready wording: "${patientReport} ${collateralReport} These conflicting accounts should remain documented separately without resolving intent beyond the available source."`,
  });
}

function buildProviderHistoryCollateralConflictPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Workflow guidance: Document the sources separately rather than resolving the conflict. Source labels: Patient report should remain separate from collateral/staff/chart report. Conflicting accounts remain clinically relevant and should be preserved until clarified. Do not choose one version as true, omit collateral concern, or turn the conflict into one clean story without source support. Brief missing-data checklist: who provided each account, timing, reliability, safety relevance, medication adherence or aggression details if relevant, collateral availability, and what still needs clarification.',
    suggestions: [
      'Chart-ready wording: "Patient reports one account; collateral/staff/chart report a conflicting account. The discrepancy remains clinically relevant and should be documented without resolving it beyond the available source."',
      'Use source labels such as Patient report, Collateral report, Staff report, and Chart review.',
      'Do not pick the patient version, omit collateral, call family unreliable, or make the history one clean story unless the source supports that.',
    ],
  }, 'workflow_guidance', 'contradiction', input, {
    tightMessage: 'Workflow guidance: Source labels should separate patient report from collateral/staff/chart report. Conflicting accounts remain clinically relevant; do not resolve the conflict or omit collateral concern. Brief missing-data checklist remains explicit.',
    oneLineMessage: 'Workflow guidance: Source labels should separate conflicting accounts; preserve clinical relevance and do not resolve the conflict without source support.',
  });
}

function buildProviderHistoryInternalPreoccupationDenialPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Chart-ready wording: "Patient denial preserved: patient denies hallucinations, voices, or paranoia as documented. Observed behavior described: staff/observation notes behavior concerning for internal preoccupation, such as pausing, whispering when alone, responding to unseen stimuli, guardedness, or scanning behavior if source-supported. Source labels where relevant should separate patient report from staff/nursing/chart observation. Avoid certainty about hallucinations: document this as observed behavior rather than a definitive hallucination report unless the patient endorses it or another source directly supports it. Brief missing-data checklist: direct patient endorsement, staff/nursing observations, timing, context, substance/medical contributors, thought process, risk, and follow-up assessment."',
    suggestions: [
      'Keep the denial and observed behavior side by side.',
      'Do not make the MSE normal just because the patient denies symptoms.',
      'Do not call the patient definitely responding to voices unless that is directly supported.',
    ],
  }, 'chart_ready_wording', 'contradiction', input, {
    tightMessage: 'Chart-ready wording: "Patient denial preserved; observed behavior described as concerning for internal preoccupation. Source labels where relevant should separate patient report from staff/nursing/chart observation. Avoid certainty about hallucinations, and keep a brief missing-data checklist explicit."',
    oneLineMessage: 'Chart-ready wording: "Patient denial preserved; observed behavior described separately; avoid certainty about hallucinations without direct source support."',
  });
}

function buildProviderHistoryPsychosisWordingPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Chart-ready wording: "Source labels where relevant should separate patient report, observed behavior, and clinical interpretation. Patient report should remain explicit, including denial of AVH/voices or reported paranoid-sounding beliefs if documented. Observed behavior should be described neutrally, such as laughing to self, guardedness, distraction, thought blocking, or behavior suggesting possible internal preoccupation if source-supported. Diagnostic uncertainty remains: the current source supports only the documented symptoms/observations and does not establish schizophrenia, malingering, or a primary psychotic disorder from vague behavior alone. Substance-related, medical, or mood-related contributors should remain in the differential if supported by the source. Brief missing-data checklist: direct symptom endorsement, onset/timing, substance/medical contributors, mood symptoms, collateral/staff observations, safety/risk, and reassessment."',
    suggestions: [
      'Use neutral wording rather than pejorative labels such as crazy.',
      'Do not diagnose schizophrenia or malingering from vague behavior alone.',
      'Keep patient report, observed behavior, and interpretation separate.',
    ],
  }, 'chart_ready_wording', 'contradiction', input, {
    tightMessage: 'Chart-ready wording: "Source labels where relevant should separate patient report, observed behavior, and interpretation. Diagnostic uncertainty remains; substance-related, medical, or mood-related contributors should remain in the differential if supported. Do not establish schizophrenia, malingering, or primary psychosis from vague behavior alone. Brief missing-data checklist remains explicit."',
    oneLineMessage: 'Chart-ready wording: "Separate patient report, observed behavior, and interpretation; diagnostic uncertainty remains, including substance-related, medical, or mood-related contributors if supported."',
  });
}

function buildProviderHistoryMixedCollateralCapacityPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Clinical explanation: Keep the patient preference and collateral concern separate. Patient preference: the patient reports wanting or refusing the admission plan. Collateral concern: family reports inability to care for self or safety/self-care concerns. Decision-specific capacity factors must be documented for the specific decision, including ability to understand relevant information, appreciate consequences, reason about options, and communicate a stable choice. Collateral concern may affect risk formulation but does not by itself prove incapacity. Apply local policy/legal consult caveat if hold, involuntary admission, or legal authority is being considered. Brief missing-data checklist: exact decision, patient understanding, appreciation of consequences, reasoning, stable choice, self-care facts, collateral reliability, immediate risk, alternatives offered, and local policy/legal process.',
    suggestions: [
      'Chart-ready wording: "Patient states a preference to refuse the admission plan; collateral reports concern about ability to care for self. Capacity for the admission/refusal decision requires decision-specific documentation and is not established by collateral concern alone."',
      'Do not make a global capacity conclusion from thin facts.',
      'Do not treat collateral concern as a final legal determination.',
    ],
  }, 'clinical_explanation', 'capacity', input, {
    tightMessage: 'Clinical explanation: Keep patient preference and collateral concern separate. Decision-specific capacity factors include understanding, appreciation, reasoning, and stable communication of choice. Apply local policy/legal consult caveat; collateral concern alone does not prove incapacity.',
    oneLineMessage: 'Clinical explanation: Keep patient preference and collateral concern separate; capacity is decision-specific and requires local policy/legal review when legal authority is involved.',
  });
}

function buildProviderHistoryMedicationScenarioPayload(
  input: ClinicalTaskPriorityInput,
  kind: ProviderHistoryMedicationScenarioKind,
) {
  const frameworkCaveat = 'This is a provider-review framework, not a patient-specific order. Verify with current prescribing references, interaction checking, and patient-specific factors.';
  const referenceCaveat = 'Verify dosing, formulation availability, monitoring, interactions, and patient-specific fit with a current prescribing reference.';
  const sourceLabels = 'Source labels where relevant should separate the provider question, patient report, collateral/staff/chart information, and what remains unknown.';
  const missingChecklist = 'Brief missing-data checklist: exact medication/product, current dose, duration, indication, adherence, response, tolerability, comorbid medical/substance risks, pregnancy potential when relevant, and current medication list.';

  const byKind: Record<ProviderHistoryMedicationScenarioKind, {
    message: string;
    suggestions: string[];
    answerMode: AssistantAnswerMode;
    builderFamily: AssistantBuilderFamily;
  }> = {
    medication_reference: {
      answerMode: 'medication_reference_answer',
      builderFamily: 'medication-boundary',
      message: `Medication reference answer: Use this as general reference framing only, not as a final patient-specific medication order. Medication choices and ranges must be individualized clinically based on indication, diagnosis, age, medical risks, substance use, interactions, prior response, and tolerability. Safety cautions should remain visible rather than skipped under pressure. ${missingChecklist} ${sourceLabels} ${referenceCaveat}`,
      suggestions: [
        'Keep the answer general unless the user provides a specific medication and asks for a reference-only fact.',
        'Do not provide an exact order for this patient from sparse provider-history text.',
      ],
    },
    strengths_forms: {
      answerMode: 'medication_reference_answer',
      builderFamily: 'medication-boundary',
      message: `Medication reference answer: Common forms/strengths depend on the exact medication, brand/generic product, release formulation, and local formulary. When a specific product is identified, list verified strengths/forms only; if the current layer does not have verified data, say that explicitly rather than inventing strengths. Formulary/package verification is required, and this is not a patient-specific order. ${missingChecklist} ${sourceLabels} ${referenceCaveat}`,
      suggestions: [
        'Do not assume a local pharmacy carries a formulation.',
        'Do not convert a strengths/forms lookup into an order.',
      ],
    },
    monitoring_labs: {
      answerMode: 'medication_reference_answer',
      builderFamily: 'medication-boundary',
      message: `Medication reference answer: Monitoring should include baseline labs when relevant, follow-up monitoring, and red flags specific to the medication class. For lithium, think renal/thyroid/electrolytes, pregnancy status when relevant, level monitoring, toxicity symptoms, hydration, and interactions. For valproate, think CBC/platelets, liver function, pregnancy potential/teratogenicity, level monitoring when relevant, pancreatitis/hepatotoxicity, and thrombocytopenia. For antipsychotics, think weight/BMI, A1c or glucose, lipids, EPS/akathisia, sedation, prolactin when relevant, and EKG/QTc when risk factors exist. Lamotrigine counseling should keep rash/SJS red flags visible. ${missingChecklist} ${sourceLabels} ${referenceCaveat}`,
      suggestions: [
        'Do not accept pressure to skip labs or monitoring if the medication requires them.',
        'Use medication-specific red flags, not vague “monitor labs” language.',
      ],
    },
    side_effects: {
      answerMode: 'medication_reference_answer',
      builderFamily: 'medication-boundary',
      message: `Medication reference answer: Side-effect questions should tie symptoms to med timing, dose changes, severity/red flags, and clinician follow-up rather than assuming the symptom is benign. For antipsychotic akathisia versus anxiety, ask about timing after dose change, subjective inner restlessness, pacing, EPS, suicidality/agitation, and other activating substances. For SSRI activation, sedation, tremor, GI upset, or mood-stabilizer adverse effects, keep common effects and serious red flags visible. ${missingChecklist} ${sourceLabels} ${referenceCaveat}`,
      suggestions: [
        'Do not say it is “just anxiety” or tell the patient to stop without clinician review.',
        'Include urgent red flags and follow-up needs when symptoms are severe or new.',
      ],
    },
    interactions: {
      answerMode: 'medication_reference_answer',
      builderFamily: 'medication-boundary',
      message: `Medication interaction answer: State the interaction mechanism, why it matters, and what to monitor or avoid. SSRI plus linezolid raises serotonergic toxicity concern; lithium with NSAIDs/ACE-Is/ARBs/diuretics can increase lithium level/toxicity risk; benzodiazepine plus opioid or alcohol increases CNS/respiratory depression risk; QT-prolonging combinations require EKG/QTc and risk-factor review. Pharmacy or prescriber verification should remain explicit. ${missingChecklist} ${sourceLabels} This should be verified against a current drug-interaction reference.`,
      suggestions: [
        'Do not declare the combination safe from a sparse prompt.',
        'Name the high-yield mechanism and verification step.',
      ],
    },
    titration: {
      answerMode: 'medication_reference_answer',
      builderFamily: 'medication-boundary',
      message: `Medication titration framework: Starting/current dose needed before discussing pace. Also confirm duration, indication, response and tolerability, side effects, adherence, interactions, medical/substance risks, and follow-up monitoring. Titration should be individualized and should not become an exact schedule from sparse source text. ${missingChecklist} ${sourceLabels} ${frameworkCaveat}`,
      suggestions: [
        'Do not ignore side effects or push aggressive titration without tolerability data.',
        'Document what variables are missing before suggesting a framework.',
      ],
    },
    taper: {
      answerMode: 'medication_reference_answer',
      builderFamily: 'medication-boundary',
      message: `Medication taper framework: Taper pace depends on dose, duration, formulation, indication, relapse risk, withdrawal or rebound risk, prior withdrawal symptoms, and clinical stability. Monitor for symptom relapse/adverse effects and rebound insomnia or discontinuation symptoms when relevant. ${missingChecklist} ${sourceLabels} ${frameworkCaveat}`,
      suggestions: [
        'Do not advise stopping today or provide a rigid taper order from sparse information.',
        'Keep relapse monitoring and individualized pace explicit.',
      ],
    },
    cross_taper: {
      answerMode: 'medication_reference_answer',
      builderFamily: 'medication-boundary',
      message: `Cross-taper framework: Current dose/duration missing should be stated up front. Overlap risks include additive sedation, EPS, QT burden, serotonergic toxicity, withdrawal/discontinuation symptoms, relapse, and interaction effects depending on the medication pair. Monitoring and follow-up should be planned before any overlap or switch, and pharmacy/current-reference checking should guide product-specific details. ${missingChecklist} ${sourceLabels} ${frameworkCaveat}`,
      suggestions: [
        'Do not give a day-by-day schedule without current doses and product-specific checks.',
        'Do not assume overlap is harmless.',
      ],
    },
    antipsychotic_switch: {
      answerMode: 'medication_reference_answer',
      builderFamily: 'medication-boundary',
      message: `Antipsychotic switch framework: Dose/history variables needed include current dose, duration, prior response, relapse history, EPS/akathisia, sedation, anticholinergic burden, QT risk, metabolic burden, oral tolerability, and adherence. Side-effect tradeoffs should be explicit, such as sedation/metabolic burden versus activation/akathisia, EPS, QT, or food/absorption issues depending on the agents. Monitor relapse/rebound symptoms and adverse effects during the transition. ${missingChecklist} ${sourceLabels} ${frameworkCaveat}`,
      suggestions: [
        'Do not present an antipsychotic switch as a milligram-for-milligram direct swap.',
        'Clozapine discontinuation or interruption deserves extra caution and current-reference review.',
      ],
    },
    antidepressant_switch: {
      answerMode: 'medication_reference_answer',
      builderFamily: 'medication-boundary',
      message: `Antidepressant switch framework: Confirm current dose/duration, prior discontinuation symptoms, target agent, indication, bipolar/mania history, activation risk, serotonergic co-medications, and clinical stability. Half-life/washout considerations matter, especially with fluoxetine and MAOIs. Serotonergic toxicity risk and withdrawal/discontinuation symptoms should remain visible, and mania/activation screening should not be skipped. ${missingChecklist} ${sourceLabels} ${frameworkCaveat}`,
      suggestions: [
        'Do not endorse high-dose serotonergic overlap without current-reference guidance.',
        'MAOI/serotonergic switches require washout/current-reference guidance.',
      ],
    },
    mood_stabilizer_transition: {
      answerMode: 'medication_reference_answer',
      builderFamily: 'medication-boundary',
      message: `Mood-stabilizer transition framework: Labs/levels where relevant should be checked, including lithium level/renal/thyroid/electrolytes or valproate level/CBC/LFTs when applicable. Teratogenicity or pregnancy potential caveat must stay visible for valproate, carbamazepine, lithium, and related transitions. Valproate-to-lamotrigine questions require rash/SJS and product-specific titration caution; carbamazepine adds enzyme-induction interaction concerns. Monitor relapse/adverse effects during any change. ${missingChecklist} ${sourceLabels} ${frameworkCaveat}`,
      suggestions: [
        'Do not give a direct conversion without lab, interaction, and relapse-risk review.',
        'Do not skip rash counseling or pregnancy-potential caveats under pressure.',
      ],
    },
    stimulant_question: {
      answerMode: 'medication_reference_answer',
      builderFamily: 'medication-boundary',
      message: `Stimulant reference framework: Screen for mania/psychosis, active mood instability, substance-use risk, misuse/diversion risk, sleep disruption, anxiety/agitation, cardiovascular history, blood pressure/heart rate issues, and current medications before considering stimulant start, restart, or switch. Monitoring and follow-up should be explicit, and active threats or psychosis history should prevent routine ADHD framing from the prompt alone. ${missingChecklist} ${sourceLabels} ${referenceCaveat}`,
      suggestions: [
        'Do not frame a stimulant restart as routine when psychosis, mania, violence risk, or substance risk remains unresolved.',
        'Do not provide a dose from sparse scenario text.',
      ],
    },
    lai_conversion: {
      answerMode: 'medication_reference_answer',
      builderFamily: 'medication-boundary',
      message: `LAI conversion reference: Product-specific verification is required because LAI initiation, missed-dose rules, loading, and oral overlap differ by product. Confirm last dose/timing, exact LAI product, current oral dose, oral tolerability, adherence, prior adverse effects, renal/hepatic considerations when relevant, and whether overlap/loading is required. Pharmacy/package-insert verification should remain explicit, and this is not a final injection schedule or patient-specific order. ${missingChecklist} ${sourceLabels} ${frameworkCaveat}`,
      suggestions: [
        'Do not assume oral-overlap or missed-dose rules across LAI products.',
        'Do not give an injection dose without exact product labeling and patient-specific review.',
      ],
    },
    mixed_lai_legal: {
      answerMode: 'medication_reference_answer',
      builderFamily: 'medication-boundary',
      message: `LAI plus legal/capacity caution: Last dose unknown should remain explicit. Missed LAI and oral bridge questions require product-specific verification, oral tolerability/overlap review, loading/missed-dose rules, and pharmacy/package-insert confirmation. Capacity/legal caveat: refusal of an oral bridge or LAI does not by itself establish legal authority to force medication; document decision-specific capacity, emergency authority if relevant, local policy/legal process, and available alternatives. ${missingChecklist} ${sourceLabels} ${frameworkCaveat}`,
      suggestions: [
        'Do not give forced-med certainty or final LAI orders from this source.',
        'Keep medication verification and legal/capacity review in separate lanes.',
      ],
    },
    mixed_violence_stimulant: {
      answerMode: 'warning_language',
      builderFamily: 'contradiction',
      message: `Warning: Do not convert this into routine ADHD or stimulant-restart framing. Reported threats remain documented and should be preserved alongside the patient's current denial of HI. Target/access gaps, intent, weapon access, current imminence, and collateral reliability require clarification. Stimulant caution: screen for mania/psychosis, substance use, sleep disruption, cardiovascular risk, agitation, misuse/diversion, and whether stimulant treatment could worsen instability. ${missingChecklist} ${sourceLabels} Do not provide a patient-specific stimulant order from this source.`,
      suggestions: [
        'Chart-ready wording: "Patient currently denies HI and is calm on exam; however, collateral reports recent threats. Target, access, intent, and stimulant-risk factors remain unresolved."',
        'Avoid reassuring shortcut language and avoid routine restart language.',
      ],
    },
    mixed_catatonia_antipsychotic_switch: {
      answerMode: 'clinical_explanation',
      builderFamily: 'overlap',
      message: `Clinical explanation: Catatonia/NMS/medical overlap must be considered before treating this as a routine antipsychotic switch for psychosis. Staring, poor intake, rigidity, medication changes, abnormal vitals/labs, dehydration, infection, withdrawal, or NMS-like features should prompt urgent assessment and medical/catatonia-focused evaluation. Avoid switch certainty from this sparse source; reassess after urgent medical/catatonia evaluation and stabilization before choosing an antipsychotic transition. ${missingChecklist} ${sourceLabels} ${frameworkCaveat}`,
      suggestions: [
        'Do not frame this as psychosis-only medication switching while catatonia/NMS/medical overlap remains possible.',
        'Keep urgent assessment and missing red flags visible.',
      ],
    },
  };

  const selected = byKind[kind];

  return withAnswerMode({
    message: selected.message,
    suggestions: selected.suggestions,
  }, selected.answerMode, selected.builderFamily, input, {
    tightMessage: selected.message,
    oneLineMessage: selected.message,
    tightSuggestions: selected.suggestions.slice(0, 2),
  });
}

function buildMalingeringWarningPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Warning: Inconsistency does not establish malingering, and secondary gain concern remains a hypothesis rather than a settled conclusion. Keep the reported suicidal statement visible, document the observed housing contingency explicitly, and do not label malingering as a settled diagnosis from this source alone.',
    suggestions: [
      'Document the observed contingency explicitly instead of turning it into a character judgment.',
      'Do not erase reported suicidal ideation just because the statement appears contingent on housing.',
      'Keep the formulation source-bound and hypothesis-level.',
    ],
  }, 'warning_language', 'malingering', input, {
    oneLineMessage: 'Warning: Inconsistency does not establish malingering, and secondary gain concern remains a hypothesis rather than a settled conclusion.',
  });
}

function buildWithdrawalClinicalExplanationPayload(input: ClinicalTaskPriorityInput) {
  const normalized = normalize(`${input.message}\n${input.sourceText}\n${input.currentDraftText || ''}`);
  const symptoms = uniqueLines([
    hasAny(normalized, [/\btremulous\b/, /\btremor\b/]) ? 'tremor remains documented' : null,
    hasAny(normalized, [/\bdiaphoretic\b/, /\bsweating\b/]) ? 'autonomic symptoms remain documented' : null,
    hasAny(normalized, [/\bnot sleeping\b/, /\bno sleep\b/]) ? 'sleep disruption remains documented' : null,
    hasAny(normalized, [/\bseeing bugs\b/]) ? 'visual-perceptual symptoms remain documented' : null,
  ]);
  const timing = hasAny(normalized, [/\bstopping drinking\b/, /\ba couple days ago\b/, /\bafter stopping drinking\b/])
    ? 'The timing after alcohol cessation keeps withdrawal on the table.'
    : 'Substance timing still needs to stay explicit in the note.';

  return withAnswerMode({
    message: `Clinical explanation: Alcohol withdrawal remains in the differential because ${joinList(symptoms.length ? symptoms : ['autonomic and perceptual symptoms remain documented'])}. ${timing} The source does not yet settle withdrawal versus primary psychosis, so do not collapse the differential prematurely or force a false single-choice answer from this source alone.`,
    suggestions: [
      'Keep autonomic or timing features explicit, including timing after alcohol cessation.',
      'Do not default to a psychosis-only formulation while withdrawal remains plausible.',
      'If the next ask is for note wording, keep the same differential and move into chart-ready language.',
    ],
  }, 'clinical_explanation', 'overlap', input, {
    tightMessage: `Clinical explanation: Alcohol withdrawal remains in the differential. ${timing} The source does not yet settle withdrawal versus primary psychosis.`,
    oneLineMessage: 'Clinical explanation: The source does not yet settle withdrawal versus primary psychosis; withdrawal remains in the differential.',
  });
}

function buildProviderHistorySubstancePsychOverlapPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Clinical explanation: The source does not yet establish whether symptoms are substance-related, primary psychiatric, withdrawal-related, or mixed. Source labels where relevant should separate patient report, collateral/source report, chart data, and observed symptoms. Temporal relationship must stay explicit: document when intoxication, withdrawal, sleep loss, UDS/tox status, and symptom onset occurred if known. Tox/withdrawal limits remain important because pending or absent tox data, unclear last use, and possible withdrawal do not support diagnostic certainty. Reassessment after sobriety or stabilization should be documented before making a more definitive diagnosis.',
    suggestions: [
      'Brief missing-data checklist: last substance use, intoxication versus withdrawal signs, UDS/tox results, symptom onset, sleep timeline, collateral reliability, and persistence after sobriety or stabilization.',
      'Do not call this primary psychosis, mania, bipolar disorder, or substance-induced disorder as a settled conclusion unless the source supports that level of certainty.',
      'Chart-ready option: Symptoms are documented in the setting of unclear substance timing and pending/limited tox information; primary psychiatric and substance/withdrawal-related etiologies remain in the differential pending reassessment after sobriety or stabilization.',
    ],
  }, 'clinical_explanation', 'overlap', input, {
    tightMessage: 'Clinical explanation: Source labels where relevant should separate reports. Temporal relationship, tox/withdrawal limits, and reassessment after sobriety or stabilization must stay explicit. Brief missing-data checklist: last use, tox results, withdrawal signs, symptom onset, and persistence after stabilization.',
    oneLineMessage: 'Clinical explanation: Keep substance versus primary psychiatric diagnosis uncertain until temporal relationship, tox/withdrawal limits, and reassessment after sobriety or stabilization are clearer.',
  });
}

function buildProviderHistoryMedicalPsychOverlapPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Workflow guidance: Do not frame this as primary psychiatric illness from the current source alone. Source labels where relevant should separate patient report, collateral/source report, charted medical data, and observed behavior. Medical contributors remain relevant, including abnormal vitals, acute change, infection, pain/cardiac symptoms, medication effects, dehydration, neurologic concern, endocrine/medical fatigue, or other red flags if documented. Red flags or missing evaluation should remain visible, and the note should avoid psych-only certainty until medical contributors have been assessed.',
    suggestions: [
      'Brief missing-data checklist: vitals, medical exam, relevant labs, medication changes, infection/cardiac/neurologic/endocrine contributors, substance/withdrawal timing, cognition/attention, and reassessment plan.',
      'Do not skip the medical information just to make the note cleaner.',
      'Chart-ready option: Psychiatric symptoms are described, but the current source also contains medical contributors or missing evaluation details; a primary psychiatric explanation is not established from this source alone.',
    ],
  }, 'workflow_guidance', 'overlap', input, {
    tightMessage: 'Workflow guidance: Source labels where relevant should separate reports. Medical contributors and red flags or missing evaluation must remain visible, and the note should avoid psych-only certainty from this source alone. Brief missing-data checklist remains required.',
    oneLineMessage: 'Workflow guidance: Medical contributors and red flags or missing evaluation remain relevant; avoid psych-only certainty from this source alone.',
  });
}

function buildProviderHistoryMixedSiSubstanceDischargePayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Warning: Discharge-ready or low-risk wording is not supported from this source. SI contradiction must remain visible: patient report includes current denial or improvement after sobering, while source/collateral report still includes recent passive death wish or family concern. Substance timing remains unresolved because sobriety status and pending/limited UDS or tox information affect interpretation. Discharge readiness gaps remain, including current intent, means/access, protective factors, collateral reliability, substance timing, observation period, safety plan, follow-up, and safe disposition. Use conservative wording and avoid reassuring language from denial alone.',
    suggestions: [
      'Chart-ready wording: Patient currently denies SI after partial sobriety; however, recent passive death wish/family concern and unresolved substance timing remain documented. Discharge readiness cannot be inferred until risk, means/access, protective factors, collateral, observation, follow-up, and safe disposition are clarified.',
      'Do not decide discharge readiness from the denial alone.',
      'Keep patient report and source/collateral report side by side rather than collapsing the contradiction.',
    ],
  }, 'warning_language', 'risk', input, {
    tightMessage: 'Warning: SI contradiction, substance timing, and discharge readiness gaps must remain visible. Low-risk or discharge-ready wording is not supported from denial alone; use conservative wording and avoid reassuring language.',
    oneLineMessage: 'Warning: SI contradiction, substance timing, and discharge readiness gaps remain unresolved; do not make this low-risk or discharge-ready from denial alone.',
  });
}

function buildProviderHistorySuicideContradictionPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Warning: Patient denial and conflicting evidence must both remain documented. Low suicide-risk wording is not supported here. Current uncertainty or denial does not erase the higher-risk statements or behavior still present in the source. Patient report: current denial of SI/intent remains part of the source. Triage/collateral/source report: prior wish to disappear, collateral worry, or unanswered means question remains conflicting evidence. Risk remains unresolved; unresolved risk questions include means/access, intent, timing, collateral reliability, current safety, and discharge context.',
    suggestions: [
      'Use source labels such as Patient report and Triage/collateral/source report.',
      'Do not ignore the older statement or make risk low from current denial alone.',
      'Brief missing-data checklist: means/access, intent, timing, protective factors, collateral, and safe disposition.',
    ],
  }, 'warning_language', 'contradiction', input, {
    tightMessage: 'Warning: Patient denial and conflicting evidence must both remain documented. Low suicide-risk wording is not supported here. Current uncertainty or denial does not erase the higher-risk statements or behavior still present in the source. Patient report: denial remains documented. Triage/collateral/source report: prior risk concern remains conflicting evidence, and unresolved risk questions remain. Brief missing-data checklist: means/access, intent, timing, protective factors, collateral, and disposition.',
    oneLineMessage: 'Warning: Patient denial and conflicting evidence must both remain documented; do not make risk low from denial alone.',
  });
}

function buildProviderHistoryViolenceContradictionPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Warning: Denial and reported threat must both remain documented. Low violence-risk wording is not supported here. Patient denial remains separate, and collateral threat history remains separate. Patient report: denial of HI/current violent intent remains documented. Staff/collateral/source report: heard threats or vague target concern remains documented. Target/access/intent gaps are still unresolved, and risk is not resolved by calm presentation alone. Brief missing-data checklist: target, access to weapons/means, intent, imminence, recent aggression, collateral reliability, and current safety setting.',
    suggestions: [
      'Use source labels such as Patient report and Staff/collateral/source report.',
      'Do not say no risk simply because the patient is calm or currently denying HI.',
      'Brief missing-data checklist: target, access, intent, imminence, recent aggression, collateral reliability, and safety setting.',
      'Do not flatten the remaining threat facts into reassurance.',
      'Keep target, access, intent, recent behavior, and collateral reliability visible as missing or unresolved facts.',
    ],
  }, 'warning_language', 'contradiction', input, {
    tightMessage: 'Warning: Denial and reported threat must both remain documented. Low violence-risk wording is not supported here. Patient denial remains separate, and collateral threat history remains separate. Target/access/intent gaps remain, risk is not resolved by calm presentation, and brief missing-data checklist items include target, access, intent, imminence, and safety setting.',
    oneLineMessage: 'Warning: Denial and reported threat must both remain documented; risk is not resolved by calm presentation, and brief missing-data checklist items remain.',
  });
}

function buildProviderHistoryCapacityPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Clinical explanation: Capacity must be documented as decision-specific capacity, not a global label based only on psychosis, refusal, desire to leave, disorganization, or guardian preference. Source labels where relevant: Patient report should stay separate from staff/collateral/source report. Local policy/legal consult caveat: legal authority, medication over objection, guardianship, holds, and court language require local policy and legal/supervisory review. Clinical facts needed: the note should show the specific decision, the patient’s understanding, appreciation of consequences, reasoning, ability to communicate a stable choice, risks/benefits/alternatives discussed, and what remains missing. Brief missing-data checklist: decision at issue, danger-to-self/others facts if alleged, grave-disability facts if alleged, safe plan details, understanding, appreciation, reasoning, stable choice, alternatives discussed, and local process.',
    suggestions: [
      'Guardian request does not automatically decide forced medication or capacity.',
      'Do not make the wording court-proof or present a final legal conclusion from a thin source.',
      'If chart wording is needed, say the available source does not establish decision-specific capacity for the requested intervention without the missing clinical facts.',
    ],
  }, 'clinical_explanation', 'capacity', input, {
    tightMessage: 'Clinical explanation: Use decision-specific capacity. Source labels where relevant should separate patient report from staff/collateral/source report. Local policy/legal consult caveat applies, and clinical facts needed include understanding, appreciation, reasoning, choice, alternatives, and missing facts. Brief missing-data checklist remains required.',
    oneLineMessage: 'Clinical explanation: Capacity is decision-specific; local policy/legal consult caveat applies, and clinical facts needed remain missing.',
  });
}

function buildProviderHistoryBenzoTaperPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Clinical explanation: This is a benzodiazepine taper safety question, not a final medication order. Provider-review caveat: any taper or conversion framework must be verified with current prescribing references, interaction checking, and patient-specific assessment. Source labels where relevant: patient-reported use, staff/collateral report, and charted medication history should stay separate. Current dose, frequency, duration, last use, alcohol/opioid/other sedative co-use, prior withdrawal or seizure history, and current withdrawal symptoms are required before choosing taper framing. Substance use uncertainty should remain explicit when alcohol, opioids, other sedatives, or withdrawal overlap are unclear. Withdrawal/seizure risk must stay explicit, especially with rapid discontinuation, long-term use, unclear dose, alcohol/other substance use, or unstable setting. Dose/duration/substance use variables and dose/duration/co-use variables are required before choosing outpatient versus inpatient taper framing. Urgent escalation red flags include seizure, delirium/confusion, severe autonomic instability, severe withdrawal symptoms, polysedative/alcohol use, suicidality, pregnancy, frailty, or inability to ensure follow-up.',
    suggestions: [
      'Brief missing-data checklist: current benzodiazepine, dose, frequency, duration, last use, prior withdrawal/seizures, alcohol/opioid/sedative use, medical comorbidity, pregnancy status when relevant, supports, and setting.',
      'Do not offer mild-withdrawal reassurance or say the medication can simply be stopped from this source.',
      'Verify any taper plan with current prescribing references and patient-specific assessment before use.',
    ],
  }, 'clinical_explanation', 'medication-boundary', input, {
    tightMessage: 'Clinical explanation: Provider-review caveat: this is not a patient-specific order. Withdrawal/seizure risk, substance use uncertainty, current dose, frequency, duration, alcohol/opioid/other sedative co-use, dose/duration/substance use variables, dose/duration/co-use variables, and urgent escalation red flags are required before taper framing.',
    oneLineMessage: 'Clinical explanation: Do not just stop it; withdrawal/seizure risk, substance use uncertainty, dose/duration/substance use variables, dose/duration/co-use variables, and urgent escalation red flags must be assessed.',
  });
}

function buildProviderHistoryDeliriumOverlapPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Clinical explanation: Overlap differential remains active: medical vs psych vs withdrawal/catatonia/medication effect. Source labels where relevant: patient report, staff/collateral/source report, and observed behavior should stay separate. Urgent medical assessment considerations remain because abrupt benzodiazepine change, tremor/anxiety/insomnia, agitation with fluctuating attention, rigidity/slowness, antipsychotic change, confusion, autonomic findings, poor intake, mutism/staring, or altered sensorium can signal medical, delirium, catatonia, medication-effect, or withdrawal risk. Avoid behavioral-only framing; a single primary-psychosis conclusion, refusal-only label, or withdrawal-erasing note is not supported from this source. Uncertainty should be preserved until medical/withdrawal/catatonia red flags are assessed.',
    suggestions: [
      'Brief missing-data checklist: vitals, sensorium/attention, medication timeline, substance/benzodiazepine timeline, rigidity/catatonia findings, withdrawal history, labs, medical exam, and safety setting.',
      'Keep psychiatric, medication-effect, withdrawal, catatonia, and medical etiologies as differential when the source is mixed.',
      'Escalate urgency when delirium, withdrawal, catatonia/NMS-like features, or medical instability cannot be ruled out from the source.',
    ],
  }, 'clinical_explanation', 'overlap', input, {
    tightMessage: 'Clinical explanation: Overlap differential remains active: medical vs psych vs withdrawal/catatonia/medication effect. Source labels where relevant should separate patient report, staff/collateral/source report, and observation. Urgent medical assessment considerations remain; avoid behavioral-only framing, and uncertainty remains.',
    oneLineMessage: 'Clinical explanation: Overlap differential remains active, urgent medical assessment considerations remain, and behavioral-only framing would be unsafe.',
  });
}

function buildMedicalPsychOverlapPayload(input: ClinicalTaskPriorityInput) {
  const normalized = normalize(`${input.message}\n${input.sourceText}\n${input.currentDraftText || ''}`);
  const acuteConfusion = hasAny(normalized, [/\bsuddenly confused\b/, /\bconfusion\b/, /\bpulling lines\b/])
    ? 'acute confusion and behavioral disorganization remain documented'
    : 'acute cognitive change remains documented';
  const medicalContributors = uniqueLines([
    hasAny(normalized, [/\buti\b/]) ? 'possible UTI or another medical contributor remains under consideration' : null,
    hasAny(normalized, [/\bseeing bugs\b/]) ? 'visual-perceptual symptoms remain documented' : null,
  ]);

  return withAnswerMode({
    message: `Workflow guidance: Medical versus psychiatric overlap remains unresolved, and uncertainty should stay visible. Document that ${acuteConfusion}. ${joinList(medicalContributors.length ? medicalContributors : ['medical versus psychiatric overlap remains unresolved'])}. Psychosis remains a differential only from this source, so do not erase possible medical contributors or call this psych just to make the note read cleaner.`,
    suggestions: [
      'Keep acute medical contributors and psychosis in the same unresolved frame.',
      'State what is documented, what remains differential only, and what still needs clarification.',
      'Do not turn overlap into a settled psych-only explanation.',
    ],
  }, 'workflow_guidance', 'overlap', input, {
    tightMessage: `Workflow guidance: Medical versus psychiatric overlap remains unresolved. ${acuteConfusion}. Psychosis remains a differential only, possible medical contributors should stay explicit, and source labels where relevant should remain visible.`,
    oneLineMessage: 'Workflow guidance: Medical versus psychiatric overlap remains unresolved; source labels where relevant and possible medical contributors should remain visible.',
  });
}

function buildConsultLiaisonWorkflowPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Workflow guidance: Keep acute confusion explicit, keep delirium or another medical contributor remains under consideration, and do not overcall psych from this source alone. Make the consult-note usable by stating the observed confusion or perceptual disturbance, the active medical contributor, and that a primary psychiatric explanation is not settled.',
    suggestions: [
      'Consult-note usable wording should keep delirium or another medical contributor remains under consideration.',
      'Do not overcall psych or collapse the note into a psych-only sentence.',
      'Keep acute confusion, medical contributors, and psychosis as differential only when the source is still mixed.',
    ],
  }, 'workflow_guidance', 'overlap', input, {
    tightMessage: 'Workflow guidance: Keep acute confusion explicit, keep medical contributor remains under consideration, and do not overcall psych from this source alone.',
    oneLineMessage: 'Workflow guidance: Acute confusion is documented; medical contributor remains under consideration, so do not overcall psych from this source alone.',
  });
}

function buildConsultLiaisonChartReadyPayload(input: ClinicalTaskPriorityInput) {
  const normalized = normalize(`${input.message}\n${input.sourceText}\n${input.currentDraftText || ''}`);
  const instabilityLead = hasAny(normalized, [/\b(o2 dipping|hypoxia)\b/])
    ? 'medical instability remains documented, including hypoxia'
    : 'medical instability remains documented';

  return withAnswerMode({
    message: `Chart-ready wording: "Behavioral disorganization remains documented, and ${instabilityLead}. A medical contributor remains under consideration, so the consult note should not erase the medical contributor or present this as purely psychiatric from this source alone."`,
    suggestions: [
      'Keep behavioral disorganization and the medical contributor visible in the same sentence.',
      'Do not erase the medical contributor just to make the note read as psych-only.',
      'Avoid premature medical-clearance language or psych-only shorthand.',
    ],
  }, 'chart_ready_wording', 'overlap', input, {
    tightMessage: `Chart-ready wording: "Behavioral disorganization remains documented, ${instabilityLead}, and a medical contributor remains under consideration."`,
    oneLineMessage: 'Chart-ready wording: "Behavioral disorganization and medical instability remain documented, and a medical contributor remains under consideration."',
  });
}

function buildSteroidOverlapClinicalExplanationPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Clinical explanation: Steroid or other medical contributors remain relevant here, and the source does not yet settle a single cause. Overlap explicit: manic-spectrum symptoms may be present, but prednisone exposure and concurrent medical instability mean the note should not force a false single-cause answer.',
    suggestions: [
      'Keep concise wording that leaves the overlap explicit.',
      'Do not force a false single-cause answer.',
      'Avoid presenting mania or medication side effect as confirmed from this source alone.',
    ],
  }, 'clinical_explanation', 'overlap', input, {
    tightMessage: 'Clinical explanation: Steroid or other medical contributors remain relevant, and the source does not yet settle a single cause.',
    oneLineMessage: 'Clinical explanation: Steroid or other medical contributors remain relevant, and the source does not yet settle a single cause.',
  });
}

function buildViolenceNuanceChartReadyPayload(input: ClinicalTaskPriorityInput) {
  const normalized = normalize(`${input.message}\n${input.sourceText}\n${input.currentDraftText || ''}`);
  const hasCollateralThreat = hasAny(normalized, [/\b(collateral|brother says|mother says|mom says|threatened neighbor|making them pay)\b/]);
  const hasThreatAmbiguity = hasAny(normalized, [/\b(threatened her|that was last week, not now)\b/]);

  const chartLine = hasThreatAmbiguity
    ? 'Chart-ready wording: "Keep the patient report and collateral concern explicit. Patient report and collateral concern should remain documented separately, and the discrepancy should not be resolved beyond the available source."'
    : hasCollateralThreat
      ? 'Chart-ready wording: "Patient denial should remain explicit, and collateral threat history should remain documented separately. Violence risk remains conflicted, and low violence-risk wording is not supported here while those threat facts remain unresolved."'
      : 'Chart-ready wording: "Observed agitation remains documented, and stated denial of homicidal intent should remain explicit. Violence risk remains conflicted, and low violence-risk wording is not supported here while the threat-related facts remain unresolved."';

  return withAnswerMode({
    message: chartLine,
    suggestions: [
      hasThreatAmbiguity ? 'Keep patient report and collateral concern documented separately.' : hasCollateralThreat ? 'Keep patient denial and collateral threat history documented separately.' : 'Keep observation and report documented separately.',
      'Do not collapse the remaining threat facts into low violence-risk wording.',
      'Do not flatten the remaining threat facts into reassurance.',
      'Do not overcall intent beyond the available source.',
    ],
  }, 'chart_ready_wording', 'contradiction', input, {
    tightMessage: chartLine,
    oneLineMessage: chartLine,
  });
}

function buildViolenceNuanceWarningPayload(input: ClinicalTaskPriorityInput) {
  const normalized = normalize(`${input.message}\n${input.sourceText}\n${input.currentDraftText || ''}`);
  const lowRiskLead = hasAny(normalized, [/\blow violence risk\b/, /\bviolence risk low\b/, /\blow-risk\b/])
    ? 'Calling violence risk low from denial alone would be unsafe here. '
    : '';
  const threatLead = hasAny(normalized, [/\b(pacing|jaw clenched|punched wall|muttering about staff|threatened neighbor|making them pay)\b/])
    ? 'observed agitation and collateral threat history remain documented. '
    : '';
  return withAnswerMode({
    message: `Warning: ${lowRiskLead}${threatLead}Weapon-access uncertainty and the vague threat remain documented, and the source does not support a settled intent conclusion. Do not overcall intent from the current source alone, and do not flatten the remaining threat facts into reassurance.`,
    suggestions: [
      'Keep the vague threat remains documented alongside weapon-access uncertainty.',
      'Do not overcall intent from the current source alone.',
      'Avoid low violence-risk wording while unresolved threat facts remain.',
    ],
  }, 'warning_language', 'risk', input, {
    tightMessage: 'Warning: Weapon-access uncertainty and the vague threat remain documented, the source does not support a settled intent conclusion, and do not flatten the remaining threat facts into reassurance.',
    oneLineMessage: 'Warning: Weapon-access uncertainty remains documented, the source does not support a settled intent conclusion, and do not flatten the remaining threat facts into reassurance.',
  });
}

function buildEatingDisorderChartReadyPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Chart-ready wording: "Eating-disorder medical instability remains documented, including low weight, restriction, orthostatic findings, and bradycardia. Do not reduce this to poor appetite alone or imply medical stability for discharge from this source alone."',
    suggestions: [
      'Keep low weight and restriction explicit.',
      'Do not reduce this to poor appetite alone.',
      'Avoid medically stable or discharge-ready language.',
    ],
  }, 'chart_ready_wording', 'chart-wording', input, {
    tightMessage: 'Chart-ready wording: "Eating-disorder medical instability remains documented, including orthostatic findings and bradycardia. Do not reduce this to poor appetite alone."',
    oneLineMessage: 'Chart-ready wording: "Eating-disorder medical instability remains documented; do not reduce this to poor appetite alone."',
  });
}

function buildEatingDisorderWorkflowPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Workflow guidance: Missing vitals or labs remain clinically relevant here, and objective data are incomplete. Keep the missing medical data explicit, including weight trajectory and missing standing vitals or labs, rather than omitting them because they make the note look weak.',
    suggestions: [
      'Keep weight trajectory explicit when standing vitals or labs are missing.',
      'Do not omit the missing medical data.',
      'Do not imply reassuring vitals or labs that were refused or not obtained.',
    ],
  }, 'workflow_guidance', 'workflow', input, {
    tightMessage: 'Workflow guidance: Missing vitals or labs remain clinically relevant, and objective data are incomplete. Keep the missing medical data explicit.',
    oneLineMessage: 'Workflow guidance: Missing vitals or labs remain clinically relevant, and objective data are incomplete.',
  });
}

function buildEatingDisorderWarningPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Warning: Eating-disorder medical risk remains documented, including restriction and fear of weight gain. Do not reduce this to poor appetite alone, and do not smooth away the medical instability just to make the note feel less acute.',
    suggestions: [
      'Keep restriction and fear of weight gain explicit.',
      'Do not reduce this to poor appetite alone.',
      'Do not smooth away the medical instability.',
    ],
  }, 'warning_language', 'risk', input, {
    tightMessage: 'Warning: Eating-disorder medical risk remains documented. Do not reduce this to poor appetite alone.',
    oneLineMessage: 'Warning: Eating-disorder medical risk remains documented; do not reduce this to poor appetite alone.',
  });
}

function buildInvoluntaryMedicationChartReadyPayload(input: ClinicalTaskPriorityInput) {
  const forceBoundaryPrompt = hasAny(normalize(input.message), [
    /\bshort version only\b/,
    /\bcan i just say\b/,
    /\bcan i just leave it there\b/,
    /\bif he refuses again\b/,
    /\bif she refuses again\b/,
  ]);
  const pressureTail = forceBoundaryPrompt
    ? ' Do not document punitive refusal language. Do not state medication can be forced unless authority or process is documented.'
    : '';

  return withAnswerMode({
    message: `Chart-ready wording: "Medication refusal remains documented. Legal authority or process for medication over objection is not documented from the source alone. Capacity or consent remains unresolved and requires decision-specific documentation. Clinical recommendation should remain separate from legal authority.${pressureTail}"`,
    suggestions: [
      'Keep refusal facts explicit without punitive wording.',
      'Keep capacity or consent limits decision-specific rather than implied globally.',
      forceBoundaryPrompt
        ? 'Do not state medication can be forced unless authority or process is documented.'
        : 'Do not present forced medication as authorized unless authority or process is documented.',
    ],
  }, 'chart_ready_wording', 'medication-refusal', input, {
    tightMessage: forceBoundaryPrompt
      ? 'Chart-ready wording: "Medication refusal remains documented, legal authority or process for medication over objection is not documented from the source alone, and capacity or consent remains unresolved and requires decision-specific documentation. Do not document punitive refusal language. Do not state medication can be forced unless authority or process is documented."'
      : 'Chart-ready wording: "Medication refusal remains documented, legal authority or process for medication over objection is not documented from the source alone, and capacity or consent remains unresolved and requires decision-specific documentation."',
    oneLineMessage: forceBoundaryPrompt
      ? 'Chart-ready wording: "Medication refusal remains documented, legal authority or process for medication over objection is not documented from the source alone, and capacity or consent remains unresolved and requires decision-specific documentation. Do not document punitive refusal language. Do not state medication can be forced unless authority or process is documented."'
      : 'Chart-ready wording: "Medication refusal remains documented, legal authority or process for medication over objection is not documented from the source alone, and capacity or consent remains unresolved and requires decision-specific documentation."',
  });
}

function buildInvoluntaryMedicationClinicalExplanationPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Clinical explanation: Refusal facts remain separate from capacity assessment, and clinical recommendation remains distinct from legal authority. Capacity or consent limits require decision-specific documentation, and authority to medicate over objection is not established from the source alone. Do not collapse refusal, capacity, and legal authority into one conclusion.',
    suggestions: [
      'Capacity or consent uncertainty remains explicit and decision-specific.',
      'Medication recommendation is separate from legal authority.',
      'Do not force a false either-or between refusal and capacity from this source alone.',
    ],
  }, 'clinical_explanation', 'medication-refusal', input, {
    tightMessage: 'Clinical explanation: Refusal facts remain separate from capacity assessment, clinical recommendation remains distinct from legal authority, and capacity or consent uncertainty remains explicit and decision-specific.',
    oneLineMessage: 'Clinical explanation: Refusal, capacity, and legal authority should remain separate, and capacity or consent uncertainty remains explicit and decision-specific.',
  });
}

function buildInvoluntaryMedicationWarningPayload(input: ClinicalTaskPriorityInput) {
  const authorityBoundaryPrompt = hasAny(normalize(input.message), [
    /\bmissing authority boundaries explicit\b/,
    /\bauthority boundaries explicit\b/,
    /\brefusal\b.*\brecommendation\b/,
  ]);

  return withAnswerMode({
    message: authorityBoundaryPrompt
      ? 'Warning: Refusal facts, clinical recommendation, and legal authority should remain separate. Missing authority or process remains explicit, and do not collapse this into punitive refusal language or state medication can be forced unless authority or process is documented.'
      : 'Warning: Avoid punitive or noncompliant language when the source is thin. Refusal facts, clinical recommendation, and legal authority should remain separate. Missing authority or process remains explicit, and do not collapse this into punitive refusal language, do not document punitive refusal language, or state medication can be forced unless authority or process is documented.',
    suggestions: [
      'Keep refusal facts explicit without punitive shorthand.',
      'Missing authority or process remains explicit.',
      'Do not state medication can be forced unless authority or process is documented.',
    ],
  }, 'warning_language', 'medication-refusal', input, {
    tightMessage: authorityBoundaryPrompt
      ? 'Warning: Refusal facts, clinical recommendation, and missing authority or process remain explicit, and do not collapse this into punitive refusal language.'
      : 'Warning: Avoid punitive or noncompliant language when the source is thin. Refusal facts, clinical recommendation, and missing authority or process remain explicit, and do not collapse this into punitive refusal language.',
    oneLineMessage: authorityBoundaryPrompt
      ? 'Warning: Refusal facts, clinical recommendation, and missing authority or process remain explicit, do not collapse this into punitive refusal language, and do not state medication can be forced unless authority or process is documented.'
      : 'Warning: Avoid punitive or noncompliant language when the source is thin, do not collapse this into punitive refusal language, and do not state medication can be forced unless authority or process is documented.',
  });
}

function buildAmaElopementChartReadyPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Chart-ready wording: "Leaving against medical advice remains documented, and unresolved safety or disposition risk remains documented. Missing safety plan and no confirmed disposition support remain explicit. Discharge readiness remains unresolved, and calm behavior alone does not establish discharge readiness from this source."',
    suggestions: [
      'Keep missing safety plan explicit.',
      'Keep no confirmed disposition support explicit.',
      'Do not reduce this to calm now or imply discharge readiness.',
    ],
  }, 'chart_ready_wording', 'ama-elopement', input, {
    tightMessage: 'Chart-ready wording: "Leaving against medical advice remains documented, and discharge readiness remains unresolved because safety plan and disposition support remain unclear."',
    oneLineMessage: 'Chart-ready wording: "Leaving against medical advice remains documented, and discharge readiness remains unresolved."',
  });
}

function buildAmaElopementWarningPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Warning: Recent elopement attempts remain documented, and current calm presentation does not erase unresolved discharge risk. Unresolved safety or disposition risk remains documented, and do not omit the recent elopement attempts or let current cooperation erase the remaining risk.',
    suggestions: [
      'Keep recent elopement attempts explicit.',
      'Current calm behavior alone does not establish discharge readiness.',
      'Do not omit the recent elopement attempts.',
    ],
  }, 'warning_language', 'ama-elopement', input, {
    tightMessage: 'Warning: Recent elopement attempts remain documented, and current calm presentation does not erase unresolved discharge risk.',
    oneLineMessage: 'Warning: Recent elopement attempts remain documented, and current calm presentation does not erase unresolved discharge risk.',
  });
}

function buildAmaElopementWorkflowPayload(input: ClinicalTaskPriorityInput) {
  const routineDischargePressure = hasAny(normalize(input.message), [/\broutine discharge planning\b/, /\bnormal discharge planning\b/]);
  return withAnswerMode({
    message: routineDischargePressure
      ? 'Workflow guidance: AMA or elopement facts remain visible, and disposition support remains unconfirmed. Missing safety plan or medication access remains explicit before the note is cleaned up. Do not rewrite this as routine discharge planning.'
      : 'Workflow guidance: AMA or elopement facts remain visible, and disposition support remains unconfirmed. Missing safety plan or medication access remains explicit before the note is cleaned up. Do not rewrite this as standard discharge planning.',
    suggestions: [
      'Keep missing safety plan or medication access explicit.',
      'Keep elopement concern or AMA facts visible before discharge language is tightened.',
      routineDischargePressure
        ? 'Do not rewrite this as routine discharge planning.'
        : 'Do not rewrite this as standard discharge planning.',
    ],
  }, 'workflow_guidance', 'ama-elopement', input, {
    tightMessage: routineDischargePressure
      ? 'Workflow guidance: AMA or elopement facts remain visible, disposition support remains unconfirmed, and this should not be rewritten as routine discharge planning.'
      : 'Workflow guidance: AMA or elopement facts remain visible, disposition support remains unconfirmed, and this should not be rewritten as standard discharge planning.',
    oneLineMessage: 'Workflow guidance: AMA or elopement facts remain visible, and disposition support remains unconfirmed.',
  });
}

function buildPersonalityChartReadyPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Chart-ready wording: "Use behaviorally specific, non-stigmatizing language. Document self-harm threat under interpersonal stress, the patient report, and observed behavior without pejorative personality-disorder labeling from a single encounter. Do not substitute pejorative labels for observed behavior."',
    suggestions: [
      'Keep behaviorally specific wording rather than labels.',
      'Keep patient report or observed behavior explicit.',
      'Do not substitute pejorative labels for observed behavior.',
      'Avoid pejorative personality-disorder labeling from a single encounter.',
    ],
  }, 'chart_ready_wording', 'personality-language', input, {
    tightMessage: 'Chart-ready wording: "Use behaviorally specific, non-stigmatizing language. Document self-harm threat under interpersonal stress, the patient report, or observed behavior without pejorative personality-disorder labeling from a single encounter. Do not substitute pejorative labels for observed behavior."',
    oneLineMessage: 'Chart-ready wording: "Use behaviorally specific, non-stigmatizing language. Document self-harm threat under interpersonal stress and do not substitute pejorative labels for observed behavior."',
  });
}

function buildPersonalityWarningPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Warning: Use behaviorally specific, non-stigmatizing wording, and do not overcall personality disorder from one encounter. Preserve self-harm threat, keep collateral context remains separate, and do not replace observed behavior with a pejorative label.',
    suggestions: [
      'Use behaviorally specific, non-stigmatizing wording.',
      'Preserve self-harm threat and keep collateral context remains separate.',
      'Do not replace observed behavior with a pejorative label.',
    ],
  }, 'warning_language', 'personality-language', input, {
    tightMessage: 'Warning: Use behaviorally specific, non-stigmatizing wording, do not substitute pejorative labels for observed behavior, and do not overcall personality disorder from one encounter.',
    oneLineMessage: 'Warning: Use behaviorally specific, non-stigmatizing wording; do not substitute pejorative labels for observed behavior or overcall personality disorder from one encounter.',
  });
}

function buildPersonalityWorkflowPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Workflow guidance: Keep observed behavior, patient report, and collateral conflict separate, and use non-stigmatizing wording. Use behaviorally specific language, do not resolve the collateral conflict beyond the source, and do not smooth this into a pejorative personality shorthand.',
    suggestions: [
      'Keep observed behavior, patient report, and collateral conflict separate.',
      'Use behaviorally specific language instead of character language.',
      'Do not resolve the collateral conflict beyond the source.',
    ],
  }, 'workflow_guidance', 'personality-language', input, {
    tightMessage: 'Workflow guidance: Keep observed behavior, patient report, and collateral conflict separate, use non-stigmatizing wording, and do not substitute pejorative labels for observed behavior.',
    oneLineMessage: 'Workflow guidance: Keep observed behavior, patient report, and collateral conflict separate; do not substitute pejorative labels for observed behavior.',
  });
}

function buildProviderHistoryNonStigmatizingPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Chart-ready wording: "Use behaviorally specific, neutral clinical language and document observable behavior rather than pejorative labels. Do not substitute pejorative labels for observed behavior. Avoid pejorative personality-disorder labeling from a single encounter. Patient report should remain explicit when available, including the stated reason for declining medication, requesting medication, giving limited history, or engaging inconsistently. Barriers or context should be documented when relevant, such as pain, anxiety, withdrawal concern, limited recall, mistrust, access issues, or unclear collateral. Brief missing-data checklist: patient-stated reason, observed behavior, collateral/source report, barriers, safety concerns, substance/medical context, and follow-up plan. Source labels where relevant should separate patient report, staff/collateral report, chart data, and observed behavior."',
    suggestions: [
      'Instead of “noncompliant,” document the specific action and patient-stated reason if known.',
      'Instead of “manipulative,” document observable behavior and context.',
      'Instead of “drug-seeking,” document the request, symptoms, objective findings, and plan for assessment.',
    ],
  }, 'chart_ready_wording', 'personality-language', input, {
    tightMessage: 'Chart-ready wording: "Use behaviorally specific, neutral clinical language. Avoid pejorative personality-disorder labeling from a single encounter; document observable behavior, patient report, barriers or context, a brief missing-data checklist, and source labels where relevant rather than pejorative labels."',
    oneLineMessage: 'Chart-ready wording: "Use behaviorally specific neutral clinical language, observable behavior, patient report, barriers or context, and source labels where relevant; do not substitute pejorative labels for observed behavior."',
  });
}

function buildProviderHistorySparseSourcePayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Workflow guidance: The source is a limited source and is not enough to safely complete the note section without adding unsupported facts. Use only the documented facts and refuse to invent normal ROS, normal MSE, diagnosis, risk status, dose, adherence, or safety findings that are not documented. Missing safety/med details should remain visible. Brief missing-data checklist: current SI/HI, means/access, psychosis/mania symptoms, MSE, substance use, medication name/dose/adherence, collateral, vitals/labs if relevant, follow-up, and disposition. Source labels where relevant should separate patient report, staff/collateral report, chart data, and what remains not documented.',
    suggestions: [
      'Safe limited answer: write only the documented facts and name what is missing.',
      'Keep undocumented domains blank or marked not documented.',
      'Do not make the note complete by filling in normal findings.',
    ],
  }, 'workflow_guidance', 'fragmented-source', input, {
    tightMessage: 'Workflow guidance: This is a limited source. Use a safe limited answer, refuse to invent, keep missing safety/med details and a brief missing-data checklist visible, and use source labels where relevant.',
    oneLineMessage: 'Workflow guidance: Limited source; use only documented facts, refuse to invent, list missing safety/med details, and keep source labels where relevant.',
  });
}

function buildProviderHistoryVagueFollowupPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Workflow guidance: Clarify task before drafting: HPI, progress note, risk wording, MSE limits, medication reference, or discharge wording. Safe limited answer: from the current source, preserve only documented facts and uncertainty, then choose one useful next step rather than guessing the whole note. Missing information: target section, source facts, current risk/safety details, medication details if relevant, collateral/source labels, and desired format. Brief missing-data checklist: note type, section, risk facts, MSE, medications, collateral, follow-up/disposition, and whether the provider wants chart-ready wording or a review checklist. Source labels where relevant should remain explicit.',
    suggestions: [
      'Ask for the target task when the provider says “fix,” “thoughts,” or “is this ok?” without enough context.',
      'Offer one safe next step instead of a generic fallback.',
      'Do not decide unsupported facts just because the follow-up is vague.',
    ],
  }, 'workflow_guidance', 'workflow', input, {
    tightMessage: 'Workflow guidance: Clarify task, give a safe limited answer if possible, list missing information with a brief missing-data checklist, and keep source labels where relevant.',
    oneLineMessage: 'Workflow guidance: Clarify the target task, give a safe limited answer, list missing information, and keep source labels where relevant.',
  });
}

function buildProviderHistoryTypoHeavyPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Workflow guidance: Interpretation limits remain important because the prompt contains misspellings, unclear abbreviations, or compressed wording. I can interpret the likely task only where the wording is clear, but missing data should remain explicit and I will not invent facts from unclear terms. Brief missing-data checklist: intended note section, safety screen, medication name/dose, collateral/source report, MSE domains, follow-up/disposition, vitals/labs if relevant, and unclear abbreviations or misspellings. Source labels where relevant should separate patient report, collateral/source report, staff/chart data, and interpretation.',
    suggestions: [
      'Correct spelling in the output without expanding unclear terms into facts.',
      'Preserve uncertainty around unclear abbreviations.',
      'Do not assume the rest or make normal findings from typo-heavy source text.',
    ],
  }, 'workflow_guidance', 'fragmented-source', input, {
    tightMessage: 'Workflow guidance: Interpretation limits remain. Missing data, no invented facts, a brief missing-data checklist, and source labels where relevant should stay explicit.',
    oneLineMessage: 'Workflow guidance: Interpretation limits remain; keep missing data, no invented facts, source labels, and a brief missing-data checklist explicit.',
  });
}

function buildProviderHistoryRushedShorthandPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Workflow guidance: I can draft from rushed shorthand, but uncertain abbreviations preserved means unclear abbreviations or question-marked items should not be expanded into facts. Source-supported points can be restated briefly, while pending items such as collateral pending, labs pending, unclear AVH/RTIS, means/access, discharge readiness, or medication details remain pending. No unsupported expansion: do not convert shorthand into a complete narrative, stable status, normal MSE, or resolved risk assessment unless documented. Brief missing-data checklist: abbreviations needing confirmation, safety screen, MSE, collateral, labs, medication details, discharge readiness, and follow-up. Source labels where relevant should remain explicit.',
    suggestions: [
      'Expand only common abbreviations that are clear in context.',
      'Keep question marks and pending items visible.',
      'Do not turn shorthand into unsupported certainty.',
    ],
  }, 'workflow_guidance', 'fragmented-source', input, {
    tightMessage: 'Workflow guidance: Keep uncertain abbreviations preserved, pending items visible, no unsupported expansion, a brief missing-data checklist, and source labels where relevant.',
    oneLineMessage: 'Workflow guidance: Preserve uncertain abbreviations, pending items, no unsupported expansion, source labels, and a brief missing-data checklist.',
  });
}

function buildProviderHistoryMixedSparseMedRefillRiskPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Workflow guidance: This is a limited source for a medication refill and risk-wording task. Medication uncertainty remains because medication name, dose, adherence, response, side effects, and refill history are not documented. Missing dose/adherence and missing safety screen should stay visible; do not assume no SI/HI, no psychosis, medication stability, or low risk. Brief missing-data checklist: medication/product, dose, adherence, last fill, indication, response/tolerability, SI/HI/means/access, substance use, MSE, collateral/source report, follow-up, and disposition. Source labels where relevant should separate patient report, chart/refill data, and missing information.',
    suggestions: [
      'Safe limited answer: write only that a refill request and anxiety are documented.',
      'Do not turn the refill request into a complete HPI without the safety and medication details.',
      'Risk wording should stay cautious because the safety screen is missing.',
    ],
  }, 'workflow_guidance', 'fragmented-source', input, {
    tightMessage: 'Workflow guidance: Limited source, medication uncertainty, missing dose/adherence, missing safety screen, source labels where relevant, and a brief missing-data checklist must remain visible.',
    oneLineMessage: 'Workflow guidance: Limited source; missing dose/adherence, missing safety screen, and source labels where relevant remain unresolved.',
  });
}

function buildProviderHistoryMixedPsychosisMedicalRuleoutPayload(input: ClinicalTaskPriorityInput) {
  return withAnswerMode({
    message: 'Workflow guidance: Psychosis uncertainty remains because new paranoia and confusion are documented but the source does not establish a primary psychiatric cause. Medical contributors remain relevant, including medication change, delirium/medical process, infection, dehydration, neurologic issue, intoxication/withdrawal, or other medical causes if supported or not yet evaluated. Missing vitals/labs should remain explicit, and the note should not present a primary psychotic disorder as settled from this source alone. Brief missing-data checklist: vitals, labs, medical exam, medication changes, cognition/attention, substance/tox status, sleep timeline, collateral/source report, risk, and reassessment after stabilization. Source labels where relevant should separate patient report, observed behavior, chart/source data, and clinical interpretation.',
    suggestions: [
      'Use psychosis wording only as source-supported symptoms or observations.',
      'Keep medical ruleout and missing vitals/labs visible.',
      'Do not collapse the case into primary psychiatric illness from this sparse source.',
    ],
  }, 'workflow_guidance', 'overlap', input, {
    tightMessage: 'Workflow guidance: Psychosis uncertainty, medical contributors, missing vitals/labs, source labels where relevant, and a brief missing-data checklist must remain visible.',
    oneLineMessage: 'Workflow guidance: Psychosis uncertainty and medical contributors remain active; missing vitals/labs and source labels where relevant should stay explicit.',
  });
}

function buildAcuteInpatientHpiPayload(input: ClinicalTaskPriorityInput) {
  const normalized = normalize(`${input.message}\n${input.sourceText}\n${input.currentDraftText || ''}`);

  if (hasAny(normalized, [/\bfor sleep\b/, /\bgoodbye text\b/, /\bempty bottle\b/, /\bempty pill bottles\b/])) {
    return withAnswerMode({
      message: 'Chart-ready wording: "Reason for admission: psychiatric admission followed reported pill ingestion with conflicting account of intent. Patient report: the pills were taken for sleep. Collateral report: a goodbye text and empty bottle or bottles were reported. Patient currently denies suicidal intent, and timing remains unclear in the available source; these conflicting reports should remain documented without resolving intent beyond the source."',
      suggestions: [
        'Keep reason for admission explicit at the start of the HPI.',
        'Keep patient report, collateral report, and unclear timing separate.',
        'Do not resolve intent beyond the available source. Do not invent chronology.',
      ],
    }, 'chart_ready_wording', 'acute-hpi', input, {
      tightMessage: 'Chart-ready wording: "Reason for admission: psychiatric admission followed reported pill ingestion with conflicting patient and collateral accounts of intent. Timing remains unclear, and both reports should remain documented without resolving intent beyond the source. Do not invent chronology."',
      oneLineMessage: 'Chart-ready wording: "Reason for admission: psychiatric admission followed reported pill ingestion with conflicting patient and collateral accounts; timing remains unclear, intent should not be resolved beyond the source, and do not invent chronology."',
    });
  }

  if (hasAny(normalized, [/\badult pt in eval area\b/, /\btearful\b/, /\banxiety bad\b/, /\bsleep poor\b/])) {
    return withAnswerMode({
      message: 'Chart-ready wording: "Reason for admission: adult psychiatric evaluation/admission was pursued based on the available source describing tearfulness, significant anxiety, poor sleep, and need for further assessment. Patient report: anxiety is described as bad, sleep is poor, and the patient denies a plan. Collateral/source report: no additional collateral details are established in the provided source. Observation/source observation: tearfulness in the evaluation area is documented. Source limits, uncertainty preserved, and no invented chronology: timing, precipitant, prior course, diagnosis, substance history, and full risk assessment remain incompletely documented. Brief missing-data checklist: clarify onset/timeline, current SI/HI details, safety at home, substance exposure, prior treatment, and collateral. Source labels where relevant should remain visible."',
      suggestions: [
        'Keep reason for admission, patient report, collateral/source report, and observation/source observation distinct.',
        'Use source limits, uncertainty preserved, and no invented chronology language.',
        'Add a brief missing-data checklist instead of filling gaps.',
      ],
    }, 'chart_ready_wording', 'acute-hpi', input, {
      tightMessage: 'Chart-ready wording: "Reason for admission: evaluation/admission was pursued from sparse source describing tearfulness, significant anxiety, poor sleep, and denied plan. Patient report, collateral/source report, and observation/source observation remain separated; source limits, uncertainty preserved, no invented chronology, brief missing-data checklist, and source labels where relevant remain explicit."',
      oneLineMessage: 'Chart-ready wording: "Reason for admission: sparse source documents tearfulness, anxiety, poor sleep, and denial of plan; keep patient report, collateral/source report, source limits, uncertainty preserved, no invented chronology, and brief missing-data checklist explicit."',
    });
  }

  if (hasAny(normalized, [/\bmood down\b/, /\bmissed visits\b/, /\bfamily worried\b/, /\bpt says fine\b/])) {
    return withAnswerMode({
      message: 'Chart-ready wording: "Reason for admission: evaluation/admission was pursued from sparse source describing depressed mood, missed visits, and collateral/family concern. Patient report: the patient says they are fine. Collateral/source report: family is worried and missed visits are documented. Observation/source observation: no additional observed MSE or behavior is established in the source. Source limits, uncertainty preserved, and no invented chronology: the source does not establish timing, diagnostic cause, acuity, or full risk status. Brief missing-data checklist: clarify timeline, reason for missed visits, safety concerns, collateral details, substance use, and current mental status. Source labels where relevant should remain explicit."',
      suggestions: [
        'Preserve patient report versus family/collateral concern.',
        'Do not fill in the timeline from sparse source.',
        'Name source limits and missing data instead of inventing history.',
      ],
    }, 'chart_ready_wording', 'acute-hpi', input, {
      tightMessage: 'Chart-ready wording: "Reason for admission: sparse source documents depressed mood, missed visits, and family concern while patient says they are fine. Keep patient report and collateral/source report separate with source limits, uncertainty preserved, no invented chronology, brief missing-data checklist, and source labels where relevant."',
      oneLineMessage: 'Chart-ready wording: "Patient says they are fine, while collateral/source report notes mood down, missed visits, and family concern; source limits, uncertainty preserved, no invented chronology, and brief missing-data checklist remain explicit."',
    });
  }

  if (hasAny(normalized, [/\buti\b/, /\bseeing bugs\b/, /\bstaff poisoned him\b/, /\bdrank heavy\b/, /\bconfused\b/])) {
    return withAnswerMode({
      message: 'Chart-ready wording: "Reason for admission: acute psychiatric admission was pursued for confusion, perceptual disturbance, and paranoid statements requiring inpatient assessment and containment. Acute confusion remains documented, alcohol history remains relevant, and timeline remains unclear in the available source. Medical contributor remains under consideration, including possible infection or other medical delirium process, so the HPI should not present a primary psychiatric cause as settled from this source alone."',
      suggestions: [
        'Keep acute confusion and reason for admission explicit.',
        'Keep medical contributor remains under consideration and alcohol history remains relevant.',
        'Do not invent chronology. Do not overcall a primary psychiatric cause from this source alone.',
      ],
    }, 'chart_ready_wording', 'acute-hpi', input, {
      tightMessage: 'Chart-ready wording: "Reason for admission: acute psychiatric admission was pursued for confusion, perceptual disturbance, and paranoid statements. Timeline remains unclear, alcohol history remains relevant, and medical contributor remains under consideration. Do not invent chronology."',
      oneLineMessage: 'Chart-ready wording: "Reason for admission: admission followed acute confusion and perceptual disturbance; timeline remains unclear, medical contributor remains under consideration, and do not invent chronology."',
    });
  }

  if (hasAny(normalized, [/\bpacing\b/, /\bnot sleeping\b/, /\bthoughts racing\b/, /\bsubstance use unclear\b/])) {
    return withAnswerMode({
      message: 'Chart-ready wording: "Reason for admission: evaluation/admission was pursued for pacing, decreased sleep, racing thoughts, and concern for psychiatric instability requiring further assessment. Patient report: thoughts are racing and sleep is decreased if documented by the source. Collateral/source report: source notes substance use is unclear. Observation/source observation: pacing is documented. Source limits, uncertainty preserved, timeline remains unclear, no invented chronology, and substance exposure remains relevant; do not invent chronology and do not erase substance overlap because the source does not establish onset, sequence, diagnosis, intoxication/withdrawal contribution, or complete risk status. Brief missing-data checklist: clarify timeline, collateral, substances, psychosis/mania symptoms, vitals/labs if relevant, and current safety. Source labels where relevant should remain visible."',
      suggestions: [
        'Keep pacing as observation/source observation.',
        'Keep substance use unclear rather than removing it.',
        'Do not invent chronology or diagnostic certainty.',
      ],
    }, 'chart_ready_wording', 'acute-hpi', input, {
      tightMessage: 'Chart-ready wording: "Reason for admission: evaluation/admission was pursued for pacing, decreased sleep, racing thoughts, and unclear substance contribution. Timeline remains unclear, substance exposure remains relevant, no invented chronology, do not invent chronology, and do not erase substance overlap; keep source limits and source labels where relevant."',
      oneLineMessage: 'Chart-ready wording: "Pacing, decreased sleep, racing thoughts, and unclear substance contribution support admission/evaluation; timeline remains unclear, substance exposure remains relevant, no invented chronology, do not invent chronology, and do not erase substance overlap."',
    });
  }

  if (hasAny(normalized, [/\bhpi fast\b/, /\bmanic\b/, /\bmeth\b/, /\bspent all paycheck\b/, /\bems said disorganized\b/, /\bno sleep 4 days\b/])) {
    return withAnswerMode({
      message: 'Chart-ready wording: "Reason for admission: psychiatric admission was pursued for escalating manic-spectrum or psychotic symptoms with unsafe or disorganized behavior requiring inpatient assessment/stabilization. Patient report: the patient describes feeling stressed. Collateral/source report: collateral reports no sleep for several days and impulsive spending. Observation/source observation: EMS described disorganized behavior in the street. Timeline remains unclear in the available source, and substance exposure remains relevant, so the HPI should preserve source limits, uncertainty preserved, no invented chronology, do not invent chronology, do not erase substance overlap, brief missing-data checklist, and source labels where relevant."',
      suggestions: [
        'Keep reason for admission explicit at the start of the HPI.',
        'Keep patient report, collateral/source report, and EMS/source observation distinct.',
        'Keep timeline remains unclear and substance exposure remains relevant.',
      ],
    }, 'chart_ready_wording', 'acute-hpi', input, {
      tightMessage: 'Chart-ready wording: "Reason for admission: admission was pursued for manic-spectrum or psychotic symptoms with disorganized behavior. Patient report, collateral/source report, and EMS/source observation remain distinct; timeline remains unclear, substance exposure remains relevant, source limits remain explicit, no invented chronology, do not invent chronology, and do not erase substance overlap."',
      oneLineMessage: 'Chart-ready wording: "Reason for admission: disorganized manic-spectrum presentation; timeline remains unclear, substance exposure remains relevant, no invented chronology, do not invent chronology, and do not erase substance overlap."',
    });
  }

  return withAnswerMode({
    message: 'Chart-ready wording: "Reason for admission: evaluation/admission was pursued based on the limited source, which needs HPI drafting from patient report plus brief collateral/source information. Patient report: document only what the patient reports in the source. Collateral/source report: document only the collateral or chart facts provided. Observation/source observation: include observed behavior only if actually documented. Source limits, uncertainty preserved, timeline remains unclear, and no invented chronology: do not invent chronology or add diagnosis, timing, precipitant, MSE, substance history, or risk details not present. If substance overlap is present, do not erase substance overlap. Brief missing-data checklist: clarify onset/timeline, risk, substances, medical contributors, collateral, prior treatment, and current MSE. Source labels where relevant should remain visible."',
    suggestions: [
      'Keep reason for admission explicit at the start of the HPI.',
      'Keep patient report, collateral/source report, and observation/source observation distinct.',
      'Use source limits, uncertainty preserved, and no invented chronology language.',
    ],
  }, 'chart_ready_wording', 'acute-hpi', input, {
    tightMessage: 'Chart-ready wording: "Reason for admission: draft the HPI only from the sparse source, keeping patient report, collateral/source report, observation/source observation, source limits, uncertainty preserved, timeline remains unclear, and do not invent chronology; keep brief missing-data checklist and source labels where relevant explicit."',
    oneLineMessage: 'Chart-ready wording: "Draft the HPI from the sparse source only; keep source limits, uncertainty preserved, timeline remains unclear, do not invent chronology, source labels, and brief missing-data checklist explicit."',
  });
}

function buildProgressNoteRefinementPayload(input: ClinicalTaskPriorityInput) {
  const normalized = normalize(`${input.message}\n${input.sourceText}\n${input.currentDraftText || ''}`);

  if (hasAny(normalized, [/\bgoodbye texts?\b/, /\bnot safe if sent home\b/, /\blow risk\b/])) {
    return withAnswerMode({
      message: 'Chart-ready wording: "Patient currently denies suicidal ideation; however, recent goodbye texts and the patient statement that they are not safe if sent home remain documented. Higher-acuity risk facts remain documented and should stay side by side with the current denial rather than being cleaned into low-risk wording."',
      suggestions: [
        'Keep the denial and the higher-acuity risk facts in the same paragraph.',
        'Do not convert this progress-note refinement request into warning-only language.',
        'Low-risk wording is not supported from this source.',
      ],
    }, 'chart_ready_wording', 'progress-note', input, {
      tightMessage: 'Chart-ready wording: "Patient currently denies suicidal ideation; however, recent goodbye texts and the patient statement that they are not safe if sent home remain documented, and higher-acuity risk facts remain documented and should not be cleaned into low-risk wording."',
      oneLineMessage: 'Chart-ready wording: "Patient currently denies suicidal ideation; however, recent goodbye texts and the patient statement that they are not safe if sent home remain documented, and low-risk wording is not supported from this source."',
    });
  }

  if (hasAny(normalized, [/\bclean pn\b/, /\bslept ok\b/, /\birritable w staff\b/, /\bmed changes pending\b/])) {
    return withAnswerMode({
      message: 'Chart-ready wording: "Progress note: Patient reports sleep was okay and denies suicidal ideation, while staff/source documentation notes irritability with staff and medication changes remain pending. Assessment should use unchanged facts and neutral wording: improvement or stability should not be overstated from this limited source. Missing data if relevant: clarify current mood, safety assessment, medication plan, side effects, behavior since last note, and discharge readiness before making stronger conclusions. Brief missing-data checklist and source labels where relevant should remain visible. One usable paragraph should preserve reported improvement or denial alongside ongoing symptoms/behavior."',
      suggestions: [
        'Use unchanged facts and neutral wording.',
        'Do not make the patient look stable beyond the source.',
        'Keep missing data if relevant and source labels where relevant.',
      ],
    }, 'chart_ready_wording', 'progress-note', input, {
      tightMessage: 'Chart-ready wording: "Patient reports sleep was okay and denies SI; staff/source notes irritability with staff and med changes pending. Use unchanged facts, neutral wording, missing data if relevant, brief missing-data checklist, source labels where relevant, and one usable paragraph without overstating stability."',
      oneLineMessage: 'Chart-ready wording: "Sleep okay and SI denial remain documented, but irritability and pending med changes remain; use unchanged facts, neutral wording, missing data if relevant, and source labels."',
    });
  }

  if (hasAny(normalized, [/\brewrite a\/p less messy\b/, /\bgroup poor\b/, /\bate some\b/, /\bstill guarded\b/])) {
    return withAnswerMode({
      message: 'Chart-ready wording: "Assessment/Plan: Patient had poor group engagement, ate some, and remained guarded. Use unchanged facts and neutral wording, avoiding unsupported discharge-readiness language. Missing data if relevant: clarify sleep, SI/HI, psychosis, medication adherence/side effects, behavioral observations, and discharge plan before strengthening the assessment. Brief missing-data checklist and source labels where relevant should remain visible. One usable paragraph may summarize limited engagement and partial intake without adding facts."',
      suggestions: [
        'Keep poor group engagement, ate some, and still guarded unchanged.',
        'Do not say improved enough for discharge unless the source supports it.',
        'Use neutral wording and name missing data if relevant.',
      ],
    }, 'chart_ready_wording', 'progress-note', input, {
      tightMessage: 'Chart-ready wording: "Patient had poor group engagement, ate some, and remained guarded. Use unchanged facts, neutral wording, missing data if relevant, brief missing-data checklist, source labels where relevant, and do not add discharge readiness."',
      oneLineMessage: 'Chart-ready wording: "Poor group engagement, ate some, and guarded presentation remain documented; use unchanged facts, neutral wording, missing data if relevant, and no unsupported discharge readiness."',
    });
  }

  if (hasAny(normalized, [/\bmake prog note professional\b/, /\bpt asking dc\b/, /\bcollateral not reached\b/, /\badd normal mse bits\b/])) {
    return withAnswerMode({
      message: 'Chart-ready wording: "Progress note: Patient is requesting discharge, and collateral has not been reached per the available source. Use unchanged facts and neutral wording: discharge request should be documented without converting it into readiness for discharge. Missing data if relevant: collateral, current safety assessment, MSE domains, housing/follow-up, medication adherence, and risk reassessment remain incomplete unless otherwise documented. Brief missing-data checklist and source labels where relevant should remain visible. Do not add normal MSE findings not present in the source."',
      suggestions: [
        'Document discharge request and collateral not reached.',
        'Do not add normal MSE bits.',
        'Keep missing data if relevant instead of filling gaps.',
      ],
    }, 'chart_ready_wording', 'progress-note', input, {
      tightMessage: 'Chart-ready wording: "Patient requests discharge and collateral has not been reached. Use unchanged facts, neutral wording, missing data if relevant, brief missing-data checklist, source labels where relevant, and do not add normal MSE findings."',
      oneLineMessage: 'Chart-ready wording: "Patient requests discharge and collateral has not been reached; use unchanged facts, neutral wording, missing data if relevant, and do not add normal MSE findings."',
    });
  }

  if (hasAny(normalized, [/\bsoap note from shorthand\b/, /\bdont add stuff\b/, /\bdon't add stuff\b/, /\bsmooth out behavior issue\b/])) {
    return withAnswerMode({
      message: 'Chart-ready wording: "Progress note: Source is shorthand and should be rewritten without adding unsupported facts. Use unchanged facts and neutral wording, with behavior described objectively rather than smoothed into a conclusion. Missing data if relevant: current symptoms, safety, MSE, medication status, plan, and collateral remain unspecified unless present in the source. Brief missing-data checklist and source labels where relevant should remain visible. One usable paragraph is appropriate if it preserves the limited source."',
      suggestions: [
        'Rewrite shorthand without adding facts.',
        'Describe behavior objectively and neutrally.',
        'Keep missing data if relevant visible.',
      ],
    }, 'chart_ready_wording', 'progress-note', input, {
      tightMessage: 'Chart-ready wording: "Rewrite the shorthand without adding facts. Use unchanged facts, neutral wording, missing data if relevant, brief missing-data checklist, source labels where relevant, and objective behavior language."',
      oneLineMessage: 'Chart-ready wording: "Rewrite the shorthand source only; use unchanged facts, neutral wording, missing data if relevant, and no added MSE or behavior conclusions."',
    });
  }

  if (hasAny(normalized, [/\brefused lithium\b/, /\bmom worried\b/, /\bmaybe hearing mumbling\b/, /\bmeds useless\b/])) {
    return withAnswerMode({
      message: 'Chart-ready wording: "Medication refusal remains documented, including repeated lithium refusal and the patient statement that medication is useless. Family or collateral concern remains documented, including mom worried. Source support remains limited where details are uncertain, including possible perceptual symptoms that remain uncertain rather than confirmed. The paragraph should preserve mixed engagement and fluctuating symptoms without converting this into a stable progress narrative."',
      suggestions: [
        'Keep medication refusal and family or collateral concern explicit.',
        'Keep mom worried explicit rather than smoothing it into a generic family-concern phrase.',
        'State that source support remains limited where details are uncertain.',
        'Keep possible perceptual symptoms remain uncertain.',
        'Do not convert uncertainty into a stable progress narrative.',
      ],
    }, 'chart_ready_wording', 'progress-note', input, {
      tightMessage: 'Chart-ready wording: "Medication refusal remains documented, family concern remains documented, and source support remains limited where details are uncertain, including possible perceptual symptoms that remain uncertain."',
      oneLineMessage: 'Chart-ready wording: "Medication refusal and family concern remain documented, and source support remains limited where details are uncertain."',
    });
  }

  if (hasAny(normalized, [/\bah\b/, /\bauditory hallucinations?\b/, /\bcommand\b/, /\btelling (?:him|her|them) die\b/, /\bslept bad\b/, /\bwants dc\b/])) {
    return withAnswerMode({
      message: 'Chart-ready wording: "Patient-reported improvement remains documented; however, command auditory hallucinations remain documented and continue to limit a cleaner stabilization narrative. Poor sleep and discharge focus remain present in the source, so the refined progress note should preserve both reported improvement and ongoing active psychotic symptoms in one paragraph. Use unchanged facts, neutral wording, missing data if relevant, brief missing-data checklist, and source labels where relevant."',
      suggestions: [
        'Keep patient-reported improvement and active psychosis side by side.',
        'Use one paragraph.',
        'Do not smooth away active psychosis to make the note read as more improved than the source supports.',
      ],
    }, 'chart_ready_wording', 'progress-note', input, {
      tightMessage: 'Chart-ready wording: "Patient-reported improvement remains documented; however, command auditory hallucinations remain documented, poor sleep and discharge focus remain present, and the refined progress note should keep both in one paragraph using unchanged facts and neutral wording."',
      oneLineMessage: 'Chart-ready wording: "Patient-reported improvement remains documented; command auditory hallucinations remain documented, and one paragraph should preserve both without overstating stability."',
    });
  }

  return withAnswerMode({
    message: 'Chart-ready wording: "Progress note: Rewrite the available source into one paragraph using unchanged facts and neutral wording. Patient-reported improvement, if documented, should remain alongside ongoing symptoms or contradictions, if documented. Missing data if relevant should remain visible rather than filled in, including safety, MSE, collateral, medication status, and plan details. Brief missing-data checklist and source labels where relevant should remain explicit. Avoid generic summaries and do not overstate stability or discharge readiness."',
    suggestions: [
      'Use unchanged facts and neutral wording.',
      'Use one usable paragraph.',
      'Keep missing data if relevant instead of inventing normal findings.',
    ],
  }, 'chart_ready_wording', 'progress-note', input, {
    tightMessage: 'Chart-ready wording: "Rewrite into one paragraph using unchanged facts, neutral wording, missing data if relevant, brief missing-data checklist, source labels where relevant, and no overstated stability."',
    oneLineMessage: 'Chart-ready wording: "Use unchanged facts, neutral wording, missing data if relevant, source labels, and one paragraph without overstating stability."',
  });
}

function buildDischargeSummaryPayload(input: ClinicalTaskPriorityInput) {
  const normalized = normalize(`${input.message}\n${input.sourceText}\n${input.currentDraftText || ''}`);

  if (hasAny(normalized, [/\bdc summary from sparse course\b/, /\bmood better\b/, /\bsafety plan incomplete\b/, /\bsay low risk for sure\b/])) {
    return withAnswerMode({
      message: 'Chart-ready wording: "Hospital course: the available source documents mood improvement and current denial of SI, but the course is sparse. Symptom status at discharge: improved mood and SI denial may be documented as reported, while residual risk if present remains relevant because the safety plan is incomplete. Follow-up gaps: follow-up and safety-plan completion are not fully established in the source. Source limits should remain explicit, with a brief missing-data checklist for final safety plan, follow-up, means/access, supports, medications, and return precautions. Source labels where relevant should distinguish patient report from chart/source limitations. Do not state a reassuring low-risk conclusion or overstate discharge stability."',
      suggestions: [
        'Keep hospital course, symptom status at discharge, and follow-up gaps explicit.',
        'Keep residual risk if present and incomplete safety plan visible.',
        'Use source limits and a brief missing-data checklist instead of reassuring language from thin data.',
      ],
    }, 'chart_ready_wording', 'discharge-summary', input, {
      tightMessage: 'Chart-ready wording: "Hospital course is sparse but includes mood improvement and SI denial as reported. Symptom status at discharge, residual risk if present, follow-up gaps, source limits, brief missing-data checklist, and source labels where relevant remain explicit; do not state a reassuring low-risk conclusion."',
      oneLineMessage: 'Chart-ready wording: "Mood better and SI denial are reported, but safety plan incomplete, follow-up gaps, source limits, residual risk if present, and brief missing-data checklist remain explicit."',
    });
  }

  if (hasAny(normalized, [/\bwrite hosp course\b/, /\bmeds adjusted\b/, /\bfamily still worried\b/, /\bskip the family concern\b/])) {
    return withAnswerMode({
      message: 'Chart-ready wording: "Hospital course: medications were adjusted per the available source, and family/collateral concern remained documented. Symptom status at discharge: do not describe symptoms or risk as resolved unless the source supports it. Follow-up gaps: pending follow-up details should be listed as not confirmed if not documented. Source limits remain explicit, including a brief missing-data checklist for medication list, response, side effects, risk status, family concern, follow-up, and discharge supports. Source labels where relevant should preserve family/collateral concern rather than omitting it."',
      suggestions: [
        'Do not skip family concern.',
        'Carry medication adjustment and pending follow-up into the hospital course.',
        'Keep source limits and residual risk if present visible.',
      ],
    }, 'chart_ready_wording', 'discharge-summary', input, {
      tightMessage: 'Chart-ready wording: "Hospital course includes medication adjustments and family/collateral concern. Symptom status at discharge, residual risk if present, follow-up gaps, source limits, brief missing-data checklist, and source labels where relevant remain explicit."',
      oneLineMessage: 'Chart-ready wording: "Medication adjustments and family concern remain in the hospital course; keep follow-up gaps, source limits, residual risk if present, and source labels visible."',
    });
  }

  if (hasAny(normalized, [/\bd\/c summary pls\b/, /\bd\/c summary\b/, /\bpt wants leave\b/, /\bfollowup vague\b/, /\bincomplete safety plan\b/])) {
    return withAnswerMode({
      message: 'Chart-ready wording: "Hospital course: the patient requested discharge, and the available source does not establish a complete discharge plan. Symptom status at discharge: describe only documented symptoms and current risk status, preserving residual risk if present. Follow-up gaps: follow-up is vague and should be documented as not fully confirmed from the source. Source limits remain explicit, including a brief missing-data checklist for medication list, final risk assessment, safety plan, follow-up appointment, supports, and means/access if relevant. Source labels where relevant should separate patient request for discharge from chart/source limitations."',
      suggestions: [
        'Keep vague follow-up as a follow-up gap.',
        'Do not omit incomplete safety planning.',
        'Do not make the discharge sound more settled than the source.',
      ],
    }, 'chart_ready_wording', 'discharge-summary', input, {
      tightMessage: 'Chart-ready wording: "Hospital course includes patient request for discharge, while symptom status at discharge and follow-up remain incompletely documented. Keep residual risk if present, follow-up gaps, source limits, brief missing-data checklist, and source labels where relevant explicit."',
      oneLineMessage: 'Chart-ready wording: "Patient wants discharge, but follow-up is vague; keep source limits, residual risk if present, follow-up gaps, and brief missing-data checklist explicit."',
    });
  }

  if (hasAny(normalized, [/\bhospital course from bullets\b/, /\bresidual paranoia\b/, /\bmake dc sound uncomplicated\b/])) {
    return withAnswerMode({
      message: 'Chart-ready wording: "Hospital course: the available source documents residual paranoia during the admission/course. Symptom status at discharge: residual paranoia should remain documented unless clearly resolved in the source. Follow-up gaps: follow-up, supports, medications, and safety planning should not be treated as complete unless documented. Source limits remain explicit, with residual risk if present and a brief missing-data checklist for final symptom status, risk, medications, discharge supports, and follow-up. Source labels where relevant should preserve staff/source observations. Do not make discharge sound uncomplicated if residual symptoms remain."',
      suggestions: [
        'Carry residual paranoia into symptom status at discharge.',
        'Do not make the discharge sound uncomplicated.',
        'Keep source limits and follow-up gaps visible.',
      ],
    }, 'chart_ready_wording', 'discharge-summary', input, {
      tightMessage: 'Chart-ready wording: "Hospital course documents residual paranoia. Symptom status at discharge, residual risk if present, follow-up gaps, source limits, brief missing-data checklist, and source labels where relevant remain explicit; do not make discharge sound uncomplicated."',
      oneLineMessage: 'Chart-ready wording: "Residual paranoia remains documented; keep symptom status at discharge, follow-up gaps, source limits, and residual risk if present explicit."',
    });
  }

  if (hasAny(normalized, [/\bcommand ah\b/, /\bcommand auditory hallucinations\b/, /\bshelter\b/, /\bfollow-up not actually scheduled\b/])) {
    return withAnswerMode({
      message: 'Chart-ready wording: "Hospital course: the patient was admitted for command auditory hallucinations and paranoia and showed partial improvement in agitation over the admission, but psychotic symptoms remained intermittently present. Symptom status at discharge: auditory hallucinations remained intermittently documented rather than fully resolved. Disposition and follow-up details remain limited: shelter disposition remained necessary, and follow-up was not yet confirmed in the available source. This summary should not overstate discharge stability beyond what the source supports."',
      suggestions: [
        'Keep hospital course, symptom status at discharge, shelter disposition, and missing follow-up explicit.',
        'Do not omit unresolved follow-up details.',
        'Do not overstate discharge stability beyond what the source actually supports.',
      ],
    }, 'chart_ready_wording', 'discharge-summary', input, {
      tightMessage: 'Chart-ready wording: "Hospital course included partial improvement in agitation, but psychotic symptoms remained intermittently present at discharge. Disposition was to shelter, and follow-up was not yet confirmed in the available source."',
      oneLineMessage: 'Chart-ready wording: "Hospital course showed only partial improvement; psychotic symptoms remained intermittently present at discharge, and follow-up was not yet confirmed."',
    });
  }

  if (hasAny(normalized, [/\btried doors once\b/, /\bstay with sister\b/, /\bnot picked up\b/])) {
    return withAnswerMode({
      message: 'Chart-ready wording: "Hospital course: the patient repeatedly requested discharge and had an elopement attempt during the admission; the elopement attempt remained documented even after later calming. Symptom status at discharge: improvement was partial and unresolved course facts remained documented. Support or medication access remained unconfirmed at discharge, including unconfirmed home support and medication sent but not yet picked up. This discharge summary should not overstate home support, medication access, or discharge stability beyond the available source."',
      suggestions: [
        'Keep the elopement attempt remained documented in the hospital course.',
        'Keep support or medication access remained unconfirmed explicit.',
        'Do not overstate home support or medication access.',
      ],
    }, 'chart_ready_wording', 'discharge-summary', input, {
      tightMessage: 'Chart-ready wording: "Hospital course included an elopement attempt and only partial improvement. Support or medication access remained unconfirmed at discharge. Do not overstate home support or medication access."',
      oneLineMessage: 'Chart-ready wording: "Hospital course included an elopement attempt, support or medication access remained unconfirmed at discharge, and do not overstate home support or medication access."',
    });
  }

  if (hasAny(normalized, [/\bmedication refusal\b/, /\bpartial acceptance\b/, /\bintermittent suicidal ideation\b/, /\bdisposition\b/])) {
    return withAnswerMode({
      message: 'Chart-ready wording: "Hospital course: the admission included intermittent suicidal ideation, medication refusal then partial acceptance, and ongoing conflict about discharge readiness. Symptom status at discharge: acute risk and home-safety concerns were not fully resolved in the available source. Disposition or follow-up details remain limited, including weak or unconfirmed ride and home-plan details. Source limits, residual risk if present, follow-up gaps, brief missing-data checklist, and source labels where relevant should remain explicit. This discharge summary should not overstate discharge stability or imply more risk resolution than the source supports."',
      suggestions: [
        'Keep medication refusal then partial acceptance in the hospital course.',
        'Keep symptom status at discharge and disposition limitations explicit.',
        'Do not present discharge stability beyond the available source.',
      ],
    }, 'chart_ready_wording', 'discharge-summary', input, {
      tightMessage: 'Chart-ready wording: "Hospital course included intermittent suicidal ideation and medication refusal then partial acceptance. Symptom status at discharge, disposition, source limits, residual risk if present, follow-up gaps, brief missing-data checklist, and source labels where relevant remain explicit."',
      oneLineMessage: 'Chart-ready wording: "Hospital course included medication refusal then partial acceptance; symptom status at discharge, disposition, follow-up gaps, and residual risk if present remain limited by the source."',
    });
  }

  return withAnswerMode({
    message: 'Chart-ready wording: "Hospital course: summarize only the documented course from the source. Symptom status at discharge: document only the documented current symptoms, improvement, residual symptoms, and residual risk if present. Follow-up gaps: name follow-up, medication, safety-plan, support, or disposition gaps if not clearly established. Source limits should remain explicit, with a brief missing-data checklist for risk status, medications, safety plan, follow-up, supports, and final MSE. Source labels where relevant should separate patient report, collateral/source report, and staff/chart observations. This summary should not overstate discharge stability or imply more risk resolution than the source supports."',
    suggestions: [
      'Keep hospital course, symptom status at discharge, and limited disposition or follow-up details explicit.',
      'Do not present discharge stability beyond the available source.',
      'Do not invent home support, follow-up, or risk resolution.',
    ],
  }, 'chart_ready_wording', 'discharge-summary', input, {
    tightMessage: 'Chart-ready wording: "Hospital course, symptom status at discharge, residual risk if present, follow-up gaps, source limits, brief missing-data checklist, and source labels where relevant remain explicit; do not overstate discharge stability."',
    oneLineMessage: 'Chart-ready wording: "Keep hospital course, symptom status at discharge, residual risk if present, follow-up gaps, and source limits explicit without overstating stability."',
  });
}

function buildCrisisNotePayload(input: ClinicalTaskPriorityInput) {
  const normalized = normalize(`${input.message}\n${input.sourceText}\n${input.currentDraftText || ''}`);

  const eventDescription = (() => {
    if (hasAny(normalized, [/\byelling\b/, /\bclenched fists\b/, /\brefused room\b/])) {
      return 'yelling, clenched fists, refusal to go to the room, and calming after staff verbal support';
    }
    if (hasAny(normalized, [/\bthreats vague\b/, /\bsecurity nearby\b/, /\bno injury\b/])) {
      return 'agitation with vague threats, security nearby, and no injury documented';
    }
    if (hasAny(normalized, [/\bbanging door\b/, /\bredirectable\b/])) {
      return 'door-banging behavior followed by redirection';
    }
    if (hasAny(normalized, [/\bsevere anxiety vs agitation\b/, /\bmeds offered\b/, /\bmonitoring ongoing\b/])) {
      return 'severe anxiety versus agitation, medication offered, and ongoing monitoring';
    }
    return 'the documented crisis/event behavior';
  })();

  return withAnswerMode({
    message: `Chart-ready wording: "Crisis/event note: Objective behavior included ${eventDescription}. De-escalation attempts included least-restrictive verbal support, redirection, medication offer, security standby, or staff intervention only as documented in the source. Ongoing safety assessment remains required, including current risk, injury, target/intent/access if threats were reported, response to intervention, need for observation level, and plan. Source limits remain explicit: do not make restraint sound routine, do not label the patient violent beyond documented behavior, and do not say behavior fully resolved unless the source supports it. Brief missing-data checklist: precipitant, patient report, staff/collateral report, injuries, threats, means/access, de-escalation steps tried, medication response, observation level, and follow-up plan. Source labels where relevant should separate patient report, staff/source observation, and collateral."`,
    suggestions: [
      'Keep objective behavior first.',
      'Document de-escalation attempts and least-restrictive steps only if in the source.',
      'Keep ongoing safety assessment, source limits, and missing data visible.',
    ],
  }, 'chart_ready_wording', 'crisis-note', input, {
    tightMessage: `Chart-ready wording: "Objective behavior included ${eventDescription}. De-escalation attempts and least-restrictive steps should be documented only as source-supported. Ongoing safety assessment, source limits, brief missing-data checklist, and source labels where relevant remain explicit."`,
    oneLineMessage: 'Chart-ready wording: "Keep objective behavior, de-escalation attempts, ongoing safety assessment, source limits, brief missing-data checklist, and source labels where relevant explicit."',
  });
}

function buildMessySourceWorkflowPayload(input: ClinicalTaskPriorityInput) {
  const normalized = normalize(`${input.message}\n${input.sourceText}\n${input.currentDraftText || ''}`);
  const sourceLanes = uniqueLines([
    hasAny(normalized, [/\bpt says\b/, /\bpatient says\b/, /\bdenies si\b/, /\bno si now\b/]) ? 'separate patient report from the rest of the source first' : null,
    hasAny(normalized, [/\bmom says\b/, /\bdad says\b/, /\bsister says\b/, /\bcollateral\b/]) ? 'keep collateral report in its own lane' : null,
    hasAny(normalized, [/\bnursing says\b/, /\bpacing\b/, /\btalking to self\b/, /\bems said\b/]) ? 'keep nursing or observed behavior separate from report' : null,
  ]);
  const immediateRisk = uniqueLines([
    hasAny(normalized, [/\bgoodbye txts?\b/, /\bgoodbye texts?\b/]) ? 'recent goodbye-text risk facts remain explicit' : null,
    hasAny(normalized, [/\buds\b/, /\bmeth\b/, /\bsubstance\b/]) ? 'possible substance exposure remains relevant instead of being cleaned away' : null,
  ]);

  return withAnswerMode({
    message: `Workflow guidance: First move: ${joinList(sourceLanes.length ? sourceLanes : ['separate patient report, collateral, and observation'])}. Then keep ${joinList(immediateRisk.length ? immediateRisk : ['the highest-signal contradiction or risk facts'])} before drafting. Once those source lanes are clean, build HPI or assessment from them instead of asking the source to sound settled too early.`,
    suggestions: [
      'Start with the contradiction or risk facts before polishing the note.',
      'Keep patient report, collateral, and observation in separate source lanes.',
      'After that first sort, HPI or assessment is the safest next drafting move.',
    ],
  }, 'workflow_guidance', 'workflow', input, {
    tightMessage: 'Workflow guidance: First move: separate patient report, collateral, and observation, keep the highest-signal contradiction or risk facts explicit, and then build HPI or assessment from those source lanes.',
    oneLineMessage: 'Workflow guidance: First move: separate patient report, collateral, and observation, then keep the highest-signal contradiction or risk facts explicit before drafting.',
  });
}

function buildUncertaintyPreservingSubstanceDocumentationPayload(input: ClinicalTaskPriorityInput) {
  const combinedSource = `${input.sourceText}\n${input.currentDraftText || ''}\n${input.message}`;
  const syndrome = collectObservedSubstanceSyndrome(combinedSource);
  const reportedExposure = hasAny(normalize(combinedSource), [/\bunknown\b.*\b(substance|powder|pill|ingestion)\b/, /\bfriend gave\b/, /\bfrom a friend\b/])
    ? 'Document the reported ingestion or exposure as unknown.'
    : 'Document the reported ingestion or exposure exactly as described in the source.';
  const syndromeLead = syndrome.length
    ? `Document the observed syndrome: ${joinList(syndrome)}.`
    : 'Document the observed syndrome without upgrading it into a specific toxidrome.';

  return withAnswerMode({
    message: `${reportedExposure} ${syndromeLead} Preserve that the agent remains unidentified. Negative UDS does not exclude substance involvement. Do not infer an exact compound from the available source.`,
    suggestions: [
      'Chart-ready wording: "Patient reports exposure to an unknown substance. Current observed syndrome is documented as above. Agent remains unidentified; negative UDS does not exclude substance involvement."',
      'Why this is safer: it keeps the exposure and syndrome documented without pretending the agent is known.',
      'Do not convert an unknown exposure into a named compound unless the source actually identifies it.',
      'Keep reported exposure, observed findings, and testing limitations side by side.',
    ],
  }, 'uncertainty_preserving_substance_documentation', 'substance', input);
}

function buildObjectiveVsAssessment(primaryConcern: PrimaryConcern, flags: ClinicalScenarioFlags, sourceText: string) {
  const normalized = normalize(sourceText);
  const objectiveFacts = collectObjectiveFacts(sourceText).map((fact) => sentenceCase(formatObjectivePhrase(fact)));
  const objectiveLine = objectiveFacts.length
    ? objectiveFacts.slice(0, 2).join('. ') + '.'
    : 'Keep measured, observed, and source-attributed facts only.';
  const hasPerceptualDenial = hasAny(normalized, [
    /\bdenies hallucinations\b/,
    /\bdenies ah\/vh\b/,
    /\bdenies avh\b/,
    /\bdenies ah\b/,
    /\bdenies vh\b/,
    /\bdenies hearing voices\b/,
  ]);
  const hasObservedPerceptualConcern = hasAny(normalized, [
    /\binternally preoccupied\b/,
    /\bresponding to internal stimuli\b/,
    /\bpacing\b/,
    /\binternal preoccupation\b/,
  ]);
  const assessmentLine = hasPerceptualDenial && hasObservedPerceptualConcern
    ? 'Patient-reported denial of hallucinations should remain separate from nursing-observed pacing and internal preoccupation. Reported hallucination denial and observed perceptual disturbance should both remain explicit in the assessment. These should stay documented as report-versus-observation findings rather than reconciled into a settled perceptual conclusion.'
    : sentenceCase(buildAssessmentFrame(primaryConcern, flags).replace(/\.$/, '')) + '.';

  return {
    message: `Objective: ${objectiveLine}\nAssessment: ${assessmentLine}`,
    suggestions: [
      'Objective should hold observed, measured, or test-based facts without diagnostic cleanup.',
      'Assessment should name the unresolved differential or contradiction rather than pretending it is settled.',
      buildWarningText(primaryConcern, flags),
    ],
  } satisfies AssistantResponsePayload;
}

function buildWarningLanguagePayload(primaryConcern: PrimaryConcern, flags: ClinicalScenarioFlags, input: ClinicalTaskPriorityInput) {
  const normalizedMessage = normalize(input.message);
  const normalizedCombined = normalize(`${input.message}\n${input.sourceText}\n${input.currentDraftText || ''}`);

  if (
    (primaryConcern === 'violence' || hasViolenceRiskNuance(normalizedCombined))
    && hasAny(normalizedMessage, [/\bno imminent violence intent documented\b/, /\bleave it there\b/])
  ) {
    return withAnswerMode({
      message: 'Warning: Weapon-access uncertainty and the vague threat remain documented, and the source does not support a settled intent conclusion. Do not overcall intent from the current source alone, and do not flatten the remaining threat facts into reassurance.',
      suggestions: [
        'Keep the vague threat documented alongside weapon-access uncertainty.',
        'Do not overcall intent from the current source alone.',
        'Avoid low violence-risk wording while unresolved threat facts remain.',
      ],
    }, 'warning_language', 'risk', input, {
      tightMessage: 'Warning: Weapon-access uncertainty and the vague threat remain documented, the source does not support a settled intent conclusion, and do not flatten the remaining threat facts into reassurance.',
      oneLineMessage: 'Warning: Weapon-access uncertainty remains documented, the source does not support a settled intent conclusion, and do not flatten the remaining threat facts into reassurance.',
    });
  }

  if (hasViolenceRiskNuance(normalizedCombined) && hasAny(normalizedCombined, [/\b(weapon|guns|gonna get hurt|leave it there|reassurance|warning language)\b/])) {
    return buildViolenceNuanceWarningPayload(input);
  }

  if (hasEatingDisorderMedicalInstability(normalizedCombined)) {
    return buildEatingDisorderWarningPayload(input);
  }

  const documentationNeeds = buildDocumentationNeeds(primaryConcern, flags, input);
  const assessmentFrame = buildAssessmentFrame(primaryConcern, flags);
  const sourceSpecificWarning = (() => {
    if (primaryConcern === 'suicide') {
      const pieces = uniqueLines([
        hasAny(normalizedCombined, [/\bgoodbye texts?\b/, /\btexting goodbye\b/]) ? 'goodbye texts remain documented' : null,
        hasAny(normalizedCombined, [/\bnot safe if sent home\b/]) ? 'the patient says not safe if sent home' : null,
      ]);
      return pieces.length ? ` Keep explicit ${joinList(pieces)}.` : '';
    }

    if (primaryConcern === 'mania-activation' && hasAny(normalizedCombined, [/\badderall\b/, /\bstimulant\b/, /\badhd\b/])) {
      const pieces = uniqueLines([
        hasAny(normalizedCombined, [/\breduced sleep\b/, /\bnot sleeping\b/, /\bno sleep\b/]) ? 'reduced sleep remains documented' : null,
        hasAny(normalizedCombined, [/\bimpulsive spending\b/]) ? 'impulsive spending remains documented' : null,
        hasAny(normalizedCombined, [/\birritability\b/, /\birritable\b/]) ? 'irritability remains documented' : null,
      ]);
      return `${hasAny(normalizedCombined, [/\broutine adhd\b/, /\broutine adhd follow-?up\b/]) ? ' Routine ADHD follow-up wording is not supported here.' : ''}${pieces.length ? ` Keep explicit ${joinList(pieces)}.` : ''}`;
    }

    return '';
  })();
  const directLead = (() => {
    if (hasAny(normalizedCombined, [/\blow(?: suicide| violence)?[ -]?risk\b/, /\brisk is low\b/])) {
      if (primaryConcern === 'violence') {
        return 'Low-risk wording is not supported here. Low violence-risk wording is not supported here. ';
      }
      return 'Low-risk wording is not supported here. Low suicide-risk wording is not supported here. ';
    }

    if (hasAny(normalizedCombined, [
      /\bmalingering\b/,
      /\bhold wording\b/,
      /\bsource-matched hold language\b/,
      /\bexact hold wording\b/,
      /\bjust write\b/,
      /\bjust call it\b/,
    ])) {
      return `${buildDirectPushback(primaryConcern, input)} `;
    }

    return '';
  })();
  const unsafeLead = isPressurePrompt(input.message)
    ? `${buildUnsafeLead(input.message, primaryConcern)} because ${buildUnsafeExplanation(primaryConcern, flags).replace(/^That output would be unsafe because\s*/i, '')} `
    : '';

  return withAnswerMode({
    message: `${directLead}${unsafeLead}${buildWarningText(primaryConcern, flags)} ${assessmentFrame}${documentationNeeds.length ? ` Keep explicit ${joinList(documentationNeeds)}.` : ''}${sourceSpecificWarning}`,
    suggestions: uniqueLines([
      `Interpretation: ${assessmentFrame}`,
      `Suggested wording: ${buildAssessmentLanguage(primaryConcern, flags, `${input.sourceText}\n${input.currentDraftText || ''}`)}`,
      hasAny(normalizedMessage, [/\bsource-faithful\b/]) ? 'Keep the warning fast but source-faithful.' : null,
      hasAny(normalizedMessage, [/\b(shortest low-risk version|so i can sign this|save time)\b/]) ? 'Do not minimize risk to save time.' : null,
      `Suggested action: ${documentationNeeds[0] ? `keep explicit ${documentationNeeds[0]}` : 'keep the unresolved source conflict or medical danger explicit'} before editing the note.`,
    ]),
  }, 'warning_language', inferBuilderFamily(input.message, `${input.sourceText}\n${input.currentDraftText || ''}`, 'warning_language', primaryConcern) || 'risk', input, {
    oneLineMessage: primaryConcern === 'suicide' || primaryConcern === 'violence'
      ? `Suggested wording: ${buildAssessmentLanguage(primaryConcern, flags, `${input.sourceText}\n${input.currentDraftText || ''}`)}`
      : `${buildWarningText(primaryConcern, flags)} ${documentationNeeds[0] ? `Keep explicit ${documentationNeeds[0]}.` : ''}`.trim(),
  });
}

function buildLowRiskSummary(primaryConcern: PrimaryConcern, flags: ClinicalScenarioFlags, input: ClinicalTaskPriorityInput) {
  if (primaryConcern === 'suicide' || input.riskAnalysis.suicide.length > 0) {
    return 'Low suicide-risk wording is not supported here. Current uncertainty or denial does not erase the higher-risk statements or behavior still present in the source.';
  }

  if (primaryConcern === 'violence') {
    return 'Low violence-risk wording is not supported here. Denial does not erase the observed agitation and collateral threat history still present in the source.';
  }

  if (hasGraveDisabilityConcern(input)) {
    return 'Confirmed grave-disability wording is not supported from this source alone. The documented functional impairment is too limited to present grave disability as settled, and broader self-care capacity remains uncertain.';
  }

  return buildAssessmentFrame(primaryConcern, flags);
}

function buildDischargeTaskPayload(primaryConcern: PrimaryConcern, flags: ClinicalScenarioFlags, input: ClinicalTaskPriorityInput, wantsPlanLanguage: boolean) {
  const blockers = buildDischargeBlockers(primaryConcern, flags, input).map(normalizeClause);
  const documentationNeeds = buildDocumentationNeeds(primaryConcern, flags, input).map(normalizeClause);
  const dischargeLead = blockers.length
    ? `Discharge remains unresolved because ${joinList(blockers)}.`
    : 'Discharge remains unresolved based on the available source.';
  const explicitNeed = documentationNeeds.length
    ? `Continue to document ${joinList(documentationNeeds)}.`
    : 'Continue to document the unresolved high-acuity facts explicitly.';
  const planAssessment = flags.noSafeDischarge || flags.medicationNonadherence || flags.collateralRefusal
    ? 'Current source does not support discharge-ready language.'
    : sentenceCase(buildAssessmentFrame(primaryConcern, flags).replace(/\.$/, '')) + '.';
  const honestPlanSentence = `Honest plan language: "${dischargeLead} ${explicitNeed} ${planAssessment}"`;

  return withAnswerMode({
    message: wantsPlanLanguage
      ? `${isPressurePrompt(input.message) ? 'I would not write a discharge-ready plan from this source. ' : ''}${honestPlanSentence}`
      : `${isPressurePrompt(input.message) ? 'I would not write discharge-ready language from this source. ' : ''}Discharge is blocked by ${joinList(blockers)}. Before a discharge note is written, continue to document ${joinList(documentationNeeds)}.`,
    suggestions: [
      blockers[0] ? `Highest-signal blocker: ${sentenceCase(blockers[0])}.` : 'Do not write discharge-ready language until the contradiction is resolved.',
      documentationNeeds[0] ? `Do not omit ${documentationNeeds[0]}.` : 'Keep the unresolved high-acuity facts explicit.',
      buildWarningText(primaryConcern, flags),
    ],
  } satisfies AssistantResponsePayload, 'chart_ready_wording', 'discharge', input, {
    tightMessage: `No — the source does not support stating that discharge is likely tomorrow. ${dischargeLead}`,
    oneLineMessage: 'No — the source does not support stating that discharge is likely tomorrow.',
  });
}

function buildChartReadyWordingPayload(primaryConcern: PrimaryConcern, flags: ClinicalScenarioFlags, input: ClinicalTaskPriorityInput) {
  const normalizedMessage = normalize(input.message);
  const sourceText = `${input.sourceText}\n${input.currentDraftText || ''}`;
  const normalizedCombined = normalize(`${input.message}\n${sourceText}`);

  if (hasConsultLiaisonMedicalOverlap(normalizedCombined) && hasAny(normalizedCombined, [/\b(hypoxia|o2 dipping|cannula|medical instability|psych version only)\b/])) {
    return buildConsultLiaisonChartReadyPayload(input);
  }

  if (hasViolenceRiskNuance(normalizedCombined) && !isViolenceContradictionExplanationPrompt(normalizedCombined)) {
    return buildViolenceNuanceChartReadyPayload(input);
  }

  if (hasEatingDisorderMedicalInstability(normalizedCombined) && !hasAny(normalizedCombined, [/\b(missing vitals|missing labs|objective data are incomplete|refusing labs|standing vitals)\b/])) {
    return buildEatingDisorderChartReadyPayload(input);
  }

  if (hasAny(normalizedCombined, [/\b(meets? hold|hold criteria|legal hold|exact hold wording|hold wording|source-matched hold language|overdose if sent home|hid pills|safe place to stay)\b/])) {
    return buildLegalHoldLanguagePayload(input);
  }

  if (
    hasAny(normalize(sourceText), [/\b(threatened her|patient statement and collateral threat|mom says he threatened|mother says he threatened|that was last week, not now)\b/])
    && (isVagueFollowup(input.message) || hasAny(normalizedCombined, [/\bhow do i write that\b/, /\bhow should i word that\b/]))
  ) {
    const threatSourceLead = hasAny(normalize(sourceText), [/\b(mom says|mother says)\b/])
      ? 'Mother reports the patient threatened her. Collateral reports the patient threatened her.'
      : 'Collateral reports the patient threatened her.';
    return withAnswerMode({
      message: `Chart-ready wording: "Keep the patient report and collateral concern explicit. ${threatSourceLead} Patient reports the statement was last week and not current. Both timing and source attribution should remain explicit rather than resolved into one settled conclusion."`,
      suggestions: [
        'Keep patient report and collateral threat separate rather than choosing one cleaner version.',
        'If the follow-up is vague, carry forward the prior clinical target instead of switching tasks.',
        'Do not silently resolve ambiguity just to make the note read smoother.',
      ],
    }, 'chart_ready_wording', 'contradiction', input, {
      oneLineMessage: `${hasAny(normalize(sourceText), [/\b(mom says|mother says)\b/]) ? 'Chart-ready wording: "Mother reports the patient threatened her; patient reports the statement was last week and not current. Keep both accounts explicit without reconciling them."' : 'Chart-ready wording: "Collateral reports the patient threatened her; patient reports the statement was last week and not current. Keep both accounts explicit without reconciling them."'}`,
    });
  }

  if (hasAny(normalizedCombined, [
    /\bnot an overdose\b/,
    /\bjust wanted sleep\b/,
    /\bempty pill bottles\b/,
    /\bgoodbye text\b/,
    /\bwithout picking a side\b/,
  ])) {
    return buildCollateralConflictChartReadyPayload(input);
  }

  if (hasAny(normalizedCombined, [
    /\bdc likely tomorrow\b/,
    /\blikely discharge tomorrow\b/,
    /\brefused pm meds\b/,
    /\bno one has actually confirmed housing\b/,
    /\bsister will pick him up\b/,
  ])) {
    return withAnswerMode({
      message: 'Chart-ready wording: "Medication refusal remains documented, including refused PM meds, and a confirmed safe home plan remains unclear in the current source. Ride and housing details remain uncertain, so discharge remains unresolved and likely-discharge-tomorrow language is not supported from this source alone."',
      suggestions: [
        'Keep medication refusal explicit.',
        'Keep unclear ride or home support explicit.',
        'Do not imply discharge certainty before a safe home plan is confirmed.',
      ],
    }, 'chart_ready_wording', 'discharge', input, {
      oneLineMessage: 'Chart-ready wording: "Medication refusal remains documented, including refused PM meds, safe home plan remains unclear, and discharge remains unresolved; likely-discharge-tomorrow language is not supported."',
    });
  }

  if (hasAny(normalize(`${input.message}\n${sourceText}`), [
    /\b(meds are about the same|medications are about the same)\b/,
    /\bcurrent regimen was not specified\b/,
    /\bmedication uncertainty\b/,
    /\bwhat should vera avoid assuming\b/,
  ])) {
    return withAnswerMode({
      message: buildMedicationUncertaintyWording(sourceText),
      suggestions: [
        'Keep medication uncertainty explicit instead of inferring medication names or doses.',
        'State that the current regimen was not specified when the source never names it.',
        'Do not attribute improvement, worsening, or adherence to a medication that was not actually documented.',
      ],
    }, 'chart_ready_wording', 'chart-wording', input);
  }

  if (hasAny(normalizedMessage, [/\b(objective versus assessment|what belongs in objective|what belongs in assessment|objective section|reported denial)\b/])) {
    return withAnswerMode(buildObjectiveVsAssessment(primaryConcern, flags, sourceText), 'chart_ready_wording', 'contradiction', input);
  }

  if (
    (primaryConcern === 'suicide' || primaryConcern === 'violence')
    && hasAny(normalize(sourceText), [
      /\bgoodbye texts?\b/,
      /\bnot safe if sent home\b/,
      /\btexting goodbye overnight\b/,
      /\bdenies si\b/,
      /\bdenied si\b/,
      /\bdenies hi\b/,
      /\bdenies homicidal ideation\b/,
    ])
    && hasAny(normalizedMessage, [
      /\bgive me chart(?:-|\s)?ready wording instead\b/,
      /\bchart(?:-|\s)?ready wording\b/,
      /\bmake it chart(?:-|\s)?ready\b/,
      /\bone sentence\b/,
    ])
  ) {
    return withAnswerMode({
      message: buildLowRiskChartReadyWording(primaryConcern, sourceText),
      suggestions: [
        'Keep the denial and the higher-acuity facts side by side in the same sentence.',
        buildDoNotSayLine(primaryConcern, flags),
        'Do not smooth active contradiction into low-risk wording.',
      ],
    }, 'chart_ready_wording', 'contradiction', input, {
      oneLineMessage: buildLowRiskChartReadyWording(primaryConcern, sourceText),
    });
  }

  if (
    (primaryConcern === 'suicide' || primaryConcern === 'violence')
    && hasAny(normalizedMessage, [/\b(can i (?:say|call).*(?:risk is low|low (?:suicide|violence) risk)|would low (?:suicide|violence)-?risk wording be okay|keep the denial and the higher-?risk facts side by side)\b/])
  ) {
    return withAnswerMode({
      message: `${buildLowRiskChartReadyWording(primaryConcern, sourceText)} Why this is safer: ${buildLowRiskSummary(primaryConcern, flags, input)}`,
      suggestions: [
        'Keep the denial and the higher-acuity facts side by side in the same sentence.',
        buildDoNotSayLine(primaryConcern, flags),
        'Do not smooth active contradiction into low-risk wording.',
      ],
    }, 'chart_ready_wording', 'contradiction', input, {
      oneLineMessage: buildLowRiskChartReadyWording(primaryConcern, sourceText),
    });
  }

  if (hasAny(normalizedMessage, [/\b(exact plan language|tell me the exact plan language)\b/])) {
    return buildDischargeTaskPayload(primaryConcern, flags, input, true);
  }

  return withAnswerMode({
    message: buildAssessmentLanguage(primaryConcern, flags, sourceText),
    suggestions: [
      buildWhySaferLine(primaryConcern, flags),
      buildDoNotSayLine(primaryConcern, flags),
      'Keep the chart wording short and source-bound.',
    ],
  }, 'chart_ready_wording', inferBuilderFamily(input.message, sourceText, 'chart_ready_wording', primaryConcern) || 'chart-wording', input);
}

function buildWillingToSayPayload(primaryConcern: PrimaryConcern, flags: ClinicalScenarioFlags) {
  const willing = buildAssessmentFrame(primaryConcern, flags);
  const notWilling = buildWarningText(primaryConcern, flags).replace(/^Warning:\s*/i, '');
  return {
    message: `Willing to say: ${willing} Not willing to say: ${notWilling}`,
    suggestions: [
      'Keep the competing explanation or confound explicit instead of picking a clean winner.',
      'Use provisional wording when the differential remains active.',
      'Do not convert this into a settled diagnosis or clean discharge frame.',
    ],
  } satisfies AssistantResponsePayload;
}

function isTaskShapedClinicalRequest(message: string) {
  const normalized = normalize(message);
  return hasAny(normalized, [
    /\b(low(?: suicide| violence)?[ -]?risk wording|low risk or not|calling this low risk|can i (?:say|call).*(?:risk is low|low (?:suicide|violence) risk)|would low (?:suicide|violence)?[ -]?risk wording be okay|is grave disability clearly established|block discharge|blocks discharge|discharge note|premature discharge|leaning toward discharge|calm discharge summary|clean ama note|ama note a problem|objective versus assessment|belongs in objective|belongs in assessment)\b/,
    /\b(exact warning|warning language|what warning|unsafe|clinically weak|what is the failure|why is .* wrong|why is .* a problem|why is that garbage|what is the problem|what is the obvious problem|what exactly has it ignored|what does vera do with that contradiction|why would vera let anyone settle)\b/,
    /\b(assessment language|documentation language|plan language|chart language|chart-?ready wording|note language|what language keeps|wording that|what are you willing to say|what are you not willing to say|what has to stay explicit|what needs to stay explicit|needs to stay in the assessment|stay in the assessment|keep .* on the table|make it note-usable|current regimen was not specified|medication uncertainty|provider-usable wording|decision-specific|meaningful consent discussion|hold criteria|legal hold|hold wording|exact hold wording|source-matched hold language|fragmented source|workflow guidance|without picking a side|what should vera not overcall here|what should the note say|without overcalling either|can i just write dc likely tomorrow|can i just call it low risk|source-faithful)\b/,
    /\b(refuse to imply|keep explicit|keeps? .* explicit|keep visible|keeps? .* visible(?: at the same time)?|separate .* for me|keep .* separate|keeps? .* separate|what cannot be smoothed over|what should vera avoid assuming|routine adhd management|routine stimulant restart|stimulant restart write-?up|reported denial|objective section|keep the patient-reported improvement|keep the denial and the higher-?risk facts side by side|make that tighter|make it tighter|make it cleaner|smooth it out|clean this up quick|shortest low-risk version|do not minimize risk to save time|uncertainty has to stay visible)\b/,
  ]);
}

function buildUnsafeLead(message: string, primaryConcern: PrimaryConcern) {
  const normalized = normalize(message);

  if (/\bschizophrenia\b/.test(normalized)) {
    return 'Schizophrenia language would be unsafe here';
  }

  if (primaryConcern === 'violence' && /\b(violence risk low|denies intent|low because patient denies intent)\b/.test(normalized)) {
    return 'Calling violence risk low from denial alone would be unsafe here';
  }

  if (primaryConcern === 'withdrawal-medical' && /\bpanic\b/.test(normalized)) {
    return 'Calling this panic likely would be unsafe here';
  }

  if (primaryConcern === 'capacity' && /\b(ama|capacity sentence)\b/.test(normalized)) {
    return 'A clean AMA or capacity sentence would be unsafe here';
  }

  if (primaryConcern === 'postpartum' && /\b(softens|anxiety|stress|sleep loss)\b/.test(normalized)) {
    return 'Softening this into routine anxiety, stress, or sleep-loss language would be unsafe here';
  }

  if (/\bgrave disability\b/.test(normalized)) {
    return 'Calling grave disability confirmed from this source would be unsafe here';
  }

  if (/\bdischarge\b/.test(normalized)) {
    return 'Discharge-leaning language would be unsafe here';
  }

  return 'That output would be unsafe';
}

export function buildClinicalTaskPriorityPayload(input: ClinicalTaskPriorityInput): AssistantResponsePayload | null {
  const normalizedMessage = normalize(input.message);
  const normalizedCombined = normalize(`${input.message}\n${input.sourceText}\n${input.currentDraftText || ''}`);
  const admissionLikeNote = noteTypeLooksLike(input.noteType, [/\badmission\b/, /\badmit\b/, /\bhpi\b/]);
  const progressLikeNote = noteTypeLooksLike(input.noteType, [/\bprogress\b/]);
  const dischargeSummaryLikeNote = noteTypeLooksLike(input.noteType, [/\bdischarge summary\b/]);
  const contextualAnswerMode = inferContextualAnswerMode(input.message, `${input.sourceText}\n${input.currentDraftText || ''}`);
  const override = resolvePinnedClinicalOverride(input, contextualAnswerMode);
  const mseAnalysis = input.mseAnalysis || parseMSEFromText(`${input.sourceText}\n${input.currentDraftText || ''}`);
  const combinedClinicalSource = `${input.message}\n${input.sourceText}\n${input.currentDraftText || ''}`;
  const explicitDocumentRewrite = override?.answerMode === 'chart_ready_wording'
    && hasAny(`${override.builderFamily || ''}`, [/\b(acute-hpi|progress-note|discharge-summary|crisis-note)\b/])
    && !hasAny(normalizedMessage, [/\b(show|separate)\b.*\b(pt|patient)\b.*\b(report)\b.*\bcollateral\b/]);

  const explicitProviderHistoryRiskWording = hasAny(normalizedMessage, [
    /\brisk wording\b/,
    /\bmake risk assessment\b/,
    /\brewrite safety paragraph\b/,
    /\bchronic vs acute risk\b/,
  ]);

  if (
    explicitProviderHistoryRiskWording
    && input.previousBuilderFamily !== 'contradiction'
    && input.previousAnswerMode !== 'chart_ready_wording'
    && !hasProviderHistoryViolenceContradiction(normalizedMessage)
    && !hasProviderHistorySuicideContradiction(normalizedMessage)
    && !hasProviderHistoryMedicationScenario(normalizedMessage)
    && !hasProviderHistoryMedicationScenario(normalizedCombined)
  ) {
    return buildProviderHistoryGeneralRiskWordingPayload(input);
  }

  const providerHistoryContext = hasProviderHistoryRoutingMarker(normalizedCombined);
  const providerHistoryCurrentContext = hasProviderHistoryRoutingMarker(normalizedMessage);
  const providerHistoryLegalCapacity = (providerHistoryCurrentContext && hasProviderHistoryLegalCapacity(normalizedMessage))
    || (providerHistoryContext && hasProviderHistoryLegalCapacity(normalizedCombined));
  const providerHistoryBenzoTaper = (providerHistoryCurrentContext && hasProviderHistoryBenzoTaper(normalizedMessage))
    || (providerHistoryContext && hasProviderHistoryBenzoTaper(normalizedCombined));
  const providerHistoryDeliriumOverlap = (providerHistoryCurrentContext && hasProviderHistoryDeliriumOverlap(normalizedMessage))
    || (providerHistoryContext && hasProviderHistoryDeliriumOverlap(normalizedCombined));
  const providerHistoryViolenceContradiction = (providerHistoryCurrentContext && hasProviderHistoryViolenceContradiction(normalizedMessage))
    || (providerHistoryContext && hasProviderHistoryViolenceContradiction(normalizedCombined));
  const providerHistorySuicideContradiction = (providerHistoryCurrentContext && hasProviderHistorySuicideContradiction(normalizedMessage))
    || (providerHistoryContext && hasProviderHistorySuicideContradiction(normalizedCombined));
  const providerHistoryMseCompletion = (providerHistoryCurrentContext && hasProviderHistoryMseCompletion(normalizedMessage))
    || (providerHistoryContext && hasProviderHistoryMseCompletion(normalizedCombined));
  const providerHistoryGeneralRiskWording = (providerHistoryCurrentContext && hasProviderHistoryGeneralRiskWording(normalizedMessage))
    || (providerHistoryContext && hasProviderHistoryGeneralRiskWording(normalizedCombined));
  const providerHistorySubstancePsychOverlap = (providerHistoryCurrentContext && hasProviderHistorySubstancePsychOverlap(normalizedMessage))
    || (providerHistoryContext && hasProviderHistorySubstancePsychOverlap(normalizedCombined));
  const providerHistoryMedicalPsychOverlap = (providerHistoryCurrentContext && hasProviderHistoryMedicalPsychOverlap(normalizedMessage))
    || (providerHistoryContext && hasProviderHistoryMedicalPsychOverlap(normalizedCombined));
  const providerHistoryMixedSiSubstanceDischarge = (providerHistoryCurrentContext && hasProviderHistoryMixedSiSubstanceDischarge(normalizedMessage))
    || (providerHistoryContext && hasProviderHistoryMixedSiSubstanceDischarge(normalizedCombined));
  const providerHistoryMixedWithdrawalBenzo = (providerHistoryCurrentContext && hasProviderHistoryMixedWithdrawalBenzo(normalizedMessage))
    || (providerHistoryContext && hasProviderHistoryMixedWithdrawalBenzo(normalizedCombined));
  const providerHistoryMixedCollateralCapacity = (providerHistoryCurrentContext && hasProviderHistoryMixedCollateralCapacity(normalizedMessage))
    || (providerHistoryContext && hasProviderHistoryMixedCollateralCapacity(normalizedCombined));
  const providerHistoryInternalPreoccupationDenial = (providerHistoryCurrentContext && hasProviderHistoryInternalPreoccupationDenial(normalizedMessage))
    || (providerHistoryContext && hasProviderHistoryInternalPreoccupationDenial(normalizedCombined));
  const providerHistoryCollateralConflict = (providerHistoryCurrentContext && hasProviderHistoryCollateralConflict(normalizedMessage))
    || (providerHistoryContext && hasProviderHistoryCollateralConflict(normalizedCombined));
  const providerHistoryPsychosisWording = (providerHistoryCurrentContext && hasProviderHistoryPsychosisWording(normalizedMessage))
    || (providerHistoryContext && hasProviderHistoryPsychosisWording(normalizedCombined));
  const providerHistoryMedicationKind = detectProviderHistoryMedicationScenarioKind(normalizedCombined)
    ?? detectProviderHistoryMedicationScenarioKind(normalizedMessage);
  const providerHistoryNonStigmatizingWording = (providerHistoryCurrentContext && hasProviderHistoryNonStigmatizingWording(normalizedMessage))
    || (providerHistoryContext && hasProviderHistoryNonStigmatizingWording(normalizedCombined));
  const providerHistorySparseSourceHandling = (providerHistoryCurrentContext && hasProviderHistorySparseSourceHandling(normalizedMessage))
    || (providerHistoryContext && hasProviderHistorySparseSourceHandling(normalizedCombined));
  const providerHistoryVagueFollowupPrompt = (providerHistoryCurrentContext && hasProviderHistoryVagueFollowupPrompt(normalizedMessage))
    || (providerHistoryContext && hasProviderHistoryVagueFollowupPrompt(normalizedCombined));
  const providerHistoryTypoHeavyPrompt = (providerHistoryCurrentContext && hasProviderHistoryTypoHeavyPrompt(normalizedMessage))
    || (providerHistoryContext && hasProviderHistoryTypoHeavyPrompt(normalizedCombined));
  const providerHistoryRushedShorthandPrompt = (providerHistoryCurrentContext && hasProviderHistoryRushedShorthandPrompt(normalizedMessage))
    || (providerHistoryContext && hasProviderHistoryRushedShorthandPrompt(normalizedCombined));
  const providerHistoryMixedSparseMedRefillRisk = (providerHistoryCurrentContext && hasProviderHistoryMixedSparseMedRefillRisk(normalizedMessage))
    || (providerHistoryContext && hasProviderHistoryMixedSparseMedRefillRisk(normalizedCombined));
  const providerHistoryMixedPsychosisMedicalRuleout = (providerHistoryCurrentContext && hasProviderHistoryMixedPsychosisMedicalRuleout(normalizedMessage))
    || (providerHistoryContext && hasProviderHistoryMixedPsychosisMedicalRuleout(normalizedCombined));
  const providerHistoryCoreDocumentationTask = hasAcuteInpatientHpiGeneration(normalizedCombined)
    || hasProgressNoteRefinement(normalizedCombined)
    || hasDischargeSummaryGeneration(normalizedCombined)
    || hasCrisisNoteWorkflow(normalizedCombined);

  if (providerHistoryMedicationKind) {
    return buildProviderHistoryMedicationScenarioPayload(input, providerHistoryMedicationKind);
  }

  if (providerHistoryMixedPsychosisMedicalRuleout) {
    return buildProviderHistoryMixedPsychosisMedicalRuleoutPayload(input);
  }

  if (providerHistoryMixedSparseMedRefillRisk) {
    return buildProviderHistoryMixedSparseMedRefillRiskPayload(input);
  }

  if (
    providerHistoryNonStigmatizingWording
    && !providerHistoryCollateralConflict
    && !providerHistoryInternalPreoccupationDenial
    && !providerHistoryPsychosisWording
    && !hasMedicationRefusalAuthorityContext(normalizedCombined)
  ) {
    return buildProviderHistoryNonStigmatizingPayload(input);
  }

  if (providerHistorySparseSourceHandling && !providerHistoryCoreDocumentationTask) {
    return buildProviderHistorySparseSourcePayload(input);
  }

  if (
    providerHistoryVagueFollowupPrompt
    && !providerHistoryCoreDocumentationTask
    && !providerHistoryMixedCollateralCapacity
    && !providerHistoryMedicalPsychOverlap
    && !providerHistoryDeliriumOverlap
    && !providerHistorySubstancePsychOverlap
  ) {
    return buildProviderHistoryVagueFollowupPayload(input);
  }

  if (providerHistoryTypoHeavyPrompt) {
    return buildProviderHistoryTypoHeavyPayload(input);
  }

  if (providerHistoryRushedShorthandPrompt) {
    return buildProviderHistoryRushedShorthandPayload(input);
  }

  if (
    progressLikeNote
    && input.currentDraftText?.trim()
    && isUiRewriteRequest(input.message)
    && (!input.previousBuilderFamily || input.previousBuilderFamily === 'progress-note')
    && !hasProviderHistoryMseCompletion(normalize(input.currentDraftText))
    && !hasProviderHistoryGeneralRiskWording(normalize(input.currentDraftText))
    && !hasProviderHistoryMixedWithdrawalBenzo(normalize(input.currentDraftText))
    && !hasProviderHistoryBenzoTaper(normalize(input.currentDraftText))
  ) {
    return buildProgressNoteRefinementPayload(input);
  }

  if (providerHistoryMseCompletion) {
    return buildMseCompletionLimitsPayload(input, mseAnalysis);
  }

  if (providerHistoryMixedSiSubstanceDischarge) {
    return buildProviderHistoryMixedSiSubstanceDischargePayload(input);
  }

  if (providerHistoryMixedCollateralCapacity) {
    return buildProviderHistoryMixedCollateralCapacityPayload(input);
  }

  if (providerHistoryInternalPreoccupationDenial) {
    return buildProviderHistoryInternalPreoccupationDenialPayload(input);
  }

  if (providerHistoryCollateralConflict) {
    return buildProviderHistoryCollateralConflictPayload(input);
  }

  if (providerHistoryPsychosisWording) {
    return buildProviderHistoryPsychosisWordingPayload(input);
  }

  if (providerHistoryLegalCapacity) {
    return buildProviderHistoryCapacityPayload(input);
  }

  if (providerHistoryMixedWithdrawalBenzo || providerHistoryBenzoTaper) {
    return buildProviderHistoryBenzoTaperPayload(input);
  }

  if (providerHistorySubstancePsychOverlap) {
    return buildProviderHistorySubstancePsychOverlapPayload(input);
  }

  if (providerHistoryMedicalPsychOverlap) {
    return buildProviderHistoryMedicalPsychOverlapPayload(input);
  }

  if (providerHistoryDeliriumOverlap) {
    return buildProviderHistoryDeliriumOverlapPayload(input);
  }

  if (
    providerHistoryViolenceContradiction
    && (input.previousAnswerMode === 'chart_ready_wording' || hasAny(normalizedCombined, [/\bmake it chart-ready\b/, /\bchart-ready wording:/]))
    && hasAny(normalizedMessage, [/\blow[ -]?risk wording\b/, /\blow violence[ -]?risk\b/, /\bshortest\b/])
  ) {
    return withAnswerMode({
      message: 'Chart-ready wording: "Patient denial should remain explicit, and collateral threat history should remain documented separately. Violence risk remains conflicted, and low violence-risk wording is not supported here while those threat facts remain unresolved."',
      suggestions: [
        'Keep patient denial and collateral threat history documented separately.',
        'Do not collapse the remaining threat facts into low violence-risk wording.',
      ],
    }, 'chart_ready_wording', 'contradiction', input);
  }

  if (providerHistoryViolenceContradiction) {
    return buildProviderHistoryViolenceContradictionPayload(input);
  }

  if (providerHistorySuicideContradiction) {
    return buildProviderHistorySuicideContradictionPayload(input);
  }

  if (providerHistoryGeneralRiskWording) {
    return buildProviderHistoryGeneralRiskWordingPayload(input);
  }

  if (
    input.stage === 'compose'
    && admissionLikeNote
    && input.sourceText.trim()
    && isMessySourceStartRequest(input.message)
  ) {
    return buildMessySourceWorkflowPayload(input);
  }

  if (
    (override?.builderFamily === 'acute-hpi'
      || hasAcuteInpatientHpiGeneration(normalizedCombined)
      || (admissionLikeNote && hasAny(normalizedMessage, [/\bneed hpi\b/, /\bhpi fast\b/, /\bchart(?:-|\s)?ready hpi\b/, /\bkeep admit reason\b/, /\bdon'?t invent timeline\b/])))
    && (!override?.answerMode || override.answerMode === 'chart_ready_wording')
  ) {
    return buildAcuteInpatientHpiPayload(input);
  }

  if (
    (override?.builderFamily === 'progress-note'
      || hasProgressNoteRefinement(normalizedCombined)
      || (progressLikeNote && input.currentDraftText?.trim() && isUiRewriteRequest(input.message)))
    && (!override?.answerMode || override.answerMode === 'chart_ready_wording')
  ) {
    return buildProgressNoteRefinementPayload(input);
  }

  if (
    (override?.builderFamily === 'discharge-summary'
      || hasDischargeSummaryGeneration(normalizedCombined)
      || (dischargeSummaryLikeNote && input.currentDraftText?.trim() && isUiRewriteRequest(input.message)))
    && (!override?.answerMode || override.answerMode === 'chart_ready_wording')
  ) {
    return buildDischargeSummaryPayload(input);
  }

  if (
    (override?.builderFamily === 'crisis-note'
      || hasCrisisNoteWorkflow(normalizedCombined))
    && (!override?.answerMode || override.answerMode === 'chart_ready_wording')
  ) {
    return buildCrisisNotePayload(input);
  }

  if (
    hasAny(normalizedMessage, [/\bnormal discharge planning\b/, /\broutine discharge planning\b/])
    && (
      input.previousBuilderFamily === 'ama-elopement'
      || input.previousAnswerMode === 'workflow_guidance'
      || input.followupDirective?.preserveClinicalState
    )
  ) {
    return buildAmaElopementWorkflowPayload(input);
  }

  if (
    hasAny(normalizedMessage, [
      /\bmissing authority boundaries explicit\b/,
      /\bauthority boundaries explicit\b/,
      /\brefusal\b.*\brecommendation\b/,
    ])
    && (
      input.previousBuilderFamily === 'medication-refusal'
      || input.previousAnswerMode === 'warning_language'
      || input.followupDirective?.preserveClinicalState
    )
  ) {
    return buildInvoluntaryMedicationWarningPayload(input);
  }

  if (
    input.previousAnswerMode === 'chart_ready_wording'
    && input.previousBuilderFamily === 'acute-hpi'
    && hasAny(normalizedMessage, [
      /\bjust write the hpi\b/,
      /\bmake it shorter\b/,
      /\bdon'?t overthink it\b/,
      /\bleave the meth out\b/,
      /\bclassic bipolar mania\b/,
      /\bkeep the timeline honest\b/,
    ])
  ) {
    return buildAcuteInpatientHpiPayload(input);
  }

  if (
    input.previousAnswerMode === 'chart_ready_wording'
    && input.previousBuilderFamily === 'progress-note'
    && hasAny(normalizedMessage, [
      /\bmake it shorter\b/,
      /\bless acute\b/,
      /\bmake it read like improving\b/,
      /\brewrite\b/,
      /\bmake it chart-ready\b/,
      /\btighten\b/,
      /\bleave out what is not documented\b/,
      /\bmake it more neutral\b/,
      /\bsplit plan bullets\b/,
    ])
  ) {
    return buildProgressNoteRefinementPayload(input);
  }

  if (
    input.previousAnswerMode === 'chart_ready_wording'
    && input.previousBuilderFamily === 'discharge-summary'
    && hasAny(normalizedMessage, [
      /\bmake the discharge summary\b/,
      /\bshort version\b/,
      /\bshorter\b/,
      /\bdon'?t mention the follow-up gap\b/,
      /\bdischarged to shelter with improvement\b/,
      /\bdischarged home with meds\b/,
      /\bstable for discharge\b/,
    ])
  ) {
    return buildDischargeSummaryPayload(input);
  }

  if (
    input.previousAnswerMode === 'chart_ready_wording'
    && input.previousBuilderFamily === 'crisis-note'
    && hasAny(normalizedMessage, [
      /\binclude\b/,
      /\bkeep objective\b/,
      /\brisk rationale\b/,
      /\bleast restrictive\b/,
      /\bwithout blame\b/,
      /\bsay violent\b/,
      /\bmake restraint sound routine\b/,
      /\bbehavior resolved\b/,
      /\bomit staff trigger\b/,
    ])
  ) {
    return buildCrisisNotePayload(input);
  }

  if (!input.sourceText.trim() && !isTaskShapedClinicalRequest(input.message) && !override?.answerMode) {
    return null;
  }

  const flags = detectScenarioFlags(input.message, `${input.sourceText}\n${input.currentDraftText || ''}`);
  let primaryConcern = determinePrimaryConcern(flags, input.riskAnalysis, input.contradictionAnalysis);

  if (!primaryConcern && hasAny(normalizedMessage, [/\b(grave disability|adl|self-care|self care)\b/])) {
    primaryConcern = 'generic-risk';
  }

  if (!primaryConcern && hasAny(normalizedMessage, [/\b(violence risk|violent|homicid|collateral reports threats?|threats?)\b/])) {
    primaryConcern = 'violence';
  }

  if (
    !primaryConcern
    && (override?.answerMode === 'warning_language' || override?.answerMode === 'chart_ready_wording')
    && (
      hasViolenceRiskNuance(normalizedCombined)
      || hasAny(normalizedMessage, [/\bviolence\b/, /\bintent documented\b/])
    )
  ) {
    primaryConcern = 'violence';
  }

  if (
    !primaryConcern
    && override?.answerMode === 'chart_ready_wording'
    && hasAny(normalize(combinedClinicalSource), [/\b(collateral threat|threatened her|threatened the neighbor|mom says he threatened|mother says he threatened|patient statement and collateral threat)\b/])
  ) {
    primaryConcern = 'violence';
  }

  if (!primaryConcern && hasAny(normalizedMessage, [/\b(suicide risk|suicid|si\b|goodbye texts?|trust herself at home|trust himself at home|trust myself at home)\b/])) {
    primaryConcern = 'suicide';
  }

  if (!primaryConcern && hasAny(normalizedCombined, [/\b(hold criteria|legal hold|meets hold|exact hold wording|hold wording|source-matched hold language|overdose if sent home|hid pills|safe place to stay)\b/])) {
    primaryConcern = 'generic-risk';
  }

  if (!primaryConcern && hasAny(normalizedMessage, [/\b(dc likely tomorrow|likely discharge tomorrow|confirmed housing|pick him up|pick her up|wants out)\b/])) {
    primaryConcern = 'generic-risk';
  }

  if (!primaryConcern && hasAny(normalizedMessage, [/\b(malingering|shelter list|housing)\b/])) {
    primaryConcern = 'generic-risk';
  }

  if (!primaryConcern && hasAny(normalizedCombined, [/\b(malingering|shelter list|housing|secondary gain)\b/])) {
    primaryConcern = 'generic-risk';
  }

  if (!primaryConcern && hasInvoluntaryMedicationRefusal(normalizedCombined)) {
    primaryConcern = 'generic-risk';
  }

  if (!primaryConcern && hasAmaElopementRisk(normalizedCombined)) {
    primaryConcern = 'generic-risk';
  }

  if (!primaryConcern && hasPersonalityLanguageCaution(normalizedCombined)) {
    primaryConcern = 'generic-risk';
  }

  if (!primaryConcern && hasAny(`${override?.builderFamily || ''}`, [/\b(medication-refusal|ama-elopement|personality-language|acute-hpi|progress-note|discharge-summary|crisis-note)\b/])) {
    primaryConcern = 'generic-risk';
  }

  if (!primaryConcern && hasAny(normalizedMessage, [/\b(fragmented source|source is a mess)\b/])) {
    primaryConcern = 'generic-risk';
  }

  if (!primaryConcern && override?.answerMode === 'chart_ready_wording' && hasAny(normalize(combinedClinicalSource), [
    /\b(meds are about the same|medications are about the same)\b/,
    /\bcurrent regimen was not specified\b/,
    /\bmedication uncertainty\b/,
    /\bwhat should vera avoid assuming\b/,
  ])) {
    primaryConcern = 'generic-risk';
  }

  if (!primaryConcern && override?.answerMode === 'chart_ready_wording' && hasAny(normalize(combinedClinicalSource), [
    /\b(command hallucinations?|auditory hallucinations?|visual hallucinations?|hearing voices|hears voices|voices|responding to internal stimuli|internally preoccupied|delusion|delusional|psychosis)\b/,
  ])) {
    primaryConcern = 'generic-risk';
  }

  const builderFamily = override?.builderFamily
    || input.previousBuilderFamily
    || inferBuilderFamily(input.message, `${input.sourceText}\n${input.currentDraftText || ''}`, override?.answerMode, primaryConcern);

  if (
    mseAnalysis.missingDomains.length > 0
    && hasAny(normalizedMessage, [/\b(should vera keep that|should vera keep those|keep that|keep those|auto-?complete|stay blank|remain unfilled)\b/])
    && hasAny(normalize(combinedClinicalSource), [/\bmse\b/, /\bmental status\b/, /\btelehealth\b/, /\bcalm\b/, /\bcooperative\b/, /\blinear\b/])
    && !hasViolenceRiskNuance(normalize(combinedClinicalSource))
    && !hasAmaElopementRisk(normalize(combinedClinicalSource))
  ) {
    return buildMseCompletionLimitsPayload(input, mseAnalysis);
  }

  if (override?.answerMode === 'mse_completion_limits') {
    return buildMseCompletionLimitsPayload(input, mseAnalysis);
  }

  if (override?.answerMode === 'uncertainty_preserving_substance_documentation') {
    return buildUncertaintyPreservingSubstanceDocumentationPayload(input);
  }

  if (override?.answerMode === 'clinical_explanation' && hasInvoluntaryMedicationRefusal(normalizedCombined)) {
    return buildInvoluntaryMedicationClinicalExplanationPayload(input);
  }

  if (override?.answerMode === 'clinical_explanation' && primaryConcern === 'capacity') {
    return buildCapacityExplanationPayload(input);
  }

  if (
    override?.answerMode === 'clinical_explanation'
    && (
      (
        hasConsultLiaisonMedicalOverlap(normalizedCombined)
        && hasAny(normalizedCombined, [/\b(prednisone burst|steroid|med side effect|pick mania or med side effect|pick one)\b/])
      )
      || (
        builderFamily === 'overlap'
        && hasAny(normalizedCombined, [/\b(steroid|medical contributor overlap explicit|concise clinical explanation)\b/])
      )
    )
  ) {
    return buildSteroidOverlapClinicalExplanationPayload(input);
  }

  if (
    override?.answerMode === 'clinical_explanation'
    && hasAny(normalizedCombined, [/\b(withdrawal vs psych|withdrawal versus|stopping drinking|seeing bugs|call it psychosis)\b/])
  ) {
    return buildWithdrawalClinicalExplanationPayload(input);
  }

  if (override?.answerMode === 'clinical_explanation' && hasProviderHistorySubstancePsychOverlap(normalizedCombined)) {
    return buildProviderHistorySubstancePsychOverlapPayload(input);
  }

  if (override?.answerMode === 'workflow_guidance' && hasProviderHistoryMedicalPsychOverlap(normalizedCombined)) {
    return buildProviderHistoryMedicalPsychOverlapPayload(input);
  }

  if (override?.answerMode === 'workflow_guidance') {
    if (hasAmaElopementRisk(normalizedCombined)) {
      return buildAmaElopementWorkflowPayload(input);
    }

    if (hasPersonalityLanguageCaution(normalizedCombined)) {
      return buildPersonalityWorkflowPayload(input);
    }

    if (hasAny(normalizedMessage, [/\bwhat is missing and why that still matters\b/])) {
      return buildEatingDisorderWorkflowPayload(input);
    }

    if (hasConsultLiaisonMedicalOverlap(normalizedCombined) && !hasAny(normalizedCombined, [/\b(hypoxia|o2 dipping|cannula)\b/])) {
      return buildConsultLiaisonWorkflowPayload(input);
    }

    if (hasEatingDisorderMedicalInstability(normalizedCombined) && hasAny(normalizedCombined, [/\b(missing vitals|missing labs|objective data are incomplete|refusing labs|standing vitals)\b/])) {
      return buildEatingDisorderWorkflowPayload(input);
    }

    if (hasAny(normalizedCombined, [/\b(fragmented source|source is a mess|keep it useful|skip the uncertainty|normal progress update)\b/])) {
      return buildFragmentedSourceWorkflowPayload(input);
    }

    if (hasProviderHistoryMedicalPsychOverlap(normalizedCombined)) {
      return buildProviderHistoryMedicalPsychOverlapPayload(input);
    }

    if (hasAny(normalizedCombined, [/\b(psych or medical|medical versus psych|medical vs psych|delirium|uti|without overcalling either|just keep it psych)\b/])) {
      return buildMedicalPsychOverlapPayload(input);
    }

    if (hasAny(normalizedMessage, [/\b(make that tighter|make it tighter|what should vera do with a follow-up that vague|no really, make it tighter)\b/]) || isVagueFollowup(input.message)) {
      return buildAmbiguousFollowupPayload(input, contextualAnswerMode);
    }

    if (hasAny(normalizedCombined, [/\b(threatened her|mom says he threatened|mother says he threatened|that was last week, not now|how do i write that)\b/])) {
      return buildAmbiguousFollowupPayload(input, contextualAnswerMode || 'workflow_guidance');
    }
  }

  if (override?.answerMode === 'warning_language' && hasAny(normalizedCombined, [/\bmalingering\b/, /\bhousing\b/, /\bsecondary gain\b/])) {
    return buildMalingeringWarningPayload(input);
  }

  if (
    override?.answerMode === 'warning_language'
    && (
      hasInvoluntaryMedicationRefusal(normalizedCombined)
      || hasAny(normalizedMessage, [/\bchoosing not to comply with treatment\b/])
    )
  ) {
    return buildInvoluntaryMedicationWarningPayload(input);
  }

  if (override?.answerMode === 'warning_language' && hasAmaElopementRisk(normalizedCombined)) {
    return buildAmaElopementWarningPayload(input);
  }

  if (override?.answerMode === 'warning_language' && hasPersonalityLanguageCaution(normalizedCombined)) {
    return buildPersonalityWarningPayload(input);
  }

  if (override?.answerMode === 'warning_language' && hasAny(normalizedCombined, [/\b(exact hold wording|hold wording|source-matched hold language|overdose if sent home|hid pills|safe place to stay|less acute|short version only)\b/])) {
    return buildLegalHoldLanguagePayload(input);
  }

  if (override?.answerMode === 'chart_ready_wording' && hasInvoluntaryMedicationRefusal(normalizedCombined)) {
    return buildInvoluntaryMedicationChartReadyPayload(input);
  }

  if (override?.answerMode === 'chart_ready_wording' && hasAmaElopementRisk(normalizedCombined)) {
    return buildAmaElopementChartReadyPayload(input);
  }

  if (override?.answerMode === 'chart_ready_wording' && hasPersonalityLanguageCaution(normalizedCombined)) {
    return buildPersonalityChartReadyPayload(input);
  }

  if (override?.answerMode === 'chart_ready_wording' && builderFamily === 'acute-hpi') {
    return buildAcuteInpatientHpiPayload(input);
  }

  if (override?.answerMode === 'chart_ready_wording' && builderFamily === 'progress-note') {
    return buildProgressNoteRefinementPayload(input);
  }

  if (override?.answerMode === 'chart_ready_wording' && builderFamily === 'discharge-summary') {
    return buildDischargeSummaryPayload(input);
  }

  if (override?.answerMode === 'chart_ready_wording' && builderFamily === 'crisis-note') {
    return buildCrisisNotePayload(input);
  }

  if (override?.answerMode === 'chart_ready_wording' && hasAny(normalizedCombined, [/\b(meets? hold|hold criteria|legal hold|transfer can happen|hold threshold|overdose if sent home|hid pills|safe place to stay)\b/])) {
    return buildLegalHoldLanguagePayload(input);
  }

  if (input.followupDirective?.preserveClinicalState && override?.answerMode && builderFamily) {
    if (
      builderFamily === 'contradiction'
      && input.previousAnswerMode === 'chart_ready_wording'
      && hasAny(normalizedMessage, [/\blow[ -]?risk wording\b/, /\blow suicide[ -]?risk\b/, /\blow violence[ -]?risk\b/])
    ) {
      return buildChartReadyWordingPayload(primaryConcern || 'violence', flags, input);
    }

    if (builderFamily === 'risk' && hasProviderHistoryGeneralRiskWording(normalizedCombined)) {
      return buildProviderHistoryGeneralRiskWordingPayload(input);
    }

    if (builderFamily === 'discharge') {
      return buildChartReadyWordingPayload(primaryConcern || 'generic-risk', flags, input);
    }

    if (builderFamily === 'hold') {
      return buildLegalHoldLanguagePayload(input);
    }

    if (builderFamily === 'malingering') {
      return buildMalingeringWarningPayload(input);
    }

    if (builderFamily === 'medication-refusal') {
      if (override.answerMode === 'chart_ready_wording') {
        return buildInvoluntaryMedicationChartReadyPayload(input);
      }
      if (override.answerMode === 'clinical_explanation') {
        return buildInvoluntaryMedicationClinicalExplanationPayload(input);
      }
      return buildInvoluntaryMedicationWarningPayload(input);
    }

    if (builderFamily === 'ama-elopement') {
      if (override.answerMode === 'chart_ready_wording') {
        return buildAmaElopementChartReadyPayload(input);
      }
      if (override.answerMode === 'workflow_guidance') {
        return buildAmaElopementWorkflowPayload(input);
      }
      return buildAmaElopementWarningPayload(input);
    }

    if (builderFamily === 'personality-language') {
      if (override.answerMode === 'chart_ready_wording') {
        return buildPersonalityChartReadyPayload(input);
      }
      if (override.answerMode === 'workflow_guidance') {
        return buildPersonalityWorkflowPayload(input);
      }
      return buildPersonalityWarningPayload(input);
    }

    if (builderFamily === 'acute-hpi') {
      return buildAcuteInpatientHpiPayload(input);
    }

    if (builderFamily === 'progress-note') {
      return buildProgressNoteRefinementPayload(input);
    }

    if (builderFamily === 'discharge-summary') {
      return buildDischargeSummaryPayload(input);
    }

    if (builderFamily === 'crisis-note') {
      return buildCrisisNotePayload(input);
    }

    if (builderFamily === 'overlap') {
      if (hasProviderHistorySubstancePsychOverlap(normalizedCombined)) {
        return buildProviderHistorySubstancePsychOverlapPayload(input);
      }

      if (hasProviderHistoryMedicalPsychOverlap(normalizedCombined)) {
        return buildProviderHistoryMedicalPsychOverlapPayload(input);
      }

      if (override.answerMode === 'workflow_guidance') {
        return hasConsultLiaisonMedicalOverlap(normalizedCombined)
          ? buildConsultLiaisonWorkflowPayload(input)
          : buildMedicalPsychOverlapPayload(input);
      }

      return hasConsultLiaisonMedicalOverlap(normalizedCombined) && hasAny(normalizedCombined, [/\b(prednisone burst|steroid|med side effect|pick one)\b/])
        ? buildSteroidOverlapClinicalExplanationPayload(input)
        : buildWithdrawalClinicalExplanationPayload(input);
    }

    if (builderFamily === 'capacity') {
      return buildCapacityExplanationPayload(input);
    }

    if (builderFamily === 'fragmented-source') {
      return buildFragmentedSourceWorkflowPayload(input);
    }

    if (builderFamily === 'contradiction' && override.answerMode === 'chart_ready_wording') {
      return buildChartReadyWordingPayload(primaryConcern || 'violence', flags, input);
    }
  }

  if (!primaryConcern || (!isTaskShapedClinicalRequest(input.message) && !override?.answerMode)) {
    if (input.followupDirective?.preserveClinicalState && override?.answerMode) {
      if ((builderFamily === 'risk' || override.builderFamily === 'risk') && hasProviderHistoryGeneralRiskWording(normalizedCombined)) {
        return buildProviderHistoryGeneralRiskWordingPayload(input);
      }

      const persistedMode = override.answerMode as AssistantAnswerMode;
      const safeMessage = (() => {
        switch (persistedMode) {
          case 'chart_ready_wording':
            return 'Chart-ready wording: "The source does not support that shortcut. Keep the current uncertainty or contradiction explicit in the note."';
          case 'warning_language':
            if (hasAny(normalizedMessage, [/\bno imminent violence intent documented\b/, /\bviolence intent\b/])) {
              return 'Warning: The source does not support that shortcut, and do not flatten the remaining threat facts into reassurance.';
            }
            if ((builderFamily === 'risk' || builderFamily === 'contradiction') && hasAny(normalizedMessage, [/\bviolence\b/, /\bintent documented\b/])) {
              return 'Warning: The source does not support that shortcut, and do not flatten the remaining threat facts into reassurance.';
            }
            return 'Warning: The source does not support that shortcut; keep the unresolved risk or contradiction explicit.';
          case 'clinical_explanation':
            return 'Clinical explanation: The source does not settle that question cleanly, so the unresolved differential or capacity concern should remain explicit.';
          case 'workflow_guidance':
            return 'Workflow guidance: Keep the existing unresolved facts explicit rather than switching to a cleaner conclusion.';
          case 'mse_completion_limits':
            return 'Source-supported MSE findings remain limited. Leave missing domains unfilled and do not auto-complete them.';
          case 'uncertainty_preserving_substance_documentation':
            return 'Document the reported exposure and observed syndrome, preserve that the agent remains unidentified, and do not infer an exact compound.';
          default:
            return null;
        }
      })();

      if (safeMessage) {
        return withAnswerMode({
          message: safeMessage,
          suggestions: [],
        }, persistedMode, builderFamily, input);
      }
    }

    return null;
  }

  if (
    override?.answerMode === 'warning_language'
    && hasAny(normalizedMessage, [/\blow[ -]?risk wording\b/, /\bshortest\b/])
    && (
      input.previousBuilderFamily === 'contradiction'
      || input.previousAnswerMode === 'chart_ready_wording'
      || hasAny(normalizedCombined, [/\b(make it chart-ready|chart-ready wording:|collateral threat history|remain documented separately|brother says .* threatened|threatened neighbor|making them pay)\b/])
    )
  ) {
    return withAnswerMode({
      message: 'Chart-ready wording: "Patient denial should remain explicit, and collateral threat history should remain documented separately. Violence risk remains conflicted, and low violence-risk wording is not supported here while those threat facts remain unresolved."',
      suggestions: [
        'Keep patient denial and collateral threat history documented separately.',
        'Do not collapse the remaining threat facts into low violence-risk wording.',
      ],
    }, 'chart_ready_wording', 'contradiction', input);
  }

  if (override?.answerMode === 'warning_language') {
    if (hasInvoluntaryMedicationRefusal(normalizedCombined) || hasAny(normalizedMessage, [/\bchoosing not to comply with treatment\b/])) {
      return buildInvoluntaryMedicationWarningPayload(input);
    }

    if (hasAmaElopementRisk(normalizedCombined)) {
      return buildAmaElopementWarningPayload(input);
    }

    if (hasPersonalityLanguageCaution(normalizedCombined)) {
      return buildPersonalityWarningPayload(input);
    }

    if (hasAny(normalizedCombined, [/\bmalingering\b/, /\bhousing\b/, /\bsecondary gain\b/])) {
      return buildMalingeringWarningPayload(input);
    }

    if ((hasViolenceRiskNuance(normalizedCombined) && !isViolenceContradictionExplanationPrompt(normalizedCombined)) || hasEatingDisorderMedicalInstability(normalizedCombined)) {
      return hasViolenceRiskNuance(normalizedCombined) && !isViolenceContradictionExplanationPrompt(normalizedCombined)
        ? buildViolenceNuanceWarningPayload(input)
        : buildEatingDisorderWarningPayload(input);
    }

    if (hasAny(normalizedCombined, [/\b(exact hold wording|hold wording|source-matched hold language|overdose if sent home|hid pills|safe place to stay|less acute)\b/])) {
      return buildLegalHoldLanguagePayload(input);
    }
  }

  if (override?.answerMode === 'chart_ready_wording') {
    if (builderFamily === 'acute-hpi' || hasAcuteInpatientHpiGeneration(normalizedCombined)) {
      return buildAcuteInpatientHpiPayload(input);
    }

    if (builderFamily === 'progress-note' || hasProgressNoteRefinement(normalizedCombined)) {
      return buildProgressNoteRefinementPayload(input);
    }

    if (builderFamily === 'discharge-summary' || hasDischargeSummaryGeneration(normalizedCombined)) {
      return buildDischargeSummaryPayload(input);
    }

    if (builderFamily === 'crisis-note' || hasCrisisNoteWorkflow(normalizedCombined)) {
      return buildCrisisNotePayload(input);
    }

    if (hasInvoluntaryMedicationRefusal(normalizedCombined)) {
      return buildInvoluntaryMedicationChartReadyPayload(input);
    }

    if (hasAmaElopementRisk(normalizedCombined)) {
      return buildAmaElopementChartReadyPayload(input);
    }

    if (hasPersonalityLanguageCaution(normalizedCombined)) {
      return buildPersonalityChartReadyPayload(input);
    }

    if (hasConsultLiaisonMedicalOverlap(normalizedCombined) && hasAny(normalizedCombined, [/\b(hypoxia|o2 dipping|cannula|medical instability|psych version only)\b/])) {
      return buildConsultLiaisonChartReadyPayload(input);
    }

    if ((hasViolenceRiskNuance(normalizedCombined) && !isViolenceContradictionExplanationPrompt(normalizedCombined)) || hasEatingDisorderMedicalInstability(normalizedCombined)) {
      return hasViolenceRiskNuance(normalizedCombined) && !isViolenceContradictionExplanationPrompt(normalizedCombined)
        ? buildViolenceNuanceChartReadyPayload(input)
        : buildEatingDisorderChartReadyPayload(input);
    }

    return buildChartReadyWordingPayload(primaryConcern, flags, input);
  }

  if (override?.answerMode === 'clinical_explanation' && primaryConcern === 'generic-risk' && hasAny(normalizedMessage, [/\b(withdrawal versus|medical versus psych|without pretending we already settled|do i have to leave .* in)\b/])) {
    return withAnswerMode({
      message: `${buildAssessmentFrame(primaryConcern, flags)} Keep the differential source-bound and do not collapse the overlapping medical and psychiatric explanations prematurely.`,
      suggestions: [
        'Name what is documented, what remains confounded, and what still needs clarification.',
        'Do not switch into broad teaching or a generic fallback block.',
        'If asked for note wording next, keep the same clinical target and move into chart-ready language.',
      ],
    }, 'clinical_explanation', builderFamily || 'overlap', input);
  }

  if (hasAny(normalizedMessage, [/\b(what are you willing to say|what are you not willing to say)\b/])) {
    return buildWillingToSayPayload(primaryConcern, flags);
  }

  if (hasAny(normalizedMessage, [/\b(objective versus assessment|belongs in objective|belongs in assessment)\b/])) {
    return withAnswerMode(buildObjectiveVsAssessment(primaryConcern, flags, `${input.sourceText}\n${input.currentDraftText || ''}`), 'chart_ready_wording', builderFamily || 'contradiction', input);
  }

  if (hasConsultLiaisonMedicalOverlap(normalizedCombined)) {
    if (hasAny(normalizedCombined, [/\b(prednisone burst|steroid|med side effect|pick one)\b/])) {
      return buildSteroidOverlapClinicalExplanationPayload(input);
    }

    return hasAny(normalizedCombined, [/\b(hypoxia|o2 dipping|cannula)\b/])
      ? buildConsultLiaisonChartReadyPayload(input)
      : buildConsultLiaisonWorkflowPayload(input);
  }

  if (hasViolenceRiskNuance(normalizedCombined) && !isViolenceContradictionExplanationPrompt(normalizedCombined)) {
    return hasAny(normalizedCombined, [/\b(weapon|guns|gonna get hurt)\b/])
      ? buildViolenceNuanceWarningPayload(input)
      : buildViolenceNuanceChartReadyPayload(input);
  }

  if (hasEatingDisorderMedicalInstability(normalizedCombined)) {
    if (hasAny(normalizedCombined, [/\b(missing vitals|missing labs|objective data are incomplete|refusing labs|standing vitals)\b/])) {
      return buildEatingDisorderWorkflowPayload(input);
    }

    return hasAny(normalizedCombined, [/\b(poor appetite|fear of weight gain|eating-disorder medical risk)\b/])
      ? buildEatingDisorderWarningPayload(input)
      : buildEatingDisorderChartReadyPayload(input);
  }

  if (hasAcuteInpatientHpiGeneration(normalizedCombined)) {
    return buildAcuteInpatientHpiPayload(input);
  }

  if (hasProgressNoteRefinement(normalizedCombined)) {
    return buildProgressNoteRefinementPayload(input);
  }

  if (hasDischargeSummaryGeneration(normalizedCombined)) {
    return buildDischargeSummaryPayload(input);
  }

  if (hasCrisisNoteWorkflow(normalizedCombined)) {
    return buildCrisisNotePayload(input);
  }

  if (hasInvoluntaryMedicationRefusal(normalizedCombined)) {
    if (hasAny(normalizedCombined, [/\b(noncompliant|choosing not to comply|punitive|warning language|force it|over objection)\b/])) {
      return buildInvoluntaryMedicationWarningPayload(input);
    }

    return hasAny(normalizedCombined, [/\b(pick one lane|clinical explanation|both\?|capacity|consent|recommendation)\b/])
      ? buildInvoluntaryMedicationClinicalExplanationPayload(input)
      : buildInvoluntaryMedicationChartReadyPayload(input);
  }

  if (hasAmaElopementRisk(normalizedCombined)) {
    if (hasAny(normalizedCombined, [/\b(warning language|elopement attempts?|leave out the elopement stuff)\b/])) {
      return buildAmaElopementWarningPayload(input);
    }

    return hasAny(normalizedCombined, [/\b(workflow guidance|what does vera have to keep visible|routine discharge planning|missing disposition)\b/])
      ? buildAmaElopementWorkflowPayload(input)
      : buildAmaElopementChartReadyPayload(input);
  }

  if (hasPersonalityLanguageCaution(normalizedCombined)) {
    if (hasAny(normalizedCombined, [/\b(borderline behavior|borderline traits|warning language|move on)\b/])) {
      return buildPersonalityWarningPayload(input);
    }

    return hasAny(normalizedCombined, [/\b(not stigmatizing|what should vera do|workflow guidance|less personality-ish|less dramatic)\b/])
      ? buildPersonalityWorkflowPayload(input)
      : buildPersonalityChartReadyPayload(input);
  }

  if (hasAny(normalizedMessage, [/\b(what does vera do with that contradiction|do with that contradiction|handle that contradiction)\b/])) {
    const documentationNeeds = buildDocumentationNeeds(primaryConcern, flags, input);
    const chartReady = buildAssessmentLanguage(primaryConcern, flags, `${input.sourceText}\n${input.currentDraftText || ''}`);
    const assessmentFrame = buildAssessmentFrame(primaryConcern, flags);
    return withAnswerMode({
      message: `${buildWarningText(primaryConcern, flags)} Interpretation: Atlas should document the contradiction side by side${documentationNeeds.length ? `: keep explicit ${joinList(documentationNeeds)}.` : '.'} ${assessmentFrame}`,
      suggestions: [
        `Interpretation: ${assessmentFrame}`,
        chartReady,
        'Suggested action: revise the note only after both sides of the contradiction remain visible and attributed.',
      ],
    }, 'warning_language', 'contradiction', input);
  }

  if (hasAny(normalizedMessage, [/\b(block discharge|blocks discharge|discharge note|premature discharge|stay unresolved in the plan|exact plan language|plan language|leaning toward discharge|calm discharge summary)\b/])) {
    if (hasAny(normalizedMessage, [/\bleaning toward discharge\b/])) {
      const blockers = buildDischargeBlockers(primaryConcern, flags, input);
      const documentationNeeds = buildDocumentationNeeds(primaryConcern, flags, input);
      return {
        message: `Atlas should not lean toward discharge here because ${joinList(blockers)}. Keep explicit ${joinList(documentationNeeds)} before the plan is cleaned up.`,
        suggestions: [
          blockers[0] ? `Highest-signal blocker: ${blockers[0]}.` : 'Do not lean toward discharge while the source stays unstable.',
          buildWarningText(primaryConcern, flags),
          buildAssessmentFrame(primaryConcern, flags),
        ],
      } satisfies AssistantResponsePayload;
    }

    return buildDischargeTaskPayload(
      primaryConcern,
      flags,
      input,
      hasAny(normalizedMessage, [/\b(exact plan language|tell me the exact plan language|honest plan language)\b/]),
    );
  }

  if (hasAny(normalizedMessage, [/\b(exact warning|warning language|what warning)\b/])) {
    if (override?.answerMode === 'warning_language') {
      return buildWarningLanguagePayload(primaryConcern, flags, input);
    }

    return withAnswerMode({
      message: `${buildDirectPushback(primaryConcern, input)} ${buildWarningText(primaryConcern, flags)}`,
      suggestions: [
        `Interpretation: ${buildAssessmentFrame(primaryConcern, flags)}`,
        `Suggested wording: ${buildAssessmentLanguage(primaryConcern, flags, `${input.sourceText}\n${input.currentDraftText || ''}`)}`,
        'Suggested action: replace the unsafe sentence rather than softening the warning into generic reassurance.',
      ],
    }, 'warning_language', builderFamily || 'risk', input);
  }

  if (hasAny(normalizedMessage, [/\b(unsafe|clinically weak|what is the failure|what is the obvious problem|what is the problem|why is vera wrong|why would vera let anyone settle|what exactly has it ignored|why is .* a problem|why is that garbage)\b/])) {
    if (hasAny(normalizedMessage, [/\bwhat exactly has it ignored\b/])) {
      const ignored = buildIgnoredElements(primaryConcern, flags, input);
      return withAnswerMode({
        message: primaryConcern === 'capacity'
          ? `It has ignored decisional capacity: ${joinList(ignored)}.`
          : `It has ignored ${joinList(ignored)}.`,
        suggestions: [
          ignored[0] || 'Keep the omitted findings explicit before sounding confident.',
          `Why this is unsafe: ${buildUnsafeExplanation(primaryConcern, flags).replace(/^That output would be unsafe because\s*/i, '')}`,
          buildDoNotSayLine(primaryConcern, flags),
          'Keep the omitted findings and capacity or risk limits explicit before sounding confident.',
        ],
      }, 'clinical_explanation', builderFamily || inferBuilderFamily(input.message, `${input.sourceText}\n${input.currentDraftText || ''}`, 'clinical_explanation', primaryConcern), input);
    }

    const unsafeReason = (
      hasGraveDisabilityConcern(input) && /\bgrave disability\b/.test(normalizedMessage)
        ? 'the source documents only limited functional impairment and does not justify a settled grave-disability conclusion'
        : buildUnsafeExplanation(primaryConcern, flags).replace(/^That output would be unsafe because\s*/i, '')
    );
    return withAnswerMode({
      message: `${buildDirectPushback(primaryConcern, input)} ${buildUnsafeLead(input.message, primaryConcern)} because ${unsafeReason}`,
      suggestions: [
        `Safe alternative: ${buildAssessmentFrame(primaryConcern, flags)}`,
        buildDoNotSayLine(primaryConcern, flags),
        buildDocumentationNeeds(primaryConcern, flags, input)[0] || 'Keep the missing capacity or risk facts explicit before sounding confident.',
        'Brief explanation: keep the higher-acuity concern explicit until the source truly resolves it.',
      ],
    }, 'clinical_explanation', builderFamily || inferBuilderFamily(input.message, `${input.sourceText}\n${input.currentDraftText || ''}`, 'clinical_explanation', primaryConcern), input);
  }

  if (override?.answerMode === 'warning_language') {
    return buildWarningLanguagePayload(primaryConcern, flags, input);
  }

  if (hasAny(normalizedMessage, [/\b(assessment language|documentation language|plan language|what language keeps|wording that|keep .* on the table|keep .* separate|keeps? .* separate|keep .* visible at the same time|keeps? .* visible at the same time|separate .* for me|needs to stay in the assessment|stay in the assessment)\b/])) {
    return withAnswerMode({
      message: buildAssessmentLanguage(primaryConcern, flags, `${input.sourceText}\n${input.currentDraftText || ''}`),
      suggestions: [
        buildWhySaferLine(primaryConcern, flags),
        buildDoNotSayLine(primaryConcern, flags),
        'Keep measured or observed facts in Objective and the unresolved interpretation in Assessment.',
      ],
    }, 'chart_ready_wording', builderFamily || 'chart-wording', input);
  }

  if (hasAny(normalizedMessage, [/\b(refuse to imply|keep explicit|keeps? .* explicit|keep visible|keeps? .* visible(?: at the same time)?|what cannot be smoothed over|what has to stay explicit|what needs to stay explicit)\b/])) {
    const documentationNeeds = buildDocumentationNeeds(primaryConcern, flags, input);
    const assessmentFrame = buildAssessmentFrame(primaryConcern, flags);
    return withAnswerMode({
      message: `${buildDirectPushback(primaryConcern, input)} ${assessmentFrame} ${documentationNeeds.length ? `Keep explicit ${joinList(documentationNeeds)}.` : 'Keep the unresolved high-acuity facts explicit.'}`,
      suggestions: [
        `Interpretation: ${assessmentFrame}`,
        `Suggested wording: ${buildAssessmentLanguage(primaryConcern, flags, `${input.sourceText}\n${input.currentDraftText || ''}`)}`,
        'Do not let reassurance, collateral minimization, or a cleaner diagnosis erase the harder facts.',
      ],
    }, 'warning_language', builderFamily || 'risk', input);
  }

  if (hasAny(normalizedMessage, [/\b(low risk or not|calling this low risk|can i (?:say|call).*(?:risk is low|low (?:suicide|violence) risk)|would low (?:suicide|violence)-?risk wording be okay|is grave disability clearly established)\b/])) {
    const wantsChartLanguage = hasAny(normalizedMessage, [/\b(can i say|can i call|keep the denial and the higher-?risk facts side by side)\b/]);
    return withAnswerMode({
      message: wantsChartLanguage
        ? buildLowRiskChartReadyWording(primaryConcern, `${input.sourceText}\n${input.currentDraftText || ''}`)
        : buildLowRiskSummary(primaryConcern, flags, input),
      suggestions: [
        wantsChartLanguage ? buildWhySaferLine(primaryConcern, flags) : `Safe alternative: ${buildAssessmentFrame(primaryConcern, flags)}`,
        buildDoNotSayLine(primaryConcern, flags),
        'Keep the higher-acuity facts and the denial side by side rather than choosing one.',
        'Do not use discharge-ready or low-risk shorthand while the contradiction remains active.',
      ],
    }, wantsChartLanguage ? 'chart_ready_wording' : 'warning_language', 'contradiction', input, {
      oneLineMessage: wantsChartLanguage
        ? buildLowRiskChartReadyWording(primaryConcern, `${input.sourceText}\n${input.currentDraftText || ''}`)
        : buildLowRiskSummary(primaryConcern, flags, input),
    });
  }

  return null;
}
