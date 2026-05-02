# Atlas UI Trigger Matrix

This matrix defines when Atlas should remain silent, show a non-blocking nudge, populate the review dock, or display a critical safety alert.

Severity labels are defined in `docs/ATLAS_CLINICAL_ALERT_SEVERITY_MODEL.md`.

## Trigger Principles

- Prefer silence unless the issue is useful, actionable, or safety-relevant.
- Prefer the review dock over pop-ups.
- Use nudges for high-value, non-critical issues.
- Use critical alerts only for serious risk, toxicity, dangerous lab/symptom combinations, or major documentation contradiction.
- Never auto-edit the note or create orders.

## Medication/Lab Trigger Matrix

| Trigger family | Example signals | Default severity | UI surface | Atlas summary shape | Provider actions |
| --- | --- | --- | --- | --- | --- |
| Lithium renal safety | Creatinine/eGFR/CrCl/BUN abnormal near lithium, CKD/AKI, dehydration, NSAID/ACE-I/ARB/thiazide | Caution | Review dock + optional nudge | Lithium is renally cleared; renal impairment or interacting meds can increase toxicity risk. | Ask Atlas, Show source, Mark reviewed |
| Lithium toxicity | High lithium level, confusion, tremor, ataxia, GI symptoms, weakness, seizure, arrhythmia | Urgent | Critical alert | This is not routine monitoring when toxicity symptoms are present. | Ask Atlas, Mark reviewed, Show source |
| Lithium low/subtherapeutic | Low level without symptoms or unclear timing | Review | Review dock | Low level may be timing/adherence/target dependent; avoid automatic dose changes. | Ask Atlas, Dismiss |
| Valproate level + symptoms | High level, sedation, vomiting, confusion, tremor, ammonia concern | Urgent | Critical alert | Symptomatic valproate level concern needs urgent safety review and context. | Ask Atlas, Mark reviewed |
| Valproate hepatic/platelet concern | Elevated AST/ALT, bilirubin/INR concern, platelets low, bleeding/bruising | Caution or Urgent if symptomatic | Review dock or critical alert | Hepatic or hematologic safety context is needed before routine titration. | Ask Atlas, Show source |
| Carbamazepine level/toxicity | Elevated level, dizziness, diplopia, ataxia, sedation, confusion | Caution or Urgent if severe | Review dock + nudge | Neurologic toxicity and sodium/CBC/LFT context matter. | Ask Atlas, Mark reviewed |
| Oxcarbazepine/carbamazepine sodium | Sodium low, hyponatremia, falls, confusion, seizure, weakness | Caution or Urgent if severe/symptomatic | Review dock or critical alert | Low sodium may reflect medication-related hyponatremia/SIADH risk. | Ask Atlas, Show source |
| Clozapine ANC/WBC | ANC low, WBC low, infection symptoms, pharmacy fill question | Caution or Urgent if infection/moderate-severe | Review dock or critical alert | Clozapine ANC/WBC decisions require current labeling, REMS/local protocol, and infection review. | Ask Atlas, Mark reviewed |
| QTc risk | QTc high/borderline, antipsychotic/QT-risk meds, syncope, palpitations, electrolyte abnormality | Caution; Urgent if >=500 ms or symptomatic | Review dock or critical alert | QTc risk depends on value, trend, symptoms, electrolytes, and QT-risk medications. | Ask Atlas, Show source |
| Serotonin toxicity | SSRI/SNRI/trazodone/linezolid/MAOI/methylene blue plus fever, rigidity, autonomic or neuromuscular symptoms | Urgent | Critical alert | Possible serotonin toxicity should not be handled as routine interaction advice. | Ask Atlas, Mark reviewed |
| NMS/catatonia overlap | Antipsychotic plus CK elevation, rigidity, fever, autonomic instability, altered mental status | Urgent | Critical alert | NMS/catatonia/medical overlap needs urgent medical assessment framing. | Ask Atlas, Mark reviewed |
| Benzodiazepine withdrawal | Abrupt stop, seizure risk, alcohol overlap, severe agitation, delirium, autonomic instability | Urgent | Critical alert | Abrupt benzodiazepine discontinuation can cause severe withdrawal including seizures. | Ask Atlas, Mark reviewed |
| Alcohol withdrawal/intoxication | Withdrawal symptoms, benzodiazepine use, delirium, seizure risk, polysubstance context | Urgent | Critical alert | Withdrawal/intoxication overlap needs protocol-based safety review. | Ask Atlas, Mark reviewed |
| Overdose/toxicity | Took too much, overdose, toxic, unknown quantity, severe sedation, respiratory depression | Urgent | Critical alert | Toxicity or overdose should not receive home-management advice. | Ask Atlas, Mark reviewed |
| CNS depressant stacking | Opioid/benzo/alcohol/hypnotic/sedating antipsychotic combinations | Caution or Urgent if sedated/respiratory symptoms | Review dock or critical alert | Additive sedation and respiratory depression risk require context. | Ask Atlas, Dismiss |
| LAI initiation/conversion | Oral to LAI, missed dose, restart, overlap/loading, product-specific question | Review | Review dock | Product-specific labeling and pharmacy verification are required. | Ask Atlas, Show source |
| Formulation lookup | What mg/forms/strengths does X come in | Info | Provider-initiated answer only | Provide concise verified strengths/forms and verification caveat. | Ask Atlas |

## Documentation Trigger Matrix

| Trigger family | Example signals | Default severity | UI surface | Atlas summary shape | Provider actions |
| --- | --- | --- | --- | --- | --- |
| Unsupported low-risk wording | "Low risk," "no safety concerns," "denies SI" with recent SI/attempt/preparatory behavior/collateral concern | Caution or Urgent if acute | Nudge + review dock | Low-risk wording may not be supported; preserve denial and conflicting evidence. | Ask Atlas, Show source, Insert suggestion |
| HI/violence contradiction | Denies HI but threats, aggression, weapon/access uncertainty, target ambiguity, collateral concern | Caution or Urgent if imminent | Nudge + review dock | Preserve denial and threat/aggression evidence side by side. | Ask Atlas, Show source |
| Collateral conflict | Patient report conflicts with family/staff/chart/collateral | Review | Review dock | Document sources separately rather than resolving the conflict. | Ask Atlas, Show source |
| Internal preoccupation vs denial | Denies hallucinations but observed responding/internal preoccupation | Review | Review dock | Document observed behavior without converting it into endorsed hallucinations. | Ask Atlas, Insert suggestion |
| Missing MSE | Psych note lacks important MSE domains | Review | Review dock | Missing MSE domains should remain not documented; do not infer normal findings. | Ask Atlas, Dismiss |
| Missing risk assessment | Risk facts present but risk formulation absent or incomplete | Caution | Nudge + review dock | Add source-bound risk formulation or identify missing risk facts. | Ask Atlas, Insert suggestion |
| Unsupported medically cleared | "Medically cleared" with abnormal vitals/labs, confusion, withdrawal, intoxication, medical uncertainty | Caution | Nudge + review dock | Avoid unsupported medical clearance; preserve medical/psych overlap. | Ask Atlas, Show source |
| Legal/hold/capacity overreach | Meets criteria, lacks capacity, can force, must hold, blanket incapacity | Caution | Nudge + review dock | Use decision-specific capacity and local policy/legal caveat. | Ask Atlas, Insert suggestion |
| Discharge readiness gap | Discharge-ready/stable language with recent risk, unclear follow-up, unresolved withdrawal/medical/risk issue | Caution | Nudge + review dock | Avoid overstating stability; document gaps and follow-up limitations. | Ask Atlas, Show source |
| Sparse source | Too little information to complete HPI/MSE/risk/discharge section | Review | Review dock | Source is limited; do not invent missing facts. | Ask Atlas, Dismiss |
| Non-stigmatizing wording | Manipulative, drug-seeking, noncompliant, attention-seeking without behavioral framing | Review | Review dock | Use observable behavior and context instead of pejorative labels. | Ask Atlas, Insert suggestion |

## Trigger Suppression Rules

Suppress a nudge when:

- The provider already dismissed the same issue in the current note.
- The issue is informational only and not safety/documentation relevant.
- The provider is actively typing and the issue is not urgent.
- The same exact alert has already appeared without source changes.
- The source is too ambiguous to classify and a targeted clarification is better.

Escalate from Review to Caution when:

- The issue could materially affect risk wording, medication safety, discharge readiness, or legal/capacity framing.
- There is a clear source contradiction.
- The note contains unsupported reassurance.

Escalate to Urgent when:

- Symptoms plus lab/medication context suggest toxicity, severe withdrawal, NMS/serotonin syndrome, dangerous QTc context, or acute suicide/violence contradiction.

## Recommended First Trigger Registry

Start with a small registry:

- `risk_contradiction`
- `unsupported_reassurance`
- `missing_mse`
- `source_conflict`
- `lithium_renal_safety`
- `urgent_med_lab`
- `qtc_safety`
- `clozapine_anc`
- `benzo_alcohol_withdrawal`
- `lai_product_specific`

Each trigger should return:

- `id`
- `severity`
- `summary`
- `whyThisMatters`
- `whatToCheck`
- `sourceRefs`
- `allowedActions`
- `suppressUntilSourceChange`
