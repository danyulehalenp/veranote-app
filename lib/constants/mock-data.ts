import { buildFounderWorkflowSourceInput, founderWorkflowStarters } from '@/lib/constants/founder-workflows';

export type ExampleCardData = {
  title: string;
  specialty: string;
  noteType: string;
  summary: string;
  sourceInput?: string;
  founderWorkflow?: boolean;
  careSetting?: 'Inpatient' | 'Outpatient' | 'Telehealth' | 'Mixed';
  outpatientReady?: boolean;
};

export const noteTypeOptionsBySpecialty: Record<string, string[]> = {
  Psychiatry: [
    'Inpatient Psych Progress Note',
    'Inpatient Psych Initial Adult Evaluation',
    'Inpatient Psych Initial Adolescent Evaluation',
    'Inpatient Psych Day Two Note',
    'Inpatient Psych Discharge Summary',
    'Psychiatric Crisis Note',
    'Substance-vs-Psych Overlap Note',
    'Outpatient Psych Follow-Up',
    'Outpatient Psych Telehealth Follow-Up',
    'Outpatient Psychiatric Evaluation',
  ],
  Therapy: [
    'Therapy Intake Evaluation',
    'Therapy Progress Note',
    'Therapy Treatment Plan',
    'Couples Therapy Note',
    'Group Therapy Note',
  ],
  'Social Work': [
    'Social Work Psychosocial Assessment',
    'Social Work Progress Note',
    'Case Management Note',
    'Discharge Planning Note',
    'Safety Planning Note',
  ],
  Psychology: [
    'Psychological Evaluation',
    'Psychotherapy Progress Note',
    'Testing Feedback Note',
  ],
  'Addiction Medicine': [
    'Substance Use Evaluation',
    'Medication Assisted Treatment Follow-Up',
    'IOP/PHP Progress Note',
    'Relapse Prevention Plan',
  ],
  'Primary Care': [
    'Primary Care Follow-Up',
    'General Medical SOAP/HPI',
    'Annual Wellness / Preventive Visit',
    'Medication Management Follow-Up',
  ],
  'Family Medicine': [
    'Family Medicine Follow-Up',
    'General Medical SOAP/HPI',
    'Annual Wellness / Preventive Visit',
    'Medication Management Follow-Up',
  ],
  'Internal Medicine': [
    'Internal Medicine Follow-Up',
    'General Medical SOAP/HPI',
    'Hospital Follow-Up Note',
    'Medical Consultation Note',
  ],
  Pediatrics: [
    'Pediatric Follow-Up Note',
    'Pediatric Behavioral Health Visit',
    'General Medical SOAP/HPI',
  ],
  'Emergency Medicine': [
    'Emergency Department Psychiatric Medical Screening',
    'Emergency Department Medical Note',
    'Medical Consultation Note',
  ],
  'Hospital Medicine': [
    'Hospital Medicine Progress Note',
    'Psych Admission Medical H&P',
    'Medical Consultation Note',
    'Discharge Medical Summary',
  ],
  Neurology: [
    'Neurology Consultation Note',
    'Neurology Follow-Up Note',
    'Medical Consultation Note',
  ],
  'General Medical': ['General Medical SOAP/HPI', 'Psych Admission Medical H&P', 'Medical Consultation Note'],
};

