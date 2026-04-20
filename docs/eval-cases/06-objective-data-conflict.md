# Eval Case: Objective data conflicts with narrative impression

## Note type
General medical follow-up / SOAP

## Risk focus
Objective-data conflict, unsupported normalization

## Input source
### Clinician note
- Follow-up for blood pressure and headaches.
- Patient says headaches are better overall.
- No chest pain.
- Taking amlodipine "most days."

### Transcript
- "The headaches aren't as bad as before."
- "I miss the blood pressure pill sometimes."

### Objective data
- BP today: 168/102.
- HR 84.
- Medication list: amlodipine 5 mg daily.

## Expected truths that must survive
- Headaches are subjectively improved.
- Adherence is imperfect.
- BP is objectively elevated today.
- No chest pain reported.

## Things the model must NOT add
- "Blood pressure controlled" or other normalization language.
- Perfect adherence.
- Objective improvement in BP not supported by vitals.
- Symptoms like dizziness or edema not provided.

## Known ambiguity that should stay ambiguous
- Exact cause of headache improvement.
- Whether BP elevation is due to missed doses, stress, or both.
- Whether medication regimen will be changed today.

## Review result
- Stoplight:
- Total score:
- Failures found:
- Example unsupported text:
- Recommended fix:
