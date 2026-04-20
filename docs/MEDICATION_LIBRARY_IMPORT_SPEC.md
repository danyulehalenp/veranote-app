# Veranote Psych Medication Library Import Spec

Compiled: 2026-04-17

Purpose:

- give Jeremy's medication-library work a clean landing zone
- define what Veranote should expect from a psych-med dataset
- prevent the project from collecting a giant drug blob that does not map cleanly into product use

This is an **import contract**, not a commitment to turn Veranote into a prescribing platform right now.

See also:

- [FUTURE-MEDICATION-SUBSYSTEM.md](/Users/danielhale/.openclaw/workspace/app-prototype/docs/FUTURE-MEDICATION-SUBSYSTEM.md)

## 1. Current Boundary

Right now Veranote should use medication data for:

- vocabulary recognition
- brand/generic/alias recognition
- abbreviation support
- medication-class awareness
- documentation review cues
- interaction and high-risk warnings as **assistive review context only**

Right now Veranote should **not** become:

- a prescribing engine
- a pharmacy workflow
- a refill platform
- a formal drug-interaction decision system
- a medication-reconciliation truth engine across encounters

That boundary matters.

## 2. What Jeremy Should Build

The most useful near-term medication library is a structured psychiatry-focused reference set with:

- psych medication identity
- brand/generic mapping
- class/category
- common aliases and abbreviations
- common formulations and route clues
- common adverse effects
- major/high-value interaction signals
- monitoring items relevant to psych documentation
- documentation-specific notes

The library should be optimized for:

- recognition
- warning support
- provider-facing review cues

not for:

- autonomous medication decisions

## 3. Required Top-Level Bundle Shape

Jeremy's output should be shaped like this:

```json
{
  "libraryVersion": "veranote-psych-med-v1",
  "generatedAt": "2026-04-17T00:00:00Z",
  "sourceSummary": [
    "Short human-readable source notes"
  ],
  "medications": [
    {
      "...": "PsychMedicationEntry"
    }
  ]
}
```

## 4. Required Medication Entry Fields

Each medication entry should contain:

- `id`
  - stable machine id, e.g. `sertraline`
- `genericName`
  - canonical generic display name
- `brandNames`
  - array
- `commonAliases`
  - chart wording or informal variations
- `commonAbbreviations`
  - only if actually used and worth recognizing
- `categories`
  - one or more Veranote psych categories
- `classFamily`
  - e.g. `SSRI`, `second-generation antipsychotic`
- `subclass`
  - optional
- `indications`
  - brief list of psych-relevant indication labels
- `formulations`
  - route / dosage form / release clues
- `commonDoseUnits`
  - e.g. `mg`, `mcg`
- `commonScheduleTerms`
  - e.g. `daily`, `BID`, `QHS`, `PRN`
- `blackBoxSummary`
  - short paraphrase only
- `pregnancyRisk`
  - normalized Veranote flag, not a legal claim
- `lactationSummary`
  - optional short summary
- `renalConsiderations`
  - optional short summary
- `hepaticConsiderations`
  - optional short summary
- `commonAdverseEffects`
  - common provider-relevant side effects
- `highRiskAdverseEffects`
  - high-signal risk effects worth review emphasis
- `monitoring`
  - structured list of psych-relevant monitoring items
- `interactionRules`
  - structured assistive interaction items
- `notesForDocumentation`
  - how the med commonly appears in notes or common chart traps
- `evidenceTier`
  - `authoritative-monograph`, `structured-database`, `clinical-reference`, or `product-curated`
- `sourceLinks`
  - explicit links used to support the entry

## 5. Preferred Categories

Use these categories unless there is a strong reason not to:

- `antidepressant`
- `antipsychotic`
- `mood-stabilizer`
- `stimulant`
- `non-stimulant-adhd`
- `anxiolytic`
- `hypnotic-sedative`
- `substance-use-treatment`
- `sleep-agent`
- `movement-side-effect-treatment`
- `alpha-agonist`
- `beta-blocker`
- `other-psych`

If a medication spans more than one useful category, multiple categories are fine.

## 6. Interaction Rule Shape

Veranote should accept interaction rules like:

```json
{
  "id": "sertraline-tramadol-serotonergic",
  "withMedicationNames": ["tramadol"],
  "withClasses": ["serotonergic-agent"],
  "severity": "major",
  "mechanismSummary": "Additive serotonergic effect",
  "clinicalConcern": "Serotonin-toxicity risk",
  "suggestedAction": "Review combination carefully and escalate to clinician judgment"
}
```

Important:

- interaction data should be framed as **review support**
- not as automatic prescribing advice
- not as a substitute for clinical/pharmacy review

## 7. What Would Be Most Useful First

If Jeremy cannot build everything at once, the highest-value first pass is:

1. all common psych meds with generic/brand mapping
2. class/category labels
3. aliases and abbreviations
4. formulations and common route clues
5. common adverse effects
6. high-value interaction warnings
7. monitoring items for lithium, valproate, clozapine, antipsychotics, stimulants, etc.

That first pass is much more useful than a sprawling but low-quality dump.

## 8. What To Avoid In The First Pass

Do not optimize first for:

- every possible non-psych medication
- obscure package-insert trivia
- exhaustive prescribing rules
- payer-specific medication rules
- automated dose recommendation logic
- cross-encounter medication-state truth claims

Those can come later if the product truly earns them.

## 9. Useful Research/Data Questions For Jeremy

The best medication-library questions right now are:

- what are the canonical psych meds and their common aliases?
- what abbreviations should be recognized and which are too ambiguous?
- what side effects are common enough to support note review cues?
- what interaction patterns are high-value enough to support review warnings?
- what monitoring items matter enough to show in documentation support?
- what medication names are commonly misspelled or charted inconsistently?

## 10. Import Readiness Checklist

Jeremy's medication library is import-ready if:

- every entry has a stable id
- generic and brand names are separated cleanly
- aliases/abbreviations are explicit
- source links exist
- interaction rules are structured
- monitoring items are structured
- no field pretends to be a prescribing recommendation engine
- the bundle validates against the Veranote import schema

## 11. Immediate Product Use Cases

Once available, this library could support:

- medication name recognition in source input
- better med-specific review hints
- alias expansion during draft/review
- interaction-related review warnings
- class-aware medication grouping in notes
- improved med-related eval cases

## 12. Bottom Line

Jeremy building a psych-med library can be very valuable, but only if it lands in a structure that Veranote can actually use.

The right near-term goal is:

- clean importable medication knowledge
- review-support value
- vocabulary recognition

not:

- medication platform sprawl
