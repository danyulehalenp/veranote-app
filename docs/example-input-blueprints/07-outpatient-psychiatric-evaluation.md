# Example Input Blueprint: Outpatient Psychiatric Evaluation

## Why This Matters

Outpatient psych should not be forced into an inpatient-admission note shape.

The job is:

- messy intake history and diagnostic uncertainty in
- structured, source-faithful outpatient psychiatric evaluation out

## Typical Raw Inputs

### Clinician bullets

- presenting concerns
- history of present illness
- prior diagnoses or prior treatment
- medication trials and responses
- psychiatric hospitalization history if any
- substance use history
- trauma, family, social, and developmental context as relevant
- current functioning and impairment
- safety history and current safety status
- diagnostic impression and initial treatment plan

### Optional transcript fragments

- patient explanation of symptom timeline
- family or collateral context
- prior med trial story
- uncertainty around diagnosis or overlapping symptom clusters

### Objective data

- intake questionnaires
- prior records if reviewed
- medication list
- labs or medical history if clinically relevant

## Input Shape Veranote Should Handle

- long pasted intake paragraph
- checklist plus free text
- old records mixed with current history
- partial collateral input
- ambiguous diagnosis framing

## Truth Risks

- forcing a firm diagnosis from a still-evolving outpatient intake
- flattening old diagnoses into current certainty
- inventing complete history elements that were not supplied
- overstating risk or understating nuanced chronic risk
- turning possible bipolarity, psychosis, trauma, ADHD, or substance-related explanations into one overly-clean conclusion

## Review Priorities

- chronology should remain explicit
- prior diagnosis versus current impression should stay separate
- collateral and prior-record attribution should stay visible
- uncertainty should remain visible when differential is still open
- initial plan should not outrun what the source actually supports

## Likely Veranote Features This Should Drive

- outpatient evaluation-specific section profile
- diagnostic-uncertainty review block
- prior-treatment-response capture
- functioning and impairment prompts
- collateral attribution reminders

## Example Eval Directions

- depression versus bipolar-spectrum uncertainty
- ADHD symptoms complicated by anxiety, trauma, or substance use
- prior diagnosis present in old records but not yet confirmed today
- outpatient intake with chronic passive SI history but no acute intent
