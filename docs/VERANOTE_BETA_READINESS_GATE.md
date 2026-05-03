# Veranote Beta Readiness Gate

This document defines the pre-beta safety check for the Veranote app. It is operational only and does not contain secrets, tokens, PHI, or patient text.

## Command

```bash
npm run beta:gate
```

## What The Gate Checks

1. Production domain reachability at `https://app.veranote.org`.
2. Document source intake unit tests.
3. Live browser document intake from reviewed text into Pre-Visit Data.
4. One complete browser workflow from source entry to draft generation, save, reopen, and export.
5. A broader browser workflow matrix across note types, source fields, EHR destinations, dictation controls, and ambient controls.
6. Atlas clinical regression gate.
7. Note generation regression gate.
8. Production build.
9. Git patch whitespace check.

## EHR Coverage

The live note matrix now covers the destinations most relevant to psych, therapy, and behavioral-health workflows:

- WellSky
- Tebra/Kareo
- SimplePractice
- TherapyNotes
- Valant
- ICANotes
- TheraNest
- Sessions Health

The matrix intentionally includes typo-heavy source packets and multi-field source packets so Veranote is tested against the kind of rushed clinical input providers actually enter.

## Pass Standard

The gate should pass before any beta demo, production push confidence check, or workflow handoff. A pass means:

- The production app responds.
- The local browser can complete critical note workflows.
- Atlas protected clinical QA remains green.
- Note generation protected QA remains green.
- The app can build.

It does not mean the product is clinically complete, HIPAA certified, or ready for unsupervised clinical use. It means the current beta-critical workflows are not obviously broken.

## Reports

Each run writes a concise summary to:

```text
test-results/beta-readiness-gate-YYYY-MM-DD.json
test-results/beta-readiness-gate-YYYY-MM-DD.md
```

The underlying gates also write their own detailed reports in `test-results/`.

## If The Gate Fails

Use the first failing step as the repair target. Do not skip ahead and patch random UI. Recommended order:

1. If production smoke fails, check Vercel deployment/domain/auth status.
2. If live note workflow fails, fix the visible provider workflow first.
3. If Atlas gate fails, repair the smallest route/contract issue and add a regression.
4. If note gate fails, repair the smallest source-fidelity or generation issue.
5. If build fails, fix the compiler/runtime issue before UI polish.
