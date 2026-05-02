# Atlas Clinical Alert Severity Model

This document defines severity labels for Atlas real-time clinical support. The model is intentionally conservative: most items should be Info, Review, or Caution. Urgent is reserved for serious safety issues.

## Severity Principles

- Severity describes Atlas UI behavior, not a final clinical diagnosis.
- Severity should be source-bound.
- Severity should not imply a final treatment decision.
- Severity should not replace provider judgment, local policy, pharmacy review, or emergency protocol.
- Severity can increase when symptoms, trend, timing, or contradiction increase risk.
- Severity can decrease when the issue is mild, asymptomatic, already addressed, or informational.

## Severity Levels

### Info

Definition:

- Low-risk reference or workflow support.
- No immediate safety concern.
- Useful if requested, but usually not worth interrupting the provider.

Examples:

- Medication strength/formulation lookup.
- Basic monitoring reminder without abnormal findings.
- General class/use question.
- Source helper text or workflow guidance.

UI behavior:

- Provider-initiated answer.
- Review dock only if opened.
- No pop-up.
- No required acknowledgement.

Copy style:

- One-line answer plus brief caveat.
- No follow-up unless the provider asks to apply it.

### Review

Definition:

- Clinically relevant issue that should be checked before finalizing documentation or applying a reference answer.
- Not time-sensitive from available source.
- Often relates to missing context, source fidelity, mild lab abnormality, or workflow completeness.

Examples:

- Sparse source for MSE completion.
- Mild or context-dependent lab abnormality without symptoms.
- Medication monitoring context missing.
- Collateral conflict without acute risk.
- Borderline QTc without symptoms.
- Non-stigmatizing wording opportunity.

UI behavior:

- Review dock item.
- Optional low-key nudge if directly relevant to the current task.
- Dismiss allowed.
- Mark reviewed allowed.

Copy style:

- "Review before finalizing."
- "Source support is limited."
- "Check X before applying this clinically."

### Caution

Definition:

- Meaningful risk of unsafe wording, unsupported clinical conclusion, medication/lab harm, interaction issue, or discharge/legal overreach.
- Not necessarily emergent, but should be addressed before using the note or applying the recommendation.

Examples:

- "No safety concerns" despite recent SI ambiguity.
- Denies HI but collateral reports threats.
- Lithium with renal impairment or interacting medications.
- Valproate with LFT/platelet concern.
- Clozapine ANC concern without infection symptoms.
- QTc risk with QT-prolonging medication but no severe symptoms.
- LAI missed-dose or conversion question requiring product-specific labeling.
- Capacity/hold wording that overstates legal certainty.

UI behavior:

- Visible nudge plus review dock item.
- No modal by default.
- Mark reviewed encouraged.
- Ask Atlas and Show source should be prominent.

Copy style:

- "Caution: X may not be supported."
- "This needs context before applying clinically."
- "Verify with current reference/local protocol."

### Urgent

Definition:

- Serious safety issue or high-risk contradiction that may require urgent clinical review, emergency pathway, poison control, local protocol, or immediate provider attention.
- Urgent does not mean Atlas issues an order. It means Atlas should not let the issue hide in routine workflow.

Examples:

- Lithium toxicity symptoms or high level plus confusion/ataxia/GI symptoms.
- Overdose/toxicity wording.
- Benzodiazepine or alcohol withdrawal with seizure/delirium/autonomic risk.
- Serotonin syndrome concern.
- NMS/catatonia/CK plus rigidity/fever/autonomic instability.
- Clozapine ANC/WBC plus infection symptoms or concerning neutropenia context.
- QTc >= 500 ms or QTc concern with syncope/palpitations/chest pain.
- Severe electrolyte abnormality with symptoms.
- Marked hepatic injury plus jaundice, abdominal pain, vomiting, malaise, bilirubin/INR concern.
- Suicide/homicide contradiction with recent high-acuity facts and unsupported reassuring wording.

