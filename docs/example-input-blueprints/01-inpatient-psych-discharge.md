# Example Input Blueprint: Inpatient Psych Discharge

## Why This Matters

This was one of the strongest repeated founder-workflow patterns in the mined ChatGPT history.

The job is:

- messy discharge facts in
- polished, source-faithful inpatient psych discharge summary out

## Typical Raw Inputs

### Clinician bullets

- reason for admission
- presenting psych symptoms on arrival
- major hospital-course events
- psychotherapy or milieu participation
- medication starts/changes/optimization
- symptom status at discharge
- denial or persistence of SI/HI/AVH/paranoia
- discharge disposition and follow-up

### Optional transcript fragments

- patient comments about improvement
- denial statements at discharge
- family/collateral comments if relevant

### Objective data

- medication administration support
- abnormal labs or UDS/UPT if clinically relevant
- behavior logs
- discharge vital signs or medical clearance language if present

## Input Shape Veranote Should Handle

- rough paragraph dump
- bullet lists copied from rounding notes
- mixed objective and narrative fragments
- contradictory symptom status across days
- destination-specific formatting requests

## Truth Risks

- inventing full symptom resolution
- overstating readiness for discharge
- smoothing over fluctuating psychosis or risk symptoms
- losing medication truth
- collapsing patient and collateral/staff perspectives into one voice

## Review Priorities

- discharge symptom status must be literal
- hospital course should stay bounded to what source supports
- medication changes should remain exact
- follow-up should not be invented
- collateral attribution should stay visible

## Likely Veranote Features This Should Drive

- discharge-summary-specific prompt path
- explicit discharge risk-status review card
- medication change verification block
- “supported at discharge” versus “historically present” distinction
- destination-aware export constraints

## Example Eval Directions

- conflict between admission symptoms and discharge denial
- med optimization mentioned vaguely without exact changes
- discharge summary request with sparse hospital-course detail
- collateral claims that differ from patient report
