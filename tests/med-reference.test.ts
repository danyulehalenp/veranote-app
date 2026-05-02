import { describe, expect, it } from 'vitest';
import { answerStructuredMedReferenceQuestion } from '@/lib/veranote/med-reference/format';
import { detectMedReferenceIntent, findMedReferenceMedication } from '@/lib/veranote/med-reference/query';
import { PSYCH_MED_REFERENCE_LIBRARY } from '@/lib/veranote/med-reference/psych-meds';

describe('structured psych medication reference layer', () => {
  it('includes the initial high-yield psych medication set', () => {
    const names = PSYCH_MED_REFERENCE_LIBRARY.map((medication) => medication.genericName);

    expect(names).toContain('lamotrigine');
    expect(names).toContain('lithium');
    expect(names).toContain('sertraline');
    expect(names).toContain('quetiapine');
    expect(names).toContain('risperidone');
    expect(names).toContain('olanzapine');
    expect(names).toContain('aripiprazole');
    expect(names).toContain('divalproex / valproate');
    expect(names).toContain('lorazepam');
    expect(names).toContain('trazodone');
    expect(names).toContain('clozapine');
  });

  it('includes LAI and substance/withdrawal expansion entries', () => {
    const names = PSYCH_MED_REFERENCE_LIBRARY.map((medication) => medication.genericName);

    expect(names).toContain('aripiprazole monohydrate LAI');
    expect(names).toContain('aripiprazole lauroxil');
    expect(names).toContain('paliperidone palmitate');
    expect(names).toContain('risperidone long-acting injection');
    expect(names).toContain('haloperidol decanoate');
    expect(names).toContain('fluphenazine decanoate');
    expect(names).toContain('buprenorphine/naloxone');
    expect(names).toContain('methadone');
    expect(names).toContain('naltrexone');
    expect(names).toContain('olanzapine/samidorphan');
    expect(names).toContain('gabapentin');
    expect(names).toContain('kratom');
  });

  it('includes core antidepressant, anxiolytic, and medical crossover expansion entries', () => {
    const names = PSYCH_MED_REFERENCE_LIBRARY.map((medication) => medication.genericName);

    expect(names).toContain('fluoxetine');
    expect(names).toContain('escitalopram');
    expect(names).toContain('citalopram');
    expect(names).toContain('paroxetine');
    expect(names).toContain('venlafaxine');
    expect(names).toContain('duloxetine');
    expect(names).toContain('bupropion');
    expect(names).toContain('mirtazapine');
    expect(names).toContain('buspirone');
    expect(names).toContain('hydroxyzine');
    expect(names).toContain('propranolol');
    expect(names).toContain('prazosin');
    expect(names).toContain('clonidine');
    expect(names).toContain('warfarin');
    expect(names).toContain('levothyroxine');
    expect(names).toContain('sulfamethoxazole/trimethoprim');
    expect(names).toContain('macrolide antibiotics');
  });

  it('includes interaction-heavy crossover and psych-adjacent batch 3 entries', () => {
    const names = PSYCH_MED_REFERENCE_LIBRARY.map((medication) => medication.genericName);

    expect(names).toContain('NSAIDs');
    expect(names).toContain('ACE inhibitors');
    expect(names).toContain('ARBs');
    expect(names).toContain('thiazide diuretics');
    expect(names).toContain('loop diuretics');
    expect(names).toContain('aspirin');
    expect(names).toContain('clopidogrel');
    expect(names).toContain('azole antifungals');
    expect(names).toContain('methylphenidate');
    expect(names).toContain('mixed amphetamine salts');
    expect(names).toContain('lisdexamfetamine');
    expect(names).toContain('atomoxetine');
    expect(names).toContain('guanfacine extended-release');
    expect(names).toContain('zolpidem');
    expect(names).toContain('eszopiclone');
    expect(names).toContain('suvorexant');
    expect(names).toContain('lemborexant');
    expect(names).toContain('melatonin');
  });

  it('answers Lamictal formulation questions with the required strengths', () => {
    const answer = answerStructuredMedReferenceQuestion('What mg formulations does Lamictal come in?');

    expect(answer?.text).toContain('lamotrigine/Lamictal');
    expect(answer?.text).toContain('immediate-release tablets 25 mg, 100 mg, 150 mg, and 200 mg');
    expect(answer?.text).toContain('chewable/dispersible tablets / tablets for oral suspension 2 mg, 5 mg, and 25 mg');
    expect(answer?.text).toContain('orally disintegrating tablets 25 mg, 50 mg, 100 mg, and 200 mg');
    expect(answer?.text).toContain('extended-release / XR tablets 25 mg, 50 mg, 100 mg, 200 mg, 250 mg, and 300 mg');
    expect(answer?.text).toContain('verify with a current prescribing reference');
    expect(answer?.sourceRefs.some((source) => source.url.includes('dailymed.nlm.nih.gov'))).toBe(true);
  });

  it('maps lamotrigine strengths to the Lamictal entry', () => {
    const medication = findMedReferenceMedication('lamotrigine strengths');
    const answer = answerStructuredMedReferenceQuestion('lamotrigine strengths');

    expect(medication?.genericName).toBe('lamotrigine');
    expect(answer?.medication.genericName).toBe('lamotrigine');
    expect(answer?.text).toContain('Lamictal');
  });

  it('answers XR-specific Lamictal questions directly', () => {
    const answer = answerStructuredMedReferenceQuestion('does Lamictal have XR?');

    expect(answer?.text).toContain('extended-release/XR');
    expect(answer?.text).toContain('25 mg, 50 mg, 100 mg, 200 mg, 250 mg, and 300 mg');
  });

  it('returns null for unknown medications so the safe fallback can handle them', () => {
    expect(answerStructuredMedReferenceQuestion('what strengths does madeupzine come in?')).toBeNull();
  });

  it('does not treat patient-specific dosing as a simple formulation lookup', () => {
    expect(answerStructuredMedReferenceQuestion('what dose should I start Lamictal for this patient?')).toBeNull();
  });

  it('answers lithium monitoring with monitoring basics', () => {
    const answer = answerStructuredMedReferenceQuestion('what labs for lithium?');

    expect(answer?.text).toContain('serum lithium level');
    expect(answer?.text).toContain('renal function');
    expect(answer?.text).toContain('thyroid function');
    expect(answer?.text).toContain('current prescribing reference');
  });

  it('answers clozapine safety warnings without creating a monograph', () => {
    const answer = answerStructuredMedReferenceQuestion('major warning for clozapine');

    expect(answer?.text).toContain('Severe neutropenia');
    expect(answer?.text).toContain('ANC');
    expect(answer?.text).toContain('myocarditis');
    expect(answer?.text).toContain('seizures');
    expect(answer?.text).toContain('constipation');
    expect(answer?.text).toContain('infection symptoms');
    expect(answer?.text.length).toBeLessThan(1200);
  });

  it('answers LAI formulation questions with product-specific strength basics', () => {
    const maintena = answerStructuredMedReferenceQuestion('what strengths does Abilify Maintena come in?');
    const aristada = answerStructuredMedReferenceQuestion('what strengths does Aristada come in?');
    const sustenna = answerStructuredMedReferenceQuestion('what strengths does Invega Sustenna come in?');
    const risperidoneLai = answerStructuredMedReferenceQuestion('what strengths does risperidone LAI come in?');
    const haldolDec = answerStructuredMedReferenceQuestion('haloperidol decanoate concentration?');
    const fluphenazineDec = answerStructuredMedReferenceQuestion('what strength does fluphenazine decanoate come in?');

    expect(maintena?.text).toContain('300 mg and 400 mg');
    expect(aristada?.text).toContain('441 mg, 662 mg, 882 mg, and 1064 mg');
    expect(aristada?.text).toContain('675 mg');
    expect(sustenna?.text).toContain('39 mg, 78 mg, 117 mg, 156 mg, and 234 mg');
    expect(risperidoneLai?.text).toContain('Risperdal Consta microsphere kit 12.5 mg, 25 mg, 37.5 mg, and 50 mg');
    expect(risperidoneLai?.text).toContain('Perseris extended-release injectable kit 90 mg and 120 mg');
    expect(risperidoneLai?.text).toContain('Uzedy extended-release prefilled syringes 50 mg, 75 mg, 100 mg, 125 mg, 150 mg, 200 mg, and 250 mg');
    expect(haldolDec?.text).toContain('50 mg/mL and 100 mg/mL');
    expect(fluphenazineDec?.text).toContain('25 mg/mL');
    for (const answer of [maintena, aristada, sustenna, risperidoneLai, haldolDec, fluphenazineDec]) {
      expect(answer?.text).toContain('verify with a current prescribing reference');
    }
  });

  it('answers substance-medication formulation questions without conversion advice', () => {
    const suboxone = answerStructuredMedReferenceQuestion('what strengths does Suboxone film come in?');
    const methadone = answerStructuredMedReferenceQuestion('what strengths does methadone come in?');
    const naltrexone = answerStructuredMedReferenceQuestion('what forms does naltrexone come in?');
    const lybalvi = answerStructuredMedReferenceQuestion('what strengths does Lybalvi have?');
    const gabapentin = answerStructuredMedReferenceQuestion('what strengths does gabapentin come in?');

    expect(suboxone?.text).toContain('2 mg/0.5 mg, 4 mg/1 mg, 8 mg/2 mg, and 12 mg/3 mg');
    expect(methadone?.text).toContain('tablets 5 mg and 10 mg');
    expect(methadone?.text).toContain('oral concentrate 10 mg/mL');
    expect(naltrexone?.text).toContain('tablets 50 mg');
    expect(naltrexone?.text).toContain('extended-release injectable suspension 380 mg');
    expect(lybalvi?.text).toContain('5 mg/10 mg, 10 mg/10 mg, 15 mg/10 mg, and 20 mg/10 mg');
    expect(gabapentin?.text).toContain('capsules 100 mg, 300 mg, and 400 mg');
    for (const answer of [suboxone, methadone, naltrexone, lybalvi, gabapentin]) {
      expect(answer?.text).toContain('verify with a current prescribing reference');
      expect(answer?.text).not.toMatch(/\byou should\b/i);
    }
  });

  it('answers core antidepressant and anxiolytic formulation questions', () => {
    const celexa = answerStructuredMedReferenceQuestion('what strengths does Celexa come in?');
    const paxil = answerStructuredMedReferenceQuestion('what strengths does Paxil CR come in?');
    const effexor = answerStructuredMedReferenceQuestion('what strengths does Effexor XR come in?');
    const wellbutrin = answerStructuredMedReferenceQuestion('what strengths does Wellbutrin XL come in?');
    const hydroxyzine = answerStructuredMedReferenceQuestion('what forms does hydroxyzine come in?');
    const buspirone = answerStructuredMedReferenceQuestion('buspirone tablet strengths');

    expect(celexa?.text).toContain('tablets 10 mg, 20 mg, and 40 mg');
    expect(celexa?.text).toContain('oral solution 10 mg/5 mL and 2 mg/mL');
    expect(paxil?.text).toContain('controlled-release tablets 12.5 mg, 25 mg, and 37.5 mg');
    expect(effexor?.text).toContain('extended-release capsules 37.5 mg, 75 mg, and 150 mg');
    expect(wellbutrin?.text).toContain('extended-release / XL tablets 150 mg, 300 mg, and 450 mg');
    expect(wellbutrin?.text).toContain('bupropion hydrobromide extended-release tablets 174 mg, 348 mg, and 522 mg');
    expect(hydroxyzine?.text).toContain('hydroxyzine hydrochloride tablets 10 mg, 25 mg, and 50 mg');
    expect(hydroxyzine?.text).toContain('hydroxyzine pamoate capsules 25 mg, 50 mg, and 100 mg');
    expect(buspirone?.text).toContain('tablets 5 mg, 7.5 mg, 10 mg, 15 mg, and 30 mg');
    for (const answer of [celexa, paxil, effexor, wellbutrin, hydroxyzine, buspirone]) {
      expect(answer?.text).toContain('verify with a current prescribing reference');
    }
  });

  it('answers crossover medication formulation questions without lab interpretation directives', () => {
    const clonidine = answerStructuredMedReferenceQuestion('what strengths does clonidine patch come in?');
    const propranolol = answerStructuredMedReferenceQuestion('propranolol formulations');
    const prazosin = answerStructuredMedReferenceQuestion('prazosin capsule strengths');
    const warfarin = answerStructuredMedReferenceQuestion('warfarin tablet strengths');
    const levothyroxine = answerStructuredMedReferenceQuestion('levothyroxine tablet strengths');
    const bactrim = answerStructuredMedReferenceQuestion('what strengths does Bactrim DS come in?');
    const macrolides = answerStructuredMedReferenceQuestion('macrolide antibiotic formulations');

    expect(clonidine?.text).toContain('transdermal systems 0.1 mg/day, 0.2 mg/day, and 0.3 mg/day');
    expect(propranolol?.text).toContain('tablets 10 mg, 20 mg, 40 mg, 60 mg, and 80 mg');
    expect(propranolol?.text).toContain('extended-release capsules 60 mg, 80 mg, 120 mg, and 160 mg');
    expect(prazosin?.text).toContain('capsules 1 mg, 2 mg, and 5 mg');
    expect(warfarin?.text).toContain('scored tablets 1 mg, 2 mg, 2.5 mg, 3 mg, 4 mg, 5 mg, 6 mg, 7.5 mg, and 10 mg');
    expect(levothyroxine?.text).toContain('tablets 25 mcg, 50 mcg, 75 mcg, 88 mcg, 100 mcg, 112 mcg, 125 mcg, 137 mcg, 150 mcg, 175 mcg, 200 mcg, and 300 mcg');
    expect(bactrim?.text).toContain('tablets 400 mg/80 mg and 800 mg/160 mg');
    expect(macrolides?.text).toContain('azithromycin tablets 250 mg, 500 mg, and 600 mg');
    expect(macrolides?.text).toContain('clarithromycin immediate-release tablets 250 mg and 500 mg');
    for (const answer of [clonidine, propranolol, prazosin, warfarin, levothyroxine, bactrim, macrolides]) {
      expect(answer?.text).toContain('verify with a current prescribing reference');
      expect(answer?.text).not.toMatch(/\b(increase|hold|continue|stop)\s+(the\s+)?(dose|medication)\b/i);
    }
  });

  it('answers interaction-heavy crossover formulation questions from structured data', () => {
    const ibuprofen = answerStructuredMedReferenceQuestion('ibuprofen tablet strengths');
    const lisinopril = answerStructuredMedReferenceQuestion('lisinopril tablet strengths');
    const hctz = answerStructuredMedReferenceQuestion('HCTZ strengths');
    const losartan = answerStructuredMedReferenceQuestion('losartan tablet strengths');
    const aspirin = answerStructuredMedReferenceQuestion('aspirin strengths');
    const plavix = answerStructuredMedReferenceQuestion('Plavix tablet strengths');
    const fluconazole = answerStructuredMedReferenceQuestion('fluconazole formulations');
    const vyvanse = answerStructuredMedReferenceQuestion('what strengths does Vyvanse come in?');
    const adderall = answerStructuredMedReferenceQuestion('Adderall XR strengths');
    const intuniv = answerStructuredMedReferenceQuestion('Intuniv strengths');
    const ambien = answerStructuredMedReferenceQuestion('Ambien CR strengths');
    const lunesta = answerStructuredMedReferenceQuestion('Lunesta tablet strengths');
    const belsomra = answerStructuredMedReferenceQuestion('Belsomra strengths');
    const melatonin = answerStructuredMedReferenceQuestion('melatonin formulations');

    expect(ibuprofen?.text).toContain('ibuprofen tablets 200 mg, 400 mg, 600 mg, and 800 mg');
    expect(lisinopril?.text).toContain('lisinopril tablets 2.5 mg, 5 mg, 10 mg, 20 mg, 30 mg, and 40 mg');
    expect(hctz?.text).toContain('hydrochlorothiazide tablets/capsules 12.5 mg, 25 mg, and 50 mg');
    expect(losartan?.text).toContain('losartan tablets 25 mg, 50 mg, and 100 mg');
    expect(aspirin?.text).toContain('low-dose tablets 81 mg');
    expect(plavix?.text).toContain('tablets 75 mg and 300 mg');
    expect(fluconazole?.text).toContain('fluconazole tablets 50 mg, 100 mg, 150 mg, and 200 mg');
    expect(vyvanse?.text).toContain('capsules 10 mg, 20 mg, 30 mg, 40 mg, 50 mg, 60 mg, and 70 mg');
    expect(vyvanse?.text).toContain('chewable tablets 10 mg, 20 mg, 30 mg, 40 mg, 50 mg, and 60 mg');
    expect(adderall?.text).toContain('extended-release capsules 5 mg, 10 mg, 15 mg, 20 mg, 25 mg, and 30 mg');
    expect(intuniv?.text).toContain('extended-release tablets 1 mg, 2 mg, 3 mg, and 4 mg');
    expect(ambien?.text).toContain('extended-release tablets 6.25 mg and 12.5 mg');
    expect(lunesta?.text).toContain('tablets 1 mg, 2 mg, and 3 mg');
    expect(belsomra?.text).toContain('tablets 5 mg, 10 mg, 15 mg, and 20 mg');
    expect(melatonin?.text).toContain('non-prescription oral products variable');

    for (const answer of [ibuprofen, lisinopril, hctz, losartan, aspirin, plavix, fluconazole, vyvanse, adderall, intuniv, ambien, lunesta, belsomra, melatonin]) {
      expect(answer?.text).toContain('verify with a current prescribing reference');
      expect(answer?.text).not.toMatch(/\b(increase|hold|continue|stop)\s+(the\s+)?(dose|medication)\b/i);
    }
  });

  it('answers basic class and use questions from structured data', () => {
    const answer = answerStructuredMedReferenceQuestion('what is quetiapine used for?');

    expect(answer?.text).toContain('quetiapine is an antipsychotic');
    expect(answer?.text).toContain('schizophrenia');
    expect(answer?.text).toContain('bipolar');
    expect(answer?.text).toContain('not a patient-specific treatment recommendation');
  });

  it('detects formulation, monitoring, safety, and class-use intents', () => {
    expect(detectMedReferenceIntent('what mg does Lamictal come in')).toBe('formulations');
    expect(detectMedReferenceIntent('what monitoring for lithium')).toBe('monitoring');
    expect(detectMedReferenceIntent('major warning for clozapine')).toBe('safety');
    expect(detectMedReferenceIntent('what is quetiapine used for')).toBe('class_use');
  });
});
