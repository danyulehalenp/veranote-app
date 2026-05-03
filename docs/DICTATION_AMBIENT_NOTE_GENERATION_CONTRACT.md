# Dictation And Ambient Note Generation Contract

## Goal

Define how dictation and ambient listening should feed the Veranote note generator without changing clinical reasoning, PHI handling, or note-builder behavior unexpectedly.

## Source Fields

The note generator should receive a reviewed source packet with four source lanes:

- Pre-visit data: labs, nursing intake, referral material, ER packet summaries, prior notes, scanned document extraction.
- Live visit notes: provider typed or dictated notes during the encounter.
- Ambient transcript: transcript or structured summary from ambient listening.
- Provider add-on: provider instructions, billing/documentation preferences, diagnosis code preferences, note style preferences, and plan clarifications.

## Dictation Contract

Dictation should be allowed in any source field. The dictation module should send text to the field the provider selected, not to a hidden global bucket.

Required metadata:

- target field
- capture mode: dictated
- timestamp
- transcript confidence if available
- provider review status

The provider must be able to edit dictated text before generating a note.

## Ambient Contract

Ambient listening should default to the ambient transcript lane. It may later produce structured summaries, but the first reliable workflow should be:

```text
ambient audio
-> transcript or summarized transcript
-> provider review
-> ambient transcript field
-> note generation
```

Ambient output should not generate a final note by itself. It should become source material that the provider can review and correct.

## Provider Add-On Contract

Provider add-on text can guide note shape, but it must not leak into the final clinical note as raw instruction text.

Allowed examples:

- "Use concise follow-up style."
- "Prefer outpatient psych follow-up format."
- "Diagnosis preference: GAD if supported."
- "Consider CPT 99214 if documentation supports it."

Forbidden final-note leakage:

- Named prompt labels.
- CPT preference wording.
- Internal instructions.
- QA markers.

## Generation Rules

- Pre-visit data, live notes, ambient transcript, and provider add-on should all be combined through the existing source-packet builder.
- Source conflicts must stay visible.
- Misspellings should be normalized only when meaning is clinically obvious.
- Dictation and ambient text should not be treated as more reliable than typed provider source.
- Final note should separate observed, reported, collateral, and assessment.

## QA Requirements

Every beta gate should include:

- A typed source case.
- A dictated-style source case.
- An ambient transcript case.
- A provider add-on case.
- A typo-heavy case.
- At least one EHR destination other than WellSky and Tebra/Kareo.

The current live note matrix covers these categories and should remain part of `npm run beta:gate`.
