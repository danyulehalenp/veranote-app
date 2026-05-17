import { loadEnvConfig } from '@next/env';
import fs from 'node:fs';
import { buildSourceInputFromSections } from '@/lib/ai/source-sections';
import { generateNote } from '@/lib/ai/generate-note';
import { buildReviewedDocumentSourceBlock } from '@/lib/document-intake/source-document-intake';
import { auditGeneratedNoteQuality } from '@/lib/eval/note-generation/note-quality-audit';
import type { SourceSections } from '@/types/session';

type RequiredPattern = {
  label: string;
  pattern: RegExp;
};

type ForbiddenPattern = {
  label: string;
  pattern: RegExp;
};

const SI_HI_DENIAL_PATTERN = /denies? SI\/HI|den(?:y|ies|ied).{0,80}suicidal.{0,40}homicidal|den(?:y|ies|ied) suicidal|den(?:y|ies|ied) homicidal|no current suicidal or homicidal ideation/i;

export type SourcePacketRegressionCase = {
  id: string;
  title: string;
  specialty?: string;
  role?: string;
  ehr?: string;
  noteType: string;
  customInstructions?: string;
  sourceSections: SourceSections;
  required: RequiredPattern[];
  forbidden: ForbiddenPattern[];
};

export type SourcePacketRegressionCaseResult = {
  id: string;
  title: string;
  noteType: string;
  passed: boolean;
  mode: 'live' | 'fallback';
  reason: string;
  missing: string[];
  forbiddenHits: string[];
  qualityScore: number;
  qualityFindings: string[];
  qualityBlockingFindings: string[];
  noteLength: number;
  noteExcerpt: string;
  flagCount: number;
};

export type SourcePacketRegressionReport = {
  total: number;
  passed: number;
  failed: number;
  cases: SourcePacketRegressionCaseResult[];
};

const runtimePath = '/Users/danielhale/.openclaw/workspace/app-prototype';

