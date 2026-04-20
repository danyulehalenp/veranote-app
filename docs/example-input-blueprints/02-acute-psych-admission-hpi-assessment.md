# Example Input Blueprint: Acute Psych Admission / HPI / Assessment

## Why This Matters

This was another dominant founder-history pattern.

The job is:

- chaotic acute psych admission information in
- structured, reviewable HPI/assessment out

## Typical Raw Inputs

### Clinician bullets

- reason for admission
- precipitating event or referral path
- symptom cluster summary
- SI/HI/AVH/delusions/paranoia details
- mood, sleep, appetite, anxiety, agitation
- substance use statements
- past psych history or medication notes

### Optional transcript fragments

- patient quotes
- collateral report
- staff observations

### Objective data

- UDS / UPT
- relevant lab abnormalities
- behavior on arrival
- MSE observations
- prior medication list

## Input Shape Veranote Should Handle

- mixed bullets and pasted narrative
- partial MSE fragments
- conflicting patient versus collateral accounts
- incomplete objective data
- adolescent or adult inpatient psych wording differences

## Truth Risks

- overconfident diagnosis from partial input
- collapsing historical symptoms into current symptoms
- overstating intent, plan, or psychosis severity
- losing ambiguity around source conflict
- turning objective data into polished certainty

## Review Priorities

- keep risk wording literal
- keep current versus historical symptoms separate
- preserve source attribution
- keep diagnosis assistive, not definitive
- maintain objective-data humility

## Likely Veranote Features This Should Drive

- admission/HPI-specific intake template
- explicit risk-language review panel
- current/historical symptom distinction
- collateral conflict banner
- objective-data insertion with clear provenance

## Example Eval Directions

- patient denies SI but collateral reports active suicidality
- hallucinations denied now but recent internal preoccupation documented
- UDS positive despite substance denial
- MSE partially supplied and easy to over-complete