export const templateOptionsByNoteType: Record<string, string[]> = {
  'Inpatient Psych Progress Note': ['Default Inpatient Psych Progress Note', 'Psych Conservative Inpatient Note', 'Psych Risk-Focused Daily Note'],
  'Inpatient Psych Initial Adult Evaluation': ['Default Inpatient Psych Initial Adult Evaluation', 'Adult Psych Intake - Detailed'],
  'Inpatient Psych Initial Adolescent Evaluation': ['Default Inpatient Psych Initial Adolescent Evaluation', 'Adolescent Psych Intake - Family Context'],
  'Inpatient Psych Day Two Note': ['Default Inpatient Psych Day Two Note', 'Psych Day Two - Brief Reassessment'],
  'Inpatient Psych Discharge Summary': ['Default Inpatient Psych Discharge Summary', 'Psych Discharge - Continuity Focused'],
  'Psychiatric Crisis Note': ['Default Psychiatric Crisis Note', 'Psych Crisis - Safety First'],
  'Substance-vs-Psych Overlap Note': ['Default Substance-vs-Psych Overlap Note', 'Overlap Note - Source Fidelity'],
  'Outpatient Psych Follow-Up': ['Default Outpatient Psych Follow-Up', 'Outpatient Med Check - Concise'],
  'Outpatient Psych Telehealth Follow-Up': ['Default Outpatient Psych Telehealth Follow-Up', 'Telehealth Psych Follow-Up - Function Focused'],
  'Outpatient Psychiatric Evaluation': ['Default Outpatient Psychiatric Evaluation', 'Outpatient Psych Evaluation - Longitudinal'],
  'Therapy Intake Evaluation': ['Default Therapy Intake Evaluation', 'Therapy Intake - Biopsychosocial'],
  'Therapy Progress Note': ['Default Therapy Progress Note', 'Therapy Process Note - Concise'],
  'Therapy Treatment Plan': ['Default Therapy Treatment Plan', 'Therapy Goals and Interventions'],
  'Couples Therapy Note': ['Default Couples Therapy Note', 'Couples Session - Process Focused'],
  'Group Therapy Note': ['Default Group Therapy Note', 'Group Participation Note'],
  'Social Work Psychosocial Assessment': ['Default Social Work Psychosocial Assessment', 'Psychosocial Assessment - Resource Focused'],
  'Social Work Progress Note': ['Default Social Work Progress Note', 'Social Work Progress - Brief'],
  'Case Management Note': ['Default Case Management Note', 'Case Management - Resource Coordination'],
  'Discharge Planning Note': ['Default Discharge Planning Note', 'Discharge Planning - Barriers and Supports'],
  'Safety Planning Note': ['Default Safety Planning Note', 'Safety Planning - Collaborative'],
  'Psychological Evaluation': ['Default Psychological Evaluation', 'Psychological Evaluation - Diagnostic Clarification'],
  'Psychotherapy Progress Note': ['Default Psychotherapy Progress Note', 'Psychotherapy Process Note - Concise'],
  'Testing Feedback Note': ['Default Testing Feedback Note', 'Testing Feedback - Recommendations'],
  'Substance Use Evaluation': ['Default Substance Use Evaluation', 'SUD Evaluation - ASAM Oriented'],
  'Medication Assisted Treatment Follow-Up': ['Default MAT Follow-Up', 'MAT Follow-Up - Recovery Focused'],
  'IOP/PHP Progress Note': ['Default IOP/PHP Progress Note', 'IOP/PHP Progress - Skills and Safety'],
  'Relapse Prevention Plan': ['Default Relapse Prevention Plan', 'Relapse Prevention - Triggers and Supports'],
  'General Medical SOAP/HPI': ['Default General Medical SOAP/HPI', 'Hospital Follow-Up SOAP'],
  'Primary Care Follow-Up': ['Default Primary Care Follow-Up', 'Primary Care SOAP - Concise'],
  'Family Medicine Follow-Up': ['Default Family Medicine Follow-Up', 'Family Medicine SOAP - Concise'],
  'Internal Medicine Follow-Up': ['Default Internal Medicine Follow-Up', 'Internal Medicine SOAP - Problem Oriented'],
  'Pediatric Follow-Up Note': ['Default Pediatric Follow-Up Note', 'Pediatric SOAP - Family Context'],
  'Pediatric Behavioral Health Visit': ['Default Pediatric Behavioral Health Visit', 'Pediatric Behavioral Health - Parent Context'],
  'Annual Wellness / Preventive Visit': ['Default Annual Wellness / Preventive Visit', 'Preventive Visit - Checklist Friendly'],
  'Medication Management Follow-Up': ['Default Medication Management Follow-Up', 'Medication Follow-Up - Safety Focused'],
  'Hospital Follow-Up Note': ['Default Hospital Follow-Up Note', 'Hospital Follow-Up - Transition Focused'],
  'Emergency Department Psychiatric Medical Screening': ['Default ED Psychiatric Medical Screening', 'ED Psych Medical Screen - Risk and Disposition'],
  'Emergency Department Medical Note': ['Default Emergency Department Medical Note', 'ED Medical Note - Focused'],
  'Hospital Medicine Progress Note': ['Default Hospital Medicine Progress Note', 'Hospital Progress - Problem Oriented'],
  'Discharge Medical Summary': ['Default Discharge Medical Summary', 'Medical Discharge - Continuity Focused'],
  'Neurology Consultation Note': ['Default Neurology Consultation Note', 'Neurology Consult - Localization Focused'],
  'Neurology Follow-Up Note': ['Default Neurology Follow-Up Note', 'Neurology Follow-Up - Interval Change'],
  'Psych Admission Medical H&P': ['Default Psych Admission Medical H&P', 'Psych Medical Clearance H&P'],
  'Medical Consultation Note': ['Default Medical Consultation Note', 'Focused Inpatient Medical Consult'],
};

export const templateDescriptions: Record<string, string> = {
  'Default Inpatient Psych Progress Note': 'Balanced inpatient psych daily note with standard labeled sections and conservative source cleanup.',
  'Psych Conservative Inpatient Note': 'Psych-first draft profile that stays close to provider wording and minimizes unsupported polish.',
  'Psych Risk-Focused Daily Note': 'Highlights inpatient safety, discharge-readiness, and risk language when the source supports it.',
  'Default Inpatient Psych Initial Adult Evaluation': 'Standard adult psych intake structure for admission-level review and assessment.',
  'Adult Psych Intake - Detailed': 'Longer initial evaluation profile with more space for psychosocial context and collateral.',
  'Default Inpatient Psych Initial Adolescent Evaluation': 'Standard adolescent psych intake structure with clinician-review guardrails.',
  'Adolescent Psych Intake - Family Context': 'Adds more space for collateral, family context, and adolescent-specific intake narrative.',
  'Default Inpatient Psych Day Two Note': 'Focused second-day inpatient reassessment note.',
  'Psych Day Two - Brief Reassessment': 'Short reassessment format for quick inpatient progression checks.',
  'Default Inpatient Psych Discharge Summary': 'Conservative discharge summary profile focused on continuity and safety-sensitive transitions.',
  'Psych Discharge - Continuity Focused': 'Emphasizes disposition, follow-up continuity, and risk-sensitive discharge language.',
  'Default Psychiatric Crisis Note': 'Urgent psychiatry note profile focused on risk, timing, interventions, and next-step safety planning without invented stabilization language.',
  'Psych Crisis - Safety First': 'Crisis-oriented profile with extra emphasis on time, safety actions, de-escalation steps, and disposition boundaries.',
  'Default Substance-vs-Psych Overlap Note': 'Overlap note profile that keeps substance, medical, collateral, and psychiatric evidence attributed without closing the differential too early.',
  'Overlap Note - Source Fidelity': 'Extra source-close overlap profile for conflicting UDS, collateral, denial, sleep, and psychosis-related details.',
  'Default Outpatient Psych Follow-Up': 'Standard outpatient medication-management and symptom follow-up structure with conservative cleanup.',
  'Outpatient Med Check - Concise': 'Shorter outpatient follow-up profile for med checks, side effects, functioning, and next-step clarity.',
  'Default Outpatient Psych Telehealth Follow-Up': 'Telehealth follow-up structure that keeps the visit concise while preserving symptom, functioning, and safety nuance.',
  'Telehealth Psych Follow-Up - Function Focused': 'Telehealth follow-up profile with extra emphasis on day-to-day functioning, adherence, and practical plan language.',
  'Default Outpatient Psychiatric Evaluation': 'Standard outpatient psychiatric evaluation structure for longitudinal history, diagnosis framing, and treatment planning.',
  'Outpatient Psych Evaluation - Longitudinal': 'Longer outpatient evaluation profile with room for prior treatment response, functioning, and longitudinal context.',
  'Default Therapy Progress Note': 'Compact therapy note structure that avoids inventing interventions or progress.',
  'Therapy Process Note - Concise': 'Shorter therapy profile with restrained tone and minimal filler.',
  'Default General Medical SOAP/HPI': 'General medical note profile for problem-oriented source cleanup.',
  'Hospital Follow-Up SOAP': 'Slightly tighter inpatient follow-up SOAP framing.',
  'Default Psych Admission Medical H&P': 'Medical admission review for psych setting with source-faithful medical relevance.',
  'Psych Medical Clearance H&P': 'Medical clearance-oriented framing for psychiatric admission workflow.',
  'Default Medical Consultation Note': 'Focused consult note profile with restrained assessment and plan language.',
  'Focused Inpatient Medical Consult': 'Tighter inpatient consultation framing with less narrative padding.',
};