UI behavior:

- Critical safety alert.
- Requires provider acknowledgement such as Mark reviewed.
- Still no automatic orders or note edits.
- Should include Show source when triggered from documentation/source text.
- Should avoid home-management advice for dangerous toxicity/withdrawal scenarios.

Copy style:

- "This is not routine monitoring."
- "Urgent safety review is needed."
- "Use local protocol, prescriber/pharmacy review, poison control, emergency pathway, or medical assessment as appropriate."

## Severity Escalators

Escalate severity when any of the following are present:

- Symptoms: confusion, ataxia, seizure, syncope, palpitations, chest pain, severe sedation, respiratory depression, fever, rigidity, jaundice, bleeding, severe weakness.
- Trend: rapidly worsening labs, falling sodium/platelets/ANC, rising creatinine/LFTs/QTc, repeated risk behavior.
- Timing: recent overdose, abrupt benzodiazepine stop, recent high-risk SI/HI communication, missed LAI beyond product-specific window.
- Combination: interacting meds plus vulnerable organ system, lab abnormality plus symptoms, risk denial plus contradictory evidence.
- Source contradiction: patient denial conflicts with collateral/staff/chart evidence.
- Unsupported documentation conclusion: "low risk," "cleared," "stable for discharge," "has capacity," or "meets hold" without adequate source support.

## Severity De-escalators

De-escalate severity when:

- The issue is informational only.
- The abnormality is mild, stable, asymptomatic, and already documented as reviewed.
- The source already includes a reasonable plan or follow-up.
- The provider has marked the item reviewed and no new source facts have appeared.
- Atlas cannot determine the issue without clarification and the safest response is a targeted Review-level question.

## Direct-Order Guardrail

No severity level permits Atlas to issue directive orders.

Forbidden directive examples:

- "Start lithium."
- "Increase the dose."
- "Hold Depakote."
- "Continue clozapine."
- "Stop the medication."
- "Pharmacy can fill."
- "Safe to combine."
- "The patient is medically cleared."
- "The patient meets criteria."

Allowed framing:

- "This raises concern for..."
- "Review X before applying clinically."
- "Verify with current labeling/pharmacy/local protocol."
- "This should not be handled as routine monitoring."
- "Document source-supported facts and unresolved gaps."

## UI Pattern by Severity

| Severity | Default surface | Interrupts typing? | Requires acknowledgement? | Allows insert suggestion? | Example action buttons |
| --- | --- | --- | --- | --- | --- |
| Info | Provider-initiated answer or collapsed dock item | No | No | Yes, provider-click only | Ask Atlas, Dismiss |
| Review | Review dock | No | No | Yes, provider-click only | Ask Atlas, Show source, Dismiss |
| Caution | Nudge + review dock | No | Optional Mark reviewed | Yes, provider-click only | Ask Atlas, Show source, Mark reviewed, Insert suggestion |
| Urgent | Critical safety alert + review dock | Only visually, not by blocking typing unless configured | Yes | Usually no direct insertion; wording suggestion can be separate | Ask Atlas, Show source, Mark reviewed |

## Recommended Event Payload

Future implementation can represent each alert as:

```ts
type AtlasClinicalAlert = {
  id: string;
  triggerId: string;
  severity: 'info' | 'review' | 'caution' | 'urgent';
  area: 'documentation' | 'medication' | 'lab' | 'risk' | 'legal' | 'workflow';
  summary: string;
  whyThisMatters: string;
  whatToCheck: string[];
  sourceRefs: Array<{ label: string; excerpt: string }>;
  allowedActions: Array<'ask_atlas' | 'insert_suggestion' | 'dismiss' | 'mark_reviewed' | 'show_source'>;
  suppressUntilSourceChange: boolean;
};
```

This payload should avoid PHI persistence by default. If source excerpts are captured, they must follow existing PHI handling and redaction rules.
