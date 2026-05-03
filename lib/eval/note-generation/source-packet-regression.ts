import { loadEnvConfig } from '@next/env';
import fs from 'node:fs';
import { buildSourceInputFromSections } from '@/lib/ai/source-sections';
import { generateNote } from '@/lib/ai/generate-note';
import { buildReviewedDocumentSourceBlock } from '@/lib/document-intake/source-document-intake';
import type { SourceSections } from '@/types/session';

type RequiredPattern = {
  label: string;
  pattern: RegExp;
};

type ForbiddenPattern = {
  label: string;
  pattern: RegExp;
};

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
      { label: 'bipolar uncertainty remains visible', pattern: /bipolar.*(?:unclear|not confirmed|historical|reported|needs|requires)|not confirm/i },
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
      { label: 'SI/HI denial visible', pattern: /denies? SI\/HI|deni(?:es|ed) suicidal|deni(?:es|ed) homicidal/i },
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
      { label: 'SI/HI denial visible', pattern: /denies? SI\/HI|deni(?:es|ed) suicidal|deni(?:es|ed) homicidal/i },
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
      { label: 'SI/HI denial visible despite misspelling', pattern: /denies? SI\/HI|deni(?:es|ed) suicidal|deni(?:es|ed) homicidal/i },
    ],
    forbidden: [
      { label: 'adherence overstated', pattern: /taking as prescribed|perfect adherence|fully adherent|good adherence|adherent with medication/i },
      { label: 'side effect erased', pattern: /no side effects|denies side effects|tolerating without side effects/i },
      { label: 'dose change invented', pattern: /(?:increase|decrease|adjust)\s+sertraline\b|sertraline[^.\n]{0,80}\b(?:increased|decreased)\b|(?:sertraline dose|dose of sertraline)(?![^.\n]{0,80}\b(?:not|no)\b)[^.\n]{0,80}\badjusted\b/i },
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
      { label: 'missed nighttime doses visible', pattern: /missed.*(?:night|dose).*(?:3|three)|forgets?.*night|fell asleep/i },
      { label: 'partial benefit visible', pattern: /helps? some|better some|partial/i },
      { label: 'SI/HI denial visible', pattern: /denies? SI\/HI|deni(?:es|ed) suicidal|deni(?:es|ed) homicidal/i },
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
      { label: 'dose change invented', pattern: /increase buprenorphine|decrease buprenorphine|adjust buprenorphine|change buprenorphine|buprenorphine[^.\n]{0,80}dose (?:increased|decreased|adjusted|changed)|dose adjusted|continue current buprenorphine|continue buprenorphine\/naloxone/i },
      { label: 'confirmed fentanyl relapse overclaim', pattern: /confirmed fentanyl relapse|patient relapsed on fentanyl/i },
      { label: 'stigmatizing dishonesty language', pattern: /lying|dishonest|drug-seeking/i },
    ],
  },
];

function loadEvaluationEnv() {
  loadEnvConfig(runtimePath);

  const localEnvPath = `${runtimePath}/.env.local`;
  try {
    const localEnv = fs.readFileSync(localEnvPath, 'utf8');
    for (const key of ['OPENAI_API_KEY', 'OPENAI_MODEL']) {
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

  if (/provider add-on|add-on instructs|\binstructs to preserve\b|provider guidance\s+(?:instructs|says|states|notes)|billing code|CPT preference|Named prompt|do not summarize as low risk|do not diagnose substance-induced psychosis|do not state confirmed hallucinations/i.test(note)) {
    forbiddenHits.push('provider add-on instruction echoed as clinical note content');
  }

  return {
    id: item.id,
    title: item.title,
    noteType: item.noteType,
    passed: missing.length === 0 && forbiddenHits.length === 0,
    mode,
    reason,
    missing,
    forbiddenHits,
    noteExcerpt: note.replace(/\s+/g, ' ').trim().slice(0, 900),
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
