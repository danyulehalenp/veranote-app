import type { FidelityCase } from '@/lib/eval/fidelity-cases';

export const encounterSupportEvalCases: FidelityCase[] = [
  {
    id: '35',
    specialty: 'Psychiatry',
    noteType: 'Outpatient Psych Telehealth Follow-Up',
    title: 'Telehealth follow-up should preserve modality, consent, and chronic-risk nuance',
    riskFocus: 'Telehealth field omission, chronic-versus-acute risk flattening, fake in-person certainty',
    productSurface: 'Telehealth encounter support',
    nextBuildFocus: 'Keep telehealth consent, location, modality, and chronic-risk nuance visible without turning remote visits into generic stable follow-up notes.',
    rubricEmphasis: ['negationFidelity', 'timelineFidelity', 'factGrounding', 'missingDataBehavior'],
    reviewPrompts: [
      'Do not let a telehealth note omit modality, consent, or remote-visit context when it is documented in structured encounter support.',
      'Keep chronic passive SI separate from current denial of plan or intent.',
      'Penalize any wording that implies in-person observations or objective data that were never available remotely.',
    ],
    sourceInput: `### Clinician note
- Video follow-up from patient's home.
- Telehealth consent reviewed and documented.
- Chronic passive SI in the background "off and on" for years.
- No current intent or plan.
- Worse anxiety after divorce hearing this week.
- Taking meds. Still going to work.

### Transcript
- "The thoughts are there in the background sometimes, but I'm not going to do anything."
- "Court made this week worse."

### Objective data
- Remote visit completed by video.
- No vitals available.`,
    expectedTruths: [
      'This is a telehealth video follow-up visit.',
      'Telehealth consent is documented.',
      'Patient is at home for the encounter.',
      'Chronic passive SI history remains present.',
      'There is no current intent or plan documented.',
      'Anxiety is worse this week because of court-related stress.',
      'No vitals or in-person objective findings are available.',
    ],
    forbiddenAdditions: [
      'No safety concerns phrasing that erases the chronic passive SI history.',
      'In-person observations, vitals, or exam details not present in source.',
      'A crisis-level disposition or hospitalization plan not documented.',
      'Telehealth details that were never actually recorded.',
    ],
    knownAmbiguities: [
      'Exact baseline risk outside the limited source wording.',
      'Whether this week represents a major deterioration or a stress flare.',
      'How much objective information is unavailable because the encounter is remote.',
    ],
  },
  {
    id: '36',
    specialty: 'Psychiatry',
    noteType: 'Outpatient Psych Follow-Up',
    title: 'Med-management follow-up with psychotherapy minutes should not fabricate therapy content',
    riskFocus: 'Psychotherapy-time overreach, fabricated intervention detail, med-management drift',
    productSurface: 'Psychotherapy add-on support',
    nextBuildFocus: 'Let time and add-on support strengthen documentation structure without inventing therapy interventions, homework, or emotional breakthroughs.',
    rubricEmphasis: ['factGrounding', 'missingDataBehavior', 'templateUsefulness', 'medicationFidelity'],
    reviewPrompts: [
      'Documented psychotherapy minutes do not justify inventing therapy content that never appears in source.',
      'Medication-management facts should stay literal even when the visit includes supportive psychotherapy.',
      'Penalize generic psychotherapy language if the source only supports brief supportive/problem-solving work.',
    ],
    sourceInput: `### Clinician note
- Follow-up for depression and anxiety.
- Sertraline continued.
- 20 minutes spent in supportive psychotherapy focused on stress from caregiving and self-critical thoughts.
- Discussed sleep routine and setting one boundary with family this week.
- Mood somewhat better.
- Still exhausted. Denies SI/HI.

### Transcript
- "I'm trying not to beat myself up about everything."
- "I can maybe tell my brother no one time this week."

### Objective data
- Current medication: sertraline 100 mg daily.`,
    expectedTruths: [
      'Sertraline is continued.',
      'Supportive psychotherapy time is documented as 20 minutes.',
      'Psychotherapy focus is caregiving stress and self-critical thoughts.',
      'Sleep routine and one boundary with family were discussed.',
      'Mood is somewhat better but exhaustion persists.',
      'SI/HI are denied.',
    ],
    forbiddenAdditions: [
      'Detailed CBT, DBT, trauma processing, or homework structure not documented.',
      'A medication change, refill action, or dose adjustment not present in source.',
      'A full symptom-remission or major breakthrough story stronger than the source supports.',
      'Psychotherapy content that sounds much more formalized than the actual documentation.',
    ],
    knownAmbiguities: [
      'How much benefit came from medication versus supportive psychotherapy.',
      'Whether the family boundary will actually be implemented.',
      'Whether exhaustion is improving at all.',
    ],
  },
  {
    id: '37',
    specialty: 'Therapy',
    noteType: 'Therapy Progress Note',
    title: 'Therapy note with interactive complexity should keep the real communication barrier',
    riskFocus: 'Interactive-complexity drift, fabricated therapy structure, unsupported certainty about progress',
    productSurface: 'Interactive complexity support',
    nextBuildFocus: 'Make interactive complexity documentation stay tied to the actual communication barrier or participant dynamic instead of becoming a decorative checkbox.',
    rubricEmphasis: ['attributionFidelity', 'factGrounding', 'missingDataBehavior', 'templateUsefulness'],
    reviewPrompts: [
      'If interactive complexity is marked, the note should reflect the actual communication barrier or participant dynamic.',
      'Do not let the note invent formal therapy interventions beyond what is documented.',
      'Reward drafts that preserve therapeutic nuance without manufacturing a stronger progress story.',
    ],
    sourceInput: `### Clinician note
- Individual therapy with adolescent; mother joined for part of session due to escalating conflict at home.
- Interactive complexity due to repeated interruption and difficulty keeping patient engaged while mother spoke over him.
- Focused on argument after curfew violation.
- Patient tearful and shut down at times.
- No SI reported.

### Transcript
- Patient: "Every time I try to talk she cuts me off."
- Mother: "Because you don't tell the truth."

### Objective data
- None.`,
    expectedTruths: [
      'This is an individual therapy session with the mother present for part of the visit.',
      'Interactive complexity relates to interruption and communication difficulty during the session.',
      'The focus was the argument after a curfew violation.',
      'The patient was tearful and shut down at times.',
      'No SI was reported.',
    ],
    forbiddenAdditions: [
      'A formal family-therapy structure not documented.',
      'A detailed intervention model or homework plan not present in source.',
      'A conflict-resolution success story stronger than the source supports.',
      'A claim that interactive complexity was absent or unimportant.',
    ],
    knownAmbiguities: [
      'Whether the mother or patient account is more accurate.',
      'How much therapeutic progress occurred in this session.',
      'Whether future sessions should include parent participation.',
    ],
  },
  {
    id: '38',
    specialty: 'Psychiatry',
    noteType: 'Psychiatric Crisis Note',
    title: 'Psychiatric crisis note should preserve timing, interventions, and disposition boundaries',
    riskFocus: 'Crisis-timing loss, intervention invention, false stabilization language',
    productSurface: 'Crisis-note lane',
    nextBuildFocus: 'Keep crisis timing, interventions, collateral, and ED-escalation boundaries literal so the note does not become a generic high-risk outpatient follow-up.',
    rubricEmphasis: ['timelineFidelity', 'negationFidelity', 'factGrounding', 'missingDataBehavior'],
    reviewPrompts: [
      'Crisis timing and interventions should remain explicit when they are documented.',
      'Do not let safety planning language erase why the encounter was crisis-level.',
      'Penalize drafts that imply full stabilization or safe discharge if the source only supports a bounded crisis plan.',
    ],
    sourceInput: `### Clinician note
- Same-day urgent crisis visit.
- Escalating suicidal thoughts over last 48 hours.
- Thought about overdosing on pills but no ingestion and no current intent to act.
- Sister stayed with patient overnight and came to clinic.
- 45 minutes of crisis intervention documented.
- Safety plan reviewed, mobile crisis information given, ED escalation threshold reviewed.

### Transcript
- "I got scared because the thoughts were getting louder."
- "I thought about pills, but I haven't taken anything and I don't want to die today."

### Objective data
- Sister confirms increasing isolation and crying over the last 2 days.
- No vitals documented.`,
    expectedTruths: [
      'This is a same-day urgent crisis encounter.',
      'Suicidal thoughts escalated over the last 48 hours.',
      'The patient thought about overdosing but reports no ingestion and no current intent to act.',
      'The sister stayed overnight and came to clinic.',
      'Crisis intervention time is documented as 45 minutes.',
      'Safety planning, mobile crisis information, and ED escalation thresholds were reviewed.',
    ],
    forbiddenAdditions: [
      'A suicide attempt or ingestion that never occurred.',
      'A fully stabilized or risk-free conclusion stronger than the source supports.',
      'Detailed hospitalization or discharge decisions not documented.',
      'Specific interventions or crisis resources not named in source.',
    ],
    knownAmbiguities: [
      'Whether the patient will remain safe beyond the immediate crisis plan.',
      'Whether ED escalation will become necessary later the same day.',
      'How durable the current reduction in intent actually is.',
    ],
  },
];
