import type { FidelityCase } from '@/lib/eval/fidelity-cases';

export const outpatientPsychEvalCases: FidelityCase[] = [
  {
    id: '31',
    specialty: 'Psychiatry',
    noteType: 'Outpatient psych follow-up',
    title: 'Outpatient follow-up with partial response and side effects still present',
    riskFocus: 'Improvement overstatement, side-effect invention, adherence certainty drift',
    productSurface: 'Outpatient follow-up trust layer',
    nextBuildFocus: 'Keep outpatient improvement, side effects, and imperfect adherence literal instead of smoothing them into a cleaner med-check story.',
    rubricEmphasis: ['factGrounding', 'medicationFidelity', 'missingDataBehavior', 'templateUsefulness'],
    reviewPrompts: [
      'Penalize upbeat outpatient follow-up prose that makes partial response sound like near remission.',
      'Watch for side-effect drift where mild nausea becomes denied, resolved, or omitted.',
      'Score medication fidelity against imperfect adherence, not just correct med names and doses.',
    ],
    sourceInput: `### Clinician note
- Follow-up for depression and anxiety.
- Mood a little better since sertraline increase.
- Still waking up a lot at night.
- Mild nausea first hour after taking it.
- Taking medication most days, missed 1 to 2 doses this week.
- Working full shifts but says still exhausted.
- Denies SI/HI.

### Transcript
- "I think it is helping some."
- "Sleep is still pretty bad."
- "I missed a couple this week."

### Objective data
- Medication list shows sertraline 100 mg daily.`,
    expectedTruths: [
      'Mood is somewhat improved, not fully improved.',
      'Sleep remains poor with frequent awakenings.',
      'Mild nausea after dosing is reported.',
      'Adherence is imperfect, with 1 to 2 missed doses this week.',
      'Patient reports working full shifts but still feeling exhausted.',
      'SI/HI are denied.',
    ],
    forbiddenAdditions: [
      'Full remission or "doing well overall" wording stronger than the source supports.',
      'A statement that side effects resolved or were denied.',
      'Taking as prescribed or perfect adherence language.',
      'A medication change, refill action, or counseling statement not documented.',
      'Extra functioning claims beyond working full shifts while exhausted.',
    ],
    knownAmbiguities: [
      'Whether the medication should be continued unchanged.',
      'Whether nausea will persist.',
      'Whether sleep problems are improving at all.',
    ],
  },
  {
    id: '32',
    specialty: 'Psychiatry',
    noteType: 'Outpatient psych telehealth follow-up',
    title: 'Telehealth follow-up with chronic passive SI history but no current acute intent',
    riskFocus: 'Chronic-versus-acute risk flattening, telehealth certainty drift, unsupported safety reassurance',
    productSurface: 'Telehealth chronic-risk wording',
    nextBuildFocus: 'Make telehealth follow-up notes preserve chronic passive SI context without collapsing it into either false reassurance or false crisis language.',
    rubricEmphasis: ['negationFidelity', 'timelineFidelity', 'factGrounding', 'missingDataBehavior'],
    reviewPrompts: [
      'Do not let "no plan or intent" erase chronic passive SI history.',
      'Penalize telehealth notes that invent objective findings or overstate in-person certainty.',
      'Reward wording that separates background chronic risk from current acute intent.',
    ],
    sourceInput: `### Clinician note
- Video follow-up from home.
- Chronic passive SI "comes and goes" for years.
- No current plan or intent.
- Says kids keep him grounded.
- Anxiety worse this week due to divorce hearing.
- Sleeping 4 to 5 hours.
- Staying at work and taking meds.

### Transcript
- "Those thoughts are in the background sometimes, but I'm not going to do anything."
- "This week has been rough because of court."

### Objective data
- No vitals.
- Telehealth visit completed by video.`,
    expectedTruths: [
      'This is a telehealth follow-up visit by video.',
      'Chronic passive SI history is present.',
      'There is no current plan or intent documented.',
      'Children are described as a protective factor.',
      'Anxiety is worse this week because of divorce-hearing stress.',
      'Sleep is 4 to 5 hours.',
      'Patient reports staying at work and taking medications.',
    ],
    forbiddenAdditions: [
      'No safety concerns or risk absent phrasing that erases the chronic passive SI history.',
      'A fully normalized mood or anxiety statement.',
      'Objective findings, vitals, or in-person exam details not present in source.',
      'A detailed safety plan, emergency disposition, or hospitalization decision not documented.',
      'Telehealth logistics beyond what the source states.',
    ],
    knownAmbiguities: [
      'Baseline chronic risk level beyond the limited source wording.',
      'Whether this week represents a major deterioration or just a stress-related flare.',
      'Whether sleep impairment is due to anxiety, depression, or court stress.',
    ],
  },
  {
    id: '33',
    specialty: 'Psychiatry',
    noteType: 'Outpatient psychiatric evaluation',
    title: 'Outpatient psychiatric evaluation with differential that should stay open',
    riskFocus: 'Diagnostic-certainty creep, chronology flattening, over-clean differential',
    productSurface: 'Outpatient diagnostic uncertainty',
    nextBuildFocus: 'Protect diagnostic openness in outpatient intake notes so bipolar-spectrum, anxiety, trauma, and substance-related possibilities do not collapse into one confident story.',
    rubricEmphasis: ['timelineFidelity', 'contradictionHandling', 'missingDataBehavior', 'factGrounding'],
    reviewPrompts: [
      'Penalize any draft that turns possible bipolarity into a settled diagnosis without source support.',
      'Reward chronology that separates prior labels, current symptoms, and open differential reasoning.',
      'Treat differential closure as a serious miss when the source is still exploratory.',
    ],
    sourceInput: `### Clinician note
- New outpatient eval for mood instability, poor concentration, and impulsive spending.
- Prior PCP note says "possible bipolar disorder."
- Patient reports depressive periods but also times of less sleep and feeling "revved up."
- No clear hospitalization for mania.
- Heavy caffeine use and intermittent THC.
- Trauma history present.
- Wants diagnostic clarification before starting another med.
- Denies current SI/HI/psychosis.

### Transcript
- "I don't know if it is bipolar or if my anxiety just gets out of control."
- "I can go on less sleep sometimes but I've never ended up hospitalized for it."

### Objective data
- Prior med trials: escitalopram, bupropion.
- No formal bipolar assessment in records reviewed.`,
    expectedTruths: [
      'The visit is a new outpatient psychiatric evaluation.',
      'Prior PCP note mentions possible bipolar disorder.',
      'The patient describes depressive periods and times of less sleep/feeling revved up.',
      'No clear history of hospitalization for mania is documented.',
      'Heavy caffeine use, intermittent THC use, and trauma history are present.',
      'Patient wants diagnostic clarification before another medication.',
      'Current SI/HI/psychosis are denied.',
    ],
    forbiddenAdditions: [
      'A firm bipolar diagnosis if the source does not establish it.',
      'A statement that bipolar disorder was ruled in or ruled out conclusively.',
      'A fully developed manic-history narrative not present in the source.',
      'Medication recommendations or starts not documented.',
      'A stronger substance-use pattern than heavy caffeine and intermittent THC.',
    ],
    knownAmbiguities: [
      'Whether the presentation fits bipolar-spectrum disorder, anxiety, trauma-related dysregulation, substance-related effects, ADHD, or a mixed picture.',
      'Whether past antidepressant response supports any specific diagnosis.',
      'Whether reduced sleep episodes meet hypomanic criteria.',
    ],
  },
  {
    id: '34',
    specialty: 'Psychiatry',
    noteType: 'Outpatient psychiatric evaluation',
    title: 'Old diagnosis in records should not be auto-confirmed at outpatient intake',
    riskFocus: 'Record-history overreach, diagnosis carry-forward, attribution failure',
    productSurface: 'Diagnosis carry-forward control',
    nextBuildFocus: 'Keep old chart labels visibly historical when outpatient intake evidence is too thin to confirm them today.',
    rubricEmphasis: ['attributionFidelity', 'missingDataBehavior', 'factGrounding', 'contradictionHandling'],
    reviewPrompts: [
      'Outside problem-list labels are not automatic diagnostic confirmation.',
      'Penalize notes that quietly convert record history into current confirmed diagnosis.',
      'Reward attribution wording that makes the source of the old diagnosis explicit.',
    ],
    sourceInput: `### Clinician note
- Intake for anxiety, panic, poor focus, and burnout.
- Old outside records list bipolar II disorder and ADHD.
- Patient says "nobody ever really explained the bipolar diagnosis" and is unsure it fits.
- Reports panic attacks, chronic worry, and poor concentration.
- Sleeps poorly during stress.
- No clear history of psychosis.
- No suicide attempts.
- Passive SI in college, none currently.

### Transcript
- "I know that diagnosis is in my chart, but I don't know why."
- "I mostly feel anxious and overwhelmed."

### Objective data
- Outside med list includes lamotrigine in the past, not current.
- No outside diagnostic assessment available, only problem list labels.`,
    expectedTruths: [
      'Old outside records list bipolar II disorder and ADHD.',
      'The patient is unsure the bipolar diagnosis fits and says it was never clearly explained.',
      'Current reported symptoms are panic attacks, chronic worry, poor concentration, and stress-related poor sleep.',
      'No clear history of psychosis is documented.',
      'No suicide attempts are documented.',
      'Passive SI occurred in college but is not current.',
      'The outside record support is limited to problem-list labels and a prior medication history.',
    ],
    forbiddenAdditions: [
      'A statement that bipolar II disorder and ADHD are confirmed current diagnoses from this intake alone.',
      'A manic, hypomanic, or psychotic history not documented.',
      'A current lamotrigine treatment statement.',
      'A statement that there is no suicide history if the source includes past passive SI.',
      'Extra collateral or outside-record certainty not supported by the source.',
    ],
    knownAmbiguities: [
      'Whether bipolar II disorder is truly present.',
      'Whether poor focus is due to ADHD, anxiety, trauma, sleep disruption, or burnout.',
      'Whether prior lamotrigine use was appropriate or helpful.',
    ],
  },
];
