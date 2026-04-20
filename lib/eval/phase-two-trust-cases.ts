import type { FidelityCase } from '@/lib/eval/fidelity-cases';

export const phaseTwoTrustEvalCases: FidelityCase[] = [
  {
    id: '39',
    specialty: 'Psychiatry',
    noteType: 'Inpatient Psych Progress Note',
    title: 'Assessment should preserve objective conflict instead of smoothing it away',
    riskFocus: 'Objective-lab conflict, unsupported normalization, false clinical resolution',
    productSurface: 'Objective conflict truth layer',
    nextBuildFocus:
      'Keep abnormal objective findings, positive screens, and observed behavior visible in the assessment instead of letting polished narrative language overrule them.',
    rubricEmphasis: ['factGrounding', 'contradictionHandling', 'missingDataBehavior', 'templateUsefulness'],
    reviewPrompts: [
      'If the patient says they are doing fine but the objective section is still abnormal, the draft should preserve that tension.',
      'Do not let the assessment imply medical or psychiatric stability when the source still documents conflicting evidence.',
      'Penalize plan language that sounds resolved when the source only supports continued concern or follow-up.',
    ],
    sourceInput: `### Clinician note
- Patient says he is "good now" and wants discharge soon.
- Denies withdrawal symptoms.
- Still somewhat guarded and pacing on the unit overnight.
- Team discussed that urine tox remains positive for amphetamines.
- BP this morning 162/98.
- No clear medication side effects reported.

### Transcript
- "I'm fine now. I don't need to be here much longer."
- "I'm not withdrawing."

### Objective data
- Urine tox: positive for amphetamines.
- BP: 162/98.
- Nursing note: pacing overnight, slept 3 hours.`,
    expectedTruths: [
      'The patient reports feeling better and wants discharge soon.',
      'The patient denies withdrawal symptoms.',
      'Objective data still show elevated blood pressure and positive amphetamine screen.',
      'Nursing/observed behavior still includes pacing and poor sleep.',
      'The overall picture remains mixed rather than clearly resolved.',
    ],
    forbiddenAdditions: [
      'A stable-for-discharge conclusion that is stronger than the source supports.',
      'A statement that vitals or toxicology normalized.',
      'A claim that pacing, sleep disruption, or guarded behavior resolved.',
      'A medication side effect story that never appears in source.',
    ],
    knownAmbiguities: [
      'Whether discharge will occur soon.',
      'How much the patient insightfully recognizes the ongoing concerns.',
      'Whether the positive toxicology fully explains the current presentation.',
    ],
  },
  {
    id: '40',
    specialty: 'Psychiatry',
    noteType: 'Outpatient Psych Follow-Up',
    title: 'Medication section should preserve regimen conflict and profile gaps',
    riskFocus: 'Medication truth drift, incomplete regimen detail, unsupported reconciliation',
    productSurface: 'Medication truth layer',
    nextBuildFocus:
      'Keep medication names, dose gaps, and chart-versus-patient conflicts visible instead of silently reconciling them into a cleaner regimen story.',
    rubricEmphasis: ['medicationFidelity', 'factGrounding', 'contradictionHandling', 'missingDataBehavior'],
    reviewPrompts: [
      'Do not quietly resolve medication conflicts between patient report and chart data.',
      'Missing dose, schedule, or route should stay visibly incomplete rather than being guessed.',
      'Penalize drafts that convert an uncertain med list into a polished but unsupported medication plan.',
    ],
    sourceInput: `### Clinician note
- Patient says she is still taking lithium but "only at night now."
- Unsure of exact dose and forgot pill bottle.
- Also taking quetiapine "sometimes for sleep."
- Chart med list still shows lithium 300 mg BID and quetiapine 50 mg qhs.
- No recent lithium level available in chart.
- Denies tremor. Reports some morning grogginess.

### Transcript
- "I take the lithium at night now, I think just one."
- "I only use the quetiapine sometimes when I really can't sleep."

### Objective data
- Medication list: lithium 300 mg twice daily, quetiapine 50 mg nightly as needed.
- No current lithium level on file.`,
    expectedTruths: [
      'The patient reports taking lithium differently from the charted regimen.',
      'The exact current lithium dose is uncertain.',
      'Quetiapine use appears intermittent for sleep from the patient report.',
      'The chart medication list still reflects lithium 300 mg BID and quetiapine 50 mg qhs PRN.',
      'No recent lithium level is available.',
      'Morning grogginess is reported and tremor is denied.',
    ],
    forbiddenAdditions: [
      'A fully reconciled lithium regimen with confirmed dose that the source does not provide.',
      'A normal lithium level or any lab value that is not in source.',
      'A definitive medication-change plan not documented in source.',
      'A statement that adherence is excellent or that the regimen is clearly stable.',
    ],
    knownAmbiguities: [
      'The patient’s actual current lithium dose.',
      'How often quetiapine is being used.',
      'Whether grogginess is from quetiapine, lithium timing, or another factor.',
    ],
  },
  {
    id: '41',
    specialty: 'Psychiatry',
    noteType: 'Outpatient Psychiatric Evaluation',
    title: 'Assessment should keep diagnostic uncertainty open instead of upgrading it',
    riskFocus: 'Diagnosis overstatement, historical-label drift, differential collapse',
    productSurface: 'Diagnosis caution layer',
    nextBuildFocus:
      'Use the structured diagnosis frame to keep historical labels, differentials, and symptom-level formulations from turning into confirmed current diagnoses too early.',
    rubricEmphasis: ['factGrounding', 'negationFidelity', 'timelineFidelity', 'missingDataBehavior'],
    reviewPrompts: [
      'Historical diagnoses and outside labels should stay attributed instead of becoming current confirmed diagnoses automatically.',
      'If the evaluation is still exploring trauma, bipolar-spectrum illness, or substance effects, the draft should keep that uncertainty visible.',
      'Penalize assessment language that sounds more settled than the actual source supports.',
    ],
    sourceInput: `### Clinician note
- New psychiatric evaluation.
- Outside records list "bipolar disorder" from age 19, but patient is unsure why and does not recall a clear manic episode.
- Current symptoms include depressed mood, insomnia, irritability, trauma nightmares, and episodic increased energy after very little sleep for 1-2 days at a time.
- Cannabis use several nights per week.
- Working differential remains trauma-related disorder vs depressive disorder vs bipolar-spectrum illness.
- Do not confirm bipolar diagnosis today.

### Transcript
- "They told me bipolar years ago but I never really understood why."
- "Sometimes I barely sleep for a day or two and I get a lot done, but it's not like a whole week."
- "The nightmares are probably the biggest thing."

### Objective data
- Outside problem list includes bipolar disorder.
- No prior hospitalization records available today.`,
    expectedTruths: [
      'This is a new evaluation with diagnostic uncertainty still open.',
      'Bipolar disorder appears in outside records but is not confirmed today.',
      'Trauma-related disorder, depressive disorder, and bipolar-spectrum illness remain in the differential.',
      'Short periods of increased energy are described, but the source does not confirm a clear manic episode.',
      'Cannabis use is present several nights per week.',
      'Prior hospitalization records are not available today.',
    ],
    forbiddenAdditions: [
      'A confirmed current bipolar disorder diagnosis presented as settled fact.',
      'A firm PTSD diagnosis if the source only supports trauma-related differential language.',
      'A statement that mania is clearly established.',
      'A definitive causal claim about cannabis or trauma not supported by the source.',
    ],
    knownAmbiguities: [
      'Whether the prior bipolar label was accurate.',
      'How much cannabis use affects mood or sleep.',
      'Which diagnosis will ultimately best explain the presentation.',
    ],
  },
  {
    id: '42',
    specialty: 'Psychiatry',
    noteType: 'Outpatient Psych Telehealth Follow-Up',
    title: 'Risk section should preserve passive-suicidality nuance without flattening it',
    riskFocus: 'Risk overstatement or understatement, denial-language flattening, passive-versus-acute drift',
    productSurface: 'Risk wording layer',
    nextBuildFocus:
      'Keep passive death-wish language, recent concerning behavior, and current denial boundaries separate so the risk section does not become falsely reassuring or falsely crisis-level.',
    rubricEmphasis: ['negationFidelity', 'timelineFidelity', 'factGrounding', 'missingDataBehavior'],
    reviewPrompts: [
      'Current denial of plan or intent should not erase passive death-wish language or recent concerning behavior.',
      'Do not turn chronic or passive suicidal content into an acute attempt narrative when the source does not support it.',
      'Reward drafts that preserve risk nuance and uncertainty instead of forcing a clean safety conclusion.',
    ],
    sourceInput: `### Clinician note
- Video follow-up after difficult week.
- Patient says, "I wish I could go to sleep and not wake up" but denies wanting to kill herself.
- No current plan or intent.
- Last weekend gave sister the extra bottle of trazodone because she did not trust herself to keep it around while overwhelmed.
- Staying with sister tonight.
- Reviewed crisis resources and ED threshold.

### Transcript
- "I don't want to kill myself, I just don't want to feel like this."
- "I gave my sister the extra pills because that felt safer."

### Objective data
- Telehealth visit by video from sister's house.
- No vitals available.`,
    expectedTruths: [
      'This is a telehealth video follow-up visit.',
      'The patient expresses passive death-wish language.',
      'She denies current plan or intent to kill herself.',
      'She gave extra trazodone to her sister because of feeling unsafe keeping it nearby.',
      'She is staying with her sister tonight.',
      'Crisis resources and ED threshold were reviewed.',
    ],
    forbiddenAdditions: [
      'A statement that there are no safety concerns at all.',
      'A suicide attempt or ingestion that never occurred.',
      'A fully stabilized or risk-free conclusion stronger than the source supports.',
      'In-person observations or vitals not available in the telehealth source.',
    ],
    knownAmbiguities: [
      'How durable the current reduction in risk will be overnight.',
      'Whether passive suicidal thinking is escalating or remaining intermittent.',
      'Whether a higher level of care may be needed later if symptoms worsen.',
    ],
  },
];
