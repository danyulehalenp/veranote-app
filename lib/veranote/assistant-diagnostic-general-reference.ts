import type { AssistantResponsePayload } from '@/types/assistant';

type DiagnosticReferenceEntry = {
  id: string;
  matches: RegExp[];
  summary: string;
};

function normalizeMessage(message: string) {
  return message.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
}

function diagnosticSummary(summary: string): AssistantResponsePayload {
  return {
    message: `Diagnostic reference summary: ${summary}`,
    suggestions: [],
    answerMode: 'direct_reference_answer',
  };
}

const DIAGNOSTIC_REFERENCE_ENTRIES: DiagnosticReferenceEntry[] = [
  {
    id: 'major-depressive-episode',
    matches: [/major depressive episode|mde\b/],
    summary: 'A major depressive episode is a sustained depressive syndrome, usually anchored by depressed mood and/or loss of interest plus additional depressive symptoms, impairment, and about a 2-week duration. Use current diagnostic references and clinical context before assigning a diagnosis.',
  },
  {
    id: 'schizophrenia-duration',
    matches: [/how long.*schizophrenia|symptoms last.*schizophrenia|schizophrenia.*duration|duration requirement.*schizophrenia|diagnosis of schizophrenia|criteria for schizophrenia/],
    summary: 'Schizophrenia generally requires a chronic psychotic illness pattern with continuous signs for about 6 months, including an active-symptom phase. Shorter courses raise alternatives such as brief psychotic disorder or schizophreniform disorder.',
  },
  {
    id: 'bipolar-ii-hypomania',
    matches: [/bipolar ii.*hypomania|hypomania.*bipolar ii|duration requirement.*hypomania/],
    summary: 'Hypomania in bipolar II is usually summarized as a distinct elevated, expansive, or irritable mood and increased-energy episode lasting at least 4 days, without the marked impairment or hospitalization typical of mania.',
  },
  {
    id: 'adhd-core',
    matches: [/core symptoms of adhd|adhd.*core symptoms/],
    summary: 'ADHD centers on persistent inattention and/or hyperactivity-impulsivity that causes impairment across settings and is developmentally inappropriate. Developmental history and cross-setting impairment matter more than a single symptom snapshot.',
  },
  {
    id: 'panic-disorder',
    matches: [/how many symptoms.*panic disorder|diagnosis of panic disorder|criteria for panic disorder|panic disorder.*diagnos/],
    summary: 'Panic disorder involves recurrent unexpected panic attacks plus ongoing concern about additional attacks or behavior changes related to the attacks, commonly summarized around a 1-month post-attack persistence anchor.',
  },
  {
    id: 'social-anxiety-vs-agoraphobia',
    matches: [/social anxiety.*agoraphobia|agoraphobia.*social anxiety|difference between social anxiety and agoraphobia/],
    summary: 'Social anxiety is primarily fear of scrutiny, embarrassment, or negative evaluation in social situations. Agoraphobia is fear or avoidance of situations where escape or help may feel difficult if panic-like or incapacitating symptoms occur.',
  },
  {
    id: 'gad-timeframe',
    matches: [/time frame.*generalized anxiety|time frame.*\bgad\b|generalized anxiety disorder.*time frame|what is generalized anxiety disorder|diagnosis of generalized anxiety disorder|criteria for generalized anxiety disorder/],
    summary: 'Generalized anxiety disorder is usually summarized as excessive, hard-to-control worry with associated tension or cognitive/physical symptoms over about 6 months, with impairment and exclusion of better explanations.',
  },
  {
    id: 'borderline-personality',
    matches: [/borderline personality|bpd\b/],
    summary: 'Borderline personality disorder is a pervasive pattern involving instability in relationships, self-image, affect regulation, and impulsivity, often with self-harm or abandonment-related crises. Avoid applying the label from one crisis encounter without longitudinal context.',
  },
  {
    id: 'persistent-depressive-disorder',
    matches: [/persistent depressive disorder|dysthymia/],
    summary: 'Persistent depressive disorder is a chronic depressive condition with depressed mood most days over a long duration, often less episodic than major depression. Chronicity and functional impact are the key reference anchors.',
  },
  {
    id: 'manic-episode',
    matches: [/manic episode|constitutes a manic/],
    summary: 'A manic episode is a distinct period of abnormally elevated, expansive, or irritable mood with increased energy or activity and clinically significant impairment, psychosis, or hospitalization-level severity. Substance, medication, and medical causes must remain in the differential when relevant.',
  },
  {
    id: 'anorexia-nervosa',
    matches: [/anorexia nervosa/],
    summary: 'Anorexia nervosa is summarized by restrictive intake leading to significantly low weight, intense weight or shape concerns, and disturbance in how body weight or shape is experienced. Medical risk and nutritional status require careful assessment.',
  },
  {
    id: 'bulimia-vs-binge-eating',
    matches: [/bulimia.*binge eating|binge eating.*bulimia/],
    summary: 'Bulimia nervosa involves binge eating with recurrent compensatory behaviors such as purging, fasting, or excessive exercise. Binge eating disorder involves binge episodes without the recurring compensatory behavior pattern.',
  },
  {
    id: 'ptsd-symptoms',
    matches: [/what is ptsd|define ptsd|ptsd definition|symptoms of ptsd|ptsd symptoms/],
    summary: 'PTSD is summarized around trauma exposure followed by intrusion symptoms, avoidance, negative mood or cognition changes, and arousal/reactivity symptoms with impairment over time. Do not infer PTSD from trauma exposure alone.',
  },
  {
    id: 'mixed-features',
    matches: [/mixed feature|mixed features|mixed specifier/],
    summary: 'A mixed-features specifier flags clinically meaningful symptoms from the opposite mood pole during a mood episode, such as manic-spectrum symptoms during depression or depressive symptoms during mania or hypomania. It should not be used as a standalone diagnosis.',
  },
  {
    id: 'schizoaffective-vs-bipolar-psychosis',
    matches: [
      /difference between.*schizoaffective.*bipolar.*psychosis/,
      /difference between.*bipolar.*psychosis.*schizoaffective/,
      /schizoaffective.*(?:vs|versus|difference).*bipolar.*psychosis/,
      /bipolar.*psychosis.*(?:vs|versus|difference).*schizoaffective/,
      /schizoaffective.*bipolar with psychosis/,
      /bipolar with psychosis.*schizoaffective/,
    ],
    summary: 'The practical distinction is whether psychosis occurs outside mood episodes. In bipolar disorder with psychotic features, hallucinations or delusions are tied to manic or depressive episodes. In schizoaffective disorder, there is also a meaningful period of psychosis without prominent mood symptoms, while mood episodes remain a major part of the overall illness course. A safe differential still needs longitudinal history, collateral, substance and medication review, medical rule-outs, impairment, and current diagnostic references.',
  },
  {
    id: 'schizoaffective',
    matches: [
      /how is schizoaffective.*diagnosed/,
      /schizoaffective disorder.*diagnos/,
      /diagnosis of schizoaffective/,
      /criteria for schizoaffective/,
      /schizoaffective.*criteria/,
      /dsm.*criteria.*schizoaffective/,
      /schizoaffective.*dsm.*criteria/,
    ],
    summary: 'Schizoaffective disorder is best summarized by timeline: schizophrenia-spectrum psychosis plus major mood-episode evidence, with psychosis also occurring for a meaningful period outside mood episodes. Use this as a high-level DSM-oriented summary, not verbatim DSM criteria, and verify against current diagnostic references before assigning the diagnosis.',
  },
  {
    id: 'cyclothymic',
    matches: [/cyclothymic|cyclothymia/],
    summary: 'Cyclothymic disorder is a chronic fluctuating mood pattern with many hypomanic and depressive symptoms that do not meet full episode thresholds, persisting over a long duration. It requires longitudinal pattern evidence.',
  },
  {
    id: 'somatic-symptom',
    matches: [/somatic symptom/],
    summary: 'Somatic symptom disorder centers on distressing physical symptoms plus excessive thoughts, feelings, or behaviors about those symptoms. The diagnosis is not simply unexplained symptoms, and medical evaluation context remains important.',
  },
  {
    id: 'intellectual-disability',
    matches: [/intellectual disability|diagnostic threshold.*intellectual/],
    summary: 'Intellectual disability is based on deficits in intellectual functioning and adaptive functioning with onset during development. Severity is generally framed by adaptive functioning needs rather than an IQ number alone.',
  },
  {
    id: 'autism-severity',
    matches: [/autism spectrum.*severity|autism.*graded by severity/],
    summary: 'Autism spectrum disorder severity is commonly described by the level of support needed for social communication and restricted or repetitive behavior domains. Severity language should be functional and context-specific.',
  },
  {
    id: 'oppositional-defiant',
    matches: [/oppositional defiant|odd\b/],
    summary: 'Oppositional defiant disorder is summarized as a persistent pattern of angry or irritable mood, argumentative or defiant behavior, or vindictiveness that causes impairment. Context, development, trauma, mood disorders, and environment should be considered.',
  },
  {
    id: 'conduct-vs-antisocial',
    matches: [/conduct disorder.*antisocial|antisocial.*conduct disorder/],
    summary: 'Conduct disorder is a childhood or adolescent pattern of violating others’ rights or major rules. Antisocial personality disorder is an adult diagnosis that requires evidence of earlier conduct-type history.',
  },
  {
    id: 'substance-use-disorder',
    matches: [/substance use disorder|sud\b/],
    summary: 'Substance use disorder is summarized as a problematic pattern of substance use causing impairment or distress across behavioral, control, craving, social, risky-use, and physiologic domains. Severity depends on how many domains are present.',
  },
  {
    id: 'adjustment-disorder',
    matches: [/adjustment disorder/],
    summary: 'Adjustment disorder involves emotional or behavioral symptoms in response to an identifiable stressor, with distress or impairment beyond expected coping but not better explained by another disorder. Timing relative to the stressor is central.',
  },
  {
    id: 'delirium',
    matches: [/symptoms of delirium|delirium symptoms|what are.*delirium/],
    summary: 'Delirium is an acute disturbance in attention and awareness with fluctuating cognition, usually caused by a medical condition, substance, medication, withdrawal, or multiple contributors. It should trigger medical-cause evaluation rather than psychiatric-only framing.',
  },
  {
    id: 'tourette',
    matches: [/diagnostic criteria.*tourette|criteria for tourette|tourette.*diagnos|how is tourette/],
    summary: 'Tourette syndrome is summarized as multiple motor tics plus at least one vocal tic with onset in childhood and persistence over time. Distinguish tics from stereotypies, compulsions, medication effects, and neurologic causes.',
  },
  {
    id: 'dissociative-identity',
    matches: [/dissociative identity/],
    summary: 'Dissociative identity disorder involves disruption in identity with distinct identity states or possession-like experiences plus recurrent memory gaps, with distress or impairment. Rule out substances, seizures, cultural practices, and other explanations.',
  },
  {
    id: 'ocd',
    matches: [/obsessive-compulsive disorder diagnosis|ocd diagnosis|ocd.*diagnos|what constitutes.*obsessive-compulsive|criteria for obsessive-compulsive|criteria for ocd/],
    summary: 'Obsessive-compulsive disorder involves obsessions, compulsions, or both that are time-consuming or impairing. The key distinction is intrusive unwanted thoughts and/or repetitive behaviors performed to reduce distress or prevent feared outcomes.',
  },
  {
    id: 'body-dysmorphic',
    matches: [/body dysmorphic/],
    summary: 'Body dysmorphic disorder involves preoccupation with perceived appearance flaws that are not observable or appear slight to others, along with repetitive checking, comparing, grooming, or reassurance-seeking behaviors.',
  },
  {
    id: 'hoarding',
    matches: [/hoarding disorder|hoarding defined/],
    summary: 'Hoarding disorder involves persistent difficulty discarding possessions, perceived need to save them, distress with discarding, and clutter that compromises living areas or functioning. Safety and housing risks may be clinically important.',
  },
  {
    id: 'narcissistic-personality',
    matches: [/narcissistic personality/],
    summary: 'Narcissistic personality disorder is summarized as a pervasive pattern involving grandiosity, need for admiration, and impaired empathy, with functional or relational consequences. Avoid using it as shorthand for difficult behavior without longitudinal evidence.',
  },
  {
    id: 'phq-9',
    matches: [/phq-?9/],
    summary: 'The PHQ-9 is a depression symptom screening and severity-tracking tool. It supports measurement-based care but does not replace a full diagnostic assessment.',
  },
  {
    id: 'gad-7',
    matches: [/gad-?7/],
    summary: 'The GAD-7 is a brief anxiety symptom screening and severity-tracking tool, not a standalone diagnostic test. Interpret it with clinical interview, impairment, differential diagnosis, and safety context.',
  },
  {
    id: 'moca',
    matches: [/moca/],
    summary: 'MoCA is a cognitive screening tool, and scores below the usual normal cutoff can suggest cognitive impairment but are not diagnostic by themselves. Education, language, sensory issues, and baseline function matter.',
  },
  {
    id: 'light-therapy-sad',
    matches: [/light therapy.*seasonal|seasonal affective/],
    summary: 'Light therapy is an evidence-supported option for seasonal-pattern depression for some patients. Screen for bipolar disorder, eye risk, photosensitizing medications, and clinical fit before applying it.',
  },
  {
    id: 'tms-ocd',
    matches: [/tms.*ocd/],
    summary: 'TMS has FDA-cleared protocols for OCD in selected contexts, and it is also used for treatment-resistant depression. Device, protocol, indication, and local availability determine applicability.',
  },
  {
    id: 'ect-mechanism',
    matches: [/mechanism.*ect|ect mechanism/],
    summary: 'ECT works through a controlled therapeutic seizure under anesthesia, producing neurobiologic effects on mood, psychosis, catatonia, and severe depression circuits. It is a procedure-based treatment, not a medication mechanism.',
  },
  {
    id: 'vns-depression',
    matches: [/vagus nerve stimulation|vns/],
    summary: 'Vagus nerve stimulation has an FDA-approved or cleared role for treatment-resistant depression in selected adults, depending on device and indication. It is usually considered after multiple inadequate treatment responses.',
  },
  {
    id: 'psychotherapy-mild-mdd',
    matches: [/psychotherapy.*mild mdd|mild mdd.*psychotherapy|psychotherapy.*medication/],
    summary: 'Psychotherapy can be as effective as medication for many patients with mild depression, especially when patient preference and access align. Severity, suicidality, psychosis, bipolarity, and functional impairment change the treatment frame.',
  },
  {
    id: 'cbt-vs-dbt',
    matches: [/cbt.*dbt|dbt.*cbt/],
    summary: 'CBT focuses on identifying and changing unhelpful thoughts and behaviors. DBT includes CBT-based skills plus mindfulness, emotion regulation, distress tolerance, and interpersonal effectiveness, often used for high-emotion or self-harm-risk presentations.',
  },
  {
    id: 'emdr-ptsd',
    matches: [/emdr.*ptsd|ptsd.*emdr/],
    summary: 'EMDR is an evidence-supported trauma-focused psychotherapy used for PTSD. It should be delivered by trained clinicians with attention to stabilization, dissociation risk, and patient readiness.',
  },
  {
    id: 'exercise-anxiety',
    matches: [/exercise.*anxiety/],
    summary: 'Exercise can improve anxiety symptoms for many patients and can complement psychotherapy or medication. It should be individualized around medical limitations, panic sensitivity, and functional goals.',
  },
  {
    id: 'herbal-supplement-depression',
    matches: [/herbal supplement.*depression|supplement.*depression/],
    summary: 'Some supplements are marketed for depression, but evidence and product quality vary, and interactions can be clinically important. St. John’s wort is a common example with meaningful serotonergic and CYP interaction risks.',
  },
  {
    id: 'caffeine-lithium',
    matches: [/caffeine.*lithium|lithium.*caffeine/],
    summary: 'Caffeine changes can affect lithium levels indirectly through hydration, renal handling, and intake patterns; abrupt caffeine reduction may raise lithium exposure in some patients. Check level timing, renal function, hydration, and consistency of caffeine use.',
  },
  {
    id: 'sleep-deprivation-mania',
    matches: [/sleep deprivation.*manic|sleep deprivation.*mania|manic episode.*sleep/],
    summary: 'Sleep deprivation can precipitate or worsen manic-spectrum symptoms in vulnerable patients. It should raise clinical concern but does not by itself establish bipolar disorder.',
  },
  {
    id: 'ham-d',
    matches: [/ham-d|hamd|hamilton depression/],
    summary: 'The HAM-D is a clinician-rated depression scale commonly used in clinical trials and measurement-based care. It tracks symptom severity and change rather than serving as a standalone diagnosis.',
  },
  {
    id: 'schizophrenia-prevalence',
    matches: [/prevalence of schizophrenia/],
    summary: 'Schizophrenia is relatively uncommon, often summarized around roughly 1 percent lifetime prevalence depending on population and method. Use current epidemiologic sources for exact estimates.',
  },
  {
    id: 'women-depression',
    matches: [/women.*depression|depression.*women/],
    summary: 'Women are generally diagnosed with depression more often than men in epidemiologic studies. Interpretation should consider biological, social, trauma, access, and reporting factors.',
  },
  {
    id: 'bipolar-age-onset',
    matches: [/average age of onset.*bipolar|bipolar.*age of onset/],
    summary: 'Bipolar disorder often begins in late adolescence or early adulthood, though onset can occur earlier or later. A precise age estimate depends on study design and bipolar subtype.',
  },
  {
    id: 'schizophrenia-genetic',
    matches: [/genetic component.*schizophrenia|schizophrenia.*genetic/],
    summary: 'Schizophrenia has a genetic contribution, but it is not determined by one gene and environment also matters. Family history changes risk but does not diagnose the condition.',
  },
  {
    id: 'vitamin-d-depression',
    matches: [/vitamin d.*depress/],
    summary: 'Vitamin D deficiency can overlap with fatigue or low mood and may contribute to nonspecific symptoms, but it is not usually treated as a sole explanation for depressive disorder. Check labs and broader clinical context.',
  },
  {
    id: 'folic-acid-depression',
    matches: [/folic acid.*depression|folate.*depression/],
    summary: 'Folate status may be relevant to depressive symptoms and antidepressant response in selected patients, but folic acid is not a standalone depression treatment. Consider nutrition, labs, pregnancy context, and medication interactions.',
  },
  {
    id: 'omega-3-mood',
    matches: [/omega-?3.*mood|mood.*omega-?3/],
    summary: 'Omega-3 evidence for mood symptoms is mixed, with some data suggesting modest benefit in selected depressive presentations. It should be framed as adjunctive and checked for bleeding-risk or product-quality concerns.',
  },
  {
    id: 'melatonin-children',
    matches: [/melatonin.*children|children.*melatonin/],
    summary: 'Melatonin is commonly used for pediatric sleep timing problems, but product quality, timing, dose, neurodevelopmental context, and behavioral sleep interventions matter. Use pediatric guidance rather than assuming it is universally benign.',
  },
  {
    id: 'valerian-anxiety',
    matches: [/valerian.*anxiety/],
    summary: 'Evidence for valerian in anxiety is limited and product quality varies. Sedation and CNS-depressant interactions are the main practical cautions.',
  },
  {
    id: 'black-box-warning',
    matches: [/black box|boxed warning/],
    summary: 'A boxed warning is the strongest FDA-required warning in prescription labeling, used for serious or life-threatening risks. It highlights risk but does not automatically mean a medication can never be used.',
  },
  {
    id: 'psychiatrist-medical-conditions',
    matches: [/psychiatrist prescribe.*medical|psychiatrist.*medical conditions/],
    summary: 'Psychiatrists are physicians and may prescribe for medical conditions within their training, scope, licensing, and care setting. Complex nonpsychiatric conditions are usually coordinated with primary care or specialty clinicians.',
  },
  {
    id: 'telepsychiatry',
    matches: [/telepsychiatry/],
    summary: 'Telepsychiatry can be effective for many assessments and follow-ups when privacy, safety planning, technology, licensing, and emergency backup are handled. It may be less suitable when hands-on exam or immediate containment is needed.',
  },
  {
    id: 'psychiatric-np',
    matches: [/psychiatric nurse practitioner|nurse practitioner/],
    summary: 'A psychiatric nurse practitioner evaluates and treats mental health conditions, often including diagnosis, psychotherapy-informed care, and medication management depending on state scope and practice setting.',
  },
  {
    id: 'pharmacists-med-management',
    matches: [/pharmacists?.*medication management|pharmacist.*psych/],
    summary: 'Pharmacists can support psychiatric medication management through reconciliation, interaction checks, adherence support, monitoring recommendations, and collaborative practice where allowed. Prescribing authority depends on jurisdiction and agreement structure.',
  },
  {
    id: 'schizophrenia-cure',
    matches: [/cure for schizophrenia|schizophrenia.*cure/],
    summary: 'There is no simple cure for schizophrenia, but symptoms and functioning can improve substantially with treatment, psychosocial support, relapse prevention, and coordinated care. Recovery goals should stay individualized.',
  },
];

