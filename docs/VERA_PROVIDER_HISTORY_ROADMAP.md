# Vera Provider History Roadmap

## 1. Executive Summary

The provider-history analysis shows a very clear pattern: the highest-value next Vera work is not broader generic knowledge. It is workflow-native inpatient psych assistance shaped around how a real provider repeatedly used ChatGPT.

The strongest historical usage clusters were:

- discharge summary generation
- acute inpatient psychiatric HPI generation
- progress note improvement
- risk wording
- medication-plan wording
- MSE completion
- substance/intoxication/withdrawal differential and charting
- discharge-readiness and level-of-care language
- medical-versus-psych overlap
- formatting control and concise chart-ready output

This means the next roadmap should prioritize features that:

- show up often in real provider use
- carry high clinical or documentation risk
- create obvious product value for inpatient psych NP workflow
- can be tested in Vera Lab with realistic provider-style prompts

## 2. Top 10 Next Vera Workflow Features

| Rank | Feature | Historical Frequency | Clinical Risk | Product Value | Implementation Complexity | Vera Lab Priority |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Discharge summary copilot | Very high | High | Very high | Medium | Yes |
| 2 | Acute inpatient HPI/admission builder | Very high | High | Very high | Medium | Yes |
| 3 | Progress note cleanup and tightening | Very high | Medium | Very high | Low-Medium | Yes |
| 4 | Risk wording and contradiction support | Very high | Critical | Very high | Medium | Yes |
| 5 | MSE completion and cleanup | High | High | High | Medium | Yes |
| 6 | Medication-plan and consent wording | High | High | High | Medium | Yes |
| 7 | Substance-aware charting and differential help | High | Critical | Very high | Medium-High | Yes |
| 8 | Discharge-readiness and AMA/elopement review | High | Critical | High | Medium | Yes |
| 9 | Medical-versus-psych overlap support | High | Critical | High | Medium-High | Yes |
| 10 | Collateral/social-history compression | Medium-High | Medium | High | Low | Yes |

## 3. Recommended Implementation Order

### Wave 1: Highest-frequency charting wins

1. Discharge summary copilot
2. Acute inpatient HPI/admission builder
3. Progress note cleanup and tightening

Why first:

- these are the clearest repeated use cases from history
- they provide visible value to every beta NP tester quickly
- they are easier to judge in Vera Lab than looser educational help

### Wave 2: Safety and documentation fidelity

4. Risk wording and contradiction support
5. MSE completion and cleanup
6. Medication-plan and consent wording

Why second:

- these are high-risk charting zones
- they shape whether Vera feels clinically safe or just cosmetically helpful

### Wave 3: Substance-heavy and disposition-heavy inpatient work

7. Substance-aware charting and differential help
8. Discharge-readiness and AMA/elopement review
9. Medical-versus-psych overlap support

Why third:

- these are frequent and clinically important, but often require stronger caution logic
- they also benefit from the workflow and review scaffolding already built

### Wave 4: Compression and quality-of-life workflow help

10. Collateral/social-history compression

Why fourth:

- high usability value
- relatively lower implementation risk
- good complement to the larger drafting features

## 4. Vera Lab Cases To Add From Provider-History Patterns

### Chart-generation cases

- acute adult inpatient HPI from sparse mixed input
- acute adolescent inpatient HPI with guardian collateral
- discharge summary with symptom-status sections
- progress note cleanup from contradictory raw draft

### Risk and contradiction cases

- patient denial versus collateral suicide concern
- recent suicidal statement later minimized
- aggression or threat wording with current calm presentation
- unresolved discharge or AMA pressure after recent risk language

### MSE and observation cases

- incomplete MSE requiring behaviorally specific completion
- guarded interview with psychosis-like symptoms
- limited insight and impaired judgment wording without overreach

### Substance/differential cases

- withdrawal versus intoxication
- substance-induced psychosis versus primary psychosis
- negative UDS but clinically suspected exposure
- detox request without clear inpatient need

### Workflow-review cases

- what is missing from this note
- does this support discharge
- what should I include before signing
- rewrite this more objectively

## 5. UI Quick Actions To Prioritize

Priority quick actions:

- `Draft Discharge Summary`
- `Draft Acute HPI`
- `Improve Progress Note`
- `Tighten Risk Wording`
- `Complete MSE`
- `Integrate Collateral`
- `Summarize Social History`
- `Build Medication Plan`
- `Check Discharge Readiness`
- `Substance vs Primary Psych`

Second-tier quick actions:

- `Medical Data to Psych Note`
- `What’s Missing From This Note?`
- `Chart-Ready Withdrawal Wording`
- `ICD/CPT Help`
- `Louisiana Inpatient Documentation`

## 6. Which Items Should Use Trusted Reference Lookup

Use trusted reference lookup when the answer needs source-backed caution or regulatory grounding.

Strong candidates:

- ICD/CPT questions
- billing-family and medical-necessity questions
- Louisiana-specific inpatient documentation rules
- medication-specific safety, interactions, or reference-dependent facts
- legal/hold/capacity workflow questions when jurisdiction or policy matters

Do not default to reference lookup for:

- note drafting
- progress note cleanup
- MSE cleanup
- collateral integration
- social-history compression
- straightforward chart wording

## 7. Which Items Belong In Provider Preference Memory

Provider preference memory should store style and workflow preferences, not clinical facts.

Clear preference-memory items from history:

- concise paragraph format
- psych abbreviation preference
- no bullets or outline format
- preferred note section order
- desire for chart-ready output first
- preference for compact, non-lecture responses

Do not store in preference memory:

- patient-specific narratives
- clinical judgments
- raw risk details
- pasted note text

## 8. Beta Relevance For The 5 NP Testers

### Highest shared relevance across all 5

- discharge summaries
- acute admission HPIs
- progress note cleanup
- risk wording
- MSE completion

These are likely to be immediately useful regardless of individual stylistic differences because they map to everyday inpatient NP documentation pressure.

### Highest value for testers working heavier SUD/medical-overlap populations

- substance-aware differential support
- withdrawal/intoxication wording
- medical-versus-psych overlap help
- discharge-readiness and AMA/elopement support

### Highest value for testers comparing Vera against existing habits

- paragraph-format chart-ready output
- concise rewrite help
- note rescue from sparse raw input

## 9. Recommended Immediate Product Focus

If the next sprint needs to stay narrow, the best shortlist is:

1. `Draft Discharge Summary`
2. `Draft Acute HPI`
3. `Improve Progress Note`
4. `Tighten Risk Wording`
5. `Complete MSE`

That shortlist best matches:

- the highest-frequency real provider history
- the strongest beta value
- the clearest regression and Vera Lab coverage path

