# Provisional Psych Documentation Criteria Framework

## Status
**Provisional working document.**

This framework is intended to guide product design, templates, reminders, and evaluation for the psych-first wedge of the Clinical Documentation Transformer.

It is based on:
- current prototype note structures
- common psychiatric documentation norms
- practical inpatient psych workflow expectations

It is **not yet source-validated against a completed textbook/reference review** and should not be treated as a final authority document.

Use it as:
- a product criteria framework
- a template design guide
- a copilot/reminder design input
- an evaluation checklist draft

Do **not** use it as a substitute for official institutional documentation policy, supervision, or payer/regulatory guidance.

---

## Core psych documentation rules across note types

### Always true
- Do not invent facts.
- Prefer omission, uncertainty, or explicit flags over unsupported detail.
- Preserve direct provider wording when it is already clinically usable.
- Preserve explicit dates, timeline markers, and admission/discharge context.
- Keep patient-reported, collateral-reported, observed, and objective information conceptually distinct where possible.
- If a detail is not documented, either omit it or flag it rather than filling it in.
- Avoid generating normal findings unless they are explicitly documented.
- Preserve risk language, inpatient necessity logic, and disposition logic only when supported by the source.

### High-risk documentation failure modes
- inventing normal MSE findings
- inventing safety denials
- implying improvement not supported by source
- implying treatment response too early
- inventing side-effect/tolerability language
- blurring prior-day content with current-day content
- converting sparse source material into broad diagnostic certainty

### Product implication
For every psych note type, the app should know:
1. required sections
2. commonly expected but not always required content
3. high-risk omissions worth flagging
4. content that must be source-supported before inclusion

---

## 1. Inpatient Psychiatry Initial Adult Evaluation

### Purpose
To document admission-level psychiatric assessment, current presentation, relevant history, risk, initial formulation, and initial treatment plan.

### Required sections
1. Reason for Admission / Chief Concern
2. History of Present Illness
3. Psychiatric History
4. Substance Use History
5. Social / Relevant Background
6. Mental Status Exam
7. Safety / Risk
8. Assessment
9. Plan

### Should usually include when available
- admission trigger / precipitating event
- symptom chronology
- prior hospitalizations
- prior suicide attempts / self-harm history
- medication history and adherence issues
- substance-use pattern and recent use
- relevant trauma/legal/social context
- current risk factors and protective factors
- disposition rationale / need for inpatient treatment

### High-risk omissions to flag
- reason for admission unclear
- current symptom chronology unclear
- prior psychiatric history absent or unclear
- substance-use history absent or unclear
- safety/risk content absent or underdeveloped
- MSE sparse or missing
- plan/disposition rationale unclear

### Must not be invented
- prior diagnoses
- prior hospitalizations
- trauma history
- legal history
- family history
- substance use pattern
- MSE normals
- safety denials / protective factors
- medication response

### Product reminders should ask about
- what directly led to admission
- what symptoms are current versus historical
- prior attempts/self-harm history if relevant
- recent substance use and its timing
- whether inpatient care rationale is clearly stated

---

## 2. Inpatient Psychiatry Initial Adolescent Evaluation

### Purpose
To document adolescent admission-level psychiatric assessment with stronger attention to guardian collateral, family/school context, supervision, and developmental relevance.

### Required sections
1. Reason for Admission / Chief Concern
2. History of Present Illness
3. Guardian Collateral
4. Psychiatric / Substance History
5. Social History
6. Mental Status Exam
7. Safety / Risk
8. Assessment
9. Plan

### Should usually include when available
- guardian account of presenting concerns
- school/behavior/attendance context
- custody or supervision context
- family conflict/support context
- developmental or social context relevant to presentation
- adolescent-specific safety concerns
- consent/guardian involvement context when relevant

### High-risk omissions to flag
- guardian/collateral context missing when relevant
- school functioning absent when obviously relevant
- supervision/custody context absent in a safety-sensitive case
- safety/risk context underdeveloped
- MSE sparse or missing
- adolescent social context too thin to support formulation

### Must not be invented
- custody arrangements
- developmental history
- trauma history
- school performance details
- guardian views
- family structure/context
- adolescent risk denials or normal findings

### Product reminders should ask about
- what the guardian or collateral actually said
- school and supervision context
- family/custody context if relevant
- whether risk and supervision after discharge are clearly documented

---

## 3. Inpatient Psychiatry Progress Note

### Purpose
To document interval change, current symptoms, current risk, medication/tolerability issues, ongoing inpatient necessity, and current plan.

### Required sections
1. Date / Interval Update
2. Symptom Review
3. Medications / Changes / Side Effects
4. Mental Status / Observations
5. Insight / Judgment
6. Safety / Risk
7. Assessment
8. Plan

### Should usually include when available
- interval events since last note
- sleep/appetite/engagement/milieu participation
- symptom persistence vs improvement vs worsening
- medication changes
- tolerability or side effects if discussed
- current risk/discharge-readiness language
- response to groups/treatment engagement when source supports it

