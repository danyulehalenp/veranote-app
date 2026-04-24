import { describe, expect, it } from 'vitest';
import { buildPsychDiagnosisConceptHelp } from '@/lib/veranote/assistant-psych-diagnosis-concepts';

describe('assistant psych diagnosis concepts', () => {
  it('answers plain-language depression concept questions', () => {
    const response = buildPsychDiagnosisConceptHelp('what do you know about depression?');

    expect(response?.message).toContain('When providers say depression broadly');
    expect(response?.message).toContain('major depressive disorder');
    expect(response?.suggestions?.some((item) => item.includes('ICD-10-CM coding family'))).toBe(true);
    expect(response?.references?.[0]?.url).toContain('nimh.nih.gov');
  });

  it('answers plain-language bipolar concept questions', () => {
    const response = buildPsychDiagnosisConceptHelp('tell me about bipolar ii disorder');

    expect(response?.message).toContain('Bipolar disorder marked by at least one hypomanic episode');
    expect(response?.message).toContain('Hypomanic duration and functional change matter');
  });

  it('answers broad anxiety family questions with syndrome distinctions', () => {
    const response = buildPsychDiagnosisConceptHelp('what do you know about anxiety?');

    expect(response?.message).toContain('separate chronic diffuse worry from panic');
    expect(response?.message).toContain('Excessive, hard-to-control worry');
    expect(response?.suggestions?.some((item) => item.includes('Panic disorder is more attack-driven'))).toBe(true);
  });

  it('answers broad addiction family questions with the core substance splits', () => {
    const response = buildPsychDiagnosisConceptHelp('what do you know about addiction?');

    expect(response?.message).toContain('intoxication, withdrawal, substance use disorder, or a substance-induced psychiatric syndrome');
    expect(response?.suggestions?.some((item) => item.includes('timeline documentation'))).toBe(true);
  });

  it('answers bipolar I versus bipolar II comparison questions', () => {
    const response = buildPsychDiagnosisConceptHelp('bipolar i vs bipolar ii');

    expect(response?.message).toContain('mania versus hypomania');
    expect(response?.message).toContain('Bipolar I requires at least one manic episode');
    expect(response?.message).toContain('Bipolar II requires hypomania');
  });

  it('answers psychosis versus substance-induced psychosis comparison questions', () => {
    const response = buildPsychDiagnosisConceptHelp('psychosis versus substance induced psychosis');

    expect(response?.message).toContain('timing is everything');
    expect(response?.suggestions?.some((item) => item.includes('temporal sequence'))).toBe(true);
  });

  it('answers intoxication versus withdrawal comparison questions', () => {
    const response = buildPsychDiagnosisConceptHelp('intoxication vs withdrawal');

    expect(response?.message).toContain('effects during or right after substance exposure');
    expect(response?.message).toContain('as the substance wears off or is stopped');
  });

  it('answers substance use disorder versus substance-induced disorder questions', () => {
    const response = buildPsychDiagnosisConceptHelp('substance use disorder vs substance induced disorder');

    expect(response?.message).toContain('problematic pattern of use itself over time');
    expect(response?.message).toContain('caused by intoxication, withdrawal, or medication exposure');
  });

  it('answers stimulant psychosis versus schizophrenia questions', () => {
    const response = buildPsychDiagnosisConceptHelp('meth psychosis vs schizophrenia');

    expect(response?.message).toContain('timeline is critical');
    expect(response?.suggestions?.some((item) => item.includes('last use'))).toBe(true);
  });

  it('answers alcohol use disorder versus alcohol-induced depression questions', () => {
    const response = buildPsychDiagnosisConceptHelp('alcohol use disorder vs alcohol induced depression');

    expect(response?.message).toContain('problematic alcohol-use pattern over time');
    expect(response?.message).toContain('temporally to intoxication, withdrawal, or related exposure');
  });

  it('answers opioid use disorder versus prescribed opioid exposure questions', () => {
    const response = buildPsychDiagnosisConceptHelp('opioid use disorder vs prescribed opioid exposure');

    expect(response?.message).toContain('not automatically opioid use disorder');
    expect(response?.message).toContain('craving');
  });

  it('answers cannabis use disorder versus cannabis psychosis questions', () => {
    const response = buildPsychDiagnosisConceptHelp('cannabis use disorder vs cannabis psychosis');

    expect(response?.message).toContain('problematic cannabis-use pattern over time');
    expect(response?.message).toContain('timeline documentation before it is called cannabis-induced');
  });

  it('answers substance timeline documentation questions', () => {
    const response = buildPsychDiagnosisConceptHelp('how should i document the substance timeline?');

    expect(response?.message).toContain('the timeline rather than the label');
    expect(response?.message).toContain('last known use');
    expect(response?.suggestions?.some((item) => item.includes('during intoxication'))).toBe(true);
  });

  it('answers substance-induced psychosis documentation questions', () => {
    const response = buildPsychDiagnosisConceptHelp('what should i document for suspected substance induced psychosis?');

    expect(response?.message).toContain('the timeline rather than the label');
    expect(response?.message).toContain('symptoms clearly persist outside the expected exposure window');
  });

  it('answers alcohol withdrawal symptom questions directly', () => {
    const response = buildPsychDiagnosisConceptHelp('what are symptoms of alcohol withdrawal?');

    expect(response?.message).toContain('Typical alcohol-withdrawal symptoms can include tremor');
    expect(response?.message).toContain('More severe concern signs include confusion');
    expect(response?.suggestions?.some((item) => item.includes('last drink'))).toBe(true);
  });

  it('answers benzodiazepine withdrawal symptom questions directly', () => {
    const response = buildPsychDiagnosisConceptHelp('what are symptoms of benzodiazepine withdrawal?');

    expect(response?.message).toContain('Benzodiazepine-withdrawal symptoms can include anxiety');
    expect(response?.message).toContain('seizures or delirium-like changes');
  });

  it('answers opioid withdrawal symptom questions directly', () => {
    const response = buildPsychDiagnosisConceptHelp('what are symptoms of opioid withdrawal?');

    expect(response?.message).toContain('Opioid-withdrawal symptoms often include anxiety or restlessness');
    expect(response?.message).toContain('yawning, rhinorrhea, sweating');
  });

  it('answers stimulant intoxication symptom questions directly', () => {
    const response = buildPsychDiagnosisConceptHelp('what are symptoms of stimulant intoxication?');

    expect(response?.message).toContain('Stimulant-intoxication symptoms can include agitation');
    expect(response?.message).toContain('paranoia, grandiosity, pressured behavior');
  });

  it('gives chart-ready alcohol withdrawal wording', () => {
    const response = buildPsychDiagnosisConceptHelp('give me chart ready language for alcohol withdrawal risk');

    expect(response?.message).toContain('Chart-ready option');
    expect(response?.message).toContain('alcohol withdrawal risk should be assessed');
    expect(response?.suggestions?.some((item) => item.includes('last drink'))).toBe(true);
  });

  it('gives chart-ready benzodiazepine withdrawal wording', () => {
    const response = buildPsychDiagnosisConceptHelp('give me chart ready language for benzodiazepine withdrawal');

    expect(response?.message).toContain('Chart-ready option');
    expect(response?.message).toContain('benzodiazepine withdrawal should be considered');
    expect(response?.references?.some((item) => item.label.includes('ASAM'))).toBe(true);
  });

  it('gives chart-ready opioid overdose wording', () => {
    const response = buildPsychDiagnosisConceptHelp('give me chart ready language for opioid overdose risk');

    expect(response?.message).toContain('Chart-ready option');
    expect(response?.message).toContain('Opioid overdose risk is elevated');
    expect(response?.references?.some((item) => item.label.includes('SAMHSA TIP 63'))).toBe(true);
    expect(response?.references?.some((item) => item.label.includes('CDC Naloxone'))).toBe(true);
  });

  it('gives chart-ready stimulant-induced psychosis wording', () => {
    const response = buildPsychDiagnosisConceptHelp('give me chart ready language for stimulant induced psychosis');

    expect(response?.message).toContain('Chart-ready option');
    expect(response?.message).toContain('Stimulant-induced psychosis or mania-like symptoms');
    expect(response?.suggestions?.some((item) => item.includes('last stimulant use'))).toBe(true);
  });

  it('gives chart-ready synthetic cannabinoid wording', () => {
    const response = buildPsychDiagnosisConceptHelp('give me chart ready language for synthetic cannabinoid exposure');

    expect(response?.message).toContain('Chart-ready option');
    expect(response?.message).toContain('Routine toxicology screening may not detect synthetic cannabinoids');
    expect(response?.references?.some((item) => item.label.includes('NIDA Synthetic Cannabinoids'))).toBe(true);
  });

  it('gives chart-ready tianeptine wording', () => {
    const response = buildPsychDiagnosisConceptHelp("give me chart ready language for Neptune's Fix exposure");

    expect(response?.message).toContain('Chart-ready option');
    expect(response?.message).toContain('Tianeptine exposure should be considered');
    expect(response?.message).toContain('not detected on routine urine drug screening');
    expect(response?.references?.some((item) => item.label.includes('FDA Tianeptine'))).toBe(true);
  });

  it('gives chart-ready xylazine or medetomidine wording', () => {
    const response = buildPsychDiagnosisConceptHelp('give me chart ready language for xylazine after naloxone only partially helps');

    expect(response?.message).toContain('Chart-ready option');
    expect(response?.message).toContain('Xylazine, medetomidine, or another non-opioid sedative adulterant should be considered');
    expect(response?.suggestions?.some((item) => item.includes('prolonged sedation after naloxone'))).toBe(true);
    expect(response?.references?.some((item) => item.label.includes('CDC Xylazine'))).toBe(true);
  });

  it('gives chart-ready bath-salt wording', () => {
    const response = buildPsychDiagnosisConceptHelp('give me chart ready language for flakka psychosis');

    expect(response?.message).toContain('Chart-ready option');
    expect(response?.message).toContain('Synthetic cathinone or bath-salt exposure should be considered');
    expect(response?.suggestions?.some((item) => item.includes('Routine urine drug screening may miss'))).toBe(true);
    expect(response?.references?.some((item) => item.label.includes('DEA Bath Salts'))).toBe(true);
  });

  it('gives chart-ready cannabis confound wording', () => {
    const response = buildPsychDiagnosisConceptHelp('give me chart ready language for cannabis complicating adhd');

    expect(response?.message).toContain('Chart-ready option');
    expect(response?.message).toContain('Cannabis or THC exposure may be contributing');
    expect(response?.references?.some((item) => item.label.includes('NIDA Cannabis'))).toBe(true);
  });

  it('gives general chart-ready substance rule-out wording', () => {
    const response = buildPsychDiagnosisConceptHelp('give me chart ready substance rule out language');

    expect(response?.message).toContain('Chart-ready option');
    expect(response?.message).toContain('Substance- or medication-induced contribution remains on the differential');
    expect(response?.suggestions?.some((item) => item.includes('persist outside expected intoxication or withdrawal windows'))).toBe(true);
  });

  it('gives chart-ready co-occurring disorder wording', () => {
    const response = buildPsychDiagnosisConceptHelp('give me chart ready language for co-occurring substance and psychiatric disorders');

    expect(response?.message).toContain('Chart-ready option');
    expect(response?.message).toContain('possible co-occurring psychiatric and substance-related conditions');
    expect(response?.suggestions?.some((item) => item.includes('predated use'))).toBe(true);
  });

  it('gives chart-ready opioid withdrawal wording', () => {
    const response = buildPsychDiagnosisConceptHelp('give me chart ready language for opioid withdrawal');

    expect(response?.message).toContain('Chart-ready option');
    expect(response?.message).toContain('Current symptoms may reflect opioid withdrawal');
    expect(response?.suggestions?.some((item) => item.includes('specific opioid'))).toBe(true);
  });

  it('gives chart-ready toxicology limitation wording', () => {
    const response = buildPsychDiagnosisConceptHelp('how should i word toxicology limitation when the uds is negative?');

    expect(response?.message).toContain('Chart-ready option');
    expect(response?.message).toContain('negative result does not automatically exclude the reported exposure history');
    expect(response?.suggestions?.some((item) => item.includes('confirmatory testing'))).toBe(true);
  });

  it('answers alcohol withdrawal versus delirium questions', () => {
    const response = buildPsychDiagnosisConceptHelp('alcohol withdrawal vs delirium');

    expect(response?.message).toContain('not interchangeable labels');
    expect(response?.message).toContain('fluctuating disturbance in attention and awareness');
  });

  it('answers alcohol withdrawal versus DTs questions', () => {
    const response = buildPsychDiagnosisConceptHelp('alcohol withdrawal vs dts');

    expect(response?.message).toContain('severe alcohol-withdrawal state');
    expect(response?.message).toContain('not just a synonym for ordinary withdrawal symptoms');
  });

  it('answers stimulant intoxication versus withdrawal questions', () => {
    const response = buildPsychDiagnosisConceptHelp('stimulant intoxication vs stimulant withdrawal');

    expect(response?.message).toContain('almost opposite on first pass');
    expect(response?.message).toContain('crash with fatigue');
  });

  it('answers cannabis anxiety versus cannabis psychosis questions', () => {
    const response = buildPsychDiagnosisConceptHelp('cannabis anxiety vs cannabis psychosis');

    expect(response?.message).toContain('not the same bedside problem');
    expect(response?.message).toContain('hallucinations, delusions, or disorganization');
  });

  it('answers opioid withdrawal versus primary anxiety/depression questions', () => {
    const response = buildPsychDiagnosisConceptHelp('opioid withdrawal vs primary anxiety');

    expect(response?.message).toContain('tracks recent opioid reduction or cessation');
    expect(response?.message).toContain('GI upset, body aches, chills');
  });

  it('answers stimulant-induced mania versus bipolar questions', () => {
    const response = buildPsychDiagnosisConceptHelp('stimulant induced mania vs bipolar disorder');

    expect(response?.message).toContain('timeline and course are what keep them apart');
    expect(response?.message).toContain('substance-induced mood symptoms stay high on the differential');
    expect(response?.suggestions?.some((item) => item.includes('prior independent manic episodes'))).toBe(true);
  });

  it('handles alcohol-heavy depression scenarios with withdrawal-aware framing', () => {
    const response = buildPsychDiagnosisConceptHelp(
      'Patient reports 8-10 drinks nightly, insomnia, guilt, wakes tremulous, last drink 18 hours ago, and passive SI.'
    );

    expect(response?.message).toContain('alcohol use disorder assessment');
    expect(response?.message).toContain('alcohol withdrawal risk');
    expect(response?.message).toContain('SSRI-only problem');
    expect(response?.suggestions?.some((item) => item.includes('withdrawal history'))).toBe(true);
  });

  it('handles meth mania-like psychosis scenarios conservatively', () => {
    const response = buildPsychDiagnosisConceptHelp(
      'Patient has pressured speech, paranoia, grandiosity, no sleep for four days, and daily meth use.'
    );

    expect(response?.message).toContain('stimulant intoxication');
    expect(response?.message).toContain('substance-induced psychosis or mania-like symptoms');
    expect(response?.message).toContain('Primary bipolar disorder is not excluded');
    expect(response?.suggestions?.some((item) => item.includes('last meth use'))).toBe(true);
  });

  it('handles abrupt alprazolam stop scenarios as withdrawal concerns', () => {
    const response = buildPsychDiagnosisConceptHelp(
      'Patient used alprazolam daily use for months, abruptly stopped, and now has panic, insomnia, tremor, and derealization.'
    );

    expect(response?.message).toContain('benzodiazepine withdrawal');
    expect(response?.message).toContain('Abrupt discontinuation');
    expect(response?.suggestions?.some((item) => item.includes('seizure history'))).toBe(true);
    expect(response?.references?.some((item) => item.label.includes('ASAM'))).toBe(true);
  });

  it('handles Mojo/K2 scenarios as synthetic cannabinoid reactions', () => {
    const response = buildPsychDiagnosisConceptHelp(
      'Patient used Mojo and now has severe agitation, hallucinations, vomiting, and tachycardia.'
    );

    expect(response?.message).toContain('severe synthetic cannabinoid reaction');
    expect(response?.message).toContain('negative routine urine drug screen does not rule that out');
    expect(response?.suggestions?.some((item) => item.includes('exact product name'))).toBe(true);
    expect(response?.references?.some((item) => item.label.includes('NIDA Synthetic Cannabinoids'))).toBe(true);
  });

  it('handles fentanyl overdose-risk scenarios with OUD and naloxone framing', () => {
    const response = buildPsychDiagnosisConceptHelp(
      'Patient uses fentanyl intermittently, had a prior overdose, has depression, and has no naloxone.'
    );

    expect(response?.message).toContain('opioid use disorder assessment');
    expect(response?.message).toContain('overdose risk');
    expect(response?.message).toContain('Naloxone access');
    expect(response?.references?.some((item) => item.label.includes('SAMHSA TIP 63'))).toBe(true);
    expect(response?.references?.some((item) => item.label.includes('CDC Naloxone'))).toBe(true);
  });

  it('handles 7-OH and kratom withdrawal-like scenarios explicitly', () => {
    const response = buildPsychDiagnosisConceptHelp(
      'Patient says 7-oh helps them relax but gets sweats and restlessness when skipping doses.'
    );

    expect(response?.message).toContain('7-OH or kratom-related dependence');
    expect(response?.message).toContain('opioid-like exposure');
    expect(response?.suggestions?.some((item) => item.includes('exact product name'))).toBe(true);
    expect(response?.references?.some((item) => item.label.includes('FDA 7-OH Warning'))).toBe(true);
  });

  it('handles Neptune’s Fix scenarios as tianeptine-risk presentations', () => {
    const response = buildPsychDiagnosisConceptHelp(
      "Patient has been taking Neptune's Fix from a gas station and now has confusion, sweats, and seizure concern."
    );

    expect(response?.message).toContain('tianeptine or a gas-station heroin product');
    expect(response?.message).toContain('not detected on routine UDS');
    expect(response?.suggestions?.some((item) => item.includes('exact brand'))).toBe(true);
    expect(response?.references?.some((item) => item.label.includes('FDA Tianeptine'))).toBe(true);
  });

  it('handles prolonged sedation after naloxone as adulterant risk', () => {
    const response = buildPsychDiagnosisConceptHelp(
      'Patient used fentanyl, had prolonged sedation after naloxone, and now has bradycardia and fluctuating alertness.'
    );

    expect(response?.message).toContain('xylazine or medetomidine-type adulterants');
    expect(response?.message).toContain('Prolonged sedation after naloxone');
    expect(response?.suggestions?.some((item) => item.includes('naloxone response'))).toBe(true);
    expect(response?.references?.some((item) => item.label.includes('CDC Medetomidine')) || response?.references?.some((item) => item.label.includes('CDC Xylazine'))).toBe(true);
  });

  it('handles unknown pressed pill scenarios as fentanyl or nitazene risk', () => {
    const response = buildPsychDiagnosisConceptHelp(
      'Patient took an M30 pressed pill, had overdose symptoms, and the routine opiate screen was negative.'
    );

    expect(response?.message).toContain('fentanyl or nitazene risk until proven otherwise');
    expect(response?.message).toContain('Standard opiate screens may miss fentanyl and nitazenes');
    expect(response?.suggestions?.some((item) => item.includes('naloxone response'))).toBe(true);
    expect(response?.references?.some((item) => item.label.includes('DEA Nitazenes'))).toBe(true);
  });

  it('handles ADHD questions complicated by nightly THC and sleep deprivation', () => {
    const response = buildPsychDiagnosisConceptHelp(
      'Patient wants a stimulant for ADHD, uses a THC vape nightly, and sleeps 4-5 hours.'
    );

    expect(response?.message).toContain('confounded by nightly high-potency THC exposure and sleep deprivation');
    expect(response?.message).toContain('premature stimulant conclusion would be risky');
    expect(response?.suggestions?.some((item) => item.includes('baseline childhood attention history'))).toBe(true);
    expect(response?.references?.some((item) => item.label.includes('NIDA Cannabis'))).toBe(true);
  });

  it('answers direct conduct disorder age questions head-on', () => {
    const response = buildPsychDiagnosisConceptHelp('what age can conduct disorder be diagnosed?');

    expect(response?.message).toContain('typically diagnosed in childhood or adolescence');
    expect(response?.message).toContain('before age 10');
    expect(response?.suggestions?.some((item) => item.includes('before age 15'))).toBe(true);
  });

  it('answers direct ADHD age questions head-on', () => {
    const response = buildPsychDiagnosisConceptHelp('can adhd be diagnosed in adults?');

    expect(response?.message).toContain('can be diagnosed in adults');
    expect(response?.message).toContain('before age 12');
  });

  it('answers direct DMDD age questions head-on', () => {
    const response = buildPsychDiagnosisConceptHelp('what age is dmdd diagnosed?');

    expect(response?.message).toContain('pediatric diagnosis');
    expect(response?.message).toContain('between ages 6 and 10');
    expect(response?.message).toContain('before age 10');
  });

  it('answers direct ODD duration questions head-on', () => {
    const response = buildPsychDiagnosisConceptHelp('how long does odd have to last?');

    expect(response?.message).toContain('6 months or more');
    expect(response?.message).toContain('one conflict-heavy visit');
  });

  it('answers PTSD duration questions head-on', () => {
    const response = buildPsychDiagnosisConceptHelp('how long does ptsd have to last?');

    expect(response?.message).toContain('more than 1 month');
    expect(response?.message).toContain('acute stress disorder');
  });

  it('answers GAD duration questions head-on', () => {
    const response = buildPsychDiagnosisConceptHelp('how long does gad have to last?');

    expect(response?.message).toContain('at least 6 months');
    expect(response?.message).toContain('one anxious week');
  });

  it('answers panic disorder duration questions head-on', () => {
    const response = buildPsychDiagnosisConceptHelp('how long does panic disorder have to last?');

    expect(response?.message).toContain('at least 1 month');
    expect(response?.message).toContain('One isolated panic attack');
  });

  it('answers MDD duration questions head-on', () => {
    const response = buildPsychDiagnosisConceptHelp('how long does major depressive disorder have to last?');

    expect(response?.message).toContain('at least 2 weeks');
    expect(response?.message).toContain('major depressive episode');
  });

  it('answers persistent depressive disorder duration questions head-on', () => {
    const response = buildPsychDiagnosisConceptHelp('how long does persistent depressive disorder have to last?');

    expect(response?.message).toContain('at least 2 years in adults');
    expect(response?.message).toContain('at least 1 year in children and adolescents');
  });

  it('answers insomnia duration questions head-on', () => {
    const response = buildPsychDiagnosisConceptHelp('how long does insomnia have to last?');

    expect(response?.message).toContain('3 nights per week for 3 months or longer');
    expect(response?.message).toContain('Short-term stress insomnia');
  });

  it('answers brief psychotic disorder duration questions head-on', () => {
    const response = buildPsychDiagnosisConceptHelp('how long does brief psychotic disorder last?');

    expect(response?.message).toContain('at least 1 day but less than 1 month');
    expect(response?.message).toContain('premorbid baseline');
  });

  it('answers schizophreniform duration questions head-on', () => {
    const response = buildPsychDiagnosisConceptHelp('how long does schizophreniform disorder last?');

    expect(response?.message).toContain('at least 1 month but less than 6 months');
    expect(response?.message).toContain('middle duration band');
  });

  it('answers schizophrenia duration questions head-on', () => {
    const response = buildPsychDiagnosisConceptHelp('how long does schizophrenia have to last?');

    expect(response?.message).toContain('at least 6 months');
    expect(response?.message).toContain('active-phase symptoms');
  });

  it('answers schizoaffective duration questions head-on', () => {
    const response = buildPsychDiagnosisConceptHelp('how long does schizoaffective disorder have to last?');

    expect(response?.message).toContain('does not have one simple short duration band');
    expect(response?.message).toContain('at least 2 weeks of psychosis without mood symptoms');
  });

  it('answers substance-induced psychosis timing questions head-on', () => {
    const response = buildPsychDiagnosisConceptHelp('how long do psychotic symptoms have to persist before it stops looking purely substance induced?');

    expect(response?.message).toContain('not one single universal day-count');
    expect(response?.message).toContain('meaningful abstinence or observation');
  });

  it('answers psychosis rule-out questions with substance-first differential framing', () => {
    const response = buildPsychDiagnosisConceptHelp('what do you have to rule out before diagnosing schizophrenia?');

    expect(response?.message).toContain('substance-induced causes');
    expect(response?.message).toContain('substance timeline');
    expect(response?.suggestions?.some((item) => item.includes('temporal sequence'))).toBe(true);
  });

  it('answers long-term substance psychosis questions conservatively', () => {
    const response = buildPsychDiagnosisConceptHelp('can substance induced psychosis last a long time?');

    expect(response?.message).toContain('not one single universal day-count');
    expect(response?.suggestions?.some((item) => item.includes('Longer-lasting psychosis'))).toBe(true);
  });

  it('answers long-term meth psychosis questions conservatively', () => {
    const response = buildPsychDiagnosisConceptHelp('can meth psychosis last a long time?');

    expect(response?.message).toContain('not one single universal day-count');
    expect(response?.message).toContain('meaningful abstinence or observation');
  });

  it('answers adjustment disorder timing questions head-on', () => {
    const response = buildPsychDiagnosisConceptHelp('how long after a stressor can adjustment disorder be diagnosed?');

    expect(response?.message).toContain('within 3 months of the stressor');
    expect(response?.message).toContain('not persist for more than 6 months');
  });

  it('answers ASPD history questions head-on', () => {
    const response = buildPsychDiagnosisConceptHelp('does aspd require conduct disorder before age 15?');

    expect(response?.message).toContain('before age 15');
    expect(response?.message).toContain('adult diagnosis');
  });

  it('answers borderline under-18 questions head-on', () => {
    const response = buildPsychDiagnosisConceptHelp('can borderline personality disorder be diagnosed under 18?');

    expect(response?.message).toContain('late adolescence or early adulthood');
    expect(response?.message).toContain('persisted for at least a year');
  });

  it('does not hijack coding questions', () => {
    const response = buildPsychDiagnosisConceptHelp('what is the diagnosis code for depression?');

    expect(response).toBeNull();
  });
});