export const sourcePacketRegressionCases: SourcePacketRegressionCase[] = [
  {
    id: 'four-field-outpatient-passive-risk',
    title: 'Outpatient follow-up preserves passive death-wish nuance across all source lanes',
    noteType: 'Outpatient Psych Follow-Up',
    customInstructions: 'Use WellSky-friendly labeled sections. Keep passive death-wish nuance in Safety / Risk.',
    sourceSections: {
      intakeCollateral: [
        'Referral / pre-visit data:',
        '- PHQ item last week flagged: thoughts patient would be better off dead.',
        '- Nursing intake documents no firearm access.',
        '- Medication list: sertraline 50 mg daily.',
      ].join('\n'),
      clinicianNotes: [
        'Provider live note:',
        '- Follow-up for depression/anxiety.',
        '- Mood is "a little better but not all the way there."',
        '- Denies active SI, plan, or intent today.',
        '- Side effects not addressed.',
      ].join('\n'),
      patientTranscript: [
        'Ambient transcript:',
        'Patient: "Sometimes I wish I would not wake up, but I do not want to kill myself."',
        'Provider reviewed crisis line and aunt as support if thoughts intensify.',
      ].join('\n'),
      objectiveData: [
        'Provider Add-On:',
        '- Preserve passive death wish plus denial of active intent/plan.',
        '- Do not summarize as low risk.',
        '- Billing code TBD; do not place billing code in clinical plan.',
      ].join('\n'),
    },
    required: [
      { label: 'passive death-wish wording remains visible', pattern: /wish (?:i )?(?:would not|wouldn'?t) wake up|passive death/i },
      { label: 'active SI plan or intent denial remains visible', pattern: /denies? active .*?(?:plan|intent)|denies? .*?(?:plan|intent).*?today|does not want to kill/i },
      { label: 'documented support resource remains visible', pattern: /crisis line|aunt|support/i },
      { label: 'partial improvement remains hedged', pattern: /little better|not all the way|partial/i },
    ],
    forbidden: [
      { label: 'unsupported low-risk conclusion', pattern: /\blow[-\s]?risk\b/i },
      { label: 'unsupported safe discharge wording', pattern: /\bsafe (?:for|to) discharge\b/i },
      { label: 'billing code treated as clinical plan', pattern: /billing code tbd/i },
    ],
  },
  {
    id: 'inpatient-progress-psychosis-observation-conflict',
    title: 'Inpatient progress note keeps denial separate from observed internal-preoccupation concern',
    noteType: 'Inpatient Psych Progress Note',
    customInstructions: 'Keep patient denial, nursing observations, and provider observations separated. Do not diagnose primary psychosis from this source.',
    sourceSections: {
      intakeCollateral: [
        'Pre-visit nursing note:',
        '- Appeared internally preoccupied overnight.',
        '- Laughing to self at times.',
        '- Slept 2 hours.',
        '- No restraints documented.',
      ].join('\n'),
      clinicianNotes: [
        'Live visit notes:',
        '- Patient denies AH/VH.',
        '- Guarded; occasionally looked toward the corner.',
        '- Speech soft.',
        '- No SI/HI voiced.',
        '- Continue current precautions documented.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nPatient: "No, I am not hearing voices. I just did not sleep."',
      objectiveData: 'Provider Add-On:\nDo not state confirmed hallucinations or primary psychosis. Preserve denial versus observation.',
    },
    required: [
      { label: 'patient denial of hallucinations remains visible', pattern: /denies? (?:ah\/vh|hallucinations|hearing voices)|not hearing voices/i },
      { label: 'nursing observation remains visible', pattern: /internally preoccupied|laughing to self|looked toward the corner/i },
      { label: 'uncertainty or source attribution remains visible', pattern: /observation|observed|nursing|staff|denies|unclear|not confirmed|concern/i },
      { label: 'sleep detail remains visible', pattern: /slept 2 hours|2 hours/i },
    ],
    forbidden: [
      { label: 'confirmed hallucination claim', pattern: /confirmed hallucinations|patient (?:is|was) hallucinating/i },
      { label: 'primary psychosis conclusion', pattern: /primary psychotic disorder|primary psychosis/i },
      { label: 'invented normal MSE', pattern: /thought process (?:is )?(?:linear|logical)|insight and judgment (?:are )?(?:good|intact)|alert and oriented x ?[34]/i },
    ],
  },
  {
    id: 'outpatient-medication-conflict-source-packet',
    title: 'Outpatient follow-up preserves chart-versus-patient medication conflict',
    noteType: 'Outpatient Psych Follow-Up',
    customInstructions: 'For Tebra copy/paste, keep medication conflict explicit and do not state refill completion unless documented.',
    sourceSections: {
      intakeCollateral: [
        'Pre-visit chart review:',
        '- Medication list still shows sertraline 100 mg daily.',
        '- Pharmacy refill history not reviewed today.',
      ].join('\n'),
      clinicianNotes: [
        'Live visit notes:',
        '- Last visit plan was to increase sertraline from 50 mg to 100 mg.',
        '- Patient reports she stayed on 50 mg because she was nervous about increasing.',
        '- Mood partially improved.',
        '- Requests refill.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nPatient: "I never went up to 100. I have been taking the 50 most days."',
      objectiveData: 'Provider Add-On:\nDo not say taking as prescribed. No refill sent is documented in this source.',
    },
    required: [
      { label: 'sertraline conflict remains visible', pattern: /sertraline/i },
      { label: '100 mg chart or prior plan remains visible', pattern: /100 ?mg/i },
      { label: '50 mg patient-reported dose remains visible', pattern: /50 ?mg/i },
      { label: 'adherence uncertainty remains visible', pattern: /most days|nervous about increasing|stayed on 50|not resolved|does not resolve/i },
    ],
    forbidden: [
      { label: 'stronger adherence than source supports', pattern: /taking as prescribed|adherent|compliant/i },
      { label: 'refill completion invented', pattern: /refill (?:sent|provided|authorized|completed)/i },
      { label: 'settled active regimen invented', pattern: /current regimen is sertraline 100 ?mg|continue sertraline 100 ?mg/i },
    ],
  },
  {
    id: 'er-referral-substance-objective-conflict',
    title: 'ER referral note keeps objective UDS, patient denial, and collateral concern unresolved',
    noteType: 'Substance-vs-Psych Overlap Note',
    customInstructions: 'Keep substance timing unresolved. Do not diagnose substance-induced psychosis from this packet.',
    sourceSections: {
      intakeCollateral: [
        'ER referral OCR text:',
        '- UDS positive cocaine.',
        '- BAL negative.',
        '- BP 158/94.',
        '- Labs otherwise not fully included.',
        '- Referred for paranoia after 2 nights no sleep.',
      ].join('\n'),
      clinicianNotes: [
        'Live visit notes:',
        '- Patient denies cocaine use and says, "I did not use anything."',
        '- Reports paranoia started after not sleeping.',
        '- No SI/HI.',
      ].join('\n'),
      patientTranscript: [
        'Ambient transcript:',
        'Girlfriend collateral in room: "He was up for two days and using something."',
        'Patient: "No, I was not."',
      ].join('\n'),
      objectiveData: 'Provider Add-On:\nKeep denial, collateral, and UDS positive result side by side. Do not diagnose substance-induced psychosis.',
    },
    required: [
      { label: 'objective UDS result remains visible', pattern: /UDS positive cocaine|positive (?:for )?cocaine|urine drug screen/i },
      { label: 'patient denial remains visible', pattern: /denies? cocaine|did not use anything|patient denies/i },
      { label: 'collateral concern remains visible', pattern: /girlfriend|collateral|using something/i },
      { label: 'unresolved timing or differential remains visible', pattern: /unresolved|unclear|uncertain|differential|not established/i },
    ],
    forbidden: [
      { label: 'substance-induced psychosis stated as established', pattern: /(?:diagnosis is|consistent with|confirmed|established).{0,80}substance-induced psychosis|substance-induced psychosis (?:is|was) (?:diagnosed|confirmed|established)/i },
      { label: 'cocaine use timing stated as confirmed', pattern: /confirmed recent cocaine use|recent cocaine use confirmed|UDS confirms recent cocaine use/i },
      { label: 'medical clearance invented', pattern: /medically cleared|cleared for psych/i },
    ],
  },
  {
    id: 'ocr-er-referral-first-episode-psychosis-misspellings',
    title: 'OCR ER packet with misspellings preserves uncertainty and does not invent medical clearance',
    noteType: 'Inpatient Psych Initial Adult Evaluation',
    customInstructions: 'Use a readable initial evaluation structure. Correct obvious OCR spelling only when meaning is clear.',
    sourceSections: {
      intakeCollateral: [
        'Scanned ER referral / OCR:',
        '- pt brougt by famly for parnoia / "hearng voics" per triage.',
        '- CT head: no acute intracranial abnormality.',
        '- CMP partial: Na 133, Cr 1.1; CBC not visable in scan.',
        '- UDS neg per ER summary, but actual lab sheet not included.',
        '- Transfer note says "med clear?" with question mark.',
      ].join('\n'),
      clinicianNotes: [
        'Live visit notes:',
        '- Patient says he has been scared neighbors are watching him.',
        '- Denies SI/HI.',
        '- Denies substance use.',
        '- Sleep poor for several nights.',
        '- MSE: guarded, anxious, thought content paranoid themes, not clearly responding to internal stimuli during interview.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nPatient: "I am not crazy, I just think they are watching me through the window."',
      objectiveData: [
        'Provider Add-On:',
        '- Treat OCR as imperfect.',
        '- Do not state medically cleared.',
        '- Do not diagnose schizophrenia from this source.',
      ].join('\n'),
    },
    required: [
      { label: 'paranoia or paranoid themes carried forward despite misspelling', pattern: /paranoi|neighbors are watching|watching him|watching me/i },
      { label: 'hearing voices source is attributed or hedged', pattern: /triage|reported|per .*?(?:triage|referral)|hearing voices|voices/i },
      { label: 'CT result remains visible', pattern: /CT head|no acute intracranial abnormality/i },
      { label: 'medical clearance uncertainty remains visible', pattern: /medical clearance|med clear|clearance.*(?:unclear|question|not established)|question mark|not documented/i },
    ],
    forbidden: [
      { label: 'medical clearance invented', pattern: /medically cleared for|cleared for psychiatric admission|cleared for psych/i },
      { label: 'schizophrenia diagnosis invented', pattern: /diagnosed with schizophrenia|schizophrenia is diagnosed|meets criteria for schizophrenia/i },
      { label: 'OCR uncertainty erased', pattern: /CBC (?:normal|within normal limits)|UDS confirms no substance use/i },
    ],
  },
  {
    id: 'reviewed-document-source-preserves-pending-labs-and-collateral',
    title: 'Reviewed outside document block preserves pending labs, collateral, and discharge uncertainty',
    noteType: 'Inpatient Psych Progress Note',
    customInstructions: 'Treat the reviewed document block as source material. Preserve pending labs and collateral without converting them into confirmed clearance or discharge readiness.',
    sourceSections: {
      intakeCollateral: buildReviewedDocumentSourceBlock({
        fileName: 'ER referral packet.pdf',
        mimeType: 'application/pdf',
        sourceKind: 'pdf',
        extractionMode: 'manual-ocr-review',
        reviewedText: [
          'Provider-reviewed OCR from ER referral packet:',
          '- Lithium level ordered but result pending at time of transfer.',
          '- Mother collateral reports patient stopped medication after recent discharge.',
          '- ED note does not include a final discharge plan.',
          '- Medical clearance wording is not present in the reviewed source.',
        ].join('\n'),
      }),
      clinicianNotes: [
        'Live visit notes:',
        '- Patient requests discharge and says he feels fine.',
        '- Patient states he took medication yesterday, but timing is vague.',
        '- Mood irritable; sleep poor last night.',
        '- Denies current SI/HI.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nPatient: "My mom worries too much. I took something yesterday, I think."',
      objectiveData: [
        'Provider Add-On:',
        '- Do not state lithium level is normal.',
        '- Do not state medically cleared.',
        '- Do not state safe for discharge.',
      ].join('\n'),
    },
    required: [
      { label: 'pending lithium result remains visible', pattern: /lithium(?: level)?.{0,80}pending|pending.{0,80}lithium/i },
      { label: 'mother collateral remains visible', pattern: /mother|collateral/i },
      { label: 'medication nonadherence concern remains visible', pattern: /stopped medication|nonadher|medication adherence|took medication yesterday|timing is vague/i },
      { label: 'discharge uncertainty remains visible', pattern: /discharge.{0,80}(?:not documented|not established|unclear|no final|uncertain)|no final discharge plan/i },
    ],
    forbidden: [
      { label: 'medical clearance invented', pattern: /medically cleared|cleared for psych|cleared for psychiatric/i },
      { label: 'safe discharge invented', pattern: /safe for discharge|stable for discharge/i },
      { label: 'lithium result invented', pattern: /lithium (?:level )?(?:normal|within normal limits|wnl|therapeutic)/i },
      { label: 'collateral conflict erased', pattern: /adherent with medication|taking as prescribed|mother confirms adherence/i },
    ],
  },
  {
    id: 'tebra-outpatient-eval-referral-history-not-confirmed',
    title: 'Outpatient evaluation from prior-provider referral keeps historical diagnoses and current assessment separate',
    ehr: 'Tebra/Kareo',
    noteType: 'Outpatient Psychiatric Evaluation',
    customInstructions: 'Use Tebra-friendly labeled sections. Keep prior diagnoses as historical/reported unless independently supported.',
    sourceSections: {
      intakeCollateral: [
        'Referral packet from previous provider:',
        '- Prior diagnoses listed: ADHD, bipolar disorder, PTSD.',
        '- Prior med list: Adderall XR 20 mg, quetiapine 100 mg qhs, lamotrigine 100 mg.',
        '- Last note is 11 months old and says patient lost to follow-up.',
      ].join('\n'),
      clinicianNotes: [
        'Live intake notes:',
        '- Patient presents for new outpatient evaluation.',
        '- Reports concentration issues and trauma history.',
        '- Denies current decreased need for sleep, grandiosity, or risky behavior.',
        '- Says she stopped quetiapine months ago due to sedation.',
        '- No SI/HI today.',
      ].join('\n'),
      patientTranscript: [
        'Ambient transcript:',
        'Patient: "They said bipolar before, but I am not sure. I mostly want help with focus and anxiety."',
        'Patient: "Lamictle helped some but I ran out."',
      ].join('\n'),
      objectiveData: [
        'Provider Add-On:',
        '- Correct Lamictle to lamotrigine if used.',
        '- Do not confirm bipolar disorder from referral alone.',
        '- Do not say stimulant was continued or restarted today.',
      ].join('\n'),
    },
    required: [
      { label: 'prior diagnoses stay historical or referral-based', pattern: /prior diagnos|historical|referral|previous provider|listed/i },
      { label: 'bipolar uncertainty remains visible', pattern: /bipolar.*(?:unclear|uncertain|uncertainty|not sure|not confirmed|historical|reported|needs|requires)|not confirm/i },
      { label: 'lamotrigine normalized from misspelling', pattern: /lamotrigine|Lamictal/i },
      { label: 'quetiapine stopped due to sedation remains visible', pattern: /quetiapine.*(?:stopped|sedation)|stopped quetiapine|sedation/i },
    ],
    forbidden: [
      { label: 'bipolar disorder confirmed from referral alone', pattern: /confirmed bipolar|meets criteria for bipolar|diagnosed with bipolar disorder/i },
      { label: 'stimulant decision invented', pattern: /(?:continue|restart|refill|increase|start) Adderall|Adderall[^.\n]{0,80}\b(?:continued|restarted|refilled)\b/i },
      { label: 'stopped quetiapine erased', pattern: /currently taking quetiapine|continues quetiapine/i },
    ],
  },
  {
    id: 'scanned-prior-note-allergy-medication-conflict',
    title: 'Scanned prior-provider packet preserves allergy and med-list contradiction without resolving it',
    specialty: 'Psychiatry',
    role: 'Psychiatric NP',
    ehr: 'Luminello',
    noteType: 'Outpatient Psychiatric Evaluation',
    customInstructions: 'Use outpatient evaluation sections. Preserve allergy conflict and do not resolve medication safety from this packet alone.',
    sourceSections: {
      intakeCollateral: buildReviewedDocumentSourceBlock({
        fileName: 'outside-psychiatry-referral-scan.pdf',
        mimeType: 'application/pdf',
        sourceKind: 'pdf',
        extractionMode: 'manual-ocr-review',
        reviewedText: [
          'Provider-reviewed OCR from outside psychiatry referral:',
          '- Allergy list: sulfa - hives; reaction date not visible.',
          '- Medication list: lamotrigine 100 mg daily, sertraline 50 mg daily.',
          '- Prior note states rash history but OCR cuts off the medication name.',
          '- Diagnoses copied forward: bipolar disorder and PTSD; last full assessment not included.',
        ].join('\n'),
      }),
      clinicianNotes: [
        'Live intake:',
        '- Patient says "Lamictal helped but I stopped when I got a rash last year."',
        '- Patient is unsure whether the rash was from lamotrigine or antibiotic.',
        '- Denies current SI/HI.',
        '- Wants help restarting something for mood swings.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nPatient: "I remember hives with a sulfa antibiotic, but the rash with Lamictal was different. I am not sure."',
      objectiveData: [
        'Provider Add-On:',
        '- Keep allergy/rash uncertainty explicit.',
        '- Do not say lamotrigine was restarted.',
        '- Do not confirm bipolar disorder from copied-forward diagnoses alone.',
      ].join('\n'),
    },
    required: [
      { label: 'sulfa allergy remains visible', pattern: /sulfa|hives/i },
      { label: 'lamotrigine/Lamictal rash uncertainty remains visible', pattern: /lamotrigine|Lamictal|rash/i },
      { label: 'uncertainty/conflict remains visible', pattern: /uncertain|unsure|not sure|unclear|different|conflict|not confirmed/i },
      { label: 'copied-forward diagnosis uncertainty visible', pattern: /copied[- ]forward|historical|not confirmed|prior diagnos|referral/i },
    ],
    forbidden: [
      { label: 'lamotrigine restart invented', pattern: /(?:restart|restarted|start|started|resume|resumed) lamotrigine|lamotrigine (?:was )?(?:restarted|started|resumed)/i },
      { label: 'rash cause resolved without support', pattern: /(?:^|[.\n]\s*)(?:the\s+)?rash (?:was|is) caused by lamotrigine\b|rash (?:was|is) (?:clearly |definitely |confirmed |confirmed as )caused by lamotrigine|rash (?:was|is) attributed to lamotrigine|lamotrigine caused the rash|sulfa caused the rash/i },
      { label: 'bipolar disorder confirmed from copied-forward list', pattern: /confirmed bipolar|meets criteria for bipolar|bipolar disorder is diagnosed/i },
    ],
  },
  {
    id: 'prior-note-current-risk-conflict-date-sensitive',
    title: 'Prior note denial does not erase current collateral risk concern',
    specialty: 'Psychiatry',
    role: 'Psychiatric NP',
    ehr: 'Netsmart myAvatar',
    noteType: 'Inpatient Psych Progress Note',
    customInstructions: 'Use inpatient progress note sections. Separate yesterday/prior-note facts from today/current source facts.',
    sourceSections: {
      intakeCollateral: [
        'Prior note from yesterday:',
        '- Patient denied SI/HI yesterday morning.',
        '- Plan said continue observation and reassess after family meeting.',
        '- No final discharge plan documented.',
        '',
        'Nursing/collateral update today:',
        '- Sister called this morning reporting patient texted "I cannot keep doing this" overnight.',
        '- Staff note says patient isolated after phone call.',
      ].join('\n'),
      clinicianNotes: [
        'Provider live note today:',
        '- Patient denies current SI/HI during interview.',
        '- Affect constricted, answers short.',
        '- Patient says text was "just frustration."',
        '- Safety plan details not yet reviewed in today’s note.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nPatient: "I do not want to die. I just sent that because I was mad."',
      objectiveData: [
        'Provider Add-On:',
        '- Do not let yesterday denial override today collateral.',
        '- Do not say risk resolved or low risk.',
        '- Keep source dates clear.',
      ].join('\n'),
    },
    required: [
      { label: 'yesterday denial remains date-attributed', pattern: /yesterday|prior note/i },
      { label: 'today collateral text remains visible', pattern: /sister|collateral|cannot keep doing this|overnight/i },
      { label: 'current denial remains visible', pattern: /denies? current SI\/HI|denies? current suicidal|do not want to die/i },
      { label: 'risk remains unresolved or needs review', pattern: /unresolved|not resolved|requires|needs|reassess|safety plan/i },
    ],
    forbidden: [
      { label: 'low-risk conclusion from denial alone', pattern: /\blow[-\s]?risk\b|\brisk is low\b|risk resolved/i },
      { label: 'today collateral erased', pattern: /no collateral concern|collateral denies concern/i },
      { label: 'discharge readiness invented', pattern: /safe for discharge|stable for discharge|ready for discharge/i },
    ],
  },
  {
    id: 'ocr-clozapine-anc-pharmacy-gap',
    title: 'OCR clozapine packet preserves ANC/pharmacy gaps without stating monitoring is current',
    specialty: 'Psychiatry',
    role: 'Psychiatric NP',
    ehr: 'Qualifacts/CareLogic',
    noteType: 'Inpatient Psych Initial Adult Evaluation',
    customInstructions: 'Use inpatient evaluation sections. Preserve clozapine monitoring uncertainty and pharmacy gap.',
    sourceSections: {
      intakeCollateral: [
        'ER transfer packet OCR:',
        '- Home med list may include clozapine 200 mg qhs, but line is partially cut off.',
        '- ANC: ordered / pending; prior ANC not visible in packet.',
        '- Pharmacy fill history: last clozapine fill appears 62 days ago.',
        '- Allergy field unreadable.',
      ].join('\n'),
      clinicianNotes: [
        'Live admission note:',
        '- Patient says he takes "my Clozaril most nights" but missed several doses recently.',
        '- Reports sedation.',
        '- Denies current SI/HI.',
        '- Paranoid thoughts noted; no detailed medication reconciliation completed yet.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nPatient: "I have not been perfect with it. I missed a bunch when I ran out."',
      objectiveData: [
        'Provider Add-On:',
        '- Do not say ANC is normal or monitoring is current.',
        '- Do not state clozapine was continued or restarted.',
        '- Keep medication reconciliation incomplete.',
      ].join('\n'),
    },
    required: [
      { label: 'clozapine/Clozaril remains visible', pattern: /clozapine|Clozaril/i },
      { label: 'ANC pending or not visible remains visible', pattern: /ANC.*(?:pending|not visible|ordered)|pending.*ANC|prior ANC/i },
      { label: 'pharmacy fill gap remains visible', pattern: /62 days|last .*fill|pharmacy/i },
      { label: 'missed doses/nonadherence remains visible', pattern: /missed|ran out|not been perfect|adherence|reconciliation incomplete/i },
    ],
    forbidden: [
      { label: 'ANC normal/current invented', pattern: /ANC (?:normal|within normal limits|current|up to date)|monitoring (?:current|up to date)/i },
      { label: 'clozapine action invented', pattern: /(?:continue|continued|restart|restarted|start|started) clozapine|clozapine (?:continued|restarted|started)/i },
      { label: 'perfect adherence invented', pattern: /taking as prescribed|fully adherent|good adherence|adherent with clozapine/i },
    ],
  },
  {
    id: 'wellsky-inpatient-day-two-missing-mse-risk-details',
    title: 'WellSky inpatient day-two note preserves missing MSE and safety gaps instead of filling normal defaults',
    noteType: 'Inpatient Psych Day Two Note',
    customInstructions: 'Use WellSky-friendly sections. Keep missing MSE and risk details visible as documentation gaps.',
    sourceSections: {
      intakeCollateral: [
        'Overnight nursing:',
        '- Took scheduled meds.',
        '- Slept 5 hrs.',
        '- No aggression.',
        '- Group attendance not documented.',
      ].join('\n'),
      clinicianNotes: [
        'Provider typed fast:',
        '- Day 2 f/u. mood "ok". asks when leaving.',
        '- Denies SI/HI.',
        '- No side effects volunteered.',
        '- No detailed MSE typed yet.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nPatient: "I want to go home. I am okay. I took the meds."',
      objectiveData: 'Provider Add-On:\nDo not invent full MSE. Mention that detailed MSE is limited or not documented.',
    },
    required: [
      { label: 'day-two follow-up content visible', pattern: /Day 2|day two|follow-up|f\/u/i },
      { label: 'sleep and medication-taking detail visible', pattern: /slept 5|5 (?:hrs?|hours?)|took scheduled med(?:s|ications)|took the meds/i },
      { label: 'SI/HI denial visible', pattern: SI_HI_DENIAL_PATTERN },
      { label: 'limited MSE remains visible', pattern: /MSE.*(?:limited|not documented|not detailed)|mental status.*(?:limited|not documented|not detailed)|detailed MSE/i },
    ],
    forbidden: [
      { label: 'invented normal MSE', pattern: /thought process (?:is )?(?:linear|logical)|insight and judgment (?:are )?(?:good|intact)|alert and oriented x ?[34]/i },
      { label: 'discharge readiness invented', pattern: /ready for discharge|stable for discharge|safe for discharge/i },
      { label: 'unsupported low-risk conclusion', pattern: /\blow[-\s]?risk\b|\brisk is low\b/i },
      { label: 'unsupported medical stability conclusion', pattern: /\bmedically stable\b/i },
      { label: 'group attendance invented', pattern: /attended group|participated in group/i },
    ],
  },
  {
    id: 'discharge-summary-pending-labs-and-collateral-risk',
    title: 'Discharge-style packet does not erase pending labs or collateral risk concern',
    noteType: 'Inpatient Psych Discharge Summary',
    customInstructions: 'Generate discharge-summary style wording but do not state discharge readiness if source support is incomplete.',
    sourceSections: {
      intakeCollateral: [
        'Chart review:',
        '- Lithium level ordered this morning, result pending.',
        '- Mother called yesterday worried patient would stop meds after discharge.',
        '- Admission reason: suicidal statements during intoxication.',
        '- BAL was 190 on admission.',
      ].join('\n'),
      clinicianNotes: [
        'Provider live note:',
        '- Patient wants discharge today.',
        '- Denies SI/HI today.',
        '- Says "I will take the meds if I leave."',
        '- No final discharge plan documented yet.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nPatient: "I am not suicidal now. I just want to go home."',
      objectiveData: [
        'Provider Add-On:',
        '- Do not say stable for discharge.',
        '- Preserve pending lithium level and mother collateral.',
        '- Do not convert patient request into discharge plan.',
      ].join('\n'),
    },
    required: [
      { label: 'pending lithium level remains visible', pattern: /lithium level.*pending|pending lithium/i },
      { label: 'mother collateral concern remains visible', pattern: /mother.*(?:worried|concern)|collateral/i },
      { label: 'current denial remains visible but not overused', pattern: /denies? SI\/HI|not suicidal now|denies? suicidal/i },
      { label: 'final discharge plan absence remains visible', pattern: /discharge plan.*not documented|no final discharge plan|not established|source limitations/i },
    ],
    forbidden: [
      { label: 'discharge readiness invented', pattern: /stable for discharge|safe for discharge|discharge ready|ready for discharge/i },
      { label: 'lithium result invented', pattern: /lithium level (?:normal|therapeutic|within range)|therapeutic lithium/i },
      { label: 'collateral concern erased by low-risk wording', pattern: /\blow[-\s]?risk\b|risk resolved/i },
    ],
  },
  {
    id: 'therapy-progress-note-dictated-cbt-no-medical-plan',
    title: 'Therapy progress note turns dictated therapy content into psychotherapy note structure without medication plan',
    specialty: 'Therapy',
    role: 'Therapist',
    noteType: 'Therapy Progress Note',
    customInstructions: 'Use therapy progress-note sections. Do not add medication management or psychiatric prescribing plan.',
    sourceSections: {
      intakeCollateral: [
        'Pre-session data:',
        '- Client scheduled after work conflict with supervisor.',
        '- Last session homework was journaling triggers.',
      ].join('\n'),
      clinicianNotes: [
        'Therapist typed notes:',
        '- CBT reframing around all-or-nothing thinking.',
        '- Practiced grounding exercise.',
        '- Client said grounding helped only a little.',
        '- Denies SI/HI.',
      ].join('\n'),
      patientTranscript: [
        'Ambient transcript:',
        'Client: "I shut down when my boss criticizes me."',
        'Therapist: reviewed thought record homework for next week.',
      ].join('\n'),
      objectiveData: [
        'Provider Add-On:',
        '- This is therapy, not medication management.',
        '- Include intervention, response, and homework.',
      ].join('\n'),
    },
    required: [
      { label: 'therapy intervention visible', pattern: /CBT|reframing|grounding/i },
      { label: 'client response remains qualified', pattern: /helped only a little|only a little|unclear benefit|partial/i },
      { label: 'homework visible', pattern: /thought record|homework|journaling triggers/i },
      { label: 'SI/HI denial visible', pattern: SI_HI_DENIAL_PATTERN },
    ],
    forbidden: [
      { label: 'medication plan invented', pattern: /medication (?:adjustment|changes?|plan)|continue current medications|psychotropic medication/i },
      { label: 'therapy benefit overstated', pattern: /grounding was effective|significant improvement|resolved/i },
      { label: 'provider add-on echoed', pattern: /this is therapy, not medication management|include intervention, response, and homework/i },
    ],
  },
  {
    id: 'provider-named-custom-prompt-with-cpt-diagnosis-preferences',
    title: 'Provider-named prompt guides format without leaking billing or prompt text into clinical note',
    noteType: 'Outpatient Psych Follow-Up',
    customInstructions: 'Use the provider named prompt when it affects structure, but do not quote the prompt instructions.',
    sourceSections: {
      intakeCollateral: [
        'Pre-visit data:',
        '- GAD-7 decreased from 18 to 13.',
        '- Medication list shows escitalopram 10 mg daily.',
      ].join('\n'),
      clinicianNotes: [
        'Live visit notes:',
        '- Pt says anxity is down some but still avoids stores.',
        '- Sleep improved from 4 hrs to 6 hrs.',
        '- No panic attacks this week.',
        '- Denies SI/HI.',
        '- Side effects: mild nausea first week, mostly gone now.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nPatient: "Lexapro helped some. I am still not going into Walmart by myself."',
      objectiveData: [
        'Provider Add-On:',
        '- Named prompt: Hale concise follow-up.',
        '- Diagnosis preference: GAD if supported.',
        '- CPT preference: consider 99214 if documentation supports it.',
        '- Do not place CPT or named prompt in the clinical note.',
      ].join('\n'),
    },
    required: [
      { label: 'anxiety partial improvement visible despite misspelling', pattern: /anxiety|GAD|anxious/i },
      { label: 'avoidance remains visible', pattern: /avoids stores|avoidance|Walmart/i },
      { label: 'sleep improvement timeline visible', pattern: /4 (?:hrs?|hours?) to 6 (?:hrs?|hours?)|sleep improved/i },
      { label: 'side effect uncertainty/timeline visible', pattern: /mild nausea|first week|mostly gone/i },
    ],
    forbidden: [
      { label: 'CPT preference leaked into note', pattern: /99214|CPT preference|CPT/i },
      { label: 'named prompt leaked into note', pattern: /Hale concise follow-up|Named prompt/i },
      { label: 'side effects overstated or erased', pattern: /no side effects|denies side effects|tolerating without side effects/i },
    ],
  },
  {
    id: 'typo-heavy-outpatient-followup-preserves-med-adherence-side-effect-nuance',
    title: 'Typo-heavy outpatient follow-up normalizes obvious clinical terms without overstating adherence or side effects',
    specialty: 'Psychiatry',
    role: 'Psychiatric NP',
    ehr: 'Tebra/Kareo',
    noteType: 'Outpatient Psych Follow-Up',
    customInstructions: 'Correct obvious provider misspellings silently. Keep adherence and side-effect nuance source-close.',
    sourceSections: {
      intakeCollateral: [
        'Pre-visit data:',
        '- PHQ9 was 16 last visit and 11 today.',
        '- med list: sertrline 50 mg daily.',
        '- BP 128/78.',
        '- Therapy referral not scheduled yet.',
      ].join('\n'),
      clinicianNotes: [
        'Provider typed fast:',
        '- depresion better some, anxity still high at work.',
        '- taking sertrline most days but missed 2 dosess this week.',
        '- nausia first wk, mostly gone.',
        '- no rash.',
        '- denys si hi.',
      ].join('\n'),
      patientTranscript: [
        'Ambient transcript:',
        'Patient: "I think the Zoloft is helping some, but I still get nervous at work."',
        'Patient: "I forgot it twice this week."',
      ].join('\n'),
      objectiveData: [
        'Provider Add-On:',
        '- Treat misspellings as rushed typing when meaning is clear.',
        '- Do not say taking as prescribed or perfect adherence.',
        '- Do not erase nausea; it was mostly gone, not absent.',
        '- Do not invent a medication dose change.',
      ].join('\n'),
    },
    required: [
      { label: 'depression or PHQ improvement visible despite misspelling', pattern: /depression|PHQ-?9|PHQ9|16.*11|11.*16/i },
      { label: 'anxiety at work visible despite misspelling', pattern: /anxiety|anxious|nervous.*work|work/i },
      { label: 'sertraline or Zoloft visible despite misspelling', pattern: /sertraline|Zoloft/i },
      { label: 'missed doses remain visible', pattern: /missed.*(?:2|two).*dose|forgot.*(?:twice|2)|missed.*this week/i },
      { label: 'nausea timeline remains visible', pattern: /nausea|first week|mostly gone/i },
      { label: 'SI/HI denial visible despite misspelling', pattern: SI_HI_DENIAL_PATTERN },
    ],
    forbidden: [
      { label: 'adherence overstated', pattern: /taking as prescribed|perfect adherence|fully adherent|good adherence|adherent with medication/i },
      { label: 'side effect erased', pattern: /no side effects|denies side effects|tolerating without side effects/i },
      { label: 'dose change invented', pattern: /(?:^|[.\n]\s*)(?:increase|decrease|adjust|change)\s+(?:the\s+)?(?:sertraline|zoloft)\s+(?:dose|dosage|mg)\b|(?:sertraline|zoloft)[^.\n]{0,100}\b(?:dose|dosage|mg)\b[^.\n]{0,100}\b(?:was|is|were|has been)\s+(?:increased|decreased|adjusted|changed)\b/i },
      { label: 'provider instruction leaked', pattern: /treat misspellings as rushed typing|perfect adherence|Provider Add-On/i },
    ],
  },
  {
    id: 'telehealth-followup-video-limited-mse-missed-dose',
    title: 'Telehealth follow-up keeps video limitation, missed-dose detail, and limited MSE visible',
    specialty: 'Psychiatry',
    ehr: 'Tebra/Kareo',
    noteType: 'Outpatient Psych Telehealth Follow-Up',
    customInstructions: 'Use telehealth-friendly follow-up sections. Do not invent vitals, full MSE, or medication changes.',
    sourceSections: {
      intakeCollateral: [
        'Portal pre-visit:',
        '- Pt msg: "camera keeps freezing."',
        '- Last PHQ-9 14 two months ago; no new scale today.',
        '- Pharmacy fill date 31 days ago.',
      ].join('\n'),
      clinicianNotes: [
        'Live telehealth note:',
        '- Anxiety better some on buspirone.',
        '- Missed night dose 3x this week because fell asleep.',
        '- Denies SI/HI.',
        '- Video froze, MSE limited to speech and reported mood.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nPatient: "The medicine helps some but I forget the night one when I pass out early."',
      objectiveData: [
        'Provider Add-On:',
        '- Do not say adherence is good.',
        '- Do not list normal vitals.',
        '- Mention telehealth/video limitation if MSE is included.',
      ].join('\n'),
    },
    required: [
      { label: 'telehealth or video limitation visible', pattern: /telehealth|video.*(?:froze|limited|freezing)|camera/i },
      { label: 'missed nighttime doses visible', pattern: /miss(?:ed|ing).*night.*dose.*(?:3|three)|miss(?:ed|ing).*dose.*(?:3|three)|forgets?.*night|fell asleep/i },
      { label: 'partial benefit visible', pattern: /helps? some|better some|partial/i },
      { label: 'SI/HI denial visible', pattern: SI_HI_DENIAL_PATTERN },
    ],
    forbidden: [
      { label: 'adherence overstated', pattern: /adherence is good|good adherence|taking as prescribed|fully adherent/i },
      { label: 'normal vitals invented', pattern: /vitals (?:stable|normal)|BP .*normal|heart rate .*normal/i },
      { label: 'full normal MSE invented', pattern: /thought process (?:is )?(?:linear|logical)|insight and judgment (?:are )?(?:good|intact)|alert and oriented x ?[34]/i },
    ],
  },
  {
    id: 'adolescent-initial-eval-parent-school-conflict',
    title: 'Adolescent intake keeps teen denial, parent collateral, and school report separated',
    specialty: 'Psychiatry',
    ehr: 'Valant',
    noteType: 'Inpatient Psych Initial Adolescent Evaluation',
    customInstructions: 'Use adolescent intake structure. Keep parent and school collateral attributed and avoid definitive conduct or bipolar diagnosis.',
    sourceSections: {
      intakeCollateral: [
        'Referral packet:',
        '- School suspension for fight; teacher reported irritability and leaving class.',
        '- Mother reports 3 nights barely sleeping and posting threatening comments.',
        '- Pediatrician note lists ADHD history.',
      ].join('\n'),
      clinicianNotes: [
        'Live intake:',
        '- Teen says fight was self-defense.',
        '- Denies SI/HI.',
        '- Denies decreased need for sleep but says stayed up gaming.',
        '- Affect irritable, cooperative with short answers.',
      ].join('\n'),
      patientTranscript: [
        'Ambient transcript:',
        'Teen: "My mom is making it sound worse."',
        'Mother: "He has not been sleeping and I am scared he will hurt someone."',
      ].join('\n'),
      objectiveData: [
        'Provider Add-On:',
        '- Separate teen report, parent collateral, and school report.',
        '- Do not diagnose conduct disorder or bipolar disorder from this packet.',
      ].join('\n'),
    },
    required: [
      { label: 'school fight/suspension remains visible', pattern: /school|suspension|fight|teacher/i },
      { label: 'parent collateral remains visible', pattern: /mother|parent|collateral|scared/i },
      { label: 'teen denial/explanation remains visible', pattern: /self-defense|making it sound worse|teen says|denies/i },
      { label: 'sleep conflict remains visible', pattern: /3 nights|barely sleeping|stayed up gaming|sleep/i },
    ],
    forbidden: [
      { label: 'conduct disorder diagnosis invented', pattern: /diagnosed with conduct disorder|meets criteria for conduct disorder|conduct disorder is diagnosed/i },
      { label: 'bipolar disorder diagnosis invented', pattern: /diagnosed with bipolar|meets criteria for bipolar|bipolar disorder is diagnosed/i },
      { label: 'parent collateral treated as sole fact', pattern: /patient has not been sleeping and will hurt someone/i },
    ],
  },
  {
    id: 'psych-admission-medical-hp-pending-a1c-rash',
    title: 'Psych medical H&P preserves medical comorbidity, pending lab, and rash uncertainty without clearance overclaim',
    specialty: 'Hospital Medicine',
    role: 'Medical physician',
    ehr: 'Generic',
    noteType: 'Psych Admission Medical H&P',
    customInstructions: 'Use medical H&P structure for psych admission. Do not state medically cleared or stable unless supported.',
    sourceSections: {
      intakeCollateral: [
        'Nursing intake / chart:',
        '- DM2 on metformin per med list.',
        '- BP 162/96 at arrival.',
        '- A1c ordered, pending.',
        '- Rash on forearms noted by RN; onset unclear.',
      ].join('\n'),
      clinicianNotes: [
        'Medical H&P note:',
        '- Pt denies chest pain, SOB, fever.',
        '- Says rash started "maybe last week."',
        '- No glucose log available.',
        '- Exam: excoriations bilateral forearms, no drainage seen.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nPatient: "I scratch when I get nervous. I do not know when it started."',
      objectiveData: [
        'Provider Add-On:',
        '- Do not say medically cleared.',
        '- Preserve pending A1c and high BP.',
        '- Do not diagnose cellulitis.',
      ].join('\n'),
    },
    required: [
      { label: 'diabetes/metformin visible', pattern: /DM2|diabetes|metformin/i },
      { label: 'arrival BP visible', pattern: /162\/96|BP/i },
      { label: 'pending A1c visible', pattern: /A1c.*pending|pending A1c/i },
      { label: 'rash/excoriation uncertainty visible', pattern: /rash|excoriations|onset unclear|maybe last week/i },
    ],
    forbidden: [
      { label: 'medical clearance overclaim', pattern: /medically cleared|cleared for psych|medically stable/i },
      { label: 'cellulitis diagnosis invented', pattern: /diagnosed with cellulitis|cellulitis (?:diagnosed|confirmed|present|noted as diagnosis)|consistent with cellulitis|skin infection diagnosed/i },
      { label: 'normal glucose data invented', pattern: /glucose (?:normal|controlled|stable)|A1c (?:normal|controlled|at goal)/i },
    ],
  },
  {
    id: 'medical-consult-constipation-kub-pending',
    title: 'Medical consult preserves constipation timeline and pending KUB without inventing obstruction or resolution',
    specialty: 'Internal Medicine',
    role: 'Medical physician',
    ehr: 'Generic',
    noteType: 'Medical Consultation Note',
    customInstructions: 'Use focused inpatient medical consult format. Do not invent imaging result, diagnosis, or resolved symptoms.',
    sourceSections: {
      intakeCollateral: [
        'Consult request:',
        '- Psych unit asks medical consult for abd pain and constipation.',
        '- Last BM 4 days ago per nursing.',
        '- KUB ordered but not resulted.',
      ].join('\n'),
      clinicianNotes: [
        'Consult note:',
        '- Abdomen soft, mild diffuse tenderness.',
        '- No vomiting reported.',
        '- Eating some breakfast.',
        '- Current meds include olanzapine and benztropine.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nPatient: "My stomach hurts because I have not gone in days."',
      objectiveData: [
        'Provider Add-On:',
        '- Mention olanzapine/benztropine as possible constipation contributors only as considerations.',
        '- Do not say obstruction ruled out.',
        '- Do not state KUB normal.',
      ].join('\n'),
    },
    required: [
      { label: 'constipation duration visible', pattern: /4 days|last BM|not gone in days|constipation/i },
      { label: 'KUB pending visible', pattern: /KUB.*(?:ordered|pending|not resulted)|imaging.*pending/i },
      { label: 'abdominal exam visible', pattern: /soft|mild diffuse tenderness|abdomen/i },
      { label: 'medication contributors framed as possible', pattern: /olanzapine|benztropine|constipation contributors?|consider/i },
    ],
    forbidden: [
      { label: 'obstruction ruled out invented', pattern: /obstruction (?:ruled out|excluded)|no obstruction/i },
      { label: 'KUB result invented', pattern: /KUB (?:normal|negative|without obstruction)/i },
      { label: 'symptoms resolved invented', pattern: /pain resolved|constipation resolved|normal bowel movement/i },
    ],
  },
  {
    id: 'social-work-discharge-planning-housing-barrier',
    title: 'Social work discharge planning keeps housing and pickup barriers without inventing safe placement',
    specialty: 'Social Work',
    role: 'Social Worker',
    ehr: 'WellSky',
    noteType: 'Discharge Planning Note',
    customInstructions: 'Use social work discharge planning format. Keep barriers and unconfirmed resources explicit.',
    sourceSections: {
      intakeCollateral: [
        'Chart / collateral:',
        '- Shelter bed waitlist started yesterday.',
        '- Mother says patient cannot return home this week.',
        '- Medicaid transport not yet scheduled.',
      ].join('\n'),
      clinicianNotes: [
        'SW note:',
        '- Patient wants to leave today.',
        '- Completed ROI for shelter contact.',
        '- Denies having another place to stay.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nPatient: "I can maybe call a friend but I do not know if they will answer."',
      objectiveData: [
        'Provider Add-On:',
        '- Do not say safe discharge plan exists.',
        '- Preserve waitlist and transport not scheduled.',
      ].join('\n'),
    },
    required: [
      { label: 'shelter waitlist visible', pattern: /shelter.*waitlist|waitlist/i },
      { label: 'mother housing barrier visible', pattern: /mother.*cannot return|cannot return home/i },
      { label: 'transport not scheduled visible', pattern: /transport.*not.*scheduled|not yet scheduled/i },
      { label: 'patient preference visible', pattern: /wants to leave|leave today|friend/i },
    ],
    forbidden: [
      { label: 'safe placement invented', pattern: /(?:^|[.!?]\s+)(?:a |the )?safe discharge plan (?:exists|is in place|confirmed|has been established)|(?:^|[.!?]\s+)(?:a |the )?safe placement (?:exists|is in place|confirmed|has been established)|\bhousing secured\b|\bshelter bed confirmed\b|\bhas (?:a |the )?safe placement (?:confirmed|secured)\b/i },
      { label: 'transport completion invented', pattern: /transport scheduled|Medicaid transport arranged/i },
      { label: 'mother home acceptance invented', pattern: /return home with mother|mother agreed/i },
    ],
  },
  {
    id: 'mat-followup-fentanyl-denial-naloxone-no-dose-change',
    title: 'MAT follow-up keeps UDS/patient denial conflict and naloxone discussion without inventing dose change',
    specialty: 'Addiction Medicine',
    role: 'Medical physician',
    ehr: 'Tebra/Kareo',
    noteType: 'Medication Assisted Treatment Follow-Up',
    customInstructions: 'Use MAT follow-up format. Keep UDS conflict source-attributed and do not invent buprenorphine dose changes.',
    sourceSections: {
      intakeCollateral: [
        'Pre-visit data:',
        '- UDS point-of-care positive fentanyl, buprenorphine present.',
        '- Confirmatory test pending.',
        '- Last visit dose listed buprenorphine/naloxone 8/2 mg BID.',
      ].join('\n'),
      clinicianNotes: [
        'Live notes:',
        '- Patient denies fentanyl use and says "maybe it was contaminated weed."',
        '- Reports cravings 6/10.',
        '- Denies overdose since last visit.',
        '- Naloxone kit discussed; patient says old kit expired.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nPatient: "I did not use fentanyl. I need a new Narcan though because mine is old."',
      objectiveData: [
        'Provider Add-On:',
        '- Do not change buprenorphine dose unless documented.',
        '- Preserve confirmatory test pending.',
        '- Avoid labeling patient as lying.',
      ].join('\n'),
    },
    required: [
      { label: 'UDS fentanyl and buprenorphine visible', pattern: /UDS|fentanyl|buprenorphine/i },
      { label: 'patient denial remains visible', pattern: /denies? fentanyl|did not use fentanyl|contaminated weed/i },
      { label: 'confirmatory pending visible', pattern: /confirmatory.*pending|pending confirm/i },
      { label: 'naloxone/Narcan need visible', pattern: /naloxone|Narcan|old kit|expired/i },
    ],
    forbidden: [
      { label: 'dose change invented', pattern: /\b(?:increase|decrease|adjust|change)\s+(?:the\s+)?buprenorphine(?:\/naloxone)?\b|\bbuprenorphine(?:\/naloxone)?[^.\n]{0,80}\bdose\b[^.\n]{0,60}\b(?:increased|decreased|adjusted|changed)\b|\bcontinue current buprenorphine\b|\bcontinue buprenorphine\/naloxone\b/i },
      { label: 'confirmed fentanyl relapse overclaim', pattern: /confirmed fentanyl relapse|patient relapsed on fentanyl/i },
      { label: 'stigmatizing dishonesty language', pattern: /lying|dishonest|drug-seeking/i },
    ],
  },
  {
    id: 'icanotes-inpatient-initial-violent-thoughts-denies-intent',
    title: 'ICANotes inpatient evaluation preserves violent-thought nuance without converting it into active threat',
    specialty: 'Psychiatry',
    role: 'Psychiatric NP',
    ehr: 'ICANotes',
    noteType: 'Inpatient Psych Initial Adult Evaluation',
    customInstructions: 'Use ICANotes-ready sections. Preserve violent thoughts versus denial of intent/plan and do not flatten into no-risk wording.',
    sourceSections: {
      intakeCollateral: [
        'ER referral:',
        '- Brought by police after argument with roommate.',
        '- Roommate reported patient yelled "I could hurt you."',
        '- No weapon found by police.',
        '- BAL negative; UDS pending.',
      ].join('\n'),
      clinicianNotes: [
        'Provider typed:',
        '- Pt angry and embarrassed.',
        '- Says he had intrusive thoughts of punching roommate but denies intent, plan, or weapon access.',
        '- Denies SI.',
        '- Slept poorly after fight.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nPatient: "I was mad and said stupid stuff. I did not plan to hurt him."',
      objectiveData: [
        'Provider Add-On:',
        '- Keep collateral statement, patient explanation, denial of intent/plan, and no weapon access separate.',
        '- Do not say low risk or cleared.',
      ].join('\n'),
    },
    required: [
      { label: 'collateral threat statement visible', pattern: /roommate|could hurt you|yelled/i },
      { label: 'intrusive thought nuance visible', pattern: /intrusive thoughts?|punching roommate|angry/i },
      { label: 'denial of intent or plan visible', pattern: /denies?.{0,60}(?:intent|plan)|did not plan to hurt/i },
      { label: 'weapon access detail visible', pattern: /no weapon|weapon access/i },
    ],
    forbidden: [
      { label: 'active threat invented', pattern: /active homicidal intent|active threat|planned to hurt|intent to harm/i },
      { label: 'unsupported low-risk conclusion', pattern: /\blow[-\s]?risk\b|\brisk is low\b/i },
      { label: 'clearance invented', pattern: /cleared|safe for discharge|stable for discharge/i },
    ],
  },
  {
    id: 'therapynotes-outpatient-intake-trauma-alcohol-diagnostic-uncertainty',
    title: 'TherapyNotes outpatient intake keeps trauma, alcohol, and diagnostic uncertainty source-close',
    specialty: 'Psychiatry',
    role: 'Psychiatric NP',
    ehr: 'TherapyNotes',
    noteType: 'Outpatient Psychiatric Evaluation',
    customInstructions: 'Use TherapyNotes intake-friendly sections. Do not diagnose PTSD or AUD from this limited packet.',
    sourceSections: {
      intakeCollateral: [
        'Referral:',
        '- Referred for anxiety and nightmares.',
        '- Prior therapist note mentions trauma history but no formal diagnostic assessment included.',
        '- AUDIT-C score copied as 5; details not included.',
      ].join('\n'),
      clinicianNotes: [
        'Live intake:',
        '- Pt reports nightmares 2x/week and avoidance of driving near accident site.',
        '- Drinks wine most nights, says "usually two glasses."',
        '- Denies blackouts, withdrawal sx, or current SI/HI.',
        '- Concentration poor at work.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nPatient: "I do not want the PTSD label unless we are sure."',
      objectiveData: [
        'Provider Add-On:',
        '- Keep PTSD and alcohol diagnosis uncertain.',
        '- Do not turn AUDIT-C into alcohol use disorder diagnosis.',
      ].join('\n'),
    },
    required: [
      { label: 'nightmares or avoidance visible', pattern: /nightmares|avoidance|accident site/i },
      { label: 'alcohol pattern visible', pattern: /wine|two glasses|AUDIT-C|most nights/i },
      { label: 'diagnostic uncertainty visible', pattern: /PTSD.*(?:uncertain|not confirmed|not established|needs)|diagnostic uncertainty|not enough|no formal diagnostic assessment|diagnos(?:is|tic).*not.*(?:confirmed|established)/i },
      { label: 'SI/HI denial visible', pattern: SI_HI_DENIAL_PATTERN },
    ],
    forbidden: [
      { label: 'PTSD diagnosis invented', pattern: /diagnosed with PTSD|meets criteria for PTSD|PTSD is diagnosed/i },
      { label: 'AUD diagnosis invented', pattern: /alcohol use disorder is diagnosed|meets criteria for alcohol use disorder|diagnosed with AUD/i },
      { label: 'withdrawal symptoms invented', pattern: /withdrawal symptoms present|alcohol withdrawal/i },
    ],
  },
  {
    id: 'simplepractice-therapy-progress-dap-misspellings-response-limited',
    title: 'SimplePractice therapy progress note handles misspellings and limited response without medication language',
    specialty: 'Therapy',
    role: 'Therapist',
    ehr: 'SimplePractice',
    noteType: 'Therapy Progress Note',
    customInstructions: 'Use DAP-friendly therapy progress wording for SimplePractice. Keep client response limited and do not add medication management.',
    sourceSections: {
      intakeCollateral: [
        'Pre-session:',
        '- Client sent portal msg: "still avoiding phone calls."',
        '- Homework was 2 brief exposure practices.',
      ].join('\n'),
      clinicianNotes: [
        'Therapist typed qick:',
        '- Did ACT values excercise.',
        '- Client tried one exposre not two.',
        '- Says it was "awkward but not terrible."',
        '- denys si hi.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nClient: "I only did one call. I got through it but I hated it."',
      objectiveData: [
        'Provider Add-On:',
        '- Normalize obvious misspellings only.',
        '- Include data, assessment, plan if useful.',
        '- Do not say exposure was successful or medication plan.',
      ].join('\n'),
    },
    required: [
      { label: 'ACT intervention normalized despite misspelling', pattern: /ACT|values exercise|values/i },
      { label: 'partial homework completion visible', pattern: /one (?:exposure|call)|not two|only did one/i },
      { label: 'qualified response visible', pattern: /awkward but not terrible|got through it|hated it|limited/i },
      { label: 'SI/HI denial visible despite misspelling', pattern: SI_HI_DENIAL_PATTERN },
    ],
    forbidden: [
      { label: 'therapy response overstated', pattern: /successful exposure|significant progress|resolved avoidance/i },
      { label: 'medication language invented', pattern: /medication management|continue medications|psychotropic|medication plan/i },
      { label: 'provider instructions leaked', pattern: /Normalize obvious misspellings|DAP-friendly|Provider Add-On/i },
    ],
  },
  {
    id: 'sessions-health-outpatient-adhd-bipolar-referral-switch-focus',
    title: 'Sessions Health outpatient follow-up keeps ADHD request separate from bipolar history and current symptoms',
    specialty: 'Psychiatry',
    role: 'Psychiatric NP',
    ehr: 'Sessions Health',
    noteType: 'Outpatient Psych Follow-Up',
    customInstructions: 'Use Sessions Health-ready sections. Keep request for ADHD medication separate from historical bipolar label and do not prescribe or confirm diagnosis.',
    sourceSections: {
      intakeCollateral: [
        'Chart review:',
        '- Old problem list includes bipolar disorder unspecified.',
        '- Last two visits documented anxiety and sleep disruption.',
        '- No recent ADHD rating scale in chart.',
      ].join('\n'),
      clinicianNotes: [
        'Live notes:',
        '- Pt asks for ADHD med because focus is poor.',
        '- Sleep 4-5 hrs due to work schedule.',
        '- Denies euphoria, grandiosity, risky spending.',
        '- Anxiety still high.',
        '- Denies SI/HI.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nPatient: "I know they put bipolar in there before, but I mostly cannot focus."',
      objectiveData: [
        'Provider Add-On:',
        '- Do not confirm bipolar or ADHD from this source.',
        '- Do not state stimulant started.',
      ].join('\n'),
    },
    required: [
      { label: 'ADHD medication request visible', pattern: /ADHD|focus|asks for.*med|cannot focus/i },
      { label: 'historical bipolar label remains historical', pattern: /old problem list|historical|previous|bipolar.*(?:unspecified|history|not confirmed)/i },
      { label: 'sleep and anxiety remain visible', pattern: /4-5 hrs|work schedule|anxiety/i },
      { label: 'manic symptom denials visible', pattern: /denies?.{0,80}(?:euphoria|grandiosity|risky spending)|grandiosity|risky spending/i },
    ],
    forbidden: [
      { label: 'ADHD diagnosis confirmed', pattern: /diagnosed with ADHD|meets criteria for ADHD|ADHD is confirmed/i },
      { label: 'bipolar diagnosis confirmed', pattern: /confirmed bipolar|meets criteria for bipolar|bipolar disorder is diagnosed/i },
      { label: 'stimulant action invented', pattern: /stimulant (?:started|prescribed)|(?:start|started|prescribe|prescribed) (?:Adderall|methylphenidate|stimulant)/i },
    ],
  },
  {
    id: 'theranest-birp-therapy-collateral-risk-check',
    title: 'TheraNest BIRP-style therapy note preserves collateral risk concern without false reassurance',
    specialty: 'Therapy',
    role: 'Therapist',
    ehr: 'TheraNest',
    noteType: 'Therapy Progress Note',
    customInstructions: 'Use BIRP-friendly therapy wording. Keep collateral risk concern and client denial together without saying no risk.',
    sourceSections: {
      intakeCollateral: [
        'Collateral before session:',
        '- Partner called front desk worried client posted "I am done with everything."',
        '- Partner not on ROI; message documented as received but not discussed with partner.',
      ].join('\n'),
      clinicianNotes: [
        'Session notes:',
        '- Client denies SI, plan, or intent.',
        '- Says post meant wanting to quit job, not life.',
        '- Practiced grounding and crisis-card review.',
        '- Affect tearful but engaged.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nClient: "I should not have posted that. I was talking about work."',
      objectiveData: [
        'Provider Add-On:',
        '- Do not write no safety concerns.',
        '- Preserve collateral concern, denial, and client explanation.',
      ].join('\n'),
    },
    required: [
      { label: 'collateral social media concern visible', pattern: /partner|collateral|posted|done with everything/i },
      { label: 'client denial of SI plan intent visible', pattern: /denies?.{0,80}(?:SI|suicidal|plan|intent)/i },
      { label: 'client explanation visible', pattern: /quit job|talking about work|meant work/i },
      { label: 'grounding or crisis card visible', pattern: /grounding|crisis-card|crisis card/i },
    ],
    forbidden: [
      { label: 'false reassurance', pattern: /no safety concerns|no risk|low[-\s]?risk|risk resolved/i },
      { label: 'partner discussion invented', pattern: /discussed with partner|partner confirmed|ROI completed/i },
      { label: 'provider instruction leaked', pattern: /Do not write no safety concerns|Provider Add-On/i },
    ],
  },
  {
    id: 'epic-outpatient-med-allergy-reconciliation-conflict',
    title: 'Epic outpatient evaluation preserves allergy, prior medication, and patient restart request without inventing a medication action',
    specialty: 'Psychiatry',
    role: 'Psychiatric NP',
    ehr: 'Epic',
    noteType: 'Outpatient Psychiatric Evaluation',
    customInstructions: 'Use Epic-friendly section headings for copy/paste. Keep medication reconciliation and allergy conflict explicit without making a treatment decision.',
    sourceSections: {
      intakeCollateral: [
        'Outside referral / chart import:',
        '- Allergy list says lamotrigine - rash, severity unknown.',
        '- Prior med history lists Lamictal 100 mg from old psychiatry note.',
        '- PCP note says patient requested mood stabilizer restart.',
        '- No current pharmacy reconciliation included.',
      ].join('\n'),
      clinicianNotes: [
        'Live intake notes:',
        '- Pt asks if she can restart "Lamictle" because it helped before.',
        '- Says rash was years ago but cannot remember details.',
        '- Mood variable; no current SI/HI.',
        '- Denies decreased need for sleep, grandiosity, or risky spending today.',
      ].join('\n'),
      patientTranscript: [
        'Ambient transcript:',
        'Patient: "Lamictal helped me, but I did get some kind of rash. I do not remember if they said it was serious."',
      ].join('\n'),
      objectiveData: [
        'Provider Add-On:',
        '- Correct Lamictle to lamotrigine/Lamictal if referenced.',
        '- Do not state medication was restarted, continued, or prescribed.',
        '- Preserve allergy uncertainty for medication reconciliation.',
      ].join('\n'),
    },
    required: [
      { label: 'lamotrigine or Lamictal normalized despite misspelling', pattern: /lamotrigine|Lamictal/i },
      { label: 'rash/allergy conflict visible', pattern: /rash|allerg/i },
      { label: 'restart request stays a request', pattern: /requests?.{0,80}(?:restart|mood stabilizer)|asked?.{0,80}restart|can restart/i },
      { label: 'reconciliation uncertainty visible', pattern: /reconciliation|uncertain|severity unknown|cannot remember|not included/i },
      { label: 'SI/HI denial visible', pattern: SI_HI_DENIAL_PATTERN },
    ],
    forbidden: [
      { label: 'medication action invented', pattern: /\b(?:started|restarted|continued|prescribed)\s+(?:lamotrigine|Lamictal)\b|\b(?:lamotrigine|Lamictal)[^.\n]{0,80}\b(?:was|is|has been)\s+(?:started|restarted|continued|prescribed)\b|\b(?:plan|recommendation)\s+(?:is|was|:)?\s*(?:to\s+)?(?:start|restart|continue|prescribe)\s+(?:lamotrigine|Lamictal)\b/i },
      { label: 'allergy risk erased', pattern: /no known allergies|rash ruled out|allergy resolved|safe to restart/i },
      { label: 'bipolar diagnosis invented', pattern: /diagnosed with bipolar|meets criteria for bipolar|bipolar disorder is diagnosed/i },
      { label: 'provider instruction leaked', pattern: /Correct Lamictle|Do not state medication was restarted|Provider Add-On/i },
    ],
  },
  {
    id: 'cerner-inpatient-delirium-medical-confounder-packet',
    title: 'Cerner inpatient psych evaluation preserves medical confounders and pending workup instead of diagnosing mania',
    specialty: 'Psychiatry',
    role: 'Psychiatrist',
    ehr: 'Oracle Health/Cerner',
    noteType: 'Inpatient Psych Initial Adult Evaluation',
    customInstructions: 'Use Oracle Health/Cerner-friendly clinical sections. Keep medical confounders and pending workup visible.',
    sourceSections: {
      intakeCollateral: [
        'ED to psych transfer packet:',
        '- Na 128 on CMP; repeat ordered.',
        '- UA leukocyte esterase positive, culture pending.',
        '- Family reports new confusion and no sleep for 2 nights.',
        '- Transfer summary uses phrase "mania vs delirium?"',
      ].join('\n'),
      clinicianNotes: [
        'Provider interview:',
        '- Patient tangential and distractible.',
        '- Oriented to person and place, unsure date.',
        '- Denies SI/HI.',
        '- Speech mildly pressured but fluctuates during interview.',
      ].join('\n'),
      patientTranscript: [
        'Ambient transcript:',
        'Patient: "I am fine. I just got mixed up because nobody lets me sleep here."',
        'Daughter by phone: "This is not like her. She was confused yesterday too."',
      ].join('\n'),
      objectiveData: [
        'Provider Add-On:',
        '- Do not diagnose bipolar mania from this packet.',
        '- Preserve delirium/medical confounder concern.',
        '- Do not say medically cleared while repeat sodium and culture are pending.',
      ].join('\n'),
    },
    required: [
      { label: 'hyponatremia/repeat sodium visible', pattern: /Na 128|sodium|repeat/i },
      { label: 'UA/culture pending visible', pattern: /UA|leukocyte|culture.*pending|pending culture/i },
      { label: 'delirium or medical confounder concern visible', pattern: /delirium|medical confound|confusion|confused|not like her/i },
      { label: 'orientation limitation visible', pattern: /unsure date|oriented to person and place|orientation/i },
      { label: 'SI/HI denial visible', pattern: SI_HI_DENIAL_PATTERN },
    ],
    forbidden: [
      { label: 'mania diagnosis invented', pattern: /(?:diagnosed with|meets criteria for|confirmed|established)\s+(?:bipolar\s+)?mania|(?:bipolar mania|manic episode)\s+(?:is|was)\s+(?:diagnosed|confirmed|established)(?!\s+not)/i },
      { label: 'medical clearance invented', pattern: /medically cleared|cleared for psych|medically stable/i },
      { label: 'pending workup erased', pattern: /sodium normalized|culture negative|UTI ruled out/i },
      { label: 'provider instruction leaked', pattern: /Do not diagnose bipolar mania|Preserve delirium|Provider Add-On/i },
    ],
  },
  {
    id: 'athenaone-outpatient-followup-pcp-ssri-side-effect-referral',
    title: 'athenaOne outpatient follow-up keeps PCP-started SSRI, side-effect nuance, and referral goals without inventing plan changes',
    specialty: 'Psychiatry',
    role: 'Physician Assistant',
    ehr: 'athenaOne',
    noteType: 'Outpatient Psych Follow-Up',
    customInstructions: 'Use athenaOne-friendly SOAP sections. Keep medication origin, side effects, and follow-up goals source-close.',
    sourceSections: {
      intakeCollateral: [
        'PCP referral copied from EHR:',
        '- PCP started escitalopram 10 mg 6 weeks ago for anxiety.',
        '- Referral asks psychiatry to evaluate ongoing anxiety and medication tolerability.',
        '- No psychiatry medication changes documented before today.',
      ].join('\n'),
      clinicianNotes: [
        'Live visit notes:',
        '- Pt says anxiety is 30 percent better but still avoids grocery store alone.',
        '- Reports sexual side effect and mild nausea, nausea improving.',
        '- No panic attacks in last 2 weeks.',
        '- Denies SI/HI.',
      ].join('\n'),
      patientTranscript: [
        'Ambient transcript:',
        'Patient: "Lexapro helped but the sexual side effect is frustrating. The nausea is mostly better."',
      ].join('\n'),
      objectiveData: [
        'Provider Add-On:',
        '- Do not state escitalopram was changed, increased, stopped, or refilled.',
        '- Mention PCP-started medication as history/source context.',
        '- Keep grocery-store avoidance as functional impairment.',
      ].join('\n'),
    },
    required: [
      { label: 'PCP-started escitalopram visible', pattern: /PCP|escitalopram|Lexapro/i },
      { label: 'partial anxiety improvement visible', pattern: /30 percent|30%|partially improved|better/i },
      { label: 'functional avoidance visible', pattern: /grocery store|avoid/i },
      { label: 'side effect nuance visible', pattern: /sexual side effect|nausea.*(?:improving|mostly better)|mild nausea/i },
      { label: 'SI/HI denial visible', pattern: SI_HI_DENIAL_PATTERN },
    ],
    forbidden: [
      { label: 'SSRI plan change invented', pattern: /(?:increase|decrease|stop|stopped|change|changed|refill|refilled|continue)\s+(?:escitalopram|Lexapro)|(?:escitalopram|Lexapro)[^.\n]{0,100}\b(?:increased|decreased|stopped|changed|refilled|continued)\b/i },
      { label: 'side effects erased', pattern: /no side effects|denies side effects|tolerating without side effects/i },
      { label: 'avoidance erased', pattern: /functioning normally|no functional impairment|avoidance resolved/i },
      { label: 'provider instruction leaked', pattern: /Do not state escitalopram|Provider Add-On|Keep grocery-store avoidance/i },
    ],
  },
  {
    id: 'myavatar-inpatient-restraint-prn-timeline-conflict',
    title: 'Netsmart myAvatar inpatient note preserves restraint/PRN timeline conflict without smoothing risk',
    specialty: 'Psychiatry',
    role: 'Psychiatric NP',
    ehr: 'Netsmart myAvatar',
    noteType: 'Inpatient Psych Progress Note',
    customInstructions: 'Use myAvatar-friendly progress note sections. Keep behavioral timeline, restraint event, PRN response, and patient explanation separated.',
    sourceSections: {
      intakeCollateral: [
        'Unit timeline:',
        '- 0130: yelling in hallway after phone call.',
        '- 0145: threatened to throw chair per staff note.',
        '- 0155: brief physical hold documented; restraint flowsheet not finalized.',
        '- 0205: haloperidol/lorazepam PRN given per MAR.',
        '- 0500: sleeping; no injury documented.',
      ].join('\n'),
      clinicianNotes: [
        'Provider typed quick:',
        '- Pt says staff overreacted and he was scared after call with sister.',
        '- Denies current HI/SI this morning.',
        '- Irritable but calmer now.',
        '- Wants d/c.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nPatient: "I yelled but I was not trying to hurt anyone. I just wanted them away from me."',
      objectiveData: [
        'Provider Add-On:',
        '- Do not say behavior resolved or low risk.',
        '- Do not state restraint documentation complete.',
        '- Preserve PRN response and pending flowsheet.',
      ].join('\n'),
    },
    required: [
      { label: 'restraint/hold event visible', pattern: /physical hold|restraint|flowsheet/i },
      { label: 'PRN medication event visible', pattern: /haloperidol|lorazepam|PRN|MAR/i },
      { label: 'patient explanation visible', pattern: /overreacted|scared|not trying to hurt|wanted them away/i },
      { label: 'current denial visible without flattening', pattern: /denies?.{0,80}(?:HI|homicidal|SI|suicidal)|denies current/i },
      { label: 'documentation incompleteness visible', pattern: /flowsheet.*(?:not finalized|pending|incomplete)|not finalized/i },
    ],
    forbidden: [
      { label: 'risk falsely resolved', pattern: /low[-\s]?risk|risk resolved|behavior resolved/i },
      { label: 'restraint documentation completion invented', pattern: /restraint documentation (?:completed|finalized)|flowsheet finalized/i },
      { label: 'discharge readiness invented', pattern: /safe for discharge|stable for discharge|ready for discharge/i },
      { label: 'patient explanation treated as sole fact', pattern: /staff overreacted and patient posed no risk/i },
    ],
  },
  {
    id: 'advancedmd-outpatient-eval-pregnancy-valproate-uncertainty',
    title: 'AdvancedMD outpatient evaluation preserves pregnancy uncertainty and valproate history without medication action',
    specialty: 'Psychiatry',
    role: 'Physician Assistant',
    ehr: 'AdvancedMD',
    noteType: 'Outpatient Psychiatric Evaluation',
    customInstructions: 'Use AdvancedMD-ready section headings. Keep pregnancy status, valproate history, and diagnostic uncertainty source-close.',
    sourceSections: {
      intakeCollateral: [
        'Outside records:',
        '- Prior diagnosis listed as bipolar disorder unspecified.',
        '- Old medication list includes divalproex 500 mg qhs from 2024.',
        '- PCP note says patient is trying to become pregnant.',
        '- No current pregnancy test in referral packet.',
      ].join('\n'),
      clinicianNotes: [
        'Live intake:',
        '- Patient says Depakote helped years ago but she stopped it.',
        '- Reports mood swings and irritability.',
        '- Denies decreased need for sleep, grandiosity, or risky spending in past month.',
        '- Denies SI/HI.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nPatient: "I might want to get pregnant soon, so I do not want anything risky."',
      objectiveData: [
        'Provider Add-On:',
        '- Do not restart Depakote or make a medication plan.',
        '- Preserve pregnancy-status uncertainty and prior medication history.',
        '- Do not confirm bipolar disorder from this limited source.',
      ].join('\n'),
    },
    required: [
      { label: 'divalproex/Depakote history visible', pattern: /divalproex|Depakote|valproate/i },
      { label: 'pregnancy goal or uncertainty visible', pattern: /pregnan|trying to become pregnant|might want to get pregnant/i },
      { label: 'prior diagnosis remains historical', pattern: /prior diagnosis|old medication list|history|listed|unspecified/i },
      { label: 'manic symptom denials visible', pattern: /denies?.{0,80}(?:decreased need|grandiosity|risky spending)|grandiosity|risky spending/i },
      { label: 'SI/HI denial visible', pattern: SI_HI_DENIAL_PATTERN },
    ],
    forbidden: [
      { label: 'valproate medication action invented', pattern: /(?:^|[.\n]\s*)(?:start|restart|continue|prescribe|resume)\s+(?:Depakote|divalproex|valproate)\b|(?:Depakote|divalproex|valproate)[^.\n]{0,80}\b(?:was|is|will be|has been)\s+(?:started|restarted|continued|prescribed|resumed)\b/i },
      { label: 'pregnancy status invented', pattern: /pregnancy test negative|not pregnant|pregnancy ruled out/i },
      { label: 'bipolar diagnosis confirmed', pattern: /confirmed bipolar|meets criteria for bipolar|bipolar disorder is diagnosed/i },
      { label: 'provider instruction leaked', pattern: /Do not restart Depakote|Provider Add-On/i },
    ],
  },
  {
    id: 'credible-mobile-crisis-collateral-source-conflict',
    title: 'Credible crisis note keeps mobile-crisis collateral conflict and safety-plan limits visible',
    specialty: 'Social Work',
    role: 'Social Worker',
    ehr: 'Credible',
    noteType: 'Psychiatric Crisis Note',
    customInstructions: 'Use Credible crisis-note sections. Separate client denial, roommate collateral, and mobile-crisis observation.',
    sourceSections: {
      intakeCollateral: [
        'Mobile crisis handoff:',
        '- Roommate called crisis line after client texted "I cannot do this anymore."',
        '- Mobile team found client crying on porch; no weapon seen.',
        '- Safety plan from last month is on file, but client could not name coping steps today.',
      ].join('\n'),
      clinicianNotes: [
        'Crisis clinician note:',
        '- Client denies current intent or plan.',
        '- Says text was about losing job.',
        '- Tearful, slowed speech, poor eye contact.',
        '- Agreed to call sister during visit; sister did not answer.',
      ].join('\n'),
      patientTranscript: [
        'Ambient transcript:',
        'Client: "I am not saying I want to die. I just do not know what to do."',
        'Clinician attempted sister call; no answer.',
      ].join('\n'),
      objectiveData: [
        'Provider Add-On:',
        '- Do not say safety plan completed.',
        '- Do not say no suicide risk.',
        '- Preserve inability to name coping steps and sister not reached.',
      ].join('\n'),
    },
    required: [
      { label: 'suicidal-text collateral remains visible', pattern: /cannot do this anymore|roommate|crisis line|texted/i },
      { label: 'client denial/explanation visible', pattern: /denies?.{0,80}(?:intent|plan)|losing job|not saying.*die/i },
      { label: 'safety-plan limitation visible', pattern: /could not name coping|safety plan.*(?:on file|not completed|limited)|coping steps/i },
      { label: 'sister not reached visible', pattern: /sister.*(?:did not answer|not reached|no answer)|call sister/i },
    ],
    forbidden: [
      { label: 'false reassurance', pattern: /no suicide risk|no safety concerns|low[-\s]?risk|risk resolved/i },
      { label: 'safety plan completion invented', pattern: /safety plan completed|safety plan reviewed and completed|sister confirmed/i },
      { label: 'weapon finding invented', pattern: /weapon removed|means secured|weapons secured/i },
      { label: 'provider instruction leaked', pattern: /Do not say safety plan completed|Provider Add-On/i },
    ],
  },
  {
    id: 'drchrono-telepsych-dictation-ambient-box-routing',
    title: 'DrChrono telepsych follow-up uses dictated and ambient source boxes without treating dictation target guidance as clinical fact',
    specialty: 'Psychiatry',
    role: 'Psychiatric NP',
    ehr: 'DrChrono',
    noteType: 'Outpatient Psych Telehealth Follow-Up',
    customInstructions: 'Use DrChrono-friendly SOAP sections. Treat Provider Add-On as formatting/instruction only. Explicitly include the BP-log limitation as objective-data limitation wording without inventing BP values.',
    sourceSections: {
      intakeCollateral: [
        'Pre-visit data:',
        '- Portal GAD-7 17 today, previously 19.',
        '- Patient uploaded BP log but image is blurry; no clear values extracted.',
      ].join('\n'),
      clinicianNotes: [
        'Dictated into Live Visit Notes:',
        '- Pt says anxity maybe a little better but still avoiding drivng.',
        '- Reports propranolol helped situational tremor.',
        '- Missed morning dose twice because rushed.',
        '- Denies SI/HI.',
      ].join('\n'),
      patientTranscript: [
        'Committed Ambient Transcript:',
        'Patient: "Driving still scares me. The shaking is better when I remember the medicine."',
        'Provider: reviewed that ambient transcript must be reviewed before note use.',
      ].join('\n'),
      objectiveData: [
        'Provider Add-On:',
        '- Source boxes used: pre-visit, dictation, ambient, add-on.',
        '- Do not quote the source-box workflow in the final clinical note.',
        '- Explicitly mention the BP log image was blurry and no clear BP values were extracted.',
        '- Do not invent BP values from blurry image.',
        '- Do not say adherence is perfect.',
      ].join('\n'),
    },
    required: [
      { label: 'anxiety/GAD-7 partial change visible', pattern: /GAD-?7|17|19|anxiety/i },
      { label: 'driving avoidance visible despite misspelling', pattern: /driving|avoid/i },
      { label: 'propranolol/tremor benefit visible', pattern: /propranolol|tremor|shaking/i },
      { label: 'missed morning doses visible', pattern: /missed?.{0,60}(?:morning|dose).{0,60}(?:twice|2)|rushed/i },
      { label: 'blurry BP limitation visible', pattern: /BP|blood pressure|blurry|not clear|no clear values/i },
    ],
    forbidden: [
      { label: 'source-box workflow leaked', pattern: /Source boxes used|pre-visit, dictation, ambient, add-on|ambient transcript must be reviewed before note use/i },
      { label: 'BP values invented', pattern: /BP\s+\d{2,3}\/\d{2,3}|blood pressure (?:normal|stable|within normal)/i },
      { label: 'adherence overstated', pattern: /taking as prescribed|perfect adherence|fully adherent|adherence is good/i },
      { label: 'provider instruction leaked', pattern: /Do not quote the source-box workflow|Provider Add-On/i },
    ],
  },
  {
    id: 'epic-er-referral-scanned-ocr-risk-lab-conflict',
    title: 'Epic ER referral packet preserves scanned/OCR limits, risk conflict, and pending lab uncertainty',
    specialty: 'Psychiatry',
    role: 'Psychiatric NP',
    ehr: 'Epic',
    noteType: 'Inpatient Psych Initial Adult Evaluation',
    customInstructions: 'Use Epic-ready psychiatric evaluation sections. Treat scanned/OCR text as source-limited and do not convert pending or blurry items into completed findings.',
    sourceSections: {
      intakeCollateral: [
        'ER referral packet copied from scanned PDF/OCR:',
        '- Triage note: brought by sister after text "I cannot keep doing this."',
        '- Patient later denied current SI and said text was about eviction.',
        '- Sister reports patient gave away two personal items yesterday.',
        '- Lab page OCR partially cut off: potassium appears "3.?"; UDS marked pending; pregnancy test line not visible.',
        '- ER note says "med clear?" with question mark, no final clearance statement.',
      ].join('\n'),
      clinicianNotes: [
        'Admission interview:',
        '- Patient tearful, guarded, says sister is exaggerating.',
        '- Denies current plan or intent.',
        '- Reports poor sleep x 3 nights and not eating much.',
        '- Wants to leave after talking with social worker.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nPatient: "I texted that because I might lose my apartment, not because I had a plan." Sister not present for interview.',
      objectiveData: [
        'Provider Add-On:',
        '- Do not say labs normal or medically cleared.',
        '- Preserve scanned/OCR limitation and pending UDS.',
        '- Keep sister collateral and patient denial side by side.',
      ].join('\n'),
    },
    required: [
      { label: 'scanned/OCR limitation visible', pattern: /scanned|OCR|partially cut off|not visible|source-limited/i },
      { label: 'pending/unclear labs visible', pattern: /UDS.*pending|pending.*UDS|potassium.*(?:unclear|appears|3\.|cut off)|pregnancy.*not visible/i },
      { label: 'patient denial/explanation visible', pattern: /denies?.{0,80}(?:SI|suicidal|plan|intent)|eviction|apartment/i },
      { label: 'sister collateral visible', pattern: /sister|gave away.*personal items|collateral/i },
      { label: 'medical clearance uncertainty visible', pattern: /med clear|medical clearance|clearance.*(?:unclear|not final|question|pending)/i },
    ],
    forbidden: [
      { label: 'labs normalized', pattern: /labs (?:normal|within normal limits|WNL)|potassium normal|UDS negative|pregnancy test negative/i },
      { label: 'medical clearance invented', pattern: /medically cleared|medical clearance completed|cleared by ER/i },
      { label: 'risk falsely minimized', pattern: /low[-\s]?risk|no suicide risk|safe for discharge/i },
      { label: 'provider instruction leaked', pattern: /Do not say labs normal|Provider Add-On/i },
    ],
  },
  {
    id: 'therapynotes-referral-old-diagnosis-disputed-by-patient',
    title: 'TherapyNotes referral intake keeps old diagnoses historical and disputed instead of confirming them',
    specialty: 'Therapy',
    role: 'Therapist',
    ehr: 'TherapyNotes',
    noteType: 'Outpatient Therapy Intake',
    customInstructions: 'Use TherapyNotes-friendly intake sections. Keep previous-provider diagnoses as historical/referral data unless current source supports confirmation.',
    sourceSections: {
      intakeCollateral: [
        'Referral from previous provider:',
        '- Diagnoses listed in 2023: PTSD, bipolar disorder unspecified, alcohol use disorder in remission.',
        '- Previous note copied forward several times; unclear what was actively assessed in last visit.',
        '- Referral reason: client requested therapy after workplace conflict.',
      ].join('\n'),
      clinicianNotes: [
        'Intake typed during session:',
        '- Client says "I do not think bipolar ever fit me."',
        '- Reports trauma history but does not want details in first session.',
        '- Reports 14 months sober by self-report.',
        '- Denies SI/HI.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nClient: "I want help with anger at work. I am not ready to talk about the trauma details today."',
      objectiveData: [
        'Provider Add-On:',
        '- Do not confirm PTSD, bipolar disorder, or AUD remission from referral alone.',
        '- Preserve client disagreement with bipolar label.',
        '- Keep trauma details limited because client declined details today.',
      ].join('\n'),
    },
    required: [
      { label: 'prior diagnoses historical/referral-based', pattern: /prior|previous|historical|referral|listed/i },
      { label: 'bipolar label disputed', pattern: /does not think bipolar|bipolar.*(?:disput|fit|disagree)|disagrees?.*bipolar/i },
      { label: 'trauma details limited', pattern: /trauma.*(?:details|history).*(?:limited|declined|not ready)|(?:declined|not ready).{0,80}(?:discuss|talk).{0,80}trauma|not ready to (?:talk|discuss).*trauma/i },
      { label: 'sobriety self-report preserved', pattern: /14 months sober|self[-\s]?report/i },
      { label: 'SI/HI denial visible', pattern: SI_HI_DENIAL_PATTERN },
    ],
    forbidden: [
      { label: 'PTSD diagnosis confirmed', pattern: /diagnosed with PTSD|PTSD is confirmed|meets criteria for PTSD/i },
      { label: 'bipolar diagnosis confirmed', pattern: /diagnosed with bipolar|bipolar disorder is confirmed|meets criteria for bipolar/i },
      { label: 'AUD remission confirmed beyond source', pattern: /AUD remission confirmed|alcohol use disorder in sustained remission is confirmed/i },
      { label: 'trauma details invented', pattern: /sexual assault|combat trauma|childhood abuse|domestic violence/i },
      { label: 'provider instruction leaked', pattern: /Do not confirm PTSD|Provider Add-On/i },
    ],
  },
  {
    id: 'athenaone-copy-forward-med-list-reconciliation-conflict',
    title: 'athenaOne follow-up does not copy forward old medication list when current source conflicts',
    specialty: 'Psychiatry',
    role: 'Psychiatric NP',
    ehr: 'athenaOne',
    noteType: 'Outpatient Psych Follow-Up',
    customInstructions: 'Use athenaOne copy/paste sections. Preserve medication reconciliation conflicts and do not continue old medications from copied-forward text.',
    sourceSections: {
      intakeCollateral: [
        'Copied-forward prior note block:',
        '- Medication list from last year: sertraline 100 mg daily, trazodone 50 mg qhs.',
        '- Old plan says continue sertraline and trazodone.',
        '- Current chart medication reconciliation tab says sertraline discontinued by PCP 2 months ago.',
      ].join('\n'),
      clinicianNotes: [
        'Visit note typed today:',
        '- Patient says she has not taken sertraline for weeks and never picked up trazodone.',
        '- Reports sleep still poor and anxiety about work.',
        '- Denies SI/HI.',
        '- Wants medication discussion but no final medication decision documented in source.',
      ].join('\n'),
      patientTranscript: 'Ambient transcript:\nPatient: "I am not taking the Zoloft anymore. I was waiting to talk to you first."',
      objectiveData: [
        'Provider Add-On:',
        '- Do not carry forward old continue-sertraline/trazodone plan.',
        '- Flag medication reconciliation conflict.',
        '- Do not invent a new medication plan.',
      ].join('\n'),
    },
    required: [
      { label: 'copied-forward old med list visible as historical', pattern: /copied[-\s]?forward|prior (?:note|chart)|last year|old plan|historical|prior chart medication reconciliation/i },
      { label: 'sertraline discontinuation/current nonuse visible', pattern: /sertraline.*(?:discontinued|not taken|not taking)|Zoloft.*not taking/i },
      { label: 'trazodone not picked up visible', pattern: /(?:trazodone.{0,80}(?:never picked up|never picking up|not picked up|not taking))|(?:(?:never picked up|never picking up|not picked up|not taking).{0,80}trazodone)/i },
      { label: 'med reconciliation conflict visible', pattern: /medication reconciliation|reconciliation conflict|med list conflict|conflict/i },
      { label: 'no final med decision visible', pattern: /no final medication decision|medication discussion|decision.*not documented|no medication decision was documented/i },
    ],
    forbidden: [
      { label: 'old medication continuation invented', pattern: /continue sertraline|continue trazodone|sertraline 100 mg daily continued|trazodone 50 mg qhs continued/i },
      { label: 'new medication plan invented', pattern: /start\s+\w+|increase\s+\w+|restart sertraline|restart trazodone/i },
      { label: 'adherence overstated', pattern: /taking medications as prescribed|adherent with sertraline|adherent with trazodone/i },
      { label: 'provider instruction leaked', pattern: /Do not carry forward|Provider Add-On/i },
    ],
  },
  {
    id: 'valant-therapy-progress-cbt-homework-risk-limits',
    title: 'Valant therapy progress note preserves CBT intervention, homework, and limited risk data without adding med plan',
    specialty: 'Therapy',
    role: 'Therapist',
    ehr: 'Valant',
    noteType: 'Therapy Progress Note',
    customInstructions: 'Use concise Valant-friendly therapy progress sections. Keep therapy intervention and response separate from medication planning.',
    sourceSections: {
      intakeCollateral: [
        'Pre-session data:',
        '- Client completed PHQ screen; item 9 marked "several days" last week.',
        '- No medication information provided in therapy chart.',
      ].join('\n'),
      clinicianNotes: [
        'Therapist note:',
        '- Session focused on CBT thought record for workplace panic triggers.',
        '- Client identified all-or-nothing thought and practiced grounding.',
        '- Homework: complete one thought record before next session.',
        '- Client denied current SI/HI in session.',
      ].join('\n'),
      patientTranscript: 'Client stated: "I had that thought last week but today I do not want to hurt myself."',
      objectiveData: [
        'Provider Add-On:',
        '- Do not add medication plan.',
        '- Preserve PHQ item history separately from current denial.',
        '- Keep response to intervention brief.',
      ].join('\n'),
    },
    required: [
      { label: 'CBT intervention remains visible', pattern: /CBT|thought record|all-or-nothing|grounding/i },
      { label: 'homework remains visible', pattern: /homework|thought record before next session/i },
      { label: 'PHQ item history remains separate', pattern: /PHQ|item 9|last week/i },
      { label: 'current SI HI denial remains visible', pattern: SI_HI_DENIAL_PATTERN },
    ],
    forbidden: [
      { label: 'medication plan invented for therapy note', pattern: /\b(start|continue|increase|decrease|refill)\b.{0,60}\b(medication|SSRI|sertraline|fluoxetine|meds)\b/i },
      { label: 'unsupported no-risk wording', pattern: /\bno risk\b|\blow[-\s]?risk\b/i },
      { label: 'provider instruction leaked', pattern: /Do not add medication|Provider Add-On/i },
    ],
  },
  {
    id: 'wellsky-discharge-summary-followup-housing-unclear',
    title: 'WellSky discharge summary keeps follow-up, housing, ride, and symptom uncertainty visible',
    specialty: 'Psychiatry',
    role: 'Psychiatric NP',
    ehr: 'WellSky',
    noteType: 'Inpatient Psych Discharge Summary',
    customInstructions: 'Use WellSky discharge-summary sections. Do not overstate discharge stability, housing, follow-up, or transport certainty.',
    sourceSections: {
      intakeCollateral: [
        'Hospital course notes:',
        '- Admitted for paranoia, insomnia, and disorganized behavior.',
        '- AH improved but still intermittently reported yesterday.',
        '- Medication refusal early in stay; partial acceptance over last 48 hours.',
      ].join('\n'),
      clinicianNotes: [
        'Discharge draft data:',
        '- Patient requests discharge today.',
        '- Denies SI/HI today.',
        '- Follow-up appointment not confirmed at time of note.',
        '- Shelter bed is possible but not confirmed.',
        '- Ride is unclear.',
      ].join('\n'),
      patientTranscript: 'Patient: "I feel better but I still get scared at night sometimes."',
      objectiveData: [
        'Provider Add-On:',
        '- Do not say stable for discharge.',
        '- Preserve follow-up not confirmed, shelter possible/not confirmed, ride unclear.',
        '- Do not state symptoms resolved.',
      ].join('\n'),
    },
    required: [
      { label: 'follow-up not confirmed remains visible', pattern: /follow[-\s]?up.*(?:not confirmed|pending|not yet confirmed)|appointment.*not confirmed/i },
      { label: 'housing/shelter uncertainty remains visible', pattern: /shelter|housing/i },
      { label: 'transport uncertainty remains visible', pattern: /ride.*unclear|transport.*unclear|transportation.*unclear/i },
      { label: 'intermittent AH or residual fear remains visible', pattern: /AH|auditory hallucinations|scared at night|intermittently/i },
      { label: 'current SI HI denial remains visible', pattern: SI_HI_DENIAL_PATTERN },
    ],
    forbidden: [
      { label: 'discharge stability overstated', pattern: /stable for discharge|safe for discharge|discharge ready|symptoms resolved/i },
      { label: 'follow-up invented', pattern: /follow[-\s]?up (?:scheduled|confirmed)|appointment (?:scheduled|confirmed)/i },
      { label: 'provider instruction leaked', pattern: /Do not say stable|Provider Add-On/i },
    ],
  },
  {
    id: 'tebra-initial-eval-adhd-bipolar-substance-differential',
    title: 'Tebra outpatient evaluation keeps ADHD request, bipolar concern, and substance/medical confounders unresolved',
    specialty: 'Psychiatry',
    role: 'Psychiatric NP',
    ehr: 'Tebra',
    noteType: 'Outpatient Psychiatric Evaluation',
    customInstructions: 'Use Tebra-friendly labeled sections. Keep diagnostic uncertainty explicit and avoid confirming ADHD or bipolar disorder from the referral alone.',
    sourceSections: {
      intakeCollateral: [
        'Referral:',
        '- PCP referred for ADHD evaluation and stimulant request.',
        '- Prior urgent care note mentions "possible bipolar" but no diagnostic workup attached.',
        '- TSH low last month; repeat lab pending.',
      ].join('\n'),
      clinicianNotes: [
        'Provider interview:',
        '- Patient reports distractibility since childhood but also recent decreased sleep and high energy.',
        '- Drinks 4 energy drinks daily.',
        '- Cannabis use on weekends.',
        '- Denies SI/HI.',
      ].join('\n'),
      patientTranscript: 'Patient: "I mostly want something to focus, but I have also been sleeping like three hours."',
      objectiveData: [
        'Provider Add-On:',
        '- Do not diagnose ADHD or bipolar disorder from this source.',
        '- Preserve stimulant request, low TSH pending repeat, cannabis/energy drink confounders.',
      ].join('\n'),
    },
    required: [
      { label: 'ADHD/stimulant request remains visible', pattern: /ADHD|stimulant|focus/i },
      { label: 'bipolar concern remains hedged', pattern: /possible bipolar|bipolar.*(?:possible|concern|differential|not confirmed)|diagnostic uncertainty/i },
      { label: 'low TSH/repeat pending remains visible', pattern: /TSH.*(?:low|pending|repeat)|repeat lab pending/i },
      { label: 'substance/caffeine confounders remain visible', pattern: /cannabis|energy drinks/i },
    ],
    forbidden: [
      { label: 'ADHD diagnosis invented', pattern: /diagnosed with ADHD|ADHD diagnosis is confirmed|meets criteria for ADHD/i },
      { label: 'bipolar diagnosis invented', pattern: /diagnosed with bipolar|bipolar disorder is confirmed|meets criteria for bipolar/i },
      { label: 'stimulant plan invented', pattern: /start(?:ed)?\s+\w*amphetamine|start(?:ed)?\s+methylphenidate|prescribe stimulant/i },
      { label: 'provider instruction leaked', pattern: /Do not diagnose ADHD|Provider Add-On/i },
    ],
  },
  {
    id: 'epic-inpatient-progress-dictation-ambient-prn-effect-unclear',
    title: 'Epic inpatient progress note keeps dictation and ambient data provenance around PRN effect and restraints',
    specialty: 'Psychiatry',
    role: 'Psychiatrist',
    ehr: 'Epic',
    noteType: 'Inpatient Psych Progress Note',
    customInstructions: 'Use Epic-friendly concise progress-note sections. Keep PRN effect and restraint status source-bound.',
    sourceSections: {
      intakeCollateral: [
        'Nursing overnight note:',
        '- Pacing at 0210, yelling intermittently.',
        '- PRN given at 0225, effect not clearly documented.',
        '- No restraint flowsheet found in chart review.',
      ].join('\n'),
      clinicianNotes: [
        'Provider typed note:',
        '- Patient calmer this morning but irritable when discussing discharge.',
        '- Denies SI/HI.',
        '- Reports "I was just anxious last night."',
      ].join('\n'),
      patientTranscript: [
        'Ambient transcript:',
        'Patient: "The shot made me sleepy but I do not know what they gave me."',
        'Provider: reviewed that exact medication/effect documentation was not visible in this source.',
      ].join('\n'),
      objectiveData: [
        'Dictated provider add-on:',
        '- Do not state PRN was effective unless effect documented.',
        '- Do not state restraints used.',
        '- Mention no restraint flowsheet found.',
      ].join('\n'),
    },
    required: [
      { label: 'PRN timing remains visible', pattern: /PRN.*0225|0225.*PRN/i },
      { label: 'PRN effect uncertainty remains visible', pattern: /effect.*(?:not clearly documented|unclear|not visible)|not clearly documented.*effect/i },
      { label: 'no restraint flowsheet remains visible', pattern: /no restraint flowsheet|restraint flowsheet.*(?:not found|not visible|absent)/i },
      { label: 'current SI HI denial remains visible', pattern: SI_HI_DENIAL_PATTERN },
    ],
    forbidden: [
      { label: 'PRN efficacy invented', pattern: /PRN was effective|good effect|effective PRN/i },
      { label: 'restraint use invented', pattern: /(?<!no )(?<!not )(?<!without )\brestraints? (?:were )?used\b|placed in restraints/i },
      { label: 'provider instruction leaked', pattern: /Do not state PRN|Dictated provider add-on|Provider Add-On/i },
    ],
  },
  {
    id: 'mat-followup-bridge-request-uds-pending-dose-not-decided',
    title: 'MAT follow-up preserves bridge request, pending UDS, missed doses, and no final dosing decision',
    specialty: 'Addiction Psychiatry',
    role: 'Psychiatric NP',
    ehr: 'SimplePractice',
    noteType: 'MAT Follow-Up',
    customInstructions: 'Use MAT follow-up sections. Do not convert a bridge request or prior dose into a completed prescribing decision.',
    sourceSections: {
      intakeCollateral: [
        'Pre-visit chart:',
        '- Prior buprenorphine/naloxone dose listed as 8 mg/2 mg BID.',
        '- Last visit UDS positive fentanyl; today UDS pending.',
        '- Naloxone kit expired per intake.',
      ].join('\n'),
      clinicianNotes: [
        'Visit note:',
        '- Patient reports missing three days of medication after transportation issue.',
        '- Requests bridge prescription.',
        '- Denies intentional fentanyl use since last visit.',
        '- Cravings increased this week.',
      ].join('\n'),
      patientTranscript: 'Patient: "I missed three days and I am worried about getting sick. I did not use fentanyl on purpose."',
      objectiveData: [
        'Provider Add-On:',
        '- Do not state bridge prescription sent.',
        '- Do not state dose unchanged.',
        '- Preserve UDS pending and naloxone replacement need/request only.',
      ].join('\n'),
    },
    required: [
      { label: 'prior buprenorphine dose remains source-listed', pattern: /8 ?mg\/2 ?mg.*BID|prior.*buprenorphine/i },
      { label: 'missed three days remains visible', pattern: /miss(?:ed|ing) three days|missed 3 days/i },
      { label: 'UDS pending remains visible', pattern: /UDS.*pending|pending.*UDS/i },
      { label: 'bridge request remains visible', pattern: /bridge (?:prescription|request)|requests? bridge/i },
      { label: 'no final dosing decision remains visible', pattern: /no (?:current |final )?(?:dosing|medication|prescribing) decision|not documented.*(?:dose|prescription|bridge)/i },
    ],
    forbidden: [
      { label: 'bridge prescription invented', pattern: /bridge prescription (?:sent|provided|issued)|sent bridge|prescribed bridge/i },
      { label: 'dose unchanged invented', pattern: /dose unchanged|continue current buprenorphine|no dose change/i },
      { label: 'naloxone provision invented', pattern: /naloxone (?:provided|dispensed|sent|prescribed)|Narcan (?:provided|dispensed|sent|prescribed)/i },
      { label: 'provider instruction leaked', pattern: /Do not state bridge|Provider Add-On/i },
    ],
  },
  {
    id: 'messy-out-of-order-followup-provider-story-prompt',
    title: 'Out-of-order pasted provider paragraph is reorganized into a professional follow-up without leaking named prompt',
    specialty: 'Psychiatry',
    role: 'Psychiatric NP',
    ehr: 'Tebra/Kareo',
    noteType: 'Outpatient Psych Follow-Up',
    customInstructions: 'Named prompt: Story Follow-Up. Put interval/HPI first, then MSE and safety, then assessment/plan. Correct obvious misspellings. Do not quote the prompt name or provider instructions.',
    sourceSections: {
      intakeCollateral: [
        'Chart review pasted first even though it belongs later:',
        '- Last visit: escitalopram 10 mg daily listed.',
        '- Prior plan says consider therapy referral if anxity remains high.',
        '- PHQ-9 today 12, GAD-7 today 16.',
      ].join('\n'),
      clinicianNotes: [
        'Provider paragraph pasted out of order:',
        'Plan maybe therapy referral and keep meds same for now but no med change finalized in source. MSE at end: casual dress, cooperative, speech normal rate, mood "stressed", affect anxious, thought process goal directed, no psychosis observed. HPI should really be first: pt says panic is less intense but still avoids grocery store, slep about 5 hrs, appetite ok, forgot escitalopram twice this week, denies SI/HI. Side efects: mild nausea first week now better.',
      ].join('\n'),
      patientTranscript: [
        'Ambient transcript:',
        'Patient: "The panic is not as bad, but I still leave the store when it gets crowded."',
        'Patient: "I forgot the Lexapro two times this week."',
      ].join('\n'),
      objectiveData: [
        'Provider Add-On:',
        '- Preferred prompt name: Story Follow-Up.',
        '- Make the finished note professional and organized even though my paragraph was pasted in the wrong order.',
        '- Do not say medication adherence is good.',
        '- Do not state medication unchanged as a completed order if not finalized.',
      ].join('\n'),
    },
    required: [
      { label: 'panic/grocery avoidance preserved despite scrambled paragraph', pattern: /panic|grocery|crowded|store/i },
      { label: 'sleep misspelling normalized or preserved', pattern: /sleep|slept|5 (?:hrs|hours)/i },
      { label: 'missed escitalopram doses preserved', pattern: /escitalopram|Lexapro/i },
      { label: 'two missed doses visible', pattern: /forgot.{0,80}(?:two|2)|(?:two|2).{0,80}(?:missed|forgot)|forgot.{0,80}escitalopram.{0,80}twice|twice.{0,80}(?:this week|escitalopram|Lexapro)/i },
      { label: 'MSE details placed as clinical content', pattern: /casual|cooperative|speech normal|goal[-\s]?directed|anxious affect|affect anxious/i },
      { label: 'side effect nuance preserved', pattern: /nausea.*(?:better|improved)|side effect/i },
    ],
    forbidden: [
      { label: 'named prompt leaked', pattern: /Story Follow-Up|Preferred prompt name|Named prompt/i },
      { label: 'adherence overstated', pattern: /taking as prescribed|good adherence|fully adherent|adherent with escitalopram/i },
      { label: 'medication continuation/order invented', pattern: /continue escitalopram|medication unchanged|keep meds same|no medication changes made/i },
      { label: 'provider instruction leaked', pattern: /Make the finished note professional|Provider Add-On/i },
    ],
  },
  {
    id: 'wellsky-inpatient-followup-scrambled-risk-mse-plan',
    title: 'Scrambled inpatient follow-up source keeps risk, MSE, PRN, and plan limits in the right clinical buckets',
    specialty: 'Psychiatry',
    role: 'Psychiatrist',
    ehr: 'WellSky',
    noteType: 'Inpatient Psych Progress Note',
    customInstructions: 'Use WellSky-friendly inpatient progress sections. Reorder scrambled source into interval, nursing/collateral, MSE, safety, assessment, and plan without inventing missing facts.',
    sourceSections: {
      intakeCollateral: [
        'Nursing and collateral mixed together:',
        '- Mother called unit saying pt sounded "better but still paranoid" last night.',
        '- Nursing: slept 3.5 hrs, refused group, ate 40% breakfast.',
        '- PRN hydroxyzine offered, accepted at 2300; effect not charted.',
      ].join('\n'),
      clinicianNotes: [
        'Provider typed in chaotic order:',
        'Plan: continue observation level already ordered, but no new orders in this source. Safety: denies SI/HI today but says people on unit are "talking about me." MSE before HPI by mistake: disheveled, guarded, speech low volume, mood "irratated", affect constricted, TP circumstantial, TC paranoid ideation, no clear AH/VH endorsed. HPI: says slept bad, wants dc soon, thinks meds maybe helping "a little".',
      ].join('\n'),
      patientTranscript: [
        'Ambient transcript:',
        'Patient: "I am not trying to hurt myself. I just want out of here because they keep talking about me."',
        'Patient: "The med is maybe helping a little but I still do not trust people."',
      ].join('\n'),
      objectiveData: [
        'Provider Add-On:',
        '- Do not say PRN effective.',
        '- Do not say safe for discharge or discharge ready.',
        '- Correct irratated to irritated if used.',
        '- Keep denial of SI/HI paired with ongoing paranoia.',
      ].join('\n'),
    },
    required: [
      { label: 'sleep and intake data preserved', pattern: /3\.5 (?:hrs|hours)|slept 3\.5|ate 40%|40% breakfast/i },
      { label: 'PRN uncertainty preserved', pattern: /hydroxyzine|PRN/i },
      { label: 'PRN effect uncertainty visible', pattern: /effect.*(?:not charted|not documented|unclear)|not charted.*effect/i },
      { label: 'SI HI denial paired with paranoia', pattern: /denies? (?:SI\/HI|suicidal|homicidal)[\s\S]{0,320}(paranoid|talking about me|do not trust)|paranoid[\s\S]{0,320}denies? (?:SI\/HI|suicidal|homicidal)/i },
      { label: 'MSE source details visible', pattern: /disheveled|guarded|constricted|circumstantial|paranoid ideation/i },
    ],
    forbidden: [
      { label: 'PRN effect invented', pattern: /hydroxyzine (?:was )?effective|PRN was effective|good effect/i },
      { label: 'discharge readiness invented', pattern: /safe for discharge|discharge ready|stable for discharge/i },
      { label: 'new order invented', pattern: /(?:placed|entered|added)\s+new (?:medication|hydroxyzine|observation) order|ordered hydroxyzine|increase observation|decrease observation/i },
      { label: 'provider instruction leaked', pattern: /Correct irratated|Provider Add-On/i },
    ],
  },
  {
    id: 'generic-previous-provider-referral-ocr-disputed-medical-psych-history',
    title: 'Previous-provider referral and OCR packet are synthesized without confirming old diagnoses or fuzzy scanned facts',
    specialty: 'Psychiatry',
    role: 'Psychiatric NP',
    ehr: 'Generic',
    noteType: 'Outpatient Psychiatric Evaluation',
    customInstructions: 'Use a clean psychiatric evaluation structure. Treat previous-provider and OCR material as source-limited. Keep current patient report separate from historical referral diagnoses.',
    sourceSections: {
      intakeCollateral: [
        'Previous provider note + referral packet, pasted out of order:',
        '- Dx list from old note: MDD, PTSD, ADHD, "r/o bipolar".',
        '- Old note may be copied forward; active assessment date unclear.',
        '- Scanned ER visit from 2024: panic attack; EKG "sinus tachy?" OCR question mark; troponin line not visible.',
        '- Med history: fluoxetine 20 mg in 2023; stopped due to sexual side effects per old note.',
      ].join('\n'),
      clinicianNotes: [
        'Current visit typed notes:',
        '- Patient says main issue now is poor concetration and "my thoughts race at night."',
        '- Denies decreased need for sleep; says tired after 4-5 hrs.',
        '- Denies SI/HI.',
        '- Reports trauma hx but declines details today.',
        '- Wants ADHD medication, but also reports palpitations with energy drinks.',
      ].join('\n'),
      patientTranscript: [
        'Ambient transcript:',
        'Patient: "I was told maybe bipolar once, but nobody explained why."',
        'Patient: "I drink three energy drinks when I cannot focus."',
      ].join('\n'),
      objectiveData: [
        'Provider Add-On:',
        '- Do not confirm ADHD, PTSD, MDD, or bipolar disorder from old referral labels alone.',
        '- Do not state EKG/troponin normal because OCR is unclear.',
        '- Keep stimulant request, energy drink/palpitations, and sleep timeline explicit.',
      ].join('\n'),
    },
    required: [
      { label: 'old diagnoses remain historical/referral-based', pattern: /old note|previous provider|referral|historical|prior/i },
      { label: 'bipolar uncertainty remains visible', pattern: /r\/o bipolar|rule[-\s]?out bipolar|maybe bipolar|might have bipolar|told.*bipolar|bipolar.*(?:unclear|not confirmed|uncertain|differential|past)/i },
      { label: 'concentration misspelling normalized or preserved', pattern: /concentration|concetration|focus/i },
      { label: 'sleep timeline contradicts decreased need for sleep', pattern: /denies?.{0,120}decreased need for sleep|tired after 4(?:-| to )5|4(?:-| to )5 (?:hrs|hours)/i },
      { label: 'OCR cardiac uncertainty visible', pattern: /EKG|sinus tachy|troponin|OCR|not visible|unclear/i },
      { label: 'energy drink/palpitations visible', pattern: /energy drinks?|palpitations/i },
    ],
    forbidden: [
      { label: 'old diagnosis confirmed', pattern: /diagnosed with (?:ADHD|PTSD|MDD|bipolar)|(?:ADHD|PTSD|MDD|bipolar disorder) is confirmed|meets criteria for (?:ADHD|PTSD|MDD|bipolar)/i },
      { label: 'normal cardiac workup invented', pattern: /EKG normal|troponin normal|cardiac workup normal|medically cleared/i },
      { label: 'stimulant plan invented', pattern: /start(?:ed)?\s+\w*amphetamine|start(?:ed)?\s+methylphenidate|prescribe stimulant/i },
      { label: 'provider instruction leaked', pattern: /Do not confirm ADHD|Provider Add-On/i },
    ],
  },
  {
    id: 'paragraph-dump-followup-misspelled-two-paragraph-prompt',
    title: 'Misspelled paragraph dump follow-up is reordered into professional HPI, MSE, assessment, and plan flow',
    specialty: 'Psychiatry',
    role: 'Psychiatric NP',
    ehr: 'Tebra/Kareo',
    noteType: 'Outpatient Psych Follow-Up',
    customInstructions: 'Use the provider named prompt only as formatting guidance: HPI first, then MSE/assessment/plan. Do not quote the named prompt.',
    sourceSections: {
      intakeCollateral: [
        'Pre-visit data pasted from portal:',
        '- PHQ-9 17 last month, 12 today.',
        '- GAD-7 16 last month, 14 today.',
        '- Therapy appt missed because bus did not come.',
        '- Med list: bupropion XL 150 mg qAM; hydroxyzine PRN.',
      ].join('\n'),
      clinicianNotes: [
        'Provider paragraph dump, typed out of order with misspellings:',
        'plan maybe cont same meds but first needs refill check. pt says deprssion is "some better" but anxity still high, avoids grocery store, no panic attcks this week. slep from 4 hrs to 6 hrs. appetite ok. side efects: dry mouth from hydroxyzine and some jittery with wellbutrin first week now less. denies si hi. mse at end: casually dressed, cooperative, speech normal, mood anxious, affect constricted, thought process goal directed.',
      ].join('\n'),
      patientTranscript: [
        'Ambient transcript:',
        'Patient: "I am not thinking about killing myself. I am still scared to go in the store alone."',
        'Patient: "The Wellbutrin made me jittery at first but it calmed down."',
      ].join('\n'),
      objectiveData: [
        'Provider Add-On:',
        '- Named prompt: Hale two paragraph story follow-up.',
        '- Keep missed therapy transportation barrier.',
        '- CPT preference: maybe 99214 if supported, but do not include CPT in clinical note.',
        '- Do not say side effects denied.',
      ].join('\n'),
    },
    required: [
      { label: 'depression partial improvement visible despite misspelling', pattern: /depression|depressive|PHQ|some better|partial/i },
      { label: 'anxiety and avoidance remain visible', pattern: /anxiety|anxious|avoid(?:s|ance)|grocery store|store alone/i },
      { label: 'sleep improvement visible', pattern: /4 (?:hrs?|hours?) to 6 (?:hrs?|hours?)|sleep.*6/i },
      { label: 'side effect nuance preserved', pattern: /jittery|dry mouth|side effect|hydroxyzine|Wellbutrin|bupropion/i },
      { label: 'SI/HI denial remains visible', pattern: SI_HI_DENIAL_PATTERN },
    ],
    forbidden: [
      { label: 'named prompt leaked into clinical note', pattern: /Hale two paragraph story follow-up|Named prompt/i },
      { label: 'CPT preference leaked into clinical note', pattern: /99214|CPT preference|CPT/i },
      { label: 'side effects erased', pattern: /no side effects|denies side effects|tolerating without side effects/i },
      { label: 'transportation barrier erased by completed therapy wording', pattern: /attended therapy|therapy appointment completed/i },
    ],
  },
  {
    id: 'ocr-referral-med-list-lab-conflict-no-clearance',
    title: 'OCR referral with medication and lab conflict preserves uncertainty and avoids medical-clearance invention',
    specialty: 'Psychiatry',
    role: 'Psychiatric NP',
    ehr: 'WellSky',
    noteType: 'Inpatient Psych Initial Adult Evaluation',
    customInstructions: 'Use inpatient evaluation sections. Treat OCR as imperfect and keep medication/lab uncertainty explicit.',
    sourceSections: {
      intakeCollateral: [
        'Scanned referral OCR, mixed order:',
        '- Outside med list maybe says lithum 300 bid and depokte 500 qhs, but scan is blurry.',
        '- ER MAR shows lorazepam 1 mg once at 0210.',
        '- CMP: Cr 1.4, Na 132, K 4.1.',
        '- Lithium level line is cut off / not included.',
        '- Transfer note: "med clear?" handwritten with question mark.',
      ].join('\n'),
      clinicianNotes: [
        'Live intake notes:',
        '- Patient says he has not taken lithium "in months" and does not know why it is on the list.',
        '- Reports racing thoughts, poor sleep, and irritability.',
        '- Denies SI/HI.',
        '- Appears restless; speech pressured at times; thought process tangential but redirectable.',
      ].join('\n'),
      patientTranscript: [
        'Ambient transcript:',
        'Patient: "I have not taken lithium in months. They keep putting old stuff on my chart."',
        'Patient: "I slept maybe two hours."',
      ].join('\n'),
      objectiveData: [
        'Provider Add-On:',
        '- Do not list lithium as confirmed current medication.',
        '- Do not state lithium level normal or pending unless source supports it.',
        '- Do not state medically cleared.',
        '- Preserve OCR uncertainty and creatinine 1.4.',
      ].join('\n'),
    },
    required: [
      { label: 'lithium medication conflict remains visible', pattern: /lithium|lithum/i },
      { label: 'patient-reported not taking lithium remains visible', pattern: /not (?:taken|taking|having taken) lithium|has not taken lithium|in months|old stuff on.*chart/i },
      { label: 'creatinine 1.4 remains visible', pattern: /Cr 1\.4|creatinine(?: of)? 1\.4/i },
      { label: 'medical clearance uncertainty remains visible', pattern: /medical clearance|med clear|clearance.*(?:unclear|question|not documented)|question mark|not established/i },
      { label: 'sleep and pressured/tangential presentation remain visible', pattern: /two hours|2 hours|poor sleep|pressured|tangential|racing thoughts/i },
    ],
    forbidden: [
      { label: 'lithium treated as confirmed current medication', pattern: /currently taking lithium|continue lithium|lithium 300 ?(?:mg)? bid/i },
      { label: 'lithium level invented', pattern: /lithium (?:level )?(?:normal|therapeutic|within normal limits|pending)/i },
      { label: 'medical clearance invented', pattern: /medically cleared|cleared for psych|cleared for psychiatric/i },
      { label: 'OCR uncertainty erased', pattern: /medication list confirms lithium|confirmed current medications/i },
    ],
  },
  {
    id: 'run-on-ambient-inpatient-followup-risk-mse-gaps',
    title: 'Run-on ambient inpatient follow-up separates risk wording, observations, and limited MSE without false reassurance',
    specialty: 'Psychiatry',
    role: 'Psychiatric NP',
    ehr: 'WellSky',
    noteType: 'Inpatient Psych Progress Note',
    customInstructions: 'Use concise inpatient progress-note format. Preserve exact risk-relevant language and source attribution.',
    sourceSections: {
      intakeCollateral: [
        'Nursing / milieu note:',
        '- Paced hallway for 45 min after phone call.',
        '- Accepted scheduled evening medication.',
        '- Refused morning group.',
        '- No assaultive behavior documented.',
      ].join('\n'),
      clinicianNotes: [
        'Provider typed quick:',
        '- Wants discharge. Irritable but redirectable.',
        '- Says staff are against him.',
        '- Denies SI/HI when directly asked.',
        '- MSE not fully typed: speech loud, mood mad, affect irritable, thought process circumstantial.',
      ].join('\n'),
      patientTranscript: [
        'Ambient transcript, run-on:',
        'Patient: "I am not suicidal or homicidal I just want out if they keep messing with me I am going to snap but I am not saying I will hurt nobody I just need to leave."',
        'Provider redirected and reviewed unit safety expectations.',
      ].join('\n'),
      objectiveData: [
        'Provider Add-On:',
        '- Do not call risk low.',
        '- Do not erase "going to snap" statement.',
        '- Do not invent normal insight/judgment.',
        '- Keep group refusal and medication acceptance.',
      ].join('\n'),
    },
    required: [
      { label: 'direct SI/HI denial remains visible', pattern: SI_HI_DENIAL_PATTERN },
      { label: 'risk-relevant snap statement remains visible', pattern: /snap|messing with me|want out|need to leave/i },
      { label: 'pacing or phone call observation remains visible', pattern: /paced|45 min|phone call/i },
      { label: 'medication acceptance and group refusal remain visible', pattern: /accepted scheduled|evening medication|refused morning group|group refusal/i },
      { label: 'limited MSE elements remain visible', pattern: /speech loud|mood (?:mad|irritable)|affect irritable|circumstantial/i },
    ],
    forbidden: [
      { label: 'unsupported low-risk conclusion', pattern: /\blow[-\s]?risk\b|\brisk is low\b/i },
      { label: 'false reassurance from denial alone', pattern: /no safety concerns|no risk concerns|safe for discharge|stable for discharge/i },
      { label: 'invented normal MSE', pattern: /insight and judgment (?:are )?(?:good|intact)|thought process (?:is )?(?:linear|logical)|calm and cooperative/i },
      { label: 'group attendance invented', pattern: /attended group|participated in group/i },
    ],
  },
  {
    id: 'therapy-dictation-scattered-social-history-homework-risk',
    title: 'Scattered therapy dictation organizes intervention, response, homework, and safety without medication plan',
    specialty: 'Therapy',
    role: 'Therapist',
    ehr: 'SimplePractice',
    noteType: 'Therapy Progress Note',
    customInstructions: 'Use a therapy progress-note structure with intervention, client response, homework, and safety. Do not add medication management.',
    sourceSections: {
      intakeCollateral: [
        'Pre-session copied note:',
        '- Client changed jobs 3 weeks ago.',
        '- Last homework: thought record after conflict with partner.',
        '- Prior note mentioned childhood trauma themes but no details reviewed today.',
      ].join('\n'),
      clinicianNotes: [
        'Therapist live typing with typos and mixed order:',
        '- hw not done, client forgot and felt embrassed.',
        '- focused on CBT thought record and grounding 5-4-3-2-1.',
        '- response: said grounding was "a little helpful" but still tearful.',
        '- denies si hi self harm today.',
        '- plan homework: one thought record before next session.',
      ].join('\n'),
      patientTranscript: [
        'Ambient transcript:',
        'Client: "I shut down when my partner says I am too sensitive."',
        'Client: "I did not do the homework. I felt dumb writing it."',
      ].join('\n'),
      objectiveData: [
        'Provider Add-On:',
        '- Therapy note only.',
        '- Include intervention and response.',
        '- Do not add medication or diagnosis changes.',
      ].join('\n'),
    },
    required: [
      { label: 'CBT and grounding intervention visible', pattern: /CBT|thought record|grounding|5-4-3-2-1/i },
      { label: 'homework noncompletion visible despite typo', pattern: /homework.*(?:not done|not completed|forgot)|did not do the homework|thought record/i },
      { label: 'qualified response visible', pattern: /little helpful|still tearful|partial|somewhat helpful/i },
      { label: 'SI/HI/self-harm denial visible', pattern: /deni(?:es|ed) (?:SI\/HI|suicidal|homicidal|suicidal ideation|homicidal ideation|self[-\s]?harm)|no current suicidal or homicidal/i },
      { label: 'next homework visible', pattern: /one thought record|homework.*next session|before next session/i },
    ],
    forbidden: [
      { label: 'medication plan invented', pattern: /medication (?:plan|management|changes?)|continue current medication|psychotropic/i },
      { label: 'diagnosis change invented', pattern: /diagnosis (?:changed|updated)|new diagnosis/i },
      { label: 'therapy benefit overstated', pattern: /grounding was effective|symptoms resolved|significant improvement/i },
      { label: 'provider add-on echoed', pattern: /Therapy note only|Include intervention and response/i },
    ],
  },
  {
    id: 'provider-custom-prompt-chaotic-followup-no-prompt-leak',
    title: 'Provider custom prompt organizes a chaotic psych follow-up without leaking prompt language or billing hints',
    specialty: 'Psychiatry',
    role: 'Psychiatric NP',
    ehr: 'Tebra/Kareo',
    noteType: 'Outpatient Psych Follow-Up',
    customInstructions: 'Prompt name: Hale concise narrative. Preferred shape: paragraph one HPI/interval, paragraph two MSE/assessment/plan. Do not quote this prompt name.',
    sourceSections: {
      intakeCollateral: [
        'Pre-visit raw dump:',
        '- Last plan: venlafaxine XR 75 mg daily listed.',
        '- Portal message last week: "still anxious before work."',
        '- GAD-7 went from 18 to 13.',
        '- No labs included.',
      ].join('\n'),
      clinicianNotes: [
        'Provider typed during visit, mixed order:',
        'plan maybe same med for now but not final; MSE casual, coop, speech nl, mood "better but tense", affect anxious, TP linear. HPI actually: pt says mornings are rough, panic less frekquent, slept 6 hrs most nights, missed one dose venlafaxine when traveling, dry mouth but tolerable. denies si/hi. assessment: partial improvement but still work avoidance.',
      ].join('\n'),
      patientTranscript: [
        'Ambient/dictation transcript:',
        'Patient: "I only missed Effexor once when I went out of town."',
        'Patient: "The panic is less often, but work mornings still get me."',
      ].join('\n'),
      objectiveData: [
        'Provider Add-On:',
        '- Possible CPT 99214 if supported; do not include CPT in note.',
        '- Keep missed dose and dry mouth.',
        '- Do not state medication continued or changed unless finalized.',
        '- Prompt name should not appear in final note.',
      ].join('\n'),
    },
    required: [
      { label: 'panic/work-morning HPI preserved', pattern: /panic|work mornings?|mornings are rough|anxious before work/i },
      { label: 'partial improvement preserved', pattern: /partial|less frequent|less often|GAD-7.*13|18.*13|improvement/i },
      { label: 'missed venlafaxine/Effexor dose preserved', pattern: /missed (?:one|1) dose|venlafaxine|Effexor/i },
      { label: 'dry mouth preserved as tolerable', pattern: /dry mouth|tolerable/i },
      { label: 'SI/HI denial remains visible', pattern: SI_HI_DENIAL_PATTERN },
    ],
    forbidden: [
      { label: 'custom prompt name leaked', pattern: /Hale concise narrative|Prompt name|Preferred shape/i },
      { label: 'CPT hint leaked', pattern: /99214|CPT/i },
      { label: 'medication order invented', pattern: /continue venlafaxine|venlafaxine (?:continued|increased|changed)|increase venlafaxine|Effexor (?:continued|increased|changed)/i },
      { label: 'adherence overstated', pattern: /taking as prescribed|fully adherent|good adherence/i },
    ],
  },
  {
    id: 'four-box-ambient-dictation-med-risk-conflict-no-final-plan',
    title: 'Four-source-box packet keeps ambient, dictation, med reconciliation, and risk contradictions source-faithful',
    specialty: 'Psychiatry',
    role: 'Psychiatrist',
    ehr: 'WellSky',
    noteType: 'Inpatient Psych Progress Note',
    customInstructions: 'Use concise inpatient progress sections. Treat each source box as source material and preserve contradictions.',
    sourceSections: {
      intakeCollateral: [
        'Pre-visit chart/source packet:',
        '- MAR shows olanzapine refused last night.',
        '- Nursing: slept 2 hrs, pacing, no assaultive behavior.',
        '- Collateral from sister: patient texted "I am done" before admission.',
      ].join('\n'),
      clinicianNotes: [
        'Provider typing during encounter:',
        '- pt says he is fine and wants dc.',
        '- denies current si hi.',
        '- says refused med bc "too sedating"; no med decision made yet.',
        '- MSE: disheveled, guarded, speech low volume, mood irritable, affect constricted, TP circumstantial.',
      ].join('\n'),
      patientTranscript: [
        'Ambient transcript:',
        'Patient: "I am not going to hurt myself. I just said I was done because I was mad."',
        'Patient: "I did not take that pill because it knocks me out."',
      ].join('\n'),
      objectiveData: [
        'Provider Add-On / dictation:',
        '- Do not say low risk.',
        '- Do not say olanzapine discontinued or restarted.',
        '- Keep collateral text and current denial together.',
        '- Do not say discharge ready.',
      ].join('\n'),
    },
    required: [
      { label: 'olanzapine refusal and sedation concern preserved', pattern: /olanzapine|refus(?:ed|al)|sedating|knocks me out/i },
      { label: 'sleep and pacing preserved', pattern: /slept 2|2 (?:hrs?|hours?)|pacing/i },
      { label: 'collateral text preserved', pattern: /sister|collateral|I am done|texted/i },
      { label: 'current SI/HI denial preserved', pattern: SI_HI_DENIAL_PATTERN },
      { label: 'MSE details preserved', pattern: /disheveled|guarded|low volume|irritable|constricted|circumstantial/i },
    ],
    forbidden: [
      { label: 'low-risk conclusion invented', pattern: /\blow[-\s]?risk\b|\brisk is low\b/i },
      { label: 'discharge readiness invented', pattern: /safe for discharge|stable for discharge|discharge ready|ready for discharge/i },
      { label: 'medication action invented', pattern: /(?:discontinue|discontinued|restart|restarted|continue|continued) olanzapine|olanzapine (?:was )?(?:discontinued|restarted|continued)/i },
      { label: 'collateral erased by denial', pattern: /denies SI\/HI and no safety concerns|no safety concerns/i },
    ],
  },
  {
    id: 'patient-continuity-followup-prior-risk-medication-verify-today',
    title: 'Follow-up note uses prior Veranote continuity as context without copying it into today as confirmed fact',
    specialty: 'Psychiatry',
    ehr: 'Luminello',
    noteType: 'Outpatient Psych Follow-Up',
    customInstructions: 'Use prior continuity as recall context only. Separate previously documented items from today-confirmed details.',
    sourceSections: {
      intakeCollateral: [
        'Patient Continuity Context - Veranote recall layer',
        'Patient label: patient-0426',
        'Use this as prior context only. Verify today before documenting as current fact.',
        'Risk/Safety:',
        '- Passive death wish was previously documented after job loss (needs confirmation today).',
        'Medication:',
        '- Sertraline was previously documented as 50 mg daily with missed doses (needs confirmation today).',
        'Open loops:',
        '- Therapy referral barrier was previously documented (needs confirmation today).',
        'Continuity safety rule: do not silently copy prior note content into today. Mark previously documented, confirmed today, or conflicting with today source.',
      ].join('\n'),
      clinicianNotes: [
        'Today live visit notes:',
        '- Patient reports mood a little better today.',
        '- Denies active SI, plan, or intent today.',
        '- Reports taking sertraline most days but missed two doses this week.',
        '- Therapy referral still not scheduled due to transportation.',
        '- No side effects volunteered today.',
      ].join('\n'),
      patientTranscript: [
        'Ambient transcript:',
        'Patient: "I still forget the medicine sometimes, but I am trying."',
        'Patient: "I am not trying to kill myself. I just still feel stuck."',
      ].join('\n'),
      objectiveData: [
        'Provider Add-On:',
        '- Do not say prior passive SI resolved.',
        '- Do not say medication adherence is good.',
        '- Do not make the prior note sound like today unless confirmed in today source.',
      ].join('\n'),
    },
    required: [
      { label: 'prior continuity is identified as prior context', pattern: /previously documented|prior context|prior continuity|continuity/i },
      { label: 'today active SI denial remains visible', pattern: /denies? active .*?(?:plan|intent)|not trying to kill myself|denies? .*?(?:plan|intent).*?today/i },
      { label: 'today missed-dose detail remains visible', pattern: /missed (?:two|2) doses|forget.*medicine|missed.*this week/i },
      { label: 'therapy referral barrier remains visible', pattern: /therapy referral.*(?:not scheduled|transportation)|transportation/i },
    ],
    forbidden: [
      { label: 'prior passive SI treated as resolved', pattern: /passive (?:SI|suicidal ideation|death wish).{0,80}(?:resolved|no longer present|cleared)/i },
      { label: 'adherence overstated from continuity', pattern: /taking as prescribed|adherence is good|good adherence|fully adherent/i },
      { label: 'continuity instruction leaked', pattern: /Continuity safety rule|Patient Continuity Context|do not silently copy/i },
    ],
  },
];

function loadEvaluationEnv() {
  loadEnvConfig(runtimePath);

  const localEnvPath = `${runtimePath}/.env.local`;
  try {
    const localEnv = fs.readFileSync(localEnvPath, 'utf8');
    for (const key of ['OPENAI_API_KEY', 'OPENAI_MODEL', 'VERANOTE_ALLOW_OPENAI', 'VERANOTE_AI_PROVIDER']) {
      if (process.env[key]) continue;

      const match = localEnv.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm'));
      if (match?.[1]) {
        process.env[key] = match[1].trim().replace(/^['"]|['"]$/g, '');
      }
    }
  } catch {
    // The regression can still report fallback mode if local env is unavailable.
  }
}

export function evaluateSourcePacketRegressionCase(
  item: SourcePacketRegressionCase,
  note: string,
  mode: SourcePacketRegressionCaseResult['mode'],
  reason: string,
  flagCount: number,
): SourcePacketRegressionCaseResult {
  const missing = item.required
    .filter((requirement) => !requirement.pattern.test(note))
    .map((requirement) => requirement.label);
  const forbiddenHits = item.forbidden
    .filter((forbidden) => forbidden.pattern.test(note))
    .map((forbidden) => forbidden.label);

  if (/provider add-on|add-on instructs|\binstructs to preserve\b|provider instructions?\s+(?:specif(?:y|ies)|instructs|says|states|notes)|provider guidance\s+(?:instructs|says|states|notes)|per provider instruction|the provider requested|billing code|CPT preference|Named prompt|do not summarize as low risk|do not diagnose substance-induced psychosis|do not state confirmed hallucinations/i.test(note)) {
    forbiddenHits.push('provider add-on instruction echoed as clinical note content');
  }

  const qualityAudit = auditGeneratedNoteQuality({
    note,
    noteType: item.noteType,
    ehr: item.ehr,
    sourceSections: item.sourceSections,
  });
  const qualityFindings = qualityAudit.findings.map((finding) => (
    `${finding.severity}:${finding.category}:${finding.message}`
  ));
  const qualityBlockingFindings = qualityAudit.blockingFindings.map((finding) => (
    `${finding.category}:${finding.message}`
  ));

  const normalizedNote = note.replace(/\s+/g, ' ').trim();

  return {
    id: item.id,
    title: item.title,
    noteType: item.noteType,
    passed: missing.length === 0 && forbiddenHits.length === 0 && qualityAudit.passed,
    mode,
    reason,
    missing,
    forbiddenHits,
    qualityScore: qualityAudit.score,
    qualityFindings,
    qualityBlockingFindings,
    noteLength: normalizedNote.length,
    noteExcerpt: normalizedNote.slice(0, 900),
    flagCount,
  };
}

export async function runSourcePacketNoteGenerationRegression(options: {
  caseIds?: string[];
  requireLive?: boolean;
} = {}): Promise<SourcePacketRegressionReport> {
  loadEvaluationEnv();

  const selected = options.caseIds?.length
    ? options.caseIds.map((id) => {
      const item = sourcePacketRegressionCases.find((candidate) => candidate.id === id);
      if (!item) throw new Error(`Unknown source packet regression case: ${id}`);
      return item;
    })
    : sourcePacketRegressionCases;

  const cases: SourcePacketRegressionCaseResult[] = [];

  for (const item of selected) {
    const sourceInput = buildSourceInputFromSections(item.sourceSections);
    const generated = await generateNote({
      specialty: item.specialty || 'Psychiatry',
      noteType: item.noteType,
      outputStyle: 'Standard',
      format: 'Labeled Sections',
      keepCloserToSource: true,
      flagMissingInfo: true,
      outputScope: 'full-note',
      customInstructions: [
        'Source-packet regression case. Use only the four Veranote source lanes.',
        'Preserve source attribution, uncertainty, and provider add-on instructions without converting add-on text into patient facts.',
        item.customInstructions || '',
      ].filter(Boolean).join('\n'),
      sourceInput,
      sourceSections: item.sourceSections,
    });

    const mode = generated.generationMeta.pathUsed === 'live' ? 'live' : 'fallback';
    const result = evaluateSourcePacketRegressionCase(item, generated.note, mode, generated.generationMeta.reason, generated.flags.length);

    if (options.requireLive !== false && mode !== 'live') {
      result.passed = false;
      result.missing.push(`live generation required but got ${mode}:${generated.generationMeta.reason}`);
    }

    cases.push(result);
  }

  const failed = cases.filter((item) => !item.passed).length;

  return {
    total: cases.length,
    passed: cases.length - failed,
    failed,
    cases,
  };
}
