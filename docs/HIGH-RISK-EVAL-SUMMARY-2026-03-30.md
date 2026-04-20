# Veranote — High-Risk Eval Summary (2026-03-30)

> Legacy note: older internal materials may still refer to this product as `Clinical Documentation Transformer`. The canonical product name is now **Veranote**.

## Purpose

This summary records the first high-risk evaluation read across the most clinically fragile starter cases.

This is an implementation-informed assessment based on the current prompt architecture, source-structured intake, review UX, persisted section review state, and heuristic source-linking layer.

It is meant to identify likely failure points and prioritize the next trust-focused build work.

## Cases reviewed

1. `docs/eval-cases/02-medication-dose-change.md`
2. `docs/eval-cases/04-timeline-sensitive-follow-up.md`
3. `docs/eval-cases/05-collateral-conflict-adolescent.md`
4. `docs/eval-cases/09-risk-language-safety.md`
5. `docs/eval-cases/10-inpatient-psych-progress.md`

## Overall read

The app is improving in the right direction. The current architecture should reduce obvious hallucinations compared with a generic note-generation prompt. The biggest remaining risks are not random invention so much as **helpful-looking compression of nuance**.

In other words: the prototype is now more likely to be wrong by smoothing, flattening, or over-organizing than by generating wild nonsense.

That is progress, but still clinically important.

---

## Case 02 — Medication dose change with side-effect nuance
### Likely rating: Yellow
### Risk: Medium-High

### What the app is likely to get right
- There is strong repeated support for sertraline dose increase to 75 mg.
- Temporary nausea and partial panic improvement are represented clearly in source.
- Continued crowd anxiety is explicit.

### Likely failure modes
- Objective med list lag (50 mg) may be silently resolved instead of explicitly preserved as a mismatch.
- "Mostly gone" nausea may be over-smoothed into "resolved."
- Spouse-reported irritability improvement may drift into general patient improvement language.

### What would trigger concern
- Any clean medication statement that ignores the med-list conflict.
- Any wording suggesting panic attacks are resolved.
- Any wording presenting spouse observation as patient-confirmed improvement.

### Priority fix
- Preserve medication-source conflict more explicitly in prompt and review UI.

---

## Case 04 — Timeline-sensitive follow-up
### Likely rating: Yellow
### Risk: Medium-High

### What the app is likely to get right
- Repeated time markers should help preserve some chronology.
- Trazodone dose is supported by objective data.

### Likely failure modes
- Historical daily crying may drift toward current frequency if the draft is summarized too aggressively.
- "Last panic attack 3 weeks ago" may become a softer, less precise statement.
- Improved work functioning may get rounded up into no functional impairment.

### What would trigger concern
- Current daily crying language.
- Permanent-sounding panic resolution.
- Loss of the distinction between two months ago and the last two weeks.

### Priority fix
- Add stronger timeline-preservation review cues and possibly timeline-specific prompt constraints.

---

## Case 05 — Adolescent collateral conflict
### Likely rating: Yellow to Red
### Risk: High

### What the app is likely to get right
- The source is clearly conflict-shaped, which gives the prompt a fair chance to preserve that tension.
- Review workflow and evidence panel should help catch attribution drift if the reviewer is attentive.

### Likely failure modes
- Conflict may be flattened into an overconfident summary.
- Mother's report may become implicit fact.
- School problems may be presented as established despite lack of records.

### What would trigger concern
- Any statement that patient is vaping as established fact.
- Any summary implying patient admitted to skipping classes.
- Any objective-sounding academic decline statement without records.

### Priority fix
- Stronger attribution-preserving prompt rules and clearer evidence review labels when sources conflict.

---

## Case 09 — Safety language with passive death wish nuance
### Likely rating: Yellow to Red
### Risk: High

### What the app is likely to get right
- The source is explicit enough that a careful prompt should preserve passive-thought language.
- Current trust settings and warning-oriented framing should help somewhat.

### Likely failure modes
- Passive death-wish language may collapse into total SI denial.
- Or it may be overstated into active suicidality.
- Sister safety-step detail may be omitted in favor of generic safety language.
- Risk may be summarized with false confidence.

### What would trigger concern
- "Denies SI" with no mention of passive death-wish thoughts.
- Any active-plan/intent wording not supported by source.
- Generic low-risk conclusions not grounded in the actual inputs.

### Priority fix
- Add risk-language-specific prompt guardrails and make risk sections especially visible in evidence review.

---

## Case 10 — Inpatient psych progress with partial improvement
### Likely rating: Yellow
### Risk: Medium-High

### What the app is likely to get right
- Group attendance, guardedness, risperidone administration, and current AH denial all have direct support.
- Continued treatment plan is explicit.

### Likely failure modes
- "Calmer today" may become stronger global improvement than warranted.
- AH denied today may be flattened into symptom resolution.
- Sleep may be normalized or de-emphasized.
- Discharge-readiness language may creep in if the note is made too tidy.

### What would trigger concern
- Statements implying voices are gone rather than absent today.
- New discharge or medication-change language.
- Full stabilization wording unsupported by source.

### Priority fix
- Preserve "today vs yesterday" and "partial vs complete improvement" more aggressively.

---

## Cross-case patterns

Across the high-risk set, the same failure families show up repeatedly:

### 1. Smoothing
The app may turn nuanced source into a cleaner summary that loses clinically relevant edges.

### 2. Attribution collapse
Different speakers or source types may get merged into one cleaner narrative.

### 3. Timeline compression
Important sequence information may be flattened into present-state prose.

### 4. Overconfident risk wording
Safety language may become too simple in either direction.

## What the app is now good enough for

With attentive clinician review, the app is increasingly plausible for:
- prototype demonstrations
- structured drafting workflows
- source-aware review practice
- iterative trust-focused design work

## What still requires active caution

The app still should not be trusted casually in cases involving:
- source conflict
- medication-list mismatch
- nuanced suicidality language
- partial improvement on inpatient or complex follow-up notes
- thin source material that invites template filler

## Recommended order of next work

1. Persist reviewer-confirmed evidence links
2. Add stronger risk-language-specific prompt constraints
3. Add timeline/attribution-specific review cues where conflict is detected
4. Convert these five cases into a repeatable regression routine

## Bottom line

The app is no longer just a note generator. It is starting to become a reviewable drafting system.

But the danger zone has shifted from obvious hallucination toward subtle clinical distortion.

That is exactly why the current roadmap — evidence traceability, reviewer confirmation, and disciplined eval cases — is the right one.