const DIAGNOSTIC_REFERENCE_TRIGGER =
  /\b(criteria for|dsm|diagnosis of|diagnostic criteria|diagnostic threshold|duration requirement|time frame|difference between|defined|definition of|specifier|graded by severity|what constitutes|what is the phq-?9|what is the gad-?7|what is the moca|what is the ham-d|screening tool|mechanism of action for ect|vagus nerve stimulation|light therapy|tms|emdr|cbt|dbt|telepsychiatry|black box|boxed warning|cure for schizophrenia|prevalence of schizophrenia|age of onset|genetic component|psychiatric nurse practitioner|pharmacists? provide medication management)\b/;

const NON_DIAGNOSTIC_SAFETY_OR_MEDICATION_CONTEXT =
  /\b(fda approved|approved for|approved in|approved to|approved medication|which medications are approved|which drugs are approved|maximum daily dose|maximum dose|starting dose|half-life|therapeutic serum concentration|serum concentration|renal dosing|dose adjustment|taken with food|caloric intake|washout|anc levels monitored|appetite stimulation|alzheimer'?s|dementia|pregnancy|breastfeeding|lactation|serotonin syndrome|neuroleptic malignant|nms|withdrawal|overdose|toxicity|toxicology|acute suicidal ideation|opioid withdrawal|status epilepticus|lithium level|valproate level|depakote level|qtc|creatinine|egfr|platelets|sodium|ast|alt|lfts?)\b/;

export function buildDiagnosticGeneralConceptReferenceHelp(message: string): AssistantResponsePayload | null {
  const normalized = normalizeMessage(message);

  if (!normalized || /\b(icd-?10|cpt|billing code|what code)\b/.test(normalized)) {
    return null;
  }

  const directMatch = DIAGNOSTIC_REFERENCE_ENTRIES.find((entry) =>
    entry.matches.some((pattern) => pattern.test(normalized)),
  );

  if (directMatch) {
    return diagnosticSummary(directMatch.summary);
  }

  if (NON_DIAGNOSTIC_SAFETY_OR_MEDICATION_CONTEXT.test(normalized)) {
    return null;
  }

  if (DIAGNOSTIC_REFERENCE_TRIGGER.test(normalized)) {
    return diagnosticSummary('This is a diagnostic or psychiatry reference question. I can summarize the concept at a high level, but formal diagnosis still requires current diagnostic references, clinical context, impairment, exclusions, and source-supported history.');
  }

  return null;
}
