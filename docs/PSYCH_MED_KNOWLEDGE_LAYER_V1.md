# Psych Medication Knowledge Layer v1

## Purpose
This layer provides concise, structured, production-safe psychiatric medication facts for Vera and related Veranote workflows. It is designed for recognition, general reference help, interaction flagging, and documentation-safe wording support.

## Scope
Version 1 covers more than 100 commonly used psychiatric and psychiatry-adjacent medications, including antidepressants, antipsychotics, mood stabilizers, ADHD medications, anxiolytics, hypnotics, substance-use-treatment medications, dementia medications, and EPS-side-effect treatments.

## What It Can Answer
- Medication class and common-use lookups
- Typical adult starting-dose and usual-range summaries
- Common side effects and high-yield warnings
- Monitoring reminders
- High-risk interaction flags
- Pregnancy/lactation, geriatric, renal, and hepatic caution prompts
- Documentation-safe medication wording prompts
- Brand/generic alias matching
- Starts-with medication lookup prompts

## What It Cannot Answer
- Patient-specific prescribing recommendations
- Definitive dosing or titration instructions for a real patient
- Full interaction checking across the entire medication universe
- Legal or standard-of-care determinations
- Pregnancy, renal, hepatic, or cross-taper guidance without current reference verification
- Comprehensive product-level monographs

## Safety Disclaimers
- This layer stores derived, concise medication facts only.
- It is not a prescribing database and not a substitute for current prescribing references.
- Dose answers must remain caveated because dosing depends on indication, patient factors, formulation, and interactions.
- Interaction answers must explicitly instruct verification against a current drug-interaction reference.
- Unknown or weakly matched medications should return safe uncertainty instead of hallucinated facts.

## Medication Classes Covered
- SSRIs
- SNRIs
- Other antidepressants including bupropion, mirtazapine, trazodone, vortioxetine, vilazodone, TCAs, MAOIs, esketamine, and combination antidepressants
- First-generation antipsychotics
- Second-generation antipsychotics
- Long-acting injectable antipsychotics
- Mood stabilizers and anticonvulsants
- Benzodiazepines
- Buspirone and hydroxyzine
- Sleep agents including Z-drugs, melatonin-receptor agents, and orexin antagonists
- Alpha-agonist and beta-blocker adjuncts
- ADHD stimulant and non-stimulant medications
- Substance-use-treatment medications
- Dementia and cognitive medications
- EPS and tardive-dyskinesia treatment medications

## Interaction Rule Categories
- Serotonergic stacking and serotonin syndrome concern
- SSRI/SNRI plus MAOI-pattern contraindication
- MAOI plus tyramine or sympathomimetic concern
- QT-prolongation stacking
- Antipsychotic polypharmacy caution
- Clozapine monitoring bundle
- Lithium interaction and dehydration toxicity rules
- Valproate plus lamotrigine rash/SJS concern
- Carbamazepine CYP induction caution
- Benzodiazepine plus opioid/alcohol/sedative risk
- Stimulant plus mania/psychosis caution
- Antidepressant use in bipolar disorder without mood-stabilizing coverage
- Anticholinergic burden stacking
- Seizure-threshold-lowering combinations
- SSRI/SNRI plus bleeding-risk medication combinations
- Hyponatremia/SIADH risk in older adults
- Metabolic monitoring triggers for SGAs
- EKG/QTc monitoring triggers

## Verification Requirements
Current-reference verification is required for:
- Dosing and titration
- Cross-tapers and washout periods
- Pregnancy and lactation
- Renal or hepatic impairment
- Long-acting injectable conversions
- Methadone, buprenorphine, and other specialized MAT workflows
- QT-risk review and EKG questions
- High-risk interaction checks

## Future Licensed Database Integration Plan
Future versions should support:
- Licensed monograph or formulary integration
- Product-level formulation and conversion rules
- Structured pregnancy/lactation database linkage
- Up-to-date renal/hepatic dosing support
- Specialty monitoring tables maintained from current references
- Versioned update workflows with provenance and review logging