export const exampleFlags = [
  'Follow-up interval not documented',
  'MSE not provided',
  'Side effects not addressed',
];

export const sampleSourceInput = `3/23/26 Med adjustment noted from yesterday. Abilify added to current regimen. Patient says tolerating. Still severely depressed mood and affect. +Passive SI, makes hopeless statements. Minimal responses to my questions. Patient says poor sleep. Isolating and not attending groups or unit milieu. Poor insight as patient doesn't think they need to be here. Doesn't think THC use is a problem and not interested in quitting despite education given. Not stable or safe for discharge due to still voicing passive SI. Increased risk for self-harm. Continue inpatient treatments and monitoring.`;

export const sampleDraft = `Date / Interval Update:\nOn 3/23/26, medication adjustment from the prior day was reviewed. Abilify was added to the current regimen.\n\nSymptom Review:\nSymptom review notes continued severely depressed mood and affect, passive SI with hopeless statements, poor sleep, and isolating behavior with nonattendance at groups and the unit milieu.\n\nMedications / Changes / Side Effects:\nAbilify was added to the current regimen, and the patient reports tolerating it.\n\nMental Status / Observations:\nThe patient provided minimal responses to questions.\n\nInsight / Judgment:\nPoor insight is noted, as the patient does not believe hospitalization is needed and does not view THC use as problematic.\n\nSafety / Risk:\nThe patient continues to voice passive SI and remains at increased risk for self-harm. The patient is not stable or safe for discharge.\n\nAssessment:\nThe patient remains severely depressed with passive SI, poor insight, and ongoing isolative behavior.\n\nPlan:\nContinue inpatient treatment and monitoring.`;

