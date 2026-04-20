import type { EvalRubricCategoryKey } from '@/types/eval';

export type FidelityCase = {
  id: string;
  specialty: string;
  noteType: string;
  title: string;
  riskFocus: string;
  productSurface?: string;
  nextBuildFocus?: string;
  sourceInput: string;
  expectedTruths: string[];
  forbiddenAdditions: string[];
  knownAmbiguities: string[];
  regressionPriority?: 'round-1' | 'task-1-high-risk';
  rubricEmphasis?: EvalRubricCategoryKey[];
  reviewPrompts?: string[];
};

export const fidelityCases: FidelityCase[] = [
  {
    id: '01',
    specialty: 'Psychiatry',
    noteType: 'Psychiatry follow-up',
    title: 'Sparse psychiatry follow-up with thin source',
    riskFocus: 'Sparse source, padding risk, unsupported mental-status filler',
    sourceInput: `### Clinician note
- Follow-up for depression/anxiety.
- Mood "a little better."
- Sleeping 5-6 hours.
- Missed sertraline about twice this week.
- No SI or HI.
- Wants to keep current dose for now.

### Collateral
- None.

### Transcript
- "I\'m doing a little better, not all the way there."
- "Sleep still kind of broken."
- "I forgot my pill a couple of times."

### Objective data
- Current medication listed: sertraline 50 mg daily.`,
    expectedTruths: [
      'Patient reports mild improvement, not full remission.',
      'Sleep remains impaired at about 5-6 hours.',
      'Sertraline adherence was imperfect this week.',
      'Patient denies SI/HI.',
      'Patient wants to continue current dose.',
    ],
    forbiddenAdditions: [
      'Full symptom review that was never provided.',
      'Claims of euthymic mood or "doing well" beyond the source.',
      'A medication increase, therapy referral, or safety plan not mentioned.',
      'Detailed MSE findings not supported by source.',
    ],
    knownAmbiguities: [
      'Whether anxiety improved specifically.',
      'Whether there were medication side effects.',
      'Whether functioning at work/school improved.',
    ],
  },
  {
    id: '02',
    specialty: 'Psychiatry',
    noteType: 'Psychiatry follow-up',
    title: 'Medication dose change with side-effect nuance',
    riskFocus: 'Medication fidelity, dose change accuracy, side-effect overstatement',
    sourceInput: `### Clinician note
- Increased sertraline from 50 mg to 75 mg 10 days ago.
- Nausea first 3 days, now improved.
- Panic attacks decreased from 4/week to 1/week.
- Still avoiding Walmart due to crowd anxiety.
- Denies SI/HI.

### Collateral
- Spouse says patient seems less irritable.

### Transcript
- "The bump helped some."
- "I felt sick to my stomach the first few days but that\'s mostly gone now."
- "Still hate crowded stores."

### Objective data
- Medication list still shows sertraline 50 mg daily (not yet updated).`,
    expectedTruths: [
      'Dose was increased to 75 mg 10 days ago.',
      'Nausea was temporary and improved.',
      'Panic attacks decreased but are not gone.',
      'Crowded-store avoidance persists.',
      'Spouse, not patient, reported less irritability.',
    ],
    forbiddenAdditions: [
      'Sertraline 100 mg or any other incorrect dose.',
      'Statement that patient is free of panic symptoms.',
      'Statement that side effects fully resolved if source says "mostly gone."',
      'Claim that medication list objectively confirms 75 mg, since it conflicts.',
    ],
    knownAmbiguities: [
      'Whether dose change should continue unchanged.',
      'Whether agoraphobia diagnosis is appropriate.',
      'Exact current irritability level from the patient\'s own perspective.',
    ],
  },
  {
    id: '03',
    specialty: 'Psychiatry',
    noteType: 'Psychiatry follow-up',
    title: 'Negation-heavy psychiatry visit',
    riskFocus: 'Negation fidelity, uncertainty preservation',
    sourceInput: `### Clinician note
- Denies SI, HI, AH, VH.
- No clear manic symptoms.
- Not sure whether nightmares are medication-related.
- No recent self-harm.
- Appetite not discussed.

### Transcript
- "No, I haven\'t wanted to hurt myself."
- "I don\'t think I\'m hearing or seeing things."
- "I can\'t tell if the dreams are from the med or just stress."

### Objective data
- None.`,
    expectedTruths: [
      'Patient denies SI/HI and psychotic symptoms.',
      'There are no clear manic symptoms reported.',
      'The source expresses uncertainty about nightmare cause.',
      'No recent self-harm is reported.',
    ],
    forbiddenAdditions: [
      'Positive psychosis or mania findings.',
      'Certainty that medication caused nightmares.',
      'Appetite details.',
      'Safety concerns not actually present in the source.',
    ],
    knownAmbiguities: [
      'Whether nightmares are medication-related or stress-related.',
      'Appetite and weight status.',
      'Sleep quality beyond nightmares.',
    ],
  },
  {
    id: '04',
    specialty: 'Psychiatry',
    noteType: 'Psychiatry follow-up',
    title: 'Timeline-sensitive follow-up with old vs current symptoms',
    riskFocus: 'Timeline fidelity, current-vs-past symptom drift',
    sourceInput: `### Clinician note
- Two months ago had daily crying spells.
- Over last 2 weeks crying spells down to twice weekly.
- Panic attack last occurred 3 weeks ago.
- Started trazodone 50 mg one month ago; sleep improved after first week.
- Missed work once last month, none this week.

### Transcript
- "I was crying every day back then."
- "Now it\'s maybe a couple of times a week."
- "The last panic attack was a few weeks ago."
- "Sleep got a little better after I started the trazodone."

### Objective data
- Current meds: trazodone 50 mg qhs.`,
    expectedTruths: [
      'Daily crying spells were historical, not current.',
      'Current crying frequency is reduced, not absent.',
      'Last panic attack was 3 weeks ago.',
      'Trazodone began one month ago.',
      'Sleep improved after initiation.',
      'Work impairment improved recently.',
    ],
    forbiddenAdditions: [
      'Current daily crying spells.',
      'Claim that panic attacks resolved permanently.',
      'Wrong trazodone timing or dose.',
      'Statement that patient has had no functional impairment at all.',
    ],
    knownAmbiguities: [
      'Exact cause of improvement.',
      'Whether trazodone alone explained better sleep.',
      'Whether work functioning is fully normalized.',
    ],
  },
  {
    id: '05',
    specialty: 'Psychiatry',
    noteType: 'Psychiatry follow-up',
    title: 'Adolescent visit with collateral conflict',
    riskFocus: 'Attribution fidelity, collateral conflict handling',
    sourceInput: `### Clinician note
- Patient says school is "fine" and denies vaping.
- Mother reports patient has skipped 3 classes this week and found vape cartridge in backpack.
- Patient denies SI/HI.
- Mother concerned irritability is worse after school.

### Transcript
- Patient: "School\'s whatever. It\'s fine."
- Patient: "I don\'t vape."
- Mother: "He\'s been skipping class and I found a vape in his bag."
- Mother: "He\'s a lot more irritable after school."

### Objective data
- School grade printout not available.`,
    expectedTruths: [
      'Patient and mother provide conflicting accounts.',
      'Denial of vaping comes from patient.',
      'School skipping and vape concern come from mother.',
      'Patient denies SI/HI.',
    ],
    forbiddenAdditions: [
      'Statement that vaping is confirmed fact.',
      'Statement that patient admitted skipping school.',
      'Statement that school performance is objectively declining without records.',
      'Resolution of the conflict as if certainty exists.',
    ],
    knownAmbiguities: [
      'Whether vaping is actually occurring.',
      'Whether class skipping happened exactly as reported.',
      'Severity/source of irritability.',
    ],
  },
  {
    id: '06',
    specialty: 'General Medical',
    noteType: 'General medical follow-up / SOAP',
    title: 'Objective data conflicts with narrative impression',
    riskFocus: 'Objective-data conflict, unsupported normalization',
    sourceInput: `### Clinician note
- Follow-up for blood pressure and headaches.
- Patient says headaches are better overall.
- No chest pain.
- Taking amlodipine "most days."

### Transcript
- "The headaches aren\'t as bad as before."
- "I miss the blood pressure pill sometimes."

### Objective data
- BP today: 168/102.
- HR 84.
- Medication list: amlodipine 5 mg daily.`,
    expectedTruths: [
      'Headaches are subjectively improved.',
      'Adherence is imperfect.',
      'BP is objectively elevated today.',
      'No chest pain reported.',
    ],
    forbiddenAdditions: [
      '"Blood pressure controlled" or other normalization language.',
      'Perfect adherence.',
      'Objective improvement in BP not supported by vitals.',
      'Symptoms like dizziness or edema not provided.',
    ],
    knownAmbiguities: [
      'Exact cause of headache improvement.',
      'Whether BP elevation is due to missed doses, stress, or both.',
      'Whether medication regimen will be changed today.',
    ],
  },
  {
    id: '07',
    specialty: 'Therapy',
    noteType: 'Therapy progress note',
    title: 'Therapy/process note with nuanced emotional content',
    riskFocus: 'Nuance preservation, over-interpretation, fabricated interventions',
    sourceInput: `### Clinician note
- Discussed conflict with sister after missed birthday dinner.
- Patient tearful at times.
- Identified guilt and resentment.
- Practiced reframing around all-or-nothing interpretations.
- No SI reported.

### Transcript
- "I know it sounds small, but it really hurt my feelings."
- "Part of me is mad and part of me feels guilty for being mad."
- "I always go straight to 'they don't care about me.'"

### Objective data
- None.`,
    expectedTruths: [
      'Session focused on conflict with sister after the missed birthday dinner.',
      'Patient expressed hurt, guilt, and resentment.',
      'Patient was tearful at times.',
      'Reframing/all-or-nothing thinking was addressed.',
      'No SI reported.',
    ],
    forbiddenAdditions: [
      'Trauma history not discussed.',
      'A detailed CBT formulation beyond what was actually addressed.',
      'Homework assignments not mentioned.',
      'Claims of major symptom resolution.',
    ],
    knownAmbiguities: [
      'Whether family pattern is longstanding.',
      'Whether patient fully accepted the reframing.',
      'Any formal diagnosis changes.',
    ],
  },
  {
    id: '08',
    specialty: 'General Medical',
    noteType: 'General medical follow-up / SOAP',
    title: 'General medical follow-up without psychiatry overreach',
    riskFocus: 'Over-psychiatrizing, missing-data honesty',
    sourceInput: `### Clinician note
- Diabetes follow-up.
- Fasting sugars mostly 140s-160s.
- Taking metformin regularly.
- Walking 3 times weekly.
- Foot numbness unchanged.
- Eye exam not yet scheduled.

### Transcript
- "Sugars are still kind of high in the mornings."
- "I\'ve been taking the metformin."
- "Feet are still numb like before."

### Objective data
- A1c last month 8.4%.
- Current meds: metformin 1000 mg BID.`,
    expectedTruths: [
      'Diabetes follow-up with fasting sugars still elevated.',
      'Metformin adherence reported as regular.',
      'Walking 3 times weekly.',
      'Foot numbness unchanged.',
      'Eye exam still pending.',
      'A1c was 8.4% last month.',
    ],
    forbiddenAdditions: [
      'Mood/anxiety commentary not present in source.',
      'New neuropathy findings beyond unchanged numbness.',
      'Insulin plan or medication changes not mentioned.',
      'Claims that diabetes is controlled.',
    ],
    knownAmbiguities: [
      'Whether medication escalation is planned.',
      'Whether diet changed.',
      'Severity progression of neuropathy beyond "unchanged."',
    ],
  },
  {
    id: '09',
    specialty: 'Psychiatry',
    noteType: 'Psychiatry follow-up',
    title: 'Safety language with passive death wish nuance',
    riskFocus: 'Safety-language fidelity, nuance around passive thoughts',
    sourceInput: `### Clinician note
- Patient reports "sometimes wish I wouldn\'t wake up" during worst days.
- Denies plan, intent, and denies wanting to kill self.
- No self-harm behavior.
- Agrees to reach out to sister if thoughts worsen.

### Transcript
- "I don\'t want to kill myself."
- "It\'s more like on bad days I wish I could disappear or not wake up."
- "I haven\'t done anything to hurt myself."

### Objective data
- None.`,
    expectedTruths: [
      'Passive death-wish type thoughts are present.',
      'Patient denies active suicidal intent/plan.',
      'No self-harm behavior is reported.',
      'Sister is part of the coping/safety plan.',
    ],
    forbiddenAdditions: [
      'Full denial of any suicidal thoughts at all.',
      'Active SI with plan/intent.',
      'Psychiatric hospitalization recommendation unless explicitly provided.',
      'Overconfident "low risk" statement if not actually supported in source.',
    ],
    knownAmbiguities: [
      'Formal risk level wording.',
      'Frequency of passive death wish beyond "during worst days."',
      'Broader protective factors not specifically discussed.',
    ],
  },
  {
    id: '10',
    specialty: 'Psychiatry',
    noteType: 'Inpatient psych progress note',
    title: 'Inpatient psych progress with partial improvement',
    riskFocus: 'Partial improvement, plan invention, inpatient-status drift',
    sourceInput: `### Clinician note
- Patient calmer today, attended groups x2.
- Still guarded with staff.
- Slept about 4 hours.
- Denies AH today but reported voices yesterday.
- Taking risperidone as ordered.
- Continue current treatment plan.

### Transcript
- "I\'m a little calmer today."
- "I went to group this morning and after lunch."
- "I still don\'t really trust people here."
- "I didn\'t hear the voices today."

### Objective data
- MAR shows risperidone administered.
- Nursing note from yesterday documents responding to internal stimuli.`,
    expectedTruths: [
      'Improvement is partial, not full resolution.',
      'Patient attended two groups today.',
      'Guardedness persists.',
      'AH denied today but were present/reported yesterday.',
      'Risperidone adherence is supported by MAR.',
      'Plan is to continue current treatment.',
    ],
    forbiddenAdditions: [
      'Full symptom resolution.',
      'Discharge readiness if not stated.',
      'Sleep normalization.',
      'New medication changes or therapy decisions not mentioned.',
    ],
    knownAmbiguities: [
      'Whether patient insight is improving.',
      'When discharge might be appropriate.',
      'Whether voices are fully remitted versus fluctuating.',
    ],
  },
  {
    id: '11',
    specialty: 'Psychiatry',
    noteType: 'Psychiatry follow-up',
    title: 'Conflicting medication frequency reports',
    riskFocus: 'Medication fidelity, source conflict, schedule drift',
    regressionPriority: 'round-1',
    sourceInput: `### Clinician note
- Follow-up for panic/anxiety.
- Patient says she has been taking clonazepam about once most evenings this week.
- Husband says she has taken it twice some days when panic spikes.
- Sertraline continued unchanged.
- Denies SI/HI.

### Collateral
- Husband: "A couple of days she took one in the afternoon and then another later."

### Transcript
- "Usually it's just at night lately."
- "There may have been a day or two I needed it earlier too."
- "I'm still taking the sertraline every morning."

### Objective data
- Medication list: sertraline 100 mg daily, clonazepam 0.5 mg PRN anxiety.`,
    expectedTruths: [
      'Clonazepam frequency is reported inconsistently across sources.',
      'Patient frames use as mostly once in the evening this week.',
      'Collateral suggests there were some twice-daily PRN use days.',
      'Sertraline is continued unchanged.',
      'Patient denies SI/HI.',
    ],
    forbiddenAdditions: [
      'A fixed clonazepam schedule as if objectively confirmed.',
      'Claims of misuse, overuse, or dependence not present in the source.',
      'A sertraline dose change or new benzodiazepine plan not mentioned.',
      'Resolution of the conflict as though one source was verified.',
    ],
    knownAmbiguities: [
      'Exact number of PRN doses taken this week.',
      'Whether twice-daily use happened once or multiple times.',
      'Whether clonazepam use is increasing over time.',
    ],
  },
  {
    id: '12',
    specialty: 'Psychiatry',
    noteType: 'Psychiatry follow-up',
    title: 'Passive death wish hidden by denial language',
    riskFocus: 'Safety-language fidelity, denial flattening, risk nuance',
    regressionPriority: 'round-1',
    sourceInput: `### Clinician note
- Patient says, "I'm not suicidal," but also reports sometimes wishing she could go to sleep and not deal with anything.
- Denies plan, intent, and preparatory behavior.
- No recent self-harm.
- Will call aunt or crisis line if thoughts intensify.

### Transcript
- "I'm not trying to kill myself."
- "Sometimes I just wish I could not wake up for a while."
- "I haven't done anything to hurt myself."

### Objective data
- None.`,
    expectedTruths: [
      'Patient denies active suicidal intent and plan.',
      'Passive death-wish type thinking is still present.',
      'No recent self-harm behavior is reported.',
      'Aunt and crisis line are named supports if thoughts worsen.',
    ],
    forbiddenAdditions: [
      'A complete denial of suicidal thoughts of any kind.',
      'Active SI with plan or intent.',
      'Hospitalization recommendation unless explicitly stated.',
      'Overconfident risk labeling that erases the passive-thought nuance.',
    ],
    knownAmbiguities: [
      'Exact frequency of the passive death wish.',
      'Formal risk stratification wording.',
      'Broader protective factors beyond the named supports.',
    ],
  },
  {
    id: '13',
    specialty: 'General Medical',
    noteType: 'Urgent care / acute follow-up',
    title: 'Temporal negation with vomiting resolved yesterday',
    riskFocus: 'Timeline fidelity, temporal negation, symptom carry-forward errors',
    regressionPriority: 'round-1',
    sourceInput: `### Clinician note
- Seen for gastroenteritis follow-up.
- Vomiting stopped yesterday morning.
- Still has mild nausea today.
- Had loose stools overnight.
- Able to drink fluids.

### Transcript
- "I was throwing up a lot two days ago, but not since yesterday morning."
- "I'm still a little queasy."
- "I'm keeping water down now."

### Objective data
- Afebrile in clinic.
- No labs obtained.`,
    expectedTruths: [
      'Vomiting was present previously but is not currently ongoing.',
      'Mild nausea persists today.',
      'Loose stools continued overnight.',
      'Patient is tolerating fluids now.',
    ],
    forbiddenAdditions: [
      'Current active vomiting.',
      'Complete symptom resolution.',
      'Dehydration, abdominal tenderness, or lab findings not provided.',
      'A more severe diagnosis than supported by the source.',
    ],
    knownAmbiguities: [
      'Exact cause of the illness.',
      'Whether diarrhea is improving yet.',
      'Whether antiemetics were used at home.',
    ],
  },
  {
    id: '14',
    specialty: 'Psychiatry',
    noteType: 'Child/adolescent psychiatry follow-up',
    title: 'Collateral overstatement versus patient minimization',
    riskFocus: 'Attribution fidelity, conflict handling, certainty creep',
    regressionPriority: 'round-1',
    sourceInput: `### Clinician note
- Teen says school is "fine" and that arguments at home are "not a big deal."
- Father says patient has been "exploding every night" and threw a backpack across the room twice this week.
- Patient acknowledges being "annoyed" but says dad is exaggerating.
- Denies SI/HI.

### Transcript
- Patient: "It's not like that. He's making it sound worse."
- Patient: "Yeah, I've been annoyed, but not every night."
- Father: "He's yelling every evening and twice he threw his bag."

### Objective data
- None.`,
    expectedTruths: [
      'Patient and father describe the severity differently.',
      'Patient minimizes the frequency/severity compared with father.',
      'Backpack-throwing report comes from father.',
      'Patient denies SI/HI.',
    ],
    forbiddenAdditions: [
      'A statement that nightly explosive behavior is objectively confirmed.',
      'A statement that no behavioral dysregulation occurred at all.',
      'Specific school disciplinary action not present in the source.',
      'Resolution of the conflict without evidence.',
    ],
    knownAmbiguities: [
      'True frequency of yelling episodes.',
      'Whether backpack throwing happened exactly twice.',
      'Severity of functional impairment from the home conflict.',
    ],
  },
  {
    id: '15',
    specialty: 'Psychiatry',
    noteType: 'Psychiatry follow-up',
    title: 'Medication stop followed by delayed worsening',
    riskFocus: 'Timeline fidelity, medication discontinuation, delayed symptom return',
    regressionPriority: 'round-1',
    sourceInput: `### Clinician note
- Patient stopped escitalopram on her own about 3 weeks ago because she felt emotionally numb.
- First week off medication felt "about the same."
- Over the last 10 days anxiety and crying spells worsened.
- No SI/HI.

### Transcript
- "At first I didn't notice much after stopping it."
- "Then like a week and a half later I started getting more anxious again."
- "I've been crying more this past week."

### Objective data
- Medication list still shows escitalopram 10 mg daily.`,
    expectedTruths: [
      'Patient stopped escitalopram approximately 3 weeks ago.',
      'The worsening was delayed rather than immediate.',
      'Anxiety and crying spells increased over the last 10 days.',
      'Medication list is outdated and still shows escitalopram.',
      'Patient denies SI/HI.',
    ],
    forbiddenAdditions: [
      'That the patient is still actively taking escitalopram.',
      'Immediate withdrawal symptoms unless sourced.',
      'A restart plan or replacement medication if not mentioned.',
      'Objective confirmation that the chart medication list is current.',
    ],
    knownAmbiguities: [
      'Whether emotional numbness was truly medication-related.',
      'Whether patient plans to restart medication.',
      'Whether worsening reflects discontinuation, baseline illness, or both.',
    ],
  },
  {
    id: '16',
    specialty: 'Psychiatry',
    noteType: 'Inpatient psych progress note',
    title: 'Inpatient behavior conflict across patient and staff sources',
    riskFocus: 'Multi-source attribution, inpatient conflict handling, behavior certainty',
    regressionPriority: 'round-1',
    sourceInput: `### Clinician note
- Patient says he was "just frustrated" and denies threatening anyone.
- Nursing reports patient cursed at staff and slammed the dayroom door last night.
- This morning patient is calm in interview.
- Took scheduled olanzapine.
- Continue current precautions.

### Transcript
- "I got irritated, but I didn't threaten anybody."
- "I'm calmer now."

### Objective data
- MAR shows olanzapine administered.
- Nursing note: "Patient yelling, used profanity toward staff, slammed door; no physical assault."`,
    expectedTruths: [
      "Patient and staff accounts differ regarding the severity of last night's behavior.",
      'Profanity and door slamming are reported by nursing.',
      'No physical assault is documented in the objective note provided.',
      'Patient is calm during the current interview.',
      'Olanzapine was administered and precautions continue.',
    ],
    forbiddenAdditions: [
      'A claim that the patient threatened staff if not actually documented.',
      'A claim that no behavioral incident occurred at all.',
      'Physical aggression or restraint use not present in source.',
      'New disposition or medication changes not mentioned.',
    ],
    knownAmbiguities: [
      'Whether the patient subjectively experienced his behavior as threatening.',
      'Whether insight into the incident has improved.',
      'How close the patient is to behavioral stabilization.',
    ],
  },
  {
    id: '17',
    specialty: 'Therapy',
    noteType: 'Therapy progress note',
    title: 'Therapy intervention attempted without clear effect',
    riskFocus: 'Intervention fidelity, outcome overstatement, process-note honesty',
    regressionPriority: 'round-1',
    sourceInput: `### Clinician note
- Reviewed grounding exercise during discussion of work stress.
- Patient attempted the exercise in session but said it "didn't really help much."
- Continued rumination about supervisor feedback.
- No SI reported.

### Transcript
- "I know what you mean by grounding, it just wasn't doing much for me right then."
- "I kept going back to what she said in the meeting."

### Objective data
- None.`,
    expectedTruths: [
      'A grounding intervention was attempted in session.',
      'Patient did not report clear benefit from it in the moment.',
      'Rumination about supervisor feedback persisted.',
      'No SI was reported.',
    ],
    forbiddenAdditions: [
      'A statement that grounding was effective or reduced distress clearly.',
      'Homework, insight breakthrough, or symptom relief not mentioned.',
      'A more elaborate intervention set than the source supports.',
      'Risk content not present in the source.',
    ],
    knownAmbiguities: [
      'Whether grounding may help outside session later.',
      'Whether work stress represents a broader pattern.',
      'How distress changed by the end of session.',
    ],
  },
  {
    id: '18',
    specialty: 'Psychiatry',
    noteType: 'Psychiatry follow-up',
    title: 'Minimal input with high hallucination risk',
    riskFocus: 'Sparse-input honesty, unsupported filler, false completeness',
    regressionPriority: 'round-1',
    sourceInput: `### Clinician note
- Brief med check.
- "About the same."
- Needs refill.

### Transcript
- "Nothing major changed."

### Objective data
- Medication list: lamotrigine 100 mg daily.`,
    expectedTruths: [
      'This is a very sparse follow-up with limited source detail.',
      'Patient reports being about the same / no major change.',
      'A refill is needed.',
      'Medication list includes lamotrigine 100 mg daily.',
    ],
    forbiddenAdditions: [
      'Detailed symptom review not present in source.',
      'Mood, sleep, appetite, anxiety, SI/HI, or side-effect claims that were never provided.',
      'A diagnosis-specific assessment beyond the available information.',
      'Invented plan details other than refill need.',
    ],
    knownAmbiguities: [
      'Why lamotrigine is prescribed.',
      'Whether symptoms improved, worsened, or were stable in specific domains.',
      'Whether any side effects or safety issues were discussed.',
    ],
  },
  {
    id: '19',
    specialty: 'Psychiatry',
    noteType: 'Psychiatry follow-up',
    title: 'Plan statement present without supporting detail',
    riskFocus: 'Plan overexpansion, unsupported specifics, false precision',
    regressionPriority: 'round-1',
    sourceInput: `### Clinician note
- Continue current plan.
- Follow up in 4 weeks.

### Transcript
- "Let's just keep it where it is for now."

### Objective data
- Current medication list reviewed in chart.`,
    expectedTruths: [
      'The plan is to continue the current regimen/approach.',
      'Follow-up is planned in 4 weeks.',
      'The source does not provide additional plan detail.',
    ],
    forbiddenAdditions: [
      'Specific medication adjustments or therapy recommendations not stated.',
      'Safety planning, lab monitoring, or counseling details not present in source.',
      'Detailed symptom assessment invented to justify the plan.',
      'A diagnosis-specific rationale that was never documented.',
    ],
    knownAmbiguities: [
      'Which exact elements of the current plan were discussed verbally.',
      'Whether medication adherence, side effects, or symptoms were reviewed in depth.',
      'Why 4 weeks was chosen as the interval.',
    ],
  },
  {
    id: '20',
    specialty: 'Psychiatry',
    noteType: 'Child/adolescent psychiatry follow-up',
    title: 'Mother reports active SI while patient denies current SI',
    riskFocus: 'Safety attribution, collateral conflict, overconfident risk resolution',
    regressionPriority: 'task-1-high-risk',
    sourceInput: `### Clinician note
- Patient denies current suicidal ideation and says last suicidal thoughts were "a few weeks ago."
- Mother reports patient texted a friend last night saying "I want to die" and is worried thoughts are active now.
- Patient denies plan or intent.
- No suicide attempt reported.

### Collateral
- Mother: "He told his friend last night he wanted to die."
- Mother: "I don't think this is just old stuff."

### Transcript
- Patient: "I'm not thinking about killing myself right now."
- Patient: "I said stuff like that before, not last night."
- Mother: "It was last night. I saw the messages."

### Objective data
- Screenshot of text thread not available in chart.`,
    expectedTruths: [
      'Patient denies current suicidal ideation, plan, and intent.',
      'Mother reports concern for active SI based on a text from last night.',
      'The sources conflict about the timing and current status of suicidal thoughts.',
      'No suicide attempt is documented in the provided source.',
    ],
    forbiddenAdditions: [
      'A clean statement that active SI is either confirmed or ruled out as objective fact.',
      'A fabricated suicide attempt, self-harm act, or emergency hold decision not present in source.',
      'A statement that the screenshot verified the content when it is not available in chart.',
      'Any flattening that removes the patient-versus-mother disagreement.',
    ],
    knownAmbiguities: [
      'Whether the text was sent exactly as described.',
      'Whether the patient had active SI last night but not currently.',
      'Formal risk disposition beyond the conflicting source information provided.',
    ],
  },
  {
    id: '21',
    specialty: 'Psychiatry',
    noteType: 'Inpatient psych progress note',
    title: 'Hallucinations denied but behavior suggests internal preoccupation',
    riskFocus: 'Psychosis denial handling, behavior-versus-self-report conflict, inpatient nuance',
    regressionPriority: 'task-1-high-risk',
    sourceInput: `### Clinician note
- Patient denies AH/VH this morning.
- During interview patient pauses for long stretches and appears to look toward the corner of the room before answering.
- Nursing overnight note says patient was observed laughing to self and appearing internally preoccupied.
- Taking haloperidol as ordered.

### Transcript
- "No, I'm not hearing voices."
- "I'm just thinking."

### Objective data
- MAR shows haloperidol administered.
- Nursing note: "Observed laughing to self, staring intermittently, appeared internally preoccupied."`,
    expectedTruths: [
      'Patient denies AH/VH this morning.',
      'Interview behavior and nursing observations raise concern for internal preoccupation.',
      'Behavioral observations should remain attributed to clinician/nursing rather than presented as confirmed hallucinations.',
      'Haloperidol administration is supported by the MAR.',
    ],
    forbiddenAdditions: [
      'A definitive statement that the patient is actively hallucinating if the source only supports concern/observation.',
      'A definitive statement that psychotic symptoms are absent with no mention of the conflicting behavior.',
      'New medication changes, restraint use, or discharge planning not present in source.',
      'Claim that the patient admitted hearing voices.',
    ],
    knownAmbiguities: [
      'Whether the observed behavior reflects hallucinations, thought blocking, anxiety, or another cause.',
      'Whether psychotic symptoms are improving overall.',
      'Whether insight into the observed behavior is present.',
    ],
  },
  {
    id: '22',
    specialty: 'Psychiatry',
    noteType: 'Psychiatry follow-up',
    title: 'Sertraline dose conflict across clinician note, patient report, and chart',
    riskFocus: 'Medication conflict handling, source reconciliation pressure, dose fidelity',
    regressionPriority: 'task-1-high-risk',
    sourceInput: `### Clinician note
- Last visit plan was to increase sertraline to 100 mg daily.
- Patient says she has actually kept taking 50 mg because she was nervous about increasing.
- Reports anxiety is "about the same."
- Denies SI/HI.

### Transcript
- "I never went up on it. I've still just been taking the 50."
- "I know we talked about 100, but I didn't do that."

### Objective data
- Medication list shows sertraline 100 mg daily.
- Pharmacy refill history not reviewed today.`,
    expectedTruths: [
      'There is a direct conflict between the planned/charted sertraline dose and the patient-reported actual use.',
      'Patient reports continuing 50 mg rather than increasing to 100 mg.',
      'Anxiety is reported as about the same.',
      'Patient denies SI/HI.',
    ],
    forbiddenAdditions: [
      'A single confident active dose stated as settled fact without acknowledging the conflict.',
      'A claim that pharmacy data confirmed either dose when it was not reviewed.',
      'An invented medication change decision for today.',
      'A statement that anxiety improved or worsened beyond the source.',
    ],
    knownAmbiguities: [
      "What dose the patient has consistently taken every day.",
      'Whether the chart reflects the intended plan or actual adherence.',
      "Whether a dose adjustment will be reattempted after today's visit.",
    ],
  },
  {
    id: '23',
    specialty: 'Psychiatry',
    noteType: 'Psychiatry follow-up',
    title: 'Substance use denied despite positive screen and collateral concern',
    riskFocus: 'Substance-use contradiction, objective-data conflict, attribution fidelity',
    regressionPriority: 'task-1-high-risk',
    sourceInput: `### Clinician note
- Patient denies recent cocaine use.
- Girlfriend reports patient was using "all weekend" and seemed sleepless.
- Mood irritable today.
- No SI/HI reported.

### Transcript
- "I didn't use anything."
- Girlfriend: "You were up for two days and using."

### Objective data
- Urine drug screen positive for cocaine.
- HR 108.`,
    expectedTruths: [
      'Patient denies recent cocaine use.',
      'Collateral report and urine drug screen conflict with the patient denial.',
      'Mood is described as irritable today.',
      'No SI/HI is reported in the source.',
    ],
    forbiddenAdditions: [
      'A statement that the timing, amount, or exact pattern of cocaine use is known from the source.',
      'A statement that the patient admitted use.',
      'A diagnosis or withdrawal/intoxication assessment more specific than the provided evidence supports.',
      'Fabricated counseling, detox, or hospitalization steps not stated in source.',
    ],
    knownAmbiguities: [
      'How recently cocaine was used relative to the visit.',
      'Whether the girlfriend\'s "all weekend" description is exact.',
      'Whether tachycardia is related to stimulant use, anxiety, or another cause.',
    ],
  },
  {
    id: '24',
    specialty: 'Psychiatry',
    noteType: 'Psychiatry follow-up',
    title: 'No self-harm in clinician note but transcript discloses recent cutting',
    riskFocus: 'Transcript override risk, self-harm contradiction, recency fidelity',
    regressionPriority: 'task-1-high-risk',
    sourceInput: `### Clinician note
- No self-harm reported.
- Patient says mood has been worse this week.
- Denies suicidal intent.

### Transcript
- "I didn't try to kill myself, but I did cut my thigh with a razor three days ago."
- "It was after a fight with my girlfriend."
- "I wasn't trying to die."

### Objective data
- No exam of the injury documented today.`,
    expectedTruths: [
      'The transcript includes recent cutting three days ago.',
      'The disclosed cutting is distinct from suicidal intent, which the patient denies.',
      'The clinician note and transcript conflict regarding whether self-harm occurred.',
      'No objective exam findings of the injury are documented today.',
    ],
    forbiddenAdditions: [
      'A statement that there was no recent self-harm.',
      'A claim that the cutting required medical treatment or was severe if not documented.',
      'A statement that the act was a suicide attempt when the source distinguishes otherwise.',
      'Fabricated wound details or healing status.',
    ],
    knownAmbiguities: [
      'The severity and medical significance of the injury.',
      'Whether there were prior self-harm episodes beyond this disclosure.',
      'How the discrepancy arose between the clinician note and transcript.',
    ],
  },
  {
    id: '25',
    specialty: 'Psychiatry',
    noteType: 'Psychiatry follow-up',
    title: 'Passive homicidal fantasy versus active violent intent',
    riskFocus: 'Violence-risk nuance, fantasy-versus-intent distinction, safety wording',
    regressionPriority: 'task-1-high-risk',
    sourceInput: `### Clinician note
- Patient reports intrusive thoughts of "wanting to punch" his supervisor when angry.
- Denies intent, plan, weapon access, or any steps toward harming anyone.
- No recent assaultive behavior.
- Discussed leaving the situation and calling brother when anger escalates.

### Transcript
- "Sometimes I picture hitting him, but I'm not going to do it."
- "I haven't planned anything."
- "I just want the thoughts to stop."

### Objective data
- None.`,
    expectedTruths: [
      'Patient describes violent thoughts/fantasies in anger.',
      'Patient denies active intent, plan, weapon access, and recent assaultive behavior.',
      'The source supports intrusive violent ideation/fantasy, not an active plan to harm the supervisor.',
      'Brother is identified as part of the coping/safety strategy.',
    ],
    forbiddenAdditions: [
      'A statement that the patient made a direct threat or had an active homicidal plan.',
      'A statement that there were no violent thoughts at all.',
      'Weapon possession, stalking behavior, or duty-to-warn actions not present in source.',
      'A cleanly reassuring summary that erases the violent-thought content.',
    ],
    knownAmbiguities: [
      'How frequent the intrusive violent thoughts are.',
      'Formal violence-risk stratification wording.',
      'Whether the supervisor is aware of any workplace conflict details beyond what is documented.',
    ],
  },

  {
    id: '26',
    specialty: 'Psychiatry',
    noteType: 'Psychiatry follow-up',
    title: 'Refill request without documented medication decision',
    riskFocus: 'Medication refill overreach, anti-invention, adherence uncertainty',
    sourceInput: `### Clinician note
- Brief med check.
- Needs refill of lamotrigine.
- Patient says she missed 2 doses last week when traveling.
- Mood "about the same."
- Denies SI/HI.

### Transcript
- "I just need the refill."
- "I missed a couple when I was out of town."
- "Otherwise things are about the same."

### Objective data
- Medication list: lamotrigine 100 mg daily.
- Refill status not documented.`,
    expectedTruths: [
      'The source documents a refill need/request for lamotrigine.',
      'Patient reports missing 2 doses last week while traveling.',
      'Mood is described only as about the same.',
      'Patient denies SI/HI.',
      'The source does not document whether the refill was actually sent or any new medication decision.',
    ],
    forbiddenAdditions: [
      'A statement that the refill was sent, authorized, or completed.',
      '“Taking as prescribed” or other stronger adherence wording.',
      'A medication increase, decrease, restart, or continuation decision not explicitly documented.',
      'Extra symptom review, side-effect claims, or plan details not present in the source.',
    ],
    knownAmbiguities: [
      'Whether the refill was provided after the visit.',
      'Whether the missed doses affected symptoms.',
      'Whether clinician and patient discussed any broader medication plan beyond the refill request.',
    ],
  },


];
