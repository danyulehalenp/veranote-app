# Veranote EHR Output And Future Writeback Contract

This document is operational planning only. It contains no secrets, tokens, PHI, or patient text.

## Current Product Behavior

Veranote currently supports EHR-aware formatting for copy/paste and export. It does not claim direct writeback into external EHRs.

Current safe path:

```text
Reviewed source lanes
-> generated draft
-> provider review
-> destination formatting profile
-> whole-note copy or field-level copy
-> provider-controlled paste into EHR
```

## Future Design Constraint

Many providers will work across multiple sites and multiple EHRs. Veranote should keep finished notes section-addressable so future connectors can place note parts into destination-specific fields.

Future direct writeback must be:

- connector-specific
- provider-confirmed
- auditable
- reversible where the destination permits it
- validated against the actual destination workflow
- honest about which EHRs are supported

Direct writeback must not silently insert into an external EHR, imply certified integration without a verified connector, or change clinical meaning to fit a template.

## Source Lanes

The source packet has four lanes:

- `Pre-Visit Data`: labs, vitals, nursing intake, referral material, prior notes, copied EHR text, reviewed document/OCR summaries.
- `Live Visit Notes`: provider typed or dictated encounter notes.
- `Ambient Transcript`: reviewed ambient transcript or ambient summary.
- `Provider Add-On`: provider prompt, formatting, billing/code preference, diagnosis preference, plan clarification, and destination instructions.

The Provider Add-On lane guides generation but must not leak raw instruction text into the clinical note.

## Destination Profiles

The current destination profiles are formatting profiles, not direct integrations:

- Generic
- WellSky
- Tebra/Kareo
- SimplePractice
- TherapyNotes
- Valant
- ICANotes
- TheraNest
- Sessions Health

Each named destination should expose field targets where possible so future EHR connectors can map final note sections safely.

## Beta Standard

Before beta demos or release confidence checks:

- At least one source-packet regression case should involve misspelled provider text.
- At least one case should use an EHR other than WellSky and Tebra/Kareo.
- Provider Add-On instructions must not appear as chart facts.
- Field-level copy readiness must remain available for EHRs that split notes into sections.
- Any future connector work must be tested separately from copy/paste formatting.