export const exampleCards: ExampleCardData[] = [
  {
    title: 'Inpatient psych progress note example',
    specialty: 'Psychiatry',
    noteType: 'Inpatient Psych Progress Note',
    careSetting: 'Inpatient',
    summary: 'Persistent severe depression, passive SI, poor sleep, isolating behavior, poor insight, and continued inpatient risk concerns.',
  },
  {
    title: 'Psychiatric crisis note example',
    specialty: 'Psychiatry',
    noteType: 'Psychiatric Crisis Note',
    careSetting: 'Outpatient',
    summary: 'Urgent psychiatric assessment with escalating suicidal thoughts, no current attempt, crisis interventions, collateral contact, and safety-focused disposition.',
    sourceInput: `### Clinician note
- Urgent same-day crisis visit after therapist called about worsening suicidal thoughts.
- Patient reports increasing thoughts of overdosing over last 48 hours.
- No ingestion, no current attempt, no weapon access.
- Sister stayed with patient overnight and came to clinic.
- Safety planning reviewed, mobile crisis discussed, ED escalation threshold reviewed.

### Transcript
- "I got scared because the thoughts were getting louder."
- "I have thought about pills, but I have not taken anything and I do not want to die today."

### Objective data
- Sister confirms worsening isolation and crying last 2 days.
- No vitals available.`,
    outpatientReady: true,
  },
  {
    title: 'Outpatient psych follow-up example',
    specialty: 'Psychiatry',
    noteType: 'Outpatient Psych Follow-Up',
    careSetting: 'Outpatient',
    summary: 'Follow-up med-management visit with partial symptom improvement, adherence review, side-effect check, functioning update, and outpatient safety framing.',
    sourceInput: `### Clinician note
- Follow-up for depression and anxiety.
- Mood somewhat better on sertraline.
- Still waking up through the night.
- Mild nausea after taking med in the morning.
- Missed 2 doses this week.
- Still working, but tired by end of shift.
- Denies SI/HI.

### Transcript
- "I think it helps some, just not all the way."
- "Sleep is still off."
- "I forgot a couple doses this week."

### Objective data
- Medication list shows sertraline 100 mg daily.`,
    outpatientReady: true,
  },
  {
    title: 'Outpatient telehealth psych follow-up example',
    specialty: 'Psychiatry',
    noteType: 'Outpatient Psych Telehealth Follow-Up',
    careSetting: 'Telehealth',
    summary: 'Video med-management follow-up with chronic passive SI background, acute stress worsening, and no current plan or intent.',
    sourceInput: `### Clinician note
- Video follow-up from home.
- Chronic passive SI at baseline, no current plan or intent.
- Anxiety worse this week due to family court stress.
- Sleeping 4 to 5 hours.
- Taking meds and still going to work.

### Transcript
- "The thoughts are kind of in the background sometimes, but I'm not going to act on them."
- "Court this week made everything worse."

### Objective data
- Telehealth visit completed by video.
- No vitals available.`,
    outpatientReady: true,
  },
  {
    title: 'Outpatient psychiatric evaluation example',
    specialty: 'Psychiatry',
    noteType: 'Outpatient Psychiatric Evaluation',
    careSetting: 'Outpatient',
    summary: 'New outpatient intake with mood instability, attention complaints, trauma history, and a differential that should remain open.',
    sourceInput: `### Clinician note
- New outpatient eval for mood instability, poor concentration, and impulsive spending.
- Prior PCP note mentions possible bipolar disorder.
- Patient reports depressive periods and occasional less-sleep periods with feeling revved up.
- No clear hospitalization for mania.
- Trauma history present.
- Wants diagnostic clarification before another medication.
- Denies current SI/HI/psychosis.

### Transcript
- "I don't know if it's bipolar or if I'm just overwhelmed and anxious."
- "I've never been hospitalized for anything like mania."

### Objective data
- Prior med trials: escitalopram, bupropion.`,
    outpatientReady: true,
  },
  {
    title: 'Breakup rumination and social media checking',
    specialty: 'Therapy',
    noteType: 'Therapy Progress Note',
    careSetting: 'Outpatient',
    summary: 'Breakup themes, rumination, checking behavior, CBT reframing, homework, no safety concerns voiced.',
  },
  {
    title: 'Psych admission medical H&P example',
    specialty: 'General Medical',
    noteType: 'Psych Admission Medical H&P',
    careSetting: 'Inpatient',
    summary: 'Focused medical clearance/admission H&P content relevant to psych admission and inpatient safety.',
  },
  ...founderWorkflowStarters.map((starter) => ({
    title: `${starter.title} founder workflow`,
    specialty: 'Psychiatry',
    noteType: starter.noteType,
    careSetting: (starter.noteType.toLowerCase().includes('discharge') || starter.noteType.toLowerCase().includes('inpatient') ? 'Inpatient' : 'Mixed') as ExampleCardData['careSetting'],
    summary: starter.summary,
    sourceInput: buildFounderWorkflowSourceInput(starter),
    founderWorkflow: true,
    outpatientReady: false,
  })),
];
