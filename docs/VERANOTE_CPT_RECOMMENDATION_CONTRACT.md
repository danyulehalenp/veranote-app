# Veranote CPT Recommendation Contract

## Purpose

After a note is completed, Veranote may show CPT-support candidates so the provider can review whether the note appears to support common psychiatry billing families.

This feature is documentation support only. It is not a billing engine, payer-rule engine, legal opinion, or final code selector.

## Safe Output Shape

Each recommendation should include:

- Candidate family to review
- Possible code family or code range
- Why Veranote surfaced it
- Missing documentation elements
- Cautions and verification steps

The UI must avoid:

- "Bill this code"
- "Guaranteed"
- "Meets criteria"
- "Will reimburse"
- "Use this CPT"

Preferred wording:

- "Possible CPT-support candidate"
- "Review whether the note supports..."
- "Documentation appears stronger for..."
- "Missing before implying support..."
- "Verify against current CPT, payer, facility, and telehealth rules"

## Candidate Families

Initial supported review families:

- Psychiatric diagnostic evaluation family: `90791` / `90792`
- Office / outpatient E/M family: `99202-99205` / `99212-99215`
- Psychotherapy add-on with E/M family: `90833` / `90836` / `90838`
- Psychotherapy-only family: `90832` / `90834` / `90837`
- Psychotherapy for crisis family: `90839` / `90840`
- Interactive complexity add-on review: `90785`
- Telehealth billing/modifier review: payer-specific modifier/POS review

## Guardrails

Veranote must:

- Treat recommendations as candidates, not final codes.
- Never add clinical facts to support a billing family.
- Avoid time-dependent confidence when minutes are missing.
- Avoid psychotherapy add-on support unless psychotherapy content and separate psychotherapy time are visible.
- Avoid crisis psychotherapy support unless crisis intervention and crisis timing are visible.
- Treat telehealth modifier/POS selection as payer- and date-specific.
- Preserve contradictions and thin documentation as gaps, not as opportunities to optimize billing language.

## Future UI Placement

Recommended placement after note completion:

- A compact "Coding Support" card in the review/finish area.
- Default collapsed state.
- A badge such as "2 possible candidates" rather than a code-first display.
- Each candidate expands to show why, missing elements, and cautions.

This should live after clinical note generation, not inside the clinical note body.