### High-risk omissions to flag
- interval update missing
- medication/tolerability status unclear when meds discussed
- MSE/observational content too thin
- safety/risk status unclear
- continued inpatient rationale unclear when patient remains admitted
- discharge readiness/barriers unclear when relevant

### Must not be invented
- improvement
- worsening
- side effects
- tolerability
- adherence
- normal MSE findings
- group participation
- readiness for discharge

### Product reminders should ask about
- what changed since last note
- whether medications were changed and how tolerated
- whether patient remains a discharge risk/barrier and why
- whether current symptoms are persistent, improved, or worsened based only on the source

---

## 4. Inpatient Psychiatry Day Two Note

### Purpose
To document reassessment on the day after admission, focusing on persistent symptoms, early response/tolerability, diagnostic clarification, and continued inpatient necessity.

### Required sections
1. Date / Day Two Update
2. Persistent Symptoms / Current Clinical Status
3. Medications / Early Tolerability / Side Effects
4. Mental Status / Observations
5. Safety / Risk
6. Assessment
7. Plan

### Should usually include when available
- what remains the same since admission
- what changed since admission
- early medication initiation/tolerability
- explicit statement if therapeutic response is too early to assess
- current risk and discharge readiness (or lack thereof)
- working diagnostic clarification if source supports it

### High-risk omissions to flag
- failure to separate admission baseline from current day status
- implied medication response too early
- unclear current risk status
- lack of rationale for continued inpatient treatment
- insufficient current-day reassessment language

### Must not be invented
- therapeutic benefit too early after med start
- stabilizing/improving language without source support
- current-day denials not documented that day
- side effects or tolerability if not documented

### Product reminders should ask about
- whether symptoms are meaningfully changed yet
- whether response is truly assessable yet
- whether current-day status is actually documented separately from admission context
- whether ongoing inpatient need is clearly documented

---

## 5. Inpatient Psychiatry Discharge Summary

### Purpose
To document why the patient was admitted, what happened during the hospital stay, discharge condition/status, medication/disposition details, and follow-up plan.

### Required sections
1. Reason for Admission
2. Hospital Course
3. Behavioral / Symptom Course
4. Discharge Status
5. Discharge Medications
6. Follow Up
7. Discharge Instructions

### Should usually include when available
- admission symptoms / trigger
- notable treatment course or interventions
- whether symptoms improved, persisted, or remained partially improved
- discharge mental/safety status if documented
- medication changes at discharge
- follow-up appointments or disposition destination
- return precautions / instructions when documented

### High-risk omissions to flag
- reason for admission unclear
- hospital course too vague
- discharge condition/safety status unclear
- discharge medication list absent or incomplete
- follow-up/disposition absent or vague
- instruction/return-precaution content absent when expected

### Must not be invented
- symptom resolution
- safety/stability at discharge
- medication response/tolerability
- follow-up appointments
- housing/disposition details
- discharge instructions
- risk denials at discharge

### Product reminders should ask about
- what specifically improved or did not improve
- why discharge is appropriate now, if it is
- exactly what medications/follow-up/disposition are documented
- whether discharge safety status is actually documented

---

## Mental Status Exam guidance (provisional)

### Principle
MSE content should be documented only to the extent supported by the source.
Do not auto-fill normal findings.

### Common MSE domains the system should recognize when present
- appearance
- behavior / psychomotor activity
- attitude / engagement
- speech
- mood
- affect
- thought process
- thought content
- perception
- orientation / cognition
- insight
- judgment

### Product rule
If source support is thin:
- keep the MSE brief
- flag missing domains rather than inventing them

---

## Safety / Risk guidance (provisional)

### Common elements when supported
- suicidal ideation
- homicidal ideation
- self-harm behavior/history
- psychosis affecting safety
- impulsivity/aggression
- overdose context
- ability to contract for safety only if actually documented and appropriate in context
- access-to-means considerations if documented
- inpatient necessity / discharge safety logic

### Product rule
Do not assume:
- denial of SI/HI/AVH
- protective factors
- access-to-means status
- readiness for discharge

Flag them if they matter and are absent.

---

## How the app should use this framework

### Templates
Use this framework to decide:
- section order
- expected content emphasis
- wedge-specific reminder logic

### Copilot / reminder panel
Use this framework to suggest:
- likely missing high-risk areas
- current-day clarification needs
- admission/discharge rationale gaps
- medication/tolerability questions
- risk-documentation gaps

### Evaluation
Use this framework to judge:
- whether required sections were meaningfully supported
- whether unsupported detail was added
- whether high-risk omissions were flagged rather than invented

---

## Next step after this provisional version
Replace or validate this framework with actual source-backed references from:
- psychiatry documentation texts
- clinical interviewing references
- accepted educational/training standards
- payer/regulatory documentation expectations where relevant

Until then, this document is a structured internal design tool — not a final authority source.
